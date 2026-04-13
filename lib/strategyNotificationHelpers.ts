import type { StrategyNotificationSettings } from "./strategyNotificationEngine";
import { stableStringify } from "./stableSerialization";
import { normalizeAizipLibraryId } from "../app/aizipRuntime";

export const MARKET_TIMEFRAME_BY_UI: Record<StrategyNotificationSettings["timeframe"], string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

export const HISTORY_LIMIT_BY_TIMEFRAME: Record<StrategyNotificationSettings["timeframe"], number> = {
  "1m": 5000,
  "5m": 5000,
  "15m": 5000,
  "1H": 3000,
  "4H": 1800,
  "1D": 900,
  "1W": 240
};

export const MARKET_TIMEFRAME_MS_BY_UI: Record<StrategyNotificationSettings["timeframe"], number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1H": 60 * 60_000,
  "4H": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000
};

export const DEFAULT_STRATEGY_NOTIFICATION_SETTINGS: StrategyNotificationSettings = {
  symbol: "XAUUSD",
  timeframe: "15m",
  precisionTimeframe: "15m",
  minutePreciseEnabled: false,
  inPreciseEnabled: false,
  statsDateStart: "",
  statsDateEnd: "",
  enabledBacktestWeekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  enabledBacktestSessions: ["Tokyo", "London", "New York", "Sydney"],
  enabledBacktestMonths: Array.from({ length: 12 }, (_, index) => index),
  enabledBacktestHours: Array.from({ length: 24 }, (_, index) => index),
  aiMode: "off",
  aiFilterEnabled: false,
  confidenceThreshold: 0,
  aiExitStrictness: 0,
  aiExitLossTolerance: 0,
  aiExitWinTolerance: 0,
  useMitExit: false,
  ancThreshold: 0,
  dollarsPerMove: 25,
  chunkBars: 24,
  maxBarsInTrade: 0,
  maxConcurrentTrades: 1,
  tpDollars: 1000,
  slDollars: 1000,
  stopMode: 0,
  breakEvenTriggerPct: 50,
  trailingStartPct: 50,
  trailingDistPct: 30,
  aiModelStates: {},
  aiFeatureLevels: {},
  aiFeatureModes: {},
  selectedAiLibraries: [],
  selectedAiLibrarySettings: {},
  distanceMetric: "euclidean",
  knnNeighborSpace: "post",
  selectedAiDomains: ["Direction", "Model"],
  remapOppositeOutcomes: true,
  dimensionAmount: 32,
  compressionMethod: "umap",
  kEntry: 12,
  kExit: 9,
  knnVoteMode: "majority",
  hdbMinClusterSize: 5,
  hdbMinSamples: 5,
  hdbEpsQuantile: 0.5,
  staticLibrariesClusters: false,
  antiCheatEnabled: false,
  validationMode: "off"
};

type MarketCandleInput = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type TradeNotificationBodyParams = {
  symbol: string;
  side: string;
  label: string;
  entryPrice: number | null | undefined;
  takeProfit: number | null | undefined;
  stopLoss: number | null | undefined;
  triggerTimeMs: number | null | undefined;
  timeZone?: string | null | undefined;
};

const toSafeTimeZone = (value: string | null | undefined): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: trimmed
    }).format(new Date());
    return trimmed;
  } catch {
    return "UTC";
  }
};

export const normalizeStrategyNotificationPair = (symbol: string): string => {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) {
    return "XAU_USD";
  }
  if (normalized === "XAUUSD") {
    return "XAU_USD";
  }
  if (normalized.length === 6) {
    return `${normalized.slice(0, 3)}_${normalized.slice(3)}`;
  }
  return "XAU_USD";
};

