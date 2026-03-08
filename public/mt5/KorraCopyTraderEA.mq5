#property strict

#include <Trade/Trade.mqh>

input string InpBaseUrl = "http://127.0.0.1:3000";
input int InpPollSeconds = 3;
input int InpRequestTimeoutMs = 5000;
input long InpMagicNumber = 26032026;
input string InpTradeSymbol = "";
input bool InpAllowLiveTrading = true;

CTrade trade;
string g_account_login = "";
string g_account_server = "";
string g_managed_signal_id = "";

struct KorraPositionInfo
{
   bool exists;
   string symbol;
   ulong ticket;
   ENUM_POSITION_TYPE type;
   double volume;
   double price_open;
   double stop_loss;
   double take_profit;
};

string TrimString(const string value)
{
   string output = value;
   StringTrimLeft(output);
   StringTrimRight(output);
   return output;
}

string UrlEncode(const string value)
{
   string encoded = "";
   const int length = StringLen(value);

   for(int index = 0; index < length; index++)
     {
      const ushort ch = (ushort)StringGetCharacter(value, index);

      if((ch >= '0' && ch <= '9') ||
         (ch >= 'A' && ch <= 'Z') ||
         (ch >= 'a' && ch <= 'z') ||
         ch == '-' || ch == '_' || ch == '.' || ch == '~')
        {
         encoded += StringSubstr(value, index, 1);
        }
      else if(ch == ' ')
        {
         encoded += "%20";
        }
      else
        {
         encoded += StringFormat("%%%02X", (int)ch);
        }
     }

   return encoded;
}

string ReadPlainValue(const string body, const string key)
{
   string lines[];
   const int total = StringSplit(body, '\n', lines);
   const string prefix = key + "=";

   for(int index = 0; index < total; index++)
     {
      const string line = TrimString(lines[index]);
      if(StringFind(line, prefix) == 0)
        {
         return StringSubstr(line, StringLen(prefix));
        }
     }

   return "";
}

bool HttpGet(const string url, string &response_body, int &status_code)
{
   char request_data[];
   char response_data[];
   string response_headers = "";

   ArrayResize(request_data, 0);
   ArrayResize(response_data, 0);
   response_body = "";
   status_code = -1;

   ResetLastError();
   status_code = WebRequest(
      "GET",
      url,
      "",
      "",
      InpRequestTimeoutMs,
      request_data,
      0,
      response_data,
      response_headers
   );

   if(status_code == -1)
     {
      Print("Korra EA WebRequest failed: ", GetLastError(), " URL=", url);
      return false;
     }

   response_body = CharArrayToString(response_data, 0, -1, CP_UTF8);
   return true;
}

double NormalizePriceForSymbol(const string symbol, const double price)
{
   if(price <= 0.0)
     {
      return 0.0;
     }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   if(digits <= 0)
     {
      digits = 5;
     }

   return NormalizeDouble(price, digits);
}

double NormalizeVolumeForSymbol(const string symbol, const double requested_volume)
{
   double min_volume = 0.01;
   double max_volume = 100.0;
   double volume_step = 0.01;

   SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN, min_volume);
   SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX, max_volume);
   SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP, volume_step);

   double volume = MathMax(min_volume, MathMin(max_volume, requested_volume));

   if(volume_step > 0.0)
     {
      volume = MathFloor(volume / volume_step + 1e-9) * volume_step;
     }

   return NormalizeDouble(volume, 2);
}

string ResolveTradeSymbol(const string desired_symbol)
{
   const string preferred = TrimString(InpTradeSymbol);
   if(StringLen(preferred) > 0)
     {
      SymbolSelect(preferred, true);
      return preferred;
     }

   const string requested = TrimString(desired_symbol);
   if(StringLen(requested) > 0)
     {
      SymbolSelect(requested, true);
      double bid = 0.0;
      if(SymbolInfoDouble(requested, SYMBOL_BID, bid))
        {
         return requested;
        }
     }

   SymbolSelect(_Symbol, true);
   return _Symbol;
}

