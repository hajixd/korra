import {
  computeAverageNeighborContributionAtEntryScore,
  computeNeighborConfidenceScore,
  resolveExplicitAiConfidenceScore
} from "./aiConfidence";
import { getTradeConfidenceScore as getSharedTradeConfidenceScore } from "./aiEntryScoring";
import {
  computeBacktestHistoryRowsChunk,
  finalizeBacktestHistoryRows,
  type BacktestHistoryCandle,
  type BacktestHistoryRow,
  type BacktestHistoryTradeBlueprint
} from "../app/backtestHistoryShared";
import { resolveStrategyRuntimeModelProfile } from "./strategyCatalog";
import { buildStrategyReplayTradeBlueprints, type StrategyReplayModelProfile } from "./strategyModelBacktest";

type ModelProfile = StrategyReplayModelProfile;
type StrategyNotificationLibrarySettingValue = boolean | number | string;

export type StrategyNotificationSettings = {
  symbol: string;
  timeframe: "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
  precisionTimeframe: "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
  minutePreciseEnabled: boolean;
  aiMode: "off" | "knn" | "hdbscan";
  aiFilterEnabled: boolean;
  inPreciseEnabled: boolean;
  statsDateStart: string;
  statsDateEnd: string;
  enabledBacktestWeekdays: string[];
  enabledBacktestSessions: string[];
  enabledBacktestMonths: number[];
  enabledBacktestHours: number[];
  confidenceThreshold: number;
  aiExitStrictness: number;
  aiExitLossTolerance: number;
  aiExitWinTolerance: number;
  useMitExit: boolean;
  ancThreshold: number;
  dollarsPerMove: number;
  chunkBars: number;
  maxBarsInTrade: number;
  maxConcurrentTrades: number;
  tpDollars: number;
  slDollars: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
  aiModelStates: Record<string, number>;
  aiFeatureLevels: Record<string, number>;
  aiFeatureModes: Record<string, string>;
  selectedAiLibraries: string[];
  selectedAiLibrarySettings: Record<string, Record<string, StrategyNotificationLibrarySettingValue>>;
  distanceMetric: "euclidean" | "cosine" | "manhattan" | "chebyshev";
  knnNeighborSpace: "high" | "post" | "3d" | "2d";
  selectedAiDomains: string[];
  remapOppositeOutcomes: boolean;
  dimensionAmount: number;
  compressionMethod: "umap" | "pca" | "jl" | "hash" | "variance" | "subsample";
  kEntry: number;
  kExit: number;
  knnVoteMode: "distance" | "majority";
  hdbMinClusterSize: number;
  hdbMinSamples: number;
  hdbEpsQuantile: number;
  staticLibrariesClusters: boolean;
  antiCheatEnabled: boolean;
  validationMode: "off" | "split" | "synthetic";
};

type StrategyNotificationCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
  volume?: number;
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

