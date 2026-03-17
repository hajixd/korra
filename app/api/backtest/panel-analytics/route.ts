import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AiLibrarySettingValue = boolean | number | string;
type AiLibrarySettings = Record<string, Record<string, AiLibrarySettingValue>>;

type HistoryItem = {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  result: "Win" | "Loss";
  entrySource: string;
  pnlPct: number;
  pnlUsd: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
};

type BacktestFilterSettings = {
  statsDateStart: string;
  statsDateEnd: string;
  enabledBacktestWeekdays: string[];
  enabledBacktestSessions: string[];
  enabledBacktestMonths: number[];
  enabledBacktestHours: number[];
  aiMode: "off" | "knn" | "hdbscan";
  antiCheatEnabled: boolean;
  validationMode: "off" | "split" | "online" | "synthetic";
  selectedAiLibraries: string[];
  selectedAiLibrarySettings: AiLibrarySettings;
};

type PanelAnalyticsResponseBody = {
  dateFilteredTrades: HistoryItem[];
  libraryCandidateTrades: HistoryItem[];
  timeFilteredTrades: HistoryItem[];
  confidenceByIdEntries: Array<[string, number]>;
  chartPanelHistoryRows: HistoryItem[];
  activePanelHistoryRows: HistoryItem[];
};

const AI_LIBRARY_TARGET_WIN_RATE_KEY = "targetWinRate";
const AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY = "targetWinRateMode";

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

const getUtcDayStartMs = (ymd: string): number | null => {
  if (!ymd) {
    return null;
  }

  const value = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(value) ? value : null;
};

const getUtcDayEndExclusiveMs = (ymd: string): number | null => {
  const startMs = getUtcDayStartMs(ymd);
  if (startMs === null) {
    return null;
  }

  return startMs + 86_400_000;
};

const getTradeDayKey = (timestampSeconds: number): string => {
  return new Date(Number(timestampSeconds) * 1000).toISOString().slice(0, 10);
};

const getTradeMonthIndex = (timestampSeconds: number): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCMonth();
};

const getTradeHour = (timestampSeconds: number): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCHours();
};

const getWeekdayLabel = (dateKey: string): string => {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
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

const getAiLibraryTargetWinRateMode = (
  value: AiLibrarySettingValue | undefined
): "natural" | "artificial" => {
  return value === "artificial" ? "artificial" : "natural";
};

const getNaturalAiLibraryTargetWinRate = (
  baselineWinRate: number,
  loadedNeighborCount: number
): number => {
  if (loadedNeighborCount <= 0 || !Number.isFinite(baselineWinRate)) {
    return 50;
  }

  return clamp(baselineWinRate, 0, 100);
};

const resolveAiLibraryTargetWinRate = (
  settings: Record<string, AiLibrarySettingValue>,
  baselineWinRate: number,
  loadedNeighborCount: number
): number => {
  const mode = getAiLibraryTargetWinRateMode(settings[AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]);

  if (mode === "natural") {
    return getNaturalAiLibraryTargetWinRate(baselineWinRate, loadedNeighborCount);
  }

  const rawTargetWinRate = Number(settings[AI_LIBRARY_TARGET_WIN_RATE_KEY]);
  return Number.isFinite(rawTargetWinRate)
    ? clamp(rawTargetWinRate, 0, 100)
    : clamp(baselineWinRate, 0, 100);
};

const getOutcomeWinRatePercent = <T,>(
  items: readonly T[],
  isWin: (item: T) => boolean
): number => {
  if (items.length === 0) {
    return 50;
  }

  let wins = 0;

  for (const item of items) {
    if (isWin(item)) {
      wins += 1;
    }
  }

  return (wins / items.length) * 100;
};

const findTargetBalancedOutcomeCounts = (
  winCount: number,
  lossCount: number,
  maxSamples: number,
  targetWinRatePercent: number
) => {
  const availableWins = Math.max(0, Math.floor(Number(winCount) || 0));
  const availableLosses = Math.max(0, Math.floor(Number(lossCount) || 0));
  const totalCap = Math.min(
    Math.max(0, Math.floor(Number(maxSamples) || 0)),
    availableWins + availableLosses
  );

  if (totalCap <= 0) {
    return { winCount: 0, lossCount: 0 };
  }

  const target = clamp(targetWinRatePercent, 0, 100) / 100;
  let bestWins = 0;
  let bestTotal = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let total = totalCap; total >= 1; total -= 1) {
    const minWins = Math.max(0, total - availableLosses);
    const maxWins = Math.min(availableWins, total);
    let candidateWins = Math.round(target * total);
    candidateWins = clamp(candidateWins, minWins, maxWins);
    const diff = Math.abs(candidateWins / total - target);

    if (diff < bestDiff - 1e-9) {
      bestDiff = diff;
      bestWins = candidateWins;
      bestTotal = total;
    }
  }

  return {
    winCount: bestWins,
    lossCount: Math.max(0, bestTotal - bestWins)
  };
};

