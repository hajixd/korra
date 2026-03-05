#property strict
#property version "1.00"
#property description "Korra bridge EA: polls your Vercel signal endpoint and mirrors it on MT5."

#include <Trade/Trade.mqh>

input string InpSignalEndpoint = "https://YOUR-PROJECT.vercel.app/api/copytrade/signal";
input string InpApiToken = "";

input string InpTradeSymbol = "XAUUSD";
input string InpSignalSymbol = "XAUUSD";
input string InpTimeframe = "15m";
input double InpLots = 0.01;
input int InpPollSeconds = 15;
input int InpRequestTimeoutMs = 8000;
input long InpMagicNumber = 26032026;
input int InpSlippagePoints = 50;

input bool InpAggressive = true;
input int InpChunkBars = 24;
input double InpDollarsPerMove = 25.0;
input int InpMaxConcurrentTrades = 1;
input double InpTpDollars = 1000.0;
input double InpSlDollars = 1000.0;
input int InpStopMode = 0;
input double InpBreakEvenTriggerPct = 50.0;
input double InpTrailingStartPct = 50.0;
input double InpTrailingDistPct = 30.0;

CTrade g_trade;
string g_tradeSymbol = "";
string g_signalSymbol = "";
string g_timeframe = "";
string g_lastSignalId = "";

string TrimString(string value)
{
  StringTrimLeft(value);
  StringTrimRight(value);
  return value;
}

string NormalizeTradeSymbol(string value)
{
  value = TrimString(value);
  return StringLen(value) > 0 ? value : "XAUUSD";
}

string NormalizeSignalSymbol(string value)
{
  value = TrimString(value);
  StringToUpper(value);

  string output = "";
  int length = StringLen(value);
  for (int i = 0; i < length; i++)
  {
    ushort ch = (ushort)StringGetCharacter(value, i);
    bool isDigit = (ch >= '0' && ch <= '9');
    bool isUpper = (ch >= 'A' && ch <= 'Z');

    if (isDigit || isUpper)
      output += CharToString((uchar)ch);
  }

  return StringLen(output) > 0 ? output : "XAUUSD";
}

string NormalizeTimeframe(string value)
{
  string raw = TrimString(value);
  if (StringLen(raw) == 0)
    return "15m";

  string upper = raw;
  StringToUpper(upper);

  if (upper == "1M" || upper == "M1")
    return "1m";
  if (upper == "5M" || upper == "M5")
    return "5m";
  if (upper == "15M" || upper == "M15")
    return "15m";
  if (upper == "1H" || upper == "H1")
    return "1H";
  if (upper == "4H" || upper == "H4")
    return "4H";
  if (upper == "1D" || upper == "D1" || upper == "D")
    return "1D";
  if (upper == "1W" || upper == "W1" || upper == "W")
    return "1W";

  return "15m";
}

string BoolToFlag(const bool value)
{
  return value ? "1" : "0";
}

string Hex2(const int value)
{
  string hex = IntegerToString(value, 16);
  StringToUpper(hex);
  if (StringLen(hex) < 2)
    hex = "0" + hex;
  return hex;
}

string UrlEncode(string value)
{
  string output = "";
  int length = StringLen(value);

  for (int i = 0; i < length; i++)
  {
    ushort ch = (ushort)StringGetCharacter(value, i);
    bool isDigit = (ch >= '0' && ch <= '9');
    bool isLower = (ch >= 'a' && ch <= 'z');
    bool isUpper = (ch >= 'A' && ch <= 'Z');
    bool isSafe = (ch == '-' || ch == '_' || ch == '.' || ch == '~');

    if (isDigit || isLower || isUpper || isSafe)
      output += CharToString((uchar)ch);
    else
      output += "%" + Hex2((int)ch);
  }

  return output;
}

string ReadPlainField(const string payload, const string key)
{
  string needle = key + "=";
  int start = StringFind(payload, needle);
  if (start < 0)
    return "";

  start += StringLen(needle);
  int end = StringFind(payload, "\n", start);
  string value = end >= 0 ? StringSubstr(payload, start, end - start) : StringSubstr(payload, start);

  value = TrimString(value);
  StringReplace(value, "\r", "");
  return value;
}