bool GetManagedPosition(const string symbol_filter, KorraPositionInfo &position)
{
   position.exists = false;
   position.symbol = "";
   position.ticket = 0;
   position.type = POSITION_TYPE_BUY;
   position.volume = 0.0;
   position.price_open = 0.0;
   position.stop_loss = 0.0;
   position.take_profit = 0.0;

   for(int index = PositionsTotal() - 1; index >= 0; index--)
     {
      const ulong ticket = PositionGetTicket(index);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
        {
         continue;
        }

      if((long)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
        {
         continue;
        }

      const string symbol = PositionGetString(POSITION_SYMBOL);
      if(StringLen(symbol_filter) > 0 && symbol != symbol_filter)
        {
         continue;
        }

      position.exists = true;
      position.symbol = symbol;
      position.ticket = ticket;
      position.type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      position.volume = PositionGetDouble(POSITION_VOLUME);
      position.price_open = PositionGetDouble(POSITION_PRICE_OPEN);
      position.stop_loss = PositionGetDouble(POSITION_SL);
      position.take_profit = PositionGetDouble(POSITION_TP);
      return true;
     }

   return false;
}

string BuildPositionQuery(const KorraPositionInfo &position)
{
   if(!position.exists)
     {
      return "&position=FLAT";
     }

   const string side = position.type == POSITION_TYPE_SELL ? "SELL" : "BUY";
   string query =
      "&position=" + side +
      "&ticket=" + StringFormat("%I64u", position.ticket) +
      "&entry=" + DoubleToString(position.price_open, 8) +
      "&sl=" + DoubleToString(position.stop_loss, 8) +
      "&tp=" + DoubleToString(position.take_profit, 8) +
      "&symbol=" + UrlEncode(position.symbol);

   if(StringLen(g_managed_signal_id) > 0)
     {
      query += "&signalId=" + UrlEncode(g_managed_signal_id);
     }

   return query;
}

bool CloseManagedPosition(const KorraPositionInfo &position)
{
   if(!position.exists)
     {
      return true;
     }

   if(!trade.PositionClose(position.symbol))
     {
      Print("Korra EA failed to close position: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      return false;
     }

   g_managed_signal_id = "";
   return true;
}

bool ModifyManagedPosition(const string symbol, const double stop_loss, const double take_profit)
{
   const double normalized_sl = NormalizePriceForSymbol(symbol, stop_loss);
   const double normalized_tp = NormalizePriceForSymbol(symbol, take_profit);

   if(!trade.PositionModify(symbol, normalized_sl, normalized_tp))
     {
      Print("Korra EA failed to modify position: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      return false;
     }

   return true;
}

bool OpenManagedPosition(
   const string symbol,
   const string action,
   const double requested_volume,
   const double stop_loss,
   const double take_profit,
   const string signal_id
)
{
   if(!InpAllowLiveTrading)
     {
      Print("Korra EA received a live signal but InpAllowLiveTrading is false.");
      return false;
     }

   const double volume = NormalizeVolumeForSymbol(symbol, requested_volume);
   const double normalized_sl = NormalizePriceForSymbol(symbol, stop_loss);
   const double normalized_tp = NormalizePriceForSymbol(symbol, take_profit);
   string comment = "Korra";
   if(StringLen(signal_id) > 0)
     {
      const int comment_length = (int)MathMin(24, StringLen(signal_id));
      comment = "Korra:" + StringSubstr(signal_id, 0, comment_length);
     }

   bool success = false;
   if(action == "BUY")
     {
      success = trade.Buy(volume, symbol, 0.0, normalized_sl, normalized_tp, comment);
     }
   else if(action == "SELL")
     {
      success = trade.Sell(volume, symbol, 0.0, normalized_sl, normalized_tp, comment);
     }

   if(!success)
     {
      Print("Korra EA failed to open position: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      return false;
     }

   g_managed_signal_id = signal_id;
   return true;
}

void ApplySignal(
   const string symbol,
   const string action,
   const string signal_id,
   const double volume,
   const double stop_loss,
   const double take_profit
)
{
   KorraPositionInfo position;
   const bool has_position = GetManagedPosition(symbol, position);

   if(action == "FLAT")
     {
      if(has_position)
        {
         CloseManagedPosition(position);
        }
      return;
     }

   const bool wants_buy = action == "BUY";
   const bool same_side =
      has_position &&
      ((wants_buy && position.type == POSITION_TYPE_BUY) ||
       (!wants_buy && position.type == POSITION_TYPE_SELL));
   const bool same_signal = same_side && g_managed_signal_id == signal_id;

   if(same_signal)
     {
      ModifyManagedPosition(symbol, stop_loss, take_profit);
      return;
     }

   if(has_position && !CloseManagedPosition(position))
     {
      return;
     }

   OpenManagedPosition(symbol, action, volume, stop_loss, take_profit, signal_id);
}

void PollKorra()
{
   if(StringLen(g_account_login) == 0 || StringLen(g_account_server) == 0)
     {
      return;
     }

   const string fallback_symbol = ResolveTradeSymbol("");
   KorraPositionInfo current_position;
   GetManagedPosition("", current_position);

   const string account_query =
      "?login=" + UrlEncode(g_account_login) +
      "&server=" + UrlEncode(g_account_server) +
      "&format=plain";
   const string position_query = BuildPositionQuery(current_position);

   string heartbeat_response = "";
   int heartbeat_status = -1;
   HttpGet(InpBaseUrl + "/api/copytrade/local/heartbeat" + account_query + position_query, heartbeat_response, heartbeat_status);

   string signal_response = "";
   int signal_status = -1;
   if(!HttpGet(InpBaseUrl + "/api/copytrade/local/signal" + account_query + position_query, signal_response, signal_status))
     {
      return;
     }

   if(signal_status < 200 || signal_status >= 300)
     {
      Print("Korra EA signal request failed: HTTP ", signal_status, " body=", signal_response);
      return;
     }

   const string action = ReadPlainValue(signal_response, "action");
   const string signal_id = ReadPlainValue(signal_response, "signalId");
   const string requested_symbol = ReadPlainValue(signal_response, "symbol");
   const string trade_symbol = ResolveTradeSymbol(requested_symbol);
   const double volume = StringToDouble(ReadPlainValue(signal_response, "lot"));
   const double stop_loss = StringToDouble(ReadPlainValue(signal_response, "sl"));
   const double take_profit = StringToDouble(ReadPlainValue(signal_response, "tp"));

   if(action != "BUY" && action != "SELL" && action != "FLAT")
     {
      Print("Korra EA received unsupported action: ", action, " body=", signal_response);
      return;
     }

   ApplySignal(
      trade_symbol,
      action,
      signal_id,
      volume > 0.0 ? volume : 0.01,
      stop_loss,
      take_profit
   );
}

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   g_account_login = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   g_account_server = AccountInfoString(ACCOUNT_SERVER);

   EventSetTimer(MathMax(1, InpPollSeconds));
   PollKorra();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTick()
{
}

void OnTimer()
{
   PollKorra();
}
