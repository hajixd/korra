import type {
  BacktestHistoryTradeBlueprint,
  BacktestHistoryTradeSide
} from "../app/backtestHistoryShared";
import {
  STRATEGY_MODEL_CATALOG,
  resolveStrategyModelCatalogEntry,
  type StrategyBacktestCondition,
  type StrategyBacktestDirectionalChecks,
  type StrategyBacktestSpec,
  type StrategyModelCatalogEntry
} from "./strategyCatalog";

type CandleLike = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

export type StrategyReplayModelState = 0 | 1 | 2;

export type StrategyReplayModelProfile = {
  id: string;
  name: string;
  riskMin: number;
  riskMax: number;
  rrMin: number;
  rrMax: number;
  longBias: number;
  state?: StrategyReplayModelState;
};

export type StrategyBacktestSurfaceSummary = {
  buyEntryTrigger: string[];
  sellEntryTrigger: string[];
  buyExitTrigger: string[];
  sellExitTrigger: string[];
};

type FeatureSeries = {
  upTrendBase: boolean[];
  downTrendBase: boolean[];
  upPrice: boolean[];
  downPrice: boolean[];
  recentUp: boolean[];
  recentDown: boolean[];
  normDown: boolean[];
  normUp: boolean[];
  bullishFvgRetest: boolean[];
  bearishFvgRetest: boolean[];
  seasonBucket: Array<string | null>;
  timeBucket: Array<string | null>;
};

type FeatureSnapshot = {
  upTrendBase: boolean;
  downTrendBase: boolean;
  upPrice: boolean;
  downPrice: boolean;
  recentUp: boolean;
  recentDown: boolean;
  normDown: boolean;
  normUp: boolean;
  bullishFvgRetest: boolean;
  bearishFvgRetest: boolean;
  seasonBucket: string | null;
  prevSeasonBucket: string | null;
  timeBucket: string | null;
  prevTimeBucket: string | null;
  nearSupport: boolean;
  nearResistance: boolean;
  bullishReversal: boolean;
  bearishReversal: boolean;
  sufficientRange: boolean;
};

type BuildStrategyReplayTradeBlueprintsArgs = {
  candles: CandleLike[];
  models: StrategyReplayModelProfile[];
  symbol: string;
  unitsPerMove: number;
  chunkBars: number;
  entryMode?: StrategyReplayEntryMode;
  strategyCatalog?: readonly StrategyModelCatalogEntry[];
  tpDollars?: number;
  slDollars?: number;
  stopMode?: number;
  breakEvenTriggerPct?: number;
  trailingStartPct?: number;
  trailingDistPct?: number;
  maxBarsInTrade?: number;
};

export type StrategyReplayEntryMode = "signals" | "every-bar";

const AI_EPS = 1e-8;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const normalizeLookupKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const safeSliceIndex = (length: number, index: number): number => {
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
};

const ema = (values: number[], period: number): number[] => {
  const result = new Array(values.length).fill(Number.NaN);
  const k = 2 / (period + 1);
  let previous: number | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) continue;
    previous = previous === null ? value : value * k + previous * (1 - k);
    result[index] = previous;
  }

  return result;
};

const atr = (candles: CandleLike[], period: number): number[] => {
  const result = new Array(candles.length).fill(Number.NaN);
  if (candles.length === 0) {
    return result;
  }

  const trueRanges = new Array(candles.length).fill(0);
  trueRanges[0] = candles[0]!.high - candles[0]!.low;

  for (let index = 1; index < candles.length; index += 1) {
    const previousClose = candles[index - 1]!.close;
    const candle = candles[index]!;
    trueRanges[index] = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  }

  let previousRma: number | null = null;
  let sum = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const value = trueRanges[index];
    if (!Number.isFinite(value)) continue;

    if (index < period) {
      sum += value;
      if (index === period - 1) {
        previousRma = sum / period;
        result[index] = previousRma;
      }
      continue;
    }

    previousRma = previousRma === null ? value : (previousRma * (period - 1) + value) / period;
    result[index] = previousRma;
  }

  return result;
};