export const normalizeStrategyNotificationMarketCandles = (candles: MarketCandleInput[]) => {
  return candles
    .map((candle) => {
      const time = Number(candle.time);
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      const volumeRaw = Number(candle.volume);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        ...(Number.isFinite(volumeRaw) && volumeRaw >= 0 ? { volume: volumeRaw } : {})
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((left, right) => left.time - right.time);
};

export const normalizeStrategyNotificationSettings = (
  raw: unknown
): StrategyNotificationSettings | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const timeframe = String(value.timeframe ?? "").trim() as StrategyNotificationSettings["timeframe"];
  if (!(timeframe in MARKET_TIMEFRAME_BY_UI)) {
    return null;
  }

  const precisionTimeframe = String(
    value.precisionTimeframe ?? value.timeframe ?? ""
  ).trim() as StrategyNotificationSettings["precisionTimeframe"];
  const normalizedPrecisionTimeframe =
    precisionTimeframe in MARKET_TIMEFRAME_BY_UI ? precisionTimeframe : timeframe;

  const aiMode =
    value.aiMode === "knn" || value.aiMode === "hdbscan" ? value.aiMode : "off";

  const distanceMetric =
    value.distanceMetric === "cosine" ||
    value.distanceMetric === "manhattan" ||
    value.distanceMetric === "chebyshev"
      ? value.distanceMetric
      : "euclidean";
  const knnNeighborSpace =
    value.knnNeighborSpace === "high" ||
    value.knnNeighborSpace === "3d" ||
    value.knnNeighborSpace === "2d"
      ? value.knnNeighborSpace
      : "post";
  const knnVoteMode = value.knnVoteMode === "distance" ? "distance" : "majority";
  const compressionMethod =
    value.compressionMethod === "pca" ||
    value.compressionMethod === "jl" ||
    value.compressionMethod === "hash" ||
    value.compressionMethod === "variance" ||
    value.compressionMethod === "subsample"
      ? value.compressionMethod
      : "umap";
  const validationMode =
    value.validationMode === "split" || value.validationMode === "synthetic"
      ? value.validationMode
      : "off";
  const mapStringArray = (input: unknown, fallback: string[]) => {
    return Array.isArray(input) ? input.map((entry) => String(entry)) : fallback;
  };
  const mapNumberArray = (input: unknown, fallback: number[]) => {
    return Array.isArray(input)
      ? input
          .map((entry) => Math.trunc(Number(entry)))
          .filter((entry) => Number.isFinite(entry))
      : fallback;
  };
  const mapRecordNumbers = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, entry]) => [
        key,
        Number(entry ?? 0) || 0
      ])
    );
  };
  const mapRecordStrings = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, entry]) => [
        key,
        String(entry ?? "")
      ])
    );
  };
  const normalizeSelectedAiLibraries = (input: unknown) => {
    if (!Array.isArray(input)) {
      return [];
    }

    const seen = new Set<string>();
    const cleaned: string[] = [];

    for (const entry of input) {
      const libraryId = normalizeAizipLibraryId(String(entry ?? "").trim());
      if (!libraryId || libraryId === "recent" || seen.has(libraryId)) {
        continue;
      }

      seen.add(libraryId);
      cleaned.push(libraryId);
    }

    const legacyDefault =
      cleaned.length === 2 &&
      cleaned.includes("online") &&
      cleaned.includes("base");
    const legacyCoreOnly = cleaned.length === 1 && cleaned[0] === "online";

    return legacyDefault || legacyCoreOnly ? [] : cleaned;
  };

  return {
    ...DEFAULT_STRATEGY_NOTIFICATION_SETTINGS,
    symbol: String(value.symbol ?? "XAUUSD").trim() || "XAUUSD",
    timeframe,
    precisionTimeframe: normalizedPrecisionTimeframe,
    minutePreciseEnabled:
      value.minutePreciseEnabled === true && normalizedPrecisionTimeframe !== timeframe,
    aiMode,
    aiFilterEnabled: Boolean(value.aiFilterEnabled),
    inPreciseEnabled: value.inPreciseEnabled === true,
    statsDateStart: String(value.statsDateStart ?? ""),
    statsDateEnd: String(value.statsDateEnd ?? ""),
    enabledBacktestWeekdays: mapStringArray(
      value.enabledBacktestWeekdays,
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.enabledBacktestWeekdays
    ),
    enabledBacktestSessions: mapStringArray(
      value.enabledBacktestSessions,
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.enabledBacktestSessions
    ),
    enabledBacktestMonths: mapNumberArray(
      value.enabledBacktestMonths,
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.enabledBacktestMonths
    ),
    enabledBacktestHours: mapNumberArray(
      value.enabledBacktestHours,
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.enabledBacktestHours
    ),
    confidenceThreshold: Number(value.confidenceThreshold ?? 0) || 0,
    aiExitStrictness: Number(value.aiExitStrictness ?? 0) || 0,
    aiExitLossTolerance: Number(value.aiExitLossTolerance ?? 0) || 0,
    aiExitWinTolerance: Number(value.aiExitWinTolerance ?? 0) || 0,
    useMitExit: value.useMitExit === true,
    ancThreshold: Number(value.ancThreshold ?? 0) || 0,
    dollarsPerMove: Number(value.dollarsPerMove ?? 25) || 25,
    chunkBars: Math.max(1, Number(value.chunkBars ?? 24) || 24),
    maxBarsInTrade: Math.max(0, Number(value.maxBarsInTrade ?? 0) || 0),
    maxConcurrentTrades: Math.max(0, Number(value.maxConcurrentTrades ?? 1) || 1),
    tpDollars: Number(value.tpDollars ?? 1000) || 1000,
    slDollars: Number(value.slDollars ?? 1000) || 1000,
    stopMode: Number(value.stopMode ?? 0) || 0,
    breakEvenTriggerPct: Number(value.breakEvenTriggerPct ?? 50) || 50,
    trailingStartPct: Number(value.trailingStartPct ?? 50) || 50,
    trailingDistPct: Number(value.trailingDistPct ?? 30) || 30,
    aiModelStates: mapRecordNumbers(value.aiModelStates),
    aiFeatureLevels: mapRecordNumbers(value.aiFeatureLevels),
    aiFeatureModes: mapRecordStrings(value.aiFeatureModes),
    selectedAiLibraries: normalizeSelectedAiLibraries(value.selectedAiLibraries),
    selectedAiLibrarySettings:
      value.selectedAiLibrarySettings &&
      typeof value.selectedAiLibrarySettings === "object" &&
      !Array.isArray(value.selectedAiLibrarySettings)
        ? (value.selectedAiLibrarySettings as StrategyNotificationSettings["selectedAiLibrarySettings"])
        : {},
    distanceMetric,
    knnNeighborSpace,
    selectedAiDomains: mapStringArray(
      value.selectedAiDomains,
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.selectedAiDomains
    ),
    remapOppositeOutcomes:
      value.remapOppositeOutcomes === false
        ? false
        : DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.remapOppositeOutcomes,
    dimensionAmount:
      Number(value.dimensionAmount ?? DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.dimensionAmount) ||
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.dimensionAmount,
    compressionMethod,
    kEntry: Math.max(1, Number(value.kEntry ?? DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.kEntry) || 1),
    kExit: Math.max(1, Number(value.kExit ?? DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.kExit) || 1),
    knnVoteMode,
    hdbMinClusterSize:
      Number(value.hdbMinClusterSize ?? DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.hdbMinClusterSize) ||
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.hdbMinClusterSize,
    hdbMinSamples:
      Number(value.hdbMinSamples ?? DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.hdbMinSamples) ||
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.hdbMinSamples,
    hdbEpsQuantile:
      Number(value.hdbEpsQuantile ?? DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.hdbEpsQuantile) ||
      DEFAULT_STRATEGY_NOTIFICATION_SETTINGS.hdbEpsQuantile,
    staticLibrariesClusters: value.staticLibrariesClusters === true,
    antiCheatEnabled: value.antiCheatEnabled === true,
    validationMode
  };
};

