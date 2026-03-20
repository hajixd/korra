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
  minutePreciseEnabled: boolean;
  statsDateStart: string;
  statsDateEnd: string;
  chunkBars: number;
  maxBarsInTrade: number;
};

export const ONLINE_LEARNING_LIBRARY_ID = "core";
export const GHOST_LEARNING_LIBRARY_ID = "suppressed";
export const BASE_SEEDING_LIBRARY_IDS = new Set([
  "base",
  "tokyo",
  "sydney",
  "london",
  "newyork"
]);

export const AI_LIBRARY_SEED_LOOKAHEAD_BARS = 96;
export const AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS = 12000;

export const isBaseSeedingLibraryId = (libraryId: string): boolean => {
  return BASE_SEEDING_LIBRARY_IDS.has(String(libraryId || "").trim().toLowerCase());
};

export const isOnlineLearningLibraryId = (libraryId: string): boolean => {
  return String(libraryId || "").trim().toLowerCase() === ONLINE_LEARNING_LIBRARY_ID;
};

export const isGhostLearningLibraryId = (libraryId: string): boolean => {
  return String(libraryId || "").trim().toLowerCase() === GHOST_LEARNING_LIBRARY_ID;
};

export const isVisibleAizipLibraryId = (libraryId: string): boolean => {
  return !isOnlineLearningLibraryId(libraryId) && !isGhostLearningLibraryId(libraryId);
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
  return ids.some((libraryId) => String(libraryId ?? "").trim().length > 0);
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