const normalizedOsc = (candles: CandleLike[], lookback: number): number[] => {
  const result = new Array(candles.length).fill(Number.NaN);

  for (let index = 0; index < candles.length; index += 1) {
    const start = Math.max(0, index - lookback + 1);
    let highest = Number.NEGATIVE_INFINITY;
    let lowest = Number.POSITIVE_INFINITY;

    for (let cursor = start; cursor <= index; cursor += 1) {
      const candle = candles[cursor]!;
      if (candle.high > highest) highest = candle.high;
      if (candle.low < lowest) lowest = candle.low;
    }

    const range = highest - lowest;
    result[index] =
      !Number.isFinite(range) || range === 0
        ? 50
        : ((candles[index]!.close - lowest) / range) * 100;
  }

  return result;
};

const bullishBreakOfStructure = (candles: CandleLike[], index: number, length: number): boolean => {
  const end = index - 1;
  const start = end - length + 1;
  if (end <= 0 || start < 0) return false;

  let highest = Number.NEGATIVE_INFINITY;
  let lowest = Number.POSITIVE_INFINITY;

  for (let cursor = start; cursor <= end; cursor += 1) {
    const candle = candles[cursor]!;
    if (candle.high > highest) highest = candle.high;
    if (candle.low < lowest) lowest = candle.low;
  }

  const candle = candles[index]!;
  return candle.high > highest && candle.low > lowest;
};

const bearishBreakOfStructure = (candles: CandleLike[], index: number, length: number): boolean => {
  const end = index - 1;
  const start = end - length + 1;
  if (end <= 0 || start < 0) return false;

  let highest = Number.NEGATIVE_INFINITY;
  let lowest = Number.POSITIVE_INFINITY;

  for (let cursor = start; cursor <= end; cursor += 1) {
    const candle = candles[cursor]!;
    if (candle.high > highest) highest = candle.high;
    if (candle.low < lowest) lowest = candle.low;
  }

  const candle = candles[index]!;
  return candle.low < lowest && candle.high < highest;
};

type FairValueGapZone = {
  direction: "bullish" | "bearish";
  gapLow: number;
  gapHigh: number;
};

const averageRecentRange = (candles: CandleLike[], index: number, lookback = 6): number => {
  const start = Math.max(0, index - lookback + 1);
  let total = 0;
  let count = 0;
  for (let cursor = start; cursor <= index; cursor += 1) {
    const candle = candles[cursor];
    if (!candle) {
      continue;
    }
    total += Math.max(0, candle.high - candle.low);
    count += 1;
  }
  return count > 0 ? total / count : 0;
};

const detectFairValueGapAtIndex = (
  candles: CandleLike[],
  index: number
): FairValueGapZone | null => {
  if (index < 2 || index >= candles.length) {
    return null;
  }

  const left = candles[index - 2];
  const middle = candles[index - 1];
  const right = candles[index];
  if (!left || !middle || !right) {
    return null;
  }

  const averageRange = Math.max(averageRecentRange(candles, index, 8), 0.000001);

  if (left.high < right.low && middle.close >= middle.open) {
    const gapLow = Number(left.high.toFixed(4));
    const gapHigh = Number(right.low.toFixed(4));
    if (gapHigh - gapLow >= averageRange * 0.12) {
      return {
        direction: "bullish",
        gapLow,
        gapHigh
      };
    }
  }

  if (left.low > right.high && middle.close <= middle.open) {
    const gapLow = Number(right.high.toFixed(4));
    const gapHigh = Number(left.low.toFixed(4));
    if (gapHigh - gapLow >= averageRange * 0.12) {
      return {
        direction: "bearish",
        gapLow,
        gapHigh
      };
    }
  }

  return null;
};

const hasRetestedFairValueGap = (
  candles: CandleLike[],
  index: number,
  direction: "bullish" | "bearish",
  lookback = 18
): boolean => {
  if (index < 3 || index >= candles.length) {
    return false;
  }

  const candle = candles[index];
  if (!candle) {
    return false;
  }

  for (let cursor = Math.max(2, index - lookback); cursor < index; cursor += 1) {
    const zone = detectFairValueGapAtIndex(candles, cursor);
    if (!zone || zone.direction !== direction) {
      continue;
    }

    const midpoint = (zone.gapLow + zone.gapHigh) / 2;
    if (direction === "bullish") {
      const touched = candle.low <= zone.gapHigh && candle.high >= zone.gapLow;
      const held = candle.close >= midpoint;
      if (touched && held) {
        return true;
      }
      continue;
    }

    const touched = candle.high >= zone.gapLow && candle.low <= zone.gapHigh;
    const held = candle.close <= midpoint;
    if (touched && held) {
      return true;
    }
  }

  return false;
};