const rebalanceItemsToTargetWinRate = <T,>(
  items: readonly T[],
  maxSamples: number,
  targetWinRatePercent: number,
  isWin: (item: T) => boolean,
  preferFront = false
): T[] => {
  const cap = Math.max(0, Math.floor(Number(maxSamples) || 0));

  if (cap <= 0 || items.length === 0) {
    return [];
  }

  const indexedItems = items.map((item, index) => ({
    item,
    index,
    win: isWin(item)
  }));
  const orderedItems = preferFront ? indexedItems : [...indexedItems].reverse();
  const wins = orderedItems.filter((entry) => entry.win);
  const losses = orderedItems.filter((entry) => !entry.win);
  const balancedCounts = findTargetBalancedOutcomeCounts(
    wins.length,
    losses.length,
    cap,
    targetWinRatePercent
  );

  return [...wins.slice(0, balancedCounts.winCount), ...losses.slice(0, balancedCounts.lossCount)]
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);
};

const collectCappedItems = <T,>(
  items: readonly T[],
  options: {
    cap: number;
    stride?: number;
    predicate?: (item: T, index: number) => boolean;
    startIndex?: number;
    endIndex?: number;
  }
): T[] => {
  const cap = Math.max(0, Math.floor(Number(options.cap) || 0));
  if (cap <= 0 || items.length === 0) {
    return [];
  }

  const stride = Math.max(1, Math.floor(Number(options.stride) || 1));
  const startIndex = clamp(
    Math.floor(Number(options.startIndex ?? 0) || 0),
    0,
    items.length
  );
  const endIndex = clamp(
    Math.floor(Number(options.endIndex ?? items.length) || items.length),
    startIndex,
    items.length
  );
  const predicate = options.predicate ?? (() => true);
  const out: T[] = [];
  let matchedCount = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const item = items[index]!;
    if (!predicate(item, index)) {
      continue;
    }

    if (matchedCount % stride === 0) {
      out.push(item);
      if (out.length >= cap) {
        break;
      }
    }

    matchedCount += 1;
  }

  return out;
};

const applyStrideToItems = <T,>(items: readonly T[], strideRaw: number): T[] => {
  const stride = Math.max(1, Math.floor(Number(strideRaw) || 1));
  if (stride <= 1) {
    return [...items];
  }

  const out: T[] = [];
  for (let index = 0; index < items.length; index += stride) {
    out.push(items[index]!);
  }

  return out;
};

const getTradeConfidenceScore = (trade: HistoryItem): number => {
  const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
  const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
  const rrScore = clamp(rewardDistance / riskDistance / 3, 0, 1) * 0.2;
  const pnlScore = clamp(Math.abs(trade.pnlPct) / 0.45, 0, 1) * 0.18;
  const durationMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
  const durationScore = clamp(1 - durationMinutes / 720, 0, 1) * 0.08;
  const base = trade.result === "Win" ? 0.44 : 0.26;
  const sideBias = trade.side === "Long" ? 0.04 : 0.02;

  return clamp(base + rrScore + pnlScore + durationScore + sideBias, 0.05, 0.96);
};

