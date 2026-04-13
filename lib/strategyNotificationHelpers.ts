import type { StrategyNotificationSettings } from "./strategyNotificationEngine";

export const MARKET_TIMEFRAME_BY_UI: Record<StrategyNotificationSettings["timeframe"], string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

export const HISTORY_LIMIT_BY_TIMEFRAME: Record<StrategyNotificationSettings["timeframe"], number> = {
  "1m": 5000,
  "5m": 5000,
  "15m": 5000,
  "1H": 3000,
  "4H": 1800,
  "1D": 900,
  "1W": 240
};

type MarketCandleInput = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type TradeNotificationBodyParams = {
  symbol: string;
  side: string;
  label: string;
  entryPrice: number | null | undefined;
  takeProfit: number | null | undefined;
  stopLoss: number | null | undefined;
  triggerTimeMs: number | null | undefined;
  timeZone?: string | null | undefined;
};

const toSafeTimeZone = (value: string | null | undefined): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: trimmed
    }).format(new Date());
    return trimmed;
  } catch {
    return "UTC";
  }
};

export const normalizeStrategyNotificationPair = (symbol: string): string => {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

export const normalizeStrategyNotificationMarketCandles = (candles: MarketCandleInput[]) => {
  return candles
    .map((candle) => {
      const time = Number(candle.time);
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      const volumeRaw = Number(candle.volume);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        ...(Number.isFinite(volumeRaw) && volumeRaw >= 0 ? { volume: volumeRaw } : {})
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((left, right) => left.time - right.time);
};

export const normalizeStrategyNotificationSettings = (
  raw: unknown
): StrategyNotificationSettings | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const timeframe = String(value.timeframe ?? "").trim() as StrategyNotificationSettings["timeframe"];
  if (!(timeframe in MARKET_TIMEFRAME_BY_UI)) {
    return null;
  }

  const aiMode =
    value.aiMode === "knn" || value.aiMode === "hdbscan" ? value.aiMode : "off";

  return {
    symbol: String(value.symbol ?? "XAUUSD").trim() || "XAUUSD",
    timeframe,
    aiMode,
    aiFilterEnabled: Boolean(value.aiFilterEnabled),
    inPreciseEnabled: value.inPreciseEnabled === true,
    confidenceThreshold: Number(value.confidenceThreshold ?? 0) || 0,
    ancThreshold: Number(value.ancThreshold ?? 0) || 0,
    dollarsPerMove: Number(value.dollarsPerMove ?? 25) || 25,
    chunkBars: Math.max(1, Number(value.chunkBars ?? 24) || 24),
    maxBarsInTrade: Math.max(0, Number(value.maxBarsInTrade ?? 0) || 0),
    maxConcurrentTrades: Math.max(0, Number(value.maxConcurrentTrades ?? 1) || 1),
    tpDollars: Number(value.tpDollars ?? 1000) || 1000,
    slDollars: Number(value.slDollars ?? 1000) || 1000,
    stopMode: Number(value.stopMode ?? 0) || 0,
    breakEvenTriggerPct: Number(value.breakEvenTriggerPct ?? 50) || 50,
    trailingStartPct: Number(value.trailingStartPct ?? 50) || 50,
    trailingDistPct: Number(value.trailingDistPct ?? 30) || 30,
    aiModelStates:
      value.aiModelStates && typeof value.aiModelStates === "object" && !Array.isArray(value.aiModelStates)
        ? Object.fromEntries(
            Object.entries(value.aiModelStates as Record<string, unknown>).map(([key, modelState]) => [
              key,
              Number(modelState ?? 0) || 0
            ])
          )
        : {}
  };
};

export const formatTradeNotificationPrice = (value: number | null | undefined): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "--";
};

export const formatTradeNotificationUnits = (value: number | null | undefined): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : "--";
};

export const formatTradeNotificationTriggerTime = (
  triggerTimeMs: number | null | undefined,
  timeZone?: string | null | undefined
): string => {
  const numeric = Number(triggerTimeMs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: toSafeTimeZone(timeZone),
    timeZoneName: "short"
  }).format(new Date(numeric));
};

export const buildTradeNotificationBody = ({
  symbol,
  side,
  label,
  entryPrice,
  takeProfit,
  stopLoss,
  triggerTimeMs,
  timeZone
}: TradeNotificationBodyParams): string => {
  return [
    `${String(symbol).trim() || "XAUUSD"} | ${String(side).trim() || "Trade"} ${String(label).trim() || "signal"}`,
    `Entry Price: ${formatTradeNotificationPrice(entryPrice)}`,
    `Take Profit: ${formatTradeNotificationPrice(takeProfit)}`,
    `Stop Loss: ${formatTradeNotificationPrice(stopLoss)}`,
    `Trigger Time: ${formatTradeNotificationTriggerTime(triggerTimeMs, timeZone)}`
  ].join("\n");
};