const computeSmartMoneySeasons = (candles: CandleLike[], soft = 20, sharp = 40): Array<string | null> => {
  const seasons = new Array<string | null>(candles.length).fill(null);
  let previous: string | null = null;

  for (let index = 0; index < candles.length; index += 1) {
    let current: string | null = previous;
    const bullSoft = index > soft ? bullishBreakOfStructure(candles, index, soft) : false;
    const bearSoft = index > soft ? bearishBreakOfStructure(candles, index, soft) : false;
    const bullSharp = index > sharp ? bullishBreakOfStructure(candles, index, sharp) : false;
    const bearSharp = index > sharp ? bearishBreakOfStructure(candles, index, sharp) : false;

    if (bullSoft) current = "spring";
    if (bearSoft) current = "fall";
    if (bullSharp) current = "summer";
    if (bearSharp) current = "winter";

    seasons[index] = current;
    previous = current;
  }

  return seasons;
};

const computeMomentumTimeOfDay = (candles: CandleLike[]): Array<string | null> => {
  const closes = candles.map((candle) => candle.close);
  const ma = ema(closes, 50);
  const squeezeEma = ema(closes, 10);
  const closeMinusMa = new Array(candles.length).fill(Number.NaN);
  const squeezeMinusMa = new Array(candles.length).fill(Number.NaN);

  for (let index = 0; index < candles.length; index += 1) {
    if (Number.isFinite(ma[index]) && Number.isFinite(squeezeEma[index])) {
      closeMinusMa[index] = closes[index]! - ma[index]!;
      squeezeMinusMa[index] = squeezeEma[index]! - ma[index]!;
    }
  }

  const buckets = new Array<string | null>(candles.length).fill(null);
  let previous: string | null = null;

  for (let index = 0; index < candles.length; index += 1) {
    let current: string | null = previous;
    const closeValue = closeMinusMa[index];
    const squeezeValue = squeezeMinusMa[index];

    if (Number.isFinite(closeValue) && Number.isFinite(squeezeValue)) {
      if (closeValue >= squeezeValue && closeValue >= 0) current = "day";
      if (closeValue <= squeezeValue && closeValue <= 0) current = "night";
    }

    buckets[index] = current;
    previous = current;
  }

  return buckets;
};

const buildFeatureSeries = (candles: CandleLike[]): FeatureSeries => {
  const closes = candles.map((candle) => candle.close);
  const ema30 = ema(closes, 30);
  const ema200 = ema(closes, 200);
  const atr100 = atr(candles, 100);
  const normOsc = normalizedOsc(candles, 100);
  const seasonBucket = computeSmartMoneySeasons(candles);
  const timeBucket = computeMomentumTimeOfDay(candles);

  const upTrendBase = new Array(candles.length).fill(false);
  const downTrendBase = new Array(candles.length).fill(false);
  const upPrice = new Array(candles.length).fill(false);
  const downPrice = new Array(candles.length).fill(false);
  const recentUp = new Array(candles.length).fill(false);
  const recentDown = new Array(candles.length).fill(false);
  const normDown = new Array(candles.length).fill(false);
  const normUp = new Array(candles.length).fill(false);
  const bullishFvgRetest = new Array(candles.length).fill(false);
  const bearishFvgRetest = new Array(candles.length).fill(false);

  for (let index = 0; index < candles.length; index += 1) {
    upTrendBase[index] = ema30[index]! > ema200[index]!;
    downTrendBase[index] = ema30[index]! < ema200[index]!;

    let hasUpPrice = false;
    let hasDownPrice = false;
    if (index >= 6 && Number.isFinite(atr100[index])) {
      const averageCloseRange = atr100[index]!;
      hasUpPrice = closes[index - 1]! > closes[index - 6]! + averageCloseRange * 2;
      hasDownPrice = closes[index - 1]! < closes[index - 6]! - averageCloseRange * 2;
    }
    upPrice[index] = hasUpPrice;
    downPrice[index] = hasDownPrice;

    const start = Math.max(0, index - 10);
    let sawRecentUp = false;
    let sawRecentDown = false;
    for (let cursor = start; cursor < index; cursor += 1) {
      if (downPrice[cursor]) sawRecentDown = true;
      if (upPrice[cursor]) sawRecentUp = true;
      if (sawRecentDown && sawRecentUp) break;
    }
    recentDown[index] = sawRecentDown;
    recentUp[index] = sawRecentUp;

    const oscillator = normOsc[index];
    normDown[index] = oscillator < 40;
    normUp[index] = oscillator > 60;
    bullishFvgRetest[index] = hasRetestedFairValueGap(candles, index, "bullish");
    bearishFvgRetest[index] = hasRetestedFairValueGap(candles, index, "bearish");
  }

  return {
    upTrendBase,
    downTrendBase,
    upPrice,
    downPrice,
    recentUp,
    recentDown,
    normDown,
    normUp,
    bullishFvgRetest,
    bearishFvgRetest,
    seasonBucket,
    timeBucket
  };
};

