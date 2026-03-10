import type { GideonRuntimeCandle, GideonRuntimeContext } from "../contracts";

const normalizeTimestampMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return value;
  }
  const abs = Math.abs(value);
  if (abs < 1e11) return Math.trunc(value * 1000);
  if (abs > 1e15) return Math.trunc(value / 1000);
  return Math.trunc(value);
};

const rollingMeanAt = (values: number[], index: number, period: number): number => {
  const end = Math.max(0, Math.min(values.length - 1, index));
  const start = Math.max(0, end - Math.max(1, period) + 1);
  let sum = 0;
  let count = 0;
  for (let cursor = start; cursor <= end; cursor += 1) {
    const value = values[cursor];
    if (!Number.isFinite(value)) {
      continue;
    }
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
};

const computeEmaSeries = (values: number[], period: number): number[] => {
  if (values.length === 0) {
    return [];
  }
  const alpha = 2 / (Math.max(2, period) + 1);
  const output: number[] = new Array(values.length).fill(0);
  output[0] = values[0] ?? 0;
  for (let index = 1; index < values.length; index += 1) {
    const prev = output[index - 1] ?? values[index - 1] ?? 0;
    const next = values[index] ?? prev;
    output[index] = prev + alpha * (next - prev);
  }
  return output;
};

const computeRsiSeries = (closes: number[], period: number): number[] => {
  if (closes.length === 0) {
    return [];
  }

  const normalizedPeriod = Math.max(2, period);
  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);

  for (let index = 1; index < closes.length; index += 1) {
    const diff = (closes[index] ?? 0) - (closes[index - 1] ?? 0);
    gains[index] = diff > 0 ? diff : 0;
    losses[index] = diff < 0 ? Math.abs(diff) : 0;
  }

  const rsi: number[] = new Array(closes.length).fill(50);
  let avgGain = 0;
  let avgLoss = 0;

  for (let index = 1; index < closes.length; index += 1) {
    avgGain = ((avgGain * (normalizedPeriod - 1)) + gains[index]!) / normalizedPeriod;
    avgLoss = ((avgLoss * (normalizedPeriod - 1)) + losses[index]!) / normalizedPeriod;

    if (avgLoss <= 1e-9) {
      rsi[index] = 100;
      continue;
    }

    const rs = avgGain / avgLoss;
    rsi[index] = 100 - 100 / (1 + rs);
  }

  return rsi;
};

const computeLatestRsiSnapshot = (candles: GideonRuntimeCandle[], period = 14) => {
  if (!Array.isArray(candles) || candles.length < period + 1) {
    return null;
  }

  const closes = candles.map((row) => row.close);
  const rsi = computeRsiSeries(closes, period);
  if (rsi.length < period + 1) {
    return null;
  }

  const latest = rsi[rsi.length - 1];
  if (!Number.isFinite(latest)) {
    return null;
  }

  const previous = rsi[Math.max(0, rsi.length - 2)] ?? latest;
  const momentum = latest - previous;
  const state =
    latest >= 70 ? "overbought" : latest <= 30 ? "oversold" : "neutral";

  return {
    value: Number(latest.toFixed(2)),
    previous: Number(previous.toFixed(2)),
    momentum: Number(momentum.toFixed(2)),
    state,
    overboughtThreshold: 70,
    oversoldThreshold: 30
  };
};

const computeMacdSeries = (params: {
  candles: GideonRuntimeCandle[];
  fast: number;
  slow: number;
  signal: number;
}) => {
  const { candles, fast, slow, signal } = params;
  if (candles.length === 0) {
    return [];
  }
  const closes = candles.map((row) => row.close);
  const fastEma = computeEmaSeries(closes, fast);
  const slowEma = computeEmaSeries(closes, slow);
  const macdLine = fastEma.map((value, index) => value - (slowEma[index] ?? value));
  const signalLine = computeEmaSeries(macdLine, signal);

  return candles.map((candle, index) => {
    const macd = macdLine[index] ?? 0;
    const signalValue = signalLine[index] ?? 0;
    return {
      time: candle.time,
      macd,
      signal: signalValue,
      histogram: macd - signalValue
    };
  });
};

const computeLatestMacdSnapshot = (params: {
  candles: GideonRuntimeCandle[];
  fast: number;
  slow: number;
  signal: number;
}) => {
  const { candles, fast, slow, signal } = params;
  const minCandles = Math.max(24, slow + signal + 4);
  if (candles.length < minCandles) {
    return null;
  }

  const series = computeMacdSeries({ candles, fast, slow, signal });
  if (series.length < 2) {
    return null;
  }

  const latest = series[series.length - 1]!;
  const previous = series[series.length - 2]!;
  const crossedUp = previous.macd <= previous.signal && latest.macd > latest.signal;
  const crossedDown = previous.macd >= previous.signal && latest.macd < latest.signal;
  const regime =
    latest.histogram > 0 ? "bullish_momentum" : latest.histogram < 0 ? "bearish_momentum" : "flat";

  return {
    macd: Number(latest.macd.toFixed(4)),
    signal: Number(latest.signal.toFixed(4)),
    histogram: Number(latest.histogram.toFixed(4)),
    crossedUp,
    crossedDown,
    regime,
    params: { fast, slow, signal }
  };
};