const toNumeric = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTrade = (value: unknown): HistoryItem | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();

  if (!id) {
    return null;
  }

  return {
    id,
    symbol: String(row.symbol ?? ""),
    side: row.side === "Short" ? "Short" : "Long",
    result: row.result === "Loss" ? "Loss" : "Win",
    entrySource: String(row.entrySource ?? "Settings"),
    pnlPct: toNumeric(row.pnlPct),
    pnlUsd: toNumeric(row.pnlUsd),
    entryTime: toNumeric(row.entryTime),
    exitTime: toNumeric(row.exitTime),
    entryPrice: Math.max(0.000001, toNumeric(row.entryPrice)),
    targetPrice: Math.max(0.000001, toNumeric(row.targetPrice)),
    stopPrice: Math.max(0.000001, toNumeric(row.stopPrice)),
    outcomePrice: Math.max(0.000001, toNumeric(row.outcomePrice)),
    units: Math.max(0.000001, Math.abs(toNumeric(row.units, 1)) || 1)
  };
};

const normalizeTrades = (value: unknown): HistoryItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: HistoryItem[] = [];

  for (const item of value) {
    const normalized = normalizeTrade(item);
    if (normalized) {
      rows.push(normalized);
    }
  }

  return rows;
};

const normalizeFilterSettings = (value: unknown): BacktestFilterSettings => {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    statsDateStart: String(row.statsDateStart ?? ""),
    statsDateEnd: String(row.statsDateEnd ?? ""),
    enabledBacktestWeekdays: Array.isArray(row.enabledBacktestWeekdays)
      ? row.enabledBacktestWeekdays.map((entry) => String(entry))
      : [],
    enabledBacktestSessions: Array.isArray(row.enabledBacktestSessions)
      ? row.enabledBacktestSessions.map((entry) => String(entry))
      : [],
    enabledBacktestMonths: Array.isArray(row.enabledBacktestMonths)
      ? row.enabledBacktestMonths.map((entry) => Math.trunc(toNumeric(entry))).filter((entry) => Number.isFinite(entry))
      : [],
    enabledBacktestHours: Array.isArray(row.enabledBacktestHours)
      ? row.enabledBacktestHours.map((entry) => Math.trunc(toNumeric(entry))).filter((entry) => Number.isFinite(entry))
      : [],
    aiMode: row.aiMode === "knn" || row.aiMode === "hdbscan" ? row.aiMode : "off",
    antiCheatEnabled: row.antiCheatEnabled === true,
    validationMode:
      row.validationMode === "split" ||
      row.validationMode === "online" ||
      row.validationMode === "synthetic"
        ? row.validationMode
        : "off",
    selectedAiLibraries: Array.isArray(row.selectedAiLibraries)
      ? row.selectedAiLibraries.map((entry) => String(entry))
      : [],
    selectedAiLibrarySettings:
      row.selectedAiLibrarySettings &&
      typeof row.selectedAiLibrarySettings === "object" &&
      !Array.isArray(row.selectedAiLibrarySettings)
        ? (row.selectedAiLibrarySettings as AiLibrarySettings)
        : {}
  };
};

const normalizeAiLibraryDefaultsById = (
  value: unknown
): Record<string, Record<string, AiLibrarySettingValue>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const out: Record<string, Record<string, AiLibrarySettingValue>> = {};

  for (const [key, rawDefaults] of Object.entries(value as Record<string, unknown>)) {
    if (!rawDefaults || typeof rawDefaults !== "object" || Array.isArray(rawDefaults)) {
      continue;
    }

    const next: Record<string, AiLibrarySettingValue> = {};
    for (const [settingKey, settingValue] of Object.entries(rawDefaults)) {
      if (
        typeof settingValue === "boolean" ||
        typeof settingValue === "number" ||
        typeof settingValue === "string"
      ) {
        next[settingKey] = settingValue;
      }
    }

    out[key] = next;
  }

  return out;
};