const buildWindowSnapshot = (
  candles: CandleLike[],
  index: number,
  bars: number
): Pick<
  FeatureSnapshot,
  "nearSupport" | "nearResistance" | "bullishReversal" | "bearishReversal" | "sufficientRange"
> => {
  const length = candles.length;
  const safeEnd = Math.min(length - 1, Math.max(0, Math.trunc(index)));
  const windowBars = Math.max(2, Math.trunc(bars));
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];

  for (let offset = windowBars - 1; offset >= 0; offset -= 1) {
    const candle = candles[safeSliceIndex(length, safeEnd - offset)]!;
    highs.push(candle.high);
    lows.push(candle.low);
    closes.push(candle.close);
  }

  const baseClose = closes[closes.length - 1] ?? 1;
  const denom = Math.max(Math.abs(baseClose), AI_EPS);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const swing = Math.max(maxHigh - minLow, AI_EPS);
  const position = (closes[closes.length - 1]! - minLow) / swing;
  const previousClose = closes[Math.max(0, closes.length - 2)] ?? closes[closes.length - 1]!;
  const rangeNorm = (maxHigh - minLow) / denom;
  const band = 0.08;

  return {
    nearSupport: position <= band,
    nearResistance: position >= 1 - band,
    bullishReversal:
      closes[closes.length - 1]! > previousClose &&
      (closes[closes.length - 1]! - previousClose) / denom > 0.002,
    bearishReversal:
      closes[closes.length - 1]! < previousClose &&
      (previousClose - closes[closes.length - 1]!) / denom > 0.002,
    sufficientRange: rangeNorm > 0.008
  };
};

const buildFeatureSnapshot = (
  candles: CandleLike[],
  featureSeries: FeatureSeries,
  index: number,
  chunkBars: number
): FeatureSnapshot => {
  const windowSnapshot = buildWindowSnapshot(candles, index, chunkBars);

  return {
    upTrendBase: featureSeries.upTrendBase[index] ?? false,
    downTrendBase: featureSeries.downTrendBase[index] ?? false,
    upPrice: featureSeries.upPrice[index] ?? false,
    downPrice: featureSeries.downPrice[index] ?? false,
    recentUp: featureSeries.recentUp[index] ?? false,
    recentDown: featureSeries.recentDown[index] ?? false,
    normDown: featureSeries.normDown[index] ?? false,
    normUp: featureSeries.normUp[index] ?? false,
    bullishFvgRetest: featureSeries.bullishFvgRetest[index] ?? false,
    bearishFvgRetest: featureSeries.bearishFvgRetest[index] ?? false,
    seasonBucket: featureSeries.seasonBucket[index] ?? null,
    prevSeasonBucket: index > 0 ? featureSeries.seasonBucket[index - 1] ?? null : null,
    timeBucket: featureSeries.timeBucket[index] ?? null,
    prevTimeBucket: index > 0 ? featureSeries.timeBucket[index - 1] ?? null : null,
    ...windowSnapshot
  };
};

