export type AIZipMode = "off" | "knn" | "hdbscan";
export type SeededLibraryTradeSide = "Long" | "Short";
export type SeededLibraryTradeResult = "Win" | "Loss";
export type AizipModelStateMap = Record<string, number | null | undefined>;

export type SeededLibraryCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type SeededLibraryTrade = {
  id: string;
  symbol: string;
  side: SeededLibraryTradeSide;
  result: SeededLibraryTradeResult;
  entrySource: string;
  exitReason: string;
  pnlPct: number;
  pnlUsd: number;
  time: string;
  entryAt: string;
  exitAt: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
};

export type AIZipHistorySeedSettings = {
  symbol: string;
  timeframe: string;
  precisionTimeframe: string;
  minutePreciseEnabled: boolean;
  statsDateStart: string;
  statsDateEnd: string;
  chunkBars: number;
  maxBarsInTrade: number;
};

export const ONLINE_LEARNING_LIBRARY_ID = "core";
export const GHOST_LEARNING_LIBRARY_ID = "suppressed";
export const REMOVED_AIZIP_LIBRARY_IDS = new Set(["recent"]);
export const BASE_SEEDING_LIBRARY_IDS = new Set([
  "base",
  "tokyo",
  "sydney",
  "london",
  "newyork"
]);

export const AI_LIBRARY_SEED_LOOKAHEAD_BARS = 96;
export const AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS = 12000;
export const SYNTHETIC_LIBRARY_START_MS = Date.UTC(1999, 0, 1, 0, 0, 0, 0);
export const SYNTHETIC_LIBRARY_BAR_INTERVAL_MS = 15 * 60 * 1000;
export const SYNTHETIC_LIBRARY_MIN_BARS = 2048;
export const SYNTHETIC_LIBRARY_MAX_BARS = 8192;

export const isBaseSeedingLibraryId = (libraryId: string): boolean => {
  return BASE_SEEDING_LIBRARY_IDS.has(String(libraryId || "").trim().toLowerCase());
};

export const isOnlineLearningLibraryId = (libraryId: string): boolean => {
  return String(libraryId || "").trim().toLowerCase() === ONLINE_LEARNING_LIBRARY_ID;
};

export const isGhostLearningLibraryId = (libraryId: string): boolean => {
  return String(libraryId || "").trim().toLowerCase() === GHOST_LEARNING_LIBRARY_ID;
};

export const isRemovedAizipLibraryId = (libraryId: string): boolean => {
  return REMOVED_AIZIP_LIBRARY_IDS.has(String(libraryId || "").trim().toLowerCase());
};

export const isVisibleAizipLibraryId = (libraryId: string): boolean => {
  return (
    !isOnlineLearningLibraryId(libraryId) &&
    !isGhostLearningLibraryId(libraryId) &&
    !isRemovedAizipLibraryId(libraryId)
  );
};

export const getVisibleAizipLibraryIds = (
  libraryIds: readonly string[] | null | undefined
): string[] => {
  const ids = Array.isArray(libraryIds) ? libraryIds : [];
  return ids.filter((libraryId) => isVisibleAizipLibraryId(libraryId));
};

export const countEnabledAizipModels = (
  aiModelStates: AizipModelStateMap | null | undefined
): number => {
  if (!aiModelStates || typeof aiModelStates !== "object") {
    return 0;
  }

  return Object.values(aiModelStates).reduce<number>((count, value) => {
    return count + ((Number(value) || 0) > 0 ? 1 : 0);
  }, 0);
};

export const canRunAizipLibraries = (params: {
  libraryIds: readonly string[] | null | undefined;
  selectedModelCount: number;
}): boolean => {
  const ids = Array.isArray(params.libraryIds) ? params.libraryIds : [];
  // Any active library should be attempted during backtests; individual loaders can still resolve to 0 results.
  return ids.some((libraryId) => {
    const normalized = String(libraryId ?? "").trim();
    return normalized.length > 0 && !isRemovedAizipLibraryId(normalized);
  });
};