double ParsePrice(const string value)
{
  string trimmed = TrimString(value);
  if (StringLen(trimmed) == 0)
    return 0.0;

  double parsed = StringToDouble(trimmed);
  if (!MathIsValidNumber(parsed) || parsed <= 0.0)
    return 0.0;

  return parsed;
}

double NormalizeVolume(const double requested)
{
  double minVolume = SymbolInfoDouble(g_tradeSymbol, SYMBOL_VOLUME_MIN);
  double maxVolume = SymbolInfoDouble(g_tradeSymbol, SYMBOL_VOLUME_MAX);
  double step = SymbolInfoDouble(g_tradeSymbol, SYMBOL_VOLUME_STEP);

  if (minVolume <= 0.0)
    minVolume = 0.01;
  if (maxVolume < minVolume)
    maxVolume = minVolume;
  if (step <= 0.0)
    step = 0.01;

  double volume = requested;
  if (!MathIsValidNumber(volume) || volume <= 0.0)
    volume = minVolume;

  volume = MathMin(maxVolume, MathMax(minVolume, volume));
  volume = minVolume + MathFloor((volume - minVolume) / step) * step;

  int digits = 2;
  if (step > 0.0)
  {
    digits = 0;
    double probe = step;
    while (digits < 8 && MathAbs(probe - MathRound(probe)) > 1e-9)
    {
      probe *= 10.0;
      digits++;
    }
  }

  return NormalizeDouble(volume, digits);
}

string BuildSignalUrl()
{
  string baseUrl = TrimString(InpSignalEndpoint);
  string separator = StringFind(baseUrl, "?") >= 0 ? "&" : "?";

  string query = "";
  query += "format=plain";
  query += "&symbol=" + UrlEncode(g_signalSymbol);
  query += "&timeframe=" + UrlEncode(g_timeframe);
  query += "&aggressive=" + BoolToFlag(InpAggressive);
  query += "&chunkBars=" + IntegerToString((int)MathMax(8, InpChunkBars));
  query += "&dollarsPerMove=" + DoubleToString(MathMax(1.0, InpDollarsPerMove), 4);
  query += "&maxConcurrentTrades=" + IntegerToString((int)MathMax(1, InpMaxConcurrentTrades));
  query += "&tpDollars=" + DoubleToString(MathMax(1.0, InpTpDollars), 4);
  query += "&slDollars=" + DoubleToString(MathMax(1.0, InpSlDollars), 4);
  query += "&stopMode=" + IntegerToString((int)MathMin(2, MathMax(0, InpStopMode)));
  query += "&breakEvenTriggerPct=" + DoubleToString(MathMax(0.0, InpBreakEvenTriggerPct), 4);
  query += "&trailingStartPct=" + DoubleToString(MathMax(0.0, InpTrailingStartPct), 4);
  query += "&trailingDistPct=" + DoubleToString(MathMax(0.0, InpTrailingDistPct), 4);

  return baseUrl + separator + query;
}

bool FetchSignalPayload(string &payload)
{
  payload = "";
  string url = BuildSignalUrl();
  string headers = "Accept: text/plain\r\n";

  string token = TrimString(InpApiToken);
  if (StringLen(token) > 0)
    headers += "Authorization: Bearer " + token + "\r\n";

  char data[];
  char result[];
  string resultHeaders = "";

  ResetLastError();
  int timeoutMs = (int)MathMax(1000, InpRequestTimeoutMs);
  int status = WebRequest("GET", url, headers, timeoutMs, data, result, resultHeaders);

  if (status == -1)
  {
    PrintFormat("Korra bridge request failed. MT5 error code: %d", GetLastError());
    return false;
  }

  payload = CharArrayToString(result, 0, -1, CP_UTF8);

  if (status != 200)
  {
    PrintFormat("Korra bridge request returned HTTP %d. Body: %s", status, payload);
    return false;
  }

  string okFlag = ReadPlainField(payload, "ok");
  if (okFlag != "1")
  {
    string err = ReadPlainField(payload, "error");
    PrintFormat("Korra bridge returned non-ok payload: %s", err);
    return false;
  }

  return true;
}