const readFeatureValue = (snapshot: FeatureSnapshot, feature: string): unknown => {
  return snapshot[feature as keyof FeatureSnapshot];
};

const buildCatalogLookup = (
  strategyCatalog: readonly StrategyModelCatalogEntry[]
): Map<string, StrategyModelCatalogEntry> => {
  const lookup = new Map<string, StrategyModelCatalogEntry>();

  for (const entry of strategyCatalog) {
    lookup.set(normalizeLookupKey(entry.id), entry);
    lookup.set(normalizeLookupKey(entry.name), entry);

    for (const alias of entry.aliases) {
      lookup.set(normalizeLookupKey(alias), entry);
    }
  }

  return lookup;
};

const evaluateCondition = (condition: StrategyBacktestCondition, snapshot: FeatureSnapshot): boolean => {
  if ("feature" in condition) {
    return Boolean(readFeatureValue(snapshot, condition.feature));
  }

  if ("not" in condition) {
    return !evaluateCondition(condition.not, snapshot);
  }

  if ("all" in condition) {
    return condition.all.every((item) => evaluateCondition(item, snapshot));
  }

  if ("any" in condition) {
    return condition.any.some((item) => evaluateCondition(item, snapshot));
  }

  if ("eq" in condition) {
    const [feature, value] = condition.eq;
    return readFeatureValue(snapshot, feature) === value;
  }

  if ("neq" in condition) {
    const [feature, value] = condition.neq;
    return readFeatureValue(snapshot, feature) !== value;
  }

  return false;
};

const evaluateDirectionalChecks = (
  checks: StrategyBacktestDirectionalChecks | undefined,
  snapshot: FeatureSnapshot
): boolean => {
  if (!checks || checks.checks.length === 0) {
    return false;
  }

  return checks.checks.every((item) => evaluateCondition(item.when, snapshot));
};

const evaluateEntrySide = (
  spec: StrategyBacktestSpec,
  snapshot: FeatureSnapshot
): BacktestHistoryTradeSide | null => {
  const longPass = evaluateDirectionalChecks(spec.entry.long, snapshot);
  const shortPass = evaluateDirectionalChecks(spec.entry.short, snapshot);

  if (!longPass && !shortPass) {
    return null;
  }

  if (longPass && !shortPass) {
    return "Long";
  }

  if (!longPass && shortPass) {
    return "Short";
  }

  return "Long";
};

const evaluateExitSignal = (
  spec: StrategyBacktestSpec | undefined,
  snapshot: FeatureSnapshot,
  side: BacktestHistoryTradeSide
): boolean => {
  if (!spec?.exit) {
    return false;
  }

  return side === "Long"
    ? evaluateDirectionalChecks(spec.exit.long, snapshot)
    : evaluateDirectionalChecks(spec.exit.short, snapshot);
};

