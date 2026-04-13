import {
  computeAntiCheatBacktestContext,
  collectCappedItems,
  getPanelAnalyticsSessionLabel,
  getPredicateRatePercent,
  rebalanceItemsToTargetPercent,
  resolveAiLibraryTargetBuyRate,
  resolveAiLibraryTargetWinRate,
  type PanelAnalyticsAiLibrarySettingValue,
  type PanelAnalyticsBacktestFilterSettings,
  type PanelAnalyticsHistoryItem,
  type PanelAnalyticsLibraryPointPayload
} from "../app/api/backtest/panel-analytics/route";
import {
  buildSeededLibraryTradePoolFromCandles,
  buildSyntheticLibraryCandles,
  getAizipLibraryIdAliases,
  getSyntheticLibraryBarCount,
  isBaseSeedingLibraryId,
  isGhostLearningLibraryId,
  isOnlineLearningLibraryId,
  normalizeAizipLibraryId,
  partitionAizipLibraryTradePool
} from "../app/aizipRuntime";
import { buildTradeNeighborVector } from "./aiEntryScoring";
import {
  AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT,
  AI_LIBRARY_DEFAULT_MAX_SAMPLES,
  AI_LIBRARY_DEFAULT_SEEDED_MAX_SAMPLES,
  AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW,
  AI_LIBRARY_MAX_SAMPLES
} from "./aiLibrarySettings";
import {
  computeStrategyNotificationReplayRows,
  filterStrategyNotificationTradesByDateRange,
  filterStrategyNotificationTradesBySessionBuckets,
  selectActiveStrategyNotificationSignal,
  tradePassesStrategyNotificationAiEntryThresholds,
  type StrategyNotificationCandle,
  type StrategyNotificationSettings
} from "./strategyNotificationEngine";

type NotificationLibrarySettings = Record<
  string,
  Record<string, PanelAnalyticsAiLibrarySettingValue>
>;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const createModelSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const createModelRuntimeId = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
};

const resolveRuntimeAiLibraryIds = (settings: StrategyNotificationSettings) => {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const rawLibraryId of Array.isArray(settings.selectedAiLibraries)
    ? settings.selectedAiLibraries
    : []) {
    const libraryId = normalizeAizipLibraryId(String(rawLibraryId ?? "").trim());
    if (!libraryId || libraryId === "recent" || seen.has(libraryId)) {
      continue;
    }
    seen.add(libraryId);
    cleaned.push(libraryId);
  }

  const legacyDefaultSelected =
    cleaned.length === 2 &&
    cleaned.includes("online") &&
    cleaned.includes("base");
  const legacyCoreOnly = cleaned.length === 1 && cleaned[0] === "online";
  const next = legacyDefaultSelected || legacyCoreOnly ? [] : cleaned;

  return next.length > 0 ? next : ["base"];
};

const resolveNotificationLibraryModelName = (
  settings: StrategyNotificationSettings,
  libraryId: string,
  selectedSettings?: Record<string, PanelAnalyticsAiLibrarySettingValue>
) => {
  const explicitModel = String(selectedSettings?.model ?? "").trim();
  if (explicitModel) {
    return explicitModel;
  }

  const normalizedLibraryId = normalizeAizipLibraryId(libraryId);
  for (const modelName of Object.keys(settings.aiModelStates ?? {})) {
    const normalizedModelName = String(modelName).trim();
    if (!normalizedModelName) {
      continue;
    }

    if (
      createModelSlug(normalizedModelName) === normalizedLibraryId ||
      createModelRuntimeId(normalizedModelName) === normalizedLibraryId.replace(/_/g, "-")
    ) {
      return normalizedModelName;
    }
  }

  return null;
};