const buildModelProfilesFromStates = (aiModelStates: Record<string, number>): ModelProfile[] => {
  const selectedNames = Object.entries(aiModelStates ?? {})
    .filter(([, state]) => Number(state ?? 0) > 0)
    .map(([name]) => String(name).trim())
    .filter((name) => name.length > 0);
  const seen = new Set<string>();
  const profiles: ModelProfile[] = [];

  for (const name of selectedNames) {
    const catalogProfile = resolveStrategyRuntimeModelProfile(name);
    const modelId = catalogProfile?.id ?? createModelId(name);

    if (seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    profiles.push(
      catalogProfile
        ? {
            id: catalogProfile.id,
            name: catalogProfile.name,
            riskMin: catalogProfile.riskMin,
            riskMax: catalogProfile.riskMax,
            rrMin: catalogProfile.rrMin,
            rrMax: catalogProfile.rrMax,
            longBias: catalogProfile.longBias
          }
        : createSyntheticModelProfile(name)
    );
  }

  return profiles;
};

const usesEveryBarMode = (aiMode: StrategyNotificationSettings["aiMode"], aiFilterEnabled: boolean) => {
  return false;
};

const toStrategyReplayModels = (models: readonly ModelProfile[], aiModelStates: Record<string, number>) => {
  return models.map((model) => {
    const rawState = aiModelStates[model.name] ?? aiModelStates[model.id] ?? 0;
    const state = (rawState > 1 ? 2 : rawState > 0 ? 1 : 0) as 0 | 1 | 2;

    return {
      id: model.id,
      name: model.name,
      riskMin: model.riskMin,
      riskMax: model.riskMax,
      rrMin: model.rrMin,
      rrMax: model.rrMax,
      longBias: model.longBias,
      state
    };
  });
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

const toBacktestCandles = (candles: StrategyNotificationCandle[]): BacktestHistoryCandle[] => {
  return candles.map((candle) => ({
    open: candle.open,
    close: candle.close,
    high: candle.high,
    low: candle.low,
    time: candle.time
  }));
};

const getTradeConfidenceScore = (
  trade: BacktestHistoryRow,
  settings?: Pick<StrategyNotificationSettings, "inPreciseEnabled">
): number => {
  return getSharedTradeConfidenceScore(trade, {
    inPreciseEnabled: settings?.inPreciseEnabled === true
  });
};

const getTradeAverageNeighborContributionAtEntryScore = (trade: BacktestHistoryRow): number | null => {
  const explicit = resolveExplicitAiConfidenceScore(
    { averageNeighborContributionAtEntry: trade.averageNeighborContributionAtEntry },
    ["averageNeighborContributionAtEntry"]
  );
  if (explicit != null) {
    return explicit;
  }

  return computeAverageNeighborContributionAtEntryScore(
    Array.isArray(trade.entryNeighbors) ? trade.entryNeighbors : []
  );
};

const getUtcDayStartMsFromYmd = (ymd: string): number | null => {
  if (!ymd) {
    return null;
  }
  const value = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(value) ? value : null;
};

const getUtcDayEndExclusiveMsFromYmd = (ymd: string): number | null => {
  const startMs = getUtcDayStartMsFromYmd(ymd);
  return startMs == null ? null : startMs + 86_400_000;
};

const getWeekdayLabel = (timestampSeconds: number): string => {
  const date = new Date(Number(timestampSeconds) * 1000);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()] ?? "Sun";
};

const getSessionLabel = (timestampSeconds: number): string => {
  const date = new Date(Number(timestampSeconds) * 1000);

  if (Number.isNaN(date.getTime())) {
    return "Sydney";
  }

  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;

  if (hour >= 16 || hour < 1) {
    return "Tokyo";
  }

  if (hour >= 12 && hour < 21) {
    return "Sydney";
  }

  if (hour >= 0 && hour < 9) {
    return "London";
  }

  if (hour >= 5 && hour < 14) {
    return "New York";
  }

  return "London";
};

const filterTradesByDateRange = (
  trades: BacktestHistoryRow[],
  startYmd: string,
  endYmd: string
): BacktestHistoryRow[] => {
  const startMs = getUtcDayStartMsFromYmd(startYmd);
  const endExclusiveMs = getUtcDayEndExclusiveMsFromYmd(endYmd);

  return trades.filter((trade) => {
    const tradeMs = Number(trade.entryTime) * 1000;
    if (!Number.isFinite(tradeMs)) {
      return false;
    }
    if (startMs !== null && tradeMs < startMs) {
      return false;
    }
    if (endExclusiveMs !== null && tradeMs >= endExclusiveMs) {
      return false;
    }
    return true;
  });
};

const filterTradesBySessionBuckets = (
  trades: BacktestHistoryRow[],
  settings: Pick<
    StrategyNotificationSettings,
    | "enabledBacktestWeekdays"
    | "enabledBacktestSessions"
    | "enabledBacktestMonths"
    | "enabledBacktestHours"
  >
): BacktestHistoryRow[] => {
  return trades.filter((trade) => {
    const weekday = getWeekdayLabel(trade.exitTime);
    const session = getSessionLabel(trade.entryTime);
    const exitDate = new Date(Number(trade.exitTime) * 1000);
    const monthIndex = exitDate.getUTCMonth();
    const entryHour = new Date(Number(trade.entryTime) * 1000).getUTCHours();

    return (
      settings.enabledBacktestWeekdays.includes(weekday) &&
      settings.enabledBacktestSessions.includes(session) &&
      settings.enabledBacktestMonths.includes(monthIndex) &&
      settings.enabledBacktestHours.includes(entryHour)
    );
  });
};

const tradePassesAiEntryThresholds = (trade: BacktestHistoryRow, settings: StrategyNotificationSettings) => {
  if (settings.aiMode === "off") {
    return true;
  }

  if (settings.confidenceThreshold > 0) {
    const neighborConfidence = computeNeighborConfidenceScore(
      Array.isArray(trade.entryNeighbors) ? trade.entryNeighbors : []
    );
    const explicitConfidence = resolveExplicitAiConfidenceScore(trade);
    const confidence =
      (explicitConfidence ?? neighborConfidence ?? getTradeConfidenceScore(trade, settings)) * 100;

    if (!Number.isFinite(confidence) || confidence < settings.confidenceThreshold) {
      return false;
    }
  }

  if (settings.ancThreshold > 0) {
    const anc = getTradeAverageNeighborContributionAtEntryScore(trade);
    if (anc == null || anc * 100 < settings.ancThreshold) {
      return false;
    }
  }

  return true;
};

const computeStrategyNotificationRows = (args: {
  candles: StrategyNotificationCandle[];
  oneMinuteCandles?: StrategyNotificationCandle[];
  settings: StrategyNotificationSettings;
}): BacktestHistoryRow[] => {
  const { candles, oneMinuteCandles, settings } = args;

  if (candles.length < 48) {
    return [];
  }

  const modelProfiles = buildModelProfilesFromStates(settings.aiModelStates);
  if (modelProfiles.length === 0) {
    return [];
  }

  const blueprints = buildStrategyReplayTradeBlueprints({
    candles,
    models: toStrategyReplayModels(modelProfiles, settings.aiModelStates),
    symbol: settings.symbol,
    unitsPerMove: settings.dollarsPerMove,
    chunkBars: settings.chunkBars,
    entryMode: usesEveryBarMode(settings.aiMode, settings.aiFilterEnabled) ? "every-bar" : "signals",
    tpDollars: settings.tpDollars,
    slDollars: settings.slDollars,
    stopMode: settings.stopMode,
    breakEvenTriggerPct: settings.breakEvenTriggerPct,
    trailingStartPct: settings.trailingStartPct,
    trailingDistPct: settings.trailingDistPct,
    maxBarsInTrade: settings.maxBarsInTrade
  });

  const constrainedBlueprints = enforceMaxConcurrentTradeBlueprints(
    blueprints,
    settings.maxConcurrentTrades
  );
  if (constrainedBlueprints.length === 0) {
    return [];
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
      oneMinuteCandlesBySymbol:
        settings.minutePreciseEnabled && Array.isArray(oneMinuteCandles) && oneMinuteCandles.length > 0
          ? {
              [settings.symbol]: toBacktestCandles(oneMinuteCandles)
            }
          : undefined,
      minutePreciseEnabled:
        settings.minutePreciseEnabled &&
        Array.isArray(oneMinuteCandles) &&
        oneMinuteCandles.length > 0,
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
    return [];
  }

  return filterTradesBySessionBuckets(
    filterTradesByDateRange(rows, settings.statsDateStart, settings.statsDateEnd),
    settings
  )
    .filter((trade) => tradePassesAiEntryThresholds(trade, settings))
    .sort(
      (left, right) =>
        right.entryTime - left.entryTime ||
        right.exitTime - left.exitTime ||
        left.id.localeCompare(right.id)
    );
};

export const computeActiveStrategyNotificationSignal = (args: {
  candles: StrategyNotificationCandle[];
  oneMinuteCandles?: StrategyNotificationCandle[];
  settings: StrategyNotificationSettings;
}): BacktestHistoryRow | null => {
  const { candles, settings, oneMinuteCandles } = args;
  const rows = computeStrategyNotificationRows({
    candles,
    oneMinuteCandles,
    settings
  });

  if (rows.length === 0) {
    return null;
  }

  return selectActiveStrategyNotificationSignal({
    rows,
    candles,
    settings
  });
};

export const selectActiveStrategyNotificationSignal = (args: {
  rows: BacktestHistoryRow[];
  candles: StrategyNotificationCandle[];
  settings: StrategyNotificationSettings;
}): BacktestHistoryRow | null => {
  const { rows, candles, settings } = args;
  const activeThresholdsSec = candles
    .slice(-3)
    .map((candle) => Math.floor(Number(candle.time) / 1000))
    .filter((value) => Number.isFinite(value));

  const activeRows = rows
    .filter(
      (row) =>
        activeThresholdsSec.some(
          (activeThresholdSec) =>
            row.entryTime <= activeThresholdSec &&
            row.exitTime > activeThresholdSec
        ) &&
        tradePassesAiEntryThresholds(row, settings)
    )
    .sort(
      (left, right) =>
        right.entryTime - left.entryTime ||
        right.exitTime - left.exitTime ||
        left.id.localeCompare(right.id)
    );

  return activeRows[0] ?? null;
};