const resolveTradeExitIndex = ({
  candles,
  featureSeries,
  model,
  modelSpec,
  signalIndex,
  chunkBars,
  entryPrice,
  side,
  tpDistance,
  slDistance,
  stopMode,
  breakEvenTriggerPct,
  trailingStartPct,
  trailingDistPct,
  maxBarsInTrade
}: {
  candles: CandleLike[];
  featureSeries: FeatureSeries;
  model: StrategyReplayModelProfile;
  modelSpec: StrategyBacktestSpec;
  signalIndex: number;
  chunkBars: number;
  entryPrice: number;
  side: BacktestHistoryTradeSide;
  tpDistance: number;
  slDistance: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
  maxBarsInTrade: number;
}): { index: number; reason: string } => {
  const entryIndex = signalIndex + 1;
  const direction = side === "Long" ? 1 : -1;
  const breakEvenOn = stopMode === 1;
  const trailingOn = stopMode === 2;
  const targetPrice = side === "Long" ? entryPrice + tpDistance : Math.max(0.000001, entryPrice - tpDistance);
  const initialStopPrice = side === "Long" ? Math.max(0.000001, entryPrice - slDistance) : entryPrice + slDistance;
  const tpDistAbs = Math.abs(targetPrice - entryPrice);
  const exitEnabled = (model.state ?? 2) === 2;

  let currentStopPrice = initialStopPrice;
  let bestTrail = initialStopPrice;

  for (let index = entryIndex; index < candles.length; index += 1) {
    const candle = candles[index]!;

    if ((breakEvenOn || trailingOn) && tpDistAbs > 0) {
      if (breakEvenOn) {
        const breakEvenMove = tpDistAbs * (breakEvenTriggerPct / 100);
        if (direction === 1) {
          if (candle.high - entryPrice >= breakEvenMove && currentStopPrice < entryPrice) {
            currentStopPrice = entryPrice;
          }
        } else if (entryPrice - candle.low >= breakEvenMove && currentStopPrice > entryPrice) {
          currentStopPrice = entryPrice;
        }
      }

      if (trailingOn) {
        const startMove = tpDistAbs * (trailingStartPct / 100);
        const trailDistance = tpDistAbs * (trailingDistPct / 100);
        if (direction === 1) {
          if (candle.high - entryPrice >= startMove) {
            const candidate = candle.high - trailDistance;
            if (candidate > bestTrail) {
              bestTrail = candidate;
              if (bestTrail > currentStopPrice) currentStopPrice = bestTrail;
            }
          }
        } else if (entryPrice - candle.low >= startMove) {
          const candidate = candle.low + trailDistance;
          if (candidate < bestTrail || bestTrail === initialStopPrice) {
            bestTrail = candidate;
            if (bestTrail < currentStopPrice || currentStopPrice === initialStopPrice) {
              currentStopPrice = bestTrail;
            }
          }
        }
      }
    }

    const hitTarget = direction === 1 ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = direction === 1 ? candle.low <= currentStopPrice : candle.high >= currentStopPrice;
    const forcedStop = hitStop;
    const forcedTarget = hitTarget && !hitStop;
    const forcedMaxBars =
      maxBarsInTrade > 0 && entryIndex >= 0 && index - entryIndex >= maxBarsInTrade;
    const exitByModel =
      !forcedStop &&
      !forcedTarget &&
      !forcedMaxBars &&
      exitEnabled &&
      evaluateExitSignal(modelSpec, buildFeatureSnapshot(candles, featureSeries, index, chunkBars), side);

    if (!forcedStop && !forcedTarget && !forcedMaxBars && !exitByModel) {
      continue;
    }

    if (forcedStop) {
      return { index, reason: "Stop Loss" };
    }

    if (forcedTarget) {
      return { index, reason: "Take Profit" };
    }

    if (forcedMaxBars) {
      return { index, reason: "Max Bars" };
    }

    return { index, reason: "Model Exit" };
  }

  return { index: candles.length - 1, reason: "End of Data" };
};

const resolveFallbackDistance = (
  model: StrategyReplayModelProfile,
  entryPrice: number,
  isTarget: boolean
): number => {
  const base = isTarget
    ? ((model.rrMin + model.rrMax) / 2) * ((model.riskMin + model.riskMax) / 2)
    : (model.riskMin + model.riskMax) / 2;
  return Math.max(0.000001, entryPrice * Math.max(0.0009, base));
};

export const buildStrategyBacktestSurfaceSummary = (
  model: StrategyModelCatalogEntry
): StrategyBacktestSurfaceSummary | null => {
  const spec = model.backtest;
  if (!spec) {
    return null;
  }

  const formatDirection = (checks: StrategyBacktestDirectionalChecks | undefined): string[] => {
    if (!checks || checks.checks.length === 0) {
      return [];
    }

    return checks.checks.map((item) => item.label);
  };

  return {
    buyEntryTrigger: formatDirection(spec.entry.long),
    sellEntryTrigger: formatDirection(spec.entry.short),
    buyExitTrigger: formatDirection(spec.exit?.long),
    sellExitTrigger: formatDirection(spec.exit?.short)
  };
};