const computeAntiCheatBacktestContext = (params: {
  panelSourceTrades: HistoryItem[];
  panelBacktestFilterSettings: BacktestFilterSettings;
  aiLibraryDefaultsById: Record<string, Record<string, AiLibrarySettingValue>>;
}) => {
  const { panelSourceTrades, panelBacktestFilterSettings, aiLibraryDefaultsById } = params;
  const startMs = getUtcDayStartMs(panelBacktestFilterSettings.statsDateStart);
  const endExclusiveMs = getUtcDayEndExclusiveMs(panelBacktestFilterSettings.statsDateEnd);
  const dateFilteredTrades = panelSourceTrades.filter((trade) => {
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

  const timeFilteredBase = dateFilteredTrades.filter((trade) => {
    const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
    const session = getSessionLabel(trade.entryTime);
    const monthIndex = getTradeMonthIndex(trade.exitTime);
    const entryHour = getTradeHour(trade.entryTime);

    return (
      panelBacktestFilterSettings.enabledBacktestWeekdays.includes(weekday) &&
      panelBacktestFilterSettings.enabledBacktestSessions.includes(session) &&
      panelBacktestFilterSettings.enabledBacktestMonths.includes(monthIndex) &&
      panelBacktestFilterSettings.enabledBacktestHours.includes(entryHour)
    );
  });

  const chronologicalTrades = [...timeFilteredBase].sort(
    (left, right) => Number(left.entryTime) - Number(right.entryTime)
  );
  const confidenceById = new Map<string, number>();
  const usesSplitValidation =
    panelBacktestFilterSettings.antiCheatEnabled &&
    panelBacktestFilterSettings.validationMode === "split";
  const resolveSplitTimestampMs = (): number | null => {
    if (startMs !== null && endExclusiveMs !== null && endExclusiveMs > startMs) {
      return startMs + Math.floor((endExclusiveMs - startMs) * 0.5);
    }
    if (chronologicalTrades.length === 0) {
      return null;
    }
    const mid = chronologicalTrades[Math.floor(chronologicalTrades.length * 0.5)];
    const entryMs = Number(mid?.entryTime) * 1000;
    return Number.isFinite(entryMs) && entryMs > 0 ? entryMs : null;
  };
  const splitTimestampMs = usesSplitValidation ? resolveSplitTimestampMs() : null;
  let splitTrainingTrades = usesSplitValidation
    ? chronologicalTrades.filter((trade) => Number(trade.entryTime) * 1000 < (splitTimestampMs ?? 0))
    : chronologicalTrades;
  let splitEvaluationTrades = usesSplitValidation
    ? chronologicalTrades.filter((trade) => Number(trade.entryTime) * 1000 >= (splitTimestampMs ?? 0))
    : chronologicalTrades;
  if (
    usesSplitValidation &&
    splitTimestampMs !== null &&
    (splitTrainingTrades.length === 0 || splitEvaluationTrades.length === 0)
  ) {
    const fallbackIndex = Math.floor(chronologicalTrades.length * 0.5);
    splitTrainingTrades = chronologicalTrades.slice(0, fallbackIndex);
    splitEvaluationTrades = chronologicalTrades.slice(fallbackIndex);
  }

  if (
    panelBacktestFilterSettings.aiMode === "off" ||
    !panelBacktestFilterSettings.antiCheatEnabled ||
    chronologicalTrades.length === 0
  ) {
    return {
      dateFilteredTrades,
      libraryCandidateTrades: splitTrainingTrades,
      timeFilteredTrades: splitEvaluationTrades,
      confidenceById
    };
  }

  const activeLibraryIds =
    panelBacktestFilterSettings.selectedAiLibraries.length > 0
      ? panelBacktestFilterSettings.selectedAiLibraries
      : [];
  const timeFilteredTrades = splitEvaluationTrades;

  const getLibrarySettings = (libraryId: string) => {
    const defaults = aiLibraryDefaultsById[libraryId] ?? {};
    return {
      ...defaults,
      ...(panelBacktestFilterSettings.selectedAiLibrarySettings[libraryId] ?? {})
    } as Record<string, AiLibrarySettingValue>;
  };

  const getLibraryWeight = (libraryId: string) => {
    const raw = Number(getLibrarySettings(libraryId).weight ?? 100);
    const pct = raw <= 10 ? raw * 100 : raw;
    return clamp(pct, 0, 5000) / 100;
  };

  const getLibraryStride = (libraryId: string) => {
    return clamp(
      Math.floor(Number(getLibrarySettings(libraryId).stride ?? 0) || 0),
      0,
      5000
    );
  };

  const getLibraryMaxSamples = (libraryId: string, fallback = 96) => {
    return clamp(
      Math.floor(Number(getLibrarySettings(libraryId).maxSamples ?? fallback) || fallback),
      0,
      100000
    );
  };

  const getLibraryCount = (libraryId: string, fallback = 24) => {
    return clamp(
      Math.floor(Number(getLibrarySettings(libraryId).count ?? fallback) || fallback),
      0,
      100000
    );
  };

  const getTradeRiskReward = (trade: HistoryItem) => {
    const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
    const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
    return rewardDistance / riskDistance;
  };

  const getSyntheticWinProb = (trade: HistoryItem) => {
    const session = getSessionLabel(trade.entryTime);
    const entryHour = getTradeHour(trade.entryTime);
    const rr = getTradeRiskReward(trade);
    const seed = hashSeedFromText(
      `${trade.symbol}|${trade.entrySource}|${trade.side}|${trade.entryTime}`
    );
    let score = 0.5 + (((seed % 1000) / 999) - 0.5) * 0.12;

    if (trade.side === "Long") {
      score += 0.015;
    }

    if (session === "London") {
      score += 0.035;
    } else if (session === "New York") {
      score += 0.025;
    } else if (session === "Tokyo") {
      score -= 0.01;
    }

    score += Math.sin((entryHour / 24) * Math.PI * 2) * 0.035;
    score += clamp((rr - 1.1) * 0.045, -0.08, 0.08);

    return clamp(score, 0.08, 0.92);
  };

  const pickLibrarySource = (
    libraryId: string,
    pool: HistoryItem[],
    currentTrade: HistoryItem
  ) => {
    const settings = getLibrarySettings(libraryId);
    const normalizedId = libraryId.toLowerCase();
    const maxSamples = getLibraryMaxSamples(libraryId, 96);
    const stride = getLibraryStride(libraryId);
    let source: HistoryItem[] = [];

    if (normalizedId === "suppressed") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => trade.result === "Loss"
      });
    } else if (normalizedId === "recent") {
      const windowTrades = clamp(
        Math.floor(Number(settings.windowTrades ?? 150) || 150),
        0,
        5000
      );
      const startIndex = Math.max(0, pool.length - windowTrades);
      source =
        windowTrades > 0
          ? collectCappedItems(pool, {
              cap: maxSamples,
              stride,
              startIndex,
              endIndex: pool.length
            })
          : [];
    } else if (normalizedId === "tokyo") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "Tokyo"
      });
    } else if (normalizedId === "sydney") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "Sydney"
      });
    } else if (normalizedId === "london") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "London"
      });
    } else if (normalizedId === "newyork") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "New York"
      });
    } else if (normalizedId === "terrific") {
      const count = getLibraryCount(libraryId, 96);
      const effectiveCap = Math.min(maxSamples, count);
      const capped = collectCappedItems(pool, {
        cap: effectiveCap
      });
      source = applyStrideToItems(
        [...capped].sort((left, right) => right.pnlUsd - left.pnlUsd),
        stride
      );
    } else if (normalizedId === "terrible") {
      const count = getLibraryCount(libraryId, 96);
      const effectiveCap = Math.min(maxSamples, count);
      const capped = collectCappedItems(pool, {
        cap: effectiveCap
      });
      source = applyStrideToItems(
        [...capped].sort((left, right) => left.pnlUsd - right.pnlUsd),
        stride
      );
    } else if ((settings.kind as string | undefined) === "model_sim") {
      const targetModel = String(settings.model ?? currentTrade.entrySource);
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => trade.entrySource === targetModel
      });
    } else {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride
      });
    }

    const baselineWinRate = getOutcomeWinRatePercent(
      source,
      (candidate) => candidate.result === "Win"
    );
    const targetWinRate = resolveAiLibraryTargetWinRate(
      settings,
      baselineWinRate,
      source.length
    );

    return rebalanceItemsToTargetWinRate(
      source,
      maxSamples,
      targetWinRate,
      (candidate) => candidate.result === "Win",
      normalizedId === "terrific" || normalizedId === "terrible"
    );
  };

  const getSimilarityWeight = (currentTrade: HistoryItem, candidateTrade: HistoryItem) => {
    let weight = 0.35;

    if (candidateTrade.side === currentTrade.side) {
      weight += 0.18;
    }

    if (candidateTrade.entrySource === currentTrade.entrySource) {
      weight += 0.24;
    }

    if (candidateTrade.symbol === currentTrade.symbol) {
      weight += 0.1;
    }

    if (getSessionLabel(candidateTrade.entryTime) === getSessionLabel(currentTrade.entryTime)) {
      weight += 0.12;
    }

    const hourGap = Math.abs(
      getTradeHour(candidateTrade.entryTime) - getTradeHour(currentTrade.entryTime)
    );

    if (hourGap === 0) {
      weight += 0.08;
    } else if (hourGap <= 2) {
      weight += 0.04;
    }

    const rrGap = Math.abs(
      getTradeRiskReward(candidateTrade) - getTradeRiskReward(currentTrade)
    );
    weight *= 1 / (1 + rrGap * 0.65);

    const timeGapHours = Math.abs(
      Number(currentTrade.entryTime) - Number(candidateTrade.entryTime)
    ) / 3600;
    weight *= 1 / (1 + timeGapHours / 72);

    return clamp(weight, 0.02, 2);
  };

  for (let index = 0; index < chronologicalTrades.length; index += 1) {
    const trade = chronologicalTrades[index]!;
    const basePool =
      panelBacktestFilterSettings.validationMode === "split"
        ? splitTrainingTrades
        : chronologicalTrades.slice(0, index);

    if (basePool.length === 0) {
      confidenceById.set(trade.id, getSyntheticWinProb(trade));
      continue;
    }

    const baselineWinRate =
      basePool.reduce((sum, candidate) => sum + (candidate.result === "Win" ? 1 : 0), 0) /
      basePool.length;
    let weightedWins = 0;
    let weightedTotal = 0;
    let similarityTotal = 0;
    let sampleCount = 0;

    for (const libraryId of activeLibraryIds) {
      const libraryWeight = getLibraryWeight(libraryId);

      if (libraryWeight <= 0) {
        continue;
      }

      const source = pickLibrarySource(libraryId, basePool, trade);

      for (const candidate of source) {
        const similarityWeight = getSimilarityWeight(trade, candidate) * libraryWeight;
        const outcome =
          panelBacktestFilterSettings.validationMode === "synthetic"
            ? getSyntheticWinProb(candidate)
            : candidate.result === "Win"
              ? 1
              : 0;

        weightedWins += similarityWeight * outcome;
        weightedTotal += similarityWeight;
        similarityTotal += similarityWeight;
        sampleCount += 1;
      }
    }

    if (sampleCount === 0 || weightedTotal <= 0) {
      confidenceById.set(
        trade.id,
        clamp(0.5 + (baselineWinRate - 0.5) * 0.2, 0.18, 0.82)
      );
      continue;
    }

    const weightedWinRate = weightedWins / weightedTotal;
    const labelVariance = weightedWinRate * (1 - weightedWinRate) * 4;
    const matchStrength = clamp(similarityTotal / Math.max(1, sampleCount), 0, 1);
    const coverage = clamp(sampleCount / 12, 0, 1);
    const shrink =
      coverage * (0.2 + matchStrength * 0.8) * (0.35 + labelVariance * 0.65);
    const confidence =
      baselineWinRate + (weightedWinRate - baselineWinRate) * shrink;

    confidenceById.set(trade.id, clamp(confidence, 0.02, 0.98));
  }

  return {
    dateFilteredTrades,
    libraryCandidateTrades: splitTrainingTrades,
    timeFilteredTrades,
    confidenceById
  };
};