bool CloseManagedPosition()
{
  if (!PositionSelect(g_tradeSymbol))
    return true;

  if (!g_trade.PositionClose(g_tradeSymbol))
  {
    PrintFormat(
      "Korra bridge close failed. retcode=%d message=%s",
      g_trade.ResultRetcode(),
      g_trade.ResultRetcodeDescription()
    );
    return false;
  }

  return true;
}

bool OpenManagedPosition(const string action, const double sl, const double tp)
{
  double volume = NormalizeVolume(InpLots);
  bool ok = false;
  string comment = "Korra bridge";

  if (action == "BUY")
    ok = g_trade.Buy(volume, g_tradeSymbol, 0.0, sl, tp, comment);
  else if (action == "SELL")
    ok = g_trade.Sell(volume, g_tradeSymbol, 0.0, sl, tp, comment);
  else
    return false;

  if (!ok)
  {
    PrintFormat(
      "Korra bridge open failed. action=%s retcode=%d message=%s",
      action,
      g_trade.ResultRetcode(),
      g_trade.ResultRetcodeDescription()
    );
    return false;
  }

  return true;
}

void ApplySignal(const string action, const string signalId, const double sl, const double tp)
{
  string desired = TrimString(action);
  StringToUpper(desired);

  if (desired != "BUY" && desired != "SELL" && desired != "FLAT")
  {
    PrintFormat("Korra bridge ignored unknown action: %s", desired);
    return;
  }

  bool hasPosition = PositionSelect(g_tradeSymbol);
  long positionType = hasPosition ? PositionGetInteger(POSITION_TYPE) : -1;

  if (desired == "FLAT")
  {
    if (hasPosition)
      CloseManagedPosition();
    g_lastSignalId = signalId;
    return;
  }

  if (hasPosition)
  {
    bool alreadyLong = desired == "BUY" && positionType == POSITION_TYPE_BUY;
    bool alreadyShort = desired == "SELL" && positionType == POSITION_TYPE_SELL;

    if (alreadyLong || alreadyShort)
    {
      g_lastSignalId = signalId;
      return;
    }

    if (!CloseManagedPosition())
      return;
  }

  // Avoid reopening repeatedly for the same signal if we just closed manually.
  if (StringLen(signalId) > 0 && signalId == g_lastSignalId)
    return;

  if (OpenManagedPosition(desired, sl, tp))
    g_lastSignalId = signalId;
}

void PollAndSync()
{
  string payload = "";
  if (!FetchSignalPayload(payload))
    return;

  string action = ReadPlainField(payload, "action");
  string signalId = ReadPlainField(payload, "signalId");
  double sl = ParsePrice(ReadPlainField(payload, "sl"));
  double tp = ParsePrice(ReadPlainField(payload, "tp"));

  ApplySignal(action, signalId, sl, tp);
}

int OnInit()
{
  g_tradeSymbol = NormalizeTradeSymbol(InpTradeSymbol);
  g_signalSymbol = NormalizeSignalSymbol(InpSignalSymbol);
  g_timeframe = NormalizeTimeframe(InpTimeframe);

  g_trade.SetExpertMagicNumber(InpMagicNumber);
  g_trade.SetDeviationInPoints((int)MathMax(0, InpSlippagePoints));

  if (!SymbolSelect(g_tradeSymbol, true))
  {
    PrintFormat("Korra bridge could not select symbol: %s", g_tradeSymbol);
    return INIT_FAILED;
  }

  int pollSeconds = (int)MathMax(5, InpPollSeconds);
  EventSetTimer(pollSeconds);

  PrintFormat(
    "Korra bridge started. tradeSymbol=%s signalSymbol=%s timeframe=%s poll=%ds",
    g_tradeSymbol,
    g_signalSymbol,
    g_timeframe,
    pollSeconds
  );

  PollAndSync();
  return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
  EventKillTimer();
}

void OnTimer()
{
  PollAndSync();
}

void OnTick()
{
}