export const buildStrategyReplayTradeBlueprints = ({
  candles,
  models,
  symbol,
  unitsPerMove,
  chunkBars,
  entryMode = "signals",
  strategyCatalog = STRATEGY_MODEL_CATALOG,
  tpDollars = 0,
  slDollars = 0,
  stopMode = 0,
  breakEvenTriggerPct = 50,
  trailingStartPct = 50,
  trailingDistPct = 30,
  maxBarsInTrade = 0
}: BuildStrategyReplayTradeBlueprintsArgs): BacktestHistoryTradeBlueprint[] => {
  if (models.length === 0 || candles.length < 3) {
    return [];
  }

  const featureSeries = buildFeatureSeries(candles);
  const catalogLookup = buildCatalogLookup(strategyCatalog);
  const blueprints: BacktestHistoryTradeBlueprint[] = [];
  const startIndex = Math.max(2, Math.trunc(chunkBars));
  const safeUnits = Math.max(1, Number.isFinite(unitsPerMove) ? unitsPerMove : 1);
  const eligibleModels = models
    .map((model) => {
      if ((model.state ?? 2) <= 0) {
        return null;
      }

      const catalogEntry =
        catalogLookup.get(normalizeLookupKey(model.id)) ??
        catalogLookup.get(normalizeLookupKey(model.name)) ??
        resolveStrategyModelCatalogEntry(model.id) ??
        resolveStrategyModelCatalogEntry(model.name);

      if (!catalogEntry?.backtest) {
        return null;
      }

      return {
        model,
        spec: catalogEntry.backtest
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        model: StrategyReplayModelProfile;
        spec: StrategyBacktestSpec;
      } => candidate !== null
    );

  if (eligibleModels.length === 0) {
    return [];
  }

  const everyBarSides: BacktestHistoryTradeSide[] =
    entryMode === "every-bar" ? ["Long", "Short"] : [];

  for (let signalIndex = startIndex; signalIndex < candles.length - 1; signalIndex += 1) {
    const entryIndex = signalIndex + 1;
    const entryCandle = candles[entryIndex];
    if (!entryCandle) {
      continue;
    }

    const entryPrice = Math.max(0.000001, entryCandle.open);
    const snapshot =
      entryMode === "every-bar"
        ? null
        : buildFeatureSnapshot(candles, featureSeries, signalIndex, chunkBars);

    for (const { model, spec } of eligibleModels) {
      const candidateSides =
        entryMode === "every-bar"
          ? everyBarSides
          : snapshot == null
            ? []
            : [evaluateEntrySide(spec, snapshot)].filter(
                (side): side is BacktestHistoryTradeSide => side === "Long" || side === "Short"
              );
      if (candidateSides.length === 0) {
        continue;
      }

      for (const side of candidateSides) {
        const tpDistance =
          tpDollars > 0
            ? Math.max(0.000001, tpDollars / safeUnits)
            : resolveFallbackDistance(model, entryPrice, true);
        const slDistance =
          slDollars > 0
            ? Math.max(0.000001, slDollars / safeUnits)
            : resolveFallbackDistance(model, entryPrice, false);
        const resolvedExit = resolveTradeExitIndex({
          candles,
          featureSeries,
          model,
          modelSpec: spec,
          signalIndex,
          chunkBars,
          entryPrice,
          side,
          tpDistance,
          slDistance,
          stopMode,
          breakEvenTriggerPct,
          trailingStartPct,
          trailingDistPct,
          maxBarsInTrade
        });

        const exitIndex = resolvedExit.index;
        if (exitIndex <= entryIndex || exitIndex >= candles.length) {
          continue;
        }

        const riskPct = (model.riskMin + model.riskMax) / 2;
        const rr = (model.rrMin + model.rrMax) / 2;
        const entryModeSlug =
          entryMode === "every-bar" ? `every-${side.toLowerCase()}` : "signal";

        blueprints.push({
          id: `${model.id}-${entryModeSlug}-${String(signalIndex).padStart(6, "0")}`,
          modelId: model.id,
          symbol,
          side,
          result: "Win",
          entryMs: entryCandle.time,
          exitMs: candles[exitIndex]!.time,
          entryIndex,
          exitIndex,
          exitReason: resolvedExit.reason,
          riskPct,
          rr,
          units: safeUnits
        });
      }
    }
  }

  return blueprints.sort(
    (left, right) =>
      right.exitMs - left.exitMs || right.entryMs - left.entryMs || left.id.localeCompare(right.id)
  );
};