const filterHistoryRows = (params: {
  sourceTrades: HistoryItem[];
  settings: BacktestFilterSettings;
  confidenceById: Map<string, number>;
  confidenceGateDisabled: boolean;
  effectiveConfidenceThreshold: number;
}) => {
  const {
    sourceTrades,
    settings,
    confidenceById,
    confidenceGateDisabled,
    effectiveConfidenceThreshold
  } = params;

  const startMs = getUtcDayStartMs(settings.statsDateStart);
  const endExclusiveMs = getUtcDayEndExclusiveMs(settings.statsDateEnd);

  return sourceTrades
    .filter((trade) => {
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

      const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
      const session = getSessionLabel(trade.entryTime);
      const monthIndex = getTradeMonthIndex(trade.exitTime);
      const entryHour = getTradeHour(trade.entryTime);

      if (
        !settings.enabledBacktestWeekdays.includes(weekday) ||
        !settings.enabledBacktestSessions.includes(session) ||
        !settings.enabledBacktestMonths.includes(monthIndex) ||
        !settings.enabledBacktestHours.includes(entryHour)
      ) {
        return false;
      }

      if (confidenceGateDisabled) {
        return true;
      }

      const confidence = (confidenceById.get(trade.id) ?? getTradeConfidenceScore(trade)) * 100;
      return confidence >= effectiveConfidenceThreshold;
    })
    .sort((a, b) => Number(b.exitTime) - Number(a.exitTime) || b.id.localeCompare(a.id));
};

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const body =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : null;

  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const panelSourceTrades = normalizeTrades(body.panelSourceTrades);
  const panelBacktestFilterSettings = normalizeFilterSettings(body.panelBacktestFilterSettings);
  const panelConfidenceGateDisabled = body.panelConfidenceGateDisabled === true;
  const panelEffectiveConfidenceThreshold = toNumeric(body.panelEffectiveConfidenceThreshold);
  const activePanelSourceTrades =
    body.activePanelSourceTrades === undefined
      ? panelSourceTrades
      : normalizeTrades(body.activePanelSourceTrades);
  const activePanelBacktestFilterSettings =
    body.activePanelBacktestFilterSettings === undefined
      ? panelBacktestFilterSettings
      : normalizeFilterSettings(body.activePanelBacktestFilterSettings);
  const activePanelConfidenceGateDisabled =
    body.activePanelConfidenceGateDisabled === undefined
      ? panelConfidenceGateDisabled
      : body.activePanelConfidenceGateDisabled === true;
  const activePanelEffectiveConfidenceThreshold =
    body.activePanelEffectiveConfidenceThreshold === undefined
      ? panelEffectiveConfidenceThreshold
      : toNumeric(body.activePanelEffectiveConfidenceThreshold);
  const aiLibraryDefaultsById = normalizeAiLibraryDefaultsById(body.aiLibraryDefaultsById);

  const antiCheatBacktestContext = computeAntiCheatBacktestContext({
    panelSourceTrades,
    panelBacktestFilterSettings,
    aiLibraryDefaultsById
  });

  const chartPanelHistoryRows = filterHistoryRows({
    sourceTrades: antiCheatBacktestContext.timeFilteredTrades,
    settings: panelBacktestFilterSettings,
    confidenceById: antiCheatBacktestContext.confidenceById,
    confidenceGateDisabled: panelConfidenceGateDisabled,
    effectiveConfidenceThreshold: panelEffectiveConfidenceThreshold
  });

  const activePanelHistoryRows = filterHistoryRows({
    sourceTrades: activePanelSourceTrades,
    settings: activePanelBacktestFilterSettings,
    confidenceById: antiCheatBacktestContext.confidenceById,
    confidenceGateDisabled: activePanelConfidenceGateDisabled,
    effectiveConfidenceThreshold: activePanelEffectiveConfidenceThreshold
  });

  const payload: PanelAnalyticsResponseBody = {
    dateFilteredTrades: antiCheatBacktestContext.dateFilteredTrades,
    libraryCandidateTrades: antiCheatBacktestContext.libraryCandidateTrades,
    timeFilteredTrades: antiCheatBacktestContext.timeFilteredTrades,
    confidenceByIdEntries: Array.from(antiCheatBacktestContext.confidenceById.entries()),
    chartPanelHistoryRows,
    activePanelHistoryRows
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