const buildNotificationLibraryDefaultSettings = (
  settings: StrategyNotificationSettings,
  libraryId: string
): Record<string, PanelAnalyticsAiLibrarySettingValue> => {
  const normalizedLibraryId = normalizeAizipLibraryId(libraryId);
  const genericDefaults = {
    weight: 100,
    maxSamples: AI_LIBRARY_DEFAULT_MAX_SAMPLES,
    stride: 0
  } satisfies Record<string, PanelAnalyticsAiLibrarySettingValue>;

  if (
    normalizedLibraryId === "base" ||
    normalizedLibraryId === "tokyo" ||
    normalizedLibraryId === "sydney" ||
    normalizedLibraryId === "london" ||
    normalizedLibraryId === "newyork"
  ) {
    return {
      ...genericDefaults,
      maxSamples: AI_LIBRARY_DEFAULT_SEEDED_MAX_SAMPLES,
      tpDollars: 250,
      slDollars: 250,
      jumpToResolution: false
    };
  }

  if (normalizedLibraryId === "terrific" || normalizedLibraryId === "terrible") {
    return {
      ...genericDefaults,
      count: AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT,
      pivotSpan: 4
    };
  }

  const selectedSettings =
    settings.selectedAiLibrarySettings?.[normalizedLibraryId] ??
    settings.selectedAiLibrarySettings?.[libraryId];
  const modelName = resolveNotificationLibraryModelName(
    settings,
    normalizedLibraryId,
    selectedSettings
  );

  if (modelName) {
    return {
      ...genericDefaults,
      model: modelName,
      kind: "model_sim"
    };
  }

  return genericDefaults;
};

const resolveNotificationLibrarySettings = (
  settings: StrategyNotificationSettings,
  libraryId: string
) => {
  const normalizedLibraryId = normalizeAizipLibraryId(libraryId);
  const defaultSettings = buildNotificationLibraryDefaultSettings(settings, normalizedLibraryId);
  const merged: Record<string, PanelAnalyticsAiLibrarySettingValue> = {
    ...defaultSettings
  };

  for (const lookupId of [
    ...getAizipLibraryIdAliases(normalizedLibraryId).filter((id) => id !== normalizedLibraryId),
    normalizedLibraryId
  ]) {
    const candidate = settings.selectedAiLibrarySettings?.[lookupId];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    Object.assign(merged, candidate);
  }

  return merged;
};

const buildPanelAnalyticsLibraryDefaultsById = (
  settings: StrategyNotificationSettings,
  libraryIds: readonly string[]
) => {
  const next: NotificationLibrarySettings = {};
  const allIds = new Set<string>([
    ...libraryIds,
    ...Object.keys(settings.selectedAiLibrarySettings ?? {}).map((id) =>
      normalizeAizipLibraryId(String(id ?? "").trim())
    )
  ]);

  for (const libraryId of allIds) {
    const normalizedLibraryId = normalizeAizipLibraryId(String(libraryId ?? "").trim());
    if (!normalizedLibraryId) {
      continue;
    }

    const defaults = buildNotificationLibraryDefaultSettings(settings, normalizedLibraryId);
    next[normalizedLibraryId] = defaults;

    for (const aliasId of getAizipLibraryIdAliases(normalizedLibraryId)) {
      next[aliasId] = defaults;
    }
  }

  return next;
};

const buildPanelAnalyticsFilterSettings = (
  settings: StrategyNotificationSettings,
  libraryIds: readonly string[]
): PanelAnalyticsBacktestFilterSettings => {
  return {
    statsDateStart: settings.statsDateStart,
    statsDateEnd: settings.statsDateEnd,
    inPreciseEnabled: settings.inPreciseEnabled,
    enabledBacktestWeekdays: [...settings.enabledBacktestWeekdays],
    enabledBacktestSessions: [...settings.enabledBacktestSessions],
    enabledBacktestMonths: [...settings.enabledBacktestMonths],
    enabledBacktestHours: [...settings.enabledBacktestHours],
    aiMode: settings.aiMode,
    antiCheatEnabled: settings.antiCheatEnabled,
    validationMode: settings.validationMode,
    selectedAiLibraries: [...libraryIds],
    selectedAiLibrarySettings: settings.selectedAiLibrarySettings,
    distanceMetric: settings.distanceMetric,
    knnNeighborSpace: settings.knnNeighborSpace,
    ancThreshold: settings.ancThreshold,
    kEntry: settings.kEntry,
    knnVoteMode: settings.knnVoteMode,
    selectedAiDomains: [...settings.selectedAiDomains],
    remapOppositeOutcomes: settings.remapOppositeOutcomes
  };
};

