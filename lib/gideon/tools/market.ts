import type { GideonRuntimeCandle, GideonRuntimeContext } from "../contracts";

const timeframeToMs = (timeframe: string): number => {
  const normalized = String(timeframe || "M15").trim().toUpperCase();
  const byTimeframe: Record<string, number> = {
    M1: 60_000,
    M5: 5 * 60_000,
    M15: 15 * 60_000,
    M30: 30 * 60_000,
    H1: 60 * 60_000,
    H4: 4 * 60 * 60_000,
    D: 24 * 60 * 60_000,
    W: 7 * 24 * 60 * 60_000,
    M: 30 * 24 * 60 * 60_000
  };
  return byTimeframe[normalized] ?? 15 * 60_000;
};

const normalizeTimestampMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return value;
  }
  const abs = Math.abs(value);
  if (abs < 1e11) return Math.trunc(value * 1000);
  if (abs > 1e15) return Math.trunc(value / 1000);
  return Math.trunc(value);
};

const latestCandle = (candles: GideonRuntimeCandle[]): GideonRuntimeCandle | null =>
  candles.length > 0 ? candles[candles.length - 1]! : null;

export const getLatestPriceAnchorTool = (runtime: GideonRuntimeContext) => {
  const latest = latestCandle(runtime.liveCandles);
  const first = runtime.liveCandles.length > 0 ? runtime.liveCandles[0]! : null;
  const nowMs = Date.now();
  const timeframeMs = timeframeToMs(runtime.timeframe);
  const latestTimeMs = latest ? normalizeTimestampMs(latest.time) : null;
  const ageMs = latestTimeMs ? Math.max(0, nowMs - latestTimeMs) : null;
  const isFresh = ageMs !== null ? ageMs <= Math.max(timeframeMs * 3, 90_000) : false;
  const movePct =
    latest && first && Math.abs(first.close) > 1e-9
      ? ((latest.close - first.close) / first.close) * 100
      : 0;
  const highs = runtime.liveCandles.map((candle) => candle.high);
  const lows = runtime.liveCandles.map((candle) => candle.low);

  return {
    symbol: runtime.symbol,
    timeframe: runtime.timeframe,
    latestClose: latest ? Number(latest.close.toFixed(4)) : null,
    latestHigh: latest ? Number(latest.high.toFixed(4)) : null,
    latestLow: latest ? Number(latest.low.toFixed(4)) : null,
    latestTimeIso: latestTimeMs ? new Date(latestTimeMs).toISOString() : null,
    ageMs,
    isFresh,
    movePct: Number(movePct.toFixed(4)),
    windowHigh: highs.length > 0 ? Number(Math.max(...highs).toFixed(4)) : null,
    windowLow: lows.length > 0 ? Number(Math.min(...lows).toFixed(4)) : null,
    candleCount: runtime.liveCandles.length
  };
};

export const getRecentCandlesTool = (runtime: GideonRuntimeContext, count = 240) => {
  const safeCount = Math.max(20, Math.min(1500, Math.trunc(count)));
  const candles = runtime.liveCandles.slice(-safeCount);
  return {
    symbol: runtime.symbol,
    timeframe: runtime.timeframe,
    candleCount: candles.length,
    candles
  };
};

export const getMultiTimeframeContextTool = (runtime: GideonRuntimeContext) => {
  const candles = runtime.liveCandles.slice(-240);
  const latest = latestCandle(candles);
  const recent = candles.slice(-40);
  const avgClose =
    recent.length > 0
      ? recent.reduce((sum, candle) => sum + candle.close, 0) / recent.length
      : null;

  return {
    symbol: runtime.symbol,
    timeframe: runtime.timeframe,
    latestClose: latest ? Number(latest.close.toFixed(4)) : null,
    recentAverageClose: avgClose !== null ? Number(avgClose.toFixed(4)) : null,
    bias:
      latest && avgClose !== null
        ? latest.close > avgClose
          ? "up"
          : latest.close < avgClose
            ? "down"
            : "flat"
        : "unknown",
    candleCount: candles.length
  };
};
