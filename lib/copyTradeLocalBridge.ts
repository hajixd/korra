import { getAiZipModelNames } from "./aiZipModels";
import { fetchCopyTradeCandles } from "./copyTradeMarketData";
import {
  computeActiveReplaySignal,
  type CopyTradeSignalSettings,
  type CopyTradeTimeframe
} from "./copyTradeSignalEngine";
import type {
  CopyTradeAccountPublic,
  CopyTradeRuntimePosition,
  CopyTradeSignalSide
} from "./copyTradeService";

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
    fetchCopyTradeCandles({
      symbol: signalSymbol,
      timeframe: account.timeframe
    }),
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