const resolveLibraryDollarValue = (
  value: PanelAnalyticsAiLibrarySettingValue | undefined,
  fallback: number
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const shouldUseSyntheticLibraryHistory = (
  settings: StrategyNotificationSettings,
  libraryId: string
) => {
  return (
    settings.antiCheatEnabled &&
    settings.validationMode === "synthetic" &&
    !isOnlineLearningLibraryId(libraryId) &&
    !isGhostLearningLibraryId(libraryId)
  );
};

const buildSyntheticLibraryCandlesForSettings = (
  settings: StrategyNotificationSettings,
  tpDollars: number,
  slDollars: number,
  kind: "seed" | "strategy"
): StrategyNotificationCandle[] => {
  const enabledModelKey = Object.entries(settings.aiModelStates ?? {})
    .filter(([, state]) => Number(state ?? 0) > 0)
    .map(([name, state]) => `${createModelRuntimeId(name)}:${Number(state ?? 0)}`)
    .join(",") || "none";

  return buildSyntheticLibraryCandles({
    seedText: [
      "synthetic-library",
      `kind:${kind}`,
      `sym:${settings.symbol}`,
      `tf:${settings.timeframe}`,
      `ptf:${settings.precisionTimeframe}`,
      `bars:${settings.chunkBars}`,
      `models:${enabledModelKey}`,
      `tp:${Math.round(Number(tpDollars) || 0)}`,
      `sl:${Math.round(Number(slDollars) || 0)}`
    ].join("|"),
    candleCount: getSyntheticLibraryBarCount(settings.chunkBars)
  });
};

const buildSeededPoolFromCandles = (
  candles: readonly StrategyNotificationCandle[],
  settings: StrategyNotificationSettings,
  tpDollars: number,
  slDollars: number
): PanelAnalyticsHistoryItem[] => {
  return buildSeededLibraryTradePoolFromCandles({
    candles,
    symbol: settings.symbol,
    unitsPerMove: settings.dollarsPerMove,
    tpDollars,
    slDollars,
    chunkBars: settings.chunkBars,
    formatTimestamp: (timestampSeconds) =>
      new Date(Math.floor(timestampSeconds) * 1000).toISOString()
  }) as PanelAnalyticsHistoryItem[];
};

const buildStrategyPoolFromCandles = (args: {
  candles: readonly StrategyNotificationCandle[];
  oneMinuteCandles?: readonly StrategyNotificationCandle[];
  settings: StrategyNotificationSettings;
  tpDollars: number;
  slDollars: number;
}) => {
  return [...computeStrategyNotificationReplayRows({
    candles: [...args.candles],
    oneMinuteCandles: args.oneMinuteCandles ? [...args.oneMinuteCandles] : undefined,
    settings: args.settings,
    tpDollarsOverride: args.tpDollars,
    slDollarsOverride: args.slDollars
  })]
    .sort(
      (left, right) =>
        Number(left.exitTime) - Number(right.exitTime) ||
        left.id.localeCompare(right.id)
    ) as PanelAnalyticsHistoryItem[];
};

const filterLibraryCandidatePool = (
  pool: PanelAnalyticsHistoryItem[],
  settings: StrategyNotificationSettings,
  options?: { skipTemporalBuckets?: boolean }
) => {
  const dateFiltered = filterStrategyNotificationTradesByDateRange(
    pool,
    settings.statsDateStart,
    settings.statsDateEnd
  ) as PanelAnalyticsHistoryItem[];

  if (options?.skipTemporalBuckets) {
    return dateFiltered;
  }

  return filterStrategyNotificationTradesBySessionBuckets(
    dateFiltered,
    settings
  ) as PanelAnalyticsHistoryItem[];
};

const buildLibraryExecutedTradeIds = (
  pool: PanelAnalyticsHistoryItem[],
  settings: StrategyNotificationSettings
) => {
  if (settings.aiMode === "off") {
    return new Set(pool.map((trade) => trade.id));
  }

  const ids = new Set<string>();
  for (const trade of pool) {
    if (tradePassesStrategyNotificationAiEntryThresholds(trade, settings)) {
      ids.add(trade.id);
    }
  }
  return ids;
};

const applyStrideToItems = <T,>(items: readonly T[], strideRaw: number): T[] => {
  const stride = Math.max(1, Math.floor(Number(strideRaw) || 1));
  if (stride <= 1) {
    return [...items];
  }

  const next: T[] = [];
  for (let index = 0; index < items.length; index += stride) {
    next.push(items[index]!);
  }
  return next;
};

const applyLibraryJumpToResolution = (pool: PanelAnalyticsHistoryItem[]) => {
  if (pool.length <= 1) {
    return pool;
  }

  const ordered = [...pool].sort(
    (left, right) =>
      Number(left.entryTime) - Number(right.entryTime) ||
      Number(left.exitTime) - Number(right.exitTime) ||
      left.id.localeCompare(right.id)
  );
  const selected: PanelAnalyticsHistoryItem[] = [];
  let lastExit = Number.NEGATIVE_INFINITY;

  for (const trade of ordered) {
    const entrySec = Number(trade.entryTime);
    const exitSec = Number(trade.exitTime);

    if (!Number.isFinite(entrySec) || !Number.isFinite(exitSec) || entrySec < lastExit) {
      continue;
    }

    selected.push(trade);
    lastExit = exitSec;
  }

  return selected;
};

const buildLibraryPointPayloads = (args: {
  libraryId: string;
  librarySettings: Record<string, PanelAnalyticsAiLibrarySettingValue>;
  libraryCandidatePool: PanelAnalyticsHistoryItem[];
  executedTradeIds: Set<string>;
  settings: StrategyNotificationSettings;
}) => {
  const {
    libraryId,
    librarySettings,
    libraryCandidatePool,
    executedTradeIds,
    settings
  } = args;
  const stride = clamp(
    Math.floor(Number(librarySettings.stride ?? 0) || 0),
    0,
    5000
  );
  const maxSamples = clamp(
    Math.floor(
      Number(librarySettings.maxSamples ?? AI_LIBRARY_DEFAULT_MAX_SAMPLES) ||
        AI_LIBRARY_DEFAULT_MAX_SAMPLES
    ),
    0,
    AI_LIBRARY_MAX_SAMPLES
  );
  const normalizedLibraryId = normalizeAizipLibraryId(libraryId);
  const { accepted: executedTradePool, rejected: suppressedTradePool } =
    partitionAizipLibraryTradePool(libraryCandidatePool, executedTradeIds);
  let source: PanelAnalyticsHistoryItem[] = [];

  if (isOnlineLearningLibraryId(normalizedLibraryId)) {
    source = collectCappedItems(executedTradePool, {
      cap: maxSamples,
      stride
    });
  } else if (isGhostLearningLibraryId(normalizedLibraryId)) {
    source = collectCappedItems(suppressedTradePool, {
      cap: maxSamples,
      stride
    });
  } else if (normalizedLibraryId === "terrific") {
    const count = clamp(
      Math.floor(
        Number(librarySettings.count ?? AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT) ||
          AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT
      ),
      0,
      AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW
    );
    const capped = collectCappedItems(libraryCandidatePool, {
      cap: Math.min(maxSamples, count)
    });
    source = applyStrideToItems(
      [...capped].sort((left, right) => left.pnlUsd - right.pnlUsd).reverse(),
      stride
    );
  } else if (normalizedLibraryId === "terrible") {
    const count = clamp(
      Math.floor(
        Number(librarySettings.count ?? AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT) ||
          AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT
      ),
      0,
      AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW
    );
    const capped = collectCappedItems(libraryCandidatePool, {
      cap: Math.min(maxSamples, count)
    });
    source = applyStrideToItems(
      [...capped].sort((left, right) => left.pnlUsd - right.pnlUsd),
      stride
    );
  } else if (librarySettings.kind === "model_sim") {
    const targetModel = String(librarySettings.model ?? "").trim();
    const targetModelId = createModelRuntimeId(targetModel);
    source = collectCappedItems(libraryCandidatePool, {
      cap: maxSamples,
      stride,
      predicate: (trade) => createModelRuntimeId(trade.entrySource || "") === targetModelId
    });
  } else if (isBaseSeedingLibraryId(normalizedLibraryId)) {
    const sessionFilter =
      normalizedLibraryId === "tokyo"
        ? "Tokyo"
        : normalizedLibraryId === "sydney"
          ? "Sydney"
          : normalizedLibraryId === "london"
            ? "London"
            : normalizedLibraryId === "newyork"
              ? "New York"
              : null;
    let baseSource = sessionFilter
      ? libraryCandidatePool.filter(
          (trade) => getPanelAnalyticsSessionLabel(trade.entryTime) === sessionFilter
        )
      : libraryCandidatePool;

    if (Boolean(librarySettings.jumpToResolution)) {
      baseSource = applyLibraryJumpToResolution(baseSource);
    }

    source = collectCappedItems(baseSource, {
      cap: maxSamples,
      stride
    });
  } else {
    source = collectCappedItems(libraryCandidatePool, {
      cap: maxSamples,
      stride
    });
  }

  const preferFront =
    normalizedLibraryId === "terrific" || normalizedLibraryId === "terrible";
  const baselineWinRate = getPredicateRatePercent(
    source,
    (trade) => trade.result === "Win"
  );
  const targetWinRate = resolveAiLibraryTargetWinRate(
    librarySettings,
    baselineWinRate,
    source.length
  );
  const outcomeBalanced = rebalanceItemsToTargetPercent(
    source,
    maxSamples,
    targetWinRate,
    (trade) => trade.result === "Win",
    preferFront
  );
  const baselineBuyRate = getPredicateRatePercent(
    outcomeBalanced,
    (trade) => trade.side === "Long"
  );
  const targetBuyRate = resolveAiLibraryTargetBuyRate(
    librarySettings,
    baselineBuyRate,
    outcomeBalanced.length
  );
  const balanced = rebalanceItemsToTargetPercent(
    outcomeBalanced,
    maxSamples,
    targetBuyRate,
    (trade) => trade.side === "Long",
    preferFront
  );

  return balanced.map<PanelAnalyticsLibraryPointPayload>((trade, sourceIndex) => {
    const resolvedModelName =
      librarySettings.kind === "model_sim" && String(librarySettings.model ?? "").trim().length > 0
        ? String(librarySettings.model ?? "").trim()
        : trade.entrySource.trim() || "Momentum";
    const vector = buildTradeNeighborVector(trade, {
      inPreciseEnabled: settings.inPreciseEnabled
    });

    return {
      id: `lib|${normalizedLibraryId}|${trade.id}|${sourceIndex}`,
      uid: `lib|${normalizedLibraryId}|${trade.id}|${sourceIndex}`,
      libId: normalizedLibraryId,
      metaModel: resolvedModelName,
      model: resolvedModelName,
      entryTime: Number(trade.entryTime),
      metaTime: Number(trade.entryTime),
      metaSession: getPanelAnalyticsSessionLabel(Number(trade.entryTime)),
      dir: trade.side === "Long" ? 1 : -1,
      label: trade.result === "Win" ? 1 : -1,
      result: trade.result === "Win" ? "TP" : "SL",
      metaOutcome: trade.result,
      pnl: trade.pnlUsd,
      metaPnl: trade.pnlUsd,
      v: vector
    };
  });
};

export const computeStrategyNotificationRowsWithAiLibraries = (args: {
  candles: StrategyNotificationCandle[];
  oneMinuteCandles?: StrategyNotificationCandle[];
  settings: StrategyNotificationSettings;
}) => {
  const { candles, oneMinuteCandles, settings } = args;
  const replayRows = computeStrategyNotificationReplayRows({
    candles,
    oneMinuteCandles,
    settings
  }) as PanelAnalyticsHistoryItem[];

  if (replayRows.length === 0) {
    return [] as PanelAnalyticsHistoryItem[];
  }

  const runtimeLibraryIds = resolveRuntimeAiLibraryIds(settings);
  const libraryPoints: PanelAnalyticsLibraryPointPayload[] = [];

  for (const libraryId of runtimeLibraryIds) {
    const normalizedLibraryId = normalizeAizipLibraryId(libraryId);
    const librarySettings = resolveNotificationLibrarySettings(settings, normalizedLibraryId);
    const tpDollars = isBaseSeedingLibraryId(normalizedLibraryId)
      ? resolveLibraryDollarValue(librarySettings.tpDollars, settings.tpDollars)
      : settings.tpDollars;
    const slDollars = isBaseSeedingLibraryId(normalizedLibraryId)
      ? resolveLibraryDollarValue(librarySettings.slDollars, settings.slDollars)
      : settings.slDollars;
    const useSyntheticPool = shouldUseSyntheticLibraryHistory(settings, normalizedLibraryId);

    const rawPool = useSyntheticPool
      ? isBaseSeedingLibraryId(normalizedLibraryId)
        ? buildSeededPoolFromCandles(
            buildSyntheticLibraryCandlesForSettings(
              settings,
              tpDollars,
              slDollars,
              "seed"
            ),
            settings,
            tpDollars,
            slDollars
          )
        : buildStrategyPoolFromCandles({
            candles: buildSyntheticLibraryCandlesForSettings(
              settings,
              tpDollars,
              slDollars,
              "strategy"
            ),
            settings,
            tpDollars,
            slDollars
          })
      : isBaseSeedingLibraryId(normalizedLibraryId)
        ? buildSeededPoolFromCandles(candles, settings, tpDollars, slDollars)
        : buildStrategyPoolFromCandles({
            candles,
            oneMinuteCandles,
            settings,
            tpDollars,
            slDollars
          });

    const libraryCandidatePool = filterLibraryCandidatePool(rawPool, settings, {
      skipTemporalBuckets: isBaseSeedingLibraryId(normalizedLibraryId)
    });
    const executedTradeIds = buildLibraryExecutedTradeIds(
      libraryCandidatePool,
      settings
    );

    libraryPoints.push(
      ...buildLibraryPointPayloads({
        libraryId: normalizedLibraryId,
        librarySettings,
        libraryCandidatePool,
        executedTradeIds,
        settings
      })
    );
  }

  const backtestContext = computeAntiCheatBacktestContext({
    panelSourceTrades: replayRows,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: buildPanelAnalyticsFilterSettings(
      settings,
      runtimeLibraryIds
    ),
    aiLibraryDefaultsById: buildPanelAnalyticsLibraryDefaultsById(
      settings,
      runtimeLibraryIds
    )
  });

  return backtestContext.timeFilteredTrades
    .filter((trade) => tradePassesStrategyNotificationAiEntryThresholds(trade, settings))
    .sort(
      (left, right) =>
        Number(right.entryTime) - Number(left.entryTime) ||
        Number(right.exitTime) - Number(left.exitTime) ||
        left.id.localeCompare(right.id)
    );
};

export const computeActiveStrategyNotificationSignalWithAiLibraries = (args: {
  candles: StrategyNotificationCandle[];
  oneMinuteCandles?: StrategyNotificationCandle[];
  settings: StrategyNotificationSettings;
}) => {
  const rows = computeStrategyNotificationRowsWithAiLibraries(args);
  if (rows.length === 0) {
    return null;
  }

  return selectActiveStrategyNotificationSignal({
    rows,
    candles: args.candles,
    settings: args.settings
  });
};