export const serializeStrategyNotificationSettings = (
  settings: StrategyNotificationSettings
) => stableStringify(settings);

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

const clampPositiveInteger = (value: number, fallback: number, max: number) => {
  const normalized = Math.floor(Number(value) || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return Math.min(max, normalized);
};

export const buildStrategyNotificationHistoryRequest = (args: {
  settings: StrategyNotificationSettings;
  timeframe: StrategyNotificationSettings["timeframe"];
  nowMs?: number;
}) => {
  const { settings, timeframe } = args;
  const nowMs = Number.isFinite(args.nowMs) ? Number(args.nowMs) : Date.now();
  const timeframeMs = MARKET_TIMEFRAME_MS_BY_UI[timeframe];
  const leadingBars = Math.max(
    Math.floor(Number(settings.chunkBars) || 0) * 3,
    Math.floor(Number(settings.maxBarsInTrade) || 0) + 24
  );
  const precisionScale = Math.max(
    1,
    Math.round(
      (MARKET_TIMEFRAME_MS_BY_UI[settings.timeframe] ?? timeframeMs) / Math.max(60_000, timeframeMs)
    )
  );
  const paddedLeadingBars =
    timeframe === settings.timeframe ? leadingBars : Math.max(leadingBars, leadingBars * precisionScale);
  const startMs = getUtcDayStartMsFromYmd(settings.statsDateStart);
  const endExclusiveMs = getUtcDayEndExclusiveMsFromYmd(settings.statsDateEnd);
  const resolvedEndMs =
    endExclusiveMs != null ? Math.min(nowMs, Math.max(startMs ?? 0, endExclusiveMs - 1)) : nowMs;
  const resolvedStartMs =
    startMs != null
      ? Math.max(0, startMs - paddedLeadingBars * timeframeMs)
      : Math.max(
          0,
          resolvedEndMs - (HISTORY_LIMIT_BY_TIMEFRAME[timeframe] ?? 5000) * timeframeMs
        );
  const estimatedCount =
    startMs != null
      ? clampPositiveInteger(
          Math.ceil((resolvedEndMs - resolvedStartMs) / Math.max(60_000, timeframeMs)) +
            paddedLeadingBars +
            8,
          HISTORY_LIMIT_BY_TIMEFRAME[timeframe] ?? 5000,
          50_000
        )
      : HISTORY_LIMIT_BY_TIMEFRAME[timeframe] ?? 5000;

  return {
    pair: normalizeStrategyNotificationPair(settings.symbol),
    timeframe: MARKET_TIMEFRAME_BY_UI[timeframe],
    count: estimatedCount,
    start: startMs != null ? new Date(resolvedStartMs).toISOString() : null,
    end: new Date(resolvedEndMs).toISOString()
  };
};

export const formatTradeNotificationPrice = (value: number | null | undefined): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "--";
};

export const formatTradeNotificationUnits = (value: number | null | undefined): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : "--";
};

export const formatTradeNotificationTriggerTime = (
  triggerTimeMs: number | null | undefined,
  timeZone?: string | null | undefined
): string => {
  const numeric = Number(triggerTimeMs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: toSafeTimeZone(timeZone),
    timeZoneName: "short"
  }).format(new Date(numeric));
};

export const buildTradeNotificationBody = ({
  symbol,
  side,
  label,
  entryPrice,
  takeProfit,
  stopLoss,
  triggerTimeMs,
  timeZone
}: TradeNotificationBodyParams): string => {
  return [
    `${String(symbol).trim() || "XAUUSD"} | ${String(side).trim() || "Trade"} ${String(label).trim() || "signal"}`,
    `Entry Price: ${formatTradeNotificationPrice(entryPrice)}`,
    `Take Profit: ${formatTradeNotificationPrice(takeProfit)}`,
    `Stop Loss: ${formatTradeNotificationPrice(stopLoss)}`,
    `Trigger Time: ${formatTradeNotificationTriggerTime(triggerTimeMs, timeZone)}`
  ].join("\n");
};
