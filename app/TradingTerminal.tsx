"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, ReactNode } from "react";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AutoscaleInfo,
  CandlestickData,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  MouseEventParams,
  PriceRange,
  SeriesMarker,
  Time,
  UTCTimestamp
} from "lightweight-charts";
import {
  computeBacktestHistoryRowsChunk,
  finalizeBacktestHistoryRows,
  type BacktestHistoryRow,
  type BacktestHistoryWorkerResponse
} from "./backtestHistoryShared";

const loadRecharts = () => import("recharts");
const ResponsiveContainer = dynamic<any>(() => loadRecharts().then((mod) => mod.ResponsiveContainer), {
  ssr: false
});
const ComposedChart = dynamic<any>(() => loadRecharts().then((mod) => mod.ComposedChart), {
  ssr: false
});
const BarChart = dynamic<any>(() => loadRecharts().then((mod) => mod.BarChart), {
  ssr: false
});
const Bar = dynamic<any>(() => loadRecharts().then((mod) => mod.Bar), { ssr: false });
const Line = dynamic<any>(() => loadRecharts().then((mod) => mod.Line), { ssr: false });
const ReferenceLine = dynamic<any>(() => loadRecharts().then((mod) => mod.ReferenceLine), {
  ssr: false
});
const Tooltip = dynamic<any>(() => loadRecharts().then((mod) => mod.Tooltip), { ssr: false });
const XAxis = dynamic<any>(() => loadRecharts().then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic<any>(() => loadRecharts().then((mod) => mod.YAxis), { ssr: false });

const loadAiZipClusterModule = () => import("./AIZipClusterModule");
const AIZipTradeDetailsModal = dynamic<any>(
  () => loadAiZipClusterModule().then((mod) => mod.AIZipTradeDetailsModal),
  { ssr: false }
);
const AIZipClusterMap = dynamic<any>(
  () => loadAiZipClusterModule().then((mod) => mod.ClusterMap),
  { ssr: false }
);
const AIZipClusterMap3D = dynamic<any>(
  () => loadAiZipClusterModule().then((mod) => mod.ClusterMap3D),
  { ssr: false }
);

const LIGHTWEIGHT_CHART_SOLID_BACKGROUND: ColorType = "solid" as ColorType;
const LIGHTWEIGHT_CHART_CROSSHAIR_NORMAL: CrosshairMode = 0;
const LIGHTWEIGHT_CHART_LINE_SOLID: LineStyle = 0;
const LIGHTWEIGHT_CHART_LINE_DOTTED: LineStyle = 1;
const LIGHTWEIGHT_CHART_LINE_SPARSE_DOTTED: LineStyle = 4;
const SETTINGS_STORAGE_KEY = "korra-settings";
const PRESETS_STORAGE_KEY = "korra-presets";
type SavedPreset = { name: string; settings: Record<string, any>; savedAt: number };
type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type SurfaceTab = "chart" | "backtest";
type BacktestTab =
  | "mainSettings"
  | "mainStats"
  | "timeSettings"
  | "performanceStats"
  | "history"
  | "calendar"
  | "cluster"
  | "entryExit"
  | "dimensions"
  | "propFirm";
type PanelTab = "active" | "assets" | "mt5" | "history" | "actions" | "ai";
type MainStatisticsCard = {
  label: string;
  value: ReactNode;
  tone: "up" | "down" | "neutral";
  span: 1 | 2 | 4 | 6;
  valueClassName?: string;
  labelEmphasis?: boolean;
  children?: MainStatisticsCard[];
};
type BacktestHeroStatCard = {
  label: string;
  value: string;
  tone: "up" | "down" | "neutral";
  meta: string;
  valueStyle?: CSSProperties;
};
type RechartsTooltipRenderProps = {
  active?: boolean;
  payload?: any[];
};

type FutureAsset = {
  symbol: string;
  name: string;
  basePrice: number;
  openInterest: string;
  funding: string;
};

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

const EMPTY_CANDLES: Candle[] = [];
const STATS_REFRESH_HOLD_MS = 3000;
const STATS_REFRESH_COMPLETE_DELAY_MS = 1000;
const STATS_REFRESH_VISUAL_FULL_THRESHOLD = 99.95;

const TIMEFRAME_DISPLAY_LABELS: Record<Timeframe, string> = {
  "1m": "1 Minute",
  "5m": "5 Minutes",
  "15m": "15 Minutes",
  "1H": "1 Hour",
  "4H": "4 Hours",
  "1D": "Daily",
  "1W": "Weekly",
};

const AI_ZIP_MONO_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const aiZipBacktestHistoryHeadCell: CSSProperties = {
  padding: "0.6rem 0.5rem",
  background: "#111111",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  color: "rgba(255,255,255,0.58)",
  fontSize: "0.58rem",
  fontFamily: AI_ZIP_MONO_FONT,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "left"
};

const aiZipBacktestHistoryBodyCell: CSSProperties = {
  padding: "0.58rem 0.5rem",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.84)",
  verticalAlign: "top",
  whiteSpace: "nowrap"
};

const aiZipBacktestHistoryMono = (extra?: CSSProperties): CSSProperties => ({
  fontFamily: AI_ZIP_MONO_FONT,
  ...(extra ?? {})
});

type TradeResult = "Win" | "Loss";
type TradeSide = "Long" | "Short";

type HistoryItem = {
  id: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  entrySource: string;
  exitReason: string;
  pnlPct: number;
  pnlUsd: number;
  time: string;
  entryAt: string;
  exitAt: string;
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
};

const normalizeBacktestHistoryRows = (rows: BacktestHistoryRow[]): HistoryItem[] => {
  return rows.map((row) => ({
    ...row,
    entryTime: row.entryTime as UTCTimestamp,
    exitTime: row.exitTime as UTCTimestamp
  }));
};

type BacktestClusterGroupId = "momentum" | "trend" | "trap" | "chop";
type BacktestClusterLegendKey = "closedWin" | "closedLoss" | BacktestClusterGroupId;

type BacktestClusterNode = {
  id: string;
  trade: HistoryItem;
  clusterId: BacktestClusterGroupId;
  x: number;
  y: number;
  r: number;
  tone: "up" | "down";
  holdMinutes: number;
  confidence: number;
  session: string;
  monthIndex: number;
  weekdayIndex: number;
  hour: number;
  sideLabel: "Buy" | "Sell";
};

type BacktestClusterGroup = {
  id: BacktestClusterGroupId;
  label: string;
  description: string;
  count: number;
  wins: number;
  losses: number;
  buyCount: number;
  sellCount: number;
  pnl: number;
  maxWin: number;
  maxLoss: number;
  avgPnl: number;
  avgHoldMinutes: number;
  avgConfidence: number;
  winRate: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  accent: string;
  fill: string;
  border: string;
  glow: string;
  members: string[];
};

type ActionItem = {
  id: string;
  tradeId: string;
  symbol: string;
  label: string;
  details: string;
  time: string;
  timestamp: UTCTimestamp;
};

type NotificationTone = "up" | "down" | "neutral";

type NotificationItem = {
  id: string;
  title: string;
  details: string;
  time: string;
  timestamp: number;
  tone: NotificationTone;
  live?: boolean;
};

type ActiveTrade = {
  symbol: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  markPrice: number;
  targetPrice: number;
  stopPrice: number;
  openedAt: UTCTimestamp;
  openedAtLabel: string;
  elapsed: string;
  pnlPct: number;
  pnlValue: number;
  progressPct: number;
  rr: number;
};

type ModelProfile = {
  id: string;
  name: string;
  kind: "Person" | "Model";
  accountNumber?: string;
  riskMin: number;
  riskMax: number;
  rrMin: number;
  rrMax: number;
  longBias: number;
  winRate: number;
};

type TradingTerminalProps = {
  aiZipModelNames: string[];
};

type TradeBlueprint = {
  id: string;
  modelId: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  entryMs: number;
  exitMs: number;
  riskPct: number;
  rr: number;
  units: number;
};

type OverlayTrade = {
  id: string;
  symbol: string;
  side: TradeSide;
  status: "closed" | "pending";
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  result: TradeResult;
  pnlUsd: number;
};

type MultiTradeOverlaySeries = {
  profitZone: ISeriesApi<"Baseline">;
  lossZone: ISeriesApi<"Baseline">;
  entryLine: ISeriesApi<"Line">;
  targetLine: ISeriesApi<"Line">;
  stopLine: ISeriesApi<"Line">;
  pathLine: ISeriesApi<"Line">;
};

type ChartDataWindow = {
  from: number;
  to: number;
};

type MarketApiCandle = {
  time: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
};

type PropFirmResult = {
  probability: number;
  data: number[];
};

type PropFirmChartPoint = {
  x: number;
  y: number;
};

type PropFirmStats = {
  avgTradesPass: number;
  avgTradesFail: number;
  avgTimePass: number;
  avgTimeFail: number;
  avgWinRatePass: number;
  avgWinRateFail: number;
  avgWinRateOverall: number;
  passCount: number;
  failCount: number;
  incompleteCount: number;
  totalSimulations: number;
  randomProgressRuns: PropFirmChartPoint[][];
  dailyLossRun?: PropFirmChartPoint[];
  minX: number;
  maxX: number;
};

type AiValidationMode = "off" | "split" | "online" | "synthetic";
type AiDistanceMetric = "euclidean" | "cosine" | "manhattan" | "chebyshev";
type AiCompressionMethod = "pca" | "jl" | "hash" | "variance" | "subsample";
type KnnVoteMode = "distance" | "majority";

type AiModelState = 0 | 1 | 2;
type AiFeatureLevel = 0 | 1 | 2 | 3 | 4;
type AiFeatureMode = "individual" | "ensemble";

type AiFeatureDef = {
  id: string;
  label: string;
  note?: string;
  model?: string;
};

type AiLibraryFieldType = "boolean" | "number" | "select" | "text";

type AiLibraryField = {
  key: string;
  label: string;
  type: AiLibraryFieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  help?: string;
};

type AiLibrarySettingValue = boolean | number | string;
type AiLibrarySettings = Record<string, Record<string, AiLibrarySettingValue>>;

type AiLibraryDef = {
  id: string;
  name: string;
  description: string;
  defaults: Record<string, AiLibrarySettingValue>;
  fields: AiLibraryField[];
};

type StatsRefreshOverlayMode = "idle" | "hold" | "loading";

type BacktestSettingsSnapshot = {
  symbol: string;
  timeframe: Timeframe;
  statsDateStart: string;
  statsDateEnd: string;
  enabledBacktestWeekdays: string[];
  enabledBacktestSessions: string[];
  enabledBacktestMonths: number[];
  enabledBacktestHours: number[];
  aiMode: "off" | "knn" | "hdbscan";
  aiFilterEnabled: boolean;
  confidenceThreshold: number;
  tpDollars: number;
  slDollars: number;
  dollarsPerMove: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
  aiModelStates: Record<string, AiModelState>;
  aiFeatureLevels: Record<string, AiFeatureLevel>;
  aiFeatureModes: Record<string, AiFeatureMode>;
  selectedAiLibraries: string[];
  selectedAiLibrarySettings: AiLibrarySettings;
  chunkBars: number;
  selectedAiDomains: string[];
  dimensionAmount: number;
  compressionMethod: AiCompressionMethod;
  hdbMinClusterSize: number;
  hdbMinSamples: number;
  hdbEpsQuantile: number;
  staticLibrariesClusters: boolean;
  antiCheatEnabled: boolean;
  validationMode: AiValidationMode;
};

type AiSettingsModalProps = {
  title: string;
  subtitle?: string;
  size?: "default" | "wide" | "xwide";
  bodyClassName?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

type DimensionSortColumn =
  | "name"
  | "corr"
  | "winLow"
  | "winHigh"
  | "lift"
  | "optimal"
  | "min"
  | "max";

type DimensionScope = "active" | "all";

type DimensionStatRow = {
  key: string;
  featureId: string;
  name: string;
  corr: number;
  absCorr: number;
  min: number;
  max: number;
  qLow: number;
  qHigh: number;
  winLow: number | null;
  winHigh: number | null;
  lift: number | null;
  optimal: string;
  n: number;
};

type DimensionStatsSummary = {
  mode: "all" | "split";
  split: number;
  count: number;
  baselineWin: number | null;
  dimKeyOrder: string[];
  dims: DimensionStatRow[];
  keptKeys: string[];
  inDim: number;
  outDim: number;
};

const AI_MODEL_FALLBACK_NAMES = [
  "Momentum",
  "Mean Reversion",
  "Seasons",
  "Time of Day",
  "Fibonacci",
  "Support / Resistance"
] as const;

const BASE_AI_FEATURE_OPTIONS: AiFeatureDef[] = [
  { id: "pricePath", label: "Price Path", note: "OHLC and return shape inside the current window." },
  { id: "rangeTrend", label: "Range / Trend", note: "Window range plus directional drift." },
  { id: "wicks", label: "Wicks", note: "Wick versus body structure." },
  { id: "time", label: "Time", note: "Time-of-day and intraday cycle context." },
  { id: "temporal", label: "Temporal", note: "Explicit year, month, weekday, and hour context." },
  { id: "position", label: "Position", note: "Position inside the local range and level proximity." },
  {
    id: "topography",
    label: "Topography",
    note: "Terrain roughness: pivots, curvature, and choppiness."
  }
];

const MODEL_AI_FEATURE_OPTIONS_BY_MODEL: Record<string, AiFeatureDef[]> = {
  Momentum: [
    {
      id: "mf__momentum__core",
      label: "Momentum Feature",
      note: "Trend, persistence, acceleration, and drift context.",
      model: "Momentum"
    }
  ],
  "Mean Reversion": [
    {
      id: "mf__mean_reversion__core",
      label: "Mean Reversion Feature",
      note: "Z-score, crossings, overshoot, and snapback context.",
      model: "Mean Reversion"
    }
  ],
  Seasons: [
    {
      id: "mf__seasons__core",
      label: "Seasonality Feature",
      note: "Day-of-year and time-of-day phase with seasonal volatility context.",
      model: "Seasons"
    }
  ],
  "Time of Day": [
    {
      id: "mf__time_of_day__core",
      label: "Time-of-Day Feature",
      note: "Hour phase plus intraday drift and volatility context.",
      model: "Time of Day"
    }
  ],
  Fibonacci: [
    {
      id: "mf__fibonacci__core",
      label: "Fibonacci Feature",
      note: "Distances to key fib levels plus swing context.",
      model: "Fibonacci"
    }
  ],
  "Support / Resistance": [
    {
      id: "mf__support_resistance__core",
      label: "S/R Feature",
      note: "Support and resistance proximity with touch density context.",
      model: "Support / Resistance"
    }
  ]
};

const MODEL_AI_FEATURE_OPTIONS = Object.values(MODEL_AI_FEATURE_OPTIONS_BY_MODEL).flat();
const AI_FEATURE_OPTIONS: AiFeatureDef[] = [...BASE_AI_FEATURE_OPTIONS, ...MODEL_AI_FEATURE_OPTIONS];

const FEATURE_LEVEL_LABEL: Record<AiFeatureLevel, string> = {
  0: "None",
  1: "Very Light",
  2: "Light",
  3: "Heavy",
  4: "Very Heavy"
};

const FEATURE_LEVEL_TAKES: Record<string, number[]> = {
  pricePath: [0, 6, 14, 28, 60],
  rangeTrend: [0, 2, 4, 6, 10],
  wicks: [0, 1, 2, 4, 6],
  time: [0, 2, 4, 6, 8],
  temporal: [0, 4, 8, 12, 16],
  position: [0, 2, 4, 6, 10],
  topography: [0, 3, 6, 9, 12],
  mf__momentum__core: [0, 4, 8, 12, 16],
  mf__mean_reversion__core: [0, 4, 8, 12, 16],
  mf__seasons__core: [0, 4, 8, 12, 16],
  mf__time_of_day__core: [0, 4, 8, 12, 16],
  mf__fibonacci__core: [0, 4, 8, 12, 16],
  mf__support_resistance__core: [0, 4, 8, 12, 16]
};

const getAiFeatureWindowBars = (windowBars: number): number => {
  return Math.max(1, clamp(Math.round(windowBars), 2, 120));
};

const buildInitialAiModelStates = (modelNames: readonly string[]): Record<string, AiModelState> => {
  const next: Record<string, AiModelState> = {};

  modelNames.forEach((modelName, index) => {
    next[modelName] = index < 3 ? 1 : 0;
  });

  return next;
};

const syncAiModelStates = (
  current: Record<string, AiModelState>,
  modelNames: readonly string[]
): Record<string, AiModelState> => {
  const defaults = buildInitialAiModelStates(modelNames);
  const next: Record<string, AiModelState> = {};

  for (const modelName of modelNames) {
    next[modelName] = current[modelName] ?? defaults[modelName] ?? 0;
  }

  const currentKeys = Object.keys(current);

  if (currentKeys.length !== modelNames.length) {
    return next;
  }

  for (const modelName of modelNames) {
    if ((current[modelName] ?? 0) !== next[modelName]) {
      return next;
    }
  }

  return current;
};

const buildInitialAiFeatureLevels = (): Record<string, AiFeatureLevel> => {
  const next: Record<string, AiFeatureLevel> = {};

  for (const feature of AI_FEATURE_OPTIONS) {
    next[feature.id] = feature.id.startsWith("mf__") ? 0 : 2;
  }

  return next;
};

const buildInitialAiFeatureModes = (): Record<string, AiFeatureMode> => {
  const next: Record<string, AiFeatureMode> = {};

  for (const feature of AI_FEATURE_OPTIONS) {
    next[feature.id] = "individual";
  }

  return next;
};

const getAiModelStateLabel = (state: AiModelState): "OFF" | "ENTRY" | "BOTH" => {
  if (state === 2) {
    return "BOTH";
  }

  if (state === 1) {
    return "ENTRY";
  }

  return "OFF";
};

const getNextAiModelState = (state: AiModelState, mouseButton: number): AiModelState => {
  if (mouseButton === 2) {
    return state === 2 ? 0 : 2;
  }

  return state === 1 ? 0 : 1;
};

const getNextAiFeatureLevel = (level: AiFeatureLevel): AiFeatureLevel => {
  return ((level + 1) % 5) as AiFeatureLevel;
};

const BASE_AI_LIBRARY_DEFS: AiLibraryDef[] = [
  {
    id: "core",
    name: "Online Learning",
    description: "Primary rolling trade memory.",
    defaults: { weight: 100, maxSamples: 10000, stride: 0 },
    fields: [
      {
        key: "weight",
        label: "Weight (%)",
        type: "number",
        min: 0,
        max: 500,
        step: 5,
        help: "200% means 2x influence on neighbor votes."
      },
      {
        key: "stride",
        label: "Stride",
        type: "number",
        min: 0,
        max: 5000,
        step: 1
      },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100,
        help: "Soft cap on the number of examples kept for this library."
      }
    ]
  },
  {
    id: "suppressed",
    name: "Suppressed",
    description:
      "Trades rejected because AI confidence is below the entry threshold (training-only neighbors).",
    defaults: { weight: 100, maxSamples: 10000, stride: 0 },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "recent",
    name: "Recent Window",
    description: "Bias the nearest, freshest examples.",
    defaults: { weight: 100, windowTrades: 1500, maxSamples: 10000, stride: 0 },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      {
        key: "windowTrades",
        label: "Window (trades)",
        type: "number",
        min: 50,
        step: 50,
        help: "How many most-recent trades are eligible."
      },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "base",
    name: "Base Seeding",
    description: "Seed a starter library before live trades.",
    defaults: {
      weight: 100,
      maxSamples: 10000,
      stride: 0,
      tpDollars: 250,
      slDollars: 250,
      jumpToResolution: true
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      {
        key: "tpDollars",
        label: "TP ($)",
        type: "number",
        min: 1,
        max: 20000,
        step: 25,
        help: "Take-profit size in dollars for seeded trades."
      },
      {
        key: "slDollars",
        label: "SL ($)",
        type: "number",
        min: 1,
        max: 20000,
        step: 25,
        help: "Stop-loss size in dollars for seeded trades."
      },
      {
        key: "jumpToResolution",
        label: "Jump to resolution",
        type: "boolean",
        help: "If ON, the seeder places the next pair of trades when the prior trade resolves."
      },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "tokyo",
    name: "Tokyo",
    description: "Base seeding restricted to the Tokyo session.",
    defaults: {
      weight: 100,
      maxSamples: 8000,
      stride: 0,
      tpDollars: 250,
      slDollars: 250,
      jumpToResolution: true
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      { key: "tpDollars", label: "TP ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "slDollars", label: "SL ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "jumpToResolution", label: "Jump to resolution", type: "boolean" },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "sydney",
    name: "Sydney",
    description: "Base seeding restricted to the Sydney session.",
    defaults: {
      weight: 100,
      maxSamples: 8000,
      stride: 0,
      tpDollars: 250,
      slDollars: 250,
      jumpToResolution: true
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      { key: "tpDollars", label: "TP ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "slDollars", label: "SL ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "jumpToResolution", label: "Jump to resolution", type: "boolean" },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "london",
    name: "London",
    description: "Base seeding restricted to the London session.",
    defaults: {
      weight: 100,
      maxSamples: 8000,
      stride: 0,
      tpDollars: 250,
      slDollars: 250,
      jumpToResolution: true
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      { key: "tpDollars", label: "TP ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "slDollars", label: "SL ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "jumpToResolution", label: "Jump to resolution", type: "boolean" },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "newyork",
    name: "New York",
    description: "Base seeding restricted to the New York session.",
    defaults: {
      weight: 100,
      maxSamples: 8000,
      stride: 0,
      tpDollars: 250,
      slDollars: 250,
      jumpToResolution: true
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      { key: "tpDollars", label: "TP ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "slDollars", label: "SL ($)", type: "number", min: 1, max: 20000, step: 25 },
      { key: "jumpToResolution", label: "Jump to resolution", type: "boolean" },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "terrific",
    name: "Terrific Trades",
    description: "Hand-picked high quality trades.",
    defaults: {
      weight: 100,
      maxSamples: 10000,
      count: 500,
      stride: 0,
      pivotSpan: 4
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      { key: "count", label: "Count", type: "number", min: 0, max: 200000, step: 10 },
      { key: "pivotSpan", label: "Pivot Bars", type: "number", min: 2, max: 50, step: 1 },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  },
  {
    id: "terrible",
    name: "Terrible Trades",
    description: "Counterexamples for contrast.",
    defaults: {
      weight: 100,
      maxSamples: 10000,
      count: 500,
      stride: 0,
      pivotSpan: 4
    },
    fields: [
      { key: "weight", label: "Weight (%)", type: "number", min: 0, max: 500, step: 5 },
      { key: "stride", label: "Stride", type: "number", min: 0, max: 5000, step: 1 },
      { key: "count", label: "Count", type: "number", min: 0, max: 200000, step: 10 },
      { key: "pivotSpan", label: "Pivot Bars", type: "number", min: 2, max: 50, step: 1 },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100
      }
    ]
  }
];

const slugAiLibraryId = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const buildModelAiLibraryDefs = (modelNames: readonly string[]): AiLibraryDef[] => {
  return modelNames.map((model) => ({
    id: slugAiLibraryId(model),
    name: model,
    description: `Similarity pool for ${model}.`,
    defaults: {
      weight: 100,
      maxSamples: 10000,
      stride: 0,
      model,
      kind: "model_sim"
    },
    fields: [
      {
        key: "weight",
        label: "Weight (%)",
        type: "number",
        min: 0,
        max: 500,
        step: 5,
        help: "200% means 2x influence on neighbor votes."
      },
      {
        key: "stride",
        label: "Stride",
        type: "number",
        min: 0,
        max: 5000,
        step: 1
      },
      {
        key: "maxSamples",
        label: "Amount of Samples",
        type: "number",
        min: 0,
        max: 100000,
        step: 100,
        help: "Caps how many examples are pulled from this library."
      }
    ]
  }));
};

const AI_LIBRARY_TARGET_WIN_RATE_KEY = "targetWinRate";
const AI_LIBRARY_TARGET_WIN_RATE_FIELD: AiLibraryField = {
  key: AI_LIBRARY_TARGET_WIN_RATE_KEY,
  label: "Target Win Rate (%)",
  type: "number",
  min: 0,
  max: 100,
  step: 1,
  help: "Trim this library's loaded neighbors toward the requested win ratio."
};

const withAiLibraryTargetWinRateField = (definition: AiLibraryDef): AiLibraryDef => {
  if (definition.fields.some((field) => field.key === AI_LIBRARY_TARGET_WIN_RATE_KEY)) {
    return definition;
  }

  const fields = [...definition.fields];
  const maxSamplesIndex = fields.findIndex((field) => field.key === "maxSamples");
  const insertAt = maxSamplesIndex >= 0 ? maxSamplesIndex : fields.length;
  fields.splice(insertAt, 0, AI_LIBRARY_TARGET_WIN_RATE_FIELD);
  return {
    ...definition,
    fields
  };
};

const buildAiLibraryDefs = (modelNames: readonly string[]): AiLibraryDef[] => {
  return [...BASE_AI_LIBRARY_DEFS, ...buildModelAiLibraryDefs(modelNames)].map(
    withAiLibraryTargetWinRateField
  );
};

const buildDefaultAiLibrarySettings = (libraryDefs: readonly AiLibraryDef[]): AiLibrarySettings => {
  const next: AiLibrarySettings = {};

  for (const definition of libraryDefs) {
    next[definition.id] = { ...definition.defaults };
  }

  return next;
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

const AI_DOMAIN_OPTIONS = [
  "Direction",
  "Model",
  "Session",
  "Month",
  "Weekday",
  "Hour"
] as const;

const AI_VALIDATION_ORDER: AiValidationMode[] = ["off", "split", "online", "synthetic"];
const AI_VALIDATION_LABELS: Record<AiValidationMode, string> = {
  off: "Off",
  split: "Test/Split",
  online: "Online",
  synthetic: "Synthetic"
};
const AI_REALISM_LABELS = ["Off", "Low", "Medium", "High", "Max"] as const;
const DIMENSION_STATS_SPLIT_PCT = 50;
const DIMENSION_FEATURE_NAME_BANK: Record<string, string[]> = {
  pricePath: [
    "Return mean",
    "Return std",
    "Return max",
    "Return min",
    "Abs return sum",
    "Close position in range",
    "Trend (net return)",
    "Range (high-low)",
    "Body mean",
    "Upper wick mean",
    "Lower wick mean",
    "Bull candle fraction",
    "Bear candle fraction",
    "Reversal rate",
    "Chop ratio",
    "Last return",
    "First return",
    "Return p25",
    "Return p50",
    "Return p75"
  ],
  rangeTrend: [
    "Range (high-low)",
    "Trend (net return)",
    "Range/|Trend|",
    "Chop ratio",
    "Bull-Bear imbalance",
    "Abs return mean"
  ],
  wicks: ["Wick/body ratio", "Upper wick mean", "Lower wick mean", "Wick asymmetry", "Doji rate"],
  time: ["Hour sin", "Hour cos", "Minute sin", "Minute cos"],
  temporal: [
    "Year (normalized)",
    "Month sin",
    "Month cos",
    "Day-of-week sin",
    "Day-of-week cos",
    "Hour sin",
    "Hour cos",
    "Day-of-year sin",
    "Day-of-year cos",
    "Week-of-year (normalized)"
  ],
  position: [
    "Close position in range",
    "Distance to high (norm)",
    "Distance to low (norm)",
    "Proximity to high",
    "Proximity to low",
    "Range percentile (proxy)"
  ],
  topography: [
    "Bull candle fraction",
    "Bear candle fraction",
    "Bull-Bear imbalance",
    "Abs return mean",
    "Abs return std",
    "Reversal rate",
    "Chop ratio",
    "Wick/body ratio",
    "Body mean"
  ],
  mf__momentum__core: [
    "Return mean",
    "Return std",
    "Return max",
    "Return min",
    "Abs return sum",
    "Trend (net return)",
    "Range",
    "Bull fraction",
    "Bear fraction",
    "Persistence",
    "Reversal rate",
    "Chop ratio",
    "Last return",
    "First return",
    "Acceleration",
    "Skew proxy"
  ],
  mf__mean_reversion__core: [
    "Z mean",
    "Z std",
    "Z max",
    "Z min",
    "Abs Z mean",
    "Crossings rate",
    "Last Z",
    "Mid Z",
    "Last-Mid Z",
    "Overshoot high",
    "Overshoot low",
    "Snapback proxy",
    "Wick score",
    "Chop ratio",
    "Range",
    "Trend"
  ],
  mf__seasons__core: [
    "sin(TOD)",
    "cos(TOD)",
    "sin(DOY)",
    "cos(DOY)",
    "DOY",
    "TOD",
    "Range",
    "Trend",
    "Abs return mean",
    "Abs return std",
    "Chop ratio",
    "Wick/body",
    "Bull fraction",
    "Bear fraction",
    "Reversal rate",
    "Position"
  ],
  mf__time_of_day__core: [
    "sin(TOD)",
    "cos(TOD)",
    "TOD",
    "Range",
    "Trend",
    "Abs return mean",
    "Abs return std",
    "Chop ratio",
    "Wick/body",
    "Bull fraction",
    "Bear fraction",
    "Reversal rate",
    "Position",
    "Last return",
    "Accel",
    "Vol burst"
  ],
  mf__fibonacci__core: [
    "p0-0.236",
    "p0-0.382",
    "p0-0.5",
    "p0-0.618",
    "p0-0.786",
    "Nearest level dist",
    "Signed nearest dist",
    "Range",
    "Trend",
    "Position",
    "Abs return mean",
    "Abs return std",
    "Chop ratio",
    "Bull fraction",
    "Bear fraction",
    "Reversal rate"
  ],
  mf__support_resistance__core: [
    "Dist to support",
    "Dist to resistance",
    "Support touches",
    "Resistance touches",
    "Near-support flag",
    "Near-resistance flag",
    "Range",
    "Trend",
    "Position",
    "Abs return mean",
    "Abs return std",
    "Chop ratio",
    "Wick/body",
    "Bull fraction",
    "Bear fraction",
    "Reversal rate"
  ]
};

const featureTakeCount = (featureId: string, level: number): number => {
  const normalizedLevel = clamp(Math.round(level) || 0, 0, 4);
  const steps = FEATURE_LEVEL_TAKES[featureId] ?? [0, 2, 4, 6, 8];
  const take = Number(steps[normalizedLevel] ?? 0) || 0;
  const names = DIMENSION_FEATURE_NAME_BANK[featureId];

  return names && names.length > 0 ? Math.min(take, names.length) : take;
};

const countConfiguredAiFeatureDimensions = (
  featureLevels: Record<string, AiFeatureLevel>,
  featureModes: Record<string, AiFeatureMode>,
  chunkBars: number
): number => {
  const parts = getAiFeatureWindowBars(chunkBars);
  let total = 0;

  for (const feature of AI_FEATURE_OPTIONS) {
    const take = featureTakeCount(feature.id, featureLevels[feature.id] ?? 0);

    if (take <= 0) {
      continue;
    }

    total += take * ((featureModes[feature.id] ?? "individual") === "individual" ? parts : 1);
  }

  return total;
};

const toggleListValue = (values: string[], value: string): string[] => {
  if (values.includes(value)) {
    return values.filter((entry) => entry !== value);
  }

  return [...values, value];
};

const AiSettingsModal = ({
  title,
  subtitle,
  size = "default",
  bodyClassName,
  open,
  onClose,
  children
}: AiSettingsModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="ai-zip-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`ai-zip-modal-card ${size !== "default" ? `size-${size}` : ""}`}>
        <div className="ai-zip-modal-head">
          <div className="ai-zip-modal-title-wrap">
            <strong>{title}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button type="button" className="ai-zip-button pill" onClick={onClose}>
            Close
          </button>
        </div>
        <div className={`ai-zip-modal-body ${bodyClassName ?? ""}`.trim()}>{children}</div>
      </div>
    </div>
  );
};

const hashSeedFromText = (seedText: string): number => {
  let seed = 0;

  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }

  return seed;
};

const createPseudoAccountNumber = (seedText: string): string => {
  const seed = hashSeedFromText(seedText);

  return String(10_000_000 + (seed % 90_000_000));
};

const createModelId = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
};

const basePersonProfile: ModelProfile = {
  id: "korra",
  name: "Korra",
  kind: "Person",
  accountNumber: createPseudoAccountNumber("korra"),
  riskMin: 0.0018,
  riskMax: 0.0048,
  rrMin: 1.35,
  rrMax: 2.6,
  longBias: 0.57,
  winRate: 0.61
};

const createSyntheticModelProfile = (name: string): ModelProfile => {
  const seed = hashSeedFromText(name);
  const sample = (shift: number) => ((seed >>> shift) & 255) / 255;
  const riskMin = 0.0011 + sample(0) * 0.001;
  const rrMin = 1.1 + sample(8) * 0.75;

  return {
    id: createModelId(name),
    name,
    kind: "Model",
    riskMin,
    riskMax: riskMin + 0.0018 + sample(16) * 0.0022,
    rrMin,
    rrMax: rrMin + 0.75 + sample(24) * 1,
    longBias: 0.45 + sample(4) * 0.12,
    winRate: 0.5 + sample(12) * 0.14
  };
};

const buildModelProfiles = (aiZipModelNames: string[]): ModelProfile[] => {
  const seen = new Set<string>([basePersonProfile.id]);
  const profiles: ModelProfile[] = [basePersonProfile];

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

const futuresAssets: FutureAsset[] = [
  {
    symbol: "XAUUSD",
    name: "XAU / USD",
    basePrice: 2945.25,
    openInterest: "CSV + LIVE",
    funding: "CFD"
  }
];

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

const marketTimeframeMap: Record<Timeframe, string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

const timeframeMinutes: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1H": 60,
  "4H": 240,
  "1D": 1440,
  "1W": 10080
};

const timeframeVisibleCount: Record<Timeframe, number> = {
  "1m": 150,
  "5m": 130,
  "15m": 115,
  "1H": 100,
  "4H": 88,
  "1D": 74,
  "1W": 62
};

const sidebarTabs: Array<{ id: PanelTab; label: string }> = [
  { id: "assets", label: "Assets" },
  { id: "active", label: "Active" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" },
  { id: "ai", label: "AI" },
  { id: "mt5", label: "Copy Trade" }
];

const surfaceTabs: Array<{ id: SurfaceTab; label: string }> = [
  { id: "chart", label: "Chart" },
  { id: "backtest", label: "Backtest" }
];

const backtestTabs: Array<{ id: BacktestTab; label: string }> = [
  { id: "mainSettings", label: "Main Settings" },
  { id: "timeSettings", label: "Time Settings" },
  { id: "mainStats", label: "Main Statistics" },
  { id: "history", label: "Trading History" },
  { id: "calendar", label: "Calendar" },
  { id: "cluster", label: "Cluster Map" },
  { id: "performanceStats", label: "Performance Statistics" },
  { id: "entryExit", label: "Entry / Exit Stats" },
  { id: "dimensions", label: "Dimension Statistics" },
  { id: "propFirm", label: "Prop Firm Tool" }
];

const backtestWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const backtestSessionLabels = ["Tokyo", "London", "New York", "Sydney"] as const;
const backtestMonthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;
const backtestHourLabels = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`
);

const BACKTEST_CLUSTER_META: Record<
  BacktestClusterGroupId,
  {
    label: string;
    description: string;
    accent: string;
    fill: string;
    border: string;
    glow: string;
  }
> = {
  momentum: {
    label: "Momentum",
    description: "Fast winners that resolve quickly with clean follow-through.",
    accent: "rgba(60, 220, 120, 0.96)",
    fill: "rgba(60, 220, 120, 0.14)",
    border: "rgba(60, 220, 120, 0.46)",
    glow: "rgba(60, 220, 120, 0.24)"
  },
  trend: {
    label: "Trend Hold",
    description: "Winners that need more time but keep directional conviction.",
    accent: "rgba(0, 210, 255, 0.96)",
    fill: "rgba(0, 210, 255, 0.14)",
    border: "rgba(0, 210, 255, 0.46)",
    glow: "rgba(0, 210, 255, 0.24)"
  },
  trap: {
    label: "Trap",
    description: "Losses that extend before the move fully invalidates.",
    accent: "rgba(230, 80, 80, 0.96)",
    fill: "rgba(230, 80, 80, 0.14)",
    border: "rgba(230, 80, 80, 0.46)",
    glow: "rgba(230, 80, 80, 0.24)"
  },
  chop: {
    label: "Chop",
    description: "Short-lived noise trades with shallow edge.",
    accent: "rgba(255, 140, 0, 0.96)",
    fill: "rgba(255, 140, 0, 0.14)",
    border: "rgba(255, 140, 0, 0.46)",
    glow: "rgba(255, 140, 0, 0.24)"
  }
};

const BACKTEST_CLUSTER_ORDER: BacktestClusterGroupId[] = [
  "momentum",
  "trend",
  "trap",
  "chop"
];

const BACKTEST_CLUSTER_LEGEND_DEFAULTS: Record<BacktestClusterLegendKey, boolean> = {
  closedWin: true,
  closedLoss: true,
  momentum: true,
  trend: true,
  trap: true,
  chop: true
};

const chartHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": 40000,
  "5m": 12000,
  "15m": 8000,
  "1H": 3000,
  "4H": 1500,
  "1D": 700,
  "1W": 180
};

const RECENT_ONE_MINUTE_LOOKBACK_DAYS = 31;
const RECENT_ONE_MINUTE_WINDOW_MS = RECENT_ONE_MINUTE_LOOKBACK_DAYS * 24 * 60 * 60_000;
const RECENT_ONE_MINUTE_FETCH_COUNT = 40_000;
const BACKTEST_LOOKBACK_YEARS = 10;
const BACKTEST_MAX_HISTORY_CANDLES = 400_000;
const BACKTEST_ONE_MINUTE_FETCH_COUNT = 500_000;
const BACKTEST_TARGET_TRADES_PER_DAY = 4;
const BACKTEST_HISTORY_PAGE_SIZE = 250;

const symbolTimeframeKey = (symbol: string, timeframe: Timeframe) => {
  return `${symbol}__${timeframe}`;
};

const getTimeframeMs = (timeframe: Timeframe): number => {
  return timeframeMinutes[timeframe] * 60_000;
};

const floorToTimeframe = (timestampMs: number, timeframe: Timeframe): number => {
  const step = getTimeframeMs(timeframe);
  return Math.floor(timestampMs / step) * step;
};

const isXauTradingTime = (timestampMs: number): boolean => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (day === 6) {
    return false;
  }

  if (day === 5 && hour >= 22) {
    return false;
  }

  if (day === 0 && hour < 23) {
    return false;
  }

  if (day >= 1 && day <= 4 && hour === 22) {
    return false;
  }

  return true;
};

const normalizeMarketCandles = (candles: MarketApiCandle[]): Candle[] => {
  const normalized = candles
    .map((candle) => {
      let timeValue = Number.NaN;

      if (typeof candle.time === "number") {
        timeValue = candle.time;
      } else {
        const numericTime = Number(candle.time);
        timeValue = Number.isFinite(numericTime) ? numericTime : Date.parse(String(candle.time));
      }

      const time = timeValue > 1_000_000_000_000 ? timeValue : timeValue * 1000;
      const open = Number(candle.open);
      const highRaw = Number(candle.high);
      const lowRaw = Number(candle.low);
      const close = Number(candle.close);
      const high = Math.max(open, highRaw, lowRaw, close);
      const low = Math.min(open, highRaw, lowRaw, close);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !isXauTradingTime(time)
      ) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close
      };
    })
    .filter((candle): candle is Candle => candle !== null)
    .sort((a, b) => a.time - b.time);

  const deduped: Candle[] = [];

  for (const candle of normalized) {
    const previous = deduped[deduped.length - 1];

    if (previous && previous.time === candle.time) {
      deduped[deduped.length - 1] = candle;
      continue;
    }

    deduped.push(candle);
  }

  return deduped;
};

const mergeLivePriceIntoCandles = (
  candles: Candle[],
  price: number,
  timestampMs: number,
  timeframe: Timeframe
): Candle[] => {
  const bucketTime = floorToTimeframe(timestampMs, timeframe);

  if (!isXauTradingTime(bucketTime)) {
    return candles;
  }

  if (candles.length === 0) {
    return [
      {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price
      }
    ];
  }

  const next = candles.slice();
  const last = next[next.length - 1];

  if (bucketTime < last.time) {
    return candles;
  }

  if (bucketTime === last.time) {
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price
    };
  } else {
    const previousClose = last.close;

    next.push({
      time: bucketTime,
      open: previousClose,
      high: Math.max(previousClose, price),
      low: Math.min(previousClose, price),
      close: price
    });
  }

  const maxBars = chartHistoryCountByTimeframe[timeframe];

  return next.length > maxBars ? next.slice(next.length - maxBars) : next;
};

const mergeRecentCandles = (
  historical: Candle[],
  liveWindow: Candle[],
  maxBars: number
): Candle[] => {
  if (liveWindow.length === 0) {
    return historical.slice(-maxBars);
  }

  const firstLiveTime = liveWindow[0].time;
  const merged = [...historical.filter((row) => row.time < firstLiveTime), ...liveWindow];
  const deduped: Candle[] = [];

  for (const row of merged) {
    const previous = deduped[deduped.length - 1];

    if (previous && previous.time === row.time) {
      deduped[deduped.length - 1] = row;
    } else {
      deduped.push(row);
    }
  }

  return deduped.slice(-maxBars);
};

const aggregateCandlesToTimeframe = (candles: Candle[], timeframe: Timeframe): Candle[] => {
  if (candles.length === 0) {
    return [];
  }

  if (timeframe === "1m") {
    return candles.slice();
  }

  const aggregated: Candle[] = [];
  let activeBucket: Candle | null = null;

  for (const candle of candles) {
    const bucketTime = floorToTimeframe(candle.time, timeframe);

    if (!isXauTradingTime(bucketTime)) {
      continue;
    }

    if (!activeBucket || activeBucket.time !== bucketTime) {
      if (activeBucket) {
        aggregated.push(activeBucket);
      }

      activeBucket = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      };
      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, candle.high);
    activeBucket.low = Math.min(activeBucket.low, candle.low);
    activeBucket.close = candle.close;
  }

  if (activeBucket) {
    aggregated.push(activeBucket);
  }

  return aggregated;
};

const trimRecentOneMinuteCandles = (candles: Candle[]): Candle[] => {
  const lastCandle = candles[candles.length - 1];

  if (!lastCandle) {
    return [];
  }

  const cutoffTime = lastCandle.time - RECENT_ONE_MINUTE_WINDOW_MS;
  let startIndex = 0;

  while (startIndex < candles.length && candles[startIndex]!.time < cutoffTime) {
    startIndex += 1;
  }

  return candles.slice(startIndex);
};

const mergeHistoricalAndRecentCandles = (
  historical: Candle[],
  recent: Candle[],
  maxBars: number
): Candle[] => {
  if (historical.length === 0) {
    return recent.slice(-maxBars);
  }

  if (recent.length === 0) {
    return historical.slice(-maxBars);
  }

  return mergeRecentCandles(historical, recent, maxBars);
};

const fetchMarketCandles = async (timeframe: Timeframe, limit: number): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    limit: String(Math.min(limit, MARKET_MAX_HISTORY_CANDLES))
  });

  const response = await fetch(`/api/market/candles?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();

  return normalizeMarketCandles(payload.candles || []);
};

const fetchHistoryApiCandles = async (timeframe: Timeframe, count: number): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    count: String(count)
  });

  const response = await fetch(`/api/history/candles?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();

  return normalizeMarketCandles(payload.candles || []);
};

const fetchRecentOneMinuteCandles = async (
  recentOneMinutePromise?: Promise<Candle[]>
): Promise<Candle[]> => {
  if (recentOneMinutePromise) {
    try {
      return await recentOneMinutePromise;
    } catch {
      return [];
    }
  }

  try {
    const recentCandles = await fetchHistoryApiCandles("1m", RECENT_ONE_MINUTE_FETCH_COUNT);
    return trimRecentOneMinuteCandles(recentCandles);
  } catch {
    return [];
  }
};

const fetchHybridHistoryCandles = async (
  timeframe: Timeframe,
  targetBars: number,
  recentOneMinutePromise?: Promise<Candle[]>
): Promise<Candle[]> => {
  const recentTimeframeCandlesPromise = fetchRecentOneMinuteCandles(recentOneMinutePromise).then(
    (candles) => aggregateCandlesToTimeframe(candles, timeframe)
  );

  try {
    const historyCandles = await fetchHistoryApiCandles(
      timeframe,
      Math.min(targetBars, MARKET_MAX_HISTORY_CANDLES)
    );

    if (historyCandles.length >= MIN_SEED_CANDLES) {
      const recentTimeframeCandles = await recentTimeframeCandlesPromise;
      return mergeHistoricalAndRecentCandles(historyCandles, recentTimeframeCandles, targetBars);
    }
  } catch {
    // Leave chart and backtest to use the recent 1m window when deeper history is unavailable.
  }

  const recentTimeframeCandles = await recentTimeframeCandlesPromise;
  return recentTimeframeCandles.slice(-targetBars);
};

const fetchHistoryCandles = async (
  timeframe: Timeframe,
  recentOneMinutePromise?: Promise<Candle[]>
): Promise<Candle[]> => {
  const targetBars = chartHistoryCountByTimeframe[timeframe];
  return fetchHybridHistoryCandles(timeframe, targetBars, recentOneMinutePromise);
};

const fetchBacktestHistoryCandles = async (
  timeframe: Timeframe,
  recentOneMinutePromise?: Promise<Candle[]>
): Promise<Candle[]> => {
  return fetchHybridHistoryCandles(timeframe, BACKTEST_MAX_HISTORY_CANDLES, recentOneMinutePromise);
};

const XAUUSD_PAIR = "XAU_USD";
const MIN_SEED_CANDLES = 40;
const MARKET_MAX_HISTORY_CANDLES = 25_000;
const LIVE_MARKET_SYNC_LIMIT = 160;
const MARKET_API_KEY =
  process.env.NEXT_PUBLIC_PRICE_STREAM_API_KEY ||
  process.env.NEXT_PUBLIC_MARKET_API_KEY ||
  "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq";
const PRICE_STREAM_URL =
  process.env.NEXT_PUBLIC_PRICE_STREAM_URL ||
  "https://oanda-worker-production.up.railway.app/stream/prices";

const hashString = (value: string) => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) + 1;
};

const createSeededRng = (seed: number) => {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;

    return (state - 1) / 2147483646;
  };
};

const formatPrice = (value: number): string => {
  if (value < 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }

  if (value < 100) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });
};

const formatDateTime = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const formatStatsDateLabel = (ymd: string): string => {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
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

const formatUnits = (value: number): string => {
  if (value >= 100) {
    return value.toFixed(0);
  }

  if (value >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(4);
};

const formatUsd = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatSignedUsd = (value: number): string => {
  return `${value >= 0 ? "+" : "-"}$${formatUsd(Math.abs(value))}`;
};

const formatChartUsd = (value: number): string => {
  return `${value < 0 ? "-" : ""}$${formatUsd(Math.abs(value))}`;
};

const formatSignedPercent = (value: number): string => {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const getTradeDayKey = (timestampSeconds: UTCTimestamp): string => {
  return new Date(Number(timestampSeconds) * 1000).toISOString().slice(0, 10);
};

const getTradeMonthKey = (timestampSeconds: UTCTimestamp): string => {
  return getTradeDayKey(timestampSeconds).slice(0, 7);
};

const getTradeMonthIndex = (timestampSeconds: UTCTimestamp): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCMonth();
};

const getTradeCalendarMonthKey = (timestampSeconds: UTCTimestamp): string => {
  return String(getTradeMonthIndex(timestampSeconds) + 1).padStart(2, "0");
};

const getTradeHour = (timestampSeconds: UTCTimestamp): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCHours();
};

const getTradeWeekKey = (timestampSeconds: UTCTimestamp): string => {
  const date = new Date(Number(timestampSeconds) * 1000);
  const day = date.getUTCDay();
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)
  );

  return weekStart.toISOString().slice(0, 10);
};

const getMonthLabel = (monthKey: string): string => {
  const parts = monthKey.split("-");

  if (parts.length === 1) {
    const month = Number(parts[0]);

    if (!Number.isFinite(month)) {
      return monthKey;
    }

    return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", {
      month: "long",
      timeZone: "UTC"
    });
  }

  const [year, month] = parts.map((value) => Number(value));

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
};

const getCurrentTradeMonthKey = (): string => {
  return new Date().toISOString().slice(0, 7);
};

const getCurrentTradeCalendarMonthKey = (): string => {
  return getCurrentTradeMonthKey().slice(5, 7);
};

const shiftTradeMonthKey = (monthKey: string, delta: number): string => {
  const [year, month] = monthKey.split("-").map((value) => Number(value));

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return getCurrentTradeMonthKey();
  }

  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
};

const getCalendarDateLabel = (dateKey: string): string => {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
};

const getWeekdayLabel = (dateKey: string): string => {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
};

const getSessionLabel = (timestampSeconds: UTCTimestamp): string => {
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

const formatMinutesCompact = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0m";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
};

const getHistoryTradeDurationMinutes = (trade: HistoryItem): number => {
  return Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
};

const normalizeBacktestExitReason = (reason?: string | null): string => {
  if (!reason) {
    return "";
  }

  const raw = String(reason).trim();

  if (!raw || raw === "-") {
    return "";
  }

  const upper = raw.toUpperCase();

  if (upper === "TP" || upper.includes("TAKE")) {
    return "Take Profit";
  }

  if (
    upper === "BE" ||
    upper === "BREAKEVEN" ||
    upper === "BREAK-EVEN" ||
    upper.includes("BREAK EVEN")
  ) {
    return "Break Even";
  }

  if (upper === "TSL" || upper.includes("TRAIL")) {
    return "Trailing Stop";
  }

  if (upper === "SL" || upper.includes("STOP")) {
    return "Stop Loss";
  }

  if (upper.includes("MIM") || upper.includes("MIT")) {
    return "MIT";
  }

  if (upper.includes("AI")) {
    return "AI";
  }

  if (upper.includes("MODEL")) {
    return "Model Exit";
  }

  return raw;
};

const getBacktestExitLabel = (trade: HistoryItem): string => {
  const normalized = normalizeBacktestExitReason(trade.exitReason);

  if (normalized) {
    return normalized;
  }

  const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
  const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
  const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);

  if (trade.result === "Win" && realizedGap >= targetGap * 0.84) {
    return "Take Profit";
  }

  if (trade.result === "Loss" && realizedGap >= stopGap * 0.84) {
    return "Stop Loss";
  }

  return "Model Exit";
};

const getEntryExitBarFill = (bucket: string): string => {
  const normalized = bucket.trim().toLowerCase();

  if (normalized === "tp" || normalized.includes("take profit")) {
    return "rgba(34,197,94,0.88)";
  }

  if (normalized === "sl" || normalized.includes("stop loss") || normalized === "stoploss") {
    return "rgba(239,68,68,0.88)";
  }

  if (normalized === "be" || normalized.includes("break even") || normalized.includes("breakeven")) {
    return "rgba(234,179,8,0.88)";
  }

  if (normalized.includes("trail")) {
    return "rgba(251,146,60,0.88)";
  }

  if (normalized.includes("mim") || normalized.includes("model exit")) {
    return "rgba(99,102,241,0.88)";
  }

  if (normalized.includes("ai")) {
    return "rgba(56,189,248,0.88)";
  }

  if (normalized === "none" || normalized === "manual") {
    return "rgba(148,163,184,0.88)";
  }

  if (normalized.includes("momentum")) {
    return "rgba(56,189,248,0.88)";
  }

  if (normalized.includes("mean reversion")) {
    return "rgba(168,85,247,0.88)";
  }

  if (normalized.includes("season")) {
    return "rgba(34,197,94,0.88)";
  }

  if (normalized.includes("time")) {
    return "rgba(251,191,36,0.88)";
  }

  if (normalized.includes("fibo")) {
    return "rgba(99,102,241,0.88)";
  }

  if (normalized.includes("support") || normalized.includes("resistance")) {
    return "rgba(244,114,182,0.88)";
  }

  return "rgba(90,170,255,0.88)";
};

const getPerformanceStatsBarFill = (pnl: number, opacity = 0.88): string => {
  return pnl >= 0
    ? `rgba(34,197,94,${opacity})`
    : `rgba(239,68,68,${opacity})`;
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

const buildBacktestClusterGroups = (nodes: BacktestClusterNode[]): BacktestClusterGroup[] => {
  const groupMap = new Map<
    BacktestClusterGroupId,
    {
      count: number;
      wins: number;
      buyCount: number;
      sellCount: number;
      pnl: number;
      maxWin: number;
      maxLoss: number;
      totalHoldMinutes: number;
      totalConfidence: number;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      members: string[];
    }
  >();

  for (const node of nodes) {
    const current =
      groupMap.get(node.clusterId) ??
      (() => {
        const next = {
          count: 0,
          wins: 0,
          buyCount: 0,
          sellCount: 0,
          pnl: 0,
          maxWin: Number.NEGATIVE_INFINITY,
          maxLoss: Number.POSITIVE_INFINITY,
          totalHoldMinutes: 0,
          totalConfidence: 0,
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          members: [] as string[]
        };
        groupMap.set(node.clusterId, next);
        return next;
      })();

    current.count += 1;
    current.wins += node.trade.result === "Win" ? 1 : 0;
    current.buyCount += node.trade.side === "Long" ? 1 : 0;
    current.sellCount += node.trade.side === "Short" ? 1 : 0;
    current.pnl += node.trade.pnlUsd;
    current.maxWin = Math.max(current.maxWin, node.trade.pnlUsd);
    current.maxLoss = Math.min(current.maxLoss, node.trade.pnlUsd);
    current.totalHoldMinutes += node.holdMinutes;
    current.totalConfidence += node.confidence;
    current.minX = Math.min(current.minX, node.x);
    current.maxX = Math.max(current.maxX, node.x);
    current.minY = Math.min(current.minY, node.y);
    current.maxY = Math.max(current.maxY, node.y);
    current.members.push(node.id);
  }

  return BACKTEST_CLUSTER_ORDER.flatMap((groupId) => {
    const current = groupMap.get(groupId);

    if (!current) {
      return [];
    }

    const meta = BACKTEST_CLUSTER_META[groupId];
    const losses = Math.max(0, current.count - current.wins);
    const centerX = (current.minX + current.maxX) / 2;
    const centerY = (current.minY + current.maxY) / 2;

    return [
      {
        id: groupId,
        label: meta.label,
        description: meta.description,
        count: current.count,
        wins: current.wins,
        losses,
        buyCount: current.buyCount,
        sellCount: current.sellCount,
        pnl: current.pnl,
        maxWin: Number.isFinite(current.maxWin) ? current.maxWin : 0,
        maxLoss: Number.isFinite(current.maxLoss) ? current.maxLoss : 0,
        avgPnl: current.count > 0 ? current.pnl / current.count : 0,
        avgHoldMinutes: current.count > 0 ? current.totalHoldMinutes / current.count : 0,
        avgConfidence: current.count > 0 ? current.totalConfidence / current.count : 0,
        winRate: current.count > 0 ? (current.wins / current.count) * 100 : 0,
        centerX,
        centerY,
        radiusX: clamp((current.maxX - current.minX) * 0.5 + 6, 10, 23),
        radiusY: clamp((current.maxY - current.minY) * 0.5 + 6, 10, 23),
        accent: meta.accent,
        fill: meta.fill,
        border: meta.border,
        glow: meta.glow,
        members: [...current.members]
      }
    ];
  });
};

const buildSparklinePath = (values: number[], width: number, height: number): string => {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.000001, max - min);

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;

      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const formatPropFirmDuration = (mins: number): string => {
  if (!Number.isFinite(mins) || mins <= 0) {
    return "0 Minutes";
  }

  const roundedMinutes = Math.round(mins);
  let remaining = roundedMinutes;
  const minutesPerDay = 1_440;
  const minutesPerWeek = minutesPerDay * 7;
  const weeks = Math.floor(remaining / minutesPerWeek);
  remaining -= weeks * minutesPerWeek;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / 60);
  const minutes = remaining % 60;
  const parts: string[] = [];

  if (weeks) {
    parts.push(`${weeks} Week${weeks === 1 ? "" : "s"}`);
  }

  if (days) {
    parts.push(`${days} Day${days === 1 ? "" : "s"}`);
  }

  if (hours) {
    parts.push(`${hours} Hour${hours === 1 ? "" : "s"}`);
  }

  if (minutes || parts.length === 0) {
    parts.push(`${minutes} Minute${minutes === 1 ? "" : "s"}`);
  }

  return parts.join(parts.length > 1 ? ", " : "");
};

const buildPropFirmLinePath = (
  points: PropFirmChartPoint[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): string => {
  if (points.length === 0) {
    return "";
  }

  const left = 4;
  const right = 96;
  const top = 4;
  const bottom = 36;
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);

  return points
    .map((point, index) => {
      const x = left + ((point.x - minX) / xRange) * (right - left);
      const y = bottom - ((point.y - minY) / yRange) * (bottom - top);

      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const projectPropFirmLineY = (value: number, minY: number, maxY: number): number => {
  const top = 4;
  const bottom = 36;
  const yRange = Math.max(1, maxY - minY);
  return bottom - ((value - minY) / yRange) * (bottom - top);
};

const formatElapsed = (
  openedAtSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): string => {
  const total = Math.max(0, nowSeconds - openedAtSeconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
};

const formatClock = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const clampTradePnlToRiskBounds = (
  pnlUsd: number,
  tpDollars: number,
  slDollars: number
): number => {
  let nextPnl = pnlUsd;
  const maxProfit = Number.isFinite(tpDollars) ? Math.max(0, tpDollars) : 0;
  const maxLoss = Number.isFinite(slDollars) ? Math.max(0, slDollars) : 0;

  if (maxProfit > 0) {
    nextPnl = Math.min(nextPnl, maxProfit);
  }

  if (maxLoss > 0) {
    nextPnl = Math.max(nextPnl, -maxLoss);
  }

  return nextPnl;
};

const getTradeOutcomePriceFromPnl = (
  side: TradeSide,
  entryPrice: number,
  pnlUsd: number,
  units: number
): number => {
  const safeUnits = Math.max(0.000001, Math.abs(units) || 0);
  const direction = side === "Long" ? 1 : -1;

  return Math.max(0.000001, entryPrice + (pnlUsd * direction) / safeUnits);
};

const getTradePnlPctFromUsd = (
  entryPrice: number,
  units: number,
  pnlUsd: number
): number => {
  const notional = Math.max(0.000001, Math.abs(entryPrice) * Math.max(0.000001, Math.abs(units) || 0));

  return (pnlUsd / notional) * 100;
};

const applyHistoryTradePnlBounds = (
  trade: HistoryItem,
  tpDollars: number,
  slDollars: number
): HistoryItem => {
  const boundedPnlUsd = clampTradePnlToRiskBounds(trade.pnlUsd, tpDollars, slDollars);

  if (Math.abs(boundedPnlUsd - trade.pnlUsd) <= 0.000001) {
    return trade;
  }

  return {
    ...trade,
    pnlUsd: boundedPnlUsd,
    pnlPct: getTradePnlPctFromUsd(trade.entryPrice, trade.units, boundedPnlUsd),
    outcomePrice: getTradeOutcomePriceFromPnl(trade.side, trade.entryPrice, boundedPnlUsd, trade.units)
  };
};

const applyHistoryCollectionPnlBounds = (
  trades: HistoryItem[],
  tpDollars: number,
  slDollars: number
): HistoryItem[] => {
  const maxProfit = Number.isFinite(tpDollars) ? Math.max(0, tpDollars) : 0;
  const maxLoss = Number.isFinite(slDollars) ? Math.max(0, slDollars) : 0;

  if (trades.length === 0 || (maxProfit <= 0 && maxLoss <= 0)) {
    return trades;
  }

  let changed = false;
  const nextTrades = trades.map((trade) => {
    const nextTrade = applyHistoryTradePnlBounds(trade, maxProfit, maxLoss);

    if (nextTrade !== trade) {
      changed = true;
    }

    return nextTrade;
  });

  return changed ? nextTrades : trades;
};

const clampChartDataWindow = (totalBars: number, from: number, to: number): ChartDataWindow => {
  if (totalBars <= 0) {
    return { from: 0, to: -1 };
  }

  const maxIndex = totalBars - 1;
  const nextFrom = Math.min(maxIndex, Math.max(0, Math.floor(from)));
  const nextTo = Math.min(maxIndex, Math.max(nextFrom, Math.ceil(to)));

  return { from: nextFrom, to: nextTo };
};

const buildChartDataWindow = (
  totalBars: number,
  visibleFrom: number,
  visibleTo: number
): ChartDataWindow => {
  if (totalBars <= 0) {
    return { from: 0, to: -1 };
  }

  const clampedVisible = clampChartDataWindow(totalBars, visibleFrom, visibleTo);

  // Keep the full loaded candle set mounted so panning and zooming do not
  // trigger window swaps and series rebinds mid-gesture.
  if (clampedVisible.to < clampedVisible.from) {
    return { from: 0, to: -1 };
  }

  return { from: 0, to: totalBars - 1 };
};

const wrapIndex = (value: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }

  return ((value % length) + length) % length;
};

const getExitMarkerPosition = (
  side: TradeSide,
  result: TradeResult
): "aboveBar" | "belowBar" => {
  if (side === "Long") {
    return result === "Win" ? "aboveBar" : "belowBar";
  }

  return result === "Win" ? "belowBar" : "aboveBar";
};

const evaluateTpSlPath = (
  candles: Candle[],
  side: TradeSide,
  entryIndex: number,
  targetPrice: number,
  stopPrice: number,
  toIndex = candles.length - 1
): { hit: boolean; hitIndex: number; outcomePrice: number; result: TradeResult | null } => {
  const safeEndIndex = Math.min(Math.max(entryIndex + 1, toIndex), candles.length - 1);
  let hitIndex = -1;
  let outcomePrice = candles[safeEndIndex]?.close ?? candles[entryIndex]?.close ?? 0;
  let result: TradeResult | null = null;

  for (let i = entryIndex + 1; i <= safeEndIndex; i += 1) {
    const candle = candles[i];

    if (!candle) {
      break;
    }

    const hitTarget = side === "Long" ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = side === "Long" ? candle.low <= stopPrice : candle.high >= stopPrice;

    if (!hitTarget && !hitStop) {
      continue;
    }

    hitIndex = i;

    if (hitTarget && hitStop) {
      const targetFirst =
        Math.abs(candle.open - targetPrice) <= Math.abs(candle.open - stopPrice);
      result = targetFirst ? "Win" : "Loss";
      outcomePrice = targetFirst ? targetPrice : stopPrice;
    } else if (hitTarget) {
      result = "Win";
      outcomePrice = targetPrice;
    } else {
      result = "Loss";
      outcomePrice = stopPrice;
    }

    break;
  }

  return { hit: hitIndex >= 0, hitIndex, outcomePrice, result };
};

const toUtcTimestamp = (ms: number): UTCTimestamp => {
  return Math.floor(ms / 1000) as UTCTimestamp;
};

const parseTimeFromCrosshair = (time: Time): number | null => {
  if (typeof time === "number") {
    return time;
  }

  if (typeof time === "string") {
    const parsed = Date.parse(time);

    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }

  if ("year" in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }

  return null;
};

const getAssetBySymbol = (symbol: string): FutureAsset => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
};

const findCandleIndexAtOrBefore = (candles: Candle[], targetMs: number): number => {
  if (candles.length === 0) {
    return -1;
  }

  if (targetMs < candles[0].time) {
    return -1;
  }

  if (targetMs >= candles[candles.length - 1].time) {
    return candles.length - 1;
  }

  let left = 0;
  let right = candles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = candles[mid].time;

    if (time === targetMs) {
      return mid;
    }

    if (time < targetMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return Math.max(0, right);
};

const humanizeDurationMinutes = (totalMin: number): string => {
  const minutes = Math.max(0, Math.round(totalMin));
  const parts: string[] = [];
  const days = Math.floor(minutes / 1440);
  const remAfterDays = minutes % 1440;
  const hours = Math.floor(remAfterDays / 60);
  const mins = remAfterDays % 60;

  const push = (value: number, word: string) => {
    if (value > 0) {
      parts.push(`${value} ${word}${value === 1 ? "" : "s"}`);
    }
  };

  push(days, "Day");
  push(hours, "Hour");
  push(mins, "Minute");

  if (parts.length === 0) {
    return "0 Minutes";
  }

  if (parts.length === 1) {
    return parts[0]!;
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

const BacktestPerTradeMiniChart = ({
  data,
  yDomain,
  entryPrice,
  tpPrice,
  slPrice,
  side,
  usdPerUnit,
  isOpen
}: {
  data: Array<{
    bar: number;
    price: number;
    high: number;
    low: number;
    up: number | null;
    down: number | null;
    flat: number | null;
    ts?: number;
    candIdx?: number;
    relCand?: number;
  }>;
  yDomain: [number | "auto", number | "auto"];
  entryPrice: number;
  tpPrice: number | null;
  slPrice: number | null;
  side: "BUY" | "SELL";
  usdPerUnit: number;
  isOpen: boolean;
}) => {
  const [reveal, setReveal] = useState(0);

  useEffect(() => {
    let raf = 0;

    if (!isOpen) {
      setReveal(0);
      return () => cancelAnimationFrame(raf);
    }

    const durationMs = 1600;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setReveal(progress);

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const clipId = useId();
  const glowId = useId();
  const direction = side === "BUY" ? 1 : -1;
  const formatChartPrice = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
      : "–";
  const formatChartPnl = (value: number) => `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(3)}`;
  const toPnl = (price: number) => (price - entryPrice) * direction * usdPerUnit;

  return (
    <div className="backtest-trade-mini-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 24, left: 12, bottom: 10 }}>
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <rect x="0" y="0" width={reveal} height="1" />
            </clipPath>
          </defs>

          <XAxis
            dataKey="bar"
            type="number"
            domain={[-1, "dataMax"]}
            tickFormatter={(value: number) => (value === -1 ? "-1" : String(value))}
            label={{
              value: "Minutes since entry",
              position: "insideBottomRight",
              offset: -4,
              fill: "#9ca3af",
              fontSize: 11
            }}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            type="number"
            domain={yDomain as [number | "auto", number | "auto"]}
            tickFormatter={(value: number) =>
              Number.isFinite(value)
                ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
                : ""
            }
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />

          <ReferenceLine y={entryPrice} stroke="#a3a3a3" strokeDasharray="4 6" />
          {Number.isFinite(tpPrice as number) ? (
            <ReferenceLine y={tpPrice as number} stroke="#34d399" strokeDasharray="4 6" />
          ) : null}
          {Number.isFinite(slPrice as number) ? (
            <ReferenceLine y={slPrice as number} stroke="#f87171" strokeDasharray="4 6" />
          ) : null}

          <Tooltip
            content={({ active, payload }: RechartsTooltipRenderProps) => {
              if (!active || !payload?.length) {
                return null;
              }

              const row = payload[0].payload as {
                bar: number;
                price: number;
                high: number;
                low: number;
                ts?: number;
                relCand?: number;
              };
              const timestamp = typeof row.ts === "number" ? row.ts : Date.now();
              const date = new Date(timestamp);
              const month = String(date.getUTCMonth() + 1).padStart(2, "0");
              const day = String(date.getUTCDate()).padStart(2, "0");
              const year = date.getUTCFullYear();
              const hour24 = date.getUTCHours();
              const minute = String(date.getUTCMinutes()).padStart(2, "0");
              const meridiem = hour24 >= 12 ? "PM" : "AM";
              const hour12 = hour24 % 12 || 12;
              const candleCount =
                typeof row.relCand === "number" && row.relCand >= 0 ? row.relCand + 1 : 0;
              const minutesIn = typeof row.bar === "number" && row.bar >= 0 ? Math.round(row.bar) : 0;
              const minutesLabel = humanizeDurationMinutes(minutesIn);
              const pluralize = (value: number, word: string) =>
                `${value} ${word}${value === 1 ? "" : "s"}`;
              const closePnl = toPnl(row.price);
              const highPnl = toPnl(row.high);
              const lowPnl = toPnl(row.low);
              const getPnlColor = (value: number) =>
                value > 0 ? "#34d399" : value < 0 ? "#f87171" : "#e5e7eb";

              return (
                <div
                  style={{
                    background: "#000",
                    border: "1px solid #262626",
                    borderRadius: 12,
                    padding: "8px 10px",
                    color: "#e5e7eb",
                    fontSize: 12
                  }}
                >
                  <div style={{ opacity: 0.9, marginBottom: 4, fontWeight: 600 }}>
                    {month}/{day}/{year} | {hour12}:{minute}
                    {meridiem}
                  </div>
                  <div style={{ opacity: 0.8, marginBottom: 8 }}>
                    {pluralize(candleCount, "Candle")} | {minutesLabel} In
                  </div>
                  <div>
                    Close: <b>{formatChartPrice(row.price)}</b>
                  </div>
                  <div>
                    High: <b>{formatChartPrice(row.high)}</b>
                  </div>
                  <div>
                    Low: <b>{formatChartPrice(row.low)}</b>
                  </div>
                  <hr style={{ borderColor: "#262626", margin: "6px 0" }} />
                  <div>
                    Close PnL: <b style={{ color: getPnlColor(closePnl) }}>{formatChartPnl(closePnl)}</b>
                  </div>
                  <div>
                    High&nbsp; PnL: <b style={{ color: getPnlColor(highPnl) }}>{formatChartPnl(highPnl)}</b>
                  </div>
                  <div>
                    Low&nbsp;&nbsp; PnL: <b style={{ color: getPnlColor(lowPnl) }}>{formatChartPnl(lowPnl)}</b>
                  </div>
                </div>
              );
            }}
          />

          <g clipPath={`url(#${clipId})`}>
            <Line
              type="monotone"
              dataKey="up"
              stroke="#34d399"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
              style={{ filter: `url(#${glowId})` }}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="down"
              stroke="#f87171"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
              style={{ filter: `url(#${glowId})` }}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="flat"
              stroke="#ffffff"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
              style={{ filter: `url(#${glowId})` }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </g>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

const meanOf = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;

  for (const value of values) {
    total += value;
  }

  return total / values.length;
};

const stdDevOf = (values: number[]): number => {
  if (values.length < 2) {
    return 0;
  }

  const mean = meanOf(values);
  let total = 0;

  for (const value of values) {
    const delta = value - mean;
    total += delta * delta;
  }

  return Math.sqrt(total / values.length);
};

const quantileOf = (values: number[], quantile: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(quantile, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower] ?? 0;
  }

  const weight = index - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue * (1 - weight) + upperValue * weight;
};

const getBinaryCorrelation = (values: number[], outcomes: number[]): number => {
  if (values.length !== outcomes.length || values.length < 3) {
    return 0;
  }

  const meanX = meanOf(values);
  const meanY = meanOf(outcomes);
  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let index = 0; index < values.length; index += 1) {
    const deltaX = values[index] - meanX;
    const deltaY = outcomes[index] - meanY;
    numerator += deltaX * deltaY;
    varianceX += deltaX * deltaX;
    varianceY += deltaY * deltaY;
  }

  const denominator = Math.sqrt(varianceX * varianceY);

  if (!Number.isFinite(denominator) || denominator <= 0.000000001) {
    return 0;
  }

  return clamp(numerator / denominator, -1, 1);
};

const buildAiFeatureVector = (
  window: Candle[],
  allCandles: Candle[]
): Record<string, number[]> => {
  if (window.length === 0 || allCandles.length === 0) {
    return {};
  }

  const epsilon = 0.000000001;
  const closes = window.map((candle) => candle.close);
  const highs = window.map((candle) => candle.high);
  const lows = window.map((candle) => candle.low);
  const lastCandle = window[window.length - 1]!;
  const range = Math.max(epsilon, Math.max(...highs) - Math.min(...lows));
  const firstClose = closes[0] ?? lastCandle.close;
  const lastClose = closes[closes.length - 1] ?? lastCandle.close;
  const returns: number[] = [];
  const absoluteReturns: number[] = [];
  let bodyTotal = 0;
  let upperWickTotal = 0;
  let lowerWickTotal = 0;
  let bullish = 0;
  let bearish = 0;
  let flips = 0;
  let dojis = 0;
  let previousDirection = 0;

  for (let index = 0; index < window.length; index += 1) {
    const candle = window[index]!;
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const candleRange = Math.max(epsilon, candle.high - candle.low);
    const direction = candle.close > candle.open ? 1 : candle.close < candle.open ? -1 : 0;

    bodyTotal += body / range;
    upperWickTotal += upperWick / range;
    lowerWickTotal += lowerWick / range;
    bullish += direction > 0 ? 1 : 0;
    bearish += direction < 0 ? 1 : 0;
    dojis += body <= candleRange * 0.1 ? 1 : 0;

    if (previousDirection !== 0 && direction !== 0 && previousDirection !== direction) {
      flips += 1;
    }

    if (direction !== 0) {
      previousDirection = direction;
    }

    if (index === 0) {
      continue;
    }

    const previousClose = closes[index - 1] ?? closes[index] ?? 0;
    const change = (candle.close - previousClose) / Math.max(epsilon, Math.abs(previousClose));
    returns.push(change);
    absoluteReturns.push(Math.abs(change));
  }

  const normalizedReturns = returns.length > 0 ? returns : [0];
  const meanReturn = meanOf(normalizedReturns);
  const stdReturn = stdDevOf(normalizedReturns);
  const absoluteMeanReturn = meanOf(absoluteReturns);
  const absoluteStdReturn = stdDevOf(absoluteReturns);
  const netReturn = (lastClose - firstClose) / Math.max(epsilon, Math.abs(firstClose));
  const bodyMean = bodyTotal / window.length;
  const upperWickMean = upperWickTotal / window.length;
  const lowerWickMean = lowerWickTotal / window.length;
  const bullishShare = bullish / window.length;
  const bearishShare = bearish / window.length;
  const reversalRate = flips / Math.max(1, window.length - 1);
  const absReturnSum = absoluteReturns.reduce((total, value) => total + value, 0);
  const chopRatio = absReturnSum / (Math.abs(netReturn) + epsilon);
  const wickBodyRatio = (upperWickMean + lowerWickMean) / Math.max(epsilon, bodyMean);
  const lastReturn = normalizedReturns[normalizedReturns.length - 1] ?? 0;
  const firstReturn = normalizedReturns[0] ?? 0;
  const minimumLow = Math.min(...lows);
  const maximumHigh = Math.max(...highs);
  const closePosition = clamp((lastClose - minimumLow) / range, 0, 1);
  const distanceToHigh = clamp((maximumHigh - lastClose) / range, 0, 1);
  const distanceToLow = clamp((lastClose - minimumLow) / range, 0, 1);
  const finalTime = lastCandle.time;
  const finalDate = new Date(finalTime);
  const minYear = new Date(allCandles[0]!.time).getUTCFullYear();
  const maxYear = new Date(allCandles[allCandles.length - 1]!.time).getUTCFullYear();
  const yearSpan = Math.max(1, maxYear - minYear);
  const year = finalDate.getUTCFullYear();
  const month = finalDate.getUTCMonth();
  const dayOfWeek = finalDate.getUTCDay();
  const hours = finalDate.getUTCHours();
  const minutes = finalDate.getUTCMinutes();
  const startOfYear = Date.UTC(year, 0, 0);
  const dayOfYear = Math.max(1, Math.floor((finalTime - startOfYear) / 86_400_000));
  const weekNorm = clamp(Math.ceil(dayOfYear / 7) / 53, 0, 1);
  const dayOfYearUnit = clamp(dayOfYear / 366, 0, 1);
  const hourUnit = clamp((hours + minutes / 60) / 24, 0, 1);
  const minuteUnit = clamp(minutes / 60, 0, 1);
  const yearNorm = clamp((year - minYear) / yearSpan, 0, 1);
  const hourAngle = Math.PI * 2 * hourUnit;
  const minuteAngle = Math.PI * 2 * minuteUnit;
  const monthAngle = Math.PI * 2 * (month / 12);
  const dayAngle = Math.PI * 2 * (dayOfWeek / 7);
  const dayOfYearAngle = Math.PI * 2 * dayOfYearUnit;
  const closeMean = meanOf(closes);
  const closeStd = stdDevOf(closes);
  const zScores = closes.map((close) => (close - closeMean) / Math.max(epsilon, closeStd));
  const zMean = meanOf(zScores);
  const zStd = stdDevOf(zScores);
  const zMax = zScores.length > 0 ? Math.max(...zScores) : 0;
  const zMin = zScores.length > 0 ? Math.min(...zScores) : 0;
  const absZMean = meanOf(zScores.map((value) => Math.abs(value)));
  const zLast = zScores[zScores.length - 1] ?? 0;
  const zMid = zScores[Math.floor(zScores.length / 2)] ?? zLast;
  const zDelta = zLast - zMid;
  let zCrossings = 0;
  let previousZSign = 0;

  for (const zScore of zScores) {
    const sign = zScore > epsilon ? 1 : zScore < -epsilon ? -1 : 0;

    if (previousZSign !== 0 && sign !== 0 && sign !== previousZSign) {
      zCrossings += 1;
    }

    if (sign !== 0) {
      previousZSign = sign;
    }
  }

  const accel = lastReturn - meanReturn;
  const volBurst = Math.abs(lastReturn) / Math.max(epsilon, stdReturn);
  const skewProxy =
    normalizedReturns.length > 0
      ? meanOf(normalizedReturns.map((value) => Math.pow(value - meanReturn, 3)))
      : 0;
  const touchBand = 0.08;
  let supportTouches = 0;
  let resistanceTouches = 0;

  for (const close of closes) {
    const relativePosition = clamp((close - minimumLow) / range, 0, 1);

    if (relativePosition <= touchBand) {
      supportTouches += 1;
    }

    if (relativePosition >= 1 - touchBand) {
      resistanceTouches += 1;
    }
  }

  const fibDeltas = [0.236, 0.382, 0.5, 0.618, 0.786].map((level) => closePosition - level);
  let nearestAbs = Infinity;
  let nearestSigned = 0;

  for (const delta of fibDeltas) {
    const absoluteDelta = Math.abs(delta);

    if (absoluteDelta < nearestAbs) {
      nearestAbs = absoluteDelta;
      nearestSigned = delta;
    }
  }

  return {
    pricePath: [
      meanReturn,
      stdReturn,
      Math.max(...normalizedReturns),
      Math.min(...normalizedReturns),
      absReturnSum,
      closePosition,
      netReturn,
      range,
      bodyMean,
      upperWickMean,
      lowerWickMean,
      bullishShare,
      bearishShare,
      reversalRate,
      chopRatio,
      lastReturn,
      firstReturn,
      quantileOf(normalizedReturns, 0.25),
      quantileOf(normalizedReturns, 0.5),
      quantileOf(normalizedReturns, 0.75)
    ],
    rangeTrend: [
      range,
      netReturn,
      range / Math.max(epsilon, Math.abs(netReturn)),
      chopRatio,
      bullishShare - bearishShare,
      absoluteMeanReturn
    ],
    wicks: [wickBodyRatio, upperWickMean, lowerWickMean, upperWickMean - lowerWickMean, dojis / window.length],
    time: [Math.sin(hourAngle), Math.cos(hourAngle), Math.sin(minuteAngle), Math.cos(minuteAngle)],
    temporal: [
      yearNorm,
      Math.sin(monthAngle),
      Math.cos(monthAngle),
      Math.sin(dayAngle),
      Math.cos(dayAngle),
      Math.sin(hourAngle),
      Math.cos(hourAngle),
      Math.sin(dayOfYearAngle),
      Math.cos(dayOfYearAngle),
      weekNorm
    ],
    position: [
      closePosition,
      distanceToHigh,
      distanceToLow,
      clamp(1 - distanceToHigh, 0, 1),
      clamp(1 - distanceToLow, 0, 1),
      closePosition
    ],
    topography: [
      bullishShare,
      bearishShare,
      bullishShare - bearishShare,
      absoluteMeanReturn,
      absoluteStdReturn,
      reversalRate,
      chopRatio,
      wickBodyRatio,
      bodyMean
    ],
    mf__momentum__core: [
      meanReturn,
      stdReturn,
      Math.max(...normalizedReturns),
      Math.min(...normalizedReturns),
      absReturnSum,
      netReturn,
      range,
      bullishShare,
      bearishShare,
      Math.max(0, 1 - reversalRate),
      reversalRate,
      chopRatio,
      lastReturn,
      firstReturn,
      accel,
      skewProxy
    ],
    mf__mean_reversion__core: [
      zMean,
      zStd,
      zMax,
      zMin,
      absZMean,
      zCrossings / Math.max(1, zScores.length - 1),
      zLast,
      zMid,
      zDelta,
      Math.max(0, zMax),
      Math.max(0, Math.abs(Math.min(0, zMin))),
      -zDelta,
      wickBodyRatio,
      chopRatio,
      range,
      netReturn
    ],
    mf__seasons__core: [
      Math.sin(hourAngle),
      Math.cos(hourAngle),
      Math.sin(dayOfYearAngle),
      Math.cos(dayOfYearAngle),
      dayOfYearUnit,
      hourUnit,
      range,
      netReturn,
      absoluteMeanReturn,
      absoluteStdReturn,
      chopRatio,
      wickBodyRatio,
      bullishShare,
      bearishShare,
      reversalRate,
      closePosition
    ],
    mf__time_of_day__core: [
      Math.sin(hourAngle),
      Math.cos(hourAngle),
      hourUnit,
      range,
      netReturn,
      absoluteMeanReturn,
      absoluteStdReturn,
      chopRatio,
      wickBodyRatio,
      bullishShare,
      bearishShare,
      reversalRate,
      closePosition,
      lastReturn,
      accel,
      volBurst
    ],
    mf__fibonacci__core: [
      fibDeltas[0] ?? 0,
      fibDeltas[1] ?? 0,
      fibDeltas[2] ?? 0,
      fibDeltas[3] ?? 0,
      fibDeltas[4] ?? 0,
      Number.isFinite(nearestAbs) ? nearestAbs : 0,
      nearestSigned,
      range,
      netReturn,
      closePosition,
      absoluteMeanReturn,
      absoluteStdReturn,
      chopRatio,
      bullishShare,
      bearishShare,
      reversalRate
    ],
    mf__support_resistance__core: [
      closePosition,
      1 - closePosition,
      supportTouches / window.length,
      resistanceTouches / window.length,
      closePosition <= touchBand ? 1 : 0,
      1 - closePosition <= touchBand ? 1 : 0,
      range,
      netReturn,
      closePosition,
      absoluteMeanReturn,
      absoluteStdReturn,
      chopRatio,
      wickBodyRatio,
      bullishShare,
      bearishShare,
      reversalRate
    ]
  };
};

const buildDimensionFeatureLagBuckets = (
  candles: Candle[],
  endExclusiveIndex: number,
  windowBars: number
): Record<string, number[][]> | null => {
  const bars = getAiFeatureWindowBars(windowBars);

  if (candles.length < bars + 1 || endExclusiveIndex < bars || endExclusiveIndex > candles.length) {
    return null;
  }

  const window = candles.slice(endExclusiveIndex - bars, endExclusiveIndex);

  if (window.length < bars) {
    return null;
  }

  const buckets: Record<string, number[][]> = {};

  for (let lag = 0; lag < window.length; lag += 1) {
    const prefix = window.slice(0, window.length - lag);
    const vectors = buildAiFeatureVector(prefix, candles);

    for (const [featureId, values] of Object.entries(vectors)) {
      const perLag = buckets[featureId] ?? [];
      perLag[lag] = values;
      buckets[featureId] = perLag;
    }
  }

  return buckets;
};

const BacktestTradeMiniChart = ({
  trade,
  candles,
  minutesPerBar,
  isOpen
}: {
  trade: HistoryItem;
  candles: Candle[];
  minutesPerBar: number;
  isOpen: boolean;
}) => {
  const entryIndex = findCandleIndexAtOrBefore(candles, Number(trade.entryTime) * 1000);
  const exitIndex = findCandleIndexAtOrBefore(candles, Number(trade.exitTime) * 1000);
  const safeMinutesPerBar = Math.max(1, Number.isFinite(minutesPerBar) ? minutesPerBar : 1);

  const data = useMemo(() => {
    if (entryIndex < 0 || exitIndex < entryIndex || candles.length === 0) {
      return [];
    }

    const startIndex = Math.max(0, entryIndex - 1);
    const endIndex = Math.min(candles.length - 1, Math.max(entryIndex, exitIndex));
    const rows: Array<{
      bar: number;
      price: number;
      high: number;
      low: number;
      up: number | null;
      down: number | null;
      flat: number | null;
      relCand: number;
      candIdx?: number;
      ts?: number;
    }> = [];
    const preCandle = candles[startIndex];
    const prePrice = startIndex < entryIndex ? preCandle?.close ?? trade.entryPrice : trade.entryPrice;
    const preTime = preCandle?.time ?? candles[entryIndex]?.time ?? Number(trade.entryTime) * 1000;

    rows.push({
      bar: -1,
      price: prePrice,
      high: prePrice,
      low: prePrice,
      up: prePrice,
      down: null,
      flat: null,
      relCand: -1,
      ts: preTime
    });

    let previousPrice = prePrice;

    for (let index = entryIndex; index <= endIndex; index += 1) {
      const candle = candles[index];
      const close = candle?.close ?? previousPrice;
      const high = candle?.high ?? close;
      const low = candle?.low ?? close;

      rows.push({
        bar: (index - entryIndex) * safeMinutesPerBar,
        price: close,
        high,
        low,
        up: close > previousPrice ? close : null,
        down: close < previousPrice ? close : null,
        flat: close === previousPrice ? close : null,
        relCand: index - entryIndex,
        candIdx: index,
        ts: candle?.time ?? preTime
      });

      previousPrice = close;
    }

    for (let index = 1; index < rows.length; index += 1) {
      const current = rows[index]!;
      const previous = rows[index - 1]!;

      if (current.up != null) {
        previous.up = previous.price;
      }

      if (current.down != null) {
        previous.down = previous.price;
      }

      if (current.flat != null) {
        previous.flat = previous.price;
      }
    }

    if (rows.length > 0) {
      const last = rows[rows.length - 1]!;
      const exitPrice = trade.outcomePrice;
      last.price = exitPrice;
      last.high = Math.max(last.high, exitPrice);
      last.low = Math.min(last.low, exitPrice);

      if (rows.length >= 2) {
        const previous = rows[rows.length - 2]!;
        last.up = exitPrice > previous.price ? exitPrice : null;
        last.down = exitPrice < previous.price ? exitPrice : null;
        last.flat = exitPrice === previous.price ? exitPrice : null;
      }
    }

    return rows;
  }, [
    candles,
    entryIndex,
    exitIndex,
    safeMinutesPerBar,
    trade.entryPrice,
    trade.entryTime,
    trade.outcomePrice
  ]);

  const yDomain = useMemo<[number | "auto", number | "auto"]>(() => {
    if (data.length === 0) {
      return ["auto", "auto"];
    }

    const lows = data.map((point) => point.low).filter(Number.isFinite) as number[];
    const highs = data.map((point) => point.high).filter(Number.isFinite) as number[];

    if (lows.length === 0 || highs.length === 0) {
      return ["auto", "auto"];
    }

    let low = Math.min(...lows);
    let high = Math.max(...highs);

    if (Number.isFinite(trade.targetPrice)) {
      high = Math.max(high, trade.targetPrice);
    }

    if (Number.isFinite(trade.stopPrice)) {
      low = Math.min(low, trade.stopPrice);
    }

    const span = Math.max(0.000000001, high - low);
    const pad = Math.max(span * 0.12, Math.abs(trade.entryPrice) * 0.002, 1);
    return [low - pad, high + pad];
  }, [data, trade.entryPrice, trade.stopPrice, trade.targetPrice]);

  if (data.length < 2) {
    return <div className="backtest-trade-mini-empty">Price movement unavailable.</div>;
  }

  return (
    <div style={{ height: 260 }}>
      <BacktestPerTradeMiniChart
        data={data}
        yDomain={yDomain}
        entryPrice={trade.entryPrice}
        tpPrice={trade.targetPrice}
        slPrice={trade.stopPrice}
        side={trade.side === "Long" ? "BUY" : "SELL"}
        usdPerUnit={Math.abs(trade.units) || 1}
        isOpen={isOpen}
      />
    </div>
  );
};

const generateTradeBlueprints = (
  model: ModelProfile,
  total: number,
  seedMs = floorToTimeframe(Date.now(), "1m"),
  range?: { startMs: number; endMs: number },
  unitsPerMove = 1
): TradeBlueprint[] => {
  const rand = createSeededRng(hashString(`blueprints-${model.id}-${seedMs}`));
  const blueprints: TradeBlueprint[] = [];
  const usedTimes = new Set<number>();
  const fallbackEndMs = floorToTimeframe(seedMs, "1m");
  const fallbackStartMs =
    fallbackEndMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;
  const rawStartMs = range?.startMs ?? fallbackStartMs;
  const rawEndMs = range?.endMs ?? fallbackEndMs;
  const endMs = floorToTimeframe(
    Number.isFinite(rawEndMs) ? rawEndMs : fallbackEndMs,
    "1m"
  );
  const startMs = floorToTimeframe(
    Number.isFinite(rawStartMs) ? Math.min(rawStartMs, endMs - 60_000) : fallbackStartMs,
    "1m"
  );
  const lookbackMinutes = Math.max(1, Math.floor((endMs - startMs) / 60_000));
  const spacingMinutes = Math.max(1, Math.floor(lookbackMinutes / Math.max(1, total)));

  for (let i = 0; i < total; i += 1) {
    const symbol = futuresAssets[Math.floor(rand() * futuresAssets.length)].symbol;
    const side: TradeSide = rand() <= model.longBias ? "Long" : "Short";
    const result: TradeResult = rand() <= model.winRate ? "Win" : "Loss";
    const rr = model.rrMin + rand() * (model.rrMax - model.rrMin);
    const riskPct = model.riskMin + rand() * (model.riskMax - model.riskMin);
    const holdMinutes = 35 + Math.floor(rand() * Math.max(720, spacingMinutes * 0.75));
    const baseOffsetMinutes = Math.round((i + 1) * spacingMinutes);
    const jitterWindow = Math.max(1, Math.floor(spacingMinutes * 0.45));
    const jitter = Math.floor((rand() - 0.5) * jitterWindow);
    const exitOffsetMinutes = Math.max(1, baseOffsetMinutes + jitter);
    const exitMs = floorToTimeframe(
      clamp(endMs - exitOffsetMinutes * 60_000, startMs + 60_000, endMs),
      "1m"
    );
    let uniqueExitMs = exitMs;

    while (usedTimes.has(uniqueExitMs) && uniqueExitMs > startMs + 60_000) {
      uniqueExitMs -= 60_000;
    }

    while (usedTimes.has(uniqueExitMs) && uniqueExitMs < endMs) {
      uniqueExitMs += 60_000;
    }

    usedTimes.add(uniqueExitMs);
    const entryMs = Math.max(startMs, uniqueExitMs - holdMinutes * 60_000);
    const units = Math.max(1, Number.isFinite(unitsPerMove) ? unitsPerMove : 1);

    blueprints.push({
      id: `${model.id}-t${String(i + 1).padStart(4, "0")}`,
      modelId: model.id,
      symbol,
      side,
      result,
      entryMs,
      exitMs: uniqueExitMs,
      riskPct,
      rr,
      units
    });
  }

  return blueprints.sort((a, b) => b.exitMs - a.exitMs);
};

const summarizeBacktestTrades = (
  trades: HistoryItem[],
  confidenceResolver: (trade: HistoryItem) => number = getTradeConfidenceScore
) => {
  let netPnl = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let wins = 0;
  let losses = 0;
  let totalHoldMinutes = 0;
  let totalWinHoldMinutes = 0;
  let totalLossHoldMinutes = 0;
  let maxWin = 0;
  let maxLoss = 0;
  let totalR = 0;
  let totalConfidence = 0;
  let estimatedPeakTotal = 0;
  let estimatedDrawdownTotal = 0;
  let estimatedProfitMinutes = 0;
  let estimatedDeficitMinutes = 0;
  let runningPnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  const dayMap = new Map<string, { key: string; count: number; pnl: number }>();
  const weekMap = new Map<string, { key: string; count: number; pnl: number }>();
  const monthMap = new Map<string, { key: string; count: number; pnl: number }>();
  const pnlSeries: number[] = [];

  for (const trade of trades) {
    const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
    const targetPotentialUsd = Math.abs(trade.targetPrice - trade.entryPrice) * Math.max(1, trade.units);
    const stopPotentialUsd = Math.abs(trade.entryPrice - trade.stopPrice) * Math.max(1, trade.units);
    const favorableShare = trade.result === "Win" ? 0.68 : 0.32;
    netPnl += trade.pnlUsd;
    runningPnl += trade.pnlUsd;
    peakPnl = Math.max(peakPnl, runningPnl);
    maxDrawdown = Math.min(maxDrawdown, runningPnl - peakPnl);
    maxWin = Math.max(maxWin, trade.pnlUsd);
    maxLoss = Math.min(maxLoss, trade.pnlUsd);
    totalHoldMinutes += holdMinutes;
    totalConfidence += confidenceResolver(trade) * 100;
    estimatedPeakTotal += Math.max(Math.max(trade.pnlUsd, 0), targetPotentialUsd);
    estimatedDrawdownTotal += Math.max(Math.abs(Math.min(trade.pnlUsd, 0)), stopPotentialUsd);
    estimatedProfitMinutes += holdMinutes * favorableShare;
    estimatedDeficitMinutes += holdMinutes * (1 - favorableShare);
    pnlSeries.push(trade.pnlUsd);

    if (trade.pnlUsd >= 0) {
      grossWins += trade.pnlUsd;
      totalWinHoldMinutes += holdMinutes;
    } else {
      grossLosses += trade.pnlUsd;
      losses += 1;
      totalLossHoldMinutes += holdMinutes;
    }

    if (trade.result === "Win") {
      wins += 1;
    }

    const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
    const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
    totalR += rewardDistance / riskDistance;

    const dayKey = getTradeDayKey(trade.exitTime);
    const currentDay = dayMap.get(dayKey) ?? { key: dayKey, count: 0, pnl: 0 };
    currentDay.count += 1;
    currentDay.pnl += trade.pnlUsd;
    dayMap.set(dayKey, currentDay);

    const weekKey = getTradeWeekKey(trade.exitTime);
    const currentWeek = weekMap.get(weekKey) ?? { key: weekKey, count: 0, pnl: 0 };
    currentWeek.count += 1;
    currentWeek.pnl += trade.pnlUsd;
    weekMap.set(weekKey, currentWeek);

    const monthKey = getTradeMonthKey(trade.exitTime);
    const currentMonth = monthMap.get(monthKey) ?? { key: monthKey, count: 0, pnl: 0 };
    currentMonth.count += 1;
    currentMonth.pnl += trade.pnlUsd;
    monthMap.set(monthKey, currentMonth);
  }

  const dayRows = Array.from(dayMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const weekRows = Array.from(weekMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const monthRows = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const bestDay = [...dayRows].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
  const worstDay = [...dayRows].sort((a, b) => a.pnl - b.pnl)[0] ?? null;
  const tradeCount = trades.length;
  const avgPnl = tradeCount > 0 ? netPnl / tradeCount : 0;
  const avgWin = wins > 0 ? grossWins / wins : 0;
  const avgLoss = losses > 0 ? grossLosses / losses : 0;
  const mean = avgPnl;
  const variance =
    tradeCount > 0
      ? pnlSeries.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, tradeCount)
      : 0;
  const stdDev = Math.sqrt(variance);
  const downsideValues = pnlSeries.filter((value) => value < 0);
  const downsideVariance =
    downsideValues.length > 0
      ? downsideValues.reduce((sum, value) => sum + value ** 2, 0) / downsideValues.length
      : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const positiveDays = dayRows.filter((row) => row.pnl >= 0).length;
  const positiveWeeks = weekRows.filter((row) => row.pnl >= 0).length;
  const positiveMonths = monthRows.filter((row) => row.pnl >= 0).length;
  const sharpe = stdDev > 0 ? mean / stdDev : 0;
  const sortino = downsideDeviation > 0 ? mean / downsideDeviation : 0;

  return {
    tradeCount,
    netPnl,
    totalPnl: netPnl,
    winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
    profitFactor:
      grossLosses === 0 ? (grossWins > 0 ? grossWins : 0) : grossWins / Math.abs(grossLosses),
    avgPnl,
    avgHoldMinutes: tradeCount > 0 ? totalHoldMinutes / tradeCount : 0,
    avgWinDurationMin: wins > 0 ? totalWinHoldMinutes / wins : 0,
    avgLossDurationMin: losses > 0 ? totalLossHoldMinutes / losses : 0,
    avgR: tradeCount > 0 ? totalR / tradeCount : 0,
    avgWin,
    avgLoss,
    averageConfidence: tradeCount > 0 ? totalConfidence / tradeCount : 0,
    tradesPerDay: dayRows.length > 0 ? tradeCount / dayRows.length : 0,
    tradesPerWeek: weekRows.length > 0 ? tradeCount / weekRows.length : 0,
    tradesPerMonth: monthRows.length > 0 ? tradeCount / monthRows.length : 0,
    consistencyPerDay: dayRows.length > 0 ? (positiveDays / dayRows.length) * 100 : 0,
    consistencyPerWeek: weekRows.length > 0 ? (positiveWeeks / weekRows.length) * 100 : 0,
    consistencyPerMonth: monthRows.length > 0 ? (positiveMonths / monthRows.length) * 100 : 0,
    consistencyPerTrade: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
    avgPnlPerDay: dayRows.length > 0 ? netPnl / dayRows.length : 0,
    avgPnlPerWeek: weekRows.length > 0 ? netPnl / weekRows.length : 0,
    avgPnlPerMonth: monthRows.length > 0 ? netPnl / monthRows.length : 0,
    avgPeakPerTrade: tradeCount > 0 ? estimatedPeakTotal / tradeCount : 0,
    avgMaxDrawdownPerTrade: tradeCount > 0 ? estimatedDrawdownTotal / tradeCount : 0,
    avgTimeInProfitMin: tradeCount > 0 ? estimatedProfitMinutes / tradeCount : 0,
    avgTimeInDeficitMin: tradeCount > 0 ? estimatedDeficitMinutes / tradeCount : 0,
    sharpe,
    sortino,
    wins,
    losses,
    grossWins,
    grossLosses,
    maxWin,
    maxLoss,
    maxDrawdown,
    bestDay,
    worstDay
  };
};

const TabIcon = ({ tab }: { tab: PanelTab }) => {
  if (tab === "active") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      </svg>
    );
  }

  if (tab === "assets") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 17l4-5 3 3 5-7 4 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (tab === "mt5") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M9 6.5v4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M15 6.5v4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9 10.9h6v1.6a3 3 0 0 1-3 3 3 3 0 0 1-3-3v-1.6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M12 15.5v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (tab === "history") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 7v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M7.5 16.5a7 7 0 1 0-1.5-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tab === "actions") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M7 6h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4l2.2 4.8L19 10l-3.6 3.3.9 4.7-4.3-2.4-4.3 2.4.9-4.7L5 10l4.8-1.2L12 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
};

const getAiZipTradeDisplayId = (trade: Pick<HistoryItem, "id" | "entryTime">) => {
  const rawId = String(trade.id ?? "").trim();

  if (!rawId) {
    return "—";
  }

  const entryTime = Number(trade.entryTime);
  const seedText = `live|${Number.isFinite(entryTime) ? Math.floor(entryTime) : "na"}|${rawId}`;
  const shortCode = hashSeedFromText(seedText)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0")
    .slice(-6);

  return `live| ${shortCode}`;
};

const cloneAiLibrarySettings = (settings: AiLibrarySettings): AiLibrarySettings => {
  const next: AiLibrarySettings = {};

  for (const [libraryId, values] of Object.entries(settings)) {
    next[libraryId] = { ...values };
  }

  return next;
};

const formatStatsRefreshDateLabel = (timeMs: number) => {
  const date = new Date(timeMs);

  if (Number.isNaN(date.getTime())) {
    return "Preparing range...";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

export default function TradingTerminal({ aiZipModelNames }: TradingTerminalProps) {
  const modelProfiles = useMemo(() => {
    return buildModelProfiles(aiZipModelNames);
  }, [aiZipModelNames]);
  const referenceNowMs = useMemo(() => {
    return floorToTimeframe(Date.now(), "1m");
  }, []);
  const availableAiModelNames = useMemo(() => {
    const names = aiZipModelNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    return names.length > 0 ? names : [...AI_MODEL_FALLBACK_NAMES];
  }, [aiZipModelNames]);
  const aiLibraryDefs = useMemo(() => {
    return buildAiLibraryDefs(availableAiModelNames);
  }, [availableAiModelNames]);
  const aiLibraryDefById = useMemo(() => {
    return aiLibraryDefs.reduce<Record<string, AiLibraryDef>>((accumulator, definition) => {
      accumulator[definition.id] = definition;
      return accumulator;
    }, {});
  }, [aiLibraryDefs]);
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [selectedSurfaceTab, setSelectedSurfaceTab] = useState<SurfaceTab>("chart");
  const [selectedBacktestTab, setSelectedBacktestTab] = useState<BacktestTab>("mainSettings");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryInteractionTick, setSelectedHistoryInteractionTick] = useState(0);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [showActiveTradeOnChart, setShowActiveTradeOnChart] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestSeriesMap, setBacktestSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestOneMinuteSeriesMap, setBacktestOneMinuteSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestHistoryQuery, setBacktestHistoryQuery] = useState("");
  const [backtestHistoryPage, setBacktestHistoryPage] = useState(1);
  const [backtestHistoryCollapsed, setBacktestHistoryCollapsed] = useState(false);
  const [hoveredBacktestHistoryId, setHoveredBacktestHistoryId] = useState<string | null>(null);
  const [activeBacktestTradeDetails, setActiveBacktestTradeDetails] = useState<
    Record<string, unknown> | null
  >(null);
  const [statsDateStart, setStatsDateStart] = useState("");
  const [statsDateEnd, setStatsDateEnd] = useState("");
  const [statsTimeframeDdOpen, setStatsTimeframeDdOpen] = useState(false);
  const [performanceStatsCollapsed, setPerformanceStatsCollapsed] = useState(false);
  const [performanceStatsModel, setPerformanceStatsModel] = useState("All");
  const [mainStatsModelPnlIndex, setMainStatsModelPnlIndex] = useState(0);
  const [mainStatsSessionPnlIndex, setMainStatsSessionPnlIndex] = useState(0);
  const [mainStatsMonthPnlIndex, setMainStatsMonthPnlIndex] = useState(-1);
  const [selectedBacktestMonthKey, setSelectedBacktestMonthKey] = useState("");
  const [selectedBacktestDateKey, setSelectedBacktestDateKey] = useState("");
  const [expandedBacktestTradeId, setExpandedBacktestTradeId] = useState<string | null>(null);
  const [clusterViewDir, setClusterViewDir] = useState<"All" | "Buy" | "Sell">("All");
  const [clusterViewSession, setClusterViewSession] = useState("All");
  const [clusterViewMonth, setClusterViewMonth] = useState("All");
  const [clusterViewWeekday, setClusterViewWeekday] = useState("All");
  const [clusterViewHour, setClusterViewHour] = useState("All");
  const [clusterSearchId, setClusterSearchId] = useState("");
  const [clusterSearchStatus, setClusterSearchStatus] = useState<"miss" | null>(null);
  const [clusterNodeSizeScale, setClusterNodeSizeScale] = useState(1);
  const [clusterOverlayOpacity, setClusterOverlayOpacity] = useState(1);
  const [selectedBacktestClusterGroupId, setSelectedBacktestClusterGroupId] =
    useState<BacktestClusterGroupId | null>(null);
  const [clusterLegendToggles, setClusterLegendToggles] = useState(() => ({
    ...BACKTEST_CLUSTER_LEGEND_DEFAULTS
  }));
  const [aiZipClusterMapView, setAiZipClusterMapView] = useState<"2d" | "3d">("2d");
  const [aiZipClusterResetKey, setAiZipClusterResetKey] = useState(0);
  const [aiZipClusterTimelineIdx, setAiZipClusterTimelineIdx] = useState(0);
  const [enabledBacktestWeekdays, setEnabledBacktestWeekdays] = useState<string[]>([
    ...backtestWeekdayLabels
  ]);
  const [enabledBacktestSessions, setEnabledBacktestSessions] = useState<string[]>([
    ...backtestSessionLabels
  ]);
  const [enabledBacktestMonths, setEnabledBacktestMonths] = useState<number[]>(
    Array.from({ length: 12 }, (_, index) => index)
  );
  const [enabledBacktestHours, setEnabledBacktestHours] = useState<number[]>(
    Array.from({ length: 24 }, (_, index) => index)
  );
  const [aiMode, setAiMode] = useState<"off" | "knn" | "hdbscan">("off");
  const [aiModelEnabled, setAiModelEnabled] = useState(false);
  const [aiFilterEnabled, setAiFilterEnabled] = useState(false);
  const [staticLibrariesClusters, setStaticLibrariesClusters] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);
  const [aiExitStrictness, setAiExitStrictness] = useState(0);
  const [aiExitLossTolerance, setAiExitLossTolerance] = useState(0);
  const [aiExitWinTolerance, setAiExitWinTolerance] = useState(0);
  const [useMitExit, setUseMitExit] = useState(false);
  const [complexity, setComplexity] = useState(50);
  const [volatilityPercentile, setVolatilityPercentile] = useState(50);
  const [tpDollars, setTpDollars] = useState(1000);
  const [slDollars, setSlDollars] = useState(1000);
  const [dollarsPerMove, setDollarsPerMove] = useState(25);
  const [maxBarsInTrade, setMaxBarsInTrade] = useState(0);
  const [stopMode, setStopMode] = useState(0); // 0=Off, 1=Break-Even, 2=Trailing
  const [breakEvenTriggerPct, setBreakEvenTriggerPct] = useState(50);
  const [trailingStartPct, setTrailingStartPct] = useState(50);
  const [trailingDistPct, setTrailingDistPct] = useState(30);
  const [methodSettingsOpen, setMethodSettingsOpen] = useState(false);
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [featuresModalOpen, setFeaturesModalOpen] = useState(false);
  const [librariesModalOpen, setLibrariesModalOpen] = useState(false);
  const [aiModelStates, setAiModelStates] = useState<Record<string, AiModelState>>(() => {
    return buildInitialAiModelStates(availableAiModelNames);
  });
  const [aiFeatureLevels, setAiFeatureLevels] = useState<Record<string, AiFeatureLevel>>(() => {
    return buildInitialAiFeatureLevels();
  });
  const [aiFeatureModes, setAiFeatureModes] = useState<Record<string, AiFeatureMode>>(() => {
    return buildInitialAiFeatureModes();
  });
  const [selectedAiLibraries, setSelectedAiLibraries] = useState<string[]>([
    "core",
    "recent",
    "base"
  ]);
  const [selectedAiLibraryId, setSelectedAiLibraryId] = useState("core");
  const [selectedAiLibrarySettings, setSelectedAiLibrarySettings] = useState<AiLibrarySettings>(() => {
    return buildDefaultAiLibrarySettings(aiLibraryDefs);
  });
  const [aiBulkScope, setAiBulkScope] = useState<"active" | "all">("active");
  const [aiBulkWeight, setAiBulkWeight] = useState(100);
  const [aiBulkStride, setAiBulkStride] = useState(0);
  const [aiBulkMaxSamples, setAiBulkMaxSamples] = useState(10000);
  const [chunkBars, setChunkBars] = useState(24);
  const [distanceMetric, setDistanceMetric] = useState<AiDistanceMetric>("euclidean");
  const [selectedAiDomains, setSelectedAiDomains] = useState<string[]>([
    "Direction",
    "Model"
  ]);
  const [embeddingCompression, setEmbeddingCompression] = useState(35);
  const [dimensionAmount, setDimensionAmount] = useState(32);
  const [compressionMethod, setCompressionMethod] = useState<AiCompressionMethod>("jl");
  const [kEntry, setKEntry] = useState(12);
  const [kExit, setKExit] = useState(9);
  const [knnVoteMode, setKnnVoteMode] = useState<KnnVoteMode>("distance");
  const [hdbMinClusterSize, setHdbMinClusterSize] = useState(35);
  const [hdbMinSamples, setHdbMinSamples] = useState(12);
  const [hdbEpsQuantile, setHdbEpsQuantile] = useState(0.85);
  const [hdbSampleCap, setHdbSampleCap] = useState(5000);
  const [antiCheatEnabled, setAntiCheatEnabled] = useState(false);
  const [validationMode, setValidationMode] = useState<AiValidationMode>("off");
  const [realismLevel, setRealismLevel] = useState(1);
  const [propInitialBalance, setPropInitialBalance] = useState(100_000);
  const [propDailyMaxLoss, setPropDailyMaxLoss] = useState(5_000);
  const [propTotalMaxLoss, setPropTotalMaxLoss] = useState(10_000);
  const [propProfitTarget, setPropProfitTarget] = useState(10_000);
  const [dimSearch, setDimSearch] = useState("");
  const [dimScope, setDimScope] = useState<DimensionScope>("active");
  const [dimSortCol, setDimSortCol] = useState<DimensionSortColumn>("corr");
  const [dimSortDir, setDimSortDir] = useState<-1 | 1>(-1);
  const [isGraphsCollapsed, setIsGraphsCollapsed] = useState(false);
  const [propProjectionMethod, setPropProjectionMethod] = useState<"historical" | "montecarlo">(
    "montecarlo"
  );
  const [propResult, setPropResult] = useState<PropFirmResult | null>(null);
  const [propStats, setPropStats] = useState<PropFirmStats | null>(null);
  const [backtestRunCount, setBacktestRunCount] = useState(0);
  const [backtestRefreshNowMs, setBacktestRefreshNowMs] = useState(() =>
    floorToTimeframe(Date.now(), "1m")
  );
  const [statsRefreshOverlayMode, setStatsRefreshOverlayMode] =
    useState<StatsRefreshOverlayMode>("idle");
  const [statsRefreshProgress, setStatsRefreshProgress] = useState(0);
  const [statsRefreshLoadingDisplayProgress, setStatsRefreshLoadingDisplayProgress] = useState(0);
  const [statsRefreshProgressLabel, setStatsRefreshProgressLabel] = useState("");
  const [backtestHistorySeedReady, setBacktestHistorySeedReady] = useState(false);
  const [isBacktestSurfaceSettled, setIsBacktestSurfaceSettled] = useState(true);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState<"save" | "load" | null>(null);
  const [presetNameInput, setPresetNameInput] = useState("");

  const buildCurrentBacktestSettingsSnapshot = (): BacktestSettingsSnapshot => ({
    symbol: selectedSymbol,
    timeframe: selectedTimeframe,
    statsDateStart,
    statsDateEnd,
    enabledBacktestWeekdays: [...enabledBacktestWeekdays],
    enabledBacktestSessions: [...enabledBacktestSessions],
    enabledBacktestMonths: [...enabledBacktestMonths],
    enabledBacktestHours: [...enabledBacktestHours],
    aiMode,
    aiFilterEnabled,
    confidenceThreshold,
    tpDollars,
    slDollars,
    dollarsPerMove,
    stopMode,
    breakEvenTriggerPct,
    trailingStartPct,
    trailingDistPct,
    aiModelStates: { ...aiModelStates },
    aiFeatureLevels: { ...aiFeatureLevels },
    aiFeatureModes: { ...aiFeatureModes },
    selectedAiLibraries: [...selectedAiLibraries],
    selectedAiLibrarySettings: cloneAiLibrarySettings(selectedAiLibrarySettings),
    chunkBars,
    selectedAiDomains: [...selectedAiDomains],
    dimensionAmount,
    compressionMethod,
    hdbMinClusterSize,
    hdbMinSamples,
    hdbEpsQuantile,
    staticLibrariesClusters,
    antiCheatEnabled,
    validationMode
  });
  const [appliedBacktestSettings, setAppliedBacktestSettings] = useState<BacktestSettingsSnapshot>(
    () => buildCurrentBacktestSettingsSnapshot()
  );

  useEffect(() => {
    setAiModelStates((current) => syncAiModelStates(current, availableAiModelNames));
  }, [availableAiModelNames]);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const gaplessToRealRef = useRef<Map<number, number>>(new Map());
  const countdownOverlayRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const tradeProfitZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeLossZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeEntryLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeTargetLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeStopLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradePathLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const multiTradeSeriesRef = useRef<MultiTradeOverlaySeries[]>([]);
  const selectionRef = useRef<string>("");
  const focusTradeIdRef = useRef<string | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const selectedSurfaceTabRef = useRef<SurfaceTab>(selectedSurfaceTab);
  const statsRefreshOverlayModeRef = useRef<StatsRefreshOverlayMode>("idle");
  const statsRefreshResetTimeoutRef = useRef(0);
  const statsRefreshVisualCompletionRafRef = useRef(0);
  const statsRefreshProgressRef = useRef(0);
  const statsRefreshLoadingDisplayProgressRef = useRef(0);
  const liveBacktestSettingsRef = useRef<BacktestSettingsSnapshot>(appliedBacktestSettings);
  const tradeBlueprintsRef = useRef<TradeBlueprint[]>([]);
  const backtestHistorySeriesBySymbolRef = useRef<Record<string, Candle[]>>({});
  const backtestOneMinuteCandlesBySymbolRef = useRef<Record<string, Candle[]>>({});
  const backtestTargetTradesRef = useRef(0);
  const backtestBlueprintRangeRef = useRef<{ startMs: number; endMs: number }>({
    startMs: 0,
    endMs: 0
  });
  const modelProfileByIdRef = useRef<Record<string, ModelProfile>>({});
  const appliedBacktestTpDollarsRef = useRef(0);
  const appliedBacktestSlDollarsRef = useRef(0);
  const appliedBacktestStopModeRef = useRef(0);
  const appliedBacktestBreakEvenTriggerPctRef = useRef(50);
  const appliedBacktestTrailingStartPctRef = useRef(50);
  const appliedBacktestTrailingDistPctRef = useRef(30);
  const chartSizeRef = useRef({ width: 0, height: 0 });
  const chartRenderWindowRef = useRef<ChartDataWindow>({ from: 0, to: -1 });
  const chartVisibleGlobalRangeRef = useRef<ChartDataWindow | null>(null);
  const chartPendingVisibleGlobalRangeRef = useRef<ChartDataWindow | null>(null);
  const chartVisibleRangeSyncRafRef = useRef(0);
  const chartFocusedPriceRangeRef = useRef<PriceRange | null>(null);
  const chartFocusedPriceRangeResetRafRef = useRef(0);
  const chartIsApplyingVisibleRangeRef = useRef(false);
  const settingsFileInputRef = useRef<HTMLInputElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const chartSourceLengthRef = useRef(0);
  const previousChartSourceLengthRef = useRef(0);
  const requestChartVisibleRangeRef = useRef<(visibleRange: ChartDataWindow) => void>(() => {});
  const chartDataLengthRef = useRef(0);
  const chartLastBarTimeRef = useRef(0);
  const chartViewCenterTimeMsRef = useRef<number | null>(null);
  const selectedChartCandlesRef = useRef<Candle[]>([]);
  const statsTimeframeDdRef = useRef<HTMLDivElement>(null);
  const [chartRenderWindow, setChartRenderWindow] = useState<ChartDataWindow>({ from: 0, to: -1 });

  const selectTradeOnChart = (tradeId: string, symbol: string) => {
    if (selectedHistoryId === tradeId) {
      setSelectedHistoryId(null);
      focusTradeIdRef.current = null;
      return;
    }

    focusTradeIdRef.current = tradeId;
    setSelectedHistoryId(tradeId);
    setSelectedSymbol(symbol);
    setShowAllTradesOnChart(false);
    setShowActiveTradeOnChart(false);
    setSelectedHistoryInteractionTick((current) => current + 1);
  };

  liveBacktestSettingsRef.current = buildCurrentBacktestSettingsSnapshot();

  const updateStatsRefreshOverlayMode = useCallback((mode: StatsRefreshOverlayMode) => {
    statsRefreshOverlayModeRef.current = mode;
    setStatsRefreshOverlayMode(mode);
  }, []);
  const clearStatsRefreshResetTimeout = useCallback(() => {
    if (statsRefreshVisualCompletionRafRef.current) {
      window.cancelAnimationFrame(statsRefreshVisualCompletionRafRef.current);
      statsRefreshVisualCompletionRafRef.current = 0;
    }

    if (!statsRefreshResetTimeoutRef.current) {
      return;
    }

    window.clearTimeout(statsRefreshResetTimeoutRef.current);
    statsRefreshResetTimeoutRef.current = 0;
  }, []);
  const finishStatsRefreshLoading = useCallback(
    (label: string) => {
      clearStatsRefreshResetTimeout();
      setStatsRefreshProgress(100);
      setStatsRefreshProgressLabel(label);

      const closeOverlay = () => {
        updateStatsRefreshOverlayMode("idle");
        setStatsRefreshProgress(0);
        setStatsRefreshLoadingDisplayProgress(0);
        setStatsRefreshProgressLabel("");
        statsRefreshResetTimeoutRef.current = 0;
      };

      const scheduleClose = () => {
        statsRefreshResetTimeoutRef.current = window.setTimeout(
          closeOverlay,
          STATS_REFRESH_COMPLETE_DELAY_MS
        );
      };

      const waitUntilVisuallyFull = () => {
        if (statsRefreshOverlayModeRef.current !== "loading") {
          statsRefreshVisualCompletionRafRef.current = 0;
          return;
        }

        if (
          statsRefreshLoadingDisplayProgressRef.current >=
          STATS_REFRESH_VISUAL_FULL_THRESHOLD
        ) {
          statsRefreshVisualCompletionRafRef.current = 0;
          scheduleClose();
          return;
        }

        statsRefreshVisualCompletionRafRef.current =
          window.requestAnimationFrame(waitUntilVisuallyFull);
      };

      statsRefreshVisualCompletionRafRef.current =
        window.requestAnimationFrame(waitUntilVisuallyFull);
    },
    [clearStatsRefreshResetTimeout, updateStatsRefreshOverlayMode]
  );
  const applyBacktestSettingsSnapshot = useCallback(() => {
    const nextSettings = liveBacktestSettingsRef.current;
    const nextRefreshMs = floorToTimeframe(Date.now(), "1m");

    clearStatsRefreshResetTimeout();
    setAppliedBacktestSettings(nextSettings);
    setBacktestRunCount((current) => current + 1);
    setBacktestRefreshNowMs(nextRefreshMs);
    setBacktestHistorySeedReady(false);
    updateStatsRefreshOverlayMode("loading");
    setStatsRefreshProgress(0);
    setStatsRefreshLoadingDisplayProgress(0);
    const rangeStartMs = backtestBlueprintRangeRef.current.startMs;
    const baseStartMs =
      Number.isFinite(rangeStartMs) && rangeStartMs > 0
        ? rangeStartMs
        : nextRefreshMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;
    const filterStartMs = nextSettings.statsDateStart
      ? new Date(nextSettings.statsDateStart).getTime()
      : NaN;
    setStatsRefreshProgressLabel(
      formatStatsRefreshDateLabel(
        Number.isFinite(filterStartMs) ? Math.max(baseStartMs, filterStartMs) : baseStartMs
      )
    );
    setPropResult(null);
    setPropStats(null);
  }, [clearStatsRefreshResetTimeout, updateStatsRefreshOverlayMode]);

  const statsRefreshOverlayVisible = statsRefreshOverlayMode !== "idle";


  useEffect(() => {
    if (!statsTimeframeDdOpen) return;
    const handler = (e: MouseEvent) => {
      if (statsTimeframeDdRef.current && !statsTimeframeDdRef.current.contains(e.target as Node)) {
        setStatsTimeframeDdOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statsTimeframeDdOpen]);

  useEffect(() => {
    return () => {
      clearStatsRefreshResetTimeout();
    };
  }, [clearStatsRefreshResetTimeout]);

  useEffect(() => {
    statsRefreshLoadingDisplayProgressRef.current = statsRefreshLoadingDisplayProgress;
  }, [statsRefreshLoadingDisplayProgress]);

  useEffect(() => {
    statsRefreshProgressRef.current = statsRefreshProgress;
  }, [statsRefreshProgress]);

  useEffect(() => {
    setStatsRefreshLoadingDisplayProgress(statsRefreshProgress);
  }, [statsRefreshProgress]);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);
  const modelProfileById = useMemo(() => {
    return modelProfiles.reduce<Record<string, ModelProfile>>((accumulator, model) => {
      accumulator[model.id] = model;
      return accumulator;
    }, {});
  }, [modelProfiles]);
  const aiDisabled = aiMode === "off";
  const confidenceGateDisabled = aiMode === "off";
  const effectiveConfidenceThreshold = confidenceGateDisabled ? 0 : confidenceThreshold;
  const selectedAiModelCount = useMemo(() => {
    return Object.values(aiModelStates).filter((state) => state > 0).length;
  }, [aiModelStates]);
  const selectedAiFeatureCount = useMemo(() => {
    return AI_FEATURE_OPTIONS.filter((feature) => (aiFeatureLevels[feature.id] ?? 0) > 0).length;
  }, [aiFeatureLevels]);
  const configuredAiFeatureDimensionCount = useMemo(() => {
    return countConfiguredAiFeatureDimensions(aiFeatureLevels, aiFeatureModes, chunkBars);
  }, [aiFeatureLevels, aiFeatureModes, chunkBars]);
  const selectedAiLibraryCount = selectedAiLibraries.length;
  const availableAiLibraries = useMemo(() => {
    return aiLibraryDefs.filter((library) => !selectedAiLibraries.includes(library.id));
  }, [aiLibraryDefs, selectedAiLibraries]);

  useEffect(() => {
    if (confidenceGateDisabled && confidenceThreshold !== 0) {
      setConfidenceThreshold(0);
    }
  }, [confidenceGateDisabled, confidenceThreshold]);
  const selectedAiLibrary = useMemo(() => {
    return selectedAiLibraryId ? aiLibraryDefById[selectedAiLibraryId] ?? null : null;
  }, [aiLibraryDefById, selectedAiLibraryId]);
  const selectedBacktestModelNames = useMemo(() => {
    return availableAiModelNames.filter((modelName) => (aiModelStates[modelName] ?? 0) > 0);
  }, [aiModelStates, availableAiModelNames]);
  const backtestModelProfiles = useMemo(() => {
    return selectedBacktestModelNames
      .map((modelName) => modelProfileById[createModelId(modelName)] ?? null)
      .filter((model): model is ModelProfile => model !== null);
  }, [modelProfileById, selectedBacktestModelNames]);
  const backtestModelSelectionSummary = useMemo(() => {
    if (backtestModelProfiles.length === 0) {
      return "No models selected";
    }

    if (backtestModelProfiles.length === 1) {
      return backtestModelProfiles[0]!.name;
    }

    if (backtestModelProfiles.length === 2) {
      return `${backtestModelProfiles[0]!.name} + ${backtestModelProfiles[1]!.name}`;
    }

    return `${backtestModelProfiles.length} models`;
  }, [backtestModelProfiles]);
  const chartSignalModel = useMemo<ModelProfile | null>(() => {
    if (backtestModelProfiles.length === 0) {
      return null;
    }

    if (backtestModelProfiles.length === 1) {
      return backtestModelProfiles[0]!;
    }

    const aggregate = backtestModelProfiles.reduce(
      (accumulator, model) => {
        accumulator.riskMin += model.riskMin;
        accumulator.riskMax += model.riskMax;
        accumulator.rrMin += model.rrMin;
        accumulator.rrMax += model.rrMax;
        accumulator.longBias += model.longBias;
        accumulator.winRate += model.winRate;
        return accumulator;
      },
      {
        riskMin: 0,
        riskMax: 0,
        rrMin: 0,
        rrMax: 0,
        longBias: 0,
        winRate: 0
      }
    );
    const count = backtestModelProfiles.length;

    return {
      id: `backtest-${backtestModelProfiles.map((model) => model.id).join("-")}`,
      name: backtestModelSelectionSummary,
      kind: "Model",
      riskMin: aggregate.riskMin / count,
      riskMax: aggregate.riskMax / count,
      rrMin: aggregate.rrMin / count,
      rrMax: aggregate.rrMax / count,
      longBias: aggregate.longBias / count,
      winRate: aggregate.winRate / count
    };
  }, [backtestModelProfiles, backtestModelSelectionSummary]);
  const backtestHasRun = backtestRunCount > 0;
  const appliedBacktestKey = useMemo(() => {
    return symbolTimeframeKey(appliedBacktestSettings.symbol, appliedBacktestSettings.timeframe);
  }, [appliedBacktestSettings.symbol, appliedBacktestSettings.timeframe]);
  const appliedBacktestModelNames = useMemo(() => {
    return availableAiModelNames.filter(
      (modelName) => (appliedBacktestSettings.aiModelStates[modelName] ?? 0) > 0
    );
  }, [appliedBacktestSettings.aiModelStates, availableAiModelNames]);
  const appliedBacktestModelProfiles = useMemo(() => {
    return appliedBacktestModelNames
      .map((modelName) => modelProfileById[createModelId(modelName)] ?? null)
      .filter((model): model is ModelProfile => model !== null);
  }, [appliedBacktestModelNames, modelProfileById]);
  const appliedBacktestModelSelectionSummary = useMemo(() => {
    if (appliedBacktestModelProfiles.length === 0) {
      return "No models selected";
    }

    if (appliedBacktestModelProfiles.length === 1) {
      return appliedBacktestModelProfiles[0]!.name;
    }

    if (appliedBacktestModelProfiles.length === 2) {
      return `${appliedBacktestModelProfiles[0]!.name} + ${appliedBacktestModelProfiles[1]!.name}`;
    }

    return `${appliedBacktestModelProfiles.length} models`;
  }, [appliedBacktestModelProfiles]);
  const appliedConfidenceGateDisabled = appliedBacktestSettings.aiMode === "off";
  const appliedEffectiveConfidenceThreshold = appliedConfidenceGateDisabled
    ? 0
    : appliedBacktestSettings.confidenceThreshold;
  const appliedAiModelEveryCandleMode =
    appliedBacktestSettings.aiMode !== "off" && !appliedBacktestSettings.aiFilterEnabled;
  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);

  const cycleValidationMode = () => {
    setValidationMode((current) => {
      const currentIndex = AI_VALIDATION_ORDER.indexOf(current);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % AI_VALIDATION_ORDER.length;

      return AI_VALIDATION_ORDER[nextIndex]!;
    });
  };

  useEffect(() => {
    selectedSurfaceTabRef.current = selectedSurfaceTab;
  }, [selectedSurfaceTab]);

  useEffect(() => {
    if (selectedSurfaceTab !== "backtest") {
      setIsBacktestSurfaceSettled(true);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      startTransition(() => {
        setIsBacktestSurfaceSettled(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedSurfaceTab]);

  useEffect(() => {
    setSelectedAiLibraries((current) => {
      const next = current.filter((libraryId) => !!aiLibraryDefById[libraryId]);
      return next.length === current.length ? current : next;
    });
    setSelectedAiLibrarySettings((current) => {
      let changed = false;
      const next: AiLibrarySettings = { ...(current ?? {}) };

      for (const definition of aiLibraryDefs) {
        if (!next[definition.id]) {
          next[definition.id] = { ...definition.defaults };
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [aiLibraryDefById, aiLibraryDefs]);

  const applyAiBulkLibrarySettings = () => {
    const scopeIds =
      aiBulkScope === "active" ? selectedAiLibraries : aiLibraryDefs.map((definition) => definition.id);

    setSelectedAiLibrarySettings((current) => {
      const next: AiLibrarySettings = { ...(current ?? {}) };

      for (const libraryId of scopeIds) {
        const definition = aiLibraryDefById[libraryId];

        if (!definition) {
          continue;
        }

        const fieldKeys = new Set(definition.fields.map((field) => field.key));
        const currentSettings = { ...((next[libraryId] ?? definition.defaults) as Record<string, AiLibrarySettingValue>) };

        if (fieldKeys.has("weight")) {
          currentSettings.weight = aiBulkWeight;
        }

        if (fieldKeys.has("stride")) {
          currentSettings.stride = aiBulkStride;
        }

        if (fieldKeys.has("maxSamples")) {
          currentSettings.maxSamples = aiBulkMaxSamples;
        }

        next[libraryId] = currentSettings;
      }

      return next;
    });
  };

  const addAiLibrary = (libraryId: string) => {
    const definition = aiLibraryDefById[libraryId];

    if (!definition) {
      return;
    }

    setSelectedAiLibrarySettings((current) => {
      if (current[libraryId]) {
        return current;
      }

      return {
        ...current,
        [libraryId]: { ...definition.defaults }
      };
    });
    setSelectedAiLibraries((current) => {
      if (current.includes(libraryId)) {
        return current;
      }

      return [...current, libraryId];
    });
    setSelectedAiLibraryId(libraryId);
  };

  const removeAiLibrary = (libraryId: string) => {
    setSelectedAiLibraries((current) => {
      const next = current.filter((id) => id !== libraryId);
      setSelectedAiLibraryId((selectedId) => (selectedId !== libraryId ? selectedId : next[0] ?? ""));
      return next;
    });
  };

  const moveAiLibrary = (libraryId: string, direction: -1 | 1) => {
    setSelectedAiLibraries((current) => {
      const index = current.indexOf(libraryId);

      if (index < 0) {
        return current;
      }

      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);

      if (!moved) {
        return current;
      }

      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const updateAiLibrarySetting = (
    libraryId: string,
    key: string,
    value: AiLibrarySettingValue
  ) => {
    const definition = aiLibraryDefById[libraryId];

    if (!definition) {
      return;
    }

    const shouldSyncPivotSpan = key === "pivotSpan" && (libraryId === "terrific" || libraryId === "terrible");
    const syncedLibraryId = libraryId === "terrific" ? "terrible" : "terrific";

    setSelectedAiLibrarySettings((current) => {
      const next: AiLibrarySettings = { ...(current ?? {}) };

      next[libraryId] = {
        ...((next[libraryId] ?? definition.defaults) as Record<string, AiLibrarySettingValue>),
        [key]: value
      };

      if (shouldSyncPivotSpan && aiLibraryDefById[syncedLibraryId]) {
        next[syncedLibraryId] = {
          ...((next[syncedLibraryId] ??
            aiLibraryDefById[syncedLibraryId].defaults) as Record<string, AiLibrarySettingValue>),
          [key]: value
        };
      }

      return next;
    });
  };

  useEffect(() => {
    setSelectedAiLibraries((current) => {
      const filtered = current.filter((libraryId) => Boolean(aiLibraryDefById[libraryId]));

      if (
        filtered.length === current.length &&
        filtered.every((libraryId, index) => libraryId === current[index])
      ) {
        return current;
      }

      return filtered.length > 0 ? filtered : ["core"];
    });
  }, [aiLibraryDefById]);

  useEffect(() => {
    if (selectedAiLibraries.length === 0) {
      if (selectedAiLibraryId !== "") {
        setSelectedAiLibraryId("");
      }

      return;
    }

    if (!selectedAiLibraries.includes(selectedAiLibraryId)) {
      setSelectedAiLibraryId(selectedAiLibraries[0] ?? "");
    }
  }, [selectedAiLibraryId, selectedAiLibraries]);

  useEffect(() => {
    setHoveredTime(null);
  }, [selectedTimeframe]);

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | null = null;
    let liveSyncInterval = 0;
    const key = selectedKey;
    const historyLimit = chartHistoryCountByTimeframe[selectedTimeframe];
    const recentOneMinutePromise = fetchRecentOneMinuteCandles();

    const connect = async () => {
      try {
        const historicalCandles = await fetchHistoryCandles(selectedTimeframe, recentOneMinutePromise);

        if (!cancelled && historicalCandles.length > 0) {
          setSeriesMap((prev) => ({
            ...prev,
            [key]: historicalCandles
          }));
        }
      } catch {
        // Keep the last real candle state if historical loading is unavailable.
      }

      const syncLiveCandlesFromMarket = async () => {
        try {
          const liveCandles = await fetchMarketCandles(selectedTimeframe, LIVE_MARKET_SYNC_LIMIT);

          if (cancelled || liveCandles.length === 0) {
            return;
          }

          setSeriesMap((prev) => ({
            ...prev,
            [key]: mergeRecentCandles(prev[key] ?? [], liveCandles, historyLimit)
          }));
        } catch {
          // Tick updates can continue even if the live candle window refresh fails.
        }
      };

      await syncLiveCandlesFromMarket();

      if (cancelled) {
        return;
      }

      liveSyncInterval = window.setInterval(() => {
        void syncLiveCandlesFromMarket();
      }, 8000);

      stream = new EventSource(
        `${PRICE_STREAM_URL}?${new URLSearchParams({
          api_key: MARKET_API_KEY,
          pairs: XAUUSD_PAIR
        }).toString()}`
      );
      streamRef.current = stream;

      stream.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if ((message.pair || "").toUpperCase() !== XAUUSD_PAIR) {
            return;
          }

          const price = Number(message.mid);
          const eventTime = Date.parse(String(message.time));

          if (!Number.isFinite(price) || !Number.isFinite(eventTime)) {
            return;
          }

          setSeriesMap((prev) => ({
            ...prev,
            [key]: mergeLivePriceIntoCandles(prev[key] ?? [], price, eventTime, selectedTimeframe)
          }));
        } catch {
          // Ignore malformed stream events and keep the feed alive.
        }
      };
    };

    void connect();

    return () => {
      cancelled = true;

      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }

      if (liveSyncInterval) {
        window.clearInterval(liveSyncInterval);
      }

      stream?.close();
    };
  }, [selectedKey, selectedTimeframe]);

  useEffect(() => {
    let cancelled = false;

    const prefetchTimeframeChanges = async () => {
      const promises = timeframes.map(async (tf) => {
        const key = symbolTimeframeKey(selectedSymbol, tf);
        if (tf === selectedTimeframe) return;

        try {
          const candles = await fetchMarketCandles(tf, 3);

          if (!cancelled && candles.length > 0) {
            setSeriesMap((prev) => {
              if ((prev[key]?.length ?? 0) >= candles.length) return prev;
              return { ...prev, [key]: candles };
            });
          }
        } catch {
          // Non-critical prefetch; ignore failures.
        }
      });

      await Promise.allSettled(promises);
    };

    prefetchTimeframeChanges();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  useEffect(() => {
    if (!backtestHasRun) {
      return;
    }

    let cancelled = false;
    const key = appliedBacktestKey;
    const oneMinuteKey = symbolTimeframeKey(appliedBacktestSettings.symbol, "1m");
    const isAlreadyOneMinute = appliedBacktestSettings.timeframe === "1m";
    const recentOneMinutePromise = fetchRecentOneMinuteCandles();

    setStatsRefreshProgress((current) => Math.max(current, 14));

    void (async () => {
      try {
        const promises: [Promise<Candle[]>, Promise<Candle[]>] = [
          fetchBacktestHistoryCandles(
            appliedBacktestSettings.timeframe,
            recentOneMinutePromise
          ),
          isAlreadyOneMinute
            ? Promise.resolve([])
            : fetchHistoryApiCandles("1m", BACKTEST_ONE_MINUTE_FETCH_COUNT).catch(() => [])
        ];

        const [deepHistoryCandles, oneMinuteCandles] = await Promise.all(promises);

        if (!cancelled && deepHistoryCandles.length >= MIN_SEED_CANDLES) {
          setBacktestSeriesMap((prev) => ({
            ...prev,
            [key]: deepHistoryCandles
          }));
        }

        if (!cancelled && !isAlreadyOneMinute && oneMinuteCandles.length > 0) {
          setBacktestOneMinuteSeriesMap((prev) => ({
            ...prev,
            [oneMinuteKey]: oneMinuteCandles
          }));
        }
      } catch {
        // Backtest falls back to chart history if deep history cannot load.
      } finally {
        if (!cancelled) {
          setStatsRefreshProgress((current) => Math.max(current, 32));
          setBacktestHistorySeedReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appliedBacktestKey,
    appliedBacktestSettings.symbol,
    appliedBacktestSettings.timeframe,
    backtestHasRun,
    backtestRefreshNowMs,
    backtestRunCount
  ]);

  const selectedCandles = useMemo(() => {
    return seriesMap[selectedKey] ?? EMPTY_CANDLES;
  }, [selectedKey, seriesMap]);

  const selectedBacktestCandles = useMemo(() => {
    return (
      backtestSeriesMap[appliedBacktestKey] ??
      seriesMap[appliedBacktestKey] ??
      EMPTY_CANDLES
    );
  }, [appliedBacktestKey, backtestSeriesMap, seriesMap]);

  const backtestBlueprintRange = useMemo(() => {
    const fallbackEndMs = floorToTimeframe(backtestRefreshNowMs, "1m");
    const fallbackStartMs =
      fallbackEndMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;

    if (selectedBacktestCandles.length < 2) {
      return {
        startMs: fallbackStartMs,
        endMs: fallbackEndMs
      };
    }

    const startMs = selectedBacktestCandles[0]?.time ?? fallbackStartMs;
    const endMs = selectedBacktestCandles[selectedBacktestCandles.length - 1]?.time ?? fallbackEndMs;

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return {
        startMs: fallbackStartMs,
        endMs: fallbackEndMs
      };
    }

    return {
      startMs,
      endMs
    };
  }, [backtestRefreshNowMs, selectedBacktestCandles]);

  const backtestTargetTrades = useMemo(() => {
    if (!backtestHasRun || !backtestHistorySeedReady || appliedBacktestModelProfiles.length === 0) {
      return 0;
    }

    const rangeMs = Math.max(60_000, backtestBlueprintRange.endMs - backtestBlueprintRange.startMs);
    const estimatedSlots = Math.max(
      1,
      Math.floor(rangeMs / Math.max(60_000, getTimeframeMs(appliedBacktestSettings.timeframe)))
    );
    const availableSlots =
      selectedBacktestCandles.length > 0
        ? selectedBacktestCandles.length
        : Math.min(BACKTEST_MAX_HISTORY_CANDLES, estimatedSlots);
    const rangeDays = Math.max(1, Math.ceil(rangeMs / (24 * 60 * 60_000)));
    const densityTarget = rangeDays * BACKTEST_TARGET_TRADES_PER_DAY;

    if (appliedAiModelEveryCandleMode) {
      // AI Model mode checks every bar, so candidate entries should be available
      // at candle cadence rather than sparse per-day trade density.
      const everyCandleTarget = Math.max(1, availableSlots - 1);
      return Math.max(appliedBacktestModelProfiles.length, everyCandleTarget);
    }

    return Math.max(appliedBacktestModelProfiles.length, Math.min(availableSlots, densityTarget));
  }, [
    appliedAiModelEveryCandleMode,
    appliedBacktestModelProfiles.length,
    appliedBacktestSettings.timeframe,
    backtestHasRun,
    backtestHistorySeedReady,
    backtestBlueprintRange,
    selectedBacktestCandles.length
  ]);

  const deepChartCandles = backtestSeriesMap[selectedKey] ?? null;
  const usesDeepChartHistory = (deepChartCandles?.length ?? 0) > 0;
  const selectedChartCandles = useMemo(() => {
    if (!usesDeepChartHistory) {
      return selectedCandles;
    }

    const deepHistory = deepChartCandles ?? EMPTY_CANDLES;

    if (selectedCandles.length === 0) {
      return deepHistory;
    }

    return mergeRecentCandles(
      deepHistory,
      selectedCandles,
      Math.max(deepHistory.length + selectedCandles.length, selectedCandles.length)
    );
  }, [deepChartCandles, selectedCandles, usesDeepChartHistory]);

  selectedChartCandlesRef.current = selectedChartCandles;

  const gaplessTimeMap = useMemo(() => {
    const realToGapless = new Map<number, number>();
    const gaplessToReal = new Map<number, number>();

    if (selectedChartCandles.length === 0) {
      return { realToGapless, gaplessToReal };
    }

    const stepSec = timeframeMinutes[selectedTimeframe] * 60;
    const firstSec = Math.floor(selectedChartCandles[0].time / 1000);

    for (let i = 0; i < selectedChartCandles.length; i++) {
      const realSec = Math.floor(selectedChartCandles[i].time / 1000);
      const gaplessSec = firstSec + i * stepSec;
      realToGapless.set(realSec, gaplessSec);
      gaplessToReal.set(gaplessSec, realSec);
    }

    return { realToGapless, gaplessToReal };
  }, [selectedChartCandles, selectedTimeframe]);

  gaplessToRealRef.current = gaplessTimeMap.gaplessToReal;

  const toGaplessUtc = useCallback(
    (ms: number): UTCTimestamp => {
      const realSec = Math.floor(ms / 1000);
      const mapped = gaplessTimeMap.realToGapless.get(realSec);
      return (mapped ?? realSec) as UTCTimestamp;
    },
    [gaplessTimeMap]
  );

  useEffect(() => {
    const candles = selectedChartCandlesRef.current;
    const totalBars = candles.length;
    const selection = `${selectedSymbol}-${selectedTimeframe}`;
    const selectionChanged = selectionRef.current !== selection;
    const previousTotalBars = previousChartSourceLengthRef.current;

    const previousSelection = selectionRef.current;
    const previousSelectionDash = previousSelection.lastIndexOf("-");
    const previousSymbol = previousSelectionDash > 0 ? previousSelection.substring(0, previousSelectionDash) : "";
    const symbolChanged = selectionChanged && previousSymbol !== selectedSymbol;

    selectionRef.current = selection;
    previousChartSourceLengthRef.current = totalBars;
    chartSourceLengthRef.current = totalBars;

    if (totalBars === 0) {
      chartRenderWindowRef.current = { from: 0, to: -1 };
      chartVisibleGlobalRangeRef.current = null;
      chartPendingVisibleGlobalRangeRef.current = null;
      setChartRenderWindow((current) =>
        current.from === 0 && current.to === -1 ? current : { from: 0, to: -1 }
      );
      return;
    }

    const moveToLatest = () => {
      const visibleCount = timeframeVisibleCount[selectedTimeframe];
      const rightPadding = Math.round(visibleCount * 0.4);
      const visibleFrom = Math.max(0, totalBars - 1 - (visibleCount - rightPadding));
      const visibleTo = visibleFrom + visibleCount;
      const visibleRange = { from: visibleFrom, to: visibleTo };
      const nextWindow = buildChartDataWindow(totalBars, visibleFrom, Math.min(visibleTo, totalBars - 1));

      chartVisibleGlobalRangeRef.current = visibleRange;
      chartPendingVisibleGlobalRangeRef.current = visibleRange;
      chartRenderWindowRef.current = nextWindow;
      setChartRenderWindow((current) =>
        current.from === nextWindow.from && current.to === nextWindow.to ? current : nextWindow
      );
    };

    const restoreSavedPosition = () => {
      const centerTimeMs = chartViewCenterTimeMsRef.current;

      if (centerTimeMs === null || candles.length === 0) {
        moveToLatest();
        return;
      }

      const centerIndex = findCandleIndexAtOrBefore(candles, centerTimeMs);

      if (centerIndex < 0) {
        moveToLatest();
        return;
      }

      const visibleCount = timeframeVisibleCount[selectedTimeframe];
      const halfVisible = Math.floor(visibleCount / 2);
      const visibleFrom = Math.max(0, centerIndex - halfVisible);
      const visibleTo = visibleFrom + visibleCount;
      const visibleRange = { from: visibleFrom, to: visibleTo };
      const nextWindow = buildChartDataWindow(totalBars, visibleFrom, Math.min(visibleTo, totalBars - 1));

      chartVisibleGlobalRangeRef.current = visibleRange;
      chartPendingVisibleGlobalRangeRef.current = visibleRange;
      chartRenderWindowRef.current = nextWindow;
      setChartRenderWindow((current) =>
        current.from === nextWindow.from && current.to === nextWindow.to ? current : nextWindow
      );
    };

    if (symbolChanged) {
      moveToLatest();
      return;
    }

    if (selectionChanged || previousTotalBars <= 0) {
      restoreSavedPosition();
      return;
    }

    if (totalBars < previousTotalBars) {
      const currentVisible = chartVisibleGlobalRangeRef.current ?? chartPendingVisibleGlobalRangeRef.current;
      const fallbackVisible =
        currentVisible !== null
          ? clampChartDataWindow(totalBars, currentVisible.from, currentVisible.to)
          : clampChartDataWindow(
              totalBars,
              totalBars - 1 - timeframeVisibleCount[selectedTimeframe],
              totalBars - 1
            );
      const nextWindow = buildChartDataWindow(totalBars, fallbackVisible.from, fallbackVisible.to);

      chartVisibleGlobalRangeRef.current = fallbackVisible;
      chartPendingVisibleGlobalRangeRef.current = fallbackVisible;
      chartRenderWindowRef.current = nextWindow;
      setChartRenderWindow((current) =>
        current.from === nextWindow.from && current.to === nextWindow.to ? current : nextWindow
      );
      return;
    }

    if (totalBars > previousTotalBars) {
      const nextWindow = buildChartDataWindow(
        totalBars,
        chartRenderWindowRef.current.from,
        totalBars - 1
      );

      chartRenderWindowRef.current = nextWindow;
      setChartRenderWindow((current) =>
        current.from === nextWindow.from && current.to === nextWindow.to ? current : nextWindow
      );
    }
  }, [selectedChartCandles.length, selectedSymbol, selectedTimeframe]);

  const chartRenderCandles = useMemo(() => {
    if (chartRenderWindow.to < chartRenderWindow.from) {
      return EMPTY_CANDLES;
    }

    return selectedChartCandles.slice(chartRenderWindow.from, chartRenderWindow.to + 1);
  }, [chartRenderWindow, selectedChartCandles]);

  requestChartVisibleRangeRef.current = (visibleRange: ChartDataWindow) => {
    const totalBars = chartSourceLengthRef.current;

    if (totalBars <= 0) {
      return;
    }

    const clampedFrom = Math.min(totalBars - 1, Math.max(0, Math.floor(visibleRange.from)));
    const nextVisibleRange = { from: clampedFrom, to: Math.max(clampedFrom, visibleRange.to) };
    const nextWindow = buildChartDataWindow(
      totalBars,
      clampedFrom,
      Math.min(nextVisibleRange.to, totalBars - 1)
    );
    const currentWindow = chartRenderWindowRef.current;

    chartVisibleGlobalRangeRef.current = nextVisibleRange;
    chartPendingVisibleGlobalRangeRef.current = nextVisibleRange;

    if (
      currentWindow.from === nextWindow.from &&
      currentWindow.to === nextWindow.to
    ) {
      const chart = chartRef.current;

      if (!chart || currentWindow.to < currentWindow.from) {
        return;
      }

      chartIsApplyingVisibleRangeRef.current = true;
      chart.timeScale().setVisibleLogicalRange({
        from: nextVisibleRange.from - currentWindow.from,
        to: nextVisibleRange.to - currentWindow.from
      });
      chartPendingVisibleGlobalRangeRef.current = null;

      if (chartVisibleRangeSyncRafRef.current) {
        window.cancelAnimationFrame(chartVisibleRangeSyncRafRef.current);
      }

      chartVisibleRangeSyncRafRef.current = window.requestAnimationFrame(() => {
        chartIsApplyingVisibleRangeRef.current = false;
        chartVisibleRangeSyncRafRef.current = 0;
      });
      return;
    }

    chartRenderWindowRef.current = nextWindow;
    setChartRenderWindow(nextWindow);
  };

  const candleByUnix = useMemo(() => {
    const map = new Map<number, Candle>();

    for (const candle of chartRenderCandles) {
      map.set(toGaplessUtc(candle.time) as number, candle);
    }

    return map;
  }, [chartRenderCandles, toGaplessUtc]);

  const latestCandle = selectedCandles[selectedCandles.length - 1] ?? null;
  const previousCandle =
    selectedCandles.length > 1 ? selectedCandles[selectedCandles.length - 2] : latestCandle;

  const quoteChange =
    latestCandle && previousCandle && previousCandle.close > 0
      ? ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100
      : 0;

  const timeframeChanges = useMemo(() => {
    return timeframes.map((tf) => {
      const key = symbolTimeframeKey(selectedSymbol, tf);
      const list = seriesMap[key] ?? [];
      const last = list[list.length - 1];
      const prev = list.length > 1 ? list[list.length - 2] : null;
      const change =
        last && prev && prev.close > 0
          ? ((last.close - prev.close) / prev.close) * 100
          : null;

      return { timeframe: tf, change };
    });
  }, [selectedSymbol, seriesMap]);

  const hoveredCandle =
    latestCandle && hoveredTime ? candleByUnix.get(hoveredTime) ?? latestCandle : latestCandle;

  const hoveredChange =
    hoveredCandle && hoveredCandle.open > 0
      ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
      : 0;

  const watchlistRows = useMemo(() => {
    return futuresAssets.map((asset) => {
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const list = seriesMap[key] ?? [];
      const last = list[list.length - 1];
      const prev = list[list.length - 2] ?? last;
      const change =
        last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

      return {
        ...asset,
        lastPrice: last?.close ?? null,
        change
      };
    });
  }, [selectedTimeframe, seriesMap]);

  const tradeBlueprints = useMemo(() => {
    if (appliedBacktestModelProfiles.length === 0 || backtestTargetTrades <= 0) {
      return [];
    }

    if (appliedAiModelEveryCandleMode) {
      const candles = selectedBacktestCandles;
      if (candles.length < 2) {
        return [];
      }

      const seedKey = `ai-model-every-candle-${backtestRefreshNowMs}-${appliedBacktestModelProfiles
        .map((model) => model.id)
        .join("|")}`;
      const rand = createSeededRng(hashString(seedKey));
      const blueprints: TradeBlueprint[] = [];
      const modelCount = appliedBacktestModelProfiles.length;
      const maxEntryIndex = Math.max(0, candles.length - 2);
      const fallbackExitOffsetMs = Math.max(60_000, getTimeframeMs(appliedBacktestSettings.timeframe));

      for (let candleIndex = 0; candleIndex <= maxEntryIndex; candleIndex += 1) {
        const modelIndex =
          (candleIndex + Math.floor(rand() * modelCount)) % Math.max(1, modelCount);
        const model = appliedBacktestModelProfiles[modelIndex]!;
        const symbol = futuresAssets[Math.floor(rand() * futuresAssets.length)]?.symbol ?? selectedSymbol;
        const side: TradeSide = rand() <= model.longBias ? "Long" : "Short";
        const result: TradeResult = rand() <= model.winRate ? "Win" : "Loss";
        const rr = model.rrMin + rand() * (model.rrMax - model.rrMin);
        const riskPct = model.riskMin + rand() * (model.riskMax - model.riskMin);
        const entryMs = Number(candles[candleIndex]?.time);
        const remainingBars = Math.max(1, candles.length - 1 - candleIndex);
        const holdBars = 1 + Math.floor(rand() * Math.min(96, remainingBars));
        const exitIndex = Math.min(candles.length - 1, candleIndex + holdBars);
        const exitMsRaw = Number(candles[exitIndex]?.time);
        const exitMs = Number.isFinite(exitMsRaw) ? exitMsRaw : entryMs + fallbackExitOffsetMs;
        const units = Math.max(
          1,
          Number.isFinite(appliedBacktestSettings.dollarsPerMove)
            ? appliedBacktestSettings.dollarsPerMove
            : 1
        );

        if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || exitMs <= entryMs) {
          continue;
        }

        blueprints.push({
          id: `${model.id}-ec-${String(candleIndex).padStart(6, "0")}`,
          modelId: model.id,
          symbol,
          side,
          result,
          entryMs,
          exitMs,
          riskPct,
          rr,
          units
        });
      }

      return blueprints
        .sort((left, right) => right.exitMs - left.exitMs)
        .slice(0, backtestTargetTrades);
    }

    const perModelBase = Math.floor(backtestTargetTrades / appliedBacktestModelProfiles.length);
    const remainder = backtestTargetTrades % appliedBacktestModelProfiles.length;
    const blueprints: TradeBlueprint[] = [];

    appliedBacktestModelProfiles.forEach((model, index) => {
      const count = perModelBase + (index < remainder ? 1 : 0);

      if (count <= 0) {
        return;
      }

      blueprints.push(
        ...generateTradeBlueprints(
          model,
          count,
          backtestRefreshNowMs,
          backtestBlueprintRange,
          appliedBacktestSettings.dollarsPerMove
        )
      );
    });

    return blueprints
      .sort((left, right) => right.exitMs - left.exitMs)
      .slice(0, backtestTargetTrades);
  }, [
    appliedAiModelEveryCandleMode,
    appliedBacktestModelProfiles,
    appliedBacktestSettings.dollarsPerMove,
    appliedBacktestSettings.timeframe,
    backtestBlueprintRange,
    backtestRefreshNowMs,
    backtestTargetTrades,
    selectedBacktestCandles,
    selectedSymbol
  ]);

  const [historyRows, setHistoryRows] = useState<HistoryItem[]>([]);
  const boundedHistoryRows = useMemo(() => {
    return applyHistoryCollectionPnlBounds(
      historyRows,
      appliedBacktestSettings.tpDollars,
      appliedBacktestSettings.slDollars
    );
  }, [appliedBacktestSettings.slDollars, appliedBacktestSettings.tpDollars, historyRows]);
  const deferredHistoryRows = useDeferredValue(boundedHistoryRows);
  const backtestHistoryJobIdRef = useRef(0);
  const chronologicalHistoryRows = useMemo(() => {
    return [...deferredHistoryRows].sort(
      (a, b) => Number(a.exitTime) - Number(b.exitTime) || a.id.localeCompare(b.id)
    );
  }, [deferredHistoryRows]);
  const backtestSourceTrades = useMemo(() => {
    return chronologicalHistoryRows;
  }, [chronologicalHistoryRows]);
  const antiCheatBacktestContext = useMemo(() => {
    const startMs = getUtcDayStartMs(appliedBacktestSettings.statsDateStart);
    const endExclusiveMs = getUtcDayEndExclusiveMs(appliedBacktestSettings.statsDateEnd);
    const dateFilteredTrades = backtestSourceTrades.filter((trade) => {
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
        appliedBacktestSettings.enabledBacktestWeekdays.includes(weekday) &&
        appliedBacktestSettings.enabledBacktestSessions.includes(session) &&
        appliedBacktestSettings.enabledBacktestMonths.includes(monthIndex) &&
        appliedBacktestSettings.enabledBacktestHours.includes(entryHour)
      );
    });
    const confidenceById = new Map<string, number>();

    if (!appliedBacktestSettings.antiCheatEnabled || timeFilteredBase.length === 0) {
      return {
        dateFilteredTrades,
        timeFilteredTrades:
          appliedBacktestSettings.antiCheatEnabled &&
          appliedBacktestSettings.validationMode === "split"
            ? timeFilteredBase.slice(Math.floor(timeFilteredBase.length * 0.5))
            : timeFilteredBase,
        confidenceById
      };
    }

    const activeLibraryIds =
      appliedBacktestSettings.selectedAiLibraries.length > 0
        ? appliedBacktestSettings.selectedAiLibraries
        : ["core"];
    const splitIndex =
      appliedBacktestSettings.validationMode === "split"
        ? Math.floor(timeFilteredBase.length * 0.5)
        : 0;
    const splitTrainingTrades =
      appliedBacktestSettings.validationMode === "split"
        ? timeFilteredBase.slice(0, splitIndex)
        : timeFilteredBase;
    const timeFilteredTrades =
      appliedBacktestSettings.validationMode === "split"
        ? timeFilteredBase.slice(splitIndex)
        : timeFilteredBase;

    const getLibrarySettings = (libraryId: string) => {
      const definition = aiLibraryDefById[libraryId];
      const defaults = definition?.defaults ?? {};
      return {
        ...(defaults as Record<string, AiLibrarySettingValue>),
        ...((appliedBacktestSettings.selectedAiLibrarySettings[libraryId] ?? {}) as Record<
          string,
          AiLibrarySettingValue
        >)
      };
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
      let source = pool;

      if (normalizedId === "suppressed") {
        source = pool.filter((trade) => trade.result === "Loss");
      } else if (normalizedId === "recent") {
        const windowTrades = clamp(
          Math.floor(Number(settings.windowTrades ?? 150) || 150),
          0,
          5000
        );
        source = windowTrades > 0 ? pool.slice(-windowTrades) : [];
      } else if (normalizedId === "tokyo") {
        source = pool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "Tokyo"
        );
      } else if (normalizedId === "sydney") {
        source = pool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "Sydney"
        );
      } else if (normalizedId === "london") {
        source = pool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "London"
        );
      } else if (normalizedId === "newyork") {
        source = pool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "New York"
        );
      } else if (normalizedId === "terrific") {
        const count = getLibraryCount(libraryId, 96);
        source = [...pool]
          .sort((left, right) => right.pnlUsd - left.pnlUsd)
          .slice(0, count);
      } else if (normalizedId === "terrible") {
        const count = getLibraryCount(libraryId, 96);
        source = [...pool]
          .sort((left, right) => left.pnlUsd - right.pnlUsd)
          .slice(0, count);
      } else if ((settings.kind as string | undefined) === "model_sim") {
        const targetModel = String(settings.model ?? currentTrade.entrySource);
        source = pool.filter((trade) => trade.entrySource === targetModel);
      }

      const stride = getLibraryStride(libraryId);
      if (stride > 1) {
        source = source.filter((_, index) => index % stride === 0);
      }

      const maxSamples = getLibraryMaxSamples(libraryId, 96);
      const defaultTargetWinRate = getOutcomeWinRatePercent(
        source,
        (candidate) => candidate.result === "Win"
      );
      const rawTargetWinRate = Number(settings[AI_LIBRARY_TARGET_WIN_RATE_KEY]);
      const targetWinRate = Number.isFinite(rawTargetWinRate)
        ? clamp(rawTargetWinRate, 0, 100)
        : defaultTargetWinRate;

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

    for (let index = 0; index < timeFilteredBase.length; index += 1) {
      const trade = timeFilteredBase[index]!;
      const basePool =
        appliedBacktestSettings.validationMode === "split"
          ? splitTrainingTrades
          : timeFilteredBase.slice(0, index);

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
            appliedBacktestSettings.validationMode === "synthetic"
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
      timeFilteredTrades,
      confidenceById
    };
  }, [
    aiLibraryDefById,
    appliedBacktestSettings.antiCheatEnabled,
    appliedBacktestSettings.enabledBacktestHours,
    appliedBacktestSettings.enabledBacktestMonths,
    appliedBacktestSettings.enabledBacktestSessions,
    appliedBacktestSettings.enabledBacktestWeekdays,
    appliedBacktestSettings.selectedAiLibraries,
    appliedBacktestSettings.selectedAiLibrarySettings,
    appliedBacktestSettings.statsDateEnd,
    appliedBacktestSettings.statsDateStart,
    appliedBacktestSettings.validationMode,
    backtestSourceTrades,
  ]);
  const getEffectiveTradeConfidenceScore = useCallback(
    (trade: HistoryItem) => {
      return antiCheatBacktestContext.confidenceById.get(trade.id) ?? getTradeConfidenceScore(trade);
    },
    [antiCheatBacktestContext]
  );
  const chartPanelHistoryRows = useMemo(() => {
    return antiCheatBacktestContext.timeFilteredTrades
      .filter((trade) => {
        const confidence = getEffectiveTradeConfidenceScore(trade) * 100;
        return (
          appliedConfidenceGateDisabled ||
          confidence >= appliedEffectiveConfidenceThreshold
        );
      })
      .sort((a, b) => Number(b.exitTime) - Number(a.exitTime) || b.id.localeCompare(a.id));
  }, [
    appliedConfidenceGateDisabled,
    appliedEffectiveConfidenceThreshold,
    antiCheatBacktestContext,
    getEffectiveTradeConfidenceScore
  ]);

  const activeTrade = useMemo<ActiveTrade | null>(() => {
    if (chartPanelHistoryRows.length === 0) {
      return null;
    }

    const trade = chartPanelHistoryRows[0];
    const nowSec = Math.floor(Date.now() / 1000);

    if (Number(trade.exitTime) <= nowSec) {
      return null;
    }

    const riskDist = Math.abs(trade.entryPrice - trade.stopPrice);
    const rewardDist = Math.abs(trade.targetPrice - trade.entryPrice);
    const rr = riskDist > 0 ? rewardDist / riskDist : 0;
    const markPrice = trade.outcomePrice;
    const progressRaw =
      trade.side === "Long"
        ? (markPrice - trade.stopPrice) / Math.max(0.000001, trade.targetPrice - trade.stopPrice)
        : (trade.stopPrice - markPrice) / Math.max(0.000001, trade.stopPrice - trade.targetPrice);

    return {
      symbol: trade.symbol,
      side: trade.side,
      units: trade.units,
      entryPrice: trade.entryPrice,
      markPrice,
      targetPrice: trade.targetPrice,
      stopPrice: trade.stopPrice,
      openedAt: trade.entryTime,
      openedAtLabel: trade.entryAt,
      elapsed: formatElapsed(Number(trade.entryTime), Math.floor(referenceNowMs / 1000)),
      pnlPct: trade.pnlPct,
      pnlValue: trade.pnlUsd,
      progressPct: clamp(progressRaw * 100, 0, 100),
      rr
    };
  }, [chartPanelHistoryRows, referenceNowMs]);

  const latestTradeBarsAgo = useMemo(() => {
    if (deferredHistoryRows.length === 0) return null;
    const latestExitTime = deferredHistoryRows.reduce(
      (max, row) => Math.max(max, Number(row.exitTime)),
      0
    );
    if (latestExitTime === 0) return null;
    const barSeconds = timeframeMinutes[appliedBacktestSettings.timeframe] * 60;
    return Math.max(0, Math.floor((referenceNowMs / 1000 - latestExitTime) / barSeconds));
  }, [deferredHistoryRows, referenceNowMs, appliedBacktestSettings.timeframe]);

  const backtestHistorySeriesBySymbol = useMemo(() => {
    const next: Record<string, Candle[]> = {};

    for (const blueprint of tradeBlueprints) {
      if (next[blueprint.symbol]) {
        continue;
      }

      const key = symbolTimeframeKey(blueprint.symbol, appliedBacktestSettings.timeframe);
      next[blueprint.symbol] = backtestSeriesMap[key] ?? seriesMap[key] ?? EMPTY_CANDLES;
    }

    return next;
  }, [
    appliedBacktestSettings.timeframe,
    backtestSeriesMap,
    seriesMap,
    tradeBlueprints
  ]);

  const backtestOneMinuteCandlesBySymbol = useMemo(() => {
    if (appliedBacktestSettings.timeframe === "1m") {
      return {};
    }

    const next: Record<string, Candle[]> = {};

    for (const blueprint of tradeBlueprints) {
      if (next[blueprint.symbol]) {
        continue;
      }

      const key = symbolTimeframeKey(blueprint.symbol, "1m");
      const candles = backtestOneMinuteSeriesMap[key] ?? EMPTY_CANDLES;

      if (candles.length > 0) {
        next[blueprint.symbol] = candles;
      }
    }

    return next;
  }, [
    appliedBacktestSettings.timeframe,
    backtestOneMinuteSeriesMap,
    tradeBlueprints
  ]);

  tradeBlueprintsRef.current = tradeBlueprints;
  backtestHistorySeriesBySymbolRef.current = backtestHistorySeriesBySymbol;
  backtestOneMinuteCandlesBySymbolRef.current = backtestOneMinuteCandlesBySymbol;
  backtestTargetTradesRef.current = backtestTargetTrades;
  backtestBlueprintRangeRef.current = backtestBlueprintRange;
  modelProfileByIdRef.current = modelProfileById;
  appliedBacktestTpDollarsRef.current = appliedBacktestSettings.tpDollars;
  appliedBacktestSlDollarsRef.current = appliedBacktestSettings.slDollars;
  appliedBacktestStopModeRef.current = appliedBacktestSettings.stopMode;
  appliedBacktestBreakEvenTriggerPctRef.current = appliedBacktestSettings.breakEvenTriggerPct;
  appliedBacktestTrailingStartPctRef.current = appliedBacktestSettings.trailingStartPct;
  appliedBacktestTrailingDistPctRef.current = appliedBacktestSettings.trailingDistPct;

  useEffect(() => {
    if (!backtestHasRun || !backtestHistorySeedReady) {
      return;
    }

    const nextJobId = backtestHistoryJobIdRef.current + 1;
    backtestHistoryJobIdRef.current = nextJobId;
    const tradeBlueprintsSnapshot = tradeBlueprintsRef.current;
    const backtestTargetTradesSnapshot = backtestTargetTradesRef.current;
    const backtestHistorySeriesBySymbolSnapshot =
      backtestHistorySeriesBySymbolRef.current;
    const backtestOneMinuteCandlesBySymbolSnapshot =
      backtestOneMinuteCandlesBySymbolRef.current;
    const backtestBlueprintRangeSnapshot = backtestBlueprintRangeRef.current;
    const modelProfileByIdSnapshot = modelProfileByIdRef.current;
    const tpDollarsSnapshot = appliedBacktestTpDollarsRef.current;
    const slDollarsSnapshot = appliedBacktestSlDollarsRef.current;
    const stopModeSnapshot = appliedBacktestStopModeRef.current;
    const breakEvenTriggerPctSnapshot = appliedBacktestBreakEvenTriggerPctRef.current;
    const trailingStartPctSnapshot = appliedBacktestTrailingStartPctRef.current;
    const trailingDistPctSnapshot = appliedBacktestTrailingDistPctRef.current;

    if (tradeBlueprintsSnapshot.length === 0 || backtestTargetTradesSnapshot <= 0) {
      startTransition(() => {
        setHistoryRows([]);
      });
      finishStatsRefreshLoading(formatStatsRefreshDateLabel(backtestRefreshNowMs));
      return;
    }

    const modelNamesById: Record<string, string> = {};

    for (const blueprint of tradeBlueprintsSnapshot) {
      if (!modelNamesById[blueprint.modelId]) {
        modelNamesById[blueprint.modelId] =
          modelProfileByIdSnapshot[blueprint.modelId]?.name ?? "Settings";
      }
    }

    const fallbackEndMs = floorToTimeframe(backtestRefreshNowMs, "1m");
    const fallbackStartMs =
      fallbackEndMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;
    const timelineStartMs = Number.isFinite(backtestBlueprintRangeSnapshot.startMs)
      ? backtestBlueprintRangeSnapshot.startMs
      : fallbackStartMs;
    const timelineEndMsRaw = Number.isFinite(backtestBlueprintRangeSnapshot.endMs)
      ? backtestBlueprintRangeSnapshot.endMs
      : fallbackEndMs;
    const timelineEndMs = Math.max(timelineStartMs + 60_000, timelineEndMsRaw);
    const chronologicalTradeBlueprints = [...tradeBlueprintsSnapshot].sort(
      (left, right) =>
        left.exitMs - right.exitMs ||
        left.entryMs - right.entryMs ||
        left.id.localeCompare(right.id)
    );
    const firstChronologicalBlueprint = chronologicalTradeBlueprints[0] ?? null;
    const lastChronologicalBlueprint =
      chronologicalTradeBlueprints[chronologicalTradeBlueprints.length - 1] ?? null;
    const analysisEndMsRaw = lastChronologicalBlueprint
      ? Math.max(lastChronologicalBlueprint.entryMs, lastChronologicalBlueprint.exitMs)
      : timelineEndMs;
    const filterStartMs = appliedBacktestSettings.statsDateStart
      ? new Date(appliedBacktestSettings.statsDateStart).getTime()
      : NaN;
    const filterEndMs = appliedBacktestSettings.statsDateEnd
      ? new Date(appliedBacktestSettings.statsDateEnd + "T23:59:59.999").getTime()
      : NaN;
    const analysisStartMs = Number.isFinite(filterStartMs)
      ? Math.max(timelineStartMs, filterStartMs)
      : timelineStartMs;
    const rawEndMs = Number.isFinite(analysisEndMsRaw) ? analysisEndMsRaw : timelineEndMs;
    const analysisEndMs = Math.max(
      analysisStartMs + 60_000,
      Number.isFinite(filterEndMs) ? Math.min(rawEndMs, filterEndMs) : rawEndMs
    );
    let lastLoadingProgressRatio = 0;
    const setLoadingProgress = (ratio: number) => {
      const normalizedRatio = clamp(ratio, 0, 1);

      if (normalizedRatio < lastLoadingProgressRatio) {
        return;
      }

      lastLoadingProgressRatio = normalizedRatio;
      const analysisSpanMs = Math.max(60_000, analysisEndMs - analysisStartMs);
      const currentMs = analysisStartMs + analysisSpanMs * normalizedRatio;

      setStatsRefreshProgress(normalizedRatio * 100);
      setStatsRefreshProgressLabel(formatStatsRefreshDateLabel(currentMs));
    };

    const computeSynchronously = (): HistoryItem[] => {
      return normalizeBacktestHistoryRows(
        finalizeBacktestHistoryRows(
          computeBacktestHistoryRowsChunk({
            blueprints: chronologicalTradeBlueprints,
            candleSeriesBySymbol: backtestHistorySeriesBySymbolSnapshot,
            oneMinuteCandlesBySymbol: backtestOneMinuteCandlesBySymbolSnapshot,
            modelNamesById,
            tpDollars: tpDollarsSnapshot,
            slDollars: slDollarsSnapshot,
            stopMode: stopModeSnapshot,
            breakEvenTriggerPct: breakEvenTriggerPctSnapshot,
            trailingStartPct: trailingStartPctSnapshot,
            trailingDistPct: trailingDistPctSnapshot
          }),
          backtestTargetTradesSnapshot
        )
      );
    };

    let cancelled = false;
    let failed = false;
    let settled = false;
    const workers: Worker[] = [];
    let fallbackTimeoutId = window.setTimeout(() => {
      handleFallback();
    }, 45_000);

    const clearFallbackTimeout = () => {
      if (!fallbackTimeoutId) {
        return;
      }

      window.clearTimeout(fallbackTimeoutId);
      fallbackTimeoutId = 0;
    };

    const commitRows = (rows: HistoryItem[]) => {
      if (
        cancelled ||
        settled ||
        backtestHistoryJobIdRef.current !== nextJobId
      ) {
        return;
      }

      settled = true;
      clearFallbackTimeout();
      startTransition(() => {
        setHistoryRows(rows);
      });
      finishStatsRefreshLoading(formatStatsRefreshDateLabel(analysisEndMs));
    };

    const handleFallback = () => {
      if (failed || cancelled || settled) {
        return;
      }

      failed = true;
      workers.forEach((worker) => worker.terminate());

      try {
        commitRows(computeSynchronously());
      } catch {
        commitRows([]);
      }
    };

    setStatsRefreshProgress(0);
    setStatsRefreshLoadingDisplayProgress(0);
    setLoadingProgress(0);

    if (typeof Worker === "undefined") {
      handleFallback();
      return () => {
        cancelled = true;
        clearFallbackTimeout();
      };
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("./backtestHistoryWorker.ts", import.meta.url));
    } catch {
      handleFallback();
      return () => {
        cancelled = true;
        clearFallbackTimeout();
      };
    }
    workers.push(worker);

    worker.onmessage = (event: MessageEvent<BacktestHistoryWorkerResponse>) => {
      const message = event.data;

      if (failed || cancelled || message.requestId !== nextJobId) {
        return;
      }

      if (message.type === "progress") {
        const total = Math.max(1, message.total);
        setLoadingProgress(message.processed / total);
        return;
      }

      worker.terminate();
      setLoadingProgress(1);
      window.requestAnimationFrame(() => {
        commitRows(
          normalizeBacktestHistoryRows(
            finalizeBacktestHistoryRows(
              message.rows,
              backtestTargetTradesSnapshot
            )
          )
        );
      });
    };

    worker.onerror = () => {
      worker.terminate();
      handleFallback();
    };

    try {
      worker.postMessage({
        requestId: nextJobId,
        blueprints: chronologicalTradeBlueprints,
        candleSeriesBySymbol: backtestHistorySeriesBySymbolSnapshot,
        oneMinuteCandlesBySymbol: backtestOneMinuteCandlesBySymbolSnapshot,
        modelNamesById,
        tpDollars: tpDollarsSnapshot,
        slDollars: slDollarsSnapshot,
        stopMode: stopModeSnapshot,
        breakEvenTriggerPct: breakEvenTriggerPctSnapshot,
        trailingStartPct: trailingStartPctSnapshot,
        trailingDistPct: trailingDistPctSnapshot
      });
    } catch {
      worker.terminate();
      handleFallback();
    }

    return () => {
      cancelled = true;
      clearFallbackTimeout();
      worker.terminate();
    };
  }, [
    backtestHasRun,
    backtestHistorySeedReady,
    backtestRunCount,
    backtestRefreshNowMs,
    finishStatsRefreshLoading
  ]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return chartPanelHistoryRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [chartPanelHistoryRows, selectedHistoryId]);

  const currentSymbolHistoryRows = useMemo(() => {
    return chartPanelHistoryRows.filter((row) => row.symbol === selectedSymbol);
  }, [chartPanelHistoryRows, selectedSymbol]);

  const candleIndexByUnix = useMemo(() => {
    const map = new Map<number, number>();

    for (let i = 0; i < selectedChartCandles.length; i += 1) {
      map.set(toUtcTimestamp(selectedChartCandles[i].time), i);
    }

    return map;
  }, [selectedChartCandles]);

  const openBacktestTradeDetails = (trade: HistoryItem) => {
    const entryIndex = candleIndexByUnix.get(Number(trade.entryTime));
    const exitIndex = candleIndexByUnix.get(Number(trade.exitTime));

    setActiveBacktestTradeDetails({
      id: trade.id,
      uid: trade.id,
      kind: "trade",
      symbol: trade.symbol,
      direction: trade.side === "Long" ? 1 : -1,
      side: trade.side,
      session: getSessionLabel(trade.entryTime),
      entryTime: Number(trade.entryTime),
      exitTime: Number(trade.exitTime),
      entryPrice: trade.entryPrice,
      exitPrice: trade.outcomePrice,
      tpPrice: trade.targetPrice,
      slPrice: trade.stopPrice,
      pnl: trade.pnlUsd,
      entryModel: trade.entrySource,
      model: trade.entrySource,
      chunkType: trade.entrySource,
      entryReason: trade.entrySource,
      exitReason: getBacktestExitLabel(trade),
      confidence: getEffectiveTradeConfidenceScore(trade),
      entryIndex: typeof entryIndex === "number" ? entryIndex : undefined,
      exitIndex: typeof exitIndex === "number" ? exitIndex : undefined
    });
  };

  const activeChartTrade = useMemo<OverlayTrade | null>(() => {
    if (!activeTrade || selectedCandles.length === 0) {
      return null;
    }

    const latestTime = toUtcTimestamp(selectedCandles[selectedCandles.length - 1].time);

    return {
      id: "active-live",
      symbol: activeTrade.symbol,
      side: activeTrade.side,
      status: "pending",
      entryTime: activeTrade.openedAt,
      exitTime:
        latestTime > activeTrade.openedAt
          ? latestTime
          : ((activeTrade.openedAt + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp),
      entryPrice: activeTrade.entryPrice,
      targetPrice: activeTrade.targetPrice,
      stopPrice: activeTrade.stopPrice,
      outcomePrice: activeTrade.markPrice,
      result: activeTrade.pnlValue >= 0 ? "Win" : "Loss",
      pnlUsd: activeTrade.pnlValue
    };
  }, [activeTrade, selectedCandles, selectedTimeframe]);

  const actionRows = useMemo(() => {
    const rows: ActionItem[] = [];
    const stepSeconds = timeframeMinutes[selectedTimeframe] * 60;

    for (const trade of chartPanelHistoryRows) {
      rows.push({
        id: `${trade.id}-entry`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: `${trade.side === "Long" ? "Buy" : "Sell"} Order Placed`,
        details: `${formatUnits(trade.units)} units @ ${formatPrice(trade.entryPrice)}`,
        timestamp: trade.entryTime,
        time: formatDateTime(Number(trade.entryTime) * 1000)
      });
      rows.push({
        id: `${trade.id}-sl`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "SL Added",
        details: `Stop-loss @ ${formatPrice(trade.stopPrice)}`,
        timestamp: (trade.entryTime + Math.max(1, Math.floor(stepSeconds * 0.1))) as UTCTimestamp,
        time: formatDateTime(
          (Number(trade.entryTime) + Math.max(1, Math.floor(stepSeconds * 0.1))) * 1000
        )
      });
      rows.push({
        id: `${trade.id}-tp`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "TP Added",
        details: `Take-profit @ ${formatPrice(trade.targetPrice)}`,
        timestamp: (trade.entryTime + Math.max(2, Math.floor(stepSeconds * 0.2))) as UTCTimestamp,
        time: formatDateTime(
          (Number(trade.entryTime) + Math.max(2, Math.floor(stepSeconds * 0.2))) * 1000
        )
      });
      rows.push({
        id: `${trade.id}-exit`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: `${trade.result} Closed`,
        details: `${formatSignedUsd(trade.pnlUsd)} (${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(
          2
        )}%) @ ${formatPrice(trade.outcomePrice)}`,
        timestamp: trade.exitTime,
        time: trade.exitAt
      });
    }

    return rows.sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id)
    );
  }, [chartPanelHistoryRows, selectedTimeframe]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    const now = Date.now();

    if (activeTrade) {
      const liveTitle =
        activeTrade.progressPct >= 78
          ? `${activeTrade.symbol} near TP`
          : activeTrade.progressPct <= 22
            ? `${activeTrade.symbol} near SL`
            : `${activeTrade.symbol} mark update`;
      const liveTone: NotificationTone =
        activeTrade.progressPct >= 78
          ? "up"
          : activeTrade.progressPct <= 22
            ? "down"
            : "neutral";

      items.push({
        id: `live-progress-${activeTrade.symbol}`,
        title: liveTitle,
        details: `Progress ${activeTrade.progressPct.toFixed(1)}% | TP ${formatPrice(
          activeTrade.targetPrice
        )} | SL ${formatPrice(activeTrade.stopPrice)}`,
        time: formatClock(now),
        timestamp: now,
        tone: liveTone,
        live: true
      });

      items.push({
        id: `live-pnl-${activeTrade.symbol}`,
        title: `${activeTrade.symbol} unrealized`,
        details: `${activeTrade.pnlValue >= 0 ? "+" : "-"}$${formatUsd(
          Math.abs(activeTrade.pnlValue)
        )} (${activeTrade.pnlPct >= 0 ? "+" : ""}${activeTrade.pnlPct.toFixed(2)}%)`,
        time: formatClock(now - 1000),
        timestamp: now - 1000,
        tone: activeTrade.pnlValue >= 0 ? "up" : "down",
        live: true
      });
    }

    for (const action of actionRows.slice(0, 10)) {
      const title = `${action.symbol} ${action.label}`;
      const tone: NotificationTone =
        action.label === "Win Closed"
          ? "up"
          : action.label === "Loss Closed"
            ? "down"
            : "neutral";

      items.push({
        id: `action-${action.id}`,
        title,
        details: action.details,
        time: action.time,
        timestamp: Number(action.timestamp) * 1000,
        tone
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
  }, [actionRows, activeTrade]);

  const seenNotificationSet = useMemo(() => {
    return new Set(seenNotificationIds);
  }, [seenNotificationIds]);

  const unreadNotificationCount = useMemo(() => {
    return notificationItems.reduce((count, item) => {
      return count + (seenNotificationSet.has(item.id) ? 0 : 1);
    }, 0);
  }, [notificationItems, seenNotificationSet]);

  const collectSettings = useCallback(() => ({
    selectedSymbol,
    selectedTimeframe,
    enabledBacktestWeekdays,
    enabledBacktestSessions,
    enabledBacktestMonths,
    enabledBacktestHours,
    aiMode,
    aiModelEnabled,
    aiFilterEnabled,
    staticLibrariesClusters,
    confidenceThreshold,
    aiExitStrictness,
    aiExitLossTolerance,
    aiExitWinTolerance,
    useMitExit,
    complexity,
    volatilityPercentile,
    tpDollars,
    slDollars,
    dollarsPerMove,
    maxBarsInTrade,
    stopMode,
    breakEvenTriggerPct,
    trailingStartPct,
    trailingDistPct,
    aiModelStates,
    aiFeatureLevels,
    aiFeatureModes,
    selectedAiLibraries,
    selectedAiLibrarySettings,
    selectedAiLibraryId,
    aiBulkScope,
    aiBulkWeight,
    aiBulkStride,
    aiBulkMaxSamples,
    chunkBars,
    distanceMetric,
    selectedAiDomains,
    embeddingCompression,
    dimensionAmount,
    compressionMethod,
    kEntry,
    kExit,
    knnVoteMode,
    hdbMinClusterSize,
    hdbMinSamples,
    hdbEpsQuantile,
    hdbSampleCap,
    antiCheatEnabled,
    validationMode,
    realismLevel,
    propInitialBalance,
    propDailyMaxLoss,
    propTotalMaxLoss,
    propProfitTarget,
    propProjectionMethod,
    statsDateStart,
    statsDateEnd,
  }), [
    selectedSymbol, selectedTimeframe, enabledBacktestWeekdays, enabledBacktestSessions,
    enabledBacktestMonths, enabledBacktestHours, aiMode, aiModelEnabled, aiFilterEnabled,
    staticLibrariesClusters, confidenceThreshold, aiExitStrictness, aiExitLossTolerance,
    aiExitWinTolerance, useMitExit, complexity, volatilityPercentile, tpDollars, slDollars,
    dollarsPerMove, maxBarsInTrade, stopMode, breakEvenTriggerPct, trailingStartPct,
    trailingDistPct, aiModelStates, aiFeatureLevels, aiFeatureModes,
    selectedAiLibraries, selectedAiLibrarySettings, selectedAiLibraryId, aiBulkScope,
    aiBulkWeight, aiBulkStride, aiBulkMaxSamples, chunkBars, distanceMetric,
    selectedAiDomains, embeddingCompression, dimensionAmount, compressionMethod,
    kEntry, kExit, knnVoteMode, hdbMinClusterSize, hdbMinSamples, hdbEpsQuantile,
    hdbSampleCap, antiCheatEnabled, validationMode, realismLevel, propInitialBalance,
    propDailyMaxLoss, propTotalMaxLoss, propProfitTarget, propProjectionMethod,
    statsDateStart, statsDateEnd,
  ]);

  const applySettings = useCallback((s: Record<string, any>) => {
    if (s.selectedSymbol != null) setSelectedSymbol(s.selectedSymbol);
    if (s.selectedTimeframe != null) setSelectedTimeframe(s.selectedTimeframe);
    if (s.enabledBacktestWeekdays != null) setEnabledBacktestWeekdays(s.enabledBacktestWeekdays);
    if (s.enabledBacktestSessions != null) setEnabledBacktestSessions(s.enabledBacktestSessions);
    if (s.enabledBacktestMonths != null) setEnabledBacktestMonths(s.enabledBacktestMonths);
    if (s.enabledBacktestHours != null) setEnabledBacktestHours(s.enabledBacktestHours);
    if (s.aiMode != null) setAiMode(s.aiMode);
    if (s.aiModelEnabled != null) setAiModelEnabled(s.aiModelEnabled);
    if (s.aiFilterEnabled != null) setAiFilterEnabled(s.aiFilterEnabled);
    if (s.staticLibrariesClusters != null) setStaticLibrariesClusters(s.staticLibrariesClusters);
    if (s.confidenceThreshold != null) setConfidenceThreshold(s.confidenceThreshold);
    if (s.aiExitStrictness != null) setAiExitStrictness(s.aiExitStrictness);
    if (s.aiExitLossTolerance != null) setAiExitLossTolerance(s.aiExitLossTolerance);
    if (s.aiExitWinTolerance != null) setAiExitWinTolerance(s.aiExitWinTolerance);
    if (s.useMitExit != null) setUseMitExit(s.useMitExit);
    if (s.complexity != null) setComplexity(s.complexity);
    if (s.volatilityPercentile != null) setVolatilityPercentile(s.volatilityPercentile);
    if (s.tpDollars != null) setTpDollars(s.tpDollars);
    if (s.slDollars != null) setSlDollars(s.slDollars);
    if (s.dollarsPerMove != null) setDollarsPerMove(s.dollarsPerMove);
    if (s.maxBarsInTrade != null) setMaxBarsInTrade(s.maxBarsInTrade);
    if (s.stopMode != null) setStopMode(s.stopMode);
    if (s.breakEvenTriggerPct != null) setBreakEvenTriggerPct(s.breakEvenTriggerPct);
    if (s.trailingStartPct != null) setTrailingStartPct(s.trailingStartPct);
    if (s.trailingDistPct != null) setTrailingDistPct(s.trailingDistPct);
    if (s.aiModelStates != null) setAiModelStates(s.aiModelStates);
    if (s.aiFeatureLevels != null) setAiFeatureLevels(s.aiFeatureLevels);
    if (s.aiFeatureModes != null) setAiFeatureModes(s.aiFeatureModes);
    if (s.selectedAiLibraries != null) setSelectedAiLibraries(s.selectedAiLibraries);
    if (s.selectedAiLibrarySettings != null) setSelectedAiLibrarySettings(s.selectedAiLibrarySettings);
    if (s.selectedAiLibraryId != null) setSelectedAiLibraryId(s.selectedAiLibraryId);
    if (s.aiBulkScope != null) setAiBulkScope(s.aiBulkScope);
    if (s.aiBulkWeight != null) setAiBulkWeight(s.aiBulkWeight);
    if (s.aiBulkStride != null) setAiBulkStride(s.aiBulkStride);
    if (s.aiBulkMaxSamples != null) setAiBulkMaxSamples(s.aiBulkMaxSamples);
    if (s.chunkBars != null) setChunkBars(s.chunkBars);
    if (s.distanceMetric != null) setDistanceMetric(s.distanceMetric);
    if (s.selectedAiDomains != null) setSelectedAiDomains(s.selectedAiDomains);
    if (s.embeddingCompression != null) setEmbeddingCompression(s.embeddingCompression);
    if (s.dimensionAmount != null) setDimensionAmount(s.dimensionAmount);
    if (s.compressionMethod != null) setCompressionMethod(s.compressionMethod);
    if (s.kEntry != null) setKEntry(s.kEntry);
    if (s.kExit != null) setKExit(s.kExit);
    if (s.knnVoteMode != null) setKnnVoteMode(s.knnVoteMode);
    if (s.hdbMinClusterSize != null) setHdbMinClusterSize(s.hdbMinClusterSize);
    if (s.hdbMinSamples != null) setHdbMinSamples(s.hdbMinSamples);
    if (s.hdbEpsQuantile != null) setHdbEpsQuantile(s.hdbEpsQuantile);
    if (s.hdbSampleCap != null) setHdbSampleCap(s.hdbSampleCap);
    if (s.antiCheatEnabled != null) setAntiCheatEnabled(s.antiCheatEnabled);
    if (s.validationMode != null) setValidationMode(s.validationMode);
    if (s.realismLevel != null) setRealismLevel(s.realismLevel);
    if (s.propInitialBalance != null) setPropInitialBalance(s.propInitialBalance);
    if (s.propDailyMaxLoss != null) setPropDailyMaxLoss(s.propDailyMaxLoss);
    if (s.propTotalMaxLoss != null) setPropTotalMaxLoss(s.propTotalMaxLoss);
    if (s.propProfitTarget != null) setPropProfitTarget(s.propProfitTarget);
    if (s.propProjectionMethod != null) setPropProjectionMethod(s.propProjectionMethod);
    if (s.statsDateStart != null) setStatsDateStart(s.statsDateStart);
    if (s.statsDateEnd != null) setStatsDateEnd(s.statsDateEnd);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) applySettings(JSON.parse(raw));
    } catch { /* corrupt data – ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(collectSettings()));
    } catch { /* storage full – ignore */ }
  }, [collectSettings]);


  const handleResetSettings = useCallback(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    setSelectedSymbol(futuresAssets[0].symbol);
    setSelectedTimeframe("15m");
    setEnabledBacktestWeekdays([...backtestWeekdayLabels]);
    setEnabledBacktestSessions([...backtestSessionLabels]);
    setEnabledBacktestMonths(Array.from({ length: 12 }, (_, i) => i));
    setEnabledBacktestHours(Array.from({ length: 24 }, (_, i) => i));
    setAiMode("off");
    setAiModelEnabled(false);
    setAiFilterEnabled(false);
    setStaticLibrariesClusters(false);
    setConfidenceThreshold(0);
    setAiExitStrictness(0);
    setAiExitLossTolerance(0);
    setAiExitWinTolerance(0);
    setUseMitExit(false);
    setComplexity(50);
    setVolatilityPercentile(50);
    setTpDollars(1000);
    setSlDollars(1000);
    setDollarsPerMove(25);
    setMaxBarsInTrade(0);
    setStopMode(0);
    setBreakEvenTriggerPct(50);
    setTrailingStartPct(50);
    setTrailingDistPct(30);
    setAiModelStates(buildInitialAiModelStates(availableAiModelNames));
    setAiFeatureLevels(buildInitialAiFeatureLevels());
    setAiFeatureModes(buildInitialAiFeatureModes());
    setSelectedAiLibraries(["core", "recent", "base"]);
    setSelectedAiLibraryId("core");
    setSelectedAiLibrarySettings(buildDefaultAiLibrarySettings(aiLibraryDefs));
    setAiBulkScope("active");
    setAiBulkWeight(100);
    setAiBulkStride(0);
    setAiBulkMaxSamples(10000);
    setChunkBars(24);
    setDistanceMetric("euclidean");
    setSelectedAiDomains(["Direction", "Model"]);
    setEmbeddingCompression(35);
    setDimensionAmount(32);
    setCompressionMethod("jl");
    setKEntry(12);
    setKExit(9);
    setKnnVoteMode("distance");
    setHdbMinClusterSize(35);
    setHdbMinSamples(12);
    setHdbEpsQuantile(0.85);
    setHdbSampleCap(5000);
    setAntiCheatEnabled(false);
    setValidationMode("off");
    setRealismLevel(1);
    setPropInitialBalance(100_000);
    setPropDailyMaxLoss(5_000);
    setPropTotalMaxLoss(10_000);
    setPropProfitTarget(10_000);
    setPropProjectionMethod("montecarlo");
    setStatsDateStart("");
    setStatsDateEnd("");
  }, [availableAiModelNames, aiLibraryDefs]);

  const persistPresets = useCallback((presets: SavedPreset[]) => {
    setSavedPresets(presets);
    try { localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets)); } catch { /* full */ }
  }, []);

  const handleSavePreset = useCallback(() => {
    const name = presetNameInput.trim();
    if (!name) return;
    const settings = collectSettings();
    const next = [
      ...savedPresets.filter((p) => p.name !== name),
      { name, settings, savedAt: Date.now() }
    ];
    persistPresets(next);
    setPresetNameInput("");
    setPresetMenuOpen(null);
  }, [presetNameInput, collectSettings, savedPresets, persistPresets]);

  const handleLoadPreset = useCallback((preset: SavedPreset) => {
    applySettings(preset.settings);
    setPresetMenuOpen(null);
  }, [applySettings]);

  const handleDeletePreset = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persistPresets(savedPresets.filter((p) => p.name !== name));
  }, [savedPresets, persistPresets]);

  const handleSaveToFile = useCallback(() => {
    const settings = collectSettings();
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `korra-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [collectSettings]);

  const handleLoadFromFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try { applySettings(JSON.parse(evt.target?.result as string)); } catch { /* invalid */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [applySettings]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (raw) setSavedPresets(JSON.parse(raw));
    } catch { /* corrupt */ }
  }, []);

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(event.target as Node)) {
        setPresetMenuOpen(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresetMenuOpen(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [presetMenuOpen]);

  useEffect(() => {
    if (!selectedHistoryId) {
      return;
    }

    if (!chartPanelHistoryRows.some((row) => row.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [chartPanelHistoryRows, selectedHistoryId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    setShowActiveTradeOnChart(false);
    setActiveBacktestTradeDetails(null);
    focusTradeIdRef.current = null;
  }, [appliedBacktestModelNames]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!notificationRef.current) {
        return;
      }

      const target = event.target as Node;

      if (!notificationRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen || notificationItems.length === 0) {
      return;
    }

    setSeenNotificationIds((prev) => {
      const next = new Set(prev);
      let changed = false;

      for (const item of notificationItems) {
        if (!next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      }

      return changed ? Array.from(next) : prev;
    });
  }, [notificationsOpen, notificationItems]);

  useEffect(() => {
    let disposed = false;
    let teardown: (() => void) | undefined;

    const initializeChart = async () => {
      const container = chartContainerRef.current;

      if (!container || chartRef.current) {
        return;
      }

      const { createChart } = await import("lightweight-charts");

      if (disposed || chartRef.current) {
        return;
      }

      const initialWidth = Math.max(1, Math.floor(container.clientWidth));
      const initialHeight = Math.max(1, Math.floor(container.clientHeight));

      const chart = createChart(container, {
        width: initialWidth,
        height: initialHeight,
        layout: {
          background: { type: LIGHTWEIGHT_CHART_SOLID_BACKGROUND, color: "#090d13" },
          textColor: "#7f889d"
        },
        localization: {
          priceFormatter: (price: number) => formatPrice(price),
          timeFormatter: (time: number) => {
            const realSec = gaplessToRealRef.current.get(time) ?? time;
            const d = new Date(realSec * 1000);
            const hh = String(d.getUTCHours()).padStart(2, "0");
            const mm = String(d.getUTCMinutes()).padStart(2, "0");
            const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
            const day = String(d.getUTCDate()).padStart(2, "0");
            return `${d.getUTCFullYear()}-${mon}-${day} ${hh}:${mm}`;
          }
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false }
        },
        rightPriceScale: {
          borderVisible: true,
          borderColor: "#182131"
        },
        leftPriceScale: {
          visible: false
        },
        timeScale: {
          borderVisible: true,
          borderColor: "#182131",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3,
          shiftVisibleRangeOnNewBar: false,
          tickMarkFormatter: (time: number) => {
            const realSec = gaplessToRealRef.current.get(time) ?? time;
            const d = new Date(realSec * 1000);
            const hh = String(d.getUTCHours()).padStart(2, "0");
            const mm = String(d.getUTCMinutes()).padStart(2, "0");
            const day = String(d.getUTCDate()).padStart(2, "0");
            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const mon = months[d.getUTCMonth()];
            if (hh === "00" && mm === "00") {
              return `${day} ${mon}`;
            }
            return `${hh}:${mm}`;
          }
        },
        crosshair: {
          mode: LIGHTWEIGHT_CHART_CROSSHAIR_NORMAL,
          vertLine: {
            color: "rgba(198, 208, 228, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#141c2a"
          },
          horzLine: {
            color: "rgba(198, 208, 228, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#141c2a"
          }
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true
        }
      });
      chartSizeRef.current = { width: initialWidth, height: initialHeight };

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#1bae8a",
        downColor: "#f0455a",
        wickUpColor: "#1bae8a",
        wickDownColor: "#f0455a",
        borderUpColor: "#1bae8a",
        borderDownColor: "#f0455a",
        priceLineVisible: true,
        priceLineStyle: LIGHTWEIGHT_CHART_LINE_SPARSE_DOTTED,
        priceLineColor: "rgba(27, 174, 138, 0.72)",
        priceLineWidth: 1,
        lastValueVisible: false,
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
          const focusedPriceRange = chartFocusedPriceRangeRef.current;

          if (!focusedPriceRange) {
            return original();
          }

          return {
            priceRange: focusedPriceRange
          };
        }
      });

      const tradeEntryLine = chart.addLineSeries({
        color: "rgba(232, 238, 250, 0.72)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeTargetLine = chart.addLineSeries({
        color: "rgba(53, 201, 113, 0.95)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeStopLine = chart.addLineSeries({
        color: "rgba(255, 76, 104, 0.95)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradePathLine = chart.addLineSeries({
        color: "rgba(220, 230, 248, 0.82)",
        lineWidth: 2,
        lineStyle: LIGHTWEIGHT_CHART_LINE_DOTTED,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeProfitZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(53, 201, 113, 0.22)",
        topFillColor2: "rgba(53, 201, 113, 0.05)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const tradeLossZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(240, 69, 90, 0.24)",
        bottomFillColor2: "rgba(240, 69, 90, 0.07)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      const onCrosshairMove = (param: MouseEventParams<Time>) => {
        if (!param.point || !param.time) {
          setHoveredTime(null);
          return;
        }

        setHoveredTime(parseTimeFromCrosshair(param.time));
      };
      const onVisibleLogicalRangeChange = (range: { from: number; to: number } | null) => {
        if (
          !range ||
          chartIsApplyingVisibleRangeRef.current
        ) {
          return;
        }

        const totalBars = chartSourceLengthRef.current;

        if (totalBars <= 0) {
          return;
        }

        const currentWindow = chartRenderWindowRef.current;

        if (currentWindow.to < currentWindow.from) {
          return;
        }

        const visibleGlobalRange = {
          from: currentWindow.from + range.from,
          to: currentWindow.from + range.to
        };

        chartVisibleGlobalRangeRef.current = visibleGlobalRange;

        const candles = selectedChartCandlesRef.current;
        if (candles.length > 0) {
          const centerIndex = Math.round((visibleGlobalRange.from + visibleGlobalRange.to) / 2);
          const clampedIndex = Math.max(0, Math.min(centerIndex, candles.length - 1));
          chartViewCenterTimeMsRef.current = candles[clampedIndex].time;
        }
      };

      chart.subscribeCrosshairMove(onCrosshairMove);
      chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
      let resizeRaf = 0;

      const applyChartSize = (rawWidth: number, rawHeight: number, force = false) => {
        if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) {
          return;
        }

        const width = Math.max(1, Math.floor(rawWidth));
        const height = Math.max(1, Math.floor(rawHeight));

        if (
          !force &&
          chartSizeRef.current.width === width &&
          chartSizeRef.current.height === height
        ) {
          return;
        }

        chartSizeRef.current = { width, height };
        chart.applyOptions({ width, height });
      };

      const queueResizeFromContainer = () => {
        if (selectedSurfaceTabRef.current !== "chart") {
          return;
        }

        const rawWidth = container.clientWidth;
        const rawHeight = container.clientHeight;

        if (rawWidth <= 0 || rawHeight <= 0) {
          return;
        }

        if (resizeRaf) {
          window.cancelAnimationFrame(resizeRaf);
        }

        resizeRaf = window.requestAnimationFrame(() => {
          resizeRaf = 0;
          applyChartSize(rawWidth, rawHeight);
        });
      };

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        if (selectedSurfaceTabRef.current !== "chart") {
          return;
        }

        const width = entry.contentRect.width;
        const height = entry.contentRect.height;

        if (width <= 0 || height <= 0) {
          return;
        }

        if (resizeRaf) {
          window.cancelAnimationFrame(resizeRaf);
        }

        resizeRaf = window.requestAnimationFrame(() => {
          resizeRaf = 0;
          applyChartSize(width, height);
        });
      });

      resizeObserver.observe(container);
      window.addEventListener("resize", queueResizeFromContainer);
      document.addEventListener("fullscreenchange", queueResizeFromContainer);

      const settleResize = () => {
        queueResizeFromContainer();
      };
      const resizeFrameA = window.requestAnimationFrame(settleResize);
      const resizeFrameB = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(settleResize);
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      tradeProfitZoneRef.current = tradeProfitZone;
      tradeLossZoneRef.current = tradeLossZone;
      tradeEntryLineRef.current = tradeEntryLine;
      tradeTargetLineRef.current = tradeTargetLine;
      tradeStopLineRef.current = tradeStopLine;
      tradePathLineRef.current = tradePathLine;

      teardown = () => {
        window.cancelAnimationFrame(resizeFrameA);
        window.cancelAnimationFrame(resizeFrameB);
        if (resizeRaf) {
          window.cancelAnimationFrame(resizeRaf);
        }
        window.removeEventListener("resize", queueResizeFromContainer);
        document.removeEventListener("fullscreenchange", queueResizeFromContainer);
        resizeObserver.disconnect();
        chart.unsubscribeCrosshairMove(onCrosshairMove);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        tradeProfitZoneRef.current = null;
        tradeLossZoneRef.current = null;
        tradeEntryLineRef.current = null;
        tradeTargetLineRef.current = null;
        tradeStopLineRef.current = null;
        tradePathLineRef.current = null;
        chartSizeRef.current = { width: 0, height: 0 };
        multiTradeSeriesRef.current = [];
        if (chartVisibleRangeSyncRafRef.current) {
          window.cancelAnimationFrame(chartVisibleRangeSyncRafRef.current);
          chartVisibleRangeSyncRafRef.current = 0;
        }
        if (chartFocusedPriceRangeResetRafRef.current) {
          window.cancelAnimationFrame(chartFocusedPriceRangeResetRafRef.current);
          chartFocusedPriceRangeResetRafRef.current = 0;
        }
        chartDataLengthRef.current = 0;
        chartLastBarTimeRef.current = 0;
        chartRenderWindowRef.current = { from: 0, to: -1 };
        chartVisibleGlobalRangeRef.current = null;
        chartPendingVisibleGlobalRangeRef.current = null;
        chartFocusedPriceRangeRef.current = null;
        chartIsApplyingVisibleRangeRef.current = false;
      };

      if (disposed) {
        teardown();
        teardown = undefined;
      }
    };

    void initializeChart();

    return () => {
      disposed = true;
      teardown?.();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    if (!chart || !candleSeries) {
      return;
    }

    if (chartRenderCandles.length === 0 || chartRenderWindow.to < chartRenderWindow.from) {
      candleSeries.setData([]);
      chartDataLengthRef.current = 0;
      chartLastBarTimeRef.current = 0;
      return;
    }

    const candleData: CandlestickData<UTCTimestamp>[] = chartRenderCandles.map((candle) => ({
      time: toGaplessUtc(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));

    const prevLength = chartDataLengthRef.current;
    const prevLastTime = chartLastBarTimeRef.current;
    const newLength = candleData.length;
    const lastBar = candleData[newLength - 1];
    const newLastTime = lastBar ? lastBar.time : 0;
    const pendingRange = chartPendingVisibleGlobalRangeRef.current;

    const canIncrement =
      !pendingRange &&
      prevLength > 0 &&
      (
        (newLength === prevLength && newLastTime === prevLastTime) ||
        (newLength === prevLength + 1)
      );

    if (canIncrement && lastBar) {
      candleSeries.update(lastBar);
    } else {
      chartIsApplyingVisibleRangeRef.current = true;
      const savedLogicalRange = !pendingRange ? chart.timeScale().getVisibleLogicalRange() : null;
      candleSeries.setData(candleData);

      if (pendingRange) {
        chart.timeScale().setVisibleLogicalRange({
          from: pendingRange.from - chartRenderWindow.from,
          to: pendingRange.to - chartRenderWindow.from
        });
        chartPendingVisibleGlobalRangeRef.current = null;
      } else if (savedLogicalRange) {
        chart.timeScale().setVisibleLogicalRange(savedLogicalRange);
      }

      if (chartVisibleRangeSyncRafRef.current) {
        window.cancelAnimationFrame(chartVisibleRangeSyncRafRef.current);
      }

      chartVisibleRangeSyncRafRef.current = window.requestAnimationFrame(() => {
        chartIsApplyingVisibleRangeRef.current = false;
        chartVisibleRangeSyncRafRef.current = 0;
      });
    }

    chartDataLengthRef.current = newLength;
    chartLastBarTimeRef.current = newLastTime;

    if (lastBar) {
      const isUp = lastBar.close >= lastBar.open;
      candleSeries.applyOptions({
        priceLineColor: isUp ? "rgba(27, 174, 138, 0.72)" : "rgba(240, 69, 90, 0.72)"
      });
    }
  }, [chartRenderCandles, chartRenderWindow, toGaplessUtc]);

  useEffect(() => {
    const overlay = countdownOverlayRef.current;

    if (!overlay || !latestCandle) {
      if (overlay) overlay.style.display = "none";
      return;
    }

    const candleMs = getTimeframeMs(selectedTimeframe);
    let raf = 0;
    let lastText = "";

    const update = () => {
      const candleSeries = candleSeriesRef.current;

      if (!candleSeries) {
        raf = window.requestAnimationFrame(update);
        return;
      }

      const candleEndMs = latestCandle.time + candleMs;
      const remaining = Math.max(0, Math.floor((candleEndMs - Date.now()) / 1000));
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      const timer = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
      const price = formatPrice(latestCandle.close);
      const text = `${price}\n${timer}`;

      if (text !== lastText) {
        overlay.textContent = text;
        lastText = text;
      }

      const isUp = latestCandle.close >= latestCandle.open;
      overlay.style.background = isUp ? "rgba(27, 174, 138, 0.85)" : "rgba(240, 69, 90, 0.85)";

      const y = candleSeries.priceToCoordinate(latestCandle.close);

      if (y !== null && Number.isFinite(y)) {
        overlay.style.top = `${y - 9}px`;
        overlay.style.display = "block";
      } else {
        overlay.style.display = "none";
      }

      raf = window.requestAnimationFrame(update);
    };

    raf = window.requestAnimationFrame(update);

    return () => window.cancelAnimationFrame(raf);
  }, [latestCandle, selectedTimeframe, chartRenderCandles]);

  const resetChart = useCallback(() => {
    const totalBars = chartSourceLengthRef.current;

    if (totalBars === 0) {
      return;
    }

    const visibleCount = timeframeVisibleCount[selectedTimeframe];
    const rightPadding = Math.round(visibleCount * 0.4);
    const from = Math.max(0, totalBars - 1 - (visibleCount - rightPadding));
    const to = from + visibleCount;

    requestChartVisibleRangeRef.current({ from, to });
    focusTradeIdRef.current = null;

    if (chartFocusedPriceRangeResetRafRef.current) {
      window.cancelAnimationFrame(chartFocusedPriceRangeResetRafRef.current);
      chartFocusedPriceRangeResetRafRef.current = 0;
    }

    chartFocusedPriceRangeRef.current = null;
    chartRef.current?.applyOptions({
      rightPriceScale: {
        autoScale: true
      }
    });
  }, [selectedTimeframe]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isOptionR =
        event.altKey &&
        (event.code === "KeyR" || event.key.toLowerCase() === "r" || event.key === "®");

      if (!isOptionR) {
        return;
      }

      event.preventDefault();
      resetChart();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [resetChart]);

  useEffect(() => {
    let frameId = 0;
    let holdStart = 0;
    let holdActive = false;
    let holdCompleted = false;

    const stopHold = (resetState = true) => {
      holdActive = false;

      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }

      if (resetState && statsRefreshOverlayModeRef.current === "hold") {
        updateStatsRefreshOverlayMode("idle");
        setStatsRefreshProgress(0);
      }
    };

    const completeHold = () => {
      if (holdCompleted) {
        return;
      }

      holdActive = false;
      holdCompleted = true;

      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }

      applyBacktestSettingsSnapshot();
    };

    const tick = (timestamp: number) => {
      if (!holdActive) {
        return;
      }

      const nextProgress = clamp(((timestamp - holdStart) / STATS_REFRESH_HOLD_MS) * 100, 0, 100);
      setStatsRefreshProgress(nextProgress);

      if (nextProgress >= 100) {
        completeHold();
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Control" || event.repeat) {
        return;
      }

      if (
        selectedSurfaceTabRef.current !== "backtest" ||
        holdActive ||
        holdCompleted ||
        statsRefreshOverlayModeRef.current !== "idle"
      ) {
        return;
      }

      clearStatsRefreshResetTimeout();
      holdActive = true;
      holdStart = performance.now();
      updateStatsRefreshOverlayMode("hold");
      setStatsRefreshProgress(0);
      frameId = window.requestAnimationFrame(tick);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control") {
        return;
      }

      if (holdCompleted) {
        holdCompleted = false;
        return;
      }

      stopHold();
    };

    const onBlur = () => {
      stopHold();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      stopHold(false);
    };
  }, [
    applyBacktestSettingsSnapshot,
    clearStatsRefreshResetTimeout,
    updateStatsRefreshOverlayMode
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const pendingTradeId = focusTradeIdRef.current;

    if (
      !chart ||
      !pendingTradeId ||
      !selectedHistoryTrade ||
      selectedHistoryTrade.id !== pendingTradeId ||
      selectedHistoryTrade.symbol !== selectedSymbol
    ) {
      return;
    }

    const entryIndex = candleIndexByUnix.get(selectedHistoryTrade.entryTime) ?? -1;
    const exitIndexRaw = candleIndexByUnix.get(selectedHistoryTrade.exitTime) ?? -1;
    const inferredExitIndex =
      entryIndex + Math.max(1, Math.round((Number(selectedHistoryTrade.exitTime) - Number(selectedHistoryTrade.entryTime)) / (timeframeMinutes[selectedTimeframe] * 60)));
    const exitIndex =
      exitIndexRaw >= 0
        ? Math.max(entryIndex, exitIndexRaw)
        : Math.min(selectedChartCandles.length - 1, inferredExitIndex);

    if (entryIndex < 0) {
      return;
    }

    const leftBound = Math.min(entryIndex, exitIndex);
    const rightBound = Math.max(entryIndex, exitIndex);
    const tradeSpan = Math.max(1, rightBound - leftBound + 1);
    const visibleSpan = Math.max(36, tradeSpan + Math.max(18, Math.round(tradeSpan * 1.6)));
    const centerIndex = (leftBound + rightBound) / 2;
    const nextVisibleRange = clampChartDataWindow(
      selectedChartCandles.length,
      centerIndex - (visibleSpan - 1) / 2,
      centerIndex + (visibleSpan - 1) / 2
    );

    requestChartVisibleRangeRef.current(nextVisibleRange);

    let minPrice = Math.min(
      selectedHistoryTrade.entryPrice,
      selectedHistoryTrade.targetPrice,
      selectedHistoryTrade.stopPrice,
      selectedHistoryTrade.outcomePrice
    );
    let maxPrice = Math.max(
      selectedHistoryTrade.entryPrice,
      selectedHistoryTrade.targetPrice,
      selectedHistoryTrade.stopPrice,
      selectedHistoryTrade.outcomePrice
    );

    for (let index = leftBound; index <= rightBound; index += 1) {
      const candle = selectedChartCandles[index];

      if (!candle) {
        continue;
      }

      minPrice = Math.min(minPrice, candle.low);
      maxPrice = Math.max(maxPrice, candle.high);
    }

    const rawSpan = Math.max(0.01, maxPrice - minPrice);
    const padding = Math.max(rawSpan * 0.35, Math.abs(selectedHistoryTrade.entryPrice) * 0.0012);

    chartFocusedPriceRangeRef.current = {
      minValue: minPrice - padding,
      maxValue: maxPrice + padding
    };

    if (chartFocusedPriceRangeResetRafRef.current) {
      window.cancelAnimationFrame(chartFocusedPriceRangeResetRafRef.current);
    }

    chartFocusedPriceRangeResetRafRef.current = window.requestAnimationFrame(() => {
      chart.applyOptions({
        rightPriceScale: {
          autoScale: true
        }
      });

      chartFocusedPriceRangeResetRafRef.current = window.requestAnimationFrame(() => {
        chartFocusedPriceRangeRef.current = null;
        chart.applyOptions({
          rightPriceScale: {
            autoScale: false
          }
        });
        chartFocusedPriceRangeResetRafRef.current = 0;
      });
    });

    focusTradeIdRef.current = null;
  }, [
    candleIndexByUnix,
    selectedChartCandles,
    selectedHistoryInteractionTick,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;

    if (!chart) {
      return;
    }

    if (selectedSurfaceTab !== "chart") {
      if (chartSizeRef.current.width !== 1 || chartSizeRef.current.height !== 1) {
        chartSizeRef.current = { width: 1, height: 1 };
        chart.applyOptions({ width: 1, height: 1 });
      }
      return;
    }

    if (!container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const width = Math.floor(container.clientWidth);
      const height = Math.floor(container.clientHeight);

      if (width <= 0 || height <= 0) {
        return;
      }

      if (chartSizeRef.current.width === width && chartSizeRef.current.height === height) {
        return;
      }

      chartSizeRef.current = { width, height };
      chart.applyOptions({ width, height });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [panelExpanded, activePanelTab, selectedSurfaceTab]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const tradeProfitZone = tradeProfitZoneRef.current;
    const tradeLossZone = tradeLossZoneRef.current;
    const tradeEntryLine = tradeEntryLineRef.current;
    const tradeTargetLine = tradeTargetLineRef.current;
    const tradeStopLine = tradeStopLineRef.current;
    const tradePathLine = tradePathLineRef.current;

    if (
      !chart ||
      !candleSeries ||
      !tradeProfitZone ||
      !tradeLossZone ||
      !tradeEntryLine ||
      !tradeTargetLine ||
      !tradeStopLine ||
      !tradePathLine
    ) {
      return;
    }

    const clearMultiTradeOverlays = () => {
      if (multiTradeSeriesRef.current.length === 0) {
        return;
      }

      for (const seriesGroup of multiTradeSeriesRef.current) {
        chart.removeSeries(seriesGroup.profitZone);
        chart.removeSeries(seriesGroup.lossZone);
        chart.removeSeries(seriesGroup.entryLine);
        chart.removeSeries(seriesGroup.targetLine);
        chart.removeSeries(seriesGroup.stopLine);
        chart.removeSeries(seriesGroup.pathLine);
      }

      multiTradeSeriesRef.current = [];
    };

    const clearTradeOverlays = () => {
      clearMultiTradeOverlays();
      candleSeries.setMarkers([]);
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);
    };

    const applyTradeZonePaletteTo = (
      profitZoneSeries: ISeriesApi<"Baseline">,
      lossZoneSeries: ISeriesApi<"Baseline">,
      side: TradeSide,
      entryPrice: number,
      intense = true
    ) => {
      const greenStrong = intense ? "rgba(53, 201, 113, 0.22)" : "rgba(53, 201, 113, 0.14)";
      const greenSoft = intense ? "rgba(53, 201, 113, 0.05)" : "rgba(53, 201, 113, 0.03)";
      const redStrong = intense ? "rgba(240, 69, 90, 0.24)" : "rgba(240, 69, 90, 0.14)";
      const redSoft = intense ? "rgba(240, 69, 90, 0.07)" : "rgba(240, 69, 90, 0.03)";

      if (side === "Long") {
        profitZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: greenStrong,
          topFillColor2: greenSoft,
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)"
        });
        lossZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: redStrong,
          bottomFillColor2: redSoft
        });
      } else {
        profitZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: redStrong,
          topFillColor2: redSoft,
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)"
        });
        lossZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: greenStrong,
          bottomFillColor2: greenSoft
        });
      }
    };

    const applyTradeZonePalette = (side: TradeSide, entryPrice: number) => {
      applyTradeZonePaletteTo(tradeProfitZone, tradeLossZone, side, entryPrice, true);
    };

    const getTradeOverlayGeometry = (trade: {
      entryTime: UTCTimestamp;
      exitTime: UTCTimestamp;
    }) => {
      const stepSeconds = timeframeMinutes[selectedTimeframe] * 60;
      const entryMs = Number(trade.entryTime) * 1000;
      const rawExitMs =
        trade.exitTime > trade.entryTime ? Number(trade.exitTime) * 1000 : entryMs;
      const entryIndex = findCandleIndexAtOrBefore(selectedChartCandles, entryMs);
      const startTime =
        entryIndex >= 0
          ? toGaplessUtc(selectedChartCandles[entryIndex]!.time)
          : toGaplessUtc(floorToTimeframe(entryMs, selectedTimeframe));
      const rawExitIndex = findCandleIndexAtOrBefore(selectedChartCandles, rawExitMs);
      const exitIndex =
        rawExitIndex >= 0 && entryIndex >= 0 ? Math.max(entryIndex, rawExitIndex) : rawExitIndex;
      const exitTime =
        exitIndex >= 0
          ? toGaplessUtc(selectedChartCandles[exitIndex]!.time)
          : trade.exitTime > trade.entryTime
            ? toGaplessUtc(floorToTimeframe(rawExitMs, selectedTimeframe))
            : startTime;
      const rangeStartTime = startTime;
      const rangeEndTime =
        exitIndex >= 0 && exitIndex + 1 < selectedChartCandles.length
          ? toGaplessUtc(selectedChartCandles[exitIndex + 1]!.time)
          : ((exitTime + stepSeconds) as UTCTimestamp);

      return {
        rangeStartTime,
        startTime,
        exitTime,
        rangeEndTime
      };
    };

    const createExitMarker = (
      time: UTCTimestamp,
      position: "aboveBar" | "belowBar",
      color: string,
      pnlUsd: number
    ): SeriesMarker<Time> => ({
      time,
      position,
      shape: "circle",
      size: 0.1,
      color,
      text: formatSignedUsd(pnlUsd)
    });

    const createMultiTradeSeries = (): MultiTradeOverlaySeries => {
      const entryLine = chart.addLineSeries({
        color: "rgba(232, 238, 250, 0.62)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const targetLine = chart.addLineSeries({
        color: "rgba(53, 201, 113, 0.7)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const stopLine = chart.addLineSeries({
        color: "rgba(255, 76, 104, 0.7)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_SOLID,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const pathLine = chart.addLineSeries({
        color: "rgba(220, 230, 248, 0.64)",
        lineWidth: 1,
        lineStyle: LIGHTWEIGHT_CHART_LINE_DOTTED,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const profitZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(53, 201, 113, 0.14)",
        topFillColor2: "rgba(53, 201, 113, 0.03)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const lossZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(240, 69, 90, 0.14)",
        bottomFillColor2: "rgba(240, 69, 90, 0.03)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      return {
        profitZone,
        lossZone,
        entryLine,
        targetLine,
        stopLine,
        pathLine
      };
    };

    const renderSingleTrade = (trade: {
      side: TradeSide;
      status: "closed" | "pending";
      result: TradeResult;
      entryTime: UTCTimestamp;
      exitTime: UTCTimestamp;
      entryPrice: number;
      targetPrice: number;
      stopPrice: number;
      outcomePrice: number;
      pnlUsd: number;
    }) => {
      const { rangeStartTime, startTime, exitTime, rangeEndTime } = getTradeOverlayGeometry({
        entryTime: trade.entryTime,
        exitTime: trade.exitTime
      });
      const entryAction = trade.side === "Long" ? "Buy" : "Sell";
      const tradeZoneData = [
        { time: rangeStartTime, value: trade.targetPrice },
        { time: rangeEndTime, value: trade.targetPrice }
      ];
      const stopZoneData = [
        { time: rangeStartTime, value: trade.stopPrice },
        { time: rangeEndTime, value: trade.stopPrice }
      ];
      const derivedResult: TradeResult =
        trade.status === "pending" ? (trade.pnlUsd >= 0 ? "Win" : "Loss") : trade.result;
      const exitPosition = getExitMarkerPosition(trade.side, derivedResult);
      clearMultiTradeOverlays();

      candleSeries.setMarkers([
        {
          time: startTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#30b76f" : "#f0455a",
          text: `Entry ${entryAction}`
        },
        createExitMarker(
          exitTime,
          exitPosition,
          derivedResult === "Win" ? "#35c971" : "#f0455a",
          trade.pnlUsd
        )
      ]);

      applyTradeZonePalette(trade.side, trade.entryPrice);
      tradeEntryLine.setData([
        { time: rangeStartTime, value: trade.entryPrice },
        { time: rangeEndTime, value: trade.entryPrice }
      ]);
      tradeTargetLine.setData(tradeZoneData);
      tradeStopLine.setData(stopZoneData);
      tradePathLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: exitTime, value: trade.outcomePrice }
      ]);

      if (trade.side === "Long") {
        tradeProfitZone.setData(tradeZoneData);
        tradeLossZone.setData(stopZoneData);
      } else {
        tradeProfitZone.setData(stopZoneData);
        tradeLossZone.setData(tradeZoneData);
      }
    };

    if (showAllTradesOnChart) {
      clearMultiTradeOverlays();
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);

      if (currentSymbolHistoryRows.length === 0) {
        candleSeries.setMarkers([]);
        return;
      }

      const allMarkers: SeriesMarker<Time>[] = [];

      for (const trade of currentSymbolHistoryRows) {
        const tradeResult: TradeResult = trade.result;
        const { rangeStartTime, startTime, exitTime, rangeEndTime } = getTradeOverlayGeometry({
          entryTime: trade.entryTime,
          exitTime: trade.exitTime
        });
        const entryAction = trade.side === "Long" ? "Buy" : "Sell";
        const targetData = [
          { time: rangeStartTime, value: trade.targetPrice },
          { time: rangeEndTime, value: trade.targetPrice }
        ];
        const stopData = [
          { time: rangeStartTime, value: trade.stopPrice },
          { time: rangeEndTime, value: trade.stopPrice }
        ];
        const seriesGroup = createMultiTradeSeries();

        applyTradeZonePaletteTo(
          seriesGroup.profitZone,
          seriesGroup.lossZone,
          trade.side,
          trade.entryPrice,
          false
        );
        seriesGroup.entryLine.setData([
          { time: rangeStartTime, value: trade.entryPrice },
          { time: rangeEndTime, value: trade.entryPrice }
        ]);
        seriesGroup.targetLine.setData(targetData);
        seriesGroup.stopLine.setData(stopData);
        seriesGroup.pathLine.setData([
          { time: startTime, value: trade.entryPrice },
          { time: exitTime, value: trade.outcomePrice }
        ]);

        if (trade.side === "Long") {
          seriesGroup.profitZone.setData(targetData);
          seriesGroup.lossZone.setData(stopData);
        } else {
          seriesGroup.profitZone.setData(stopData);
          seriesGroup.lossZone.setData(targetData);
        }

        multiTradeSeriesRef.current.push(seriesGroup);

        allMarkers.push({
          time: startTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#35c971" : "#f0455a",
          text: `Entry ${entryAction}`
        });
        allMarkers.push(
          createExitMarker(
            exitTime,
            getExitMarkerPosition(trade.side, tradeResult),
            tradeResult === "Win" ? "#35c971" : "#f0455a",
            trade.pnlUsd
          )
        );
      }

      allMarkers.sort((a, b) => Number(a.time) - Number(b.time));
      candleSeries.setMarkers(allMarkers);
      return;
    }

    if (showActiveTradeOnChart && activeChartTrade && activeChartTrade.symbol === selectedSymbol) {
      renderSingleTrade({
        side: activeChartTrade.side,
        status: activeChartTrade.status,
        result: activeChartTrade.result,
        entryTime: activeChartTrade.entryTime,
        exitTime: activeChartTrade.exitTime,
        entryPrice: activeChartTrade.entryPrice,
        targetPrice: activeChartTrade.targetPrice,
        stopPrice: activeChartTrade.stopPrice,
        outcomePrice: activeChartTrade.outcomePrice,
        pnlUsd: activeChartTrade.pnlUsd
      });
      return;
    }

    if (!selectedHistoryTrade || selectedHistoryTrade.symbol !== selectedSymbol) {
      clearTradeOverlays();
      return;
    }

    renderSingleTrade({
      side: selectedHistoryTrade.side,
      status: "closed",
      result: selectedHistoryTrade.result,
      entryTime: selectedHistoryTrade.entryTime,
      exitTime: selectedHistoryTrade.exitTime,
      entryPrice: selectedHistoryTrade.entryPrice,
      targetPrice: selectedHistoryTrade.targetPrice,
      stopPrice: selectedHistoryTrade.stopPrice,
      outcomePrice: selectedHistoryTrade.outcomePrice,
      pnlUsd: selectedHistoryTrade.pnlUsd
    });
  }, [
    activeChartTrade,
    currentSymbolHistoryRows,
    selectedChartCandles,
    selectedHistoryInteractionTick,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe,
    showActiveTradeOnChart,
    showAllTradesOnChart,
    toGaplessUtc
  ]);

  const backtestDateFilteredTrades = useMemo(() => {
    return antiCheatBacktestContext.dateFilteredTrades;
  }, [antiCheatBacktestContext]);

  const backtestTimeFilteredTrades = useMemo(() => {
    return antiCheatBacktestContext.timeFilteredTrades;
  }, [antiCheatBacktestContext]);

  const backtestLibraryCandidateTrades = useMemo(() => {
    return backtestDateFilteredTrades.filter((trade) => {
      const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
      const session = getSessionLabel(trade.entryTime);
      const monthIndex = getTradeMonthIndex(trade.exitTime);
      const entryHour = getTradeHour(trade.entryTime);

      return (
        appliedBacktestSettings.enabledBacktestWeekdays.includes(weekday) &&
        appliedBacktestSettings.enabledBacktestSessions.includes(session) &&
        appliedBacktestSettings.enabledBacktestMonths.includes(monthIndex) &&
        appliedBacktestSettings.enabledBacktestHours.includes(entryHour)
      );
    });
  }, [
    appliedBacktestSettings.enabledBacktestHours,
    appliedBacktestSettings.enabledBacktestMonths,
    appliedBacktestSettings.enabledBacktestSessions,
    appliedBacktestSettings.enabledBacktestWeekdays,
    backtestDateFilteredTrades,
  ]);

  const backtestTrades = useMemo(() => {
    return backtestTimeFilteredTrades.filter((trade) => {
      const confidence = getEffectiveTradeConfidenceScore(trade) * 100;
      return (
        appliedConfidenceGateDisabled ||
        confidence >= appliedEffectiveConfidenceThreshold
      );
    });
  }, [
    appliedConfidenceGateDisabled,
    appliedEffectiveConfidenceThreshold,
    backtestTimeFilteredTrades,
    getEffectiveTradeConfidenceScore
  ]);
  const deferredBacktestAnalyticsTrades = useDeferredValue(backtestTrades);
  const isBacktestAnalyticsVisible = selectedSurfaceTab === "backtest";
  const isHistoryBacktestTabActive =
    isBacktestAnalyticsVisible && selectedBacktestTab === "history";
  const isCalendarBacktestTabActive =
    isBacktestAnalyticsVisible && selectedBacktestTab === "calendar";
  const isClusterBacktestTabActive =
    isBacktestAnalyticsVisible && selectedBacktestTab === "cluster";
  const isPerformanceStatsBacktestTabActive =
    isBacktestAnalyticsVisible && selectedBacktestTab === "performanceStats";
  const isEntryExitBacktestTabActive =
    isBacktestAnalyticsVisible && selectedBacktestTab === "entryExit";
  const isPropFirmBacktestTabActive =
    isBacktestAnalyticsVisible && selectedBacktestTab === "propFirm";

  const mainStatsTrades = useMemo(() => backtestTrades, [backtestTrades]);

  const baselineMainStatsTrades = useMemo(
    () => backtestTimeFilteredTrades,
    [backtestTimeFilteredTrades]
  );

  const backtestRange = useMemo(() => {
    if (selectedBacktestCandles.length > 0) {
      return {
        startMs: selectedBacktestCandles[0].time,
        endMs: selectedBacktestCandles[selectedBacktestCandles.length - 1].time
      };
    }

    if (backtestSourceTrades.length === 0) {
      return {
        startMs: null as number | null,
        endMs: null as number | null
      };
    }

    let startMs = Number.POSITIVE_INFINITY;
    let endMs = Number.NEGATIVE_INFINITY;

    for (const trade of backtestSourceTrades) {
      startMs = Math.min(startMs, Number(trade.entryTime) * 1000);
      endMs = Math.max(endMs, Number(trade.exitTime) * 1000);
    }

    return {
      startMs: Number.isFinite(startMs) ? startMs : null,
      endMs: Number.isFinite(endMs) ? endMs : null
    };
  }, [backtestSourceTrades, selectedBacktestCandles]);

  const backtestSummary = useMemo(() => {
    return summarizeBacktestTrades(backtestTrades, getEffectiveTradeConfidenceScore);
  }, [backtestTrades, getEffectiveTradeConfidenceScore]);

  const aiLibraryInsights = useMemo(() => {
    const executedTradeIds = new Set(backtestTrades.map((trade) => trade.id));
    const suppressedTradePool = backtestTimeFilteredTrades.filter(
      (trade) => !executedTradeIds.has(trade.id)
    );
    // Keep library construction mode-agnostic: AI Filter vs AI Model should not
    // change which historical neighbor pool is loaded, only when confidence is checked.
    const libraryCandidatePool = backtestTimeFilteredTrades;
    const maxSignalIndex = Math.max(0, selectedChartCandles.length - 1);

    const getSettings = (definition: AiLibraryDef) => {
      return {
        ...definition.defaults,
        ...(appliedBacktestSettings.selectedAiLibrarySettings[definition.id] ?? {})
      };
    };

    const getStride = (definition: AiLibraryDef) => {
      return clamp(
        Math.floor(Number(getSettings(definition).stride ?? 0) || 0),
        0,
        5000
      );
    };

    const getMaxSamples = (definition: AiLibraryDef, fallback: number) => {
      return clamp(
        Math.floor(Number(getSettings(definition).maxSamples ?? fallback) || fallback),
        0,
        100000
      );
    };

    const buildRawSource = (definition: AiLibraryDef) => {
      const settings = getSettings(definition);
      const normalizedId = definition.id.toLowerCase();
      let source: HistoryItem[] = libraryCandidatePool;

      if (normalizedId === "core") {
        source = libraryCandidatePool;
      } else if (normalizedId === "suppressed") {
        source = suppressedTradePool;
      } else if (normalizedId === "recent") {
        const windowTrades = clamp(
          Math.floor(Number(settings.windowTrades ?? 1500) || 1500),
          0,
          5000
        );
        source = windowTrades > 0 ? libraryCandidatePool.slice(-windowTrades) : [];
      } else if (normalizedId === "tokyo") {
        source = libraryCandidatePool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "Tokyo"
        );
      } else if (normalizedId === "sydney") {
        source = libraryCandidatePool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "Sydney"
        );
      } else if (normalizedId === "london") {
        source = libraryCandidatePool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "London"
        );
      } else if (normalizedId === "newyork") {
        source = libraryCandidatePool.filter(
          (trade) => getSessionLabel(trade.entryTime) === "New York"
        );
      } else if (normalizedId === "terrific") {
        const count = clamp(
          Math.floor(Number(settings.count ?? 96) || 96),
          0,
          100000
        );
        source = [...libraryCandidatePool]
          .sort((left, right) => right.pnlUsd - left.pnlUsd)
          .slice(0, count);
      } else if (normalizedId === "terrible") {
        const count = clamp(
          Math.floor(Number(settings.count ?? 96) || 96),
          0,
          100000
        );
        source = [...libraryCandidatePool]
          .sort((left, right) => left.pnlUsd - right.pnlUsd)
          .slice(0, count);
      } else if (settings.kind === "model_sim") {
        const targetModel = String(settings.model ?? "");
        source = libraryCandidatePool.filter(
          (trade) => trade.entrySource === targetModel
        );
      }

      const stride = getStride(definition);
      if (stride > 1) {
        source = source.filter((_, index) => index % stride === 0);
      }

      return source;
    };

    const baselineWinRates: Record<string, number> = {};
    const counts: Record<string, number> = {};
    const balancedByLibrary: Record<string, HistoryItem[]> = {};
    for (const definition of aiLibraryDefs) {
      const source = buildRawSource(definition);
      const settings = getSettings(definition);
      const baselineWinRate = getOutcomeWinRatePercent(
        source,
        (trade) => trade.result === "Win"
      );
      const rawTargetWinRate = Number(settings[AI_LIBRARY_TARGET_WIN_RATE_KEY]);
      const targetWinRate = Number.isFinite(rawTargetWinRate)
        ? clamp(rawTargetWinRate, 0, 100)
        : baselineWinRate;
      const maxSamples = getMaxSamples(definition, Math.max(96, source.length));
      const balanced = rebalanceItemsToTargetWinRate(
        source,
        maxSamples,
        targetWinRate,
        (trade) => trade.result === "Win",
        definition.id === "terrific" || definition.id === "terrible"
      );

      baselineWinRates[definition.id] = baselineWinRate;
      counts[definition.id] = balanced.length;
      balancedByLibrary[definition.id] = balanced;
    }

    const resolveSignalIndex = (trade: HistoryItem, ordinal: number, total: number) => {
      const entryIndex = candleIndexByUnix.get(Number(trade.entryTime));
      if (typeof entryIndex === "number") {
        return clamp(entryIndex, 0, maxSignalIndex);
      }
      const exitIndex = candleIndexByUnix.get(Number(trade.exitTime));
      if (typeof exitIndex === "number") {
        return clamp(exitIndex, 0, maxSignalIndex);
      }
      if (maxSignalIndex <= 0 || total <= 1) {
        return 0;
      }
      return clamp(
        Math.round((ordinal / Math.max(1, total - 1)) * maxSignalIndex),
        0,
        maxSignalIndex
      );
    };

    const points: any[] = [];

    for (const definition of aiLibraryDefs) {
      const source = balancedByLibrary[definition.id] ?? [];
      if (source.length === 0) {
        continue;
      }

      for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
        const trade = source[sourceIndex]!;
        const modelName = trade.entrySource.trim() || "Momentum";
        const signalIndex = resolveSignalIndex(trade, sourceIndex, source.length);
        const entryTimeRaw = Number(trade.entryTime);
        const entryTime =
          Number.isFinite(entryTimeRaw) && entryTimeRaw > 0 ? entryTimeRaw : trade.entryAt || trade.time;
        const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
        const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
        const holdMinutes = Math.max(1, Number(trade.exitTime) - Number(trade.entryTime));
        const shapeVector = [
          trade.side === "Long" ? 1 : -1,
          clamp(Number(trade.pnlPct) / 100, -8, 8),
          clamp(Number(trade.pnlUsd) / 1000, -8, 8),
          clamp(rewardDistance / riskDistance, 0, 12),
          clamp(holdMinutes / 60, 0, 96),
          ((Number(trade.entryTime) % 86_400) + 86_400) % 86_400 / 86_400
        ];

        points.push({
          id: `lib|${definition.id}|${trade.id}|${sourceIndex}`,
          uid: `lib|${definition.id}|${trade.id}|${sourceIndex}`,
          libId: definition.id,
          metaLib: definition.id,
          model: modelName,
          metaModel: modelName,
          signalIndex,
          metaSignalIndex: signalIndex,
          entryTime,
          metaTime: entryTime,
          dir: trade.side === "Long" ? 1 : -1,
          label: trade.result === "Win" ? 1 : -1,
          result: trade.result === "Win" ? "TP" : "SL",
          pnl: trade.pnlUsd,
          metaPnl: trade.pnlUsd,
          v: shapeVector,
          trainingOnly: true,
          metaTrainingOnly: true
        });
      }
    }

    return {
      counts,
      baselineWinRates,
      points
    };
  }, [
    appliedBacktestSettings.selectedAiLibrarySettings,
    aiLibraryDefs,
    candleIndexByUnix,
    selectedChartCandles.length,
    backtestTimeFilteredTrades,
    backtestTrades
  ]);
  const aiLibraryCounts = aiLibraryInsights.counts;
  const aiLibraryBaselineWinRates = aiLibraryInsights.baselineWinRates;
  const aiLibraryPoints = aiLibraryInsights.points;
  const aiClusterActiveLibraryIdSet = useMemo(() => {
    return new Set(
      (appliedBacktestSettings.selectedAiLibraries ?? []).map((libraryId) =>
        String(libraryId).trim()
      )
    );
  }, [appliedBacktestSettings.selectedAiLibraries]);
  const aiClusterLibraryPoints = useMemo(() => {
    if (aiClusterActiveLibraryIdSet.size === 0) {
      return [] as any[];
    }

    return (aiLibraryPoints as any[]).filter((point) => {
      const libraryId = String(point?.libId ?? point?.metaLib ?? "").trim();
      return libraryId.length > 0 && aiClusterActiveLibraryIdSet.has(libraryId);
    });
  }, [aiClusterActiveLibraryIdSet, aiLibraryPoints]);
  const aiClusterLibraryCounts = useMemo(() => {
    if (aiClusterActiveLibraryIdSet.size === 0) {
      return {} as Record<string, number>;
    }

    const filtered: Record<string, number> = {};
    for (const [libraryId, rawCount] of Object.entries(aiLibraryCounts ?? {})) {
      const normalizedLibraryId = String(libraryId).trim();
      if (!normalizedLibraryId || !aiClusterActiveLibraryIdSet.has(normalizedLibraryId)) {
        continue;
      }
      const count = Math.max(0, Number(rawCount) || 0);
      if (count > 0) {
        filtered[normalizedLibraryId] = count;
      }
    }
    return filtered;
  }, [aiClusterActiveLibraryIdSet, aiLibraryCounts]);
  const selectedAiLibraryConfig: Record<string, AiLibrarySettingValue> | null = selectedAiLibrary
    ? ({
        ...selectedAiLibrary.defaults,
        ...(selectedAiLibrarySettings[selectedAiLibrary.id] ?? {}),
        [AI_LIBRARY_TARGET_WIN_RATE_KEY]:
          selectedAiLibrarySettings[selectedAiLibrary.id]?.[AI_LIBRARY_TARGET_WIN_RATE_KEY] ??
          aiLibraryBaselineWinRates[selectedAiLibrary.id] ??
          50
      } as Record<string, AiLibrarySettingValue>)
    : null;
  const selectedAiLibraryLoadedCount = selectedAiLibrary ? aiLibraryCounts[selectedAiLibrary.id] ?? 0 : 0;

  const baselineMainStatsSummary = useMemo(() => {
    return summarizeBacktestTrades(baselineMainStatsTrades, getEffectiveTradeConfidenceScore);
  }, [baselineMainStatsTrades, getEffectiveTradeConfidenceScore]);

  const mainStatsSummary = useMemo(() => {
    return summarizeBacktestTrades(mainStatsTrades, getEffectiveTradeConfidenceScore);
  }, [getEffectiveTradeConfidenceScore, mainStatsTrades]);

  const mainStatsTitle = useMemo(() => {
    if (!appliedBacktestSettings.statsDateStart && !appliedBacktestSettings.statsDateEnd) {
      return "Stats (All Trades)";
    }

    const startLabel = appliedBacktestSettings.statsDateStart
      ? formatStatsDateLabel(appliedBacktestSettings.statsDateStart)
      : "Start";
    const endLabel = appliedBacktestSettings.statsDateEnd
      ? formatStatsDateLabel(appliedBacktestSettings.statsDateEnd)
      : "End";
    return `Stats (${startLabel} -> ${endLabel})`;
  }, [appliedBacktestSettings.statsDateEnd, appliedBacktestSettings.statsDateStart]);

  const backtestDateRangeLabel = useMemo(() => {
    if (!appliedBacktestSettings.statsDateStart && !appliedBacktestSettings.statsDateEnd) {
      return "All dates";
    }

    const startLabel = appliedBacktestSettings.statsDateStart
      ? formatStatsDateLabel(appliedBacktestSettings.statsDateStart)
      : "Start";
    const endLabel = appliedBacktestSettings.statsDateEnd
      ? formatStatsDateLabel(appliedBacktestSettings.statsDateEnd)
      : "End";
    return `${startLabel} -> ${endLabel}`;
  }, [appliedBacktestSettings.statsDateEnd, appliedBacktestSettings.statsDateStart]);

  const backtestHeroStats = useMemo<BacktestHeroStatCard[]>(() => {
    const hasTrades = backtestSummary.tradeCount > 0;
    const resolveTone = (tone: "up" | "down" | "neutral"): "up" | "down" | "neutral" =>
      hasTrades ? tone : "neutral";

    return [
      {
        label: "Net PnL",
        value: formatSignedUsd(backtestSummary.netPnl),
        tone: resolveTone(backtestSummary.netPnl >= 0 ? "up" : "down"),
        meta: `${backtestSummary.tradeCount.toLocaleString("en-US")} simulated trades`
      },
      {
        label: "Win Rate",
        value: `${backtestSummary.winRate.toFixed(1)}%`,
        tone: resolveTone(
          backtestSummary.winRate >= 55
            ? "up"
            : backtestSummary.winRate >= 45
              ? "neutral"
              : "down"
        ),
        meta: `${backtestSummary.wins.toLocaleString("en-US")} wins · ${backtestSummary.losses.toLocaleString("en-US")} losses`
      },
      {
        label: "Profit Factor",
        value: backtestSummary.profitFactor.toFixed(2),
        tone: resolveTone(
          backtestSummary.profitFactor > 1.5
            ? "up"
            : backtestSummary.profitFactor >= 1
              ? "neutral"
              : "down"
        ),
        meta: `Gross wins ${formatSignedUsd(backtestSummary.grossWins)}`
      },
      {
        label: "Worst Pullback",
        value: formatSignedUsd(backtestSummary.maxDrawdown),
        tone: resolveTone(backtestSummary.maxDrawdown >= 0 ? "up" : "down"),
        meta: "Largest equity drawdown"
      },
      {
        label: "Total Trades",
        value: backtestSummary.tradeCount.toLocaleString("en-US"),
        tone: "neutral",
        meta: `${backtestSummary.tradesPerDay.toFixed(2)} / day`
      },
      {
        label: "Winners",
        value: backtestSummary.wins.toLocaleString("en-US"),
        tone: resolveTone(backtestSummary.wins >= backtestSummary.losses ? "up" : "neutral"),
        meta: `${backtestSummary.consistencyPerTrade.toFixed(1)}% consistency`
      },
      {
        label: "Losers",
        value: backtestSummary.losses.toLocaleString("en-US"),
        tone: resolveTone(backtestSummary.losses > backtestSummary.wins ? "down" : "neutral"),
        meta: `Gross losses ${formatSignedUsd(backtestSummary.grossLosses)}`
      },
      {
        label: "Avg Hold",
        value: formatMinutesCompact(backtestSummary.avgHoldMinutes),
        tone: "neutral",
        meta: `${formatMinutesCompact(backtestSummary.avgWinDurationMin)} win · ${formatMinutesCompact(backtestSummary.avgLossDurationMin)} loss`
      },
      {
        label: "Avg PnL / Trade",
        value: formatSignedUsd(backtestSummary.avgPnl),
        tone: resolveTone(backtestSummary.avgPnl >= 0 ? "up" : "down"),
        meta: "Expected value per trade"
      },
      {
        label: "Average Win",
        value: formatSignedUsd(backtestSummary.avgWin),
        tone: resolveTone(backtestSummary.avgWin >= 0 ? "up" : "down"),
        meta: "Mean positive trade result"
      },
      {
        label: "Average Loss",
        value: formatSignedUsd(backtestSummary.avgLoss),
        tone: resolveTone(backtestSummary.avgLoss >= 0 ? "up" : "down"),
        meta: "Mean negative trade result"
      },
      {
        label: "Reward / Risk",
        value: `${backtestSummary.avgR.toFixed(2)}R`,
        tone: resolveTone(backtestSummary.avgR >= 1 ? "up" : "down"),
        meta: "Average target-to-stop profile"
      },
      {
        label: "Avg Confidence",
        value: `${backtestSummary.averageConfidence.toFixed(1)}%`,
        tone: resolveTone(
          backtestSummary.averageConfidence >= 60
            ? "up"
            : backtestSummary.averageConfidence >= 40
              ? "neutral"
              : "down"
        ),
        meta: "AI confidence across executed trades"
      },
      {
        label: "Sharpe",
        value: backtestSummary.sharpe.toFixed(2),
        tone: resolveTone(
          backtestSummary.sharpe >= 1
            ? "up"
            : backtestSummary.sharpe >= 0
              ? "neutral"
              : "down"
        ),
        meta: "Return adjusted by total volatility"
      },
      {
        label: "Sortino",
        value: backtestSummary.sortino.toFixed(2),
        tone: resolveTone(
          backtestSummary.sortino >= 1
            ? "up"
            : backtestSummary.sortino >= 0
              ? "neutral"
              : "down"
        ),
        meta: "Return adjusted by downside volatility"
      },
      {
        label: "Best Day",
        value: backtestSummary.bestDay ? formatSignedUsd(backtestSummary.bestDay.pnl) : "—",
        tone:
          !hasTrades || !backtestSummary.bestDay
            ? "neutral"
            : backtestSummary.bestDay.pnl >= 0
              ? "up"
              : "down",
        meta: backtestSummary.bestDay ? backtestSummary.bestDay.key : "Waiting for trade history"
      }
    ];
  }, [backtestSummary]);

  const appliedMainSettingsAiStats = useMemo<BacktestHeroStatCard[]>(() => {
    const applied = appliedBacktestSettings;
    const appliedAiMode = applied.aiMode;
    const appliedAiFilter = applied.aiFilterEnabled;
    const appliedAiModelEnabled = appliedAiMode !== "off" && !appliedAiFilter;
    const appliedConfGateDisabled =
      appliedAiMode === "off" || (!appliedAiFilter && !appliedAiModelEnabled);
    const appliedEffConfThreshold = appliedConfGateDisabled ? 0 : applied.confidenceThreshold;
    const appliedAntiCheat = applied.antiCheatEnabled;
    const appliedStaticLibClusters = applied.staticLibrariesClusters;
    const appliedLibCount = applied.selectedAiLibraries.length;
    const appliedModelCount = Object.values(applied.aiModelStates).filter((s) => s > 0).length;
    const appliedFeatureCount = Object.values(applied.aiFeatureLevels).filter((l) => l > 0).length;
    const appliedDimCount = countConfiguredAiFeatureDimensions(applied.aiFeatureLevels, applied.aiFeatureModes, applied.chunkBars);

    return [
      {
        label: "AI Method",
        value: appliedAiMode === "off" ? "OFF" : appliedAiMode.toUpperCase(),
        tone: appliedAiMode === "off" ? "neutral" : "up",
        valueStyle: { color: appliedAiMode !== "off" ? "#60a5fa" : "rgba(255,255,255,0.4)" },
        meta: appliedAiMode === "off" ? "Decision engine disabled" : "Primary AI decision mode"
      },
      {
        label: "Confidence Gate",
        value: `${appliedEffConfThreshold}%`,
        tone: appliedConfGateDisabled ? "neutral" : "up",
        valueStyle: { color: appliedConfGateDisabled ? "rgba(255,255,255,0.4)" : "#facc15" },
        meta: appliedConfGateDisabled ? "Gate disabled" : "Minimum confidence threshold"
      },
      {
        label: "Avg Confidence",
        value: `${backtestSummary.averageConfidence.toFixed(1)}%`,
        tone:
          backtestSummary.averageConfidence >= 60
            ? "up"
            : backtestSummary.averageConfidence >= 40
              ? "neutral"
              : "down",
        valueStyle: {
          color:
            backtestSummary.averageConfidence >= 60
              ? "#34d399"
              : backtestSummary.averageConfidence >= 40
                ? "#facc15"
                : "#f87171"
        },
        meta: "Mean confidence across executed trades"
      },
      {
        label: "Visible Trades",
        value: backtestTrades.length.toLocaleString("en-US"),
        tone: "neutral",
        valueStyle: { color: "#60a5fa" },
        meta: "Trades after current filters"
      },
      {
        label: "Anti-Cheat",
        value: appliedAntiCheat ? "ON" : "OFF",
        tone: appliedAntiCheat ? "up" : "down",
        valueStyle: { color: appliedAntiCheat ? "#34d399" : "#f87171" },
        meta: "Spoof/invalid pattern checks"
      },
      {
        label: "Libraries",
        value: appliedLibCount > 0 ? `${appliedLibCount} Active` : "OFF",
        tone: appliedLibCount > 0 ? "up" : "neutral",
        valueStyle: { color: appliedLibCount > 0 ? "#34d399" : "rgba(255,255,255,0.4)" },
        meta: "Loaded AI data libraries"
      },
      {
        label: "AI Model",
        value: appliedAiModelEnabled ? "ON" : "OFF",
        tone: appliedAiModelEnabled ? "up" : "neutral",
        valueStyle: { color: appliedAiModelEnabled ? "#34d399" : "rgba(255,255,255,0.4)" },
        meta: "Model-driven entry module"
      },
      {
        label: "AI Filter",
        value: appliedAiFilter && appliedAiMode !== "off" ? "ON" : "OFF",
        tone: appliedAiFilter && appliedAiMode !== "off" ? "up" : "neutral",
        valueStyle: { color: appliedAiFilter && appliedAiMode !== "off" ? "#34d399" : "rgba(255,255,255,0.4)" },
        meta: "Confidence filtering module"
      },
      {
        label: "Static Lib + Cluster",
        value: appliedStaticLibClusters ? "ON" : "OFF",
        tone: appliedStaticLibClusters ? "up" : "neutral",
        valueStyle: { color: appliedStaticLibClusters ? "#34d399" : "rgba(255,255,255,0.4)" },
        meta: "Static AI data mode"
      },
      {
        label: "Active Models",
        value: appliedModelCount.toLocaleString("en-US"),
        tone: appliedModelCount > 0 ? "up" : "neutral",
        valueStyle: { color: appliedModelCount > 0 ? "#34d399" : "rgba(255,255,255,0.4)" },
        meta: "Enabled models"
      },
      {
        label: "Active Features",
        value: appliedFeatureCount.toLocaleString("en-US"),
        tone: appliedFeatureCount > 0 ? "up" : "neutral",
        valueStyle: { color: appliedFeatureCount > 0 ? "#60a5fa" : "rgba(255,255,255,0.4)" },
        meta: "Enabled feature groups"
      },
      {
        label: "Feature Dimensions",
        value: appliedDimCount.toLocaleString("en-US"),
        tone: appliedDimCount > 0 ? "up" : "neutral",
        valueStyle: {
          color: appliedDimCount > 0 ? "#60a5fa" : "rgba(255,255,255,0.4)"
        },
        meta: "Configured feature dimensions"
      }
    ];
  }, [appliedBacktestSettings, backtestSummary.averageConfidence, backtestTrades.length]);

  const mainStatsSessionRows = useMemo(() => {
    const map = new Map<string, { label: string; total: number; trades: number }>();

    for (const trade of mainStatsTrades) {
      const label = getSessionLabel(trade.entryTime);
      const current = map.get(label) ?? { label, total: 0, trades: 0 };
      current.total += trade.pnlUsd;
      current.trades += 1;
      map.set(label, current);
    }

    return Array.from(map.values()).sort((left, right) => {
      const leftIndex = backtestSessionLabels.indexOf(left.label as (typeof backtestSessionLabels)[number]);
      const rightIndex = backtestSessionLabels.indexOf(right.label as (typeof backtestSessionLabels)[number]);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }

        if (rightIndex === -1) {
          return -1;
        }

        return leftIndex - rightIndex;
      }

      return left.label.localeCompare(right.label);
    });
  }, [mainStatsTrades]);

  const mainStatsModelRows = useMemo(() => {
    const map = new Map<string, { label: string; total: number; trades: number }>();

    for (const trade of mainStatsTrades) {
      const label = trade.entrySource || "Unknown";
      const current = map.get(label) ?? { label, total: 0, trades: 0 };
      current.total += trade.pnlUsd;
      current.trades += 1;
      map.set(label, current);
    }

    return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [mainStatsTrades]);

  const mainStatsMonthRows = useMemo(() => {
    const monthBuckets = new Map<string, { key: string; pnl: number; trades: number }>();

    for (const trade of mainStatsTrades) {
      const key = getTradeMonthKey(trade.exitTime);
      const monthKey = getTradeCalendarMonthKey(trade.exitTime);
      const current = monthBuckets.get(key) ?? { key: monthKey, pnl: 0, trades: 0 };
      current.pnl += trade.pnlUsd;
      current.trades += 1;
      monthBuckets.set(key, current);
    }

    const map = new Map<
      string,
      { key: string; total: number; trades: number; months: number; avgPerTrade: number }
    >();

    for (const bucket of monthBuckets.values()) {
      const current = map.get(bucket.key) ?? {
        key: bucket.key,
        total: 0,
        trades: 0,
        months: 0,
        avgPerTrade: 0
      };
      current.total += bucket.pnl;
      current.trades += bucket.trades;
      current.months += 1;
      map.set(bucket.key, current);
    }

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        avgPerTrade: row.trades > 0 ? row.total / row.trades : 0,
        total: row.months > 0 ? row.total / row.months : 0
      }))
      .sort((left, right) => Number(left.key) - Number(right.key));
  }, [mainStatsTrades]);

  const mainStatsAiEfficiency = useMemo(() => {
    if (appliedBacktestSettings.aiMode === "off" || mainStatsTrades.length < 10) {
      return null;
    }

    const points = mainStatsTrades.map((trade) => ({
      score: getEffectiveTradeConfidenceScore(trade),
      outcome: trade.pnlUsd >= 0 ? 1 : 0
    }));
    const positives = points.filter((point) => point.outcome === 1).length;
    const negatives = points.length - positives;

    if (positives < 2 || negatives < 2) {
      return null;
    }

    points.sort((left, right) => left.score - right.score);

    let positiveRankTotal = 0;
    let index = 0;

    while (index < points.length) {
      let nextIndex = index + 1;

      while (nextIndex < points.length && points[nextIndex].score === points[index].score) {
        nextIndex += 1;
      }

      const averageRank = (index + 1 + nextIndex) / 2;

      for (let offset = index; offset < nextIndex; offset += 1) {
        if (points[offset].outcome === 1) {
          positiveRankTotal += averageRank;
        }
      }

      index = nextIndex;
    }

    const auc =
      (positiveRankTotal - (positives * (positives + 1)) / 2) / (Math.max(1, positives) * Math.max(1, negatives));

    return clamp(auc, 0, 1);
  }, [appliedBacktestSettings.aiMode, getEffectiveTradeConfidenceScore, mainStatsTrades]);

  const mainStatsAiEffectivenessPct = useMemo(() => {
    if (
      appliedBacktestSettings.aiMode === "off" ||
      appliedConfidenceGateDisabled
    ) {
      return null;
    }

    if (baselineMainStatsTrades.length < 5 || mainStatsTrades.length < 5) {
      return null;
    }

    return mainStatsSummary.winRate - baselineMainStatsSummary.winRate;
  }, [
    appliedConfidenceGateDisabled,
    appliedBacktestSettings.aiMode,
    baselineMainStatsSummary.winRate,
    baselineMainStatsTrades.length,
    mainStatsSummary.winRate,
    mainStatsTrades.length
  ]);

  const mainStatsAiEfficacyPct = useMemo(() => {
    if (
      appliedBacktestSettings.aiMode === "off" ||
      appliedConfidenceGateDisabled
    ) {
      return null;
    }

    if (baselineMainStatsTrades.length < 5 || mainStatsTrades.length < 5) {
      return null;
    }

    const baselinePnl = baselineMainStatsSummary.totalPnl;
    const currentPnl = mainStatsSummary.totalPnl;
    const denominator =
      Math.abs(baselinePnl) > 0.000000001
        ? Math.abs(baselinePnl)
        : Math.max(0.000000001, Math.abs(currentPnl));

    return ((currentPnl - baselinePnl) / denominator) * 100;
  }, [
    appliedConfidenceGateDisabled,
    appliedBacktestSettings.aiMode,
    baselineMainStatsSummary.totalPnl,
    baselineMainStatsTrades.length,
    mainStatsSummary.totalPnl,
    mainStatsTrades.length
  ]);

  const activeMainStatsModelPnlIndex =
    mainStatsModelRows.length > 0 ? wrapIndex(mainStatsModelPnlIndex, mainStatsModelRows.length) : 0;
  const mainStatsModelPnlFocusRow =
    mainStatsModelRows.length > 0 ? mainStatsModelRows[activeMainStatsModelPnlIndex] : null;
  const activeMainStatsSessionPnlIndex =
    mainStatsSessionRows.length > 0 ? wrapIndex(mainStatsSessionPnlIndex, mainStatsSessionRows.length) : 0;
  const mainStatsSessionPnlFocusRow =
    mainStatsSessionRows.length > 0 ? mainStatsSessionRows[activeMainStatsSessionPnlIndex] : null;
  const defaultMainStatsMonthPnlIndex = mainStatsMonthRows.findIndex(
    (row) => row.key === getCurrentTradeCalendarMonthKey()
  );
  const resolvedMainStatsMonthPnlIndex =
    defaultMainStatsMonthPnlIndex >= 0 ? defaultMainStatsMonthPnlIndex : mainStatsMonthRows.length - 1;
  const activeMainStatsMonthPnlIndex =
    mainStatsMonthRows.length === 0
      ? -1
      : mainStatsMonthPnlIndex < 0
        ? resolvedMainStatsMonthPnlIndex
        : wrapIndex(mainStatsMonthPnlIndex, mainStatsMonthRows.length);
  const mainStatsMonthPnlFocusRow =
    activeMainStatsMonthPnlIndex >= 0 ? mainStatsMonthRows[activeMainStatsMonthPnlIndex] : null;

  const mainStatisticsCards = useMemo<MainStatisticsCard[]>(() => {
    const buildPnlNavigator = (
      label: string,
      primaryText: string,
      secondaryText: string,
      itemCount: number,
      onPrevious: () => void,
      onNext: () => void
    ): ReactNode => (
      <>
        <button
          type="button"
          className="backtest-stat-nav-button"
          onClick={onPrevious}
          disabled={itemCount <= 1}
          aria-label={`${label} previous`}
        >
          ←
        </button>
        <span className="backtest-stat-nav-copy">
          <span className="backtest-stat-nav-title" title={primaryText}>
            {primaryText}
          </span>
          <span className="backtest-stat-nav-meta" title={secondaryText}>
            {secondaryText}
          </span>
        </span>
        <button
          type="button"
          className="backtest-stat-nav-button"
          onClick={onNext}
          disabled={itemCount <= 1}
          aria-label={`${label} next`}
        >
          →
        </button>
      </>
    );
    const buildStatRow = (label: string, children: MainStatisticsCard[]): MainStatisticsCard => ({
      label,
      value: "",
      tone: "neutral",
      span: 6,
      children
    });

    const hasTrades = mainStatsSummary.tradeCount > 0;
    const totalPnlTone =
      !hasTrades ? "neutral" : mainStatsSummary.totalPnl >= 0 ? "up" : "down";
    const modelRowsByPnl = [...mainStatsModelRows].sort((left, right) => right.total - left.total);
    const bestModelRow = modelRowsByPnl[0] ?? null;
    const worstModelRow =
      modelRowsByPnl.length > 0 ? modelRowsByPnl[modelRowsByPnl.length - 1] : null;
    const modelPnlValue = buildPnlNavigator(
      "Model PnL",
      mainStatsModelPnlFocusRow?.label ?? "—",
      mainStatsModelPnlFocusRow
        ? `${formatSignedUsd(mainStatsModelPnlFocusRow.total)} · ${
            mainStatsModelPnlFocusRow.trades
          } trades · avg ${formatSignedUsd(
            mainStatsModelPnlFocusRow.total / Math.max(1, mainStatsModelPnlFocusRow.trades)
          )}`
        : "No model data",
      mainStatsModelRows.length,
      () => {
        if (mainStatsModelRows.length <= 1) {
          setMainStatsModelPnlIndex(0);
          return;
        }

        setMainStatsModelPnlIndex((current) => wrapIndex(current - 1, mainStatsModelRows.length));
      },
      () => {
        if (mainStatsModelRows.length <= 1) {
          setMainStatsModelPnlIndex(0);
          return;
        }

        setMainStatsModelPnlIndex((current) => wrapIndex(current + 1, mainStatsModelRows.length));
      }
    );
    const sessionRowsByPnl = [...mainStatsSessionRows].sort((left, right) => right.total - left.total);
    const bestSessionRow = sessionRowsByPnl[0] ?? null;
    const worstSessionRow =
      sessionRowsByPnl.length > 0 ? sessionRowsByPnl[sessionRowsByPnl.length - 1] : null;
    const sessionPnlValue = buildPnlNavigator(
      "Session PnL",
      mainStatsSessionPnlFocusRow?.label ?? "—",
      mainStatsSessionPnlFocusRow
        ? `${formatSignedUsd(mainStatsSessionPnlFocusRow.total)} · ${
            mainStatsSessionPnlFocusRow.trades
          } trades · avg ${formatSignedUsd(
            mainStatsSessionPnlFocusRow.total / Math.max(1, mainStatsSessionPnlFocusRow.trades)
          )}`
        : "No session data",
      mainStatsSessionRows.length,
      () => {
        if (mainStatsSessionRows.length <= 1) {
          setMainStatsSessionPnlIndex(0);
          return;
        }

        setMainStatsSessionPnlIndex((current) =>
          wrapIndex(current - 1, mainStatsSessionRows.length)
        );
      },
      () => {
        if (mainStatsSessionRows.length <= 1) {
          setMainStatsSessionPnlIndex(0);
          return;
        }

        setMainStatsSessionPnlIndex((current) =>
          wrapIndex(current + 1, mainStatsSessionRows.length)
        );
      }
    );
    const monthRowsByPnl = [...mainStatsMonthRows].sort((left, right) => right.total - left.total);
    const bestMonthRow = monthRowsByPnl[0] ?? null;
    const worstMonthRow =
      monthRowsByPnl.length > 0 ? monthRowsByPnl[monthRowsByPnl.length - 1] : null;
    const monthPnlValue = buildPnlNavigator(
      "Monthly PnL",
      mainStatsMonthPnlFocusRow ? getMonthLabel(mainStatsMonthPnlFocusRow.key) : "—",
      mainStatsMonthPnlFocusRow
        ? `${formatSignedUsd(mainStatsMonthPnlFocusRow.total)} / month · ${
            mainStatsMonthPnlFocusRow.months
          } months · ${
            mainStatsMonthPnlFocusRow.trades
          } trades · avg ${formatSignedUsd(
            mainStatsMonthPnlFocusRow.avgPerTrade
          )} / trade`
        : "No month data",
      mainStatsMonthRows.length,
      () => {
        if (mainStatsMonthRows.length <= 1) {
          setMainStatsMonthPnlIndex(mainStatsMonthRows.length === 0 ? -1 : 0);
          return;
        }

        setMainStatsMonthPnlIndex((current) => {
          const startIndex =
            current < 0 ? resolvedMainStatsMonthPnlIndex : wrapIndex(current, mainStatsMonthRows.length);
          return wrapIndex(startIndex - 1, mainStatsMonthRows.length);
        });
      },
      () => {
        if (mainStatsMonthRows.length <= 1) {
          setMainStatsMonthPnlIndex(mainStatsMonthRows.length === 0 ? -1 : 0);
          return;
        }

        setMainStatsMonthPnlIndex((current) => {
          const startIndex =
            current < 0 ? resolvedMainStatsMonthPnlIndex : wrapIndex(current, mainStatsMonthRows.length);
          return wrapIndex(startIndex + 1, mainStatsMonthRows.length);
        });
      }
    );

    return [
      {
        label: "Total PnL",
        value: formatSignedUsd(mainStatsSummary.totalPnl),
        tone: totalPnlTone,
        span: 6
      },
      buildStatRow("win-rate-row", [
        {
          label: "Win Rate",
          value: `${mainStatsSummary.winRate.toFixed(2)}%`,
          tone:
            mainStatsSummary.winRate >= 55
              ? "up"
              : mainStatsSummary.winRate >= 45
                ? "neutral"
                : "down",
          span: 1
        },
        {
          label: "Profit Factor",
          value: mainStatsSummary.profitFactor.toFixed(2),
          tone:
            mainStatsSummary.profitFactor > 1.5
              ? "up"
              : mainStatsSummary.profitFactor >= 1
                ? "neutral"
                : "down",
          span: 1
        }
      ]),
      {
        label: "Total Trades",
        value: mainStatsSummary.tradeCount.toLocaleString("en-US"),
        tone: "neutral",
        span: 6
      },
      buildStatRow("trade-frequency-row", [
        {
          label: "Trades per Month",
          value: mainStatsSummary.tradesPerMonth.toFixed(2),
          tone: "neutral",
          span: 1
        },
        {
          label: "Trades per Week",
          value: mainStatsSummary.tradesPerWeek.toFixed(2),
          tone: "neutral",
          span: 1
        },
        {
          label: "Trades per Day",
          value: mainStatsSummary.tradesPerDay.toFixed(2),
          tone: "neutral",
          span: 1
        }
      ]),
      buildStatRow("consistency-row", [
        {
          label: "Consistency / Month",
          value: `${mainStatsSummary.consistencyPerMonth.toFixed(1)}%`,
          tone:
            mainStatsSummary.consistencyPerMonth >= 70
              ? "up"
              : mainStatsSummary.consistencyPerMonth >= 50
                ? "neutral"
                : "down",
          span: 1
        },
        {
          label: "Consistency / Week",
          value: `${mainStatsSummary.consistencyPerWeek.toFixed(1)}%`,
          tone:
            mainStatsSummary.consistencyPerWeek >= 70
              ? "up"
              : mainStatsSummary.consistencyPerWeek >= 50
                ? "neutral"
                : "down",
          span: 1
        },
        {
          label: "Consistency / Day",
          value: `${mainStatsSummary.consistencyPerDay.toFixed(1)}%`,
          tone:
            mainStatsSummary.consistencyPerDay >= 70
              ? "up"
              : mainStatsSummary.consistencyPerDay >= 50
                ? "neutral"
                : "down",
          span: 1
        },
        {
          label: "Consistency / Trade",
          value: `${mainStatsSummary.consistencyPerTrade.toFixed(1)}%`,
          tone:
            mainStatsSummary.consistencyPerTrade >= 70
              ? "up"
              : mainStatsSummary.consistencyPerTrade >= 50
                ? "neutral"
                : "down",
          span: 1
        }
      ]),
      buildStatRow("average-pnl-row", [
        {
          label: "Avg PnL / Month",
          value: formatSignedUsd(mainStatsSummary.avgPnlPerMonth),
          tone: mainStatsSummary.avgPnlPerMonth >= 0 ? "up" : "down",
          span: 1
        },
        {
          label: "Avg PnL / Week",
          value: formatSignedUsd(mainStatsSummary.avgPnlPerWeek),
          tone: mainStatsSummary.avgPnlPerWeek >= 0 ? "up" : "down",
          span: 1
        },
        {
          label: "Avg PnL / Day",
          value: formatSignedUsd(mainStatsSummary.avgPnlPerDay),
          tone: mainStatsSummary.avgPnlPerDay >= 0 ? "up" : "down",
          span: 1
        },
        {
          label: "Expected Value",
          value: formatSignedUsd(mainStatsSummary.avgPnl),
          tone: mainStatsSummary.avgPnl >= 0 ? "up" : "down",
          span: 1
        }
      ]),
      buildStatRow("risk-row", [
        {
          label: "Sharpe",
          value: mainStatsSummary.sharpe.toFixed(2),
          tone:
            mainStatsSummary.sharpe >= 1
              ? "up"
              : mainStatsSummary.sharpe >= 0
                ? "neutral"
                : "down",
          span: 1
        },
        {
          label: "Sortino",
          value: mainStatsSummary.sortino.toFixed(2),
          tone:
            mainStatsSummary.sortino >= 1
              ? "up"
              : mainStatsSummary.sortino >= 0
                ? "neutral"
                : "down",
          span: 1
        },
        {
          label: "Risk to Reward",
          value: mainStatsSummary.avgR.toFixed(2),
          tone: mainStatsSummary.avgR >= 1 ? "up" : "down",
          span: 1
        }
      ]),
      buildStatRow("trade-extremes-row", [
        {
          label: "Biggest Win",
          value: `$${formatUsd(mainStatsSummary.maxWin)}`,
          tone: "up",
          span: 1
        },
        {
          label: "Biggest Loss",
          value: `-$${formatUsd(Math.abs(mainStatsSummary.maxLoss))}`,
          tone: "down",
          span: 1
        },
        {
          label: "Average Peak / trade",
          value: `$${formatUsd(mainStatsSummary.avgPeakPerTrade)}`,
          tone: "up",
          span: 1
        },
        {
          label: "Avg Max Drawdown / trade",
          value: `-$${formatUsd(mainStatsSummary.avgMaxDrawdownPerTrade)}`,
          tone: "down",
          span: 1
        }
      ]),
      buildStatRow("average-trade-row", [
        {
          label: "Average Win",
          value: `$${formatUsd(mainStatsSummary.avgWin)}`,
          tone: "up",
          span: 1
        },
        {
          label: "Average Loss",
          value: `-$${formatUsd(Math.abs(mainStatsSummary.avgLoss))}`,
          tone: "down",
          span: 1
        }
      ]),
      buildStatRow("duration-row", [
        {
          label: "Average Win Duration",
          value: formatMinutesCompact(mainStatsSummary.avgWinDurationMin),
          tone: "up",
          span: 1
        },
        {
          label: "Average Loss Duration",
          value: formatMinutesCompact(mainStatsSummary.avgLossDurationMin),
          tone: "down",
          span: 1
        },
        {
          label: "Average Time in Profit",
          value: formatMinutesCompact(mainStatsSummary.avgTimeInProfitMin),
          tone: "up",
          span: 1
        },
        {
          label: "Average Time in Deficit",
          value: formatMinutesCompact(mainStatsSummary.avgTimeInDeficitMin),
          tone: "down",
          span: 1
        }
      ]),
      buildStatRow("ai-row", [
        {
          label: "AI Efficiency",
          value:
            mainStatsAiEfficiency === null ? "—" : `${Math.round(mainStatsAiEfficiency * 100)}%`,
          tone:
            mainStatsAiEfficiency === null
              ? "neutral"
              : mainStatsAiEfficiency >= 0.55
                ? "up"
                : mainStatsAiEfficiency <= 0.45
                  ? "down"
                  : "neutral",
          span: 1
        },
        {
          label: "AI Efficacy",
          value:
            mainStatsAiEfficacyPct === null
              ? "—"
              : `${mainStatsAiEfficacyPct >= 0 ? "+" : ""}${mainStatsAiEfficacyPct.toFixed(1)}%`,
          tone:
            mainStatsAiEfficacyPct === null
              ? "neutral"
              : mainStatsAiEfficacyPct >= 0
                ? "up"
                : "down",
          span: 1
        },
        {
          label: "AI Effectiveness",
          value:
            mainStatsAiEffectivenessPct === null
              ? "—"
              : `${mainStatsAiEffectivenessPct >= 0 ? "+" : ""}${mainStatsAiEffectivenessPct.toFixed(1)}%`,
          tone:
            mainStatsAiEffectivenessPct === null
              ? "neutral"
              : mainStatsAiEffectivenessPct >= 0
                ? "up"
                : "down",
          span: 1
        }
      ]),
      buildStatRow("model-summary-row", [
        {
          label: "Best Model",
          value:
            bestModelRow ? `${bestModelRow.label} · ${formatSignedUsd(bestModelRow.total)}` : "—",
          tone: bestModelRow === null ? "neutral" : bestModelRow.total >= 0 ? "up" : "down",
          span: 1
        },
        {
          label: "Worst Model",
          value:
            worstModelRow ? `${worstModelRow.label} · ${formatSignedUsd(worstModelRow.total)}` : "—",
          tone: worstModelRow === null ? "neutral" : worstModelRow.total >= 0 ? "up" : "down",
          span: 1
        }
      ]),
      {
        label: "Model PnL",
        value: modelPnlValue,
        tone:
          mainStatsModelPnlFocusRow === null
            ? "neutral"
            : mainStatsModelPnlFocusRow.total >= 0
              ? "up"
              : "down",
        labelEmphasis: true,
        valueClassName: "with-nav",
        span: 6
      },
      buildStatRow("session-summary-row", [
        {
          label: "Best Session",
          value:
            bestSessionRow ? `${bestSessionRow.label} · ${formatSignedUsd(bestSessionRow.total)}` : "—",
          tone: bestSessionRow === null ? "neutral" : bestSessionRow.total >= 0 ? "up" : "down",
          span: 1
        },
        {
          label: "Worst Session",
          value:
            worstSessionRow
              ? `${worstSessionRow.label} · ${formatSignedUsd(worstSessionRow.total)}`
              : "—",
          tone: worstSessionRow === null ? "neutral" : worstSessionRow.total >= 0 ? "up" : "down",
          span: 1
        }
      ]),
      {
        label: "Session PnL",
        value: sessionPnlValue,
        tone:
          mainStatsSessionPnlFocusRow === null
            ? "neutral"
            : mainStatsSessionPnlFocusRow.total >= 0
              ? "up"
              : "down",
        labelEmphasis: true,
        valueClassName: "with-nav",
        span: 6
      },
      buildStatRow("month-summary-row", [
        {
          label: "Best Month",
          value:
            bestMonthRow ? `${getMonthLabel(bestMonthRow.key)} · ${formatSignedUsd(bestMonthRow.total)}` : "—",
          tone: bestMonthRow === null ? "neutral" : bestMonthRow.total >= 0 ? "up" : "down",
          span: 1
        },
        {
          label: "Worst Month",
          value:
            worstMonthRow
              ? `${getMonthLabel(worstMonthRow.key)} · ${formatSignedUsd(worstMonthRow.total)}`
              : "—",
          tone: worstMonthRow === null ? "neutral" : worstMonthRow.total >= 0 ? "up" : "down",
          span: 1
        }
      ]),
      {
        label: "Monthly PnL",
        value: monthPnlValue,
        tone:
          mainStatsMonthPnlFocusRow === null
            ? "neutral"
            : mainStatsMonthPnlFocusRow.total >= 0
              ? "up"
              : "down",
        labelEmphasis: true,
        valueClassName: "with-nav",
        span: 6
      },
      buildStatRow("date-range-row", [
        {
          label: "Start Date",
          value: backtestRange.startMs === null ? "—" : formatDateTime(backtestRange.startMs),
          tone: "neutral",
          span: 1
        },
        {
          label: "End Date",
          value: backtestRange.endMs === null ? "—" : formatDateTime(backtestRange.endMs),
          tone: "neutral",
          span: 1
        }
      ])
    ];
  }, [
    backtestRange.endMs,
    backtestRange.startMs,
    mainStatsAiEfficacyPct,
    mainStatsAiEffectivenessPct,
    mainStatsAiEfficiency,
    mainStatsModelPnlFocusRow,
    mainStatsModelRows,
    mainStatsMonthPnlFocusRow,
    mainStatsMonthRows,
    resolvedMainStatsMonthPnlIndex,
    mainStatsSessionPnlFocusRow,
    mainStatsSessionRows,
    mainStatsSummary
  ]);

  const footerHeroStats = useMemo<BacktestHeroStatCard[]>(() => {
    const stats: BacktestHeroStatCard[] = [];

    for (const card of mainStatisticsCards) {
      if (card.label === "Model PnL") {
        for (const row of mainStatsModelRows) {
          stats.push({
            label: row.label,
            value: formatSignedUsd(row.total),
            tone: row.total >= 0 ? "up" : "down",
            meta: `${row.trades} trades`
          });
        }
      } else if (card.label === "Session PnL") {
        for (const row of mainStatsSessionRows) {
          stats.push({
            label: row.label,
            value: formatSignedUsd(row.total),
            tone: row.total >= 0 ? "up" : "down",
            meta: `${row.trades} trades`
          });
        }
      } else if (card.label === "Monthly PnL") {
        for (const row of mainStatsMonthRows) {
          stats.push({
            label: getMonthLabel(row.key),
            value: formatSignedUsd(row.total),
            tone: row.total >= 0 ? "up" : "down",
            meta: `${row.trades} trades`
          });
        }
      } else if (card.children) {
        for (const child of card.children) {
          stats.push({
            label: child.label,
            value: String(child.value),
            tone: child.tone,
            meta: ""
          });
        }
      } else {
        stats.push({
          label: card.label,
          value: String(card.value),
          tone: card.tone,
          meta: ""
        });
      }
    }

    return stats;
  }, [mainStatisticsCards, mainStatsModelRows, mainStatsSessionRows, mainStatsMonthRows]);

  const availableBacktestMonths = useMemo(() => {
    if (!isCalendarBacktestTabActive) {
      return [] as string[];
    }

    const monthKeys = new Set<string>();

    for (const trade of deferredBacktestAnalyticsTrades) {
      monthKeys.add(getTradeMonthKey(trade.exitTime));
    }

    return Array.from(monthKeys).sort((a, b) => b.localeCompare(a));
  }, [deferredBacktestAnalyticsTrades, isCalendarBacktestTabActive]);

  const backtestCalendarAgg = useMemo(() => {
    if (!isCalendarBacktestTabActive) {
      return new Map<string, { count: number; wins: number; pnl: number; items: HistoryItem[] }>();
    }

    const map = new Map<string, { count: number; wins: number; pnl: number; items: HistoryItem[] }>();

    for (const trade of deferredBacktestAnalyticsTrades) {
      const dateKey = getTradeDayKey(trade.exitTime);
      const bucket = map.get(dateKey) ?? { count: 0, wins: 0, pnl: 0, items: [] };
      bucket.count += 1;
      bucket.wins += trade.result === "Win" ? 1 : 0;
      bucket.pnl += trade.pnlUsd;
      bucket.items.push(trade);
      map.set(dateKey, bucket);
    }

    return map;
  }, [deferredBacktestAnalyticsTrades, isCalendarBacktestTabActive]);

  const activeBacktestMonthKey = selectedBacktestMonthKey || getCurrentTradeMonthKey();
  const calendarMonthLabel = getMonthLabel(activeBacktestMonthKey);

  const backtestCalendarGrid = useMemo(() => {
    if (!isCalendarBacktestTabActive) {
      return [];
    }

    const [year, month] = activeBacktestMonthKey.split("-").map((value) => Number(value));

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return [];
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const offset = monthStart.getUTCDay();
    const gridStart = new Date(Date.UTC(year, month - 1, 1 - offset));

    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(gridStart.getTime() + index * 86_400_000);
      const dateKey = current.toISOString().slice(0, 10);

      return {
        dateKey,
        day: current.getUTCDate(),
        inMonth: current.getUTCMonth() === monthStart.getUTCMonth(),
        activity: backtestCalendarAgg.get(dateKey) ?? null
      };
    });
  }, [activeBacktestMonthKey, backtestCalendarAgg, isCalendarBacktestTabActive]);

  const selectedBacktestMonthPnl = useMemo(() => {
    return backtestCalendarGrid.reduce((sum, cell) => {
      if (!cell.inMonth || !cell.activity) {
        return sum;
      }

      return sum + cell.activity.pnl;
    }, 0);
  }, [backtestCalendarGrid]);

  const visibleBacktestDateKeys = useMemo(() => {
    return backtestCalendarGrid
      .filter((cell) => cell.inMonth && cell.activity)
      .map((cell) => cell.dateKey);
  }, [backtestCalendarGrid]);

  const selectedBacktestDayTrades = useMemo(() => {
    if (!isCalendarBacktestTabActive) {
      return [] as HistoryItem[];
    }

    const bucket = backtestCalendarAgg.get(selectedBacktestDateKey);

    if (!bucket) {
      return [];
    }

    return [...bucket.items].sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
  }, [backtestCalendarAgg, isCalendarBacktestTabActive, selectedBacktestDateKey]);

  useEffect(() => {
    if (!isCalendarBacktestTabActive) {
      return;
    }

    setExpandedBacktestTradeId((current) => {
      if (!current) {
        return null;
      }

      return selectedBacktestDayTrades.some((trade) => trade.id === current) ? current : null;
    });
  }, [isCalendarBacktestTabActive, selectedBacktestDayTrades]);

  const filteredBacktestHistory = useMemo(() => {
    if (!isHistoryBacktestTabActive) {
      return [] as HistoryItem[];
    }

    const query = backtestHistoryQuery.trim().toLowerCase();

    if (!query) {
      return [...deferredBacktestAnalyticsTrades].sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
    }

    return [...deferredBacktestAnalyticsTrades]
      .filter((trade) => {
        const haystack = [
          trade.id,
          getAiZipTradeDisplayId(trade),
          trade.entrySource,
          trade.symbol,
          trade.side,
          trade.side === "Long" ? "Buy" : "Sell",
          trade.result,
          getSessionLabel(trade.entryTime),
          getBacktestExitLabel(trade),
          trade.entryAt,
          trade.exitAt,
          formatSignedUsd(trade.pnlUsd),
          formatSignedPercent(trade.pnlPct)
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
  }, [backtestHistoryQuery, deferredBacktestAnalyticsTrades, isHistoryBacktestTabActive]);

  useEffect(() => {
    if (!isHistoryBacktestTabActive) {
      return;
    }

    setBacktestHistoryPage(1);
  }, [backtestHistoryQuery, backtestTrades, isHistoryBacktestTabActive]);

  const backtestHistoryPageCount = Math.max(
    1,
    Math.ceil(filteredBacktestHistory.length / BACKTEST_HISTORY_PAGE_SIZE)
  );
  const visibleBacktestHistoryPage = Math.min(backtestHistoryPage, backtestHistoryPageCount);
  const backtestHistoryPageStart =
    filteredBacktestHistory.length === 0
      ? 0
      : (visibleBacktestHistoryPage - 1) * BACKTEST_HISTORY_PAGE_SIZE + 1;
  const backtestHistoryPageEnd =
    filteredBacktestHistory.length === 0
      ? 0
      : Math.min(filteredBacktestHistory.length, visibleBacktestHistoryPage * BACKTEST_HISTORY_PAGE_SIZE);
  const pagedBacktestHistory = useMemo(() => {
    if (filteredBacktestHistory.length === 0) {
      return [];
    }

    const startIndex = (visibleBacktestHistoryPage - 1) * BACKTEST_HISTORY_PAGE_SIZE;
    return filteredBacktestHistory.slice(startIndex, startIndex + BACKTEST_HISTORY_PAGE_SIZE);
  }, [filteredBacktestHistory, visibleBacktestHistoryPage]);

  const aiZipClusterCandles = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return [] as Array<Candle & { time: number }>;
    }

    return selectedChartCandles.map((candle) => ({
      ...candle,
      time: Number(candle.time)
    }));
  }, [isClusterBacktestTabActive, selectedChartCandles]);

  const aiZipClusterTrades = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return [];
    }

    const maxIndex = Math.max(0, selectedChartCandles.length - 1);

    return deferredBacktestAnalyticsTrades.map((trade, index) => {
      const fallbackIndex =
        maxIndex > 0
          ? Math.round((index / Math.max(1, deferredBacktestAnalyticsTrades.length - 1)) * maxIndex)
          : 0;
      const entryIndex = clamp(candleIndexByUnix.get(Number(trade.entryTime)) ?? fallbackIndex, 0, maxIndex);
      const exitIndex = clamp(
        candleIndexByUnix.get(Number(trade.exitTime)) ??
          Math.min(maxIndex, entryIndex + Math.max(1, Math.floor((Number(trade.exitTime) - Number(trade.entryTime)) / 60))),
        0,
        maxIndex
      );

      return {
        id: trade.id,
        uid: trade.id,
        kind: "trade",
        dir: trade.side === "Long" ? 1 : -1,
        direction: trade.side === "Long" ? 1 : -1,
        result: trade.result === "Win" ? "TP" : "SL",
        pnl: trade.pnlUsd,
        unrealizedPnl: null,
        isOpen: false,
        win: trade.result === "Win",
        entryTime: Number(trade.entryTime),
        exitTime: Number(trade.exitTime),
        signalIndex: entryIndex,
        entryIndex,
        exitIndex,
        entryModel: trade.entrySource,
        chunkType: trade.entrySource,
        model: trade.entrySource,
        exitReason: getBacktestExitLabel(trade),
        entryPrice: trade.entryPrice,
        exitPrice: trade.outcomePrice,
        margin: getEffectiveTradeConfidenceScore(trade),
        side: trade.side
      };
    });
  }, [
    candleIndexByUnix,
    deferredBacktestAnalyticsTrades,
    getEffectiveTradeConfidenceScore,
    isClusterBacktestTabActive,
    selectedChartCandles.length
  ]);

  useEffect(() => {
    if (!isClusterBacktestTabActive) {
      return;
    }

    setAiZipClusterTimelineIdx(Math.max(0, aiZipClusterCandles.length - 1));
  }, [aiZipClusterCandles.length, isClusterBacktestTabActive]);

  const performanceStatsModelOptions = useMemo(() => {
    if (!isPerformanceStatsBacktestTabActive) {
      return ["All"];
    }

    const models = Array.from(
      new Set(
        deferredBacktestAnalyticsTrades
          .map((trade) => trade.entrySource.trim())
          .filter((name) => name.length > 0)
      )
    );

    return ["All", ...models];
  }, [deferredBacktestAnalyticsTrades, isPerformanceStatsBacktestTabActive]);

  useEffect(() => {
    if (!isPerformanceStatsBacktestTabActive) {
      return;
    }

    if (!performanceStatsModelOptions.includes(performanceStatsModel)) {
      setPerformanceStatsModel("All");
    }
  }, [isPerformanceStatsBacktestTabActive, performanceStatsModel, performanceStatsModelOptions]);

  const performanceStatsTemporalCharts = useMemo(() => {
    if (!isPerformanceStatsBacktestTabActive) {
      return {
        hours: [] as { bucket: string; pnl: number; count: number }[],
        weekday: [] as { bucket: string; pnl: number; count: number }[],
        month: [] as { bucket: string; pnl: number; count: number }[],
        year: [] as { bucket: string; pnl: number; count: number }[],
        hasData: false
      };
    }

    const modelTrades = deferredBacktestAnalyticsTrades.filter((trade) => {
      const modelName = trade.entrySource.trim();

      if (!modelName) {
        return false;
      }

      if (performanceStatsModel === "All") {
        return true;
      }

      return modelName === performanceStatsModel;
    });

    const buildSeries = (range: "hours" | "weekday" | "month" | "year") => {
      const buckets = new Map<string, { pnl: number; count: number }>();

      for (const trade of modelTrades) {
        const timestampSeconds = Number(trade.entryTime ?? trade.exitTime);

        if (!Number.isFinite(timestampSeconds)) {
          continue;
        }

        const date = new Date(timestampSeconds * 1000);
        let key = "";

        if (range === "hours") {
          key = backtestHourLabels[date.getUTCHours()] ?? String(date.getUTCHours());
        } else if (range === "weekday") {
          key = backtestWeekdayLabels[date.getUTCDay()] ?? String(date.getUTCDay());
        } else if (range === "month") {
          key = backtestMonthLabels[date.getUTCMonth()] ?? String(date.getUTCMonth() + 1);
        } else {
          key = String(date.getUTCFullYear());
        }

        const current = buckets.get(key) ?? { pnl: 0, count: 0 };
        buckets.set(key, {
          pnl: current.pnl + trade.pnlUsd,
          count: current.count + 1
        });
      }

      let orderedBuckets: string[] = [];

      if (range === "hours") {
        orderedBuckets = [...backtestHourLabels];
      } else if (range === "weekday") {
        orderedBuckets = [...backtestWeekdayLabels];
      } else if (range === "month") {
        orderedBuckets = [...backtestMonthLabels];
      } else {
        orderedBuckets = Array.from(buckets.keys())
          .map((bucket) => Number(bucket))
          .filter((value) => Number.isFinite(value))
          .sort((left, right) => left - right)
          .map((value) => String(value));
      }

      return orderedBuckets.map((bucket) => {
        const record = buckets.get(bucket) ?? { pnl: 0, count: 0 };
        return {
          bucket,
          pnl: Number(record.pnl.toFixed(2)),
          count: record.count
        };
      });
    };

    const hours = buildSeries("hours");
    const weekday = buildSeries("weekday");
    const month = buildSeries("month");
    const year = buildSeries("year");
    const hasData = [hours, weekday, month, year].some((series) =>
      series.some((row) => row.count > 0)
    );

    return { hours, weekday, month, year, hasData };
  }, [
    deferredBacktestAnalyticsTrades,
    isPerformanceStatsBacktestTabActive,
    performanceStatsModel
  ]);
  const performanceStatsTemporalSections = useMemo(
    () => [
      { key: "hours", label: "Hours", data: performanceStatsTemporalCharts.hours },
      { key: "weekday", label: "Weekday", data: performanceStatsTemporalCharts.weekday },
      { key: "month", label: "Month", data: performanceStatsTemporalCharts.month },
      { key: "year", label: "Year", data: performanceStatsTemporalCharts.year }
    ],
    [performanceStatsTemporalCharts]
  );

  const backtestClusterData = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return {
        total: 0,
        nodes: [] as BacktestClusterNode[],
        groups: [] as BacktestClusterGroup[]
      };
    }

    const holds = deferredBacktestAnalyticsTrades.map((trade) =>
      Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60)
    );
    const sortedHolds = [...holds].sort((a, b) => a - b);
    const medianHold =
      sortedHolds.length > 0 ? sortedHolds[Math.floor(sortedHolds.length / 2)] : 0;
    const maxHold = holds.length > 0 ? Math.max(1, ...holds) : 1;
    const maxUnits =
      deferredBacktestAnalyticsTrades.length > 0
        ? Math.max(1, ...deferredBacktestAnalyticsTrades.map((trade) => trade.units))
        : 1;
    const maxAbsPnl =
      deferredBacktestAnalyticsTrades.length > 0
        ? Math.max(1, ...deferredBacktestAnalyticsTrades.map((trade) => Math.abs(trade.pnlPct)))
        : 1;

    const nodes: BacktestClusterNode[] = deferredBacktestAnalyticsTrades.map((trade) => {
      const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
      const clusterId: BacktestClusterGroupId =
        trade.result === "Win"
          ? holdMinutes <= medianHold
            ? "momentum"
            : "trend"
          : Math.abs(trade.pnlPct) >= 0.22
            ? "trap"
            : "chop";
      const seed = hashSeedFromText(`cluster-node-${trade.id}`);
      const jitterX = ((((seed >>> 3) & 255) / 255) * 2 - 1) * 5;
      const jitterY = ((((seed >>> 11) & 255) / 255) * 2 - 1) * 5;
      const baseX = 14 + ((trade.pnlPct + maxAbsPnl) / (maxAbsPnl * 2)) * 72;
      const baseY = 86 - (holdMinutes / maxHold) * 66;

      return {
        id: trade.id,
        trade,
        clusterId,
        x: clamp(baseX + jitterX, 8, 92),
        y: clamp(baseY + jitterY, 10, 90),
        r: 2.8 + (trade.units / maxUnits) * 3.8,
        tone: trade.pnlUsd >= 0 ? "up" : "down",
        holdMinutes,
        confidence: getEffectiveTradeConfidenceScore(trade) * 100,
        session: getSessionLabel(trade.entryTime),
        monthIndex: getTradeMonthIndex(trade.entryTime),
        weekdayIndex: new Date(Number(trade.entryTime) * 1000).getUTCDay(),
        hour: getTradeHour(trade.entryTime),
        sideLabel: trade.side === "Long" ? "Buy" : "Sell"
      };
    });

    return {
      total: deferredBacktestAnalyticsTrades.length,
      nodes,
      groups: buildBacktestClusterGroups(nodes)
    };
  }, [
    deferredBacktestAnalyticsTrades,
    getEffectiveTradeConfidenceScore,
    isClusterBacktestTabActive
  ]);

  const backtestClusterViewOptions = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return {
        sessions: [] as string[],
        months: [] as number[],
        weekdays: [] as number[],
        hours: [] as number[]
      };
    }

    const sessions = new Set<string>();
    const months = new Set<number>();
    const weekdays = new Set<number>();
    const hours = new Set<number>();

    for (const node of backtestClusterData.nodes) {
      sessions.add(node.session);
      months.add(node.monthIndex);
      weekdays.add(node.weekdayIndex);
      hours.add(node.hour);
    }

    return {
      sessions: backtestSessionLabels.filter((label) => sessions.has(label)),
      months: Array.from(months).sort((a, b) => a - b),
      weekdays: Array.from(weekdays).sort((a, b) => a - b),
      hours: Array.from(hours).sort((a, b) => a - b)
    };
  }, [backtestClusterData.nodes, isClusterBacktestTabActive]);

  useEffect(() => {
    if (!isClusterBacktestTabActive) {
      return;
    }

    if (
      clusterViewSession !== "All" &&
      !backtestClusterViewOptions.sessions.some((label) => label === clusterViewSession)
    ) {
      setClusterViewSession("All");
    }

    if (
      clusterViewMonth !== "All" &&
      !backtestClusterViewOptions.months.some((value) => String(value) === clusterViewMonth)
    ) {
      setClusterViewMonth("All");
    }

    if (
      clusterViewWeekday !== "All" &&
      !backtestClusterViewOptions.weekdays.some((value) => String(value) === clusterViewWeekday)
    ) {
      setClusterViewWeekday("All");
    }

    if (
      clusterViewHour !== "All" &&
      !backtestClusterViewOptions.hours.some((value) => String(value) === clusterViewHour)
    ) {
      setClusterViewHour("All");
    }
  }, [
    backtestClusterViewOptions,
    clusterViewHour,
    clusterViewMonth,
    clusterViewSession,
    clusterViewWeekday,
    isClusterBacktestTabActive
  ]);

  const visibleBacktestClusterNodes = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return [] as BacktestClusterNode[];
    }

    return backtestClusterData.nodes.filter((node) => {
      if (!clusterLegendToggles[node.clusterId]) {
        return false;
      }

      if (node.trade.result === "Win" && !clusterLegendToggles.closedWin) {
        return false;
      }

      if (node.trade.result === "Loss" && !clusterLegendToggles.closedLoss) {
        return false;
      }

      if (clusterViewDir === "Buy" && node.trade.side !== "Long") {
        return false;
      }

      if (clusterViewDir === "Sell" && node.trade.side !== "Short") {
        return false;
      }

      if (clusterViewSession !== "All" && node.session !== clusterViewSession) {
        return false;
      }

      if (clusterViewMonth !== "All" && String(node.monthIndex) !== clusterViewMonth) {
        return false;
      }

      if (clusterViewWeekday !== "All" && String(node.weekdayIndex) !== clusterViewWeekday) {
        return false;
      }

      if (clusterViewHour !== "All" && String(node.hour) !== clusterViewHour) {
        return false;
      }

      return true;
    });
  }, [
    backtestClusterData.nodes,
    clusterLegendToggles,
    clusterViewDir,
    clusterViewHour,
    clusterViewMonth,
    clusterViewSession,
    clusterViewWeekday,
    isClusterBacktestTabActive
  ]);

  const visibleBacktestClusterGroups = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return [] as BacktestClusterGroup[];
    }

    return buildBacktestClusterGroups(visibleBacktestClusterNodes);
  }, [isClusterBacktestTabActive, visibleBacktestClusterNodes]);

  const backtestClusterTableRows = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return [] as BacktestClusterGroup[];
    }

    return [...visibleBacktestClusterGroups].sort((left, right) => {
      if (right.avgPnl !== left.avgPnl) {
        return right.avgPnl - left.avgPnl;
      }

      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return right.winRate - left.winRate;
    });
  }, [isClusterBacktestTabActive, visibleBacktestClusterGroups]);

  const backtestClusterCounts = useMemo(() => {
    if (!isClusterBacktestTabActive) {
      return {
        total: 0,
        visible: 0,
        wins: 0,
        losses: 0,
        buys: 0,
        sells: 0,
        visibleRate: 0,
        winRate: 0,
        buyRate: 0,
        avgConfidence: 0
      };
    }

    let wins = 0;
    let losses = 0;
    let buys = 0;
    let sells = 0;
    let confidence = 0;

    for (const node of visibleBacktestClusterNodes) {
      wins += node.trade.result === "Win" ? 1 : 0;
      losses += node.trade.result === "Loss" ? 1 : 0;
      buys += node.trade.side === "Long" ? 1 : 0;
      sells += node.trade.side === "Short" ? 1 : 0;
      confidence += node.confidence;
    }

    const visible = visibleBacktestClusterNodes.length;
    const total = backtestClusterData.total;

    return {
      total,
      visible,
      wins,
      losses,
      buys,
      sells,
      visibleRate: total > 0 ? (visible / total) * 100 : 0,
      winRate: visible > 0 ? (wins / visible) * 100 : 0,
      buyRate: visible > 0 ? (buys / visible) * 100 : 0,
      avgConfidence: visible > 0 ? confidence / visible : 0
    };
  }, [backtestClusterData.total, isClusterBacktestTabActive, visibleBacktestClusterNodes]);

  const selectedBacktestClusterNode = useMemo(() => {
    if (!isClusterBacktestTabActive || !selectedHistoryId) {
      return null;
    }

    return visibleBacktestClusterNodes.find((node) => node.id === selectedHistoryId) ?? null;
  }, [isClusterBacktestTabActive, selectedHistoryId, visibleBacktestClusterNodes]);

  const selectedBacktestClusterGroup = useMemo(() => {
    if (!isClusterBacktestTabActive || !selectedBacktestClusterGroupId) {
      return null;
    }

    return visibleBacktestClusterGroups.find((group) => group.id === selectedBacktestClusterGroupId) ?? null;
  }, [isClusterBacktestTabActive, selectedBacktestClusterGroupId, visibleBacktestClusterGroups]);

  useEffect(() => {
    if (!isClusterBacktestTabActive || !selectedBacktestClusterGroupId) {
      return;
    }

    if (!visibleBacktestClusterGroups.some((group) => group.id === selectedBacktestClusterGroupId)) {
      setSelectedBacktestClusterGroupId(null);
    }
  }, [isClusterBacktestTabActive, selectedBacktestClusterGroupId, visibleBacktestClusterGroups]);

  const resetBacktestClusterView = () => {
    setClusterViewDir("All");
    setClusterViewSession("All");
    setClusterViewMonth("All");
    setClusterViewWeekday("All");
    setClusterViewHour("All");
    setClusterSearchId("");
    setClusterSearchStatus(null);
    setClusterNodeSizeScale(1);
    setClusterOverlayOpacity(1);
    setClusterLegendToggles({ ...BACKTEST_CLUSTER_LEGEND_DEFAULTS });
    setSelectedBacktestClusterGroupId(null);
  };

  const toggleBacktestClusterLegend = (key: BacktestClusterLegendKey) => {
    setClusterLegendToggles((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const runBacktestClusterSearch = (query = clusterSearchId) => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      setClusterSearchStatus(null);
      return;
    }

    const match =
      visibleBacktestClusterNodes.find((node) => node.id.toLowerCase() === normalized) ??
      visibleBacktestClusterNodes.find((node) => node.id.toLowerCase().includes(normalized));

    if (!match) {
      setClusterSearchStatus("miss");
      return;
    }

    setClusterSearchStatus(null);
    setClusterSearchId(match.id);
    setSelectedBacktestClusterGroupId(null);
    setSelectedHistoryId(match.id);
  };

  const dimensionStats = useMemo<DimensionStatsSummary | null>(() => {
    if (!isBacktestAnalyticsVisible || selectedBacktestTab !== "dimensions") {
      return null;
    }

    const sortedTrades = [...deferredBacktestAnalyticsTrades].sort(
      (left, right) => Number(left.entryTime) - Number(right.entryTime)
    );
    const splitAllowed =
      appliedBacktestSettings.antiCheatEnabled &&
      appliedBacktestSettings.validationMode === "split";
    const splitIndex = Math.floor(sortedTrades.length * (DIMENSION_STATS_SPLIT_PCT / 100));
    const evaluationTrades = splitAllowed ? sortedTrades.slice(splitIndex) : sortedTrades;
    const effectiveBars = getAiFeatureWindowBars(appliedBacktestSettings.chunkBars);
    const dimensionDefs: Array<{
      key: string;
      featureId: string;
      featureIndex: number;
      lag: number;
      name: string;
    }> = [];

    for (const feature of AI_FEATURE_OPTIONS) {
      const level = appliedBacktestSettings.aiFeatureLevels[feature.id] ?? 0;
      const take = featureTakeCount(feature.id, level);

      if (take <= 0) {
        continue;
      }

      const names = DIMENSION_FEATURE_NAME_BANK[feature.id] ?? [];
      const mode = appliedBacktestSettings.aiFeatureModes[feature.id] ?? "individual";
      const parts = mode === "individual" ? effectiveBars : 1;

      for (let featureIndex = 0; featureIndex < take; featureIndex += 1) {
        const subName = names[featureIndex] ?? `Dim ${featureIndex + 1}`;

        for (let lag = 0; lag < parts; lag += 1) {
          dimensionDefs.push({
            key: `${feature.id}__${featureIndex}__t${lag}`,
            featureId: feature.id,
            featureIndex,
            lag,
            name:
              mode === "individual"
                ? `${feature.label} - ${subName} · t-${lag}`
                : `${feature.label} - ${subName}`
          });
        }
      }
    }

    if (dimensionDefs.length === 0 || evaluationTrades.length === 0) {
      return {
        mode: splitAllowed ? "split" : "all",
        split: DIMENSION_STATS_SPLIT_PCT,
        count: 0,
        baselineWin: null,
        dimKeyOrder: [],
        dims: [],
        keptKeys: [],
        inDim: 0,
        outDim: 0
      };
    }

    const valuesByDimension = new Map<string, number[]>();

    for (const dimension of dimensionDefs) {
      valuesByDimension.set(dimension.key, []);
    }

    const outcomes: number[] = [];

    for (const trade of evaluationTrades) {
      const candles =
        backtestSeriesMap[symbolTimeframeKey(trade.symbol, appliedBacktestSettings.timeframe)] ??
        seriesMap[symbolTimeframeKey(trade.symbol, appliedBacktestSettings.timeframe)] ??
        EMPTY_CANDLES;

      if (candles.length === 0) {
        continue;
      }

      const entryIndex = findCandleIndexAtOrBefore(candles, Number(trade.entryTime) * 1000);

      if (entryIndex < 0) {
        continue;
      }

      const featureBuckets = buildDimensionFeatureLagBuckets(
        candles,
        entryIndex,
        appliedBacktestSettings.chunkBars
      );

      if (!featureBuckets) {
        continue;
      }

      outcomes.push(trade.result === "Win" ? 1 : 0);

      for (const dimension of dimensionDefs) {
        const perLagValues = featureBuckets[dimension.featureId] ?? [];
        const values = perLagValues[dimension.lag] ?? perLagValues[0] ?? [];
        const value = Number(values[dimension.featureIndex] ?? 0);
        const list = valuesByDimension.get(dimension.key);

        if (list) {
          list.push(Number.isFinite(value) ? value : 0);
        }
      }
    }

    if (outcomes.length === 0) {
      return {
        mode: splitAllowed ? "split" : "all",
        split: DIMENSION_STATS_SPLIT_PCT,
        count: 0,
        baselineWin: null,
        dimKeyOrder: [],
        dims: [],
        keptKeys: [],
        inDim: 0,
        outDim: 0
      };
    }

    const epsilon = 0.000000001;
    const dimensions: DimensionStatRow[] = [];
    const varianceByKey = new Map<string, number>();

    for (const dimension of dimensionDefs) {
      const values = valuesByDimension.get(dimension.key) ?? [];

      if (values.length !== outcomes.length || values.length === 0) {
        continue;
      }

      const mean = meanOf(values);
      let sumSquared = 0;

      for (const value of values) {
        const delta = value - mean;
        sumSquared += delta * delta;
      }

      const variance = sumSquared / Math.max(1, values.length - 1);
      varianceByKey.set(dimension.key, variance);
      const std = Math.sqrt(Math.max(epsilon, variance));
      const normalized = values.map((value) => (value - mean) / std);
      const correlation = getBinaryCorrelation(normalized, outcomes);
      const lowThreshold = quantileOf(normalized, 0.1);
      const highThreshold = quantileOf(normalized, 0.9);
      let lowTotal = 0;
      let lowWins = 0;
      let highTotal = 0;
      let highWins = 0;

      for (let index = 0; index < normalized.length; index += 1) {
        const value = normalized[index];
        const isWin = outcomes[index] === 1;

        if (value <= lowThreshold) {
          lowTotal += 1;
          lowWins += isWin ? 1 : 0;
        }

        if (value >= highThreshold) {
          highTotal += 1;
          highWins += isWin ? 1 : 0;
        }
      }

      const winLow = lowTotal > 0 ? lowWins / lowTotal : null;
      const winHigh = highTotal > 0 ? highWins / highTotal : null;
      const lift = winLow === null || winHigh === null ? null : winHigh - winLow;

      let optimal = "—";

      if (winLow !== null && winHigh !== null) {
        if (winHigh > winLow) {
          optimal = `>= ${highThreshold.toFixed(2)}`;
        } else if (winLow > winHigh) {
          optimal = `<= ${lowThreshold.toFixed(2)}`;
        } else {
          optimal = `<= ${lowThreshold.toFixed(2)} or >= ${highThreshold.toFixed(2)}`;
        }
      } else if (winHigh !== null) {
        optimal = `>= ${highThreshold.toFixed(2)}`;
      } else if (winLow !== null) {
        optimal = `<= ${lowThreshold.toFixed(2)}`;
      }

      dimensions.push({
        key: dimension.key,
        featureId: dimension.featureId,
        name: dimension.name,
        corr: correlation,
        absCorr: Math.abs(correlation),
        min: Math.min(...normalized),
        max: Math.max(...normalized),
        qLow: lowThreshold,
        qHigh: highThreshold,
        winLow,
        winHigh,
        lift,
        optimal,
        n: normalized.length
      });
    }

    dimensions.sort((left, right) => right.absCorr - left.absCorr);

    const inDim = dimensions.length;
    const outDim =
      inDim > 0 ? clamp(Math.round(appliedBacktestSettings.dimensionAmount), 2, inDim) : 0;
    const dimKeyOrder = dimensions.map((dimension) => dimension.key);
    let keptKeys = dimKeyOrder;

    if (outDim < inDim) {
      if (appliedBacktestSettings.compressionMethod === "subsample") {
        if (outDim <= 1) {
          keptKeys = [dimKeyOrder[0]!];
        } else {
          keptKeys = Array.from({ length: outDim }, (_, index) => {
            const keyIndex = Math.round((index * (inDim - 1)) / Math.max(1, outDim - 1));
            return dimKeyOrder[keyIndex]!;
          });
        }
      } else if (appliedBacktestSettings.compressionMethod === "variance") {
        keptKeys = [...dimensions]
          .sort(
            (left, right) =>
              (varianceByKey.get(right.key) ?? Number.NEGATIVE_INFINITY) -
              (varianceByKey.get(left.key) ?? Number.NEGATIVE_INFINITY)
          )
          .slice(0, outDim)
          .map((dimension) => dimension.key);
      } else {
        keptKeys = dimensions.slice(0, outDim).map((dimension) => dimension.key);
      }
    }

    return {
      mode: splitAllowed ? "split" : "all",
      split: DIMENSION_STATS_SPLIT_PCT,
      count: outcomes.length,
      baselineWin: outcomes.length > 0 ? meanOf(outcomes) : null,
      dimKeyOrder,
      dims: dimensions,
      keptKeys: Array.from(new Set(keptKeys)),
      inDim,
      outDim
    };
  }, [
    appliedBacktestSettings.aiFeatureLevels,
    appliedBacktestSettings.aiFeatureModes,
    appliedBacktestSettings.antiCheatEnabled,
    appliedBacktestSettings.chunkBars,
    appliedBacktestSettings.compressionMethod,
    appliedBacktestSettings.dimensionAmount,
    appliedBacktestSettings.timeframe,
    appliedBacktestSettings.validationMode,
    backtestSeriesMap,
    deferredBacktestAnalyticsTrades,
    isBacktestAnalyticsVisible,
    selectedBacktestTab,
    seriesMap,
  ]);

  const toggleDimSort = (column: DimensionSortColumn) => {
    if (dimSortCol === column) {
      setDimSortDir((current) => (current === 1 ? -1 : 1));
      return;
    }

    setDimSortCol(column);
    setDimSortDir(column === "name" || column === "optimal" ? 1 : -1);
  };

  const dimensionStatsRows = useMemo(() => {
    const allRows = dimensionStats?.dims ?? [];

    if (allRows.length === 0) {
      return [] as DimensionStatRow[];
    }

    const activeSet =
      dimScope === "active" && (dimensionStats?.keptKeys.length ?? 0) > 0
        ? new Set(dimensionStats?.keptKeys ?? [])
        : null;
    const rows = activeSet ? allRows.filter((row) => activeSet.has(row.key)) : allRows;
    const query = dimSearch.trim().toLowerCase();

    const filtered = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query))
      : [...rows];

    const getSortableNumber = (row: DimensionStatRow): number | null => {
      if (dimSortCol === "corr") {
        return Number.isFinite(row.corr) ? row.corr : null;
      }

      if (dimSortCol === "winLow") {
        return row.winLow;
      }

      if (dimSortCol === "winHigh") {
        return row.winHigh;
      }

      if (dimSortCol === "lift") {
        return row.lift;
      }

      if (dimSortCol === "min") {
        return Number.isFinite(row.min) ? row.min : null;
      }

      if (dimSortCol === "max") {
        return Number.isFinite(row.max) ? row.max : null;
      }

      return null;
    };

    filtered.sort((left, right) => {
      if (dimSortCol === "name" || dimSortCol === "optimal") {
        const key = dimSortCol === "name" ? "name" : "optimal";
        const a = left[key].toLowerCase();
        const b = right[key].toLowerCase();
        return a.localeCompare(b) * dimSortDir;
      }

      const a = getSortableNumber(left);
      const b = getSortableNumber(right);

      if (a === null && b === null) {
        return 0;
      }

      if (a === null) {
        return 1;
      }

      if (b === null) {
        return -1;
      }

      return (a - b) * dimSortDir;
    });

    return filtered;
  }, [dimScope, dimSearch, dimSortCol, dimSortDir, dimensionStats]);

  const keptDimKeySet = useMemo(() => {
    if (!dimensionStats || dimensionStats.keptKeys.length === 0) {
      return null;
    }

    return new Set(dimensionStats.keptKeys);
  }, [dimensionStats]);

  const entryExitStats = useMemo(() => {
    if (!isEntryExitBacktestTabActive) {
      return {
        entry: [] as Array<[string, number]>,
        exit: [] as Array<[string, number]>
      };
    }

    const entryCounts: Record<string, number> = {};
    const exitCounts: Record<string, number> = {};

    for (const trade of deferredBacktestAnalyticsTrades) {
      const entryKey = trade.entrySource || "Unknown";
      const exitKey = trade.exitReason || "None";
      entryCounts[entryKey] = (entryCounts[entryKey] ?? 0) + 1;
      exitCounts[exitKey] = (exitCounts[exitKey] ?? 0) + 1;
    }

    const toSorted = (counts: Record<string, number>) => {
      return Object.entries(counts).sort((left, right) => right[1] - left[1]);
    };

    return {
      entry: toSorted(entryCounts),
      exit: toSorted(exitCounts)
    };
  }, [deferredBacktestAnalyticsTrades, isEntryExitBacktestTabActive]);

  const entryExitChartData = useMemo(() => {
    const toRows = (source: Array<[string, number]>) => {
      const total = source.reduce((sum, [, count]) => sum + count, 0);
      return source.map(([bucket, count]) => ({
        bucket,
        count,
        share: total > 0 ? (count / total) * 100 : 0
      }));
    };

    return {
      entry: toRows(entryExitStats.entry),
      exit: toRows(entryExitStats.exit)
    };
  }, [entryExitStats]);

  const runPropFirm = () => {
    if (backtestTrades.length === 0) {
      setPropResult(null);
      setPropStats(null);
      return;
    }

    const propInitBalance = Math.max(0, propInitialBalance);
    const normalizedDailyMaxLoss = Math.max(0, propDailyMaxLoss);
    const normalizedTotalMaxLoss = Math.max(0, propTotalMaxLoss);
    const normalizedProfitTarget = Math.max(0, propProfitTarget);

    const computeAvgTradeGap = () => {
      const timestamps = backtestTrades
        .map((trade) => Number(trade.entryTime || trade.exitTime) * 1_000)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);

      if (timestamps.length < 2) {
        return 1;
      }

      let totalGap = 0;

      for (let index = 1; index < timestamps.length; index += 1) {
        totalGap += timestamps[index]! - timestamps[index - 1]!;
      }

      const avgMinutes = totalGap / (timestamps.length - 1) / 60_000;
      return avgMinutes > 0 ? avgMinutes : 1;
    };

    const avgTradeGapMinutes = computeAvgTradeGap();
    const tradePnls = backtestTrades.map((trade) => trade.pnlUsd);

    if (tradePnls.length === 0) {
      setPropResult(null);
      setPropStats(null);
      return;
    }

    if (propProjectionMethod === "montecarlo") {
      const sims = 2_000;
      const scalingFactor = 500;
      const sampleRunCount = 10;
      let passCount = 0;
      let failCount = 0;
      let incompleteCount = 0;
      let sumTradesPass = 0;
      let sumTradesFail = 0;
      let sumWinRatePass = 0;
      let sumWinRateFail = 0;
      let sumWinRateOverall = 0;
      const finals: number[] = [];
      const sampleRuns: number[][] = [];

      for (let simulation = 0; simulation < sims; simulation += 1) {
        let balance = propInitBalance;
        let tradeCount = 0;
        let wins = 0;
        let achievedTarget = false;
        let failed = false;
        const progress = [propInitBalance];

        for (let index = 0; index < tradePnls.length; index += 1) {
          tradeCount += 1;
          const pnl = tradePnls[Math.floor(Math.random() * tradePnls.length)] ?? 0;

          if (pnl > 0) {
            wins += 1;
          }

          balance += pnl;
          progress.push(balance);

          if (normalizedTotalMaxLoss > 0 && propInitBalance - balance > normalizedTotalMaxLoss) {
            failed = true;
            break;
          }

          if (balance - propInitBalance >= normalizedProfitTarget) {
            achievedTarget = true;
            break;
          }
        }

        const winRate = tradeCount > 0 ? wins / tradeCount : 0;
        sumWinRateOverall += winRate;

        if (achievedTarget) {
          passCount += 1;
          sumTradesPass += tradeCount;
          sumWinRatePass += winRate;
        } else if (failed) {
          failCount += 1;
          sumTradesFail += tradeCount;
          sumWinRateFail += winRate;
        } else {
          incompleteCount += 1;
        }

        finals.push(balance - propInitBalance);

        if (sampleRuns.length < sampleRunCount) {
          sampleRuns.push(progress);
        } else {
          const replaceIndex = Math.floor(Math.random() * (simulation + 1));

          if (replaceIndex < sampleRunCount) {
            sampleRuns[replaceIndex] = progress;
          }
        }
      }

      const consideredSims = passCount + failCount;
      const probability = consideredSims > 0 ? passCount / consideredSims : 0;
      const maxLength = sampleRuns.reduce((max, run) => Math.max(max, run.length), 0);
      const randomProgressRuns = sampleRuns.map((run) => {
        const padded: PropFirmChartPoint[] = [];
        let lastBalance = run.length > 0 ? run[run.length - 1]! : propInitBalance;

        for (let index = 0; index < maxLength; index += 1) {
          const balance = run[index] ?? lastBalance;
          lastBalance = balance;
          padded.push({ x: index, y: balance });
        }

        return padded;
      });

      setPropResult({ probability, data: finals });
      setPropStats({
        avgTradesPass: passCount > 0 ? sumTradesPass / passCount : 0,
        avgTradesFail: failCount > 0 ? sumTradesFail / failCount : 0,
        avgTimePass: 0,
        avgTimeFail: 0,
        avgWinRatePass: passCount > 0 ? sumWinRatePass / passCount : 0,
        avgWinRateFail: failCount > 0 ? sumWinRateFail / failCount : 0,
        avgWinRateOverall: sims > 0 ? sumWinRateOverall / sims : 0,
        passCount: passCount * scalingFactor,
        failCount: failCount * scalingFactor,
        incompleteCount: incompleteCount * scalingFactor,
        totalSimulations: sims * scalingFactor,
        randomProgressRuns,
        minX: 0,
        maxX: maxLength > 0 ? maxLength - 1 : 0
      });
      return;
    }

    const sortedTrades = [...backtestTrades].sort(
      (left, right) =>
        Number(left.entryTime || left.exitTime) - Number(right.entryTime || right.exitTime)
    );
    const firstTradeDateMs = sortedTrades.reduce<number | null>((earliest, trade) => {
      const tradeMs = Number(trade.entryTime || trade.exitTime) * 1_000;

      if (!Number.isFinite(tradeMs)) {
        return earliest;
      }

      const dayStart = new Date(tradeMs);
      dayStart.setHours(0, 0, 0, 0);
      const normalizedMs = dayStart.getTime();

      if (earliest === null || normalizedMs < earliest) {
        return normalizedMs;
      }

      return earliest;
    }, null);
    const startDayMs = firstTradeDateMs ?? Date.now();
    const endDay = new Date();
    endDay.setDate(endDay.getDate() - 1);
    endDay.setHours(0, 0, 0, 0);
    const lastStartMs = endDay.getTime();
    const startTimes: number[] = [];

    for (let cursor = startDayMs; cursor <= lastStartMs; cursor += 86_400_000) {
      startTimes.push(cursor);
    }

    let passCount = 0;
    let failCount = 0;
    let incompleteCount = 0;
    let sumTradesPass = 0;
    let sumTradesFail = 0;
    let sumTimePass = 0;
    let sumTimeFail = 0;
    let sumWinRatePass = 0;
    let sumWinRateFail = 0;
    let sumWinRateOverall = 0;
    const finals: number[] = [];
    const allProgress: number[][] = [];
    const allTimeProgress: number[][] = [];
    const allThresholdTimes: number[][] = [];
    const allThresholdValues: number[][] = [];
    const usedStartTimes: number[] = [];

    for (const startMs of startTimes) {
      let balance = propInitBalance;
      let dailyPnl = 0;
      let currentSessionKey: number | null = null;
      let tradeCount = 0;
      let wins = 0;
      let achievedTarget = false;
      let failed = false;
      let endTimeMs: number | null = null;
      let hasValidTime = false;
      const progress: number[] = [];
      const timeProgress: number[] = [];
      const thresholdTimes = [0];
      const thresholdValues = [propInitBalance - normalizedDailyMaxLoss];
      let currentThreshold = propInitBalance - normalizedDailyMaxLoss;

      for (const trade of sortedTrades) {
        const tradeMs = Number(trade.entryTime || trade.exitTime) * 1_000;

        if (!Number.isFinite(tradeMs) || tradeMs < startMs) {
          continue;
        }

        const tradeDate = new Date(tradeMs);
        const sessionStart = new Date(tradeDate);
        sessionStart.setHours(14, 0, 0, 0);

        if (tradeDate.getTime() < sessionStart.getTime()) {
          sessionStart.setDate(sessionStart.getDate() - 1);
        }

        const sessionKey = sessionStart.getTime();

        if (currentSessionKey === null || sessionKey !== currentSessionKey) {
          currentSessionKey = sessionKey;
          dailyPnl = 0;
          const relativeMinutes = (tradeMs - startMs) / 60_000;

          if (relativeMinutes >= 0 && relativeMinutes > thresholdTimes[thresholdTimes.length - 1]!) {
            currentThreshold = balance - normalizedDailyMaxLoss;
            thresholdTimes.push(relativeMinutes);
            thresholdValues.push(currentThreshold);
          }
        }

        tradeCount += 1;

        if (trade.pnlUsd > 0) {
          wins += 1;
        }

        dailyPnl += trade.pnlUsd;
        balance += trade.pnlUsd;
        progress.push(balance);
        timeProgress.push((tradeMs - startMs) / 60_000);
        hasValidTime = true;
        endTimeMs = tradeMs;

        if (normalizedDailyMaxLoss > 0 && dailyPnl < -normalizedDailyMaxLoss) {
          failed = true;
          break;
        }

        if (normalizedTotalMaxLoss > 0 && propInitBalance - balance > normalizedTotalMaxLoss) {
          failed = true;
          break;
        }

        if (balance - propInitBalance >= normalizedProfitTarget) {
          achievedTarget = true;
          break;
        }
      }

      if (tradeCount === 0) {
        continue;
      }

      const timeSpent =
        hasValidTime && endTimeMs != null
          ? (endTimeMs - startMs) / 60_000
          : tradeCount * avgTradeGapMinutes;
      const winRate = tradeCount > 0 ? wins / tradeCount : 0;
      sumWinRateOverall += winRate;

      if (achievedTarget) {
        passCount += 1;
        sumTradesPass += tradeCount;
        sumTimePass += timeSpent;
        sumWinRatePass += winRate;
      } else if (failed) {
        failCount += 1;
        sumTradesFail += tradeCount;
        sumTimeFail += timeSpent;
        sumWinRateFail += winRate;
      } else {
        incompleteCount += 1;
      }

      finals.push(balance - propInitBalance);
      allProgress.push(progress);
      allTimeProgress.push(timeProgress);
      allThresholdTimes.push(thresholdTimes);
      allThresholdValues.push(thresholdValues);
      usedStartTimes.push(startMs);
    }

    const consideredSims = passCount + failCount;
    const probability = consideredSims > 0 ? passCount / consideredSims : 0;
    const randomProgressRuns: PropFirmChartPoint[][] = [];
    let dailyLossRun: PropFirmChartPoint[] | undefined;
    const usedIndexes = new Set<number>();

    while (randomProgressRuns.length < 1 && allProgress.length > 0) {
      const sampleIndex = Math.floor(Math.random() * allProgress.length);

      if (usedIndexes.has(sampleIndex)) {
        continue;
      }

      usedIndexes.add(sampleIndex);
      const balances = allProgress[sampleIndex] ?? [];
      const timesMinutes = allTimeProgress[sampleIndex] ?? [];

      if (timesMinutes.length === 0) {
        continue;
      }

      const totalHours = Math.ceil((timesMinutes[timesMinutes.length - 1] ?? 0) / 60);
      const sampledStartMs = usedStartTimes[sampleIndex] ?? Date.now();
      let tradeIndex = 0;
      let currentBalance = propInitBalance;
      const hourlyPoints: PropFirmChartPoint[] = [];
      const hourlyThresholdPoints: PropFirmChartPoint[] = [];
      const thresholdTimes = allThresholdTimes[sampleIndex] ?? [];
      const thresholdValues = allThresholdValues[sampleIndex] ?? [];
      let thresholdIndex = 0;

      for (let hour = 0; hour <= totalHours; hour += 1) {
        const hourMinutes = hour * 60;

        while (tradeIndex < timesMinutes.length && (timesMinutes[tradeIndex] ?? Infinity) <= hourMinutes) {
          currentBalance = balances[tradeIndex] ?? currentBalance;
          tradeIndex += 1;
        }

        const x = sampledStartMs + hourMinutes * 60_000;
        hourlyPoints.push({ x, y: currentBalance });

        while (
          thresholdIndex + 1 < thresholdTimes.length &&
          (thresholdTimes[thresholdIndex + 1] ?? Infinity) <= hourMinutes
        ) {
          thresholdIndex += 1;
        }

        const thresholdValue =
          thresholdValues.length > 0
            ? thresholdValues[Math.min(thresholdIndex, thresholdValues.length - 1)]!
            : propInitBalance - normalizedDailyMaxLoss;
        hourlyThresholdPoints.push({ x, y: thresholdValue });
      }

      randomProgressRuns.push(hourlyPoints);
      dailyLossRun = hourlyThresholdPoints;
    }

    const minX = randomProgressRuns.reduce((currentMin, run) => {
      if (run.length === 0) {
        return currentMin;
      }

      return Math.min(currentMin, run[0]!.x);
    }, Number.POSITIVE_INFINITY);
    const maxX = randomProgressRuns.reduce((currentMax, run) => {
      if (run.length === 0) {
        return currentMax;
      }

      return Math.max(currentMax, run[run.length - 1]!.x);
    }, 0);

    setPropResult({ probability, data: finals });
    setPropStats({
      avgTradesPass: passCount > 0 ? sumTradesPass / passCount : 0,
      avgTradesFail: failCount > 0 ? sumTradesFail / failCount : 0,
      avgTimePass: passCount > 0 ? sumTimePass / passCount : 0,
      avgTimeFail: failCount > 0 ? sumTimeFail / failCount : 0,
      avgWinRatePass: passCount > 0 ? sumWinRatePass / passCount : 0,
      avgWinRateFail: failCount > 0 ? sumWinRateFail / failCount : 0,
      avgWinRateOverall:
        consideredSims + incompleteCount > 0
          ? sumWinRateOverall / (consideredSims + incompleteCount)
          : 0,
      passCount,
      failCount,
      incompleteCount,
      totalSimulations: consideredSims + incompleteCount,
      randomProgressRuns,
      dailyLossRun,
      minX: Number.isFinite(minX) ? minX : 0,
      maxX
    });
  };

  const propLineChart = useMemo(() => {
    if (!isPropFirmBacktestTabActive || !propStats || propStats.randomProgressRuns.length === 0) {
      return null;
    }

    const minX = propStats.minX;
    const maxX = propStats.maxX <= propStats.minX ? propStats.minX + 1 : propStats.maxX;
    const minY =
      propProjectionMethod === "montecarlo"
        ? propInitialBalance - Math.abs(propTotalMaxLoss)
        : propInitialBalance - Math.abs(propTotalMaxLoss) - Math.abs(propDailyMaxLoss);
    const maxY = Math.max(minY + 1, propInitialBalance + Math.abs(propProfitTarget));
    const palette = [
      "rgba(59, 130, 246, 0.95)",
      "rgba(16, 185, 129, 0.9)",
      "rgba(249, 115, 22, 0.9)",
      "rgba(139, 92, 246, 0.9)",
      "rgba(239, 68, 68, 0.9)",
      "rgba(20, 184, 166, 0.9)",
      "rgba(250, 204, 21, 0.9)",
      "rgba(236, 72, 153, 0.9)"
    ];

    return {
      targetLineY: projectPropFirmLineY(propInitialBalance + Math.abs(propProfitTarget), minY, maxY),
      totalLossLineY: projectPropFirmLineY(propInitialBalance - Math.abs(propTotalMaxLoss), minY, maxY),
      dailyLossPath:
        propProjectionMethod !== "montecarlo" && propStats.dailyLossRun
          ? buildPropFirmLinePath(propStats.dailyLossRun, minX, maxX, minY, maxY)
          : "",
      paths: propStats.randomProgressRuns.map((run, index) => ({
        color: palette[index % palette.length]!,
        path: buildPropFirmLinePath(run, minX, maxX, minY, maxY)
      }))
    };
  }, [
    propDailyMaxLoss,
    propInitialBalance,
    propProfitTarget,
    propProjectionMethod,
    propStats,
    propTotalMaxLoss,
    isPropFirmBacktestTabActive
  ]);

  useEffect(() => {
    if (!isCalendarBacktestTabActive) {
      return;
    }

    setSelectedBacktestMonthKey((current) => {
      if (current) {
        return current;
      }

      return availableBacktestMonths[0] ?? getCurrentTradeMonthKey();
    });
  }, [availableBacktestMonths, isCalendarBacktestTabActive]);

  useEffect(() => {
    if (!isCalendarBacktestTabActive) {
      return;
    }

    setSelectedBacktestDateKey((current) => {
      if (visibleBacktestDateKeys.length === 0) {
        return "";
      }

      return visibleBacktestDateKeys.includes(current) ? current : visibleBacktestDateKeys[0];
    });
  }, [isCalendarBacktestTabActive, visibleBacktestDateKeys]);

  const statsRefreshSecondsRemaining = Math.max(
    0,
    ((100 - clamp(statsRefreshProgress, 0, 100)) / 100) * (STATS_REFRESH_HOLD_MS / 1000)
  );
  const statsRefreshDisplayProgress = clamp(statsRefreshProgress, 0, 100);

  return (
    <main className="terminal">
      <div className="surface-strip">
        <span className="site-tag surface-brand">Korra&apos;s Space</span>
        <nav className="surface-tabs" aria-label="primary views">
          {surfaceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`surface-tab ${selectedSurfaceTab === tab.id ? "active" : ""}`}
              onClick={() => {
                if (tab.id === "backtest" && selectedSurfaceTab !== "backtest") {
                  setIsBacktestSurfaceSettled(false);
                }

                setSelectedSurfaceTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="top-utility surface-actions">
          <input
            ref={settingsFileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleLoadFromFile}
          />
          <div ref={presetMenuRef} style={{ display: "contents" }}>
            <div className="preset-wrap">
              <button
                type="button"
                className="settings-io-btn"
                aria-label="Save preset"
                onClick={() => setPresetMenuOpen((v) => (v === "save" ? null : "save"))}
              >
                <svg className="settings-io-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                  <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                <span className="settings-io-label">Save</span>
              </button>
              {presetMenuOpen === "save" ? (
                <div className="preset-popover">
                  <div className="preset-popover-header">Save Preset</div>
                  <div className="preset-save-row">
                    <input
                      className="preset-name-input"
                      placeholder="Preset name…"
                      value={presetNameInput}
                      onChange={(e) => setPresetNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); }}
                      autoFocus
                    />
                    <button type="button" className="preset-confirm-btn" onClick={handleSavePreset}>Save</button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="preset-wrap">
              <button
                type="button"
                className="settings-io-btn"
                aria-label="Load preset"
                onClick={() => setPresetMenuOpen((v) => (v === "load" ? null : "load"))}
              >
                <svg className="settings-io-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 15V3m0 0l-4 4m4-4l4 4" />
                  <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                <span className="settings-io-label">Load</span>
              </button>
              {presetMenuOpen === "load" ? (
                <div className="preset-popover">
                  <div className="preset-popover-header">Load Preset</div>
                  {savedPresets.length === 0 ? (
                    <div className="preset-empty">No saved presets</div>
                  ) : (
                    <div className="preset-list">
                      {savedPresets.map((p) => (
                        <div key={p.name} className="preset-item">
                          <button type="button" className="preset-item-btn" onClick={() => handleLoadPreset(p)}>
                            <span className="preset-item-name">{p.name}</span>
                            <span className="preset-item-date">{new Date(p.savedAt).toLocaleDateString()}</span>
                          </button>
                          <button type="button" className="preset-delete-btn" onClick={(e) => handleDeletePreset(p.name, e)} aria-label={`Delete ${p.name}`}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="settings-io-btn settings-io-reset"
            aria-label="Reset settings"
            onClick={handleResetSettings}
          >
            <svg className="settings-io-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 1 2.636 6.364" />
              <path d="M3 21v-6h6" />
            </svg>
            <span className="settings-io-label">Reset</span>
          </button>
          <div className="settings-io-divider" />
          <button
            type="button"
            className="settings-io-btn settings-io-file"
            aria-label="Save to file"
            onClick={handleSaveToFile}
          >
            <svg className="settings-io-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 18 15 15" />
            </svg>
            <span className="settings-io-label">File ↓</span>
          </button>
          <button
            type="button"
            className="settings-io-btn settings-io-file"
            aria-label="Load from file"
            onClick={() => settingsFileInputRef.current?.click()}
          >
            <svg className="settings-io-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="12" x2="12" y2="18" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
            <span className="settings-io-label">File ↑</span>
          </button>
          <div className="notif-wrap" ref={notificationRef}>
            <button
              type="button"
              className="notif-btn"
              aria-label="notifications"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <svg className="notif-icon" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M7 10.5a5 5 0 0 1 10 0v4.3l1.5 2.2H5.5L7 14.8v-4.3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 19a2 2 0 0 0 4 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {unreadNotificationCount > 0 ? (
                <span className="notif-badge">{Math.min(9, unreadNotificationCount)}</span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="notif-popover">
                <div className="notif-head">
                  <strong>Live Activity</strong>
                  <span>{notificationItems.length} events</span>
                </div>
                <ul className="notif-list">
                  {notificationItems.map((item) => (
                    <li key={item.id} className="notif-item">
                      <span className={`notif-dot ${item.tone}`} aria-hidden />
                      <div className="notif-copy">
                        <span className="notif-title">{item.title}</span>
                        <span className="notif-details">{item.details}</span>
                      </div>
                      <span className="notif-time">{item.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <header className="topbar">
        <div className="brand-area">
          <div className="asset-meta">
            <h1>{selectedAsset.symbol}</h1>
            <p>{selectedAsset.name}</p>
          </div>
          <div className="live-quote">
            {latestCandle ? (
              <>
                <span className={quoteChange >= 0 ? "up" : "down"}>${formatPrice(latestCandle.close)}</span>
                <div className="tf-changes">
                  {timeframeChanges.map(({ timeframe, change }) => (
                    <span
                      key={timeframe}
                      className={`tf-change ${change === null ? "neutral" : change >= 0 ? "up" : "down"}${timeframe === selectedTimeframe ? " tf-active" : ""}`}
                    >
                      <span className="tf-label">{timeframe}</span>
                      <span className={change === null ? "" : change >= 0 ? "up" : "down"}>
                        {change !== null
                          ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
                          : "\u2014"}
                      </span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <span>No market data</span>
            )}
          </div>
        </div>

        <div className="top-controls">
          <nav className="timeframe-row" aria-label="timeframes">
            {timeframes.map((timeframe) => (
              <button
                key={timeframe}
                type="button"
                className={`timeframe ${timeframe === selectedTimeframe ? "active" : ""}`}
                onClick={() => setSelectedTimeframe(timeframe)}
              >
                {timeframe}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <section className="surface-stage">
        <div className={`surface-view ${selectedSurfaceTab === "chart" ? "" : "hidden"}`}>
          <section className={`workspace ${panelExpanded ? "" : "panel-collapsed"}`}>
            <section className="chart-wrap">
              <div className="chart-toolbar">
                {hoveredCandle ? (
                  <>
                    {(() => {
                      const display = hoveredTime ? hoveredCandle : latestCandle ?? hoveredCandle;
                      const displayIndex = selectedCandles.indexOf(display);
                      const prevCandle = displayIndex > 0 ? selectedCandles[displayIndex - 1] : null;
                      const prevBullish = prevCandle ? prevCandle.close >= prevCandle.open : display.close >= display.open;
                      const currentBullish = display.close >= display.open;
                      const openCls = prevBullish ? "ohlc-up" : "ohlc-down";
                      const closeCls = currentBullish ? "ohlc-up" : "ohlc-down";
                      return (
                        <>
                          <span className={openCls}>
                            O <strong>{formatPrice(display.open)}</strong>
                          </span>
                          <span className="ohlc-up">
                            H <strong>{formatPrice(display.high)}</strong>
                          </span>
                          <span className="ohlc-down">
                            L <strong>{formatPrice(display.low)}</strong>
                          </span>
                          <span className={closeCls}>
                            C <strong>{formatPrice(display.close)}</strong>
                          </span>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <span>No market data loaded</span>
                )}
              </div>
              <div className="chart-stage">
                <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
                <div ref={countdownOverlayRef} className="candle-countdown-overlay" />
                <button
                  type="button"
                  className="chart-reset-btn"
                  onClick={resetChart}
                  title="Reset chart view (⌥R)"
                >
                  Reset Chart
                </button>
              </div>
            </section>

            <aside className={`side-panel ${panelExpanded ? "expanded" : "collapsed"}`}>
              <nav className="panel-rail" aria-label="sidebar tabs">
                {sidebarTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rail-btn ${activePanelTab === tab.id ? "active" : ""}`}
                    onClick={() => {
                      if (panelExpanded && activePanelTab === tab.id) {
                        setPanelExpanded(false);
                        return;
                      }

                      setActivePanelTab(tab.id);
                      setPanelExpanded(true);
                    }}
                    title={tab.label}
                    aria-label={tab.label}
                  >
                    <TabIcon tab={tab.id} />
                    <span className="rail-label">{tab.label}</span>
                  </button>
                ))}
              </nav>

              {panelExpanded ? (
                <div className="panel-content">
                  {activePanelTab === "active" ? (
                    <div className="tab-view active-tab">
                      <div className="watchlist-head with-action">
                        <div>
                          <h2>Active Trade</h2>
                          <p>Latest position from backtest · {backtestModelSelectionSummary}</p>
                        </div>
                        <button
                          type="button"
                          className="panel-action-btn"
                          disabled={!activeTrade}
                          onClick={() => {
                            if (!activeTrade) {
                              return;
                            }

                            setSelectedSymbol(activeTrade.symbol);
                            setShowAllTradesOnChart(false);
                            setShowActiveTradeOnChart((current) => !current);
                            setSelectedHistoryId(null);
                            focusTradeIdRef.current = null;
                          }}
                        >
                          {showActiveTradeOnChart ? "Hide On Chart" : "Show On Chart"}
                        </button>
                      </div>

                      {activeTrade ? (
                        <div className="active-card">
                          <div className="active-card-top">
                            <div>
                              <span
                                className={`active-side ${
                                  activeTrade.side === "Long" ? "up" : "down"
                                }`}
                              >
                                {activeTrade.side}
                              </span>
                              <h3>{activeTrade.symbol}</h3>
                            </div>
                            <span className="active-live-tag">Live</span>
                          </div>

                          <div className="active-pnl">
                            <span>Unrealized PnL</span>
                            <strong className={activeTrade.pnlValue >= 0 ? "up" : "down"}>
                              {activeTrade.pnlValue >= 0 ? "+" : "-"}$
                              {formatUsd(Math.abs(activeTrade.pnlValue))}
                            </strong>
                            <small className={activeTrade.pnlPct >= 0 ? "up" : "down"}>
                              {activeTrade.pnlPct >= 0 ? "+" : ""}
                              {activeTrade.pnlPct.toFixed(2)}%
                            </small>
                          </div>

                          <div className="active-metrics-grid">
                            <div className="active-metric">
                              <span>Entry</span>
                              <strong>{formatPrice(activeTrade.entryPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Mark</span>
                              <strong>{formatPrice(activeTrade.markPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>TP</span>
                              <strong className="up">{formatPrice(activeTrade.targetPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>SL</span>
                              <strong className="down">{formatPrice(activeTrade.stopPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Size</span>
                              <strong>{formatUnits(activeTrade.units)} units</strong>
                            </div>
                            <div className="active-metric">
                              <span>R:R</span>
                              <strong>1:{activeTrade.rr.toFixed(2)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Opened</span>
                              <strong>{activeTrade.openedAtLabel}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Duration</span>
                              <strong>{activeTrade.elapsed}</strong>
                            </div>
                          </div>

                          <div className="active-progress">
                            <div className="active-progress-head">
                              <span>Progress To TP</span>
                              <span>{activeTrade.progressPct.toFixed(1)}%</span>
                            </div>
                            <div className="active-progress-track">
                              <div
                                className="active-progress-fill"
                                style={{ width: `${activeTrade.progressPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="ai-placeholder">
                          <p>
                            No current active trade.
                            {latestTradeBarsAgo !== null
                              ? ` The latest trade was ${latestTradeBarsAgo} bar${latestTradeBarsAgo !== 1 ? "s" : ""} ago.`
                              : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {activePanelTab === "assets" ? (
                    <div className="tab-view">
                      <div className="watchlist-head">
                        <div>
                          <h2>XAUUSD</h2>
                          <p>OANDA history + market live feed</p>
                        </div>
                      </div>

                      <ul className="watchlist-body">
                        <li className="watchlist-labels" aria-hidden>
                          <span>Symbol</span>
                          <span>Last</span>
                          <span>Chg%</span>
                        </li>
                        {watchlistRows.map((row) => (
                          <li key={row.symbol}>
                            <button
                              type="button"
                              className={`watchlist-row ${
                                row.symbol === selectedSymbol ? "selected" : ""
                              }`}
                              onClick={() => setSelectedSymbol(row.symbol)}
                            >
                              <span className="symbol-col">
                                <span>{row.symbol}</span>
                                <small>{row.name}</small>
                              </span>

                              <span className="num-col">
                                {row.lastPrice === null ? "N/A" : formatPrice(row.lastPrice)}
                              </span>
                              <span
                                className={`num-col ${
                                  row.change === null ? "" : row.change >= 0 ? "up" : "down"
                                }`}
                              >
                                {row.change === null
                                  ? "N/A"
                                  : `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "mt5" ? (
                    <div className="tab-view copytrade-tab">
                      <div className="watchlist-head">
                        <div>
                          <h2>Copy Trade</h2>
                        </div>
                      </div>
                      <div className="copytrade-body">
                        <div className="copytrade-form" aria-label="MT5 credentials form">
                          <label className="copytrade-field">
                            <span>MT5 Login</span>
                            <input
                              className="copytrade-input"
                              type="text"
                              name="mt5-login"
                              placeholder="Account number"
                              autoComplete="username"
                            />
                          </label>

                          <label className="copytrade-field">
                            <span>MT5 Password</span>
                            <input
                              className="copytrade-input"
                              type="password"
                              name="mt5-password"
                              placeholder="Password"
                              autoComplete="current-password"
                            />
                          </label>

                          <label className="copytrade-field">
                            <span>Server</span>
                            <input
                              className="copytrade-input"
                              type="text"
                              name="mt5-server"
                              placeholder="Broker server"
                              autoComplete="off"
                            />
                          </label>
                        </div>

                        <button type="button" className="panel-action-btn copytrade-submit" disabled>
                          Connect MT5
                        </button>

                      </div>
                    </div>
                  ) : null}

                  {activePanelTab === "history" ? (
                    <div className="tab-view">
                      <div className="watchlist-head with-action">
                        <div>
                          <h2>History</h2>
                          <p>Filtered by current Backtest settings · {backtestModelSelectionSummary}</p>
                        </div>
                        <button
                          type="button"
                          className="panel-action-btn"
                          onClick={() => {
                            const next = !showAllTradesOnChart;
                            setShowAllTradesOnChart(next);
                            setShowActiveTradeOnChart(false);
                            focusTradeIdRef.current = null;

                            if (next) {
                              setSelectedHistoryId(null);
                            }
                          }}
                        >
                          {showAllTradesOnChart ? "Hide All On Chart" : "Show All On Chart"}
                        </button>
                      </div>
                      <ul className="history-list">
                        {chartPanelHistoryRows.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`history-row ${
                                selectedHistoryId === item.id ? "selected" : ""
                              }`}
                              onClick={() => selectTradeOnChart(item.id, item.symbol)}
                            >
                              <span className="history-info">
                                <span className="history-main">
                                  <span
                                    className={`history-action ${
                                      item.pnlUsd < 0 ? "down" : "up"
                                    }`}
                                  >
                                    {formatSignedUsd(item.pnlUsd)}
                                  </span>
                                  <span className="history-symbol">{item.symbol}</span>
                                </span>
                                <span className="history-levels">
                                  {item.side === "Long" ? "Buy" : "Sell"}{" "}
                                  {formatPrice(item.entryPrice)} | TP{" "}
                                  {formatPrice(item.targetPrice)} | SL{" "}
                                  {formatPrice(item.stopPrice)}
                                </span>
                              </span>
                              <span className="history-meta">
                                <span className={item.pnlPct < 0 ? "down" : "up"}>
                                  {item.pnlPct >= 0 ? "+" : ""}
                                  {item.pnlPct.toFixed(2)}%
                                </span>
                                <span>{item.time}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "actions" ? (
                    <div className="tab-view">
                      <div className="watchlist-head">
                        <div>
                          <h2>Action</h2>
                          <p>Entry, SL, TP, and exits · {backtestModelSelectionSummary}</p>
                        </div>
                      </div>
                      <ul className="history-list">
                        {actionRows.map((action) => (
                          <li key={action.id}>
                            <button
                              type="button"
                              className={`history-row ${
                                selectedHistoryId === action.tradeId ? "selected" : ""
                              }`}
                              onClick={() => selectTradeOnChart(action.tradeId, action.symbol)}
                            >
                              <span className="history-info">
                                <span className="history-main">
                                  <span className="history-action">{action.label}</span>
                                  <span className="history-symbol">{action.symbol}</span>
                                </span>
                                <span className="history-levels">{action.details}</span>
                              </span>
                              <span className="history-meta">
                                <span>{action.time}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "ai" ? (
                    <div className="tab-view ai-tab">
                      <div className="watchlist-head">
                        <div>
                          <h2>AI</h2>
                          <p>Assistant module</p>
                        </div>
                      </div>
                      <div className="ai-placeholder">
                        <p>AI panel is reserved for upcoming features.</p>
                        <p>No actions are connected yet.</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </section>
        </div>

        {selectedSurfaceTab === "backtest" ? (
          <section className="backtest-surface" aria-label="backtest workspace">
            <div className="backtest-shell">
              <div className="backtest-card compact">
                <div className="backtest-card-head backtest-stats-head">
                  <div>
                    <h3>Backtest Date Range</h3>
                  </div>

                  <div className="backtest-stats-range" aria-label="global backtest date range">
                    <input
                      type="date"
                      value={statsDateStart}
                      onChange={(event) => setStatsDateStart(event.target.value)}
                      className="backtest-date-input"
                      aria-label="global backtest start date"
                    />
                    <span className="backtest-stats-range-arrow">-&gt;</span>
                    <input
                      type="date"
                      value={statsDateEnd}
                      onChange={(event) => setStatsDateEnd(event.target.value)}
                      className="backtest-date-input"
                      aria-label="global backtest end date"
                    />
                    {(statsDateStart || statsDateEnd) && (
                      <button
                        type="button"
                        className="backtest-range-clear"
                        onClick={() => {
                          setStatsDateStart("");
                          setStatsDateEnd("");
                        }}
                      >
                        All
                      </button>
                    )}
                  </div>
                </div>
                <div className="backtest-toolbar-note">
                  Active range: <strong>{backtestDateRangeLabel}</strong> · Visible trades:{" "}
                  <strong>{backtestTrades.length}</strong>
                </div>
              </div>

              <nav className="backtest-tabs" aria-label="backtest modules">
                {backtestTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`backtest-tab ${selectedBacktestTab === tab.id ? "active" : ""}`}
                    onClick={() => setSelectedBacktestTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <section className="backtest-panel">
                {!isBacktestSurfaceSettled ? (
                  <div className="backtest-empty">
                    <h3>Preparing Backtest</h3>
                    <p>
                      Applying the selected date range and staging the heavier panels so Chrome
                      stays responsive.
                    </p>
                    <div
                      className="backtest-loading-progress-shell"
                      role="progressbar"
                      aria-label="Preparing backtest view"
                      aria-valuetext="Preparing backtest modules"
                    >
                      <div className="backtest-loading-progress-bar" />
                    </div>
                  </div>
                ) : (
                  <>
              {backtestDateFilteredTrades.length === 0 && backtestModelProfiles.length === 0 ? (
                <div className="backtest-empty">
                  <h3>No models selected</h3>
                  <p>
                    Open Settings and enable at least one model in the MODELS panel. The
                    Chart tab now follows that Backtest selection automatically.
                  </p>
                </div>
              ) : backtestDateFilteredTrades.length === 0 && backtestSourceTrades.length > 0 ? (
                <div className="backtest-empty">
                  <h3>No trades in the selected date range</h3>
                  <p>
                    Move the Backtest Date Range above, or clear it to load the full simulated
                    trade history again.
                  </p>
                </div>
              ) : null}

              {selectedBacktestTab === "mainStats" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <div className="backtest-card-head backtest-stats-head">
                      <div>
                        <h3>{mainStatsTitle}</h3>
                      </div>

                      <div ref={statsTimeframeDdRef} className="stats-timeframe-wrap">
                        <button
                          type="button"
                          className="stats-timeframe-trigger"
                          onClick={() => setStatsTimeframeDdOpen((o) => !o)}
                          aria-haspopup="listbox"
                          aria-expanded={statsTimeframeDdOpen}
                          aria-label="Select backtest timeframe"
                        >
                          {TIMEFRAME_DISPLAY_LABELS[selectedTimeframe]}
                          <span className="stats-timeframe-chevron" aria-hidden="true">
                            {statsTimeframeDdOpen ? "▴" : "▾"}
                          </span>
                        </button>
                        {statsTimeframeDdOpen && (
                          <div
                            className="stats-timeframe-dd"
                            role="listbox"
                            aria-label="Backtest timeframe options"
                          >
                            {timeframes.map((tf) => (
                              <button
                                key={tf}
                                type="button"
                                role="option"
                                aria-selected={selectedTimeframe === tf}
                                className={`stats-timeframe-option${selectedTimeframe === tf ? " active" : ""}`}
                                onClick={() => {
                                  setSelectedTimeframe(tf);
                                  setStatsTimeframeDdOpen(false);
                                }}
                              >
                                {TIMEFRAME_DISPLAY_LABELS[tf]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="backtest-stats-grid">
                      {mainStatisticsCards.map((item) => {
                        const spanClassName =
                          item.span === 6
                            ? "stat-span-6"
                            : item.span === 4
                              ? "stat-span-4"
                              : item.span === 2
                                ? "stat-span-2"
                                : "";

                        if (item.children) {
                          return (
                            <div key={item.label} className="backtest-stat-group">
                              {item.children.map((child) => {
                                const childLabelClassName = [
                                  "backtest-stat-label",
                                  child.labelEmphasis ? "emphasized" : "",
                                  child.labelEmphasis ? `tone-${child.tone}` : ""
                                ]
                                  .filter(Boolean)
                                  .join(" ");

                                return (
                                  <div
                                    key={child.label}
                                    className={`backtest-stat-card ${
                                      child.tone === "neutral" ? "tone-neutral" : `tone-${child.tone}`
                                    }`}
                                  >
                                    <span className={childLabelClassName}>{child.label}</span>
                                    <strong
                                      className={child.tone === "neutral" ? "" : child.tone}
                                    >
                                      {child.value}
                                    </strong>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        const itemLabelClassName = [
                          "backtest-stat-label",
                          item.labelEmphasis ? "emphasized" : "",
                          item.labelEmphasis ? `tone-${item.tone}` : ""
                        ]
                          .filter(Boolean)
                          .join(" ");

                        return (
                          <div
                            key={item.label}
                            className={`backtest-stat-card ${
                              item.tone === "neutral" ? "tone-neutral" : `tone-${item.tone}`
                            } ${spanClassName}`}
                          >
                            <span className={itemLabelClassName}>{item.label}</span>
                            <strong
                              className={[
                                item.tone === "neutral" ? "" : item.tone,
                                item.valueClassName ?? ""
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {item.value}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "mainSettings" ? (
                <div className="backtest-grid" style={{ gap: "0.75rem" }}>
                  <div className="main-settings-kpi-strip" aria-label="AI rolling statistics">
                    <div className="main-settings-kpi-strip-track">
                      {[0, 1].map((sequenceIndex) => (
                        <div
                          key={sequenceIndex}
                          className="main-settings-kpi-strip-sequence"
                          aria-hidden={sequenceIndex === 1}
                        >
                          {appliedMainSettingsAiStats.map((item) => (
                            <article
                              key={`${sequenceIndex}-${item.label}`}
                              className="main-settings-kpi-card backtest-summary-card-animated"
                            >
                              <span>{item.label}</span>
                              <strong style={item.valueStyle}>{item.value}</strong>
                              <small>{item.meta}</small>
                            </article>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section main-settings-panel">
                        <div className="ai-zip-section-title">Core AI Controls</div>

                        <button
                          type="button"
                          className={`ai-zip-button feature ${aiMode !== "off" ? "active" : ""}`}
                          onClick={() => {
                            if (aiMode === "off") {
                              setAiMode("knn");
                              setAiFilterEnabled(true);
                              setAiModelEnabled(false);
                            } else if (aiFilterEnabled && !aiModelEnabled) {
                              setAiModelEnabled(true);
                              setAiFilterEnabled(false);
                            } else {
                              setAiMode("off");
                              setAiModelEnabled(false);
                              setAiFilterEnabled(false);
                              setConfidenceThreshold(0);
                            }
                          }}
                        >
                          Artificial Intelligence -{" "}
                          {aiMode === "off"
                            ? "OFF"
                            : aiFilterEnabled && !aiModelEnabled
                            ? "Filter"
                            : "Model"}
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${aiMode !== "off" ? "active" : ""}`}
                          disabled={aiMode === "off"}
                          onClick={() =>
                            setAiMode((current) =>
                              current === "knn" ? "hdbscan" : "knn"
                            )
                          }
                        >
                          Artificial Intelligence Type -{" "}
                          {aiMode === "off" ? "KNN" : aiMode.toUpperCase()}
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${useMitExit ? "active" : ""}`}
                          onClick={() => setUseMitExit((value) => !value)}
                        >
                          MIT Exit {useMitExit ? "· ON" : "· OFF"}
                        </button>

                        <button
                          type="button"
                          className="ai-zip-button"
                          disabled={aiDisabled}
                          onClick={() => setMethodSettingsOpen(true)}
                        >
                          Method Specific Settings
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${
                            staticLibrariesClusters ? "active success" : ""
                          }`}
                          disabled={aiMode === "off"}
                          onClick={() => setStaticLibrariesClusters((value) => !value)}
                        >
                          Static Libraries &amp; Clusters {staticLibrariesClusters ? "· ON" : "· OFF"}
                        </button>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Advanced AI Settings</div>

                        <div className={`ai-zip-control ${confidenceGateDisabled ? "disabled" : ""}`}>
                          <div className="ai-zip-label">AI Confidence Threshold</div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={effectiveConfidenceThreshold}
                            disabled={confidenceGateDisabled}
                            onChange={(event) => {
                              setConfidenceThreshold(clamp(Number(event.target.value) || 0, 0, 100));
                            }}
                            className="backtest-slider"
                            style={{ "--p": `${effectiveConfidenceThreshold}%` } as React.CSSProperties}
                          />
                          <div className="ai-zip-note">{effectiveConfidenceThreshold}</div>
                        </div>

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">AI Exit Strictness</div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={aiExitStrictness}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setAiExitStrictness(clamp(Number(event.target.value) || 0, 0, 100));
                            }}
                            className="backtest-slider"
                            style={{ "--p": `${aiExitStrictness}%` } as React.CSSProperties}
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "0 (OFF)"
                              : `${aiExitStrictness} (1 = lenient · 100 = aggressive)`}
                          </div>
                        </div>

                        <div
                          className={`ai-zip-control ${aiExitStrictness === 0 ? "disabled" : ""}`}
                        >
                          <div className="ai-zip-label">Win Tolerance</div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={aiExitWinTolerance}
                            disabled={aiExitStrictness === 0}
                            onChange={(event) => {
                              setAiExitWinTolerance(
                                clamp(Number(event.target.value) || 0, -100, 100)
                              );
                            }}
                            className="backtest-slider"
                            style={{ "--p": `${((aiExitWinTolerance + 100) / 200) * 100}%` } as React.CSSProperties}
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "Set AI Exit Strictness > 0 to enable"
                              : `${aiExitWinTolerance} (0 = neutral)`}
                          </div>
                        </div>

                        <div
                          className={`ai-zip-control ${aiExitStrictness === 0 ? "disabled" : ""}`}
                        >
                          <div className="ai-zip-label">Loss Tolerance</div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={aiExitLossTolerance}
                            disabled={aiExitStrictness === 0}
                            onChange={(event) => {
                              setAiExitLossTolerance(
                                clamp(Number(event.target.value) || 0, -100, 100)
                              );
                            }}
                            className="backtest-slider"
                            style={{ "--p": `${((aiExitLossTolerance + 100) / 200) * 100}%` } as React.CSSProperties}
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "Set AI Exit Strictness > 0 to enable"
                              : `${aiExitLossTolerance} (0 = neutral)`}
                          </div>
                        </div>

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Volatility Filter (keep top)</div>
                          <input
                            type="range"
                            min={0}
                            max={99}
                            step={1}
                            value={volatilityPercentile}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setVolatilityPercentile(
                                clamp(Number(event.target.value) || 0, 0, 99)
                              );
                            }}
                            className="backtest-slider"
                            style={{ "--p": `${(volatilityPercentile / 99) * 100}%` } as React.CSSProperties}
                          />
                          <div className="ai-zip-note">
                            {volatilityPercentile === 0
                              ? "0 (OFF)"
                              : `Keep top ${volatilityPercentile}%`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section-title">AI Data &amp; Embedding</div>
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        <div className="ai-zip-toggle-grid">
                          <button
                            type="button"
                            className={`ai-zip-button ${selectedAiModelCount > 0 ? "active" : ""}`}
                            disabled={aiDisabled}
                            onClick={() => setModelsModalOpen(true)}
                          >
                            Models ({selectedAiModelCount})
                          </button>
                          <button
                            type="button"
                            className={`ai-zip-button ${selectedAiFeatureCount > 0 ? "active" : ""}`}
                            disabled={aiDisabled}
                            onClick={() => setFeaturesModalOpen(true)}
                          >
                            Features ({selectedAiFeatureCount})
                          </button>
                          <button
                            type="button"
                            className={`ai-zip-button ${selectedAiLibraryCount > 0 ? "active" : ""}`}
                            disabled={aiDisabled}
                            onClick={() => setLibrariesModalOpen(true)}
                          >
                            Libraries ({selectedAiLibraryCount})
                          </button>
                        </div>

                        <div className={`ai-zip-control ${aiDisabled ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Chunk Size (bars)</div>
                          <input
                            type="number"
                            min={2}
                            step={1}
                            value={chunkBars}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setChunkBars(Math.max(2, Math.floor(Number(event.target.value) || 2)));
                            }}
                            className="ai-zip-input"
                          />
                        </div>

                        <label className={`ai-zip-field ${aiDisabled ? "ai-zip-control disabled" : ""}`}>
                          <span className="ai-zip-label">Distance Metric</span>
                          <select
                            value={distanceMetric}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setDistanceMetric(event.target.value as AiDistanceMetric);
                            }}
                            className="ai-zip-input"
                          >
                            <option value="euclidean">Euclidean</option>
                            <option value="cosine">Cosine similarity</option>
                            <option value="manhattan">Manhattan (L1)</option>
                            <option value="chebyshev">Chebyshev (L-infinity)</option>
                          </select>
                        </label>

                        <label className={`ai-zip-field ${aiDisabled ? "ai-zip-control disabled" : ""}`}>
                          <span className="ai-zip-label">Compression</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={embeddingCompression}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setEmbeddingCompression(
                                clamp(Number(event.target.value) || 0, 0, 100)
                              );
                            }}
                            className="backtest-slider"
                            style={{ "--p": `${embeddingCompression}%` } as React.CSSProperties}
                          />
                          <span className="ai-zip-note">{embeddingCompression}%</span>
                        </label>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section-title">Dimensionality</div>
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        <div className={`ai-zip-control ${aiDisabled ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Domain</div>
                          <div className="ai-zip-toggle-grid tiles compact">
                            {AI_DOMAIN_OPTIONS.map((domain) => (
                              <button
                                key={domain}
                                type="button"
                                className={`ai-zip-button pill ${
                                  selectedAiDomains.includes(domain) ? "active" : ""
                                }`}
                                disabled={aiDisabled}
                                onClick={() => {
                                  setSelectedAiDomains((current) =>
                                    toggleListValue(current, domain)
                                  );
                                }}
                              >
                                {domain}
                              </button>
                            ))}
                          </div>
                        </div>

                        <label className={`ai-zip-field ${aiDisabled ? "ai-zip-control disabled" : ""}`}>
                          <span className="ai-zip-label">Dimension Amount</span>
                          <input
                            type="number"
                            min={2}
                            max={Math.max(2, configuredAiFeatureDimensionCount)}
                            step={1}
                            value={dimensionAmount}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setDimensionAmount(
                                clamp(
                                  Math.floor(Number(event.target.value) || 2),
                                  2,
                                  Math.max(2, configuredAiFeatureDimensionCount)
                                )
                              );
                            }}
                            className="ai-zip-input"
                          />
                        </label>

                        <label className={`ai-zip-field ${aiDisabled ? "ai-zip-control disabled" : ""}`}>
                          <span className="ai-zip-label">Compression Method</span>
                          <select
                            value={compressionMethod}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setCompressionMethod(event.target.value as AiCompressionMethod);
                            }}
                            className="ai-zip-input"
                          >
                            <option value="pca">PCA</option>
                            <option value="jl">Random Projection</option>
                            <option value="hash">Feature Hashing</option>
                            <option value="variance">Top Variance</option>
                            <option value="subsample">Uniform Subsample</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Risk Management</div>
                        <div className="ai-zip-input-grid">
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">TP ($)</span>
                            <input
                              type="number"
                              min={0}
                              step={25}
                              value={tpDollars}
                              onChange={(event) => {
                                setTpDollars(Math.max(0, Number(event.target.value) || 0));
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">SL ($)</span>
                            <input
                              type="number"
                              min={0}
                              step={25}
                              value={slDollars}
                              onChange={(event) => {
                                setSlDollars(Math.max(0, Number(event.target.value) || 0));
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">Units ($ / 1.0 move)</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={dollarsPerMove}
                              onChange={(event) => {
                                setDollarsPerMove(Math.max(1, Number(event.target.value) || 1));
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">Max Bars in Trade</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={maxBarsInTrade}
                              onChange={(event) => {
                                setMaxBarsInTrade(
                                  Math.max(0, Math.floor(Number(event.target.value) || 0))
                                );
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Stop Mode</div>
                        <button
                          type="button"
                          className={`ai-zip-button ${stopMode !== 0 ? "active" : ""}`}
                          onClick={() => {
                            const next = ((stopMode || 0) + 1) % 3;
                            setStopMode(next);
                          }}
                          style={{ width: "100%", marginBottom: "0.5rem" }}
                        >
                          {stopMode === 0 ? "Off" : stopMode === 1 ? "Break‑Even" : "Trailing"}
                        </button>

                        <div style={{ opacity: stopMode === 1 ? 1 : 0.38, pointerEvents: stopMode === 1 ? "auto" : "none", marginBottom: "0.35rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.78)" }}>
                            <span>Break‑Even Trigger</span>
                            <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800 }}>{Math.round(breakEvenTriggerPct)}%</span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={1}
                            value={breakEvenTriggerPct}
                            disabled={stopMode !== 1}
                            onChange={(e) => setBreakEvenTriggerPct(clamp(Number(e.target.value) || 0, 0, 100))}
                            className="theme-slider"
                            style={{ width: "100%", height: 6, cursor: stopMode === 1 ? "pointer" : "not-allowed" }}
                          />
                        </div>

                        <div style={{ opacity: stopMode === 2 ? 1 : 0.38, pointerEvents: stopMode === 2 ? "auto" : "none", marginBottom: "0.35rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.78)" }}>
                            <span>Trailing Start</span>
                            <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800 }}>{Math.round(trailingStartPct)}%</span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={1}
                            value={trailingStartPct}
                            disabled={stopMode !== 2}
                            onChange={(e) => setTrailingStartPct(clamp(Number(e.target.value) || 0, 0, 100))}
                            className="theme-slider"
                            style={{ width: "100%", height: 6, cursor: stopMode === 2 ? "pointer" : "not-allowed" }}
                          />
                        </div>

                        <div style={{ opacity: stopMode === 2 ? 1 : 0.38, pointerEvents: stopMode === 2 ? "auto" : "none" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.78)" }}>
                            <span>Trailing Distance</span>
                            <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800 }}>{Math.round(trailingDistPct)}%</span>
                          </div>
                          <input
                            type="range" min={1} max={100} step={1}
                            value={trailingDistPct}
                            disabled={stopMode !== 2}
                            onChange={(e) => setTrailingDistPct(clamp(Number(e.target.value) || 30, 1, 100))}
                            className="theme-slider"
                            style={{ width: "100%", height: 6, cursor: stopMode === 2 ? "pointer" : "not-allowed" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Anti-Cheat</div>

                        <button
                          type="button"
                          className={`ai-zip-button ${antiCheatEnabled ? "active" : ""}`}
                          onClick={() => {
                            const next = !antiCheatEnabled;
                            setAntiCheatEnabled(next);
                            if (!next) setRealismLevel(0);
                          }}
                        >
                          Anti-Cheat {antiCheatEnabled ? "· ON" : "· OFF"}
                        </button>

                        <div className="ai-zip-section-divider" />

                        <button
                          type="button"
                          className={`ai-zip-button ${validationMode === "off" ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={() => setValidationMode("off")}
                        >
                          Normal
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button ${validationMode === "split" ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={() => setValidationMode("split")}
                        >
                          Test / Split
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button ${validationMode === "online" ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={() => setValidationMode("online")}
                        >
                          Online
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button ${validationMode === "synthetic" ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={() => setValidationMode("synthetic")}
                        >
                          Synthetic
                        </button>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Realism</div>

                        <button
                          type="button"
                          className={`ai-zip-button ${realismLevel > 0 ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={() => setRealismLevel((current) => (current > 0 ? 0 : 1))}
                        >
                          Realism {realismLevel > 0 ? "· ON" : "· OFF"}
                        </button>

                        <div className="ai-zip-section-divider" />

                        {(["Low", "Medium", "High", "Max"] as const).map((label, i) => {
                          const idx = i + 1;
                          return (
                            <button
                              key={label}
                              type="button"
                              className={`ai-zip-button ${realismLevel === idx ? "active" : ""}`}
                              disabled={!antiCheatEnabled || realismLevel === 0}
                              onClick={() => setRealismLevel(idx)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              ) : null}

              <AiSettingsModal
                title="Method Specific Settings"
                open={methodSettingsOpen}
                onClose={() => setMethodSettingsOpen(false)}
              >
                <div className={`ai-zip-control ${aiDisabled ? "disabled" : ""}`}>
                  {aiMode === "hdbscan" ? (
                    <>
                      <div className="ai-zip-input-grid">
                        <label className="ai-zip-field">
                          <span className="ai-zip-label">Min Cluster Size</span>
                          <input
                            type="number"
                            min={5}
                            max={5000}
                            step={1}
                            value={hdbMinClusterSize}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setHdbMinClusterSize(
                                clamp(Math.floor(Number(event.target.value) || 5), 5, 5000)
                              );
                            }}
                            className="ai-zip-input"
                          />
                        </label>
                        <label className="ai-zip-field">
                          <span className="ai-zip-label">Min Samples</span>
                          <input
                            type="number"
                            min={2}
                            max={200}
                            step={1}
                            value={hdbMinSamples}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setHdbMinSamples(
                                clamp(Math.floor(Number(event.target.value) || 2), 2, 200)
                              );
                            }}
                            className="ai-zip-input"
                          />
                        </label>
                        <label className="ai-zip-field">
                          <span className="ai-zip-label">Eps Quantile</span>
                          <input
                            type="number"
                            min={0.5}
                            max={0.99}
                            step={0.01}
                            value={hdbEpsQuantile}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setHdbEpsQuantile(
                                clamp(Number(event.target.value) || 0.5, 0.5, 0.99)
                              );
                            }}
                            className="ai-zip-input"
                          />
                        </label>
                        <label className="ai-zip-field">
                          <span className="ai-zip-label">Sample Cap</span>
                          <input
                            type="number"
                            min={200}
                            max={200000}
                            step={100}
                            value={hdbSampleCap}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setHdbSampleCap(
                                clamp(Math.floor(Number(event.target.value) || 200), 200, 200000)
                              );
                            }}
                            className="ai-zip-input"
                          />
                        </label>
                      </div>
                      <div className="ai-zip-note">
                        HDBSCAN groups similar states by density and isolates sparse noise.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="ai-zip-input-grid">
                        <label className="ai-zip-field">
                          <span className="ai-zip-label">K Entry</span>
                          <input
                            type="number"
                            min={3}
                            step={1}
                            value={kEntry}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setKEntry(Math.max(3, Math.floor(Number(event.target.value) || 3)));
                            }}
                            className="ai-zip-input"
                          />
                        </label>
                        <label className="ai-zip-field">
                          <span className="ai-zip-label">K Exit</span>
                          <input
                            type="number"
                            min={3}
                            step={1}
                            value={kExit}
                            disabled={aiDisabled}
                            onChange={(event) => {
                              setKExit(Math.max(3, Math.floor(Number(event.target.value) || 3)));
                            }}
                            className="ai-zip-input"
                          />
                        </label>
                      </div>
                      <label className="ai-zip-field">
                        <span className="ai-zip-label">kNN Voting</span>
                        <select
                          value={knnVoteMode}
                          disabled={aiDisabled}
                          onChange={(event) => {
                            setKnnVoteMode(event.target.value as KnnVoteMode);
                          }}
                          className="ai-zip-input"
                        >
                          <option value="distance">Distance-weighted</option>
                          <option value="majority">Majority vote</option>
                        </select>
                      </label>
                      <div className="ai-zip-note">
                        These settings control how many neighbors are used and how votes are scored.
                      </div>
                    </>
                  )}
                </div>
              </AiSettingsModal>

              <AiSettingsModal
                title="MODELS"
                subtitle="Left click: toggle ENTRY. Right click: toggle BOTH."
                size="wide"
                bodyClassName="ai-zip-models-modal-body"
                open={modelsModalOpen}
                onClose={() => setModelsModalOpen(false)}
              >
                <div className="ai-zip-model-grid">
                  {availableAiModelNames.map((modelName) => {
                    const state = aiModelStates[modelName] ?? 0;

                    return (
                      <button
                        key={modelName}
                        type="button"
                        className={`ai-zip-select-tile model ${state > 0 ? "active" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setAiModelStates((current) => ({
                            ...current,
                            [modelName]: getNextAiModelState(current[modelName] ?? 0, event.button)
                          }));
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                        }}
                        title={`Left click: toggle ENTRY for ${modelName}. Right click: toggle BOTH for ${modelName}.`}
                      >
                        <strong>{modelName}</strong>
                        <span>{getAiModelStateLabel(state)}</span>
                        <em>
                          {state === 2 ? "Entry + Exit" : state === 1 ? "Entry only" : "Disabled"}
                        </em>
                      </button>
                    );
                  })}
                </div>
              </AiSettingsModal>

              <AiSettingsModal
                title="FEATURES"
                subtitle="Left click: cycle intensity. Right click: toggle Ensemble vs Individualization."
                size="xwide"
                bodyClassName="ai-zip-features-modal-body"
                open={featuresModalOpen}
                onClose={() => setFeaturesModalOpen(false)}
              >
                <div className="ai-zip-feature-grid">
                  {AI_FEATURE_OPTIONS.map((feature) => {
                    const level = aiFeatureLevels[feature.id] ?? 0;
                    const mode = aiFeatureModes[feature.id] ?? "individual";
                    const dimsAdded =
                      featureTakeCount(feature.id, level) *
                      (mode === "individual" ? getAiFeatureWindowBars(chunkBars) : 1);

                    return (
                      <button
                        key={feature.id}
                        type="button"
                        className={`ai-zip-select-tile feature ${level > 0 ? "active" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();

                          if (event.button === 2) {
                            setAiFeatureModes((current) => ({
                              ...current,
                              [feature.id]:
                                (current[feature.id] ?? "individual") === "individual"
                                  ? "ensemble"
                                  : "individual"
                            }));
                            return;
                          }

                          setAiFeatureLevels((current) => ({
                            ...current,
                            [feature.id]: getNextAiFeatureLevel(current[feature.id] ?? 0)
                          }));
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                        }}
                        title={`${feature.label}: Left click cycles intensity. Right click toggles Ensemble vs Individualization.`}
                      >
                        <strong>{feature.label}</strong>
                        <span>{feature.note ?? "Feature context for AI.zip embeddings."}</span>
                        <em>
                          {FEATURE_LEVEL_LABEL[level as AiFeatureLevel]} ·{" "}
                          {mode === "ensemble" ? "Ensemble" : "Individualization"} · +
                          {dimsAdded.toLocaleString("en-US")} dims
                        </em>
                      </button>
                    );
                  })}
                </div>
              </AiSettingsModal>

              <AiSettingsModal
                title="LIBRARY"
                subtitle="Available, active, and full AI.zip controls"
                size="xwide"
                bodyClassName="ai-zip-library-modal-body"
                open={librariesModalOpen}
                onClose={() => setLibrariesModalOpen(false)}
              >
                <div className="ai-zip-library-layout">
                  <section className="ai-zip-library-column">
                    <header>
                      <strong>Available Libraries</strong>
                      <span>Click Add to activate.</span>
                    </header>
                    <div className="ai-zip-library-scroll">
                      {availableAiLibraries.length === 0 ? (
                        <p className="ai-zip-library-empty">No more libraries available.</p>
                      ) : (
                        availableAiLibraries.map((library) => (
                          <article key={library.id} className="ai-zip-library-card">
                            <div>
                              <h4>{library.name}</h4>
                              <p>{library.description || "Library option."}</p>
                            </div>
                            <button
                              type="button"
                              className="ai-zip-library-action add"
                              onClick={() => addAiLibrary(library.id)}
                            >
                              Add
                            </button>
                          </article>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="ai-zip-library-column">
                    <header>
                      <strong>Active Libraries</strong>
                      <span>Select one to edit settings.</span>
                    </header>
                    <div className="ai-zip-library-scroll">
                      {selectedAiLibraries.length === 0 ? (
                        <p className="ai-zip-library-empty">No active libraries selected.</p>
                      ) : (
                        selectedAiLibraries.map((libraryId, index) => {
                          const library = aiLibraryDefById[libraryId] ?? null;

                          if (!library) {
                            return null;
                          }

                          const isSelected = selectedAiLibraryId === libraryId;

                          return (
                            <article
                              key={libraryId}
                              className={`ai-zip-library-card active ${isSelected ? "selected" : ""}`}
                              onClick={() => setSelectedAiLibraryId(libraryId)}
                            >
                              <div>
                                <h4>{library.name}</h4>
                                <p>{library.description || "Active library option."}</p>
                              </div>
                              <div className="ai-zip-library-actions">
                                <button
                                  type="button"
                                  className="ai-zip-library-action"
                                  disabled={index === 0}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveAiLibrary(libraryId, -1);
                                  }}
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="ai-zip-library-action"
                                  disabled={index === selectedAiLibraries.length - 1}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveAiLibrary(libraryId, 1);
                                  }}
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className="ai-zip-library-action danger"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeAiLibrary(libraryId);
                                  }}
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className="ai-zip-library-column settings">
                    <header>
                      <strong>Settings</strong>
                      <span>{selectedAiLibrary ? selectedAiLibrary.name : "Select an active library"}</span>
                      {selectedAiLibrary ? (
                        <div className="ai-zip-library-settings-meta">
                          <span
                            className={`ai-zip-library-status-badge ${
                              selectedAiLibraryLoadedCount > 0 ? "loaded" : ""
                            }`}
                          >
                            {selectedAiLibraryLoadedCount > 0 ? "Loaded" : "Not Loaded"}
                          </span>
                          <span className="ai-zip-library-neighbor-count">
                            {selectedAiLibraryLoadedCount.toLocaleString()} neighbors
                          </span>
                        </div>
                      ) : null}
                    </header>
                    <div className="ai-zip-library-scroll">
                      {selectedAiLibrary && selectedAiLibraryConfig ? (
                        <div className="ai-zip-library-detail">
                          <div className="ai-zip-library-settings-panel">
                            <div className="ai-zip-library-settings-title">
                              Bulk settings (apply to many libraries)
                            </div>
                            <div className="ai-zip-library-settings-grid">
                              <label className="ai-zip-library-field">
                                <span>Scope</span>
                                <select
                                  value={aiBulkScope}
                                  onChange={(event) => {
                                    setAiBulkScope((event.target.value as "active" | "all") || "active");
                                  }}
                                  className="ai-zip-library-input"
                                >
                                  <option value="active">Active libraries only</option>
                                  <option value="all">All libraries</option>
                                </select>
                              </label>
                              <label className="ai-zip-library-field">
                                <span>Weight (%)</span>
                                <input
                                  type="number"
                                  value={aiBulkWeight}
                                  onChange={(event) => {
                                    setAiBulkWeight(Math.max(0, Number(event.target.value) || 0));
                                  }}
                                  className="ai-zip-library-input"
                                />
                              </label>
                              <label className="ai-zip-library-field">
                                <span>Stride</span>
                                <input
                                  type="number"
                                  value={aiBulkStride}
                                  onChange={(event) => {
                                    setAiBulkStride(Math.max(0, Number(event.target.value) || 0));
                                  }}
                                  className="ai-zip-library-input"
                                />
                              </label>
                              <label className="ai-zip-library-field">
                                <span>Amount of Samples</span>
                                <input
                                  type="number"
                                  value={aiBulkMaxSamples}
                                  onChange={(event) => {
                                    setAiBulkMaxSamples(Math.max(0, Number(event.target.value) || 0));
                                  }}
                                  className="ai-zip-library-input"
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              className="ai-zip-library-action primary wide"
                              onClick={applyAiBulkLibrarySettings}
                            >
                              Apply to {aiBulkScope === "active" ? "active" : "all"} libraries
                            </button>
                          </div>

                          {selectedAiLibrary.fields.map((field) => {
                            const fieldValue = selectedAiLibraryConfig[field.key];

                            if (field.type === "boolean") {
                              const isEnabled = Boolean(fieldValue);

                              return (
                                <div key={field.key} className="ai-zip-library-field-block">
                                  <div className="ai-zip-library-field-inline">
                                    <div>
                                      <div className="ai-zip-library-field-label">{field.label}</div>
                                      {field.help ? (
                                        <p className="ai-zip-library-field-help">{field.help}</p>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      className={`ai-zip-library-action ${isEnabled ? "add" : ""}`}
                                      onClick={() => {
                                        updateAiLibrarySetting(
                                          selectedAiLibrary.id,
                                          field.key,
                                          !isEnabled
                                        );
                                      }}
                                    >
                                      {isEnabled ? "ON" : "OFF"}
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            if (field.type === "select") {
                              return (
                                <label key={field.key} className="ai-zip-library-field-block">
                                  <span className="ai-zip-library-field-label">{field.label}</span>
                                  <select
                                    value={String(fieldValue ?? "")}
                                    onChange={(event) => {
                                      updateAiLibrarySetting(
                                        selectedAiLibrary.id,
                                        field.key,
                                        event.target.value
                                      );
                                    }}
                                    className="ai-zip-library-input"
                                  >
                                    {(field.options ?? []).map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  {field.help ? (
                                    <p className="ai-zip-library-field-help">{field.help}</p>
                                  ) : null}
                                </label>
                              );
                            }

                            if (field.type === "text") {
                              return (
                                <label key={field.key} className="ai-zip-library-field-block">
                                  <span className="ai-zip-library-field-label">{field.label}</span>
                                  <input
                                    type="text"
                                    value={String(fieldValue ?? "")}
                                    onChange={(event) => {
                                      updateAiLibrarySetting(
                                        selectedAiLibrary.id,
                                        field.key,
                                        event.target.value
                                      );
                                    }}
                                    className="ai-zip-library-input"
                                  />
                                  {field.help ? (
                                    <p className="ai-zip-library-field-help">{field.help}</p>
                                  ) : null}
                                </label>
                              );
                            }

                            const min = typeof field.min === "number" ? field.min : undefined;
                            const max = typeof field.max === "number" ? field.max : undefined;
                            const step = typeof field.step === "number" ? field.step : 1;
                            const parsedValue = Number(fieldValue ?? 0);
                            const numericValue = Number.isFinite(parsedValue) ? parsedValue : 0;
                            const canRange =
                              min != null &&
                              max != null &&
                              (field.key === "maxSamples" || max - min <= 50000);

                            return (
                              <label key={field.key} className="ai-zip-library-field-block">
                                <span className="ai-zip-library-field-label">{field.label}</span>
                                <input
                                  type="number"
                                  value={numericValue}
                                  min={min}
                                  max={max}
                                  step={step}
                                  onChange={(event) => {
                                    const raw = Number(event.target.value);
                                    const nextValue = Number.isFinite(raw) ? raw : 0;
                                    const clampedValue =
                                      min != null && max != null
                                        ? clamp(nextValue, min, max)
                                        : min != null
                                          ? Math.max(min, nextValue)
                                          : max != null
                                            ? Math.min(max, nextValue)
                                            : nextValue;

                                    updateAiLibrarySetting(
                                      selectedAiLibrary.id,
                                      field.key,
                                      clampedValue
                                    );
                                  }}
                                  className="ai-zip-library-input"
                                />
                                {canRange ? (
                                  <input
                                    type="range"
                                    min={min}
                                    max={max}
                                    step={step}
                                    value={numericValue}
                                    onChange={(event) => {
                                      updateAiLibrarySetting(
                                        selectedAiLibrary.id,
                                        field.key,
                                        Number(event.target.value)
                                      );
                                    }}
                                    className="backtest-slider"
                                    style={{ "--p": `${min != null && max != null && max > min ? ((numericValue - min) / (max - min)) * 100 : 50}%` } as React.CSSProperties}
                                  />
                                ) : null}
                                {field.help ? (
                                  <p className="ai-zip-library-field-help">{field.help}</p>
                                ) : null}
                                {field.key === AI_LIBRARY_TARGET_WIN_RATE_KEY ? (
                                  <p className="ai-zip-library-field-help">
                                    {Number.isFinite(
                                      aiLibraryBaselineWinRates[selectedAiLibrary.id]
                                    )
                                      ? `Natural win rate: ${aiLibraryBaselineWinRates[
                                          selectedAiLibrary.id
                                        ]!.toFixed(1)}% before target trimming.`
                                      : "Natural win rate appears here once source trades are available."}
                                  </p>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ai-zip-library-empty">No library selected.</p>
                      )}
                    </div>
                  </section>
                </div>
              </AiSettingsModal>

              {selectedBacktestTab === "history" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <button
                      type="button"
                      onClick={() => setBacktestHistoryCollapsed((value) => !value)}
                      aria-expanded={!backtestHistoryCollapsed}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: 10,
                        marginBottom: 10,
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                        textAlign: "left"
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "1rem",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.96)"
                          }}
                        >
                          Trade History
                        </h3>
                      </div>
                    </button>

                    {!backtestHistoryCollapsed ? (
                      <>
                        <div
                          style={{
                            fontSize: 10,
                            opacity: 0.72,
                            marginTop: -6,
                            marginBottom: 6
                          }}
                        >
                          {backtestTrades.length > 0 ? (
                            <>
                              Showing{" "}
                              <b>{backtestHistoryPageStart > 0 ? `${backtestHistoryPageStart}-${backtestHistoryPageEnd}` : "0"}</b>{" "}
                              of <b>{filteredBacktestHistory.length}</b> filtered trades
                              {filteredBacktestHistory.length !== backtestTrades.length ? (
                                <>
                                  {" "}
                                  (<b>{backtestTrades.length}</b> total)
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>No trades</>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 10,
                            alignItems: "center"
                          }}
                        >
                          <input
                            type="search"
                            value={backtestHistoryQuery}
                            onChange={(event) => setBacktestHistoryQuery(event.target.value)}
                            placeholder="Search trades (ID, model, session, direction, dates...)"
                            aria-label="search trading history"
                            style={{
                              flex: 1,
                              height: 34,
                              borderRadius: 10,
                              padding: "0 12px",
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(0,0,0,0.25)",
                              color: "rgba(255,255,255,0.92)",
                              outline: "none",
                              fontSize: 12,
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)"
                            }}
                          />
                          {backtestHistoryQuery.trim() ? (
                            <button
                              type="button"
                              onClick={() => setBacktestHistoryQuery("")}
                              style={{
                                height: 34,
                                padding: "0 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(255,255,255,0.06)",
                                color: "rgba(255,255,255,0.85)",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer"
                              }}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        {filteredBacktestHistory.length > 0 ? (
                          <div
                            style={{
                              marginTop: 10,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap"
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                opacity: 0.72
                              }}
                            >
                              Page {visibleBacktestHistoryPage} of {backtestHistoryPageCount}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setBacktestHistoryPage((page) => Math.max(1, page - 1))
                                }
                                disabled={visibleBacktestHistoryPage <= 1}
                                style={{
                                  height: 30,
                                  padding: "0 12px",
                                  borderRadius: 9,
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background:
                                    visibleBacktestHistoryPage <= 1
                                      ? "rgba(255,255,255,0.03)"
                                      : "rgba(255,255,255,0.06)",
                                  color:
                                    visibleBacktestHistoryPage <= 1
                                      ? "rgba(255,255,255,0.32)"
                                      : "rgba(255,255,255,0.85)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: visibleBacktestHistoryPage <= 1 ? "default" : "pointer"
                                }}
                              >
                                Prev
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setBacktestHistoryPage((page) =>
                                    Math.min(backtestHistoryPageCount, page + 1)
                                  )
                                }
                                disabled={visibleBacktestHistoryPage >= backtestHistoryPageCount}
                                style={{
                                  height: 30,
                                  padding: "0 12px",
                                  borderRadius: 9,
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background:
                                    visibleBacktestHistoryPage >= backtestHistoryPageCount
                                      ? "rgba(255,255,255,0.03)"
                                      : "rgba(255,255,255,0.06)",
                                  color:
                                    visibleBacktestHistoryPage >= backtestHistoryPageCount
                                      ? "rgba(255,255,255,0.32)"
                                      : "rgba(255,255,255,0.85)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor:
                                    visibleBacktestHistoryPage >= backtestHistoryPageCount
                                      ? "default"
                                      : "pointer"
                                }}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div
                          style={{
                            marginTop: 10,
                            maxHeight: "calc(100vh - 220px)",
                            minHeight: "calc(100vh - 220px)",
                            overflow: "auto",
                            borderRadius: 11,
                            border: "1px solid rgba(255,255,255,0.10)"
                          }}
                        >
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: 11
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  position: "sticky",
                                  top: 0,
                                  zIndex: 1,
                                  background: "#111111"
                                }}
                              >
                                <th style={aiZipBacktestHistoryHeadCell}>#</th>
                                <th style={aiZipBacktestHistoryHeadCell}>ID</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Entry Model</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Direction</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Session</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Entry</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Exit</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Duration</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Exit By</th>
                                <th style={aiZipBacktestHistoryHeadCell}>PnL ($)</th>
                                <th style={aiZipBacktestHistoryHeadCell}>Confidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pagedBacktestHistory.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={11}
                                    style={{
                                      padding: 10,
                                      textAlign: "center",
                                      color: "rgba(255,255,255,0.55)"
                                    }}
                                  >
                                    No trades match the current filters.
                                  </td>
                                </tr>
                              ) : (
                                pagedBacktestHistory.map((trade, index) => {
                                  const durationMinutes = Math.max(
                                    1,
                                    (Number(trade.exitTime) - Number(trade.entryTime)) / 60
                                  );
                                  const pnlPositive = trade.pnlUsd >= 0;
                                  const rowBackground = pnlPositive
                                    ? "rgba(60,220,120,0.05)"
                                    : "rgba(230,80,80,0.05)";
                                  const outlineColor = pnlPositive
                                    ? "rgba(60,220,120,0.95)"
                                    : "rgba(230,80,80,0.95)";
                                  const pnlColor = pnlPositive
                                    ? "rgba(60,220,120,0.95)"
                                    : "rgba(230,80,80,0.95)";
                                  const isHovered = hoveredBacktestHistoryId === trade.id;
                                  const cell = (
                                    col: number,
                                    extra?: CSSProperties
                                  ): CSSProperties => ({
                                    ...aiZipBacktestHistoryBodyCell,
                                    ...(extra ?? {}),
                                    borderTop: isHovered
                                      ? `1px solid ${outlineColor}`
                                      : undefined,
                                    borderBottom: isHovered
                                      ? `1px solid ${outlineColor}`
                                      : aiZipBacktestHistoryBodyCell.borderBottom,
                                    borderLeft:
                                      isHovered && col === 0
                                        ? `1px solid ${outlineColor}`
                                        : undefined,
                                    borderRight:
                                      isHovered && col === 10
                                        ? `1px solid ${outlineColor}`
                                        : undefined
                                  });

                                  return (
                                    <tr
                                      key={trade.id}
                                      onMouseEnter={() => setHoveredBacktestHistoryId(trade.id)}
                                      onMouseLeave={() =>
                                        setHoveredBacktestHistoryId((value) =>
                                          value === trade.id ? null : value
                                        )
                                      }
                                      onClick={() => openBacktestTradeDetails(trade)}
                                      title="Click to view trade details"
                                      style={{
                                        background: rowBackground,
                                        cursor: "pointer",
                                        transition:
                                          "box-shadow 120ms ease, background 120ms ease",
                                        boxShadow: isHovered
                                          ? `inset 0 0 0 1px ${outlineColor}`
                                          : undefined,
                                        borderBottom: "1px solid rgba(255,255,255,0.06)"
                                      }}
                                    >
                                      <td style={cell(0)}>{backtestHistoryPageStart + index}</td>
                                      <td style={cell(1)}>
                                        <span
                                          style={aiZipBacktestHistoryMono({
                                            fontSize: "0.68rem",
                                            fontWeight: 900,
                                            color: "rgba(255,255,255,0.82)"
                                          })}
                                        >
                                          {getAiZipTradeDisplayId(trade)}
                                        </span>
                                      </td>
                                      <td style={cell(2, { whiteSpace: "normal" })}>
                                        <div style={{ lineHeight: 1.1 }}>
                                          <span style={{ fontWeight: 700 }}>{trade.entrySource}</span>
                                          <br />
                                          <span style={{ fontSize: 9, opacity: 0.8 }}>
                                            {trade.symbol} · {trade.result}
                                          </span>
                                        </div>
                                      </td>
                                      <td style={cell(3)}>
                                        {trade.side === "Long" ? "Buy" : "Sell"}
                                      </td>
                                      <td style={cell(4)}>{getSessionLabel(trade.entryTime)}</td>
                                      <td style={cell(5)}>{trade.entryAt}</td>
                                      <td style={cell(6)}>{trade.exitAt}</td>
                                      <td style={cell(7)}>
                                        {formatMinutesCompact(durationMinutes)}
                                      </td>
                                      <td style={cell(8)}>{getBacktestExitLabel(trade)}</td>
                                      <td
                                        style={cell(9, {
                                          color: pnlColor,
                                          fontWeight: 800
                                        })}
                                      >
                                        {`${pnlPositive ? "" : "-"}${formatUsd(
                                          Math.abs(trade.pnlUsd)
                                        )}`}
                                      </td>
                                      <td style={cell(10)}>
                                        {`${Math.round(getEffectiveTradeConfidenceScore(trade) * 100)}%`}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="backtest-grid two-up">
                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Trade Tape</h3>
                          <p>Quick quality checks from the active history slice.</p>
                        </div>
                      </div>
                      <div className="backtest-stat-list">
                        <div className="backtest-stat-row">
                          <span>Largest win</span>
                          <strong className="up">{formatSignedUsd(backtestSummary.maxWin)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Largest loss</span>
                          <strong className="down">{formatSignedUsd(backtestSummary.maxLoss)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Gross wins</span>
                          <strong className="up">${formatUsd(backtestSummary.grossWins)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Gross losses</span>
                          <strong className="down">{formatSignedUsd(backtestSummary.grossLosses)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Recent Sequence</h3>
                          <p>Latest closes from the current filtered sample.</p>
                        </div>
                      </div>
                      <div className="backtest-mini-list">
                        {filteredBacktestHistory.slice(0, 6).map((trade) => (
                          <div key={`${trade.id}-mini`} className="backtest-mini-row">
                            <span>{trade.symbol}</span>
                            <span>{getSessionLabel(trade.entryTime)}</span>
                            <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                              {formatSignedUsd(trade.pnlUsd)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "calendar" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Calendar</h3>
                      </div>
                    </div>

                    <div className="backtest-calendar-shell">
                      <div className="backtest-calendar-toolbar">
                        <div className="backtest-calendar-nav compact">
                          <button
                            type="button"
                            className="backtest-action-btn backtest-calendar-nav-btn"
                            onClick={() =>
                              setSelectedBacktestMonthKey(
                                shiftTradeMonthKey(activeBacktestMonthKey, -1)
                              )
                            }
                          >
                            {"<"}
                          </button>
                          <span className="backtest-calendar-label">{calendarMonthLabel}</span>
                          <button
                            type="button"
                            className="backtest-action-btn backtest-calendar-nav-btn"
                            onClick={() =>
                              setSelectedBacktestMonthKey(shiftTradeMonthKey(activeBacktestMonthKey, 1))
                            }
                          >
                            {">"}
                          </button>
                        </div>
                      </div>

                      <div className="backtest-calendar-summary">
                        <div
                          className={`backtest-month-pill ${
                            selectedBacktestMonthPnl > 0
                              ? "up"
                              : selectedBacktestMonthPnl < 0
                                ? "down"
                                : "neutral"
                          }`}
                        >
                          {calendarMonthLabel} PnL: {formatSignedUsd(selectedBacktestMonthPnl)}
                        </div>
                      </div>
                    </div>

                    <div className="backtest-calendar-weekdays">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>

                    <div className="backtest-calendar-grid">
                      {backtestCalendarGrid.map((cell) => (
                        <button
                          key={cell.dateKey}
                          type="button"
                          className={`backtest-calendar-cell ${
                            cell.dateKey === selectedBacktestDateKey ? "selected" : ""
                          } ${cell.inMonth ? "" : "muted"}`}
                          onClick={() => setSelectedBacktestDateKey(cell.dateKey)}
                        >
                          <div className="backtest-calendar-cell-day">{cell.day}</div>
                          {cell.activity ? (
                            <>
                              <div className="backtest-calendar-cell-count">
                                {cell.activity.count} trade{cell.activity.count === 1 ? "" : "s"}
                              </div>
                              <div
                                className={`backtest-calendar-cell-pnl ${
                                  cell.activity.pnl >= 0 ? "up" : "down"
                                }`}
                              >
                                {formatSignedUsd(cell.activity.pnl)}
                              </div>
                            </>
                          ) : (
                            <div className="backtest-calendar-cell-empty">No trades</div>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="backtest-calendar-detail">
                      <div className="backtest-card-head backtest-calendar-detail-head">
                        <div>
                          <h3>{selectedBacktestDateKey || "Select a day"}</h3>
                          <p>
                            {selectedBacktestDateKey
                              ? `${getWeekdayLabel(selectedBacktestDateKey)}, ${getCalendarDateLabel(
                                  selectedBacktestDateKey
                                )} · ${selectedBacktestDayTrades.length} trade${
                                  selectedBacktestDayTrades.length === 1 ? "" : "s"
                                }`
                              : "Select a day in the grid to inspect the matching trade set."}
                          </p>
                        </div>
                      </div>

                      <div className="backtest-calendar-day-list">
                        {selectedBacktestDayTrades.map((trade) => {
                          const isExpanded = expandedBacktestTradeId === trade.id;
                          const durationMinutes = getHistoryTradeDurationMinutes(trade);
                          const estimatedBars = Math.max(
                            1,
                            Math.round(
                              durationMinutes /
                                timeframeMinutes[appliedBacktestSettings.timeframe]
                            )
                          );
                          const tradeCandles =
                            backtestSeriesMap[
                              symbolTimeframeKey(trade.symbol, appliedBacktestSettings.timeframe)
                            ] ??
                            seriesMap[
                              symbolTimeframeKey(trade.symbol, appliedBacktestSettings.timeframe)
                            ] ??
                            EMPTY_CANDLES;

                          return (
                            <div
                              key={`${trade.id}-calendar`}
                              className={`backtest-calendar-trade ${isExpanded ? "expanded" : ""}`}
                            >
                              <button
                                type="button"
                                className="backtest-calendar-trade-toggle"
                                onClick={() =>
                                  setExpandedBacktestTradeId((current) =>
                                    current === trade.id ? null : trade.id
                                  )
                                }
                              >
                                <div className="backtest-calendar-trade-main">
                                  <span
                                    className={`backtest-calendar-side-pill ${
                                      trade.side === "Long" ? "up" : "down"
                                    }`}
                                  >
                                    {trade.side === "Long" ? "BUY" : "SELL"}
                                  </span>
                                  <div className="backtest-calendar-trade-copy">
                                    <div className="backtest-calendar-trade-inline">
                                      <span className="backtest-calendar-trade-inline-label">
                                        Entry ({appliedBacktestSettings.timeframe}):
                                      </span>
                                      <span className="backtest-calendar-trade-inline-value">
                                        {trade.entryAt}
                                      </span>
                                      <span className="backtest-calendar-trade-inline-price">
                                        @ {formatPrice(trade.entryPrice)}
                                      </span>
                                    </div>
                                    <div className="backtest-calendar-trade-inline optional">
                                      <span className="backtest-calendar-trade-inline-label">
                                        Exit ({appliedBacktestSettings.timeframe}):
                                      </span>
                                      <span className="backtest-calendar-trade-inline-value">
                                        {trade.exitAt}
                                      </span>
                                      <span className="backtest-calendar-trade-inline-price">
                                        @ {formatPrice(trade.outcomePrice)}
                                      </span>
                                    </div>
                                    <div className="backtest-calendar-trade-duration">
                                      Duration: {estimatedBars} bars · {formatMinutesCompact(durationMinutes)}
                                    </div>
                                  </div>
                                </div>
                                <div className="backtest-calendar-trade-side">
                                  <span className="backtest-calendar-trade-symbol">{trade.symbol}</span>
                                  <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                                    {formatSignedUsd(trade.pnlUsd)}
                                  </strong>
                                </div>
                              </button>

                              {isExpanded ? (
                                <div className="backtest-calendar-trade-expand">
                                  <div className="backtest-calendar-trade-stat-grid">
                                    <div className="backtest-calendar-trade-stat">
                                      <span>Duration</span>
                                      <strong>
                                        {estimatedBars} bars · {formatMinutesCompact(durationMinutes)}
                                      </strong>
                                    </div>
                                    <div className="backtest-calendar-trade-stat">
                                      <span>TP Price</span>
                                      <strong>{formatPrice(trade.targetPrice)}</strong>
                                    </div>
                                    <div className="backtest-calendar-trade-stat">
                                      <span>SL Price</span>
                                      <strong>{formatPrice(trade.stopPrice)}</strong>
                                    </div>
                                  </div>

                                  <div className="backtest-calendar-trade-panel">
                                    <div className="backtest-calendar-trade-meta">
                                      <div>Session: {getSessionLabel(trade.entryTime)}</div>
                                      <div>Entry Model: {trade.entrySource}</div>
                                      <div>Exit Reason: {getBacktestExitLabel(trade)}</div>
                                      <div>Confidence: {(getEffectiveTradeConfidenceScore(trade) * 100).toFixed(0)}%</div>
                                    </div>
                                  </div>

                                  <div className="backtest-calendar-trade-panel">
                                    <div className="backtest-calendar-trade-chart-copy">
                                      <strong>Price movement</strong>
                                    </div>
                                    <BacktestTradeMiniChart
                                      trade={trade}
                                      candles={tradeCandles}
                                      minutesPerBar={timeframeMinutes[appliedBacktestSettings.timeframe]}
                                      isOpen={isExpanded}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                        {selectedBacktestDayTrades.length === 0 ? (
                          <div className="backtest-empty-inline">No trades closed on the selected day.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "cluster" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    {aiZipClusterMapView === "2d" ? (
                      <AIZipClusterMap
                        candles={aiZipClusterCandles}
                        trades={aiZipClusterTrades}
                        ghostEntries={[]}
                        libraryPoints={aiClusterLibraryPoints}
                        activeLibraries={appliedBacktestSettings.selectedAiLibraries}
                        libraryCounts={aiClusterLibraryCounts}
                        chunkBars={appliedBacktestSettings.chunkBars}
                        potential={null}
                        parseMode="utc"
                        showPotential={false}
                        resetKey={aiZipClusterResetKey}
                        sliderValue={aiZipClusterTimelineIdx}
                        setSliderValue={setAiZipClusterTimelineIdx}
                        onResetClusterMap={() => setAiZipClusterResetKey((current) => current + 1)}
                        clusterMapView={aiZipClusterMapView}
                        onToggleClusterMapView={() =>
                          setAiZipClusterMapView((current) => (current === "3d" ? "2d" : "3d"))
                        }
                        onPostHocTrades={() => {}}
                        onPostHocProgress={() => {}}
                        onMitMap={() => {}}
                        aiMethod={appliedBacktestSettings.aiMode}
                        aiModalities={appliedBacktestSettings.selectedAiDomains}
                        hdbDomainDistinction="conceptual"
                        hdbMinClusterSize={appliedBacktestSettings.hdbMinClusterSize}
                        hdbMinSamples={appliedBacktestSettings.hdbMinSamples}
                        hdbEpsQuantile={appliedBacktestSettings.hdbEpsQuantile}
                        staticLibrariesClusters={appliedBacktestSettings.staticLibrariesClusters}
                        confidenceThreshold={appliedEffectiveConfidenceThreshold}
                        statsDateStart={appliedBacktestSettings.statsDateStart}
                        statsDateEnd={appliedBacktestSettings.statsDateEnd}
                        antiCheatEnabled={appliedBacktestSettings.antiCheatEnabled}
                      />
                    ) : (
                      <AIZipClusterMap3D
                        candles={aiZipClusterCandles}
                        trades={aiZipClusterTrades}
                        ghostEntries={[]}
                        libraryPoints={aiClusterLibraryPoints}
                        chunkBarsDeb={appliedBacktestSettings.chunkBars}
                        potential={null}
                        parseMode="utc"
                        showPotential={false}
                        resetKey={aiZipClusterResetKey}
                        sliderValue={aiZipClusterTimelineIdx}
                        setSliderValue={setAiZipClusterTimelineIdx}
                        onResetClusterMap={() => setAiZipClusterResetKey((current) => current + 1)}
                        clusterMapView={aiZipClusterMapView}
                        onToggleClusterMapView={() =>
                          setAiZipClusterMapView((current) => (current === "3d" ? "2d" : "3d"))
                        }
                        activeLibraries={appliedBacktestSettings.selectedAiLibraries}
                        staticLibrariesClusters={appliedBacktestSettings.staticLibrariesClusters}
                        aiMethod={appliedBacktestSettings.aiMode}
                        aiModalities={appliedBacktestSettings.selectedAiDomains}
                        hdbMinClusterSize={appliedBacktestSettings.hdbMinClusterSize}
                        hdbMinSamples={appliedBacktestSettings.hdbMinSamples}
                        hdbEpsQuantile={appliedBacktestSettings.hdbEpsQuantile}
                        hdbDomainDistinction="conceptual"
                        clusterGroupStatsMode="All"
                        antiCheatEnabled={appliedBacktestSettings.antiCheatEnabled}
                      />
                    )}
                  </div>
                </div>
              ) : null}
              {selectedBacktestTab === "timeSettings" ? (
                <div className="backtest-grid">
                  <div className="backtest-grid two-up">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Sessions</h3>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles">
                        {backtestSessionLabels.map((label) => {
                          const active = enabledBacktestSessions.includes(label);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${
                                active ? "active" : ""
                              } session-${label.toLowerCase().replace(/\s+/g, "-")}`}
                              onClick={() => {
                                setEnabledBacktestSessions((current) => {
                                  if (current.includes(label)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== label);
                                  }

                                  return [...current, label];
                                });
                              }}
                            >
                              <strong>{label}</strong>
                              <span>{active ? "ON" : "OFF"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Months</h3>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles compact">
                        {backtestMonthLabels.map((label, monthIndex) => {
                          const active = enabledBacktestMonths.includes(monthIndex);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${active ? "active" : ""}`}
                              onClick={() => {
                                setEnabledBacktestMonths((current) => {
                                  if (current.includes(monthIndex)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== monthIndex);
                                  }

                                  return [...current, monthIndex];
                                });
                              }}
                            >
                              <strong>{label}</strong>
                              <span>{active ? "ON" : "OFF"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="backtest-grid two-up">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Days of the Week</h3>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles compact">
                        {backtestWeekdayLabels.map((label) => {
                          const active = enabledBacktestWeekdays.includes(label);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${active ? "active" : ""}`}
                              onClick={() => {
                                setEnabledBacktestWeekdays((current) => {
                                  if (current.includes(label)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== label);
                                  }

                                  return [...current, label];
                                });
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Hours</h3>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles compact hours">
                        {backtestHourLabels.map((label, hour) => {
                          const active = enabledBacktestHours.includes(hour);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${active ? "active" : ""}`}
                              onClick={() => {
                                setEnabledBacktestHours((current) => {
                                  if (current.includes(hour)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== hour);
                                  }

                                  return [...current, hour];
                                });
                              }}
                            >
                              <strong>{label}</strong>
                              <span>{active ? "ON" : "OFF"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              ) : null}

              {selectedBacktestTab === "performanceStats" ? (
                <div
                  style={{
                    marginTop: 14,
                    background: "#0b0b0b",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "0 18px 45px rgba(0,0,0,0.75)",
                    padding: 16
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPerformanceStatsCollapsed((current) => !current)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: performanceStatsCollapsed ? 0 : 10,
                      padding: 0,
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: "1.125rem",
                          fontWeight: 600,
                          color: "rgba(245,245,245,0.98)"
                        }}
                      >
                        Temporal Stats
                      </h2>
                    </div>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.62)"
                      }}
                    >
                      {performanceStatsCollapsed ? "OPEN" : "HIDE"}
                    </span>
                  </button>

                  {!performanceStatsCollapsed ? (
                    <div style={{ marginTop: 12, display: "grid", gap: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 900,
                                opacity: 0.8,
                                letterSpacing: "0.04em"
                              }}
                            >
                              Model
                            </div>
                            <select
                              value={performanceStatsModel}
                              onChange={(event) => setPerformanceStatsModel(event.target.value)}
                              style={{
                                height: 34,
                                padding: "0 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(255,255,255,0.04)",
                                color: "rgba(255,255,255,0.92)",
                                fontWeight: 800,
                                cursor: "pointer",
                                outline: "none",
                                appearance: "none",
                                minWidth: 170
                              }}
                            >
                              {performanceStatsModelOptions.map((modelName) => (
                                <option key={modelName} value={modelName}>
                                  {modelName}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {!performanceStatsTemporalCharts.hasData ? (
                        <div
                          style={{
                            height: 220,
                            borderRadius: 18,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.15))",
                            padding: 12
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              opacity: 0.75
                            }}
                          >
                            No model trades in the selected range.
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                          {performanceStatsTemporalSections.map((section) => (
                            <div
                              key={section.key}
                              style={{
                                borderRadius: 18,
                                border: "1px solid rgba(255,255,255,0.10)",
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.15))",
                                padding: 12
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 900,
                                  opacity: 0.85,
                                  letterSpacing: "0.04em",
                                  marginBottom: 8
                                }}
                              >
                                {section.label}
                              </div>
                              <div style={{ height: 180 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={section.data} margin={{ top: 8, right: 10, left: 0, bottom: 6 }}>
                                    <XAxis
                                      dataKey="bucket"
                                      tick={{
                                        fontSize: 11,
                                        fill: "rgba(255,255,255,0.70)"
                                      }}
                                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                    />
                                    <YAxis
                                      tick={{
                                        fontSize: 11,
                                        fill: "rgba(255,255,255,0.70)"
                                      }}
                                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                      tickFormatter={(value: number) =>
                                        formatChartUsd(Number(value)).replace("$", "")
                                      }
                                    />
                                    <ReferenceLine
                                      y={0}
                                      stroke="rgba(255,255,255,0.78)"
                                      strokeWidth={1}
                                    />
                                    <Tooltip
                                      content={(props: any) => {
                                        const { active, payload, label } = props;

                                        if (!active || !Array.isArray(payload) || payload.length === 0) {
                                          return null;
                                        }

                                        const value = Number(payload[0]?.value ?? 0);
                                        const count = Number(payload[0]?.payload?.count ?? 0);
                                        return (
                                          <div
                                            style={{
                                              background: "rgba(255,255,255,0.96)",
                                              border: "1px solid rgba(15,23,42,0.12)",
                                              borderRadius: 12,
                                              padding: "8px 10px",
                                              boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
                                              color: "rgba(15,23,42,0.95)",
                                              fontSize: 12,
                                              minWidth: 140
                                            }}
                                          >
                                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                                              {String(label ?? "")}
                                            </div>
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12
                                              }}
                                            >
                                              <span style={{ opacity: 0.7 }}>PnL</span>
                                              <span
                                                style={{
                                                  fontWeight: 900,
                                                  color: getPerformanceStatsBarFill(value, 1)
                                                }}
                                              >
                                                {formatChartUsd(value)}
                                              </span>
                                            </div>
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                marginTop: 4
                                              }}
                                            >
                                              <span style={{ opacity: 0.7 }}>Avg</span>
                                              <span
                                                style={{
                                                  fontWeight: 900,
                                                  color: getPerformanceStatsBarFill(value, 1)
                                                }}
                                              >
                                                {formatChartUsd(count > 0 ? value / count : 0)}
                                              </span>
                                            </div>
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                marginTop: 4
                                              }}
                                            >
                                              <span style={{ opacity: 0.7 }}>Trades</span>
                                              <span
                                                style={{
                                                  fontWeight: 900,
                                                  color: "rgba(15,23,42,0.92)"
                                                }}
                                              >
                                                {count}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      }}
                                    />
                                    <Bar
                                      dataKey="pnl"
                                      radius={0}
                                      isAnimationActive={false}
                                      shape={(props: any) => {
                                        const { x, y, width, height, payload } = props;
                                        const resolvedWidth = Number(width);
                                        const resolvedHeight = Number(height);

                                        if (!Number.isFinite(resolvedWidth) || !Number.isFinite(resolvedHeight)) {
                                          return null;
                                        }

                                        const barY = resolvedHeight < 0 ? y + resolvedHeight : y;
                                        const barHeight = Math.abs(resolvedHeight);

                                        return (
                                          <rect
                                            x={x}
                                            y={barY}
                                            width={Math.max(0, resolvedWidth)}
                                            height={barHeight}
                                            fill={getPerformanceStatsBarFill(Number(payload?.pnl ?? 0))}
                                          />
                                        );
                                      }}
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedBacktestTab === "entryExit" ? (
                <div
                  style={{
                    marginTop: 14,
                    background: "#0b0b0b",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "0 18px 45px rgba(0,0,0,0.75)",
                    padding: 16
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "1.125rem",
                        fontWeight: 600,
                        color: "rgba(245,245,245,0.98)"
                      }}
                    >
                      Entry / Exit Stats
                    </h2>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 16 }}>
                    {([
                      { key: "entry", label: "Entry", data: entryExitChartData.entry },
                      { key: "exit", label: "Exit", data: entryExitChartData.exit }
                    ] as const).map((chart) => (
                      <div key={chart.key} style={{ display: "grid", gap: 8 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            opacity: 0.82,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase"
                          }}
                        >
                          {chart.label}
                        </div>
                        <div
                          style={{
                            height: 340,
                            borderRadius: 18,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.15))",
                            padding: 12
                          }}
                        >
                          {chart.data.length === 0 ? (
                            <div
                              style={{
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                opacity: 0.75
                              }}
                            >
                              No trades in the selected range.
                            </div>
                          ) : (
                            <div style={{ width: "100%", height: "100%", overflowX: "auto" }}>
                              <div style={{ minWidth: `${Math.max(chart.data.length * 88, 420)}px`, height: "100%" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={chart.data} margin={{ top: 8, right: 10, left: 0, bottom: 6 }}>
                                    <XAxis
                                      dataKey="bucket"
                                      tick={{
                                        fontSize: 11,
                                        fill: "rgba(255,255,255,0.70)"
                                      }}
                                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                    />
                                    <YAxis
                                      allowDecimals={false}
                                      tick={{
                                        fontSize: 11,
                                        fill: "rgba(255,255,255,0.70)"
                                      }}
                                      axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                      tickLine={{ stroke: "rgba(255,255,255,0.10)" }}
                                    />
                                    <Tooltip
                                      content={(props: any) => {
                                        const { active, payload, label } = props;

                                        if (!active || !Array.isArray(payload) || payload.length === 0) {
                                          return null;
                                        }

                                        const count = Number(payload[0]?.value ?? 0);
                                        const share = Number(payload[0]?.payload?.share ?? 0);
                                        return (
                                          <div
                                            style={{
                                              background: "rgba(255,255,255,0.96)",
                                              border: "1px solid rgba(15,23,42,0.12)",
                                              borderRadius: 12,
                                              padding: "8px 10px",
                                              boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
                                              color: "rgba(15,23,42,0.95)",
                                              fontSize: 12,
                                              minWidth: 160
                                            }}
                                          >
                                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                                              {String(label ?? "")}
                                            </div>
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12
                                              }}
                                            >
                                              <span style={{ opacity: 0.7 }}>Count</span>
                                              <span style={{ fontWeight: 900, color: "rgba(15,23,42,0.92)" }}>
                                                {count}
                                              </span>
                                            </div>
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                marginTop: 4
                                              }}
                                            >
                                              <span style={{ opacity: 0.7 }}>Share</span>
                                              <span style={{ fontWeight: 900, color: "rgba(15,23,42,0.92)" }}>
                                                {share.toFixed(1)}%
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      }}
                                    />
                                    <Bar
                                      dataKey="count"
                                      radius={0}
                                      isAnimationActive={false}
                                      shape={(props: any) => {
                                        const { x, y, width, height, payload } = props;
                                        const resolvedWidth = Number(width);
                                        const resolvedHeight = Number(height);

                                        if (
                                          !Number.isFinite(resolvedWidth) ||
                                          !Number.isFinite(resolvedHeight)
                                        ) {
                                          return null;
                                        }

                                        return (
                                          <rect
                                            x={x}
                                            y={y}
                                            width={Math.max(0, resolvedWidth)}
                                            height={Math.max(0, resolvedHeight)}
                                            fill={getEntryExitBarFill(String(payload?.bucket ?? ""))}
                                          />
                                        );
                                      }}
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "dimensions" ? (
                <div className="backtest-card">
                  <div className="backtest-card-head">
                    <div>
                      <h3>Dimension Statistics</h3>
                    </div>
                  </div>

                  {!dimensionStats || dimensionStats.dims.length === 0 ? (
                    <div className="backtest-empty-inline">
                      {!aiModelEnabled && !aiFilterEnabled
                        ? "Turn on AI Model or AI Filter to view dimension statistics."
                        : "No dimension statistics available yet."}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: "grid", gap: 14 }}>
                      <div
                        style={{
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          padding: "10px 12px"
                        }}
                      >
                        <div
                          style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}
                        >
                          Sample
                        </div>
                        <div
                          style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}
                        >
                          {dimensionStats.count.toLocaleString("en-US")} trades - Baseline win:{" "}
                          {dimensionStats.baselineWin === null
                            ? "-"
                            : `${(dimensionStats.baselineWin * 100).toFixed(1)}%`}{" "}
                          - Dims: {dimensionStats.outDim.toLocaleString("en-US")} active /{" "}
                          {dimensionStats.inDim.toLocaleString("en-US")} total
                        </div>
                        {dimensionStats.mode === "split" ? (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              color: "rgba(255,255,255,0.55)"
                            }}
                          >
                            Using TEST set (Split: {dimensionStats.split}% train)
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          padding: 12
                        }}
                      >
                        <div
                          style={{
                            marginBottom: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.55)"
                          }}
                        >
                          Dimensions
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            marginBottom: 10
                          }}
                        >
                          <input
                            value={dimSearch}
                            onChange={(event) => setDimSearch(event.target.value)}
                            placeholder="Search dimensions..."
                            style={{
                              flex: 1,
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "rgba(255,255,255,0.88)",
                              borderRadius: 12,
                              padding: "8px 10px",
                              fontSize: 11,
                              outline: "none"
                            }}
                          />
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => setDimScope("active")}
                              style={{
                                padding: "7px 10px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background:
                                  dimScope === "active"
                                    ? "linear-gradient(135deg, rgba(80,180,255,0.32), rgba(60,140,255,0.18))"
                                    : "rgba(255,255,255,0.06)",
                                color: "rgba(255,255,255,0.92)",
                                fontSize: 11,
                                fontWeight: 850,
                                cursor: "pointer",
                                whiteSpace: "nowrap"
                              }}
                              title="Show only active dimensions (post-compression)"
                            >
                              Active
                            </button>
                            <button
                              type="button"
                              onClick={() => setDimScope("all")}
                              style={{
                                padding: "7px 10px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background:
                                  dimScope === "all"
                                    ? "linear-gradient(135deg, rgba(255,180,80,0.30), rgba(255,140,60,0.18))"
                                    : "rgba(255,255,255,0.06)",
                                color: "rgba(255,255,255,0.92)",
                                fontSize: 11,
                                fontWeight: 850,
                                cursor: "pointer",
                                whiteSpace: "nowrap"
                              }}
                              title="Show all dimensions (pre-compression)"
                            >
                              All
                            </button>
                          </div>
                          {dimSearch.trim() ? (
                            <button
                              type="button"
                              onClick={() => setDimSearch("")}
                              style={{
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "rgba(255,255,255,0.80)",
                                borderRadius: 12,
                                padding: "8px 10px",
                                fontSize: 11,
                                fontWeight: 900,
                                cursor: "pointer",
                                userSelect: "none"
                              }}
                              title="Clear search"
                            >
                              Clear
                            </button>
                          ) : null}
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 900,
                              color: "rgba(255,255,255,0.55)",
                              whiteSpace: "nowrap"
                            }}
                            title="Shown / Total"
                          >
                            {dimensionStatsRows.length}/{dimensionStats.dims.length}
                          </div>
                        </div>

                        <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "1.35fr 0.65fr 0.65fr 0.65fr 0.65fr 0.85fr 0.55fr 0.55fr",
                              gap: 10,
                              fontSize: 10,
                              fontWeight: 900,
                              color: "rgba(255,255,255,0.55)",
                              padding: "0 2px 8px 2px",
                              borderBottom: "1px solid rgba(255,255,255,0.10)"
                            }}
                          >
                            <div
                              onClick={() => toggleDimSort("name")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by dimension name"
                            >
                              <span>Dimension</span>
                              {dimSortCol === "name" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("corr")}
                              style={{
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                justifyContent: "flex-start"
                              }}
                              title="Sort by correlation vs wins"
                            >
                              <span>Corr</span>
                              {dimSortCol === "corr" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("winLow")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by win rate at low values"
                            >
                              <span>Win@Low</span>
                              {dimSortCol === "winLow" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("winHigh")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by win rate at high values"
                            >
                              <span>Win@High</span>
                              {dimSortCol === "winHigh" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("lift")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by Win@High - Win@Low"
                            >
                              <span>Low to High</span>
                              {dimSortCol === "lift" ? (
                                <span style={{ fontSize: 11, opacity: 0.9 }}>
                                  {dimSortDir === 1 ? "▲" : "▼"}
                                </span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("optimal")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by optimal range (z-score thresholds)"
                            >
                              <span>Optimal</span>
                              {dimSortCol === "optimal" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("min")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by minimum value"
                            >
                              <span>Min</span>
                              {dimSortCol === "min" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                            <div
                              onClick={() => toggleDimSort("max")}
                              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                              title="Sort by maximum value"
                            >
                              <span>Max</span>
                              {dimSortCol === "max" ? (
                                <span style={{ opacity: 0.75 }}>{dimSortDir === 1 ? "▲" : "▼"}</span>
                              ) : null}
                            </div>
                          </div>

                          {dimensionStatsRows.map((dimension) => {
                            const corrPct = Number.isFinite(dimension.corr)
                              ? dimension.corr * 100
                              : Number.NaN;
                            const corrText = Number.isFinite(corrPct)
                              ? `${corrPct >= 0 ? "+" : ""}${corrPct.toFixed(1)}%`
                              : "—";
                            const winLowText =
                              dimension.winLow === null ? "—" : `${(dimension.winLow * 100).toFixed(1)}%`;
                            const winHighText =
                              dimension.winHigh === null
                                ? "—"
                                : `${(dimension.winHigh * 100).toFixed(1)}%`;
                            const liftText =
                              dimension.lift === null
                                ? "—"
                                : `${dimension.lift >= 0 ? "+" : ""}${(dimension.lift * 100).toFixed(1)}pp`;
                            const minText = Number.isFinite(dimension.min) ? dimension.min.toFixed(4) : "—";
                            const maxText = Number.isFinite(dimension.max) ? dimension.max.toFixed(4) : "—";
                            const corrColor =
                              corrPct >= 0 ? "rgba(60,220,120,0.92)" : "rgba(230,80,80,0.92)";
                            const liftColor =
                              dimension.lift === null
                                ? "rgba(255,255,255,0.72)"
                                : dimension.lift >= 0
                                  ? "rgba(60,220,120,0.92)"
                                  : "rgba(230,80,80,0.92)";
                            const kept = keptDimKeySet ? keptDimKeySet.has(dimension.key) : false;

                            return (
                              <div
                                key={dimension.key}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "1.35fr 0.65fr 0.65fr 0.65fr 0.65fr 0.85fr 0.55fr 0.55fr",
                                  gap: 10,
                                  padding: "8px 2px",
                                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  alignItems: "center",
                                  fontSize: 11,
                                  color: "rgba(255,255,255,0.86)",
                                  background: kept ? "rgba(255, 215, 0, 0.06)" : "transparent"
                                }}
                              >
                                <div style={{ fontWeight: 900 }}>{dimension.name}</div>
                                <div style={{ fontWeight: 900, color: corrColor }}>{corrText}</div>
                                <div style={{ color: "rgba(255,255,255,0.72)" }}>{winLowText}</div>
                                <div style={{ color: "rgba(255,255,255,0.72)" }}>{winHighText}</div>
                                <div style={{ fontWeight: 900, color: liftColor }}>{liftText}</div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 900,
                                    color: "rgba(255,255,255,0.72)"
                                  }}
                                  title="Optimal range shown in z-score units (bottom/top 10% cutoffs)"
                                >
                                  {dimension.optimal}
                                </div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                                  {minText}
                                </div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                                  {maxText}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                          Correlation is computed on the selected dataset (TEST set when split).
                          Win@Low/High uses the bottom/top 10% of values (z-scores). Optimal shows
                          which side performs better.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {selectedBacktestTab === "propFirm" ? (
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  <div className="backtest-grid">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Prop Firm Tool</h3>
                          <p>Replay the current sample against prop-style challenge limits.</p>
                        </div>
                      </div>

                      {!backtestTrades.length ? (
                        <div className="backtest-empty-inline">No trades to display.</div>
                      ) : (
                        <>
                          <div className="backtest-input-grid">
                            <label className="backtest-input-field">
                              <span>Initial Balance</span>
                              <input
                                type="number"
                                value={propInitialBalance}
                                onChange={(event) =>
                                  setPropInitialBalance(Number(event.target.value) || 0)
                                }
                              />
                            </label>
                            <label className="backtest-input-field">
                              <span>Daily Max Loss</span>
                              <input
                                type="number"
                                value={propDailyMaxLoss}
                                onChange={(event) =>
                                  setPropDailyMaxLoss(Number(event.target.value) || 0)
                                }
                              />
                            </label>
                            <label className="backtest-input-field">
                              <span>Total Max Loss</span>
                              <input
                                type="number"
                                value={propTotalMaxLoss}
                                onChange={(event) =>
                                  setPropTotalMaxLoss(Number(event.target.value) || 0)
                                }
                              />
                            </label>
                            <label className="backtest-input-field">
                              <span>Profit Target</span>
                              <input
                                type="number"
                                value={propProfitTarget}
                                onChange={(event) =>
                                  setPropProfitTarget(Number(event.target.value) || 0)
                                }
                              />
                            </label>
                          </div>

                          <div className="backtest-toolbar-row">
                            <button
                              type="button"
                              className={`ai-zip-button pill ${
                                propProjectionMethod === "montecarlo" ? "active" : ""
                              }`}
                              onClick={() => setPropProjectionMethod("montecarlo")}
                            >
                              Monte Carlo
                            </button>
                            <button
                              type="button"
                              className={`ai-zip-button pill ${
                                propProjectionMethod === "historical" ? "active" : ""
                              }`}
                              onClick={() => setPropProjectionMethod("historical")}
                            >
                              Historical
                            </button>
                            <button
                              type="button"
                              className="ai-zip-button pill"
                              onClick={runPropFirm}
                            >
                              Run
                            </button>
                          </div>

                          {propResult ? (
                            <>
                              <div className="backtest-progress-block">
                                <div className="backtest-progress-head">
                                  <span>Probability of passing</span>
                                  <strong className={propResult.probability >= 0.5 ? "up" : "down"}>
                                    {(propResult.probability * 100).toFixed(1)}%
                                  </strong>
                                </div>
                                <div className="backtest-progress-track">
                                  <div
                                    className={`backtest-progress-fill ${
                                      propResult.probability >= 0.5 ? "up" : "down"
                                    }`}
                                    style={{
                                      width: `${clamp(propResult.probability * 100, 0, 100)}%`
                                    }}
                                  />
                                </div>
                              </div>

                              {propStats ? (
                                <div className="backtest-stat-list">
                                  <div className="backtest-stat-row">
                                    <span>Avg trades to pass</span>
                                    <strong className="up">{propStats.avgTradesPass.toFixed(1)}</strong>
                                  </div>
                                  {propProjectionMethod !== "montecarlo" ? (
                                    <div className="backtest-stat-row">
                                      <span>Avg time to pass</span>
                                      <strong className="up">
                                        {formatPropFirmDuration(propStats.avgTimePass)}
                                      </strong>
                                    </div>
                                  ) : null}
                                  <div className="backtest-stat-row">
                                    <span>Avg trades to fail</span>
                                    <strong className="down">{propStats.avgTradesFail.toFixed(1)}</strong>
                                  </div>
                                  {propProjectionMethod !== "montecarlo" ? (
                                    <div className="backtest-stat-row">
                                      <span>Avg time to fail</span>
                                      <strong className="down">
                                        {formatPropFirmDuration(propStats.avgTimeFail)}
                                      </strong>
                                    </div>
                                  ) : null}
                                  <div className="backtest-stat-row">
                                    <span>Pass simulations</span>
                                    <strong className="up">{propStats.passCount.toLocaleString()}</strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Fail simulations</span>
                                    <strong className="down">{propStats.failCount.toLocaleString()}</strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Incomplete simulations</span>
                                    <strong style={{ color: "#facc15" }}>
                                      {propStats.incompleteCount.toLocaleString()}
                                    </strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Total simulations</span>
                                    <strong style={{ color: "#60a5fa" }}>
                                      {propStats.totalSimulations.toLocaleString()}
                                    </strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Incomplete %</span>
                                    <strong style={{ color: "#facc15" }}>
                                      {(
                                        (propStats.incompleteCount /
                                          Math.max(propStats.totalSimulations, 1)) *
                                        100
                                      ).toFixed(1)}
                                      %
                                    </strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Avg win rate (passes)</span>
                                    <strong
                                      className={propStats.avgWinRatePass >= 0.5 ? "up" : "down"}
                                    >
                                      {(propStats.avgWinRatePass * 100).toFixed(1)}%
                                    </strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Avg win rate (fails)</span>
                                    <strong
                                      className={propStats.avgWinRateFail >= 0.5 ? "up" : "down"}
                                    >
                                      {(propStats.avgWinRateFail * 100).toFixed(1)}%
                                    </strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Avg win rate (overall)</span>
                                    <strong
                                      className={propStats.avgWinRateOverall >= 0.5 ? "up" : "down"}
                                    >
                                      {(propStats.avgWinRateOverall * 100).toFixed(1)}%
                                    </strong>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                {propStats && propStats.randomProgressRuns.length > 0 ? (
                  <div className="backtest-card compact" style={{ marginTop: "0.9rem" }}>
                    <div className="backtest-card-head">
                      <div>
                        <h3>Random Progress Runs</h3>
                        <p>
                          {propProjectionMethod === "montecarlo"
                            ? "Monte Carlo sample paths."
                            : "Historical start-date sample path."}
                        </p>
                      </div>
                    </div>
                    <div className="h-64" style={{ background: "rgba(255,255,255,0.02)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={propStats.randomProgressRuns[0]}
                          margin={{ top: 10, right: 24, left: 12, bottom: 20 }}
                        >
                          <XAxis
                            dataKey="x"
                            type="number"
                            domain={[propStats.minX, propStats.maxX]}
                            tickFormatter={(v: number) => {
                              if (propProjectionMethod === "montecarlo") {
                                return Math.round(v).toString();
                              }
                              const d = new Date(v);
                              if (!isNaN(d.getTime())) {
                                return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                              }
                              return "";
                            }}
                            stroke="#9ca3af"
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                            label={{
                              value: propProjectionMethod === "montecarlo" ? "Trades" : "Date",
                              position: "insideBottomRight",
                              offset: -4,
                              fill: "#9ca3af",
                              fontSize: 10
                            }}
                          />
                          <YAxis
                            dataKey="y"
                            tickFormatter={(v: number) => formatUsd(v).replace("$", "")}
                            domain={[
                              propProjectionMethod === "montecarlo"
                                ? propInitialBalance - propTotalMaxLoss
                                : propInitialBalance - propTotalMaxLoss - propDailyMaxLoss,
                              propInitialBalance + propProfitTarget
                            ]}
                            stroke="#9ca3af"
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                          />
                          <ReferenceLine
                            y={propInitialBalance + propProfitTarget}
                            stroke="#34d399"
                            strokeDasharray="4 4"
                          />
                          <ReferenceLine
                            y={propInitialBalance - propTotalMaxLoss}
                            stroke="#f87171"
                            strokeDasharray="4 4"
                          />
                          {propProjectionMethod !== "montecarlo" && propDailyMaxLoss > 0 && propStats.dailyLossRun ? (
                            <Line
                              isAnimationActive={false}
                              data={propStats.dailyLossRun}
                              type="monotone"
                              dataKey="y"
                              name="Daily Loss"
                              stroke="#f87171"
                              strokeDasharray="2 2"
                              dot={false}
                            />
                          ) : null}
                          <Line
                            isAnimationActive={false}
                            type="monotone"
                            dataKey="y"
                            stroke="#3b82f6"
                            dot={false}
                          />
                          {propStats.randomProgressRuns.slice(1).map((run, idx) => {
                            const colors = ["#10b981", "#f97316", "#8b5cf6", "#ef4444", "#14b8a6", "#facc15", "#a855f7", "#ec4899", "#22c55e"];
                            const color = colors[idx % colors.length];
                            return (
                              <Line
                                isAnimationActive={false}
                                key={`rand-run-${idx}`}
                                data={run}
                                type="monotone"
                                dataKey="y"
                                stroke={color}
                                dot={false}
                              />
                            );
                          })}
                          <Tooltip
                            content={({ active, payload }: RechartsTooltipRenderProps) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const isMonteCarlo = propProjectionMethod === "montecarlo";
                              const wrapperStyle: CSSProperties = {
                                background: "#000000",
                                border: "1px solid #262626",
                                borderRadius: 11,
                                padding: "8px 10px",
                                color: "#e5e7eb",
                                fontSize: 12
                              };
                              if (isMonteCarlo) {
                                const tradeIndex = Math.round((payload[0]?.payload as { x: number })?.x ?? 0);
                                return (
                                  <div style={wrapperStyle}>
                                    <div style={{ marginBottom: 4 }}>Trade: <b>{tradeIndex}</b></div>
                                    {payload.map((row, i) => {
                                      const clr = (row as { color?: string; stroke?: string }).color || (row as { stroke?: string }).stroke || "#3b82f6";
                                      const bal = (row.payload as { y: number }).y;
                                      return (
                                        <div key={`mc-tt-${i}`} style={{ color: clr }}>
                                          Sim {i + 1}: <b>{formatSignedUsd(bal)}</b>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              const ms = (payload[0]?.payload as { x: number })?.x ?? 0;
                              const dt = new Date(ms);
                              const dateLabel = !isNaN(dt.getTime())
                                ? dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
                                : "-";
                              return (
                                <div style={wrapperStyle}>
                                  <div style={{ marginBottom: 4 }}>{dateLabel}</div>
                                  {payload.map((row, i) => {
                                    const clr = (row as { color?: string; stroke?: string }).color || (row as { stroke?: string }).stroke || "#3b82f6";
                                    const bal = (row.payload as { y: number }).y;
                                    return (
                                      <div key={`hist-tt-${i}`} style={{ color: clr }}>
                                        Balance: <b>{formatSignedUsd(bal)}</b>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : null}
                </div>
              ) : null}
                </>
              )}
            </section>
            </div>
          </section>
        ) : null}
      </section>

      {statsRefreshOverlayVisible ? (
        statsRefreshOverlayMode === "loading" ? (
          <div className="stats-refresh-loading-overlay" aria-live="polite" aria-atomic="true">
            <div className="stats-refresh-loading-shell">
              <div className="stats-refresh-loading-status">Updating Backtest Statistics</div>
              <div
                className="stats-refresh-loading-track"
                role="progressbar"
                aria-label="Updating backtest statistics"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(statsRefreshDisplayProgress)}
              >
                <div
                  className="stats-refresh-loading-fill"
                  style={{ width: `${statsRefreshDisplayProgress}%` }}
                />
              </div>
              <div className="stats-refresh-loading-date">
                {statsRefreshProgressLabel || formatStatsRefreshDateLabel(backtestRefreshNowMs)}
              </div>
            </div>
          </div>
        ) : (
          <div className="stats-refresh-overlay" aria-live="polite" aria-atomic="true">
            <div className="stats-refresh-card">
              {`Hold CTRL for ${statsRefreshSecondsRemaining.toFixed(1)}s to apply updates`}
            </div>
          </div>
        )
      ) : null}

      <footer className="statusbar backtest-statusbar">
        <div
          className="backtest-summary-strip backtest-summary-strip-compact"
          aria-label="backtest rolling statistics"
          style={{ "--backtest-stat-item-count": footerHeroStats.length } as React.CSSProperties}
        >
          <div className="backtest-summary-strip-track">
            {[0, 1].map((sequenceIndex) => (
              <div
                key={sequenceIndex}
                className="backtest-summary-strip-sequence"
                aria-hidden={sequenceIndex === 1}
              >
                {footerHeroStats.map((item, itemIndex) => (
                  <article
                    key={`status-${sequenceIndex}-${item.label}-${itemIndex}`}
                    className="backtest-summary-card backtest-summary-card-animated"
                  >
                    <span>{item.label}</span>
                    <strong
                      className={item.tone === "neutral" ? "" : item.tone}
                      style={item.valueStyle}
                    >
                      {item.value}
                    </strong>
                    <small>{item.meta}</small>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </footer>

      {activeBacktestTradeDetails ? (
        <AIZipTradeDetailsModal
          trade={activeBacktestTradeDetails}
          candles={selectedChartCandles}
          dollarsPerMove={dollarsPerMove}
          interval={selectedTimeframe}
          parseMode="utc"
          tpDist={0}
          slDist={0}
          onClose={() => setActiveBacktestTradeDetails(null)}
        />
      ) : null}
    </main>
  );
}
