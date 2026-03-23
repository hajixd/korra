import { getAiZipModelNames } from "./aiZipModels";
import {
  computeActiveReplaySignal,
  type CopyTradeCandle,
  type CopyTradeSignalSettings,
  type CopyTradeTimeframe
} from "./copyTradeSignalEngine";
import type {
  CopyTradeAccountPublic,
  CopyTradeRuntimePosition,
  CopyTradeSignalSide
} from "./copyTradeService";

type MarketApiCandle = {
  time: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string;
};

export type CopyTradeLocalSignalOutput = {
  desiredPosition: "BUY" | "SELL" | "FLAT";
  signalId: string;
  symbol: string;
  timeframe: CopyTradeTimeframe;
  lot: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  signalEntryTime: number | null;
  signalExitTime: number | null;
  generatedAt: number;
};

const MARKET_API_BASE =
  process.env.COPYTRADE_MARKET_API_BASE ||
  process.env.MARKET_API_BASE ||
  "https://trading-system-delta.vercel.app/api/public/candles";

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

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const toNoStoreHeaders = (contentType?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store"
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
};

export const toSafePlain = (value: unknown): string => {
  return String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();
};

const normalizeSignalSymbol = (value: unknown, fallback = "XAUUSD"): string => {
  const candidate = typeof value === "string" ? value : "";
  const normalized = candidate
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  return normalized || fallback;
};

