import {
  computeBacktestHistoryRowsChunk,
  finalizeBacktestHistoryRows,
  type BacktestHistoryCandle,
  type BacktestHistoryRow,
  type BacktestHistoryTradeBlueprint,
  type BacktestHistoryTradeSide
} from "../app/backtestHistoryShared";

export type CopyTradeTimeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export type CopyTradeCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
  volume?: number;
};

type ReplayModelKind =
  | "momentum"
  | "meanReversion"
  | "seasons"
  | "timeOfDay"
  | "fibonacci"
  | "supportResistance";

type ReplayEntrySignal = {
  side: BacktestHistoryTradeSide;
  strength: number;
  holdBars: number;
  rrWeight: number;
  riskWeight: number;
};

type ModelProfile = {
  id: string;
  name: string;
  riskMin: number;
  riskMax: number;
  rrMin: number;
  rrMax: number;
  longBias: number;
};

export type CopyTradeSignalSettings = {
  symbol: string;
  dollarsPerMove: number;
  chunkBars: number;
  aggressive: boolean;
  maxConcurrentTrades: number;
  tpDollars: number;
  slDollars: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const hashSeedFromText = (seedText: string): number => {
  let seed = 0;

  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }

  return seed;
};

const createModelId = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
};

const createSyntheticModelProfile = (name: string): ModelProfile => {
  const seed = hashSeedFromText(name);
  const sample = (shift: number) => ((seed >>> shift) & 255) / 255;
  const riskMin = 0.0011 + sample(0) * 0.001;
  const rrMin = 1.1 + sample(8) * 0.75;

  return {
    id: createModelId(name),
    name,
    riskMin,
    riskMax: riskMin + 0.0018 + sample(16) * 0.0022,
    rrMin,
    rrMax: rrMin + 0.75 + sample(24) * 1,
    longBias: 0.45 + sample(4) * 0.12
  };
};