const computeLatestMovingAverageSnapshot = (params: {
  candles: GideonRuntimeCandle[];
  period: number;
  kind: "ema" | "sma";
}) => {
  const { candles, period, kind } = params;
  if (candles.length < period + 1) {
    return null;
  }

  const closes = candles.map((row) => row.close);
  const series =
    kind === "ema"
      ? computeEmaSeries(closes, period)
      : closes.map((_, index) => rollingMeanAt(closes, index, period));

  const latest = series[series.length - 1];
  const previous = series[Math.max(0, series.length - 2)] ?? latest;
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) {
    return null;
  }

  return {
    value: Number(latest.toFixed(4)),
    previous: Number(previous.toFixed(4)),
    slope: Number((latest - previous).toFixed(4)),
    period,
    kind
  };
};

const computeLatestAtrSnapshot = (params: {
  candles: GideonRuntimeCandle[];
  period: number;
}) => {
  const { candles, period } = params;
  if (candles.length < period + 2) {
    return null;
  }

  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    const range1 = current.high - current.low;
    const range2 = Math.abs(current.high - previous.close);
    const range3 = Math.abs(current.low - previous.close);
    trueRanges.push(Math.max(range1, range2, range3));
  }

  if (trueRanges.length === 0) {
    return null;
  }

  const atrSeries = trueRanges.map((_, index) => rollingMeanAt(trueRanges, index, period));
  const latest = atrSeries[atrSeries.length - 1] ?? 0;
  const previous = atrSeries[Math.max(0, atrSeries.length - 2)] ?? latest;
  return {
    value: Number(latest.toFixed(4)),
    previous: Number(previous.toFixed(4)),
    change: Number((latest - previous).toFixed(4)),
    period
  };
};

const computeLatestStochasticSnapshot = (params: {
  candles: GideonRuntimeCandle[];
  kPeriod: number;
  dPeriod: number;
}) => {
  const { candles, kPeriod, dPeriod } = params;
  if (candles.length < kPeriod + dPeriod + 2) {
    return null;
  }

  const percentK: number[] = candles.map((row, index) => {
    const start = Math.max(0, index - kPeriod + 1);
    const window = candles.slice(start, index + 1);
    if (window.length === 0) {
      return 50;
    }
    const low = Math.min(...window.map((entry) => entry.low));
    const high = Math.max(...window.map((entry) => entry.high));
    const span = Math.max(1e-9, high - low);
    return ((row.close - low) / span) * 100;
  });
  const percentD = percentK.map((_, index) => rollingMeanAt(percentK, index, dPeriod));

  const latestK = percentK[percentK.length - 1] ?? 50;
  const latestD = percentD[percentD.length - 1] ?? latestK;
  const state = latestK >= 80 ? "overbought" : latestK <= 20 ? "oversold" : "neutral";
  return {
    k: Number(latestK.toFixed(2)),
    d: Number(latestD.toFixed(2)),
    state,
    kPeriod,
    dPeriod
  };
};

const extractRequestedIndicators = (prompt: string): string[] => {
  const normalized = prompt.toLowerCase();
  const requested = new Set<string>();
  if (/\brsi\b|\boverbought\b|\boversold\b/.test(normalized)) {
    requested.add("rsi");
  }
  if (/\bmacd\b/.test(normalized)) {
    requested.add("macd");
  }
  if (/\bema\b|\bexponential moving average\b/.test(normalized)) {
    requested.add("ema");
  }
  if (/\bsma\b|\bsimple moving average\b|\bmoving average\b/.test(normalized)) {
    requested.add("sma");
  }
  if (/\batr\b|\baverage true range\b|\bvolatility\b/.test(normalized)) {
    requested.add("atr");
  }
  if (/\bstoch\b|\bstochastic\b/.test(normalized)) {
    requested.add("stochastic");
  }
  return Array.from(requested);
};

export const computeIndicatorSnapshotTool = (params: {
  prompt: string;
  runtime: GideonRuntimeContext;
}) => {
  const candles = params.runtime.liveCandles.slice(-320);
  const latest = candles[candles.length - 1] ?? null;
  const requested = extractRequestedIndicators(params.prompt);
  const output: Record<string, unknown> = {
    symbol: params.runtime.symbol,
    timeframe: params.runtime.timeframe,
    candleCount: candles.length,
    latestTimeIso: latest ? new Date(normalizeTimestampMs(latest.time)).toISOString() : null
  };

  if (requested.length === 0 || requested.includes("rsi")) {
    output.rsi14 = computeLatestRsiSnapshot(candles, 14);
  }
  if (requested.includes("macd")) {
    output.macd = computeLatestMacdSnapshot({
      candles,
      fast: 12,
      slow: 26,
      signal: 9
    });
  }
  if (requested.includes("ema")) {
    output.ema20 = computeLatestMovingAverageSnapshot({
      candles,
      period: 20,
      kind: "ema"
    });
  }
  if (requested.includes("sma")) {
    output.sma20 = computeLatestMovingAverageSnapshot({
      candles,
      period: 20,
      kind: "sma"
    });
  }
  if (requested.includes("atr")) {
    output.atr14 = computeLatestAtrSnapshot({
      candles,
      period: 14
    });
  }
  if (requested.includes("stochastic")) {
    output.stochastic_14_3 = computeLatestStochasticSnapshot({
      candles,
      kPeriod: 14,
      dPeriod: 3
    });
  }

  return output;
};