const normalizeMarketPair = (signalSymbol: string): string => {
  if (signalSymbol === "XAUUSD") {
    return "XAU_USD";
  }

  if (signalSymbol.length === 6) {
    return `${signalSymbol.slice(0, 3)}_${signalSymbol.slice(3)}`;
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

const normalizeMarketCandles = (candles: MarketApiCandle[], signalSymbol: string): CopyTradeCandle[] => {
  const shouldApplyXauSchedule = signalSymbol === "XAUUSD";

  const normalized = candles
    .map((candle) => {
      let timeValue = Number.NaN;

      if (typeof candle.time === "number") {
        timeValue = candle.time;
      } else {
        const numericTime = Number(candle.time);
        timeValue = Number.isFinite(numericTime) ? numericTime : Date.parse(String(candle.time));
      }

      const time = timeValue > 1_000_000_000_000 ? timeValue : timeValue * 1000;
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

const fetchMarketCandles = async (
  signalSymbol: string,
  timeframe: CopyTradeTimeframe
): Promise<CopyTradeCandle[]> => {
  const pair = normalizeMarketPair(signalSymbol);
  const marketTimeframe = MARKET_TIMEFRAME_BY_UI[timeframe] || "M15";
  const limit = HISTORY_LIMIT_BY_TIMEFRAME[timeframe] ?? 5000;
  const apiKey = process.env.MARKET_API_KEY || process.env.NEXT_PUBLIC_MARKET_API_KEY || "";

  const url = new URL(MARKET_API_BASE);
  url.searchParams.set("pair", pair);
  url.searchParams.set("timeframe", marketTimeframe);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Market candle fetch failed (${response.status}): ${errorText.slice(0, 280)}`);
  }

  const payload = (await response.json()) as { candles?: MarketApiCandle[] };
  return normalizeMarketCandles(Array.isArray(payload.candles) ? payload.candles : [], signalSymbol);
};

const toSignalSettings = (account: CopyTradeAccountPublic): CopyTradeSignalSettings => {
  return {
    symbol: account.symbol,
    chunkBars: account.chunkBars,
    dollarsPerMove: account.dollarsPerMove,
    tpDollars: account.tpDollars,
    slDollars: account.slDollars,
    maxConcurrentTrades: account.maxConcurrentTrades,
    stopMode: account.stopMode,
    breakEvenTriggerPct: account.breakEvenTriggerPct,
    trailingStartPct: account.trailingStartPct,
    trailingDistPct: account.trailingDistPct
  };
};

export const resolveCopyTradeLocalSignal = async (
  account: CopyTradeAccountPublic
): Promise<CopyTradeLocalSignalOutput> => {
  const generatedAt = Date.now();
  const signalSymbol = normalizeSignalSymbol(account.symbol);
  const [candles, aiZipModelNames] = await Promise.all([
    fetchMarketCandles(signalSymbol, account.timeframe),
    getAiZipModelNames()
  ]);

  const signal = computeActiveReplaySignal({
    candles,
    aiZipModelNames,
    settings: toSignalSettings(account),
    nowMs: generatedAt
  });

  return {
    desiredPosition: !signal ? "FLAT" : signal.side === "Long" ? "BUY" : "SELL",
    signalId: signal?.id || "",
    symbol: signalSymbol,
    timeframe: account.timeframe,
    lot: clamp(account.lot, 0.01, 100),
    entryPrice: Number.isFinite(signal?.entryPrice ?? Number.NaN) ? Number(signal?.entryPrice) : null,
    stopLoss: Number.isFinite(signal?.stopPrice ?? Number.NaN) ? Number(signal?.stopPrice) : null,
    takeProfit: Number.isFinite(signal?.targetPrice ?? Number.NaN) ? Number(signal?.targetPrice) : null,
    signalEntryTime: Number.isFinite(signal?.entryTime ?? Number.NaN)
      ? Number(signal?.entryTime) * 1000
      : null,
    signalExitTime: Number.isFinite(signal?.exitTime ?? Number.NaN)
      ? Number(signal?.exitTime) * 1000
      : null,
    generatedAt
  };
};

const parseNullableNumber = (value: string | null): number | null => {
  if (value === null || value.trim() === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parsePositionSide = (value: string | null): CopyTradeSignalSide | null => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (normalized === "BUY" || normalized === "LONG") {
    return "Long";
  }

  if (normalized === "SELL" || normalized === "SHORT") {
    return "Short";
  }

  return null;
};

const parseTimestamp = (value: string | null, fallback: number): number => {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
};

export const resolveLocalBridgePosition = (
  searchParams: URLSearchParams,
  fallbackSymbol: string
): CopyTradeRuntimePosition | null | undefined => {
  const positionToken = searchParams.get("position") || searchParams.get("side");
  const hasPositionPayload =
    positionToken !== null ||
    searchParams.has("ticket") ||
    searchParams.has("positionTicket") ||
    searchParams.has("signalId") ||
    searchParams.has("entry") ||
    searchParams.has("tp") ||
    searchParams.has("sl");

  if (!hasPositionPayload) {
    return undefined;
  }

  const normalizedPosition = String(positionToken || "")
    .trim()
    .toUpperCase();

  if (
    !normalizedPosition ||
    normalizedPosition === "FLAT" ||
    normalizedPosition === "NONE" ||
    normalizedPosition === "CLOSED"
  ) {
    return null;
  }

  const side = parsePositionSide(normalizedPosition);
  const ticket = Math.trunc(
    Number(searchParams.get("ticket") || searchParams.get("positionTicket") || Number.NaN)
  );

  if (!side || !Number.isFinite(ticket) || ticket <= 0) {
    return undefined;
  }

  const entryPrice = parseNullableNumber(searchParams.get("entry"));
  const signalId = toSafePlain(searchParams.get("signalId")) || `local-${ticket}`;

  return {
    positionTicket: ticket,
    signalId,
    side,
    symbol: normalizeSignalSymbol(searchParams.get("symbol"), fallbackSymbol),
    openedAt: parseTimestamp(searchParams.get("openedAt"), Date.now()),
    units:
      parseNullableNumber(searchParams.get("units")) ??
      parseNullableNumber(searchParams.get("lot")) ??
      0,
    entryPrice: entryPrice ?? 0,
    takeProfit: parseNullableNumber(searchParams.get("tp")),
    stopLoss: parseNullableNumber(searchParams.get("sl"))
  };
};

export const toPlainLocalSignalResponse = (
  signal: CopyTradeLocalSignalOutput,
  extras: Record<string, string | number | null | undefined> = {}
): string => {
  const lines = [
    "ok=1",
    `action=${signal.desiredPosition}`,
    `signalId=${toSafePlain(signal.signalId)}`,
    `symbol=${signal.symbol}`,
    `timeframe=${signal.timeframe}`,
    `lot=${signal.lot}`,
    `entry=${signal.entryPrice ?? ""}`,
    `sl=${signal.stopLoss ?? ""}`,
    `tp=${signal.takeProfit ?? ""}`,
    `signalEntryTime=${signal.signalEntryTime ?? ""}`,
    `signalExitTime=${signal.signalExitTime ?? ""}`,
    `generatedAt=${signal.generatedAt}`
  ];

  Object.entries(extras).forEach(([key, value]) => {
    lines.push(`${key}=${value ?? ""}`);
  });

  return lines.join("\n");
};

export const toPlainLocalErrorResponse = (message: string): string => {
  return `ok=0\naction=FLAT\nerror=${toSafePlain(message)}`;
};