export const canRunAizipLibrariesForSettings = (params: {
  libraryIds: readonly string[] | null | undefined;
  aiModelStates: AizipModelStateMap | null | undefined;
}): boolean => {
  return canRunAizipLibraries({
    libraryIds: params.libraryIds,
    selectedModelCount: countEnabledAizipModels(params.aiModelStates)
  });
};

export const usesAizipEveryCandleMode = (
  aiMode: AIZipMode,
  aiFilterEnabled: boolean
): boolean => {
  return aiMode !== "off" && !aiFilterEnabled;
};

export const shouldSkipAizipBacktestHistoryFetch = (params: {
  antiCheatEnabled: boolean;
  selectedModelCount: number;
  selectedAiLibraries: readonly string[] | null | undefined;
}): boolean => {
  if (params.antiCheatEnabled) {
    return false;
  }

  return !canRunAizipLibraries({
    libraryIds: params.selectedAiLibraries,
    selectedModelCount: params.selectedModelCount
  });
};

export const getMinimumAizipSeedBars = (chunkBars: number): number => {
  return Math.max(16, Math.trunc(Number.isFinite(chunkBars) ? chunkBars : 0) + 2);
};

export const doesAizipHistorySeedSettingsChange = (
  previous: AIZipHistorySeedSettings,
  next: AIZipHistorySeedSettings
): boolean => {
  if (previous.symbol !== next.symbol) return true;
  if (previous.timeframe !== next.timeframe) return true;
  if (previous.precisionTimeframe !== next.precisionTimeframe) return true;
  if (previous.minutePreciseEnabled !== next.minutePreciseEnabled) return true;
  if (previous.statsDateStart !== next.statsDateStart) return true;
  if (previous.statsDateEnd !== next.statsDateEnd) return true;
  if (previous.chunkBars !== next.chunkBars) return true;
  if (previous.maxBarsInTrade !== next.maxBarsInTrade) return true;
  return false;
};

export const hasUsableAizipSeedCandles = (
  candles: readonly SeededLibraryCandle[] | null | undefined,
  minimumBars = 3
): boolean => {
  return Array.isArray(candles) && candles.length >= Math.max(3, Math.floor(minimumBars));
};

