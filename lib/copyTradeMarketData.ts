import type { CopyTradeCandle, CopyTradeTimeframe } from "./copyTradeSignalEngine";
import { fetchTwelveDataCandles } from "./twelveDataMarketData";

const MARKET_TIMEFRAME_BY_UI: Record<CopyTradeTimeframe, string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

const HISTORY_LIMIT_BY_TIMEFRAME: Record<CopyTradeTimeframe, number> = {
  "1m": 5000,
  "5m": 5000,
  "15m": 5000,
  "1H": 3000,
  "4H": 1800,
  "1D": 900,
  "1W": 240
};

const normalizeMarketPair = (symbol: string): string => {
  const normalized = String(symbol || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized) {
    return "XAU_USD";
  }

  if (normalized === "XAUUSD") {
    return "XAU_USD";
  }

  if (normalized.length === 6) {
    return `${normalized.slice(0, 3)}_${normalized.slice(3)}`;
  }

  return "XAU_USD";
};

const isXauTradingTime = (timestampMs: number): boolean => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (day === 6) {
    return false;
  }

  if (day === 5 && hour >= 22) {
    return false;
  }

  if (day === 0 && hour < 23) {
    return false;
  }

  if (day >= 1 && day <= 4 && hour === 22) {
    return false;
  }

  return true;
};

const normalizeMarketCandles = (
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>,
  signalSymbol: string
): CopyTradeCandle[] => {
  const shouldApplyXauSchedule =
    String(signalSymbol || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "") === "XAUUSD";

  const normalized = candles
    .map((candle) => {
      const time = Number(candle.time);
      const open = Number(candle.open);
      const highRaw = Number(candle.high);
      const lowRaw = Number(candle.low);
      const close = Number(candle.close);
      const volumeRaw = Number(candle.volume);
      const high = Math.max(open, highRaw, lowRaw, close);
      const low = Math.min(open, highRaw, lowRaw, close);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      if (shouldApplyXauSchedule && !isXauTradingTime(time)) {
        return null;
      }

      const output: CopyTradeCandle = {
        time,
        open,
        high,
        low,
        close
      };

      if (Number.isFinite(volumeRaw) && volumeRaw >= 0) {
        output.volume = volumeRaw;
      }

      return output;
    })
    .filter((value): value is CopyTradeCandle => value !== null)
    .sort((left, right) => left.time - right.time);

  const deduped: CopyTradeCandle[] = [];

  for (const candle of normalized) {
    const previous = deduped[deduped.length - 1];

    if (previous && previous.time === candle.time) {
      deduped[deduped.length - 1] = candle;
      continue;
    }

    deduped.push(candle);
  }

  return deduped;
};

export const fetchCopyTradeCandles = async (args: {
  symbol: string;
  timeframe: CopyTradeTimeframe;
}): Promise<CopyTradeCandle[]> => {
  const symbol = String(args.symbol || "").trim() || "XAUUSD";
  const timeframe = args.timeframe;
  const payload = await fetchTwelveDataCandles({
    pair: normalizeMarketPair(symbol),
    timeframe: MARKET_TIMEFRAME_BY_UI[timeframe] ?? "M15",
    count: HISTORY_LIMIT_BY_TIMEFRAME[timeframe] ?? 5000
  });

  return normalizeMarketCandles(payload.candles, symbol);
};