const buildModelProfiles = (aiZipModelNames: string[]): ModelProfile[] => {
  const seen = new Set<string>();
  const profiles: ModelProfile[] = [];

  for (const rawName of aiZipModelNames) {
    const name = rawName.trim();

    if (!name) {
      continue;
    }

    const modelId = createModelId(name);

    if (seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    profiles.push(createSyntheticModelProfile(name));
  }

  return profiles;
};

const getUtcDayOfYear = (date: Date): number => {
  const year = date.getUTCFullYear();
  const startMs = Date.UTC(year, 0, 0);
  const dayMs = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return Math.max(1, Math.floor((dayMs - startMs) / 86_400_000));
};

const resolveReplayModelKind = (name: string): ReplayModelKind => {
  const normalized = name.trim().toLowerCase();

  if (normalized.includes("mean") || normalized.includes("reversion")) {
    return "meanReversion";
  }

  if (normalized.includes("season")) {
    return "seasons";
  }

  if (normalized.includes("time of day") || normalized.includes("time")) {
    return "timeOfDay";
  }

  if (normalized.includes("fibonacci") || normalized.includes("fib")) {
    return "fibonacci";
  }

  if (
    normalized.includes("support") ||
    normalized.includes("resistance") ||
    normalized.includes("s/r")
  ) {
    return "supportResistance";
  }

  return "momentum";
};

const getReplayModelCooldownBars = (kind: ReplayModelKind): number => {
  switch (kind) {
    case "momentum":
      return 2;
    case "meanReversion":
      return 3;
    case "seasons":
      return 8;
    case "timeOfDay":
      return 5;
    case "fibonacci":
      return 4;
    case "supportResistance":
      return 4;
    default:
      return 3;
  }
};

const evaluateReplaySignal = ({
  modelKind,
  candles,
  entryIndex,
  windowBars,
  aggressive
}: {
  modelKind: ReplayModelKind;
  candles: CopyTradeCandle[];
  entryIndex: number;
  windowBars: number;
  aggressive: boolean;
}): ReplayEntrySignal | null => {
  const lookbackBars = Math.max(8, Math.min(180, Math.round(windowBars) || 24));

  if (entryIndex < lookbackBars + 1 || entryIndex >= candles.length) {
    return null;
  }

  const startIndex = entryIndex - lookbackBars;
  const previous = candles[entryIndex - 1];

  if (!previous) {
    return null;
  }

  let minLow = Number.POSITIVE_INFINITY;
  let maxHigh = Number.NEGATIVE_INFINITY;
  let sumClose = 0;
  let sumCloseSq = 0;
  let sumRange = 0;

  for (let index = startIndex; index < entryIndex; index += 1) {
    const candle = candles[index];
    if (!candle) {
      return null;
    }

    minLow = Math.min(minLow, candle.low);
    maxHigh = Math.max(maxHigh, candle.high);
    sumClose += candle.close;
    sumCloseSq += candle.close * candle.close;
    sumRange += Math.max(0.000001, candle.high - candle.low);
  }

  const firstClose = candles[startIndex]?.close ?? previous.close;
  if (!Number.isFinite(firstClose) || Math.abs(firstClose) <= 0.000001) {
    return null;
  }

  const rangeAbs = Math.max(0.000001, maxHigh - minLow);
  const trendRet = (previous.close - firstClose) / Math.max(0.000001, Math.abs(firstClose));
  const recentStart = Math.max(startIndex, entryIndex - Math.min(5, lookbackBars));
  const recentClose = candles[recentStart]?.close ?? firstClose;
  const shortRet = (previous.close - recentClose) / Math.max(0.000001, Math.abs(recentClose));
  const meanClose = sumClose / lookbackBars;
  const variance = Math.max(0, sumCloseSq / lookbackBars - meanClose * meanClose);
  const stdClose = Math.sqrt(variance);
  const zScore = (previous.close - meanClose) / Math.max(0.000001, stdClose);
  const closePos = clamp((previous.close - minLow) / rangeAbs, 0, 1);

  const body = Math.abs(previous.close - previous.open);
  const upperWick = Math.max(0, previous.high - Math.max(previous.open, previous.close));
  const lowerWick = Math.max(0, Math.min(previous.open, previous.close) - previous.low);
  const wickBalance = (lowerWick - upperWick) / Math.max(0.000001, body + upperWick + lowerWick);
  const avgRange = sumRange / lookbackBars;

  const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
  let nearestFibLevel = 0.5;
  let nearestFibDistance = Number.POSITIVE_INFINITY;
  for (const level of fibLevels) {
    const fibPrice = minLow + rangeAbs * level;
    const distance = Math.abs(previous.close - fibPrice) / rangeAbs;
    if (distance < nearestFibDistance) {
      nearestFibDistance = distance;
      nearestFibLevel = level;
    }
  }

  const touchBand = Math.max(rangeAbs * 0.08, avgRange * 0.7);
  let supportTouches = 0;
  let resistanceTouches = 0;
  for (let index = startIndex; index < entryIndex; index += 1) {
    const candle = candles[index];
    if (!candle) continue;
    if (candle.low <= minLow + touchBand) supportTouches += 1;
    if (candle.high >= maxHigh - touchBand) resistanceTouches += 1;
  }

  const date = new Date(previous.time);
  const hour = date.getUTCHours();
  const dayOfYear = getUtcDayOfYear(date);
  const seasonalWave = Math.sin((dayOfYear / 365) * Math.PI * 2);
  const intradayWave = Math.sin((hour / 24) * Math.PI * 2);

  if (modelKind === "momentum") {
    const score = Math.abs(trendRet) * 175 + Math.abs(shortRet) * 245;
    const threshold = aggressive ? 0.08 : 0.16;
    if (score < threshold) return null;
    const side: BacktestHistoryTradeSide = (trendRet || shortRet) >= 0 ? "Long" : "Short";
    const strength = clamp((score - threshold) / Math.max(0.1, 1 - threshold), 0, 1);
    return {
      side,
      strength,
      holdBars: Math.round(6 + strength * (aggressive ? 30 : 22)),
      rrWeight: 0.45 + strength * 0.45,
      riskWeight: 0.4 + strength * 0.35
    };
  }

  if (modelKind === "meanReversion") {
    const zThreshold = aggressive ? 0.9 : 1.15;
    if (Math.abs(zScore) < zThreshold) return null;
    const side: BacktestHistoryTradeSide | null =
      zScore >= zThreshold && closePos > 0.52
        ? "Short"
        : zScore <= -zThreshold && closePos < 0.48
          ? "Long"
          : null;
    if (!side) return null;
    const strength = clamp(
      (Math.abs(zScore) - zThreshold) / (aggressive ? 2.2 : 1.8) + Math.abs(closePos - 0.5) * 0.6,
      0,
      1
    );
    return {
      side,
      strength,
      holdBars: Math.round(4 + strength * (aggressive ? 18 : 14)),
      rrWeight: 0.35 + strength * 0.35,
      riskWeight: 0.55 + strength * 0.3
    };
  }

  if (modelKind === "seasons") {
    const score = seasonalWave * 0.65 + intradayWave * 0.35;
    const threshold = aggressive ? 0.16 : 0.26;
    if (Math.abs(score) < threshold) return null;
    const strength = clamp((Math.abs(score) - threshold) / (1 - threshold), 0, 1);
    return {
      side: score >= 0 ? "Long" : "Short",
      strength,
      holdBars: Math.round(10 + strength * (aggressive ? 24 : 18)),
      rrWeight: 0.4 + strength * 0.4,
      riskWeight: 0.5
    };
  }

  if (modelKind === "timeOfDay") {
    const londonNyHours = hour >= 7 && hour <= 16;
    const asiaHours = hour <= 4 || hour >= 20;

    if (londonNyHours) {
      const score = trendRet * 210 + shortRet * 150;
      const threshold = aggressive ? 0.09 : 0.16;
      if (Math.abs(score) < threshold) return null;
      const strength = clamp((Math.abs(score) - threshold) / Math.max(0.1, 1 - threshold), 0, 1);
      return {
        side: score >= 0 ? "Long" : "Short",
        strength,
        holdBars: Math.round(6 + strength * (aggressive ? 22 : 16)),
        rrWeight: 0.45 + strength * 0.35,
        riskWeight: 0.45 + strength * 0.25
      };
    }

    if (asiaHours) {
      const zThreshold = aggressive ? 0.75 : 1.05;
      if (Math.abs(zScore) < zThreshold) return null;
      const strength = clamp((Math.abs(zScore) - zThreshold) / 2, 0, 1);
      return {
        side: zScore >= 0 ? "Short" : "Long",
        strength,
        holdBars: Math.round(4 + strength * (aggressive ? 16 : 12)),
        rrWeight: 0.35 + strength * 0.25,
        riskWeight: 0.55 + strength * 0.25
      };
    }

    return null;
  }

  if (modelKind === "fibonacci") {
    const nearBand = aggressive ? 0.11 : 0.08;
    if (nearestFibDistance > nearBand) return null;
    const side: BacktestHistoryTradeSide = nearestFibLevel <= 0.5 ? "Long" : "Short";
    const strength = clamp((nearBand - nearestFibDistance) / nearBand + Math.abs(shortRet) * 180, 0, 1);
    return {
      side,
      strength,
      holdBars: Math.round(6 + strength * (aggressive ? 24 : 18)),
      rrWeight: 0.5 + strength * 0.4,
      riskWeight: 0.4 + strength * 0.3
    };
  }

  const supportPressure =
    Math.max(0, (0.24 - closePos) * 4) + Math.max(0, wickBalance) + (supportTouches / lookbackBars) * 0.7;
  const resistancePressure =
    Math.max(0, (closePos - 0.76) * 4) + Math.max(0, -wickBalance) + (resistanceTouches / lookbackBars) * 0.7;
  const threshold = aggressive ? 0.45 : 0.6;

  if (supportPressure < threshold && resistancePressure < threshold) {
    return null;
  }

  const longSide = supportPressure >= resistancePressure;
  const strength = clamp(Math.max(supportPressure, resistancePressure) - threshold, 0, 1);
  return {
    side: longSide ? "Long" : "Short",
    strength,
    holdBars: Math.round(5 + strength * (aggressive ? 20 : 14)),
    rrWeight: 0.4 + strength * 0.3,
    riskWeight: 0.5 + strength * 0.25
  };
};

const buildReplayTradeBlueprints = ({
  candles,
  models,
  symbol,
  unitsPerMove,
  windowBars,
  aggressive
}: {
  candles: CopyTradeCandle[];
  models: ModelProfile[];
  symbol: string;
  unitsPerMove: number;
  windowBars: number;
  aggressive: boolean;
}): BacktestHistoryTradeBlueprint[] => {
  if (models.length === 0 || candles.length < 3) {
    return [];
  }

  const lookbackBars = Math.max(8, Math.min(180, Math.round(windowBars) || 24));
  const maxEntryIndex = candles.length - 2;
  const safeUnits = Math.max(1, Number.isFinite(unitsPerMove) ? unitsPerMove : 1);
  const lastEntryByModel = new Map<string, number>();
  const blueprints: BacktestHistoryTradeBlueprint[] = [];

  for (let candleIndex = lookbackBars; candleIndex <= maxEntryIndex; candleIndex += 1) {
    const entryMs = Number(candles[candleIndex]?.time);
    if (!Number.isFinite(entryMs)) {
      continue;
    }

    const candidates: Array<{ model: ModelProfile; signal: ReplayEntrySignal }> = [];

    for (const model of models) {
      const modelKind = resolveReplayModelKind(model.name);
      const cooldownBars = Math.max(
        1,
        Math.round(getReplayModelCooldownBars(modelKind) * (aggressive ? 0.75 : 1))
      );
      const previousEntryIndex = lastEntryByModel.get(model.id) ?? Number.NEGATIVE_INFINITY;
      if (candleIndex - previousEntryIndex < cooldownBars) {
        continue;
      }

      const signal = evaluateReplaySignal({
        modelKind,
        candles,
        entryIndex: candleIndex,
        windowBars,
        aggressive
      });
      if (!signal) {
        continue;
      }

      const longBiasWeight = signal.side === "Long" ? model.longBias : 1 - model.longBias;
      const weightedStrength = clamp(signal.strength * (0.75 + longBiasWeight * 0.6), 0, 1);
      const minStrength = aggressive ? 0.14 : 0.26;
      if (weightedStrength < minStrength) {
        continue;
      }

      candidates.push({
        model,
        signal: {
          ...signal,
          strength: weightedStrength
        }
      });
    }

    if (candidates.length === 0) {
      continue;
    }

    candidates.sort(
      (left, right) =>
        right.signal.strength - left.signal.strength || left.model.id.localeCompare(right.model.id)
    );

    const chosen = candidates[0]!;
    const remainingBars = Math.max(1, candles.length - 1 - candleIndex);
    const holdBars = clamp(Math.round(chosen.signal.holdBars), 1, Math.min(160, remainingBars));
    const exitIndex = Math.min(candles.length - 1, candleIndex + holdBars);
    const exitMs = Number(candles[exitIndex]?.time);

    if (!Number.isFinite(exitMs) || exitMs <= entryMs) {
      continue;
    }

    const rrWeight = clamp(chosen.signal.rrWeight, 0, 1);
    const riskWeight = clamp(chosen.signal.riskWeight, 0, 1);
    const rr = chosen.model.rrMin + (chosen.model.rrMax - chosen.model.rrMin) * rrWeight;
    const riskPct = chosen.model.riskMin + (chosen.model.riskMax - chosen.model.riskMin) * riskWeight;

    blueprints.push({
      id: `${chosen.model.id}-replay-${String(candleIndex).padStart(6, "0")}`,
      modelId: chosen.model.id,
      symbol,
      side: chosen.signal.side,
      result: "Win",
      entryMs,
      exitMs,
      riskPct,
      rr,
      units: safeUnits
    });

    lastEntryByModel.set(chosen.model.id, candleIndex);
  }

  return blueprints.sort(
    (left, right) =>
      right.exitMs - left.exitMs || right.entryMs - left.entryMs || left.id.localeCompare(right.id)
  );
};

const insertSortedExit = (activeExitMs: number[], exitMs: number) => {
  let insertAt = activeExitMs.length;
  while (insertAt > 0 && activeExitMs[insertAt - 1]! > exitMs) {
    insertAt -= 1;
  }
  activeExitMs.splice(insertAt, 0, exitMs);
};

const enforceMaxConcurrentTradeBlueprints = (
  blueprints: BacktestHistoryTradeBlueprint[],
  maxConcurrentTrades: number
): BacktestHistoryTradeBlueprint[] => {
  const limit = clamp(Math.floor(Number(maxConcurrentTrades) || 0), 0, 500);
  if (limit <= 0 || blueprints.length === 0) {
    return [];
  }

  const chronological = [...blueprints]
    .filter(
      (blueprint) =>
        Number.isFinite(blueprint.entryMs) &&
        Number.isFinite(blueprint.exitMs) &&
        blueprint.exitMs > blueprint.entryMs
    )
    .sort(
      (left, right) =>
        left.entryMs - right.entryMs ||
        left.exitMs - right.exitMs ||
        left.id.localeCompare(right.id)
    );

  const selected: BacktestHistoryTradeBlueprint[] = [];
  const activeExitMs: number[] = [];

  for (const blueprint of chronological) {
    while (activeExitMs.length > 0 && activeExitMs[0]! <= blueprint.entryMs) {
      activeExitMs.shift();
    }

    if (activeExitMs.length >= limit) {
      continue;
    }

    selected.push(blueprint);
    insertSortedExit(activeExitMs, blueprint.exitMs);
  }

  return selected.sort((left, right) => right.exitMs - left.exitMs);
};

const toBacktestCandles = (candles: CopyTradeCandle[]): BacktestHistoryCandle[] => {
  return candles.map((candle) => ({
    open: candle.open,
    close: candle.close,
    high: candle.high,
    low: candle.low,
    time: candle.time
  }));
};

export const computeActiveReplaySignal = (args: {
  candles: CopyTradeCandle[];
  aiZipModelNames: string[];
  settings: CopyTradeSignalSettings;
  nowMs?: number;
}): BacktestHistoryRow | null => {
  const { candles, aiZipModelNames, settings, nowMs } = args;

  if (candles.length < 48) {
    return null;
  }

  const modelProfiles = buildModelProfiles(aiZipModelNames);

  if (modelProfiles.length === 0) {
    return null;
  }

  const blueprints = buildReplayTradeBlueprints({
    candles,
    models: modelProfiles,
    symbol: settings.symbol,
    unitsPerMove: settings.dollarsPerMove,
    windowBars: settings.chunkBars,
    aggressive: settings.aggressive
  });

  const constrainedBlueprints = enforceMaxConcurrentTradeBlueprints(
    blueprints,
    settings.maxConcurrentTrades
  );

  if (constrainedBlueprints.length === 0) {
    return null;
  }

  const modelNamesById = modelProfiles.reduce<Record<string, string>>((accumulator, profile) => {
    accumulator[profile.id] = profile.name;
    return accumulator;
  }, {});

  const rows = finalizeBacktestHistoryRows(
    computeBacktestHistoryRowsChunk({
      blueprints: constrainedBlueprints,
      candleSeriesBySymbol: {
        [settings.symbol]: toBacktestCandles(candles)
      },
      minutePreciseEnabled: false,
      modelNamesById,
      tpDollars: settings.tpDollars,
      slDollars: settings.slDollars,
      stopMode: settings.stopMode,
      breakEvenTriggerPct: settings.breakEvenTriggerPct,
      trailingStartPct: settings.trailingStartPct,
      trailingDistPct: settings.trailingDistPct
    }),
    constrainedBlueprints.length
  );

  if (rows.length === 0) {
    return null;
  }

  const latestCandleTimeMs = candles[candles.length - 1]?.time ?? Date.now();
  const activeThresholdSec = Math.floor((nowMs ?? latestCandleTimeMs) / 1000);

  const activeRows = rows
    .filter((row) => row.entryTime <= activeThresholdSec && row.exitTime > activeThresholdSec)
    .sort(
      (left, right) =>
        right.entryTime - left.entryTime ||
        right.exitTime - left.exitTime ||
        left.id.localeCompare(right.id)
    );

  return activeRows[0] ?? null;
};