const hashText32 = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRng = (seed: number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleStandardNormal = (rng: () => number): number => {
  let u = 0;
  let v = 0;
  while (u <= Number.EPSILON) {
    u = rng();
  }
  while (v <= Number.EPSILON) {
    v = rng();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const getSyntheticLibraryBarCount = (chunkBars: number): number => {
  const requested = Math.max(1, Math.floor(Number(chunkBars) || 0));
  return clamp(requested * 96, SYNTHETIC_LIBRARY_MIN_BARS, SYNTHETIC_LIBRARY_MAX_BARS);
};

export const buildSyntheticLibraryCandles = (params: {
  seedText: string;
  candleCount: number;
  startMs?: number;
  intervalMs?: number;
}): SeededLibraryCandle[] => {
  const {
    seedText,
    candleCount,
    startMs = SYNTHETIC_LIBRARY_START_MS,
    intervalMs = SYNTHETIC_LIBRARY_BAR_INTERVAL_MS
  } = params;

  const totalBars = Math.max(8, Math.floor(Number(candleCount) || 0));
  const stepMs = Math.max(60_000, Math.floor(Number(intervalMs) || SYNTHETIC_LIBRARY_BAR_INTERVAL_MS));
  const rng = createSeededRng(hashText32(seedText));
  const out: SeededLibraryCandle[] = new Array(totalBars);
  const regimeConfigs = [
    { drift: 0.00065, vol: 0.0032, persistence: 0.5, jumpProb: 0.002, jumpScale: 0.006 },
    { drift: -0.0006, vol: 0.0034, persistence: 0.5, jumpProb: 0.0022, jumpScale: 0.0065 },
    { drift: 0.00004, vol: 0.0018, persistence: 0.2, jumpProb: 0.0008, jumpScale: 0.003 },
    { drift: 0, vol: 0.0056, persistence: 0.15, jumpProb: 0.006, jumpScale: 0.015 }
  ] as const;

  let regimeIndex = 2;
  let regimeBarsLeft = 0;
  let previousLogReturn = 0;
  let price = 100 + rng() * 20;

  out[0] = {
    time: startMs,
    open: price,
    high: price * 1.0015,
    low: price * 0.9985,
    close: price * 1.0005
  };
  price = out[0]!.close;

  for (let index = 1; index < totalBars; index += 1) {
    if (regimeBarsLeft <= 0) {
      const pick = rng();
      regimeIndex = pick < 0.24 ? 0 : pick < 0.48 ? 1 : pick < 0.82 ? 2 : 3;
      regimeBarsLeft = 48 + Math.floor(rng() * 192);
    }

    const config = regimeConfigs[regimeIndex]!;
    const intradayPhase = (index % 96) / 96;
    const weeklyPhase = (index % (96 * 7)) / (96 * 7);
    const seasonalBias =
      Math.sin(intradayPhase * Math.PI * 2) * 0.00025 +
      Math.sin(weeklyPhase * Math.PI * 2) * 0.0004;
    const noise = sampleStandardNormal(rng);
    let logReturn =
      config.drift +
      seasonalBias +
      previousLogReturn * config.persistence +
      noise * config.vol;

    if (rng() < config.jumpProb) {
      const jumpDirection = rng() < 0.5 ? -1 : 1;
      logReturn += jumpDirection * config.jumpScale * (0.6 + rng() * 0.8);
    }

    logReturn = clamp(logReturn, -0.18, 0.18);
    previousLogReturn = logReturn;

    const open = price;
    const close = Math.max(0.5, open * Math.exp(logReturn));
    const bodyMove = Math.abs(close - open);
    const wickScale = Math.max(open * config.vol * (0.8 + Math.abs(sampleStandardNormal(rng))), bodyMove * 0.65);
    const high = Math.max(open, close) + wickScale * (0.35 + rng() * 0.85);
    const low = Math.max(0.0001, Math.min(open, close) - wickScale * (0.35 + rng() * 0.85));

    out[index] = {
      time: startMs + index * stepMs,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close
    };
    price = close;
    regimeBarsLeft -= 1;
  }

  return out;
};

const toUtcTimestamp = (ms: number): number => {
  return Math.floor(ms / 1000);
};

export const buildSeededLibraryTradePoolFromCandles = (params: {
  candles: readonly SeededLibraryCandle[];
  symbol: string;
  unitsPerMove: number;
  tpDollars: number;
  slDollars: number;
  chunkBars: number;
  maxLookaheadBars?: number;
  formatTimestamp: (timestampSeconds: number) => string;
}): SeededLibraryTrade[] => {
  const {
    candles,
    symbol,
    unitsPerMove,
    tpDollars,
    slDollars,
    chunkBars,
    maxLookaheadBars = AI_LIBRARY_SEED_LOOKAHEAD_BARS,
    formatTimestamp
  } = params;

  if (!hasUsableAizipSeedCandles(candles)) {
    return [];
  }

  const normalizedUnitsPerMove = Math.max(1, Number.isFinite(unitsPerMove) ? unitsPerMove : 1);
  const normalizedTp = Number.isFinite(tpDollars) ? tpDollars : 0;
  const normalizedSl = Number.isFinite(slDollars) ? slDollars : 0;
  const tpDistance =
    normalizedTp > 0
      ? Math.max(0.000001, normalizedTp / normalizedUnitsPerMove)
      : 0;
  const slDistance =
    normalizedSl > 0
      ? Math.max(0.000001, normalizedSl / normalizedUnitsPerMove)
      : 0;
  const maxLookahead = Math.max(2, Math.floor(maxLookaheadBars));
  const startIndex = Math.max(2, Math.trunc(chunkBars));
  const maxSignalIndex = candles.length - 2 - maxLookahead;

  if (!(tpDistance > 0) || !(slDistance > 0) || maxSignalIndex < startIndex) {
    return [];
  }

  const rows: SeededLibraryTrade[] = [];

  for (let signalIndex = startIndex; signalIndex <= maxSignalIndex; signalIndex += 1) {
    const entryIndex = signalIndex + 1;
    const entryCandle = candles[entryIndex];
    if (!entryCandle || !Number.isFinite(entryCandle.open)) {
      continue;
    }

    const entryTimeMs = Number(entryCandle.time);
    if (!Number.isFinite(entryTimeMs)) {
      continue;
    }
    const entryTime = toUtcTimestamp(entryTimeMs);

    for (const direction of [1, -1] as const) {
      const entryPrice = Math.max(0.000001, entryCandle.open);
      const targetPrice = direction === 1 ? entryPrice + tpDistance : entryPrice - tpDistance;
      const stopPrice = direction === 1 ? entryPrice - slDistance : entryPrice + slDistance;
      const endIndex = Math.min(candles.length - 1, entryIndex + maxLookahead);
      let exitIndex = endIndex;
      let result: SeededLibraryTradeResult | null = null;

      for (let candleIndex = entryIndex; candleIndex <= endIndex; candleIndex += 1) {
        const candle = candles[candleIndex];
        if (!candle) {
          continue;
        }

        const tpHit = direction === 1 ? candle.high >= targetPrice : candle.low <= targetPrice;
        const slHit = direction === 1 ? candle.low <= stopPrice : candle.high >= stopPrice;

        if (tpHit && slHit) {
          exitIndex = candleIndex;
          result = "Loss";
          break;
        }
        if (slHit) {
          exitIndex = candleIndex;
          result = "Loss";
          break;
        }
        if (tpHit) {
          exitIndex = candleIndex;
          result = "Win";
          break;
        }
      }

      if (result == null) {
        const lastCandle = candles[endIndex];
        if (!lastCandle || !Number.isFinite(lastCandle.close)) {
          continue;
        }
        result = (lastCandle.close - entryPrice) * direction >= 0 ? "Win" : "Loss";
      }

      const exitTimeRawMs = Number(candles[exitIndex]?.time ?? entryTimeMs);
      const exitTime = Number.isFinite(exitTimeRawMs) ? toUtcTimestamp(exitTimeRawMs) : entryTime;
      const outcomePrice = result === "Win" ? targetPrice : stopPrice;
      const pnlUsd = result === "Win" ? normalizedTp : -normalizedSl;
      const pnlPct =
        entryPrice > 0
          ? direction === 1
            ? ((outcomePrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - outcomePrice) / entryPrice) * 100
          : 0;
      const side: SeededLibraryTradeSide = direction === 1 ? "Long" : "Short";
      const entryLabel = formatTimestamp(entryTime);
      const exitLabel = formatTimestamp(exitTime);

      rows.push({
        id: `seed-${String(signalIndex).padStart(6, "0")}-${direction === 1 ? "long" : "short"}`,
        symbol,
        side,
        result,
        entrySource: "Base Seeding",
        exitReason: result === "Win" ? "TP" : "SL",
        pnlPct,
        pnlUsd,
        time: entryLabel,
        entryAt: entryLabel,
        exitAt: exitLabel,
        entryTime,
        exitTime,
        entryPrice,
        targetPrice,
        stopPrice,
        outcomePrice,
        units: normalizedUnitsPerMove
      });
    }
  }

  return rows.sort(
    (left, right) =>
      Number(left.exitTime) - Number(right.exitTime) || left.id.localeCompare(right.id)
  );
};
