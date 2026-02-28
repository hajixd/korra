"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import {
  AIZipTradeDetailsModal,
  ClusterMap as AIZipClusterMap,
  ClusterMap3D as AIZipClusterMap3D
} from "./AIZipClusterModule";

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
  | "graphs"
  | "propFirm";
type EntryExitChartMode = "Entry" | "Exit";
const BACKTEST_SCATTER_KEYS = [
  "duration",
  "pnl",
  "margin",
  "aiMargin",
  "drawdown",
  "rr",
  "entryPrice",
  "exitPrice",
  "model",
  "session"
] as const;
type BacktestScatterKey = (typeof BACKTEST_SCATTER_KEYS)[number];
type BacktestScatterAxisDef = {
  label: string;
  numeric: boolean;
  tickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
};
type PanelTab = "active" | "assets" | "models" | "mt5" | "history" | "actions" | "ai";

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

type AiCatalogItem = {
  id: string;
  label: string;
  note?: string;
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

const AI_FEATURE_OPTIONS: AiCatalogItem[] = [
  { id: "pricePath", label: "Price Path", note: "OHLC and return shape in the current window." },
  { id: "rangeTrend", label: "Range / Trend", note: "Range expansion and directional drift." },
  { id: "wicks", label: "Wicks", note: "Upper and lower wick behavior." },
  { id: "time", label: "Time", note: "Intraday and seasonal timing cycles." },
  { id: "temporal", label: "Temporal", note: "Explicit month, weekday, and hour context." },
  { id: "position", label: "Position", note: "Fib and level position context." },
  {
    id: "topography",
    label: "Topography",
    note: "Pivot density, curvature, and choppiness context."
  }
];

const AI_LIBRARY_OPTIONS: AiCatalogItem[] = [
  { id: "core", label: "Online Learning", note: "Primary rolling trade memory." },
  { id: "suppressed", label: "Suppressed", note: "Rejected trades kept for training only." },
  { id: "recent", label: "Recent Window", note: "Bias the nearest, freshest examples." },
  { id: "base", label: "Base Seeding", note: "Seed a starter library before live trades." },
  { id: "wins", label: "Wins Only", note: "Seed only winning examples." },
  { id: "terrific", label: "Terrific Trades", note: "Hand-picked high quality trades." },
  { id: "terrible", label: "Terrible Trades", note: "Counterexamples for contrast." }
];

const AI_MODALITY_OPTIONS = [
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
  ]
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
    openInterest: "OANDA + CH",
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
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "models", label: "Models" },
  { id: "mt5", label: "MT5" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" },
  { id: "ai", label: "AI" }
];

const surfaceTabs: Array<{ id: SurfaceTab; label: string }> = [
  { id: "chart", label: "Chart" },
  { id: "backtest", label: "Backtest" }
];

const backtestTabs: Array<{ id: BacktestTab; label: string }> = [
  { id: "mainSettings", label: "Main Settings" },
  { id: "mainStats", label: "Main Statistics" },
  { id: "timeSettings", label: "Time Settings" },
  { id: "performanceStats", label: "Performance Statistics" },
  { id: "history", label: "Trading History" },
  { id: "calendar", label: "Calendar" },
  { id: "cluster", label: "Cluster Map" },
  { id: "entryExit", label: "Entry / Exit Stats" },
  { id: "dimensions", label: "Dimension Statistics" },
  { id: "graphs", label: "Statistical Graphs" },
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
  "1m": 25000,
  "5m": 12000,
  "15m": 8000,
  "1H": 3000,
  "4H": 1500,
  "1D": 700,
  "1W": 180
};

const BACKTEST_LOOKBACK_YEARS = 10;
const BACKTEST_MAX_HISTORY_CANDLES = 400_000;
const BACKTEST_TARGET_TRADES = 1200;

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
    const step = getTimeframeMs(timeframe);
    let previousClose = last.close;
    let time = last.time + step;

    while (time < bucketTime) {
      if (isXauTradingTime(time)) {
        next.push({
          time,
          open: previousClose,
          high: previousClose,
          low: previousClose,
          close: previousClose
        });
      }

      time += step;
    }

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

const fetchClickhouseCandles = async (timeframe: Timeframe, count: number): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    count: String(count)
  });

  const response = await fetch(`/api/clickhouse/candles?${params.toString()}`, {
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

const historyBarsForLookback = (
  timeframe: Timeframe,
  lookbackYears: number,
  maxBars: number
): number => {
  const tfMinutes = timeframeMinutes[timeframe] || 15;
  const lookbackMinutes = lookbackYears * 365 * 24 * 60;
  const bars = Math.ceil(lookbackMinutes / tfMinutes) + 16;
  return Math.min(maxBars, Math.max(MIN_SEED_CANDLES, bars));
};

const fetchHistoryCandles = async (timeframe: Timeframe): Promise<Candle[]> => {
  const targetBars = chartHistoryCountByTimeframe[timeframe];

  try {
    const clickhouseCandles = await fetchClickhouseCandles(timeframe, targetBars);

    if (clickhouseCandles.length >= MIN_SEED_CANDLES) {
      return clickhouseCandles.slice(-targetBars);
    }
  } catch {
    // Fall through to secondary history source.
  }

  try {
    const historyCandles = await fetchHistoryApiCandles(
      timeframe,
      Math.min(targetBars, MARKET_MAX_HISTORY_CANDLES)
    );

    if (historyCandles.length >= MIN_SEED_CANDLES) {
      return historyCandles.slice(-targetBars);
    }
  } catch {
    // Leave the chart empty until a real history or live refresh arrives.
  }

  return [];
};

const fetchBacktestHistoryCandles = async (timeframe: Timeframe): Promise<Candle[]> => {
  const targetBars = historyBarsForLookback(
    timeframe,
    BACKTEST_LOOKBACK_YEARS,
    BACKTEST_MAX_HISTORY_CANDLES
  );

  try {
    const clickhouseCandles = await fetchClickhouseCandles(timeframe, targetBars);

    if (clickhouseCandles.length >= MIN_SEED_CANDLES) {
      return clickhouseCandles.slice(-targetBars);
    }
  } catch {
    // Fall through to secondary history source.
  }

  try {
    const historyCandles = await fetchHistoryApiCandles(
      timeframe,
      Math.min(targetBars, MARKET_MAX_HISTORY_CANDLES)
    );

    if (historyCandles.length >= MIN_SEED_CANDLES) {
      return historyCandles.slice(-targetBars);
    }
  } catch {
    // Leave backtest to use chart history when deep history is unavailable.
  }

  return [];
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
  const [year, month] = monthKey.split("-").map((value) => Number(value));

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

const getBacktestExitLabel = (trade: HistoryItem): string => {
  const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
  const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
  const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);

  if (trade.result === "Win" && realizedGap >= targetGap * 0.84) {
    return "Target Hit";
  }

  if (trade.result === "Loss" && realizedGap >= stopGap * 0.84) {
    return "Protective Stop";
  }

  return "Managed Exit";
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

const buildDimensionFeatureBuckets = (
  candles: Candle[],
  endExclusiveIndex: number,
  windowBars: number
): Record<string, number[]> | null => {
  const bars = clamp(Math.round(windowBars), 8, 120);

  if (candles.length < bars + 1 || endExclusiveIndex <= bars || endExclusiveIndex > candles.length) {
    return null;
  }

  const window = candles.slice(endExclusiveIndex - bars, endExclusiveIndex);

  if (window.length < bars) {
    return null;
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
  const chopRatio = absoluteReturns.reduce((total, value) => total + value, 0) / (Math.abs(netReturn) + epsilon);
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
  const minYear = new Date(candles[0]!.time).getUTCFullYear();
  const maxYear = new Date(candles[candles.length - 1]!.time).getUTCFullYear();
  const yearSpan = Math.max(1, maxYear - minYear);
  const year = finalDate.getUTCFullYear();
  const month = finalDate.getUTCMonth();
  const dayOfWeek = finalDate.getUTCDay();
  const hours = finalDate.getUTCHours();
  const minutes = finalDate.getUTCMinutes();
  const startOfYear = Date.UTC(year, 0, 0);
  const dayOfYear = Math.max(1, Math.floor((finalTime - startOfYear) / 86_400_000));
  const weekNorm = clamp(Math.ceil(dayOfYear / 7) / 53, 0, 1);
  const hourUnit = clamp((hours + minutes / 60) / 24, 0, 1);
  const minuteUnit = clamp(minutes / 60, 0, 1);
  const yearNorm = clamp((year - minYear) / yearSpan, 0, 1);
  const hourAngle = Math.PI * 2 * hourUnit;
  const minuteAngle = Math.PI * 2 * minuteUnit;
  const monthAngle = Math.PI * 2 * (month / 12);
  const dayAngle = Math.PI * 2 * (dayOfWeek / 7);
  const dayOfYearAngle = Math.PI * 2 * clamp(dayOfYear / 366, 0, 1);

  return {
    pricePath: [
      meanReturn,
      stdReturn,
      Math.max(...normalizedReturns),
      Math.min(...normalizedReturns),
      absoluteReturns.reduce((total, value) => total + value, 0),
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
    ]
  };
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
  const hasValidIndices = entryIndex >= 0 && exitIndex >= entryIndex;
  const startIndex = hasValidIndices ? Math.max(0, entryIndex - 1) : 0;
  const endIndex = hasValidIndices ? Math.min(candles.length - 1, Math.max(entryIndex, exitIndex)) : -1;
  const safeMinutesPerBar = Math.max(1, Number.isFinite(minutesPerBar) ? minutesPerBar : 1);
  const clipIdSeed = trade.id.replace(/[^a-z0-9_-]/gi, "") || "trade";
  const clipId = useMemo(() => `backtest-mini-clip-${clipIdSeed}`, [clipIdSeed]);
  const [reveal, setReveal] = useState(isOpen ? 1 : 0);

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
  }, [isOpen, trade.id]);

  const data = useMemo(() => {
    if (!hasValidIndices || candles.length === 0) {
      return [];
    }

    const rows: Array<{ bar: number; price: number; high: number; low: number; time: number }> = [];
    const preCandle = candles[startIndex];
    const prePrice = startIndex < entryIndex ? preCandle?.close ?? trade.entryPrice : trade.entryPrice;
    const preTime = preCandle?.time ?? candles[entryIndex]?.time ?? Number(trade.entryTime) * 1000;
    rows.push({
      bar: -1,
      price: prePrice,
      high: prePrice,
      low: prePrice,
      time: preTime
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
        time: candle?.time ?? preTime
      });

      previousPrice = close;
    }

    if (rows.length > 0) {
      const last = rows[rows.length - 1]!;
      last.price = trade.outcomePrice;
      last.high = Math.max(last.high, trade.outcomePrice);
      last.low = Math.min(last.low, trade.outcomePrice);
    }

    return rows;
  }, [
    candles,
    endIndex,
    entryIndex,
    hasValidIndices,
    safeMinutesPerBar,
    startIndex,
    trade.entryPrice,
    trade.entryTime,
    trade.outcomePrice
  ]);

  if (data.length < 2) {
    return <div className="backtest-trade-mini-empty">Price movement unavailable.</div>;
  }

  const domain = [
    ...data.flatMap((point) => [point.high, point.low]),
    trade.entryPrice,
    trade.targetPrice,
    trade.stopPrice,
    trade.outcomePrice
  ];
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  const span = Math.max(0.000001, max - min);
  const pad = Math.max(span * 0.12, Math.abs(trade.entryPrice) * 0.002, 1);
  const minY = min - pad;
  const maxY = max + pad;

  const width = 760;
  const height = 260;
  const padX = 22;
  const padY = 16;
  const minBar = -1;
  const maxBar = Math.max(0, data[data.length - 1]?.bar ?? 0);
  const barSpan = Math.max(1, maxBar - minBar);
  const toneByDelta = (delta: number): "up" | "down" | "flat" => {
    if (delta > 0) {
      return "up";
    }

    if (delta < 0) {
      return "down";
    }

    return "flat";
  };
  const colorByTone = (tone: "up" | "down" | "flat"): string => {
    if (tone === "up") {
      return "#34d399";
    }

    if (tone === "down") {
      return "#f87171";
    }

    return "#f8fafc";
  };
  const normalizeX = (bar: number): number => {
    return padX + ((bar - minBar) / barSpan) * (width - padX * 2);
  };
  const normalizeY = (value: number): number => {
    return padY + ((maxY - value) / Math.max(0.000001, maxY - minY)) * (height - padY * 2);
  };

  const segments = data.slice(1).map((point, index) => {
    const previous = data[index]!;
    const tone = toneByDelta(point.price - previous.price);

    return {
      x1: normalizeX(previous.bar),
      y1: normalizeY(previous.price),
      x2: normalizeX(point.bar),
      y2: normalizeY(point.price),
      tone
    };
  });

  const entryPoint = data.find((point) => point.bar === 0) ?? data[0]!;
  const exitPoint = data[data.length - 1]!;
  const entryX = normalizeX(entryPoint.bar);
  const exitX = normalizeX(exitPoint.bar);
  const entryY = normalizeY(trade.entryPrice);
  const exitY = normalizeY(trade.outcomePrice);
  const targetY = normalizeY(trade.targetPrice);
  const stopY = normalizeY(trade.stopPrice);
  const revealWidth = width * reveal;

  return (
    <div className="backtest-trade-mini-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trade price movement">
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={revealWidth} height={height} />
          </clipPath>
        </defs>
        <rect
          x="0.5"
          y="0.5"
          width={width - 1}
          height={height - 1}
          rx="14"
          fill="rgba(0,0,0,0.88)"
          stroke="rgba(255,255,255,0.08)"
        />
        <line x1={padX} x2={width - padX} y1={targetY} y2={targetY} stroke="#34d399" strokeDasharray="4 6" />
        <line
          x1={padX}
          x2={width - padX}
          y1={entryY}
          y2={entryY}
          stroke="rgba(163,163,163,0.9)"
          strokeDasharray="4 6"
        />
        <line x1={padX} x2={width - padX} y1={stopY} y2={stopY} stroke="#f87171" strokeDasharray="4 6" />
        <g clipPath={`url(#${clipId})`}>
          {segments.map((segment, index) => (
            <line
              key={`${trade.id}-segment-${index}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={colorByTone(segment.tone)}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
          <circle cx={entryX} cy={entryY} r="4" fill="#f8fafc" />
          <circle cx={exitX} cy={exitY} r="4" fill={trade.pnlUsd >= 0 ? "#34d399" : "#f87171"} />
        </g>
        <text
          x={width - padX}
          y={height - 9}
          fill="rgba(156,163,175,0.92)"
          fontSize="11"
          textAnchor="end"
          fontFamily={AI_ZIP_MONO_FONT}
        >
          Minutes since entry
        </text>
      </svg>
    </div>
  );
};

const generateTradeBlueprints = (
  model: ModelProfile,
  total = BACKTEST_TARGET_TRADES,
  nowMs = floorToTimeframe(Date.now(), "1m")
): TradeBlueprint[] => {
  const rand = createSeededRng(hashString(`blueprints-${model.id}`));
  const blueprints: TradeBlueprint[] = [];
  const usedTimes = new Set<number>();
  const lookbackMinutes = BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60;
  const spacingMinutes = Math.max(180, lookbackMinutes / Math.max(1, total));

  for (let i = 0; i < total; i += 1) {
    const symbol = futuresAssets[Math.floor(rand() * futuresAssets.length)].symbol;
    const side: TradeSide = rand() <= model.longBias ? "Long" : "Short";
    const result: TradeResult = rand() <= model.winRate ? "Win" : "Loss";
    const rr = model.rrMin + rand() * (model.rrMax - model.rrMin);
    const riskPct = model.riskMin + rand() * (model.riskMax - model.riskMin);
    const holdMinutes = 35 + Math.floor(rand() * Math.max(720, spacingMinutes * 0.75));
    const baseOffsetMinutes = Math.round((i + 1) * spacingMinutes);
    const jitterWindow = Math.max(45, Math.floor(spacingMinutes * 0.45));
    const jitter = Math.floor((rand() - 0.5) * jitterWindow);
    const exitOffsetMinutes = Math.max(45, baseOffsetMinutes + jitter);
    const exitMs = floorToTimeframe(nowMs - exitOffsetMinutes * 60_000, "1m");
    const uniqueExitMs = usedTimes.has(exitMs) ? exitMs - (i + 1) * 60_000 : exitMs;
    usedTimes.add(uniqueExitMs);
    const entryMs = uniqueExitMs - holdMinutes * 60_000;
    const units = 0.4 + rand() * 3.6;

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

const summarizeBacktestTrades = (trades: HistoryItem[]) => {
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
    totalConfidence += getTradeConfidenceScore(trade) * 100;
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

  if (tab === "models") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="8" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.2" cy="8.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 17.8c.6-2 2-3.1 3.5-3.1h.1c1.6 0 2.9 1.1 3.5 3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12.8 17.4c.5-1.6 1.6-2.5 2.9-2.5h.1c1.4 0 2.4.9 2.9 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
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
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedModelId, setSelectedModelId] = useState(modelProfiles[0]?.id ?? "");
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [selectedSurfaceTab, setSelectedSurfaceTab] = useState<SurfaceTab>("chart");
  const [selectedBacktestTab, setSelectedBacktestTab] = useState<BacktestTab>("mainSettings");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [showActiveTradeOnChart, setShowActiveTradeOnChart] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestSeriesMap, setBacktestSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestHistoryQuery, setBacktestHistoryQuery] = useState("");
  const [backtestHistoryCollapsed, setBacktestHistoryCollapsed] = useState(false);
  const [hoveredBacktestHistoryId, setHoveredBacktestHistoryId] = useState<string | null>(null);
  const [activeBacktestTradeDetails, setActiveBacktestTradeDetails] = useState<
    Record<string, unknown> | null
  >(null);
  const [statsDateStart, setStatsDateStart] = useState("");
  const [statsDateEnd, setStatsDateEnd] = useState("");
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
  const [aiMode, setAiMode] = useState<"off" | "knn" | "hdbscan">("knn");
  const [aiModelEnabled, setAiModelEnabled] = useState(true);
  const [aiFilterEnabled, setAiFilterEnabled] = useState(true);
  const [staticLibrariesClusters, setStaticLibrariesClusters] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(42);
  const [aiExitStrictness, setAiExitStrictness] = useState(18);
  const [aiExitLossTolerance, setAiExitLossTolerance] = useState(0);
  const [aiExitWinTolerance, setAiExitWinTolerance] = useState(0);
  const [useMitExit, setUseMitExit] = useState(false);
  const [complexity, setComplexity] = useState(58);
  const [volatilityPercentile, setVolatilityPercentile] = useState(30);
  const [tpDollars, setTpDollars] = useState(220);
  const [slDollars, setSlDollars] = useState(120);
  const [dollarsPerMove, setDollarsPerMove] = useState(100);
  const [maxBarsInTrade, setMaxBarsInTrade] = useState(32);
  const [methodSettingsOpen, setMethodSettingsOpen] = useState(false);
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [featuresModalOpen, setFeaturesModalOpen] = useState(false);
  const [librariesModalOpen, setLibrariesModalOpen] = useState(false);
  const [selectedAiModels, setSelectedAiModels] = useState<string[]>(() => {
    return availableAiModelNames.slice(0, Math.min(availableAiModelNames.length, 3));
  });
  const [selectedAiFeatures, setSelectedAiFeatures] = useState<string[]>(() => {
    return AI_FEATURE_OPTIONS.map((feature) => feature.id);
  });
  const [selectedAiLibraries, setSelectedAiLibraries] = useState<string[]>([
    "core",
    "recent",
    "base"
  ]);
  const [selectedAiLibraryId, setSelectedAiLibraryId] = useState("core");
  const [chunkBars, setChunkBars] = useState(24);
  const [distanceMetric, setDistanceMetric] = useState<AiDistanceMetric>("euclidean");
  const [selectedAiModalities, setSelectedAiModalities] = useState<string[]>([
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
  const [entryExitChartMode, setEntryExitChartMode] = useState<EntryExitChartMode>("Entry");
  const [hoveredEntryExitBucket, setHoveredEntryExitBucket] = useState<string | null>(null);
  const [dimSearch, setDimSearch] = useState("");
  const [dimScope, setDimScope] = useState<DimensionScope>("active");
  const [dimSortCol, setDimSortCol] = useState<DimensionSortColumn>("corr");
  const [dimSortDir, setDimSortDir] = useState<-1 | 1>(-1);
  const [scatterXKey, setScatterXKey] = useState<BacktestScatterKey>("duration");
  const [scatterYKey, setScatterYKey] = useState<BacktestScatterKey>("pnl");
  const [isGraphsCollapsed, setIsGraphsCollapsed] = useState(false);
  const [hoveredScatterPointId, setHoveredScatterPointId] = useState<string | null>(null);
  const [propProjectionMethod, setPropProjectionMethod] = useState<"historical" | "montecarlo">(
    "montecarlo"
  );
  const [propResult, setPropResult] = useState<PropFirmResult | null>(null);
  const [propStats, setPropStats] = useState<PropFirmStats | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
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
  const chartSizeRef = useRef({ width: 0, height: 0 });
  const chartDataLengthRef = useRef(0);
  const chartSyncedLastTimeRef = useRef<UTCTimestamp | null>(null);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);
  const selectedModel = useMemo(() => {
    return modelProfiles.find((model) => model.id === selectedModelId) ?? modelProfiles[0]!;
  }, [modelProfiles, selectedModelId]);
  const aiDisabled = aiMode === "off";
  const selectedAiModelCount = selectedAiModels.length;
  const selectedAiFeatureCount = selectedAiFeatures.length;
  const selectedAiLibraryCount = selectedAiLibraries.length;
  const availableAiLibraries = useMemo(() => {
    return AI_LIBRARY_OPTIONS.filter((library) => !selectedAiLibraries.includes(library.id));
  }, [selectedAiLibraries]);
  const selectedAiLibrary = useMemo(() => {
    return AI_LIBRARY_OPTIONS.find((library) => library.id === selectedAiLibraryId) ?? null;
  }, [selectedAiLibraryId]);

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

  const addAiLibrary = (libraryId: string) => {
    setSelectedAiLibraries((current) => {
      if (current.includes(libraryId)) {
        return current;
      }

      return [...current, libraryId];
    });
    setSelectedAiLibraryId(libraryId);
  };

  const removeAiLibrary = (libraryId: string) => {
    setSelectedAiLibraries((current) => current.filter((id) => id !== libraryId));
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

  useEffect(() => {
    if (!modelProfiles.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(modelProfiles[0]?.id ?? "");
    }
  }, [modelProfiles, selectedModelId]);

  useEffect(() => {
    setSelectedAiModels((current) => {
      const next = current.filter((name) => availableAiModelNames.includes(name));

      if (next.length > 0) {
        return next;
      }

      return availableAiModelNames.slice(0, Math.min(availableAiModelNames.length, 3));
    });
  }, [availableAiModelNames]);

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

    const connect = async () => {
      void (async () => {
        try {
          const deepHistoryCandles = await fetchBacktestHistoryCandles(selectedTimeframe);

          if (!cancelled && deepHistoryCandles.length >= MIN_SEED_CANDLES) {
            setBacktestSeriesMap((prev) => ({
              ...prev,
              [key]: deepHistoryCandles
            }));
          }
        } catch {
          // Backtest falls back to chart history if deep history cannot load.
        }
      })();

      try {
        const historicalCandles = await fetchHistoryCandles(selectedTimeframe);

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

  const selectedCandles = useMemo(() => {
    return seriesMap[selectedKey] ?? EMPTY_CANDLES;
  }, [selectedKey, seriesMap]);

  const selectedBacktestCandles = useMemo(() => {
    return backtestSeriesMap[selectedKey] ?? seriesMap[selectedKey] ?? EMPTY_CANDLES;
  }, [backtestSeriesMap, selectedKey, seriesMap]);

  const deepChartCandles = backtestSeriesMap[selectedKey] ?? null;
  const usesDeepChartHistory = (deepChartCandles?.length ?? 0) > 0;
  const selectedChartCandles = useMemo(() => {
    return usesDeepChartHistory ? deepChartCandles ?? EMPTY_CANDLES : selectedCandles;
  }, [deepChartCandles, selectedCandles, usesDeepChartHistory]);

  const candleByUnix = useMemo(() => {
    const map = new Map<number, Candle>();

    for (const candle of selectedChartCandles) {
      map.set(toUtcTimestamp(candle.time), candle);
    }

    return map;
  }, [selectedChartCandles]);

  const latestCandle = selectedCandles[selectedCandles.length - 1] ?? null;
  const previousCandle =
    selectedCandles.length > 1 ? selectedCandles[selectedCandles.length - 2] : latestCandle;

  const quoteChange =
    latestCandle && previousCandle && previousCandle.close > 0
      ? ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100
      : 0;

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
    return generateTradeBlueprints(
      selectedModel,
      BACKTEST_TARGET_TRADES,
      floorToTimeframe(referenceNowMs, "1m")
    );
  }, [referenceNowMs, selectedModel]);

  const activeTrade = useMemo<ActiveTrade | null>(() => {
    if (selectedCandles.length < 70) {
      return null;
    }

    const latestIndex = selectedCandles.length - 1;
    const latest = selectedCandles[latestIndex];
    const rand = createSeededRng(hashString(`active-${selectedModel.id}-${selectedSymbol}`));
    const nowMs = floorToTimeframe(referenceNowMs, "1m");
    const lookbackMinutes = 28 + Math.floor(rand() * 520);
    let entryIndex = findCandleIndexAtOrBefore(selectedCandles, nowMs - lookbackMinutes * 60_000);

    if (entryIndex < 22 || entryIndex >= latestIndex - 4) {
      const fallbackBars = 28 + Math.floor(rand() * Math.max(8, Math.min(220, latestIndex - 30)));
      entryIndex = Math.max(20, latestIndex - fallbackBars);
    }

    const entryPrice = selectedCandles[entryIndex].close;
    const side: TradeSide = rand() <= selectedModel.longBias ? "Long" : "Short";
    const rr = selectedModel.rrMin + rand() * (selectedModel.rrMax - selectedModel.rrMin);

    let atr = 0;
    let atrCount = 0;

    for (let i = Math.max(1, entryIndex - 28); i <= entryIndex; i += 1) {
      atr += selectedCandles[i].high - selectedCandles[i].low;
      atrCount += 1;
    }

    atr /= Math.max(1, atrCount);

    let riskPerUnit = Math.max(
      entryPrice * (selectedModel.riskMin + rand() * (selectedModel.riskMax - selectedModel.riskMin)),
      atr * (0.75 + rand() * 1.1)
    );

    let stopPrice = side === "Long" ? Math.max(0.000001, entryPrice - riskPerUnit) : entryPrice + riskPerUnit;
    let targetPrice =
      side === "Long"
        ? entryPrice + riskPerUnit * rr
        : Math.max(0.000001, entryPrice - riskPerUnit * rr);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const path = evaluateTpSlPath(
        selectedCandles,
        side,
        entryIndex,
        targetPrice,
        stopPrice,
        latestIndex
      );

      if (!path.hit) {
        break;
      }

      riskPerUnit *= 1.22;
      stopPrice =
        side === "Long" ? Math.max(0.000001, entryPrice - riskPerUnit) : entryPrice + riskPerUnit;
      targetPrice =
        side === "Long"
          ? entryPrice + riskPerUnit * rr
          : Math.max(0.000001, entryPrice - riskPerUnit * rr);
    }

    const maxRiskUsd = 60 + rand() * 240;
    const maxNotionalUsd = 1400 + rand() * 5200;
    const units = Math.max(
      0.001,
      Math.min(
        maxRiskUsd / Math.max(0.000001, riskPerUnit),
        maxNotionalUsd / Math.max(0.000001, entryPrice)
      )
    );
    const markPrice = latest.close;
    const pnlPct =
      side === "Long"
        ? ((markPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - markPrice) / entryPrice) * 100;
    const pnlValue = side === "Long" ? (markPrice - entryPrice) * units : (entryPrice - markPrice) * units;
    const progressRaw =
      side === "Long"
        ? (markPrice - stopPrice) / Math.max(0.000001, targetPrice - stopPrice)
        : (stopPrice - markPrice) / Math.max(0.000001, stopPrice - targetPrice);
    const openedAt = toUtcTimestamp(selectedCandles[entryIndex].time);

    return {
      symbol: selectedSymbol,
      side,
      units,
      entryPrice,
      markPrice,
      targetPrice,
      stopPrice,
      openedAt,
      openedAtLabel: formatDateTime(selectedCandles[entryIndex].time),
      elapsed: formatElapsed(Number(openedAt), Math.floor(referenceNowMs / 1000)),
      pnlPct,
      pnlValue,
      progressPct: clamp(progressRaw * 100, 0, 100),
      rr
    };
  }, [referenceNowMs, selectedCandles, selectedModel, selectedSymbol]);

  const historyRows = useMemo(() => {
    const rows: HistoryItem[] = [];

    for (const blueprint of tradeBlueprints) {
      const key = symbolTimeframeKey(blueprint.symbol, selectedTimeframe);
      const list = backtestSeriesMap[key] ?? seriesMap[key] ?? [];

      if (list.length < 16) {
        continue;
      }

      const entryIndex = findCandleIndexAtOrBefore(list, blueprint.entryMs);
      const rawExitIndex = findCandleIndexAtOrBefore(list, blueprint.exitMs);

      if (entryIndex < 0 || rawExitIndex < 0) {
        continue;
      }

      const exitIndex = Math.min(list.length - 1, Math.max(entryIndex + 1, rawExitIndex));

      if (exitIndex <= entryIndex) {
        continue;
      }

      const entryPrice = list[entryIndex].close;
      const rand = createSeededRng(hashString(`mapped-${blueprint.id}`));
      let atr = 0;
      let atrCount = 0;

      for (let i = Math.max(1, entryIndex - 20); i <= entryIndex; i += 1) {
        atr += list[i].high - list[i].low;
        atrCount += 1;
      }

      atr /= Math.max(1, atrCount);

      const riskPerUnit = Math.max(
        entryPrice * blueprint.riskPct,
        atr * (0.6 + rand() * 0.6),
        entryPrice * 0.0009
      );
      const stopPrice =
        blueprint.side === "Long"
          ? Math.max(0.000001, entryPrice - riskPerUnit)
          : entryPrice + riskPerUnit;
      const targetPrice =
        blueprint.side === "Long"
          ? entryPrice + riskPerUnit * blueprint.rr
          : Math.max(0.000001, entryPrice - riskPerUnit * blueprint.rr);
      const path = evaluateTpSlPath(
        list,
        blueprint.side,
        entryIndex,
        targetPrice,
        stopPrice,
        exitIndex
      );

      const resolvedExitIndex = path.hit ? path.hitIndex : exitIndex;
      const rawOutcomePrice = path.hit ? path.outcomePrice : list[resolvedExitIndex].close;
      const outcomePrice = Math.max(0.000001, rawOutcomePrice);
      const exitReason = path.hit ? (path.result === "Loss" ? "SL" : "TP") : "Model Exit";
      const result: TradeResult = path.hit
        ? (path.result ?? "Loss")
        : blueprint.side === "Long"
          ? outcomePrice >= entryPrice
            ? "Win"
            : "Loss"
          : outcomePrice <= entryPrice
            ? "Win"
            : "Loss";
      const pnlPct =
        blueprint.side === "Long"
          ? ((outcomePrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - outcomePrice) / entryPrice) * 100;
      const pnlUsd =
        blueprint.side === "Long"
          ? (outcomePrice - entryPrice) * blueprint.units
          : (entryPrice - outcomePrice) * blueprint.units;

      rows.push({
        id: blueprint.id,
        symbol: blueprint.symbol,
        side: blueprint.side,
        result,
        entrySource: selectedModel.name,
        exitReason,
        pnlPct,
        pnlUsd,
        entryTime: toUtcTimestamp(list[entryIndex].time),
        exitTime: toUtcTimestamp(list[resolvedExitIndex].time),
        entryPrice,
        targetPrice,
        stopPrice,
        outcomePrice,
        units: blueprint.units,
        entryAt: formatDateTime(list[entryIndex].time),
        exitAt: formatDateTime(list[resolvedExitIndex].time),
        time: formatDateTime(list[resolvedExitIndex].time)
      });
    }

    return rows
      .sort((a, b) => Number(b.exitTime) - Number(a.exitTime))
      .slice(0, BACKTEST_TARGET_TRADES);
  }, [backtestSeriesMap, selectedModel.name, selectedTimeframe, seriesMap, tradeBlueprints]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return historyRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [historyRows, selectedHistoryId]);

  const currentSymbolHistoryRows = useMemo(() => {
    return historyRows.filter((row) => row.symbol === selectedSymbol);
  }, [historyRows, selectedSymbol]);

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
      confidence: getTradeConfidenceScore(trade),
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

    for (const trade of historyRows) {
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
  }, [historyRows, selectedTimeframe]);

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

  useEffect(() => {
    if (!selectedHistoryId) {
      return;
    }

    if (!historyRows.some((row) => row.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [historyRows, selectedHistoryId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    setShowActiveTradeOnChart(false);
    setActiveBacktestTradeDetails(null);
    focusTradeIdRef.current = null;
  }, [selectedModelId]);

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
    const container = chartContainerRef.current;

    if (!container || chartRef.current) {
      return;
    }

    const initialWidth = Math.max(1, Math.floor(container.clientWidth));
    const initialHeight = Math.max(1, Math.floor(container.clientHeight));

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#090d13" },
        textColor: "#7f889d"
      },
      localization: {
        priceFormatter: (price: number) => formatPrice(price)
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
        rightOffset: 3
      },
      crosshair: {
        mode: CrosshairMode.Normal,
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
      priceLineVisible: false,
      lastValueVisible: true
    });

    const tradeEntryLine = chart.addLineSeries({
      color: "rgba(232, 238, 250, 0.72)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeTargetLine = chart.addLineSeries({
      color: "rgba(53, 201, 113, 0.95)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeStopLine = chart.addLineSeries({
      color: "rgba(255, 76, 104, 0.95)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradePathLine = chart.addLineSeries({
      color: "rgba(220, 230, 248, 0.82)",
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
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

    chart.subscribeCrosshairMove(onCrosshairMove);
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

    return () => {
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
      }
      window.removeEventListener("resize", queueResizeFromContainer);
      document.removeEventListener("fullscreenchange", queueResizeFromContainer);
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
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
      chartDataLengthRef.current = 0;
      chartSyncedLastTimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    if (!chart || !candleSeries) {
      return;
    }

    if (selectedChartCandles.length === 0) {
      candleSeries.setData([]);
      chartDataLengthRef.current = 0;
      chartSyncedLastTimeRef.current = null;
      return;
    }

    const candleData: CandlestickData<UTCTimestamp>[] = selectedChartCandles.map((candle) => ({
      time: toUtcTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));

    candleSeries.setData(candleData);
    chartDataLengthRef.current = candleData.length;
    chartSyncedLastTimeRef.current = candleData[candleData.length - 1]?.time ?? null;

    const selection = `${selectedSymbol}-${selectedTimeframe}`;

    if (selectionRef.current !== selection) {
      const to = candleData.length - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);

      chart.applyOptions({
        rightPriceScale: {
          autoScale: true
        }
      });
      chart.timeScale().setVisibleLogicalRange({ from, to });
      selectionRef.current = selection;
    }
  }, [selectedChartCandles, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const syncedTime = chartSyncedLastTimeRef.current;

    if (!candleSeries || !usesDeepChartHistory || selectedCandles.length === 0 || syncedTime === null) {
      return;
    }

    const toDataPoint = (candle: Candle): CandlestickData<UTCTimestamp> => ({
      time: toUtcTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    });

    let startIndex = selectedCandles.length - 1;

    while (startIndex >= 0 && toUtcTimestamp(selectedCandles[startIndex]!.time) > syncedTime) {
      startIndex -= 1;
    }

    if (startIndex >= 0 && toUtcTimestamp(selectedCandles[startIndex]!.time) === syncedTime) {
      candleSeries.update(toDataPoint(selectedCandles[startIndex]!));
      startIndex += 1;
    } else {
      startIndex += 1;
    }

    if (startIndex >= selectedCandles.length) {
      return;
    }

    let appended = 0;

    for (let i = startIndex; i < selectedCandles.length; i += 1) {
      candleSeries.update(toDataPoint(selectedCandles[i]!));
      appended += 1;
    }

    if (appended > 0) {
      chartDataLengthRef.current += appended;
      chartSyncedLastTimeRef.current = toUtcTimestamp(selectedCandles[selectedCandles.length - 1]!.time);
    }
  }, [selectedCandles, usesDeepChartHistory]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    chart.applyOptions({
      rightPriceScale: {
        autoScale: true
      }
    });
  }, [selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "r") {
        return;
      }

      event.preventDefault();

      const chart = chartRef.current;

      const chartLength = chartDataLengthRef.current;

      if (!chart || chartLength === 0) {
        return;
      }

      const to = chartLength - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);
      chart.timeScale().setVisibleLogicalRange({ from, to });
      focusTradeIdRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedTimeframe]);

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
    const exitIndex = exitIndexRaw >= 0 ? exitIndexRaw : entryIndex + 1;

    if (entryIndex < 0) {
      return;
    }

    const leftBound = Math.min(entryIndex, exitIndex);
    const rightBound = Math.max(entryIndex, exitIndex);
    const span = Math.max(32, Math.round(timeframeVisibleCount[selectedTimeframe] * 0.72));
    const from = Math.max(0, leftBound - Math.round(span * 0.4));
    const to = Math.min(selectedChartCandles.length - 1, rightBound + Math.round(span * 0.6));
    chart.timeScale().setVisibleLogicalRange({ from, to });
    focusTradeIdRef.current = null;
  }, [
    candleIndexByUnix,
    selectedChartCandles.length,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;

    if (!chart || !container || selectedSurfaceTab !== "chart") {
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

    const createMultiTradeSeries = (): MultiTradeOverlaySeries => {
      const entryLine = chart.addLineSeries({
        color: "rgba(232, 238, 250, 0.62)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const targetLine = chart.addLineSeries({
        color: "rgba(53, 201, 113, 0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const stopLine = chart.addLineSeries({
        color: "rgba(255, 76, 104, 0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const pathLine = chart.addLineSeries({
        color: "rgba(220, 230, 248, 0.64)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
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
      const startTime = trade.entryTime;
      const endTime =
        trade.exitTime > trade.entryTime
          ? trade.exitTime
          : ((trade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);
      const entryAction = trade.side === "Long" ? "Buy" : "Sell";
      const tradeZoneData = [
        { time: startTime, value: trade.targetPrice },
        { time: endTime, value: trade.targetPrice }
      ];
      const stopZoneData = [
        { time: startTime, value: trade.stopPrice },
        { time: endTime, value: trade.stopPrice }
      ];
      const derivedResult: TradeResult =
        trade.status === "pending" ? (trade.pnlUsd >= 0 ? "Win" : "Loss") : trade.result;
      const exitPrefix = derivedResult === "Win" ? "✓" : "x";
      const exitPosition = getExitMarkerPosition(trade.side, derivedResult);
      clearMultiTradeOverlays();

      candleSeries.setMarkers([
        {
          time: startTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#30b76f" : "#f0455a",
          text: entryAction
        },
        {
          time: endTime,
          position: exitPosition,
          shape: "square",
          color: derivedResult === "Win" ? "#35c971" : "#f0455a",
          text: `${exitPrefix} ${formatSignedUsd(trade.pnlUsd)}`
        }
      ]);

      applyTradeZonePalette(trade.side, trade.entryPrice);
      tradeEntryLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: endTime, value: trade.entryPrice }
      ]);
      tradeTargetLine.setData(tradeZoneData);
      tradeStopLine.setData(stopZoneData);
      tradePathLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: endTime, value: trade.outcomePrice }
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
        const endTime =
          trade.exitTime > trade.entryTime
            ? trade.exitTime
            : ((trade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);
        const targetData = [
          { time: trade.entryTime, value: trade.targetPrice },
          { time: endTime, value: trade.targetPrice }
        ];
        const stopData = [
          { time: trade.entryTime, value: trade.stopPrice },
          { time: endTime, value: trade.stopPrice }
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
          { time: trade.entryTime, value: trade.entryPrice },
          { time: endTime, value: trade.entryPrice }
        ]);
        seriesGroup.targetLine.setData(targetData);
        seriesGroup.stopLine.setData(stopData);
        seriesGroup.pathLine.setData([
          { time: trade.entryTime, value: trade.entryPrice },
          { time: endTime, value: trade.outcomePrice }
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
          time: trade.entryTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#35c971" : "#f0455a",
          text: trade.side === "Long" ? "Buy" : "Sell"
        });
        allMarkers.push({
          time: endTime,
          position: getExitMarkerPosition(trade.side, tradeResult),
          shape: "square",
          color: tradeResult === "Win" ? "#35c971" : "#f0455a",
          text: `${tradeResult === "Win" ? "✓" : "x"} ${formatSignedUsd(trade.pnlUsd)}`
        });
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
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe,
    showActiveTradeOnChart,
    showAllTradesOnChart
  ]);

  const backtestSourceTrades = useMemo(() => {
    return [...historyRows].sort((a, b) => Number(a.exitTime) - Number(b.exitTime));
  }, [historyRows]);

  const backtestTimeFilteredTrades = useMemo(() => {
    return backtestSourceTrades.filter((trade) => {
      const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
      const session = getSessionLabel(trade.entryTime);
      const monthIndex = getTradeMonthIndex(trade.exitTime);
      const entryHour = getTradeHour(trade.entryTime);
      return (
        enabledBacktestWeekdays.includes(weekday) &&
        enabledBacktestSessions.includes(session) &&
        enabledBacktestMonths.includes(monthIndex) &&
        enabledBacktestHours.includes(entryHour)
      );
    });
  }, [
    backtestSourceTrades,
    enabledBacktestHours,
    enabledBacktestMonths,
    enabledBacktestSessions,
    enabledBacktestWeekdays
  ]);

  const backtestTrades = useMemo(() => {
    return backtestTimeFilteredTrades.filter((trade) => {
      const confidence = getTradeConfidenceScore(trade) * 100;
      return !aiFilterEnabled || confidence >= confidenceThreshold;
    });
  }, [aiFilterEnabled, backtestTimeFilteredTrades, confidenceThreshold]);

  const mainStatsTrades = useMemo(() => {
    const startMs = getUtcDayStartMs(statsDateStart);
    const endExclusiveMs = getUtcDayEndExclusiveMs(statsDateEnd);

    return backtestTrades.filter((trade) => {
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
  }, [backtestTrades, statsDateEnd, statsDateStart]);

  const baselineMainStatsTrades = useMemo(() => {
    const startMs = getUtcDayStartMs(statsDateStart);
    const endExclusiveMs = getUtcDayEndExclusiveMs(statsDateEnd);

    return backtestTimeFilteredTrades.filter((trade) => {
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
  }, [backtestTimeFilteredTrades, statsDateEnd, statsDateStart]);

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
    return summarizeBacktestTrades(backtestTrades);
  }, [backtestTrades]);

  const baselineMainStatsSummary = useMemo(() => {
    return summarizeBacktestTrades(baselineMainStatsTrades);
  }, [baselineMainStatsTrades]);

  const mainStatsSummary = useMemo(() => {
    return summarizeBacktestTrades(mainStatsTrades);
  }, [mainStatsTrades]);

  const mainStatsTitle = useMemo(() => {
    if (!statsDateStart && !statsDateEnd) {
      return "Stats (All Trades)";
    }

    const startLabel = statsDateStart ? formatStatsDateLabel(statsDateStart) : "Start";
    const endLabel = statsDateEnd ? formatStatsDateLabel(statsDateEnd) : "End";
    return `Stats (${startLabel} -> ${endLabel})`;
  }, [statsDateEnd, statsDateStart]);

  const mainStatsSessionRows = useMemo(() => {
    const map = new Map<string, { label: string; total: number; trades: number }>();

    for (const trade of mainStatsTrades) {
      const label = getSessionLabel(trade.entryTime);
      const current = map.get(label) ?? { label, total: 0, trades: 0 };
      current.total += trade.pnlUsd;
      current.trades += 1;
      map.set(label, current);
    }

    return Array.from(map.values()).sort((left, right) => right.total - left.total);
  }, [mainStatsTrades]);

  const mainStatsMonthRows = useMemo(() => {
    const map = new Map<string, { key: string; total: number; trades: number }>();

    for (const trade of mainStatsTrades) {
      const key = getTradeMonthKey(trade.exitTime);
      const current = map.get(key) ?? { key, total: 0, trades: 0 };
      current.total += trade.pnlUsd;
      current.trades += 1;
      map.set(key, current);
    }

    return Array.from(map.values()).sort((left, right) => left.key.localeCompare(right.key));
  }, [mainStatsTrades]);

  const mainStatsAiEfficiency = useMemo(() => {
    if (aiMode === "off" || mainStatsTrades.length < 10) {
      return null;
    }

    const points = mainStatsTrades.map((trade) => ({
      score: getTradeConfidenceScore(trade),
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
  }, [aiMode, mainStatsTrades]);

  const mainStatsAiEffectivenessPct = useMemo(() => {
    if (aiMode === "off" || !aiFilterEnabled) {
      return null;
    }

    if (baselineMainStatsTrades.length < 5 || mainStatsTrades.length < 5) {
      return null;
    }

    return mainStatsSummary.winRate - baselineMainStatsSummary.winRate;
  }, [
    aiFilterEnabled,
    aiMode,
    baselineMainStatsSummary.winRate,
    baselineMainStatsTrades.length,
    mainStatsSummary.winRate,
    mainStatsTrades.length
  ]);

  const mainStatsAiEfficacyPct = useMemo(() => {
    if (aiMode === "off" || !aiFilterEnabled) {
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
    aiFilterEnabled,
    aiMode,
    baselineMainStatsSummary.totalPnl,
    baselineMainStatsTrades.length,
    mainStatsSummary.totalPnl,
    mainStatsTrades.length
  ]);

  const mainStatisticsCards = useMemo(() => {
    const hasTrades = mainStatsSummary.tradeCount > 0;
    const totalPnlTone =
      !hasTrades ? "neutral" : mainStatsSummary.totalPnl >= 0 ? "up" : "down";
    const modelSummaryValue = hasTrades
      ? `${selectedModel.name} · ${formatSignedUsd(mainStatsSummary.totalPnl)} · ${
          mainStatsSummary.tradeCount
        } trades`
      : "—";
    const modelPnlValue = hasTrades
      ? `${selectedModel.name} · ${formatSignedUsd(mainStatsSummary.totalPnl)} · avg ${formatSignedUsd(
          mainStatsSummary.avgPnl
        )}`
      : "—";
    const bestSessionRow = mainStatsSessionRows[0] ?? null;
    const worstSessionRow =
      mainStatsSessionRows.length > 0 ? mainStatsSessionRows[mainStatsSessionRows.length - 1] : null;
    const sessionPnlValue = bestSessionRow
      ? `${bestSessionRow.label} · ${formatSignedUsd(bestSessionRow.total)} · ${
          bestSessionRow.trades
        } trades · avg ${formatSignedUsd(bestSessionRow.total / Math.max(1, bestSessionRow.trades))}`
      : "—";
    const monthRowsByPnl = [...mainStatsMonthRows].sort((left, right) => right.total - left.total);
    const bestMonthRow = monthRowsByPnl[0] ?? null;
    const worstMonthRow =
      monthRowsByPnl.length > 0 ? monthRowsByPnl[monthRowsByPnl.length - 1] : null;
    const monthFocusRow = mainStatsMonthRows.length > 0 ? mainStatsMonthRows[mainStatsMonthRows.length - 1] : null;
    const monthPnlValue = monthFocusRow
      ? `${getMonthLabel(monthFocusRow.key)} · ${formatSignedUsd(monthFocusRow.total)} · ${
          monthFocusRow.trades
        } trades · avg ${formatSignedUsd(monthFocusRow.total / Math.max(1, monthFocusRow.trades))}`
      : "—";

    return [
      {
        label: "Total PnL",
        value: formatSignedUsd(mainStatsSummary.totalPnl),
        tone: totalPnlTone,
        span: 4
      },
      {
        label: "Win Rate",
        value: `${mainStatsSummary.winRate.toFixed(2)}%`,
        tone: mainStatsSummary.winRate >= 55 ? "up" : mainStatsSummary.winRate >= 45 ? "neutral" : "down",
        span: 2
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
        span: 2
      },
      {
        label: "Total Trades",
        value: mainStatsSummary.tradeCount.toLocaleString("en-US"),
        tone: "neutral",
        span: 4
      },
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
      },
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
      },
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
      },
      {
        label: "Sharpe",
        value: mainStatsSummary.sharpe.toFixed(2),
        tone: mainStatsSummary.sharpe >= 1 ? "up" : mainStatsSummary.sharpe >= 0 ? "neutral" : "down",
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
      },
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
      },
      {
        label: "Average Win",
        value: `$${formatUsd(mainStatsSummary.avgWin)}`,
        tone: "up",
        span: 2
      },
      {
        label: "Average Loss",
        value: `-$${formatUsd(Math.abs(mainStatsSummary.avgLoss))}`,
        tone: "down",
        span: 2
      },
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
      },
      {
        label: "AI Efficiency",
        value: mainStatsAiEfficiency === null ? "—" : `${Math.round(mainStatsAiEfficiency * 100)}%`,
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
      },
      {
        label: "Best Model",
        value: modelSummaryValue,
        tone: totalPnlTone,
        span: 2
      },
      {
        label: "Worst Model",
        value: modelSummaryValue,
        tone: totalPnlTone,
        span: 2
      },
      {
        label: "Model PnL",
        value: modelPnlValue,
        tone: totalPnlTone,
        span: 4
      },
      {
        label: "Best Session",
        value: bestSessionRow
          ? `${bestSessionRow.label} · ${formatSignedUsd(bestSessionRow.total)} · ${bestSessionRow.trades} trades`
          : "—",
        tone:
          bestSessionRow === null ? "neutral" : bestSessionRow.total >= 0 ? "up" : "down",
        span: 2
      },
      {
        label: "Worst Session",
        value: worstSessionRow
          ? `${worstSessionRow.label} · ${formatSignedUsd(worstSessionRow.total)} · ${worstSessionRow.trades} trades`
          : "—",
        tone:
          worstSessionRow === null ? "neutral" : worstSessionRow.total >= 0 ? "up" : "down",
        span: 2
      },
      {
        label: "Session PnL",
        value: sessionPnlValue,
        tone:
          bestSessionRow === null ? "neutral" : bestSessionRow.total >= 0 ? "up" : "down",
        span: 4
      },
      {
        label: "Best Month",
        value: bestMonthRow
          ? `${getMonthLabel(bestMonthRow.key)} · ${formatSignedUsd(bestMonthRow.total)} · ${bestMonthRow.trades} trades`
          : "—",
        tone:
          bestMonthRow === null ? "neutral" : bestMonthRow.total >= 0 ? "up" : "down",
        span: 2
      },
      {
        label: "Worst Month",
        value: worstMonthRow
          ? `${getMonthLabel(worstMonthRow.key)} · ${formatSignedUsd(worstMonthRow.total)} · ${worstMonthRow.trades} trades`
          : "—",
        tone:
          worstMonthRow === null ? "neutral" : worstMonthRow.total >= 0 ? "up" : "down",
        span: 2
      },
      {
        label: "Month PnL",
        value: monthPnlValue,
        tone:
          monthFocusRow === null ? "neutral" : monthFocusRow.total >= 0 ? "up" : "down",
        span: 4
      },
      {
        label: "Start Date",
        value: backtestRange.startMs === null ? "—" : formatDateTime(backtestRange.startMs),
        tone: "neutral",
        span: 2
      },
      {
        label: "End Date",
        value: backtestRange.endMs === null ? "—" : formatDateTime(backtestRange.endMs),
        tone: "neutral",
        span: 2
      }
    ];
  }, [
    backtestRange.endMs,
    backtestRange.startMs,
    mainStatsAiEfficacyPct,
    mainStatsAiEffectivenessPct,
    mainStatsAiEfficiency,
    mainStatsMonthRows,
    mainStatsSessionRows,
    mainStatsSummary,
    selectedModel.name
  ]);

  const availableBacktestMonths = useMemo(() => {
    const monthKeys = new Set<string>();

    for (const trade of backtestTrades) {
      monthKeys.add(getTradeMonthKey(trade.exitTime));
    }

    return Array.from(monthKeys).sort((a, b) => b.localeCompare(a));
  }, [backtestTrades]);

  const backtestCalendarAgg = useMemo(() => {
    const map = new Map<string, { count: number; wins: number; pnl: number; items: HistoryItem[] }>();

    for (const trade of backtestTrades) {
      const dateKey = getTradeDayKey(trade.exitTime);
      const bucket = map.get(dateKey) ?? { count: 0, wins: 0, pnl: 0, items: [] };
      bucket.count += 1;
      bucket.wins += trade.result === "Win" ? 1 : 0;
      bucket.pnl += trade.pnlUsd;
      bucket.items.push(trade);
      map.set(dateKey, bucket);
    }

    return map;
  }, [backtestTrades]);

  const activeBacktestMonthKey = selectedBacktestMonthKey || getCurrentTradeMonthKey();
  const calendarMonthLabel = getMonthLabel(activeBacktestMonthKey);

  const backtestCalendarGrid = useMemo(() => {
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
  }, [activeBacktestMonthKey, backtestCalendarAgg]);

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
    const bucket = backtestCalendarAgg.get(selectedBacktestDateKey);

    if (!bucket) {
      return [];
    }

    return [...bucket.items].sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
  }, [backtestCalendarAgg, selectedBacktestDateKey]);

  useEffect(() => {
    setExpandedBacktestTradeId((current) => {
      if (!current) {
        return null;
      }

      return selectedBacktestDayTrades.some((trade) => trade.id === current) ? current : null;
    });
  }, [selectedBacktestDayTrades]);

  const filteredBacktestHistory = useMemo(() => {
    const query = backtestHistoryQuery.trim().toLowerCase();

    if (!query) {
      return [...backtestTrades].sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
    }

    return [...backtestTrades]
      .filter((trade) => {
        const haystack = [
          trade.id,
          selectedModel.name,
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
  }, [backtestHistoryQuery, backtestTrades, selectedModel.name]);

  const aiZipClusterCandles = useMemo(() => {
    return selectedChartCandles.map((candle) => ({
      ...candle,
      time: Number(candle.time)
    }));
  }, [selectedChartCandles]);

  const aiZipClusterTrades = useMemo(() => {
    const maxIndex = Math.max(0, selectedChartCandles.length - 1);

    return backtestTrades.map((trade, index) => {
      const fallbackIndex =
        maxIndex > 0
          ? Math.round((index / Math.max(1, backtestTrades.length - 1)) * maxIndex)
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
        entryModel: selectedModel.name,
        chunkType: selectedModel.name,
        model: selectedModel.name,
        exitReason: getBacktestExitLabel(trade),
        entryPrice: trade.entryPrice,
        exitPrice: trade.outcomePrice,
        margin: getTradeConfidenceScore(trade),
        side: trade.side
      };
    });
  }, [backtestTrades, candleIndexByUnix, selectedChartCandles.length, selectedModel.name]);

  useEffect(() => {
    setAiZipClusterTimelineIdx(Math.max(0, aiZipClusterCandles.length - 1));
  }, [aiZipClusterCandles.length]);

  const backtestTemporalStats = useMemo(() => {
    const weekdayRows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => ({
      label,
      count: 0,
      wins: 0,
      pnl: 0
    }));
    const monthRows = backtestMonthLabels.map((label) => ({
      label,
      count: 0,
      wins: 0,
      pnl: 0
    }));
    const hourRows = backtestHourLabels.map((label, hour) => ({
      label,
      hour,
      count: 0,
      wins: 0,
      pnl: 0
    }));
    const sessionMap = new Map<string, { label: string; count: number; wins: number; pnl: number }>();

    for (const label of backtestSessionLabels) {
      sessionMap.set(label, { label, count: 0, wins: 0, pnl: 0 });
    }

    for (const trade of backtestTrades) {
      const date = new Date(Number(trade.exitTime) * 1000);
      const weekday = weekdayRows[date.getUTCDay()];
      const monthRow = monthRows[date.getUTCMonth()];
      const hourRow = hourRows[getTradeHour(trade.entryTime)];
      weekday.count += 1;
      weekday.wins += trade.result === "Win" ? 1 : 0;
      weekday.pnl += trade.pnlUsd;
      monthRow.count += 1;
      monthRow.wins += trade.result === "Win" ? 1 : 0;
      monthRow.pnl += trade.pnlUsd;
      hourRow.count += 1;
      hourRow.wins += trade.result === "Win" ? 1 : 0;
      hourRow.pnl += trade.pnlUsd;

      const session = sessionMap.get(getSessionLabel(trade.entryTime));

      if (session) {
        session.count += 1;
        session.wins += trade.result === "Win" ? 1 : 0;
        session.pnl += trade.pnlUsd;
      }
    }

    const sessions = Array.from(sessionMap.values());

    return {
      weekdays: weekdayRows.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      months: monthRows.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      hours: hourRows.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      sessions: sessions.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      }))
    };
  }, [backtestTrades]);

  const backtestEntryExitStats = useMemo(() => {
    const sideMap = new Map<TradeSide, { side: TradeSide; count: number; wins: number; pnl: number }>();
    const exitMap = new Map<string, number>([
      ["Target Hit", 0],
      ["Protective Stop", 0],
      ["Managed Exit", 0]
    ]);
    let totalEntry = 0;
    let totalExit = 0;
    let totalStopDistance = 0;
    let totalTargetDistance = 0;
    let totalUnits = 0;
    let totalHoldMinutes = 0;

    sideMap.set("Long", { side: "Long", count: 0, wins: 0, pnl: 0 });
    sideMap.set("Short", { side: "Short", count: 0, wins: 0, pnl: 0 });

    for (const trade of backtestTrades) {
      totalEntry += trade.entryPrice;
      totalExit += trade.outcomePrice;
      totalStopDistance += Math.abs(trade.entryPrice - trade.stopPrice);
      totalTargetDistance += Math.abs(trade.targetPrice - trade.entryPrice);
      totalUnits += trade.units;
      totalHoldMinutes += Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);

      const side = sideMap.get(trade.side);

      if (side) {
        side.count += 1;
        side.wins += trade.result === "Win" ? 1 : 0;
        side.pnl += trade.pnlUsd;
      }

      const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
      const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
      const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);
      const exitLabel =
        trade.result === "Win" && realizedGap >= targetGap * 0.84
          ? "Target Hit"
          : trade.result === "Loss" && realizedGap >= stopGap * 0.84
            ? "Protective Stop"
            : "Managed Exit";

      exitMap.set(exitLabel, (exitMap.get(exitLabel) ?? 0) + 1);
    }

    const count = backtestTrades.length;

    return {
      avgEntry: count > 0 ? totalEntry / count : 0,
      avgExit: count > 0 ? totalExit / count : 0,
      avgStopDistance: count > 0 ? totalStopDistance / count : 0,
      avgTargetDistance: count > 0 ? totalTargetDistance / count : 0,
      avgUnits: count > 0 ? totalUnits / count : 0,
      avgHoldMinutes: count > 0 ? totalHoldMinutes / count : 0,
      sides: Array.from(sideMap.values()).map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      exits: Array.from(exitMap.entries()).map(([label, value]) => ({
        label,
        value,
        pct: count > 0 ? (value / count) * 100 : 0
      }))
    };
  }, [backtestTrades]);

  const backtestClusterData = useMemo(() => {
    const holds = backtestTrades.map((trade) =>
      Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60)
    );
    const sortedHolds = [...holds].sort((a, b) => a - b);
    const medianHold =
      sortedHolds.length > 0 ? sortedHolds[Math.floor(sortedHolds.length / 2)] : 0;
    const maxHold = holds.length > 0 ? Math.max(1, ...holds) : 1;
    const maxUnits =
      backtestTrades.length > 0 ? Math.max(1, ...backtestTrades.map((trade) => trade.units)) : 1;
    const maxAbsPnl =
      backtestTrades.length > 0
        ? Math.max(1, ...backtestTrades.map((trade) => Math.abs(trade.pnlPct)))
        : 1;

    const nodes: BacktestClusterNode[] = backtestTrades.map((trade) => {
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
        confidence: getTradeConfidenceScore(trade) * 100,
        session: getSessionLabel(trade.entryTime),
        monthIndex: getTradeMonthIndex(trade.entryTime),
        weekdayIndex: new Date(Number(trade.entryTime) * 1000).getUTCDay(),
        hour: getTradeHour(trade.entryTime),
        sideLabel: trade.side === "Long" ? "Buy" : "Sell"
      };
    });

    return {
      total: backtestTrades.length,
      nodes,
      groups: buildBacktestClusterGroups(nodes)
    };
  }, [backtestTrades]);

  const backtestClusterViewOptions = useMemo(() => {
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
  }, [backtestClusterData.nodes]);

  useEffect(() => {
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
    clusterViewWeekday
  ]);

  const visibleBacktestClusterNodes = useMemo(() => {
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
    clusterViewWeekday
  ]);

  const visibleBacktestClusterGroups = useMemo(() => {
    return buildBacktestClusterGroups(visibleBacktestClusterNodes);
  }, [visibleBacktestClusterNodes]);

  const backtestClusterTableRows = useMemo(() => {
    return [...visibleBacktestClusterGroups].sort((left, right) => {
      if (right.avgPnl !== left.avgPnl) {
        return right.avgPnl - left.avgPnl;
      }

      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return right.winRate - left.winRate;
    });
  }, [visibleBacktestClusterGroups]);

  const backtestClusterCounts = useMemo(() => {
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
  }, [backtestClusterData.total, visibleBacktestClusterNodes]);

  const selectedBacktestClusterNode = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return visibleBacktestClusterNodes.find((node) => node.id === selectedHistoryId) ?? null;
  }, [selectedHistoryId, visibleBacktestClusterNodes]);

  const selectedBacktestClusterGroup = useMemo(() => {
    if (!selectedBacktestClusterGroupId) {
      return null;
    }

    return visibleBacktestClusterGroups.find((group) => group.id === selectedBacktestClusterGroupId) ?? null;
  }, [selectedBacktestClusterGroupId, visibleBacktestClusterGroups]);

  useEffect(() => {
    if (!selectedBacktestClusterGroupId) {
      return;
    }

    if (!visibleBacktestClusterGroups.some((group) => group.id === selectedBacktestClusterGroupId)) {
      setSelectedBacktestClusterGroupId(null);
    }
  }, [selectedBacktestClusterGroupId, visibleBacktestClusterGroups]);

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

  const backtestScatterData = useMemo(() => {
    const modelIndexMap = new Map<string, number>();
    const sessionIndexMap = new Map<string, number>();
    const revModel: Record<number, string> = {};
    const revSession: Record<number, string> = {};

    const points = backtestTrades.map((trade, index) => {
      const modelKey = selectedModel.name;
      const sessionKey = getSessionLabel(trade.entryTime);
      const modelIndex = modelIndexMap.get(modelKey) ?? modelIndexMap.size;
      const sessionIndex = sessionIndexMap.get(sessionKey) ?? sessionIndexMap.size;
      modelIndexMap.set(modelKey, modelIndex);
      sessionIndexMap.set(sessionKey, sessionIndex);
      revModel[modelIndex] = modelKey;
      revSession[sessionIndex] = sessionKey;

      const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
      const durationBars = Math.max(1, holdMinutes / timeframeMinutes[selectedTimeframe]);
      const confidence = getTradeConfidenceScore(trade);
      const aiConfidence = clamp(confidence * (trade.result === "Win" ? 1.03 : 0.97), 0, 1);
      const riskUsd = Math.max(0.01, Math.abs(trade.entryPrice - trade.stopPrice) * trade.units);
      const rrMultiple = trade.pnlUsd / riskUsd;
      const drawdown =
        trade.result === "Loss"
          ? Math.max(Math.abs(trade.pnlUsd), riskUsd)
          : Math.max(riskUsd * 0.35, Math.abs(trade.pnlUsd) * 0.45);

      return {
        id: `${trade.id}-${index}`,
        trade,
        isWin: trade.pnlUsd > 0,
        values: {
          duration: durationBars,
          pnl: trade.pnlUsd,
          margin: confidence,
          aiMargin: aiConfidence,
          drawdown,
          rr: rrMultiple,
          entryPrice: trade.entryPrice,
          exitPrice: trade.outcomePrice,
          model: modelIndex,
          session: sessionIndex
        } satisfies Record<BacktestScatterKey, number>
      };
    });

    return { points, revModel, revSession };
  }, [backtestTrades, selectedModel.name, selectedTimeframe]);

  const backtestScatterVarDefs = useMemo<Record<BacktestScatterKey, BacktestScatterAxisDef>>(() => {
    const formatPercent = (value: number) => `${Math.round(clamp(value, 0, 1) * 100)}%`;

    return {
      duration: {
        label: "Duration (bars)",
        numeric: true,
        tickFormatter: (value) => (Number.isFinite(value) ? String(Math.round(value)) : ""),
        tooltipFormatter: (value) => `${Math.round(value)} bars`
      },
      pnl: {
        label: "PnL",
        numeric: true,
        tickFormatter: (value) => formatSignedUsd(value).replace("$", ""),
        tooltipFormatter: (value) => formatSignedUsd(value)
      },
      margin: {
        label: "Confidence",
        numeric: true,
        tickFormatter: (value) => formatPercent(value),
        tooltipFormatter: (value) => formatPercent(value)
      },
      aiMargin: {
        label: "AI Confidence",
        numeric: true,
        tickFormatter: (value) => formatPercent(value),
        tooltipFormatter: (value) => formatPercent(value)
      },
      drawdown: {
        label: "Drawdown",
        numeric: true,
        tickFormatter: (value) => formatUsd(value).replace("$", ""),
        tooltipFormatter: (value) => `$${formatUsd(value)}`
      },
      rr: {
        label: "R Multiple",
        numeric: true,
        tickFormatter: (value) => value.toFixed(2),
        tooltipFormatter: (value) => value.toFixed(2)
      },
      entryPrice: {
        label: "Entry Price",
        numeric: true,
        tickFormatter: (value) => formatPrice(value),
        tooltipFormatter: (value) => formatPrice(value)
      },
      exitPrice: {
        label: "Exit Price",
        numeric: true,
        tickFormatter: (value) => formatPrice(value),
        tooltipFormatter: (value) => formatPrice(value)
      },
      model: {
        label: "Model",
        numeric: false,
        tickFormatter: (value) => backtestScatterData.revModel[value] ?? String(value),
        tooltipFormatter: (value) => backtestScatterData.revModel[value] ?? String(value)
      },
      session: {
        label: "Session",
        numeric: false,
        tickFormatter: (value) => backtestScatterData.revSession[value] ?? String(value),
        tooltipFormatter: (value) => backtestScatterData.revSession[value] ?? String(value)
      }
    };
  }, [backtestScatterData.revModel, backtestScatterData.revSession]);

  const dimensionStats = useMemo<DimensionStatsSummary | null>(() => {
    if (selectedBacktestTab !== "dimensions") {
      return null;
    }

    const sortedTrades = [...backtestTrades].sort(
      (left, right) => Number(left.entryTime) - Number(right.entryTime)
    );
    const splitAllowed = antiCheatEnabled && validationMode === "split";
    const splitIndex = Math.floor(sortedTrades.length * (DIMENSION_STATS_SPLIT_PCT / 100));
    const evaluationTrades = splitAllowed ? sortedTrades.slice(splitIndex) : sortedTrades;
    const featureLabelById = new Map(AI_FEATURE_OPTIONS.map((option) => [option.id, option.label]));

    const dimensionDefs: Array<{ key: string; featureId: string; featureIndex: number; name: string }> = [];

    for (const featureId of selectedAiFeatures) {
      const names = DIMENSION_FEATURE_NAME_BANK[featureId] ?? [];

      if (names.length === 0) {
        continue;
      }

      const featureLabel = featureLabelById.get(featureId) ?? featureId;

      names.forEach((subName, featureIndex) => {
        dimensionDefs.push({
          key: `${featureId}__${featureIndex}`,
          featureId,
          featureIndex,
          name: `${featureLabel} - ${subName}`
        });
      });
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
        backtestSeriesMap[symbolTimeframeKey(trade.symbol, selectedTimeframe)] ??
        seriesMap[symbolTimeframeKey(trade.symbol, selectedTimeframe)] ??
        EMPTY_CANDLES;

      if (candles.length === 0) {
        continue;
      }

      const entryIndex = findCandleIndexAtOrBefore(candles, Number(trade.entryTime) * 1000);

      if (entryIndex < 0) {
        continue;
      }

      const featureBuckets = buildDimensionFeatureBuckets(candles, entryIndex, chunkBars);

      if (!featureBuckets) {
        continue;
      }

      outcomes.push(trade.result === "Win" ? 1 : 0);

      for (const dimension of dimensionDefs) {
        const values = featureBuckets[dimension.featureId] ?? [];
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
    const outDim = inDim > 0 ? clamp(Math.round(dimensionAmount), 2, inDim) : 0;
    const dimKeyOrder = dimensions.map((dimension) => dimension.key);
    let keptKeys = dimKeyOrder;

    if (outDim < inDim) {
      if (compressionMethod === "subsample") {
        if (outDim <= 1) {
          keptKeys = [dimKeyOrder[0]!];
        } else {
          keptKeys = Array.from({ length: outDim }, (_, index) => {
            const keyIndex = Math.round((index * (inDim - 1)) / Math.max(1, outDim - 1));
            return dimKeyOrder[keyIndex]!;
          });
        }
      } else if (compressionMethod === "variance") {
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
    antiCheatEnabled,
    backtestSeriesMap,
    backtestTrades,
    chunkBars,
    compressionMethod,
    dimensionAmount,
    selectedAiFeatures,
    selectedBacktestTab,
    selectedTimeframe,
    seriesMap,
    validationMode
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
    const entryCounts: Record<string, number> = {};
    const exitCounts: Record<string, number> = {};

    for (const trade of mainStatsTrades) {
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
  }, [mainStatsTrades]);

  const entryExitChartData = useMemo(() => {
    const source = entryExitChartMode === "Entry" ? entryExitStats.entry : entryExitStats.exit;

    return source.map(([bucket, count]) => ({
      bucket,
      count
    }));
  }, [entryExitChartMode, entryExitStats]);

  const hoveredEntryExitRow = useMemo(() => {
    if (!hoveredEntryExitBucket) {
      return null;
    }

    return entryExitChartData.find((row) => row.bucket === hoveredEntryExitBucket) ?? null;
  }, [entryExitChartData, hoveredEntryExitBucket]);

  const entryExitChartMetrics = useMemo(() => {
    return {
      total: entryExitChartData.reduce((sum, row) => sum + row.count, 0),
      maxCount: Math.max(1, ...entryExitChartData.map((row) => row.count))
    };
  }, [entryExitChartData]);

  const backtestScatterPlot = useMemo(() => {
    const xDef = backtestScatterVarDefs[scatterXKey];
    const yDef = backtestScatterVarDefs[scatterYKey];
    const left = 10;
    const right = 92;
    const top = 10;
    const bottom = 88;
    const width = right - left;
    const height = bottom - top;

    const rawPoints = backtestScatterData.points
      .map((point) => ({
        id: point.id,
        trade: point.trade,
        isWin: point.isWin,
        x: point.values[scatterXKey],
        y: point.values[scatterYKey]
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

    if (rawPoints.length === 0) {
      return {
        points: [] as Array<{
          id: string;
          trade: HistoryItem;
          isWin: boolean;
          x: number;
          y: number;
          cx: number;
          cy: number;
        }>,
        xTicks: [] as Array<{ value: number; label: string; position: number }>,
        yTicks: [] as Array<{ value: number; label: string; position: number }>,
        xZero: null as number | null,
        yZero: null as number | null
      };
    }

    const buildNumericAxis = (
      values: number[],
      isY = false
    ): {
      project: (value: number) => number;
      ticks: Array<{ value: number; position: number }>;
      zero: number | null;
    } => {
      let min = Math.min(...values);
      let max = Math.max(...values);

      if (min === max) {
        min -= 1;
        max += 1;
      }

      const padding = (max - min) * 0.08;
      min -= padding;
      max += padding;
      const span = Math.max(0.000001, max - min);
      const project = (value: number): number => {
        const ratio = (value - min) / span;
        return isY ? bottom - ratio * height : left + ratio * width;
      };

      return {
        project,
        ticks: Array.from({ length: 4 }, (_, index) => {
          const ratio = index / 3;
          const value = min + span * ratio;
          return {
            value,
            position: isY ? bottom - ratio * height : left + ratio * width
          };
        }),
        zero: min <= 0 && max >= 0 ? project(0) : null
      };
    };

    const buildCategoryAxis = (
      values: number[],
      isY = false
    ): {
      project: (value: number) => number;
      ticks: Array<{ value: number; position: number }>;
      zero: number | null;
    } => {
      const domain = Array.from(new Set(values.map((value) => Math.round(value))));
      const valueToIndex = new Map<number, number>();
      for (let index = 0; index < domain.length; index += 1) {
        valueToIndex.set(domain[index]!, index);
      }

      const project = (value: number): number => {
        const index = valueToIndex.get(Math.round(value)) ?? 0;
        const ratio = domain.length <= 1 ? 0.5 : index / (domain.length - 1);
        return isY ? bottom - ratio * height : left + ratio * width;
      };

      return {
        project,
        ticks: domain.map((value, index) => {
          const ratio = domain.length <= 1 ? 0.5 : index / (domain.length - 1);
          return {
            value,
            position: isY ? bottom - ratio * height : left + ratio * width
          };
        }),
        zero: null
      };
    };

    const xAxis = xDef.numeric
      ? buildNumericAxis(rawPoints.map((point) => point.x), false)
      : buildCategoryAxis(rawPoints.map((point) => point.x), false);
    const yAxis = yDef.numeric
      ? buildNumericAxis(rawPoints.map((point) => point.y), true)
      : buildCategoryAxis(rawPoints.map((point) => point.y), true);

    const step = rawPoints.length > 1600 ? Math.ceil(rawPoints.length / 1600) : 1;
    const points = rawPoints
      .filter((_, index) => index % step === 0)
      .map((point) => ({
        ...point,
        cx: xAxis.project(point.x),
        cy: yAxis.project(point.y)
      }));

    const formatTick = (def: BacktestScatterAxisDef, value: number): string => {
      if (def.tickFormatter) {
        return def.tickFormatter(value);
      }

      if (!Number.isFinite(value)) {
        return "";
      }

      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    };

    return {
      points,
      xTicks: xAxis.ticks.map((tick) => ({
        ...tick,
        label: formatTick(xDef, tick.value)
      })),
      yTicks: yAxis.ticks.map((tick) => ({
        ...tick,
        label: formatTick(yDef, tick.value)
      })),
      xZero: "zero" in xAxis ? xAxis.zero : null,
      yZero: "zero" in yAxis ? yAxis.zero : null
    };
  }, [backtestScatterData.points, backtestScatterVarDefs, scatterXKey, scatterYKey]);

  const hoveredScatterPoint = useMemo(() => {
    if (!hoveredScatterPointId) {
      return null;
    }

    return backtestScatterPlot.points.find((point) => point.id === hoveredScatterPointId) ?? null;
  }, [backtestScatterPlot.points, hoveredScatterPointId]);

  const formatScatterTooltipValue = (key: BacktestScatterKey, value: number): string => {
    const def = backtestScatterVarDefs[key];

    if (def.tooltipFormatter) {
      return def.tooltipFormatter(value);
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };

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

  const propHistogram = useMemo(() => {
    if (!propResult || propResult.data.length === 0) {
      return [];
    }

    let min = propResult.data[0]!;
    let max = propResult.data[0]!;

    for (const value of propResult.data) {
      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }
    }

    if (min === max) {
      return [{ bin: min, count: propResult.data.length }];
    }

    const binCount = 20;
    const binSize = (max - min) / binCount;
    const counts = Array.from({ length: binCount }, () => 0);

    for (const value of propResult.data) {
      let index = Math.floor((value - min) / binSize);
      index = clamp(index, 0, binCount - 1);
      counts[index] += 1;
    }

    const scaleFactor =
      propStats && propResult.data.length > 0 ? propStats.totalSimulations / propResult.data.length : 1;

    return counts.map((count, index) => ({
      bin: min + binSize * index + binSize / 2,
      count: count * scaleFactor
    }));
  }, [propResult, propStats]);

  const propHistogramBars = useMemo(() => {
    if (propHistogram.length === 0) {
      return [];
    }

    const maxCount = Math.max(1, ...propHistogram.map((item) => item.count));
    const slotWidth = 92 / propHistogram.length;

    return propHistogram.map((item, index) => {
      const height = (item.count / maxCount) * 28;
      return {
        ...item,
        x: 4 + index * slotWidth,
        y: 32 - height,
        width: Math.max(2.5, slotWidth - 0.8),
        height
      };
    });
  }, [propHistogram]);

  const propLineChart = useMemo(() => {
    if (!propStats || propStats.randomProgressRuns.length === 0) {
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
    propTotalMaxLoss
  ]);

  useEffect(() => {
    setSelectedBacktestMonthKey((current) => {
      if (current) {
        return current;
      }

      return availableBacktestMonths[0] ?? getCurrentTradeMonthKey();
    });
  }, [availableBacktestMonths]);

  useEffect(() => {
    setSelectedBacktestDateKey((current) => {
      if (visibleBacktestDateKeys.length === 0) {
        return "";
      }

      return visibleBacktestDateKeys.includes(current) ? current : visibleBacktestDateKeys[0];
    });
  }, [visibleBacktestDateKeys]);

  return (
    <main className="terminal">
      <nav className="surface-strip" aria-label="primary views">
        {surfaceTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`surface-tab ${selectedSurfaceTab === tab.id ? "active" : ""}`}
            onClick={() => setSelectedSurfaceTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <header className="topbar">
        <div className="brand-area">
          <div className="asset-meta">
            <h1>{selectedAsset.symbol}</h1>
            <p>{selectedAsset.name}</p>
          </div>
          <div className="live-quote">
            {latestCandle ? (
              <>
                <span>${formatPrice(latestCandle.close)}</span>
                <span className={quoteChange >= 0 ? "up" : "down"}>
                  {quoteChange >= 0 ? "+" : ""}
                  {quoteChange.toFixed(2)}%
                </span>
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
          <div className="top-utility">
            <span className="site-tag">korra.space</span>
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
      </header>

      <section className="surface-stage">
        <div className={`surface-view ${selectedSurfaceTab === "chart" ? "" : "hidden"}`}>
          <section className={`workspace ${panelExpanded ? "" : "panel-collapsed"}`}>
            <section className="chart-wrap">
              <div className="chart-toolbar">
                {hoveredCandle ? (
                  <>
                    <span>
                      O <strong>{formatPrice(hoveredCandle.open)}</strong>
                    </span>
                    <span>
                      H <strong>{formatPrice(hoveredCandle.high)}</strong>
                    </span>
                    <span>
                      L <strong>{formatPrice(hoveredCandle.low)}</strong>
                    </span>
                    <span>
                      C <strong>{formatPrice(hoveredCandle.close)}</strong>
                    </span>
                    <span className={hoveredChange >= 0 ? "up" : "down"}>
                      {hoveredChange >= 0 ? "+" : ""}
                      {hoveredChange.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span>No market data loaded</span>
                )}
                <span>
                  Type <strong>{selectedAsset.funding}</strong>
                </span>
                <span>
                  Feed <strong>{selectedAsset.openInterest}</strong>
                </span>
                <span className="chart-hint">Scroll: zoom | Drag: pan | Opt+R: latest</span>
              </div>
              <div className="chart-stage">
                <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
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
                          <p>Current open position · {selectedModel.name}</p>
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
                          <p>No active trade data yet.</p>
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

                  {activePanelTab === "models" ? (
                    <div className="tab-view">
                      <div className="watchlist-head">
                        <div>
                          <h2>Models / People</h2>
                          <p>Select one profile to drive history and actions</p>
                        </div>
                      </div>
                      <ul className="model-list">
                        {modelProfiles.map((model) => {
                          const selected = model.id === selectedModelId;

                          return (
                            <li key={model.id}>
                              <button
                                type="button"
                                className={`model-row ${selected ? "selected" : ""}`}
                                onClick={() => setSelectedModelId(model.id)}
                              >
                                <span className="model-main">
                                  <span className="model-name">{model.name}</span>
                                  <span className="model-kind">{model.kind}</span>
                                </span>
                                {model.accountNumber ? (
                                  <span className="model-account">
                                    Korra Account #{model.accountNumber}
                                  </span>
                                ) : null}
                                <span className="model-state">
                                  {selected ? "Selected" : "Select"}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "mt5" ? (
                    <div className="tab-view copytrade-tab">
                      <div className="watchlist-head">
                        <div>
                          <h2>MT5 Copy Trade</h2>
                          <p>Connect an MT5 account to mirror {selectedModel.name}</p>
                        </div>
                      </div>
                      <div className="copytrade-body">
                        <div className="copytrade-source">
                          <span>Selected Source</span>
                          <strong>{selectedModel.name}</strong>
                          <small>
                            Pick the profile in Models / People, then enter the target MT5
                            account details here.
                          </small>
                        </div>

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

                        <p className="copytrade-note">
                          Placeholder only. Copy-trading logic and credential handling are not wired
                          yet.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {activePanelTab === "history" ? (
                    <div className="tab-view">
                      <div className="watchlist-head with-action">
                        <div>
                          <h2>History</h2>
                          <p>Simulated trade outcomes · {selectedModel.name}</p>
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
                        {historyRows.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`history-row ${
                                selectedHistoryId === item.id ? "selected" : ""
                              }`}
                              onClick={() => {
                                focusTradeIdRef.current = item.id;
                                setSelectedHistoryId(item.id);
                                setSelectedSymbol(item.symbol);
                                setShowAllTradesOnChart(false);
                                setShowActiveTradeOnChart(false);
                              }}
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
                          <p>Entry, SL, TP, and exits · {selectedModel.name}</p>
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
                              onClick={() => {
                                focusTradeIdRef.current = action.tradeId;
                                setSelectedHistoryId(action.tradeId);
                                setSelectedSymbol(action.symbol);
                                setShowAllTradesOnChart(false);
                                setShowActiveTradeOnChart(false);
                              }}
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

        <section
          className={`backtest-surface ${selectedSurfaceTab === "backtest" ? "" : "hidden"}`}
          aria-label="backtest workspace"
        >
          <div className="backtest-shell">
            <section className="backtest-hero">
              <div className="backtest-hero-copy">
                <span className="backtest-kicker">Backtest Workspace</span>
                <h2>
                  {selectedModel.name} on {selectedTimeframe}
                </h2>
                <p>
                  AI.zip modules stay grouped here with the same core workflow: settings,
                  statistics, trade review, calendar, clustering, graphs, and prop evaluation.
                </p>
              </div>

              <div className="backtest-summary-grid">
                <article className="backtest-summary-card">
                  <span>Net PnL</span>
                  <strong className={backtestSummary.netPnl >= 0 ? "up" : "down"}>
                    {formatSignedUsd(backtestSummary.netPnl)}
                  </strong>
                  <small>{backtestSummary.tradeCount} simulated trades</small>
                </article>
                <article className="backtest-summary-card">
                  <span>Win Rate</span>
                  <strong>{backtestSummary.winRate.toFixed(1)}%</strong>
                  <small>{backtestSummary.avgR.toFixed(2)}R average reward profile</small>
                </article>
                <article className="backtest-summary-card">
                  <span>Profit Factor</span>
                  <strong>{backtestSummary.profitFactor.toFixed(2)}</strong>
                  <small>{Math.round(backtestSummary.avgHoldMinutes)}m average hold</small>
                </article>
                <article className="backtest-summary-card">
                  <span>Worst Pullback</span>
                  <strong className={backtestSummary.maxDrawdown >= 0 ? "up" : "down"}>
                    {formatSignedUsd(backtestSummary.maxDrawdown)}
                  </strong>
                  <small>
                    {backtestSummary.bestDay
                      ? `Best day ${formatSignedUsd(backtestSummary.bestDay.pnl)}`
                      : "Waiting for trade history"}
                  </small>
                </article>
              </div>
            </section>

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
              {backtestSourceTrades.length === 0 ? (
                <div className="backtest-empty">
                  <h3>Backtest data is still loading</h3>
                  <p>
                    The Backtest modules populate from the simulated history feed. Once candles load,
                    these tabs will fill in automatically.
                  </p>
                </div>
              ) : null}

              {selectedBacktestTab === "mainStats" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <div className="backtest-card-head backtest-stats-head">
                      <div>
                        <h3>{mainStatsTitle}</h3>
                        <p>
                          Core AI.zip performance metrics for the active trade slice on{" "}
                          {selectedModel.name} {selectedTimeframe}.
                        </p>
                      </div>

                      <div className="backtest-stats-range" aria-label="main statistics date range">
                        <input
                          type="date"
                          value={statsDateStart}
                          onChange={(event) => setStatsDateStart(event.target.value)}
                          className="backtest-date-input"
                          aria-label="main statistics start date"
                        />
                        <span className="backtest-stats-range-arrow">-&gt;</span>
                        <input
                          type="date"
                          value={statsDateEnd}
                          onChange={(event) => setStatsDateEnd(event.target.value)}
                          className="backtest-date-input"
                          aria-label="main statistics end date"
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
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="backtest-stats-grid">
                      {mainStatisticsCards.map((item) => (
                        <div
                          key={item.label}
                          className={`backtest-stat-card ${
                            item.tone === "neutral" ? "tone-neutral" : `tone-${item.tone}`
                          } ${
                            item.span === 4 ? "stat-span-4" : item.span === 2 ? "stat-span-2" : ""
                          }`}
                        >
                          <span>{item.label}</span>
                          <strong className={item.tone === "neutral" ? "" : item.tone}>
                            {item.value}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "mainSettings" ? (
                <div className="backtest-grid main-settings-layout">
                  <div className="backtest-card main-settings-overview span-2">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Main Settings</h3>
                        <p>
                          AI.zip controls are grouped into a cleaner flow so you can tune method, risk,
                          and validation with less scanning.
                        </p>
                      </div>
                    </div>

                    <div className="main-settings-kpi-grid">
                      <div className="main-settings-kpi-card">
                        <span>AI Method</span>
                        <strong>{aiMode === "off" ? "OFF" : aiMode.toUpperCase()}</strong>
                      </div>
                      <div className="main-settings-kpi-card">
                        <span>Confidence Gate</span>
                        <strong>{confidenceThreshold}%</strong>
                      </div>
                      <div className="main-settings-kpi-card">
                        <span>Avg Confidence</span>
                        <strong>{backtestSummary.averageConfidence.toFixed(1)}%</strong>
                      </div>
                      <div className="main-settings-kpi-card">
                        <span>Visible Trades</span>
                        <strong>{backtestTrades.length}</strong>
                      </div>
                      <div className="main-settings-kpi-card">
                        <span>Anti-Cheat</span>
                        <strong>{antiCheatEnabled ? "ON" : "OFF"}</strong>
                      </div>
                      <div className="main-settings-kpi-card">
                        <span>Libraries</span>
                        <strong>{staticLibrariesClusters ? "ON" : "OFF"}</strong>
                      </div>
                    </div>

                    <div className="main-settings-core-grid">
                      <div className="ai-zip-section main-settings-panel">
                        <div className="main-settings-panel-title">Core AI Controls</div>

                        <button
                          type="button"
                          className={`ai-zip-button feature ${aiMode !== "off" ? "active" : ""}`}
                          onClick={() => {
                            setAiMode((current) => {
                              const next =
                                current === "off" ? "knn" : current === "knn" ? "hdbscan" : "off";

                              if (next === "off") {
                                setAiModelEnabled(false);
                                setAiFilterEnabled(false);
                              } else if (!aiModelEnabled && !aiFilterEnabled) {
                                setAiFilterEnabled(true);
                              }

                              return next;
                            });
                          }}
                        >
                          Artificial Intelligence - {aiMode === "off" ? "OFF" : aiMode.toUpperCase()}
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${
                            aiMode !== "off" && aiModelEnabled ? "active" : ""
                          }`}
                          disabled={aiMode === "off"}
                          onClick={() => setAiModelEnabled((value) => !value)}
                        >
                          AI Model {aiModelEnabled ? "· ON" : "· OFF"}
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${
                            aiMode !== "off" && aiFilterEnabled ? "active" : ""
                          }`}
                          disabled={aiMode === "off"}
                          onClick={() => setAiFilterEnabled((value) => !value)}
                        >
                          AI Filter {aiFilterEnabled ? "· ON" : "· OFF"}
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

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">AI Confidence Threshold</div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={confidenceThreshold}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setConfidenceThreshold(clamp(Number(event.target.value) || 0, 0, 100));
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">{confidenceThreshold}</div>
                        </div>
                      </div>

                      <div className="ai-zip-section main-settings-panel">
                        <div className="main-settings-panel-title">Current Gate Snapshot</div>
                        <div className="ai-zip-note">
                          Average confidence {backtestSummary.averageConfidence.toFixed(1)}% ·{" "}
                          {backtestTrades.length} trades visible after filters
                        </div>
                        <div className="backtest-stat-list">
                          <div className="backtest-stat-row">
                            <span>AI Method</span>
                            <strong>{aiMode === "off" ? "OFF" : aiMode.toUpperCase()}</strong>
                          </div>
                          <div className="backtest-stat-row">
                            <span>AI Model</span>
                            <strong>{aiModelEnabled ? "ON" : "OFF"}</strong>
                          </div>
                          <div className="backtest-stat-row">
                            <span>AI Filter</span>
                            <strong>{aiFilterEnabled ? "ON" : "OFF"}</strong>
                          </div>
                          <div className="backtest-stat-row">
                            <span>Static Libraries</span>
                            <strong>{staticLibrariesClusters ? "ON" : "OFF"}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="backtest-stack main-settings-stack">
                    <div className="backtest-card">
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Advanced AI Settings</div>

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
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "Set AI Exit Strictness > 0 to enable"
                              : `${aiExitLossTolerance} (0 = neutral)`}
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
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "Set AI Exit Strictness > 0 to enable"
                              : `${aiExitWinTolerance} (0 = neutral)`}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${useMitExit ? "active" : ""}`}
                          onClick={() => setUseMitExit((value) => !value)}
                        >
                          MIT Exit {useMitExit ? "· ON" : "· OFF"}
                        </button>

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Complexity</div>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            step={1}
                            value={complexity}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setComplexity(clamp(Number(event.target.value) || 1, 1, 100));
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">{complexity}</div>
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
                          />
                          <div className="ai-zip-note">
                            {volatilityPercentile === 0
                              ? "0 (OFF)"
                              : `Keep top ${volatilityPercentile}%`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Advanced AI</div>
                        <div className="ai-zip-toggle-grid">
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

                        <div className="ai-zip-input-grid">
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
                            />
                            <span className="ai-zip-note">{embeddingCompression}%</span>
                          </label>
                        </div>

                        <div className={`ai-zip-control ${aiDisabled ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Modality</div>
                          <div className="ai-zip-toggle-grid tiles compact">
                            {AI_MODALITY_OPTIONS.map((modality) => (
                              <button
                                key={modality}
                                type="button"
                                className={`ai-zip-button pill ${
                                  selectedAiModalities.includes(modality) ? "active" : ""
                                }`}
                                disabled={aiDisabled}
                                onClick={() => {
                                  setSelectedAiModalities((current) =>
                                    toggleListValue(current, modality)
                                  );
                                }}
                              >
                                {modality}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="ai-zip-input-grid">
                          <label className={`ai-zip-field ${aiDisabled ? "ai-zip-control disabled" : ""}`}>
                            <span className="ai-zip-label">Dimension Amount</span>
                            <input
                              type="number"
                              min={2}
                              max={512}
                              step={1}
                              value={dimensionAmount}
                              disabled={aiDisabled}
                              onChange={(event) => {
                                setDimensionAmount(
                                  clamp(Math.floor(Number(event.target.value) || 2), 2, 512)
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
                  </div>

                  <div className="backtest-stack main-settings-stack">
                    <div className="backtest-card">
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

                    <div className="backtest-card">
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Anti-Cheat</div>

                        <button
                          type="button"
                          className={`ai-zip-button ${antiCheatEnabled ? "active" : ""}`}
                          onClick={() => setAntiCheatEnabled((value) => !value)}
                        >
                          Anti-Cheat {antiCheatEnabled ? "· ON" : "· OFF"}
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button ${antiCheatEnabled ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={cycleValidationMode}
                        >
                          Validation · {AI_VALIDATION_LABELS[validationMode]}
                        </button>

                        <button
                          type="button"
                          className={`ai-zip-button ${antiCheatEnabled ? "active" : ""}`}
                          disabled={!antiCheatEnabled}
                          onClick={() => {
                            setRealismLevel((value) => (value + 1) % AI_REALISM_LABELS.length);
                          }}
                        >
                          Realism · {AI_REALISM_LABELS[clamp(realismLevel, 0, 4)]}
                        </button>

                        <div className={`ai-zip-note ${antiCheatEnabled ? "" : "ai-zip-control disabled"}`}>
                          When enabled, the validation controls mirror the AI.zip anti-cheat panel.
                        </div>
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
                subtitle="Left click: toggle ENTRY"
                size="wide"
                bodyClassName="ai-zip-models-modal-body"
                open={modelsModalOpen}
                onClose={() => setModelsModalOpen(false)}
              >
                <div className="ai-zip-model-grid">
                  {availableAiModelNames.map((modelName) => (
                    <button
                      key={modelName}
                      type="button"
                      className={`ai-zip-select-tile model ${
                        selectedAiModels.includes(modelName) ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedAiModels((current) => toggleListValue(current, modelName));
                      }}
                    >
                      <strong>{modelName}</strong>
                      <span>{selectedAiModels.includes(modelName) ? "ENTRY" : "OFF"}</span>
                    </button>
                  ))}
                </div>
              </AiSettingsModal>

              <AiSettingsModal
                title="FEATURES"
                subtitle="AI.zip feature tiles with per-feature context"
                size="xwide"
                bodyClassName="ai-zip-features-modal-body"
                open={featuresModalOpen}
                onClose={() => setFeaturesModalOpen(false)}
              >
                <div className="ai-zip-feature-grid">
                  {AI_FEATURE_OPTIONS.map((feature) => (
                    <button
                      key={feature.id}
                      type="button"
                      className={`ai-zip-select-tile feature ${
                        selectedAiFeatures.includes(feature.id) ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedAiFeatures((current) => toggleListValue(current, feature.id));
                      }}
                      title={feature.note}
                    >
                      <strong>{feature.label}</strong>
                      <span>{feature.note ?? "Feature context for AI.zip embeddings."}</span>
                      <em>{selectedAiFeatures.includes(feature.id) ? "ENABLED" : "DISABLED"}</em>
                    </button>
                  ))}
                </div>
              </AiSettingsModal>

              <AiSettingsModal
                title="LIBRARY"
                subtitle="Available, active, and quick controls"
                size="xwide"
                bodyClassName="ai-zip-library-modal-body"
                open={librariesModalOpen}
                onClose={() => setLibrariesModalOpen(false)}
              >
                <div className="ai-zip-library-layout">
                  <section className="ai-zip-library-column">
                    <header>
                      <strong>Available Libraries</strong>
                      <span>Click Add to activate</span>
                    </header>
                    <div className="ai-zip-library-scroll">
                      {availableAiLibraries.length === 0 ? (
                        <p className="ai-zip-library-empty">No more libraries available.</p>
                      ) : (
                        availableAiLibraries.map((library) => (
                          <article key={library.id} className="ai-zip-library-card">
                            <div>
                              <h4>{library.label}</h4>
                              <p>{library.note ?? "Library option."}</p>
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
                      <span>Order controls influence priority</span>
                    </header>
                    <div className="ai-zip-library-scroll">
                      {selectedAiLibraries.length === 0 ? (
                        <p className="ai-zip-library-empty">No active libraries selected.</p>
                      ) : (
                        selectedAiLibraries.map((libraryId, index) => {
                          const library =
                            AI_LIBRARY_OPTIONS.find((option) => option.id === libraryId) ?? null;

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
                                <h4>{library.label}</h4>
                                <p>{library.note ?? "Active library option."}</p>
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
                      <strong>Details</strong>
                      <span>{selectedAiLibrary ? selectedAiLibrary.label : "Select a library"}</span>
                    </header>
                    <div className="ai-zip-library-scroll">
                      {selectedAiLibrary ? (
                        <div className="ai-zip-library-detail">
                          <h4>{selectedAiLibrary.label}</h4>
                          <p>{selectedAiLibrary.note ?? "AI.zip library configuration."}</p>
                          <div className="ai-zip-library-metrics">
                            <div>
                              <span>Status</span>
                              <strong>
                                {selectedAiLibraries.includes(selectedAiLibrary.id)
                                  ? "Active"
                                  : "Inactive"}
                              </strong>
                            </div>
                            <div>
                              <span>Total Active</span>
                              <strong>{selectedAiLibraryCount}</strong>
                            </div>
                          </div>
                          {selectedAiLibraries.includes(selectedAiLibrary.id) ? (
                            <button
                              type="button"
                              className="ai-zip-library-action danger wide"
                              onClick={() => removeAiLibrary(selectedAiLibrary.id)}
                            >
                              Remove from Active
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ai-zip-library-action add wide"
                              onClick={() => addAiLibrary(selectedAiLibrary.id)}
                            >
                              Add to Active
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="ai-zip-library-empty">Choose a library to view details.</p>
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
                              <b>
                                {filteredBacktestHistory.length > 0
                                  ? `1-${filteredBacktestHistory.length}`
                                  : "0"}
                              </b>{" "}
                              of <b>{backtestTrades.length}</b> trades
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
                              {filteredBacktestHistory.length === 0 ? (
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
                                filteredBacktestHistory.map((trade, index) => {
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
                                      <td style={cell(0)}>{index + 1}</td>
                                      <td style={cell(1)}>
                                        <span
                                          style={aiZipBacktestHistoryMono({
                                            fontSize: "0.68rem",
                                            fontWeight: 900,
                                            color: "rgba(255,255,255,0.82)"
                                          })}
                                        >
                                          {trade.id}
                                        </span>
                                      </td>
                                      <td style={cell(2, { whiteSpace: "normal" })}>
                                        <div style={{ lineHeight: 1.1 }}>
                                          <span style={{ fontWeight: 700 }}>{selectedModel.name}</span>
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
                                        {`${Math.round(getTradeConfidenceScore(trade) * 100)}%`}
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
                        <p>Daily trade clustering with the same AI.zip layout and expandable trade detail.</p>
                      </div>
                    </div>

                    <div className="backtest-calendar-nav compact">
                      <button
                        type="button"
                        className="backtest-action-btn"
                        onClick={() => setSelectedBacktestMonthKey(shiftTradeMonthKey(activeBacktestMonthKey, -1))}
                      >
                        {"<"}
                      </button>
                      <span className="backtest-calendar-label">{calendarMonthLabel}</span>
                      <button
                        type="button"
                        className="backtest-action-btn"
                        onClick={() => setSelectedBacktestMonthKey(shiftTradeMonthKey(activeBacktestMonthKey, 1))}
                      >
                        {">"}
                      </button>
                    </div>

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
                      <div className="backtest-card-head">
                        <div>
                          <h3>{selectedBacktestDateKey || "Select a day"}</h3>
                        </div>
                      </div>

                      <div className="backtest-calendar-day-list">
                        {selectedBacktestDayTrades.map((trade) => {
                          const isExpanded = expandedBacktestTradeId === trade.id;
                          const durationMinutes = getHistoryTradeDurationMinutes(trade);
                          const estimatedBars = Math.max(
                            1,
                            Math.round(durationMinutes / timeframeMinutes[selectedTimeframe])
                          );
                          const tradeCandles =
                            backtestSeriesMap[symbolTimeframeKey(trade.symbol, selectedTimeframe)] ??
                            seriesMap[symbolTimeframeKey(trade.symbol, selectedTimeframe)] ??
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
                                    <strong>
                                      Entry ({selectedTimeframe}): {trade.entryAt} @{" "}
                                      {formatPrice(trade.entryPrice)}
                                    </strong>
                                    <span>
                                      Exit ({selectedTimeframe}): {trade.exitAt} @{" "}
                                      {formatPrice(trade.outcomePrice)}
                                    </span>
                                    <span>
                                      Duration: {estimatedBars} bars · {formatMinutesCompact(durationMinutes)}
                                    </span>
                                  </div>
                                </div>
                                <div className="backtest-calendar-trade-side">
                                  <span>{trade.symbol}</span>
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
                                      <div>Exit Reason: {trade.exitReason || "-"}</div>
                                      <div>Confidence: {(getTradeConfidenceScore(trade) * 100).toFixed(0)}%</div>
                                    </div>
                                  </div>

                                  <div className="backtest-calendar-trade-panel">
                                    <div className="backtest-calendar-trade-chart-copy">
                                      <strong>Price movement</strong>
                                    </div>
                                    <BacktestTradeMiniChart
                                      trade={trade}
                                      candles={tradeCandles}
                                      minutesPerBar={timeframeMinutes[selectedTimeframe]}
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
                        libraryPoints={[]}
                        activeLibraries={selectedAiLibraries}
                        libraryCounts={{}}
                        chunkBars={chunkBars}
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
                        aiMethod={aiMode}
                        aiModalities={selectedAiModalities}
                        hdbModalityDistinction="conceptual"
                        hdbMinClusterSize={hdbMinClusterSize}
                        hdbMinSamples={hdbMinSamples}
                        hdbEpsQuantile={hdbEpsQuantile}
                        staticLibrariesClusters={staticLibrariesClusters}
                        confidenceThreshold={confidenceThreshold}
                        statsDateStart={statsDateStart}
                        statsDateEnd={statsDateEnd}
                      />
                    ) : (
                      <AIZipClusterMap3D
                        candles={aiZipClusterCandles}
                        trades={aiZipClusterTrades}
                        ghostEntries={[]}
                        libraryPoints={[]}
                        chunkBarsDeb={chunkBars}
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
                        activeLibraries={selectedAiLibraries}
                        staticLibrariesClusters={staticLibrariesClusters}
                        aiMethod={aiMode}
                        aiModalities={selectedAiModalities}
                        hdbMinClusterSize={hdbMinClusterSize}
                        hdbMinSamples={hdbMinSamples}
                        hdbEpsQuantile={hdbEpsQuantile}
                        hdbModalityDistinction="conceptual"
                        clusterGroupStatsMode="All"
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
                          <p>Exact AI.zip-style session tiles, now wired directly into the backtest filters.</p>
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
                          <p>Monthly gating moved into its own filter surface.</p>
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
                          <p>The weekday filters now match the AI.zip panel layout.</p>
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
                          <p>Fine-grained hour gating with the same color treatment as AI.zip.</p>
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
                <div className="backtest-grid">
                  <div className="backtest-grid two-up">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Month Performance</h3>
                          <p>Performance by month after the active time and confidence filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestTemporalStats.months.map((row) => {
                          const maxCount = Math.max(
                            1,
                            ...backtestTemporalStats.months.map((item) => item.count)
                          );

                          return (
                            <div key={row.label} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{row.label}</strong>
                                <span>{row.count} trades</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <span>{row.winRate.toFixed(0)}%</span>
                                <strong className={row.pnl >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(row.pnl)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Weekday Performance</h3>
                          <p>Performance by weekday after the active time and confidence filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestTemporalStats.weekdays.map((row) => {
                          const maxCount = Math.max(
                            1,
                            ...backtestTemporalStats.weekdays.map((item) => item.count)
                          );

                          return (
                            <div key={row.label} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{row.label}</strong>
                                <span>{row.count} trades</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <span>{row.winRate.toFixed(0)}%</span>
                                <strong className={row.pnl >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(row.pnl)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Session Performance</h3>
                          <p>Session breakdown after the active time and confidence filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestTemporalStats.sessions.map((row) => {
                          const maxCount = Math.max(
                            1,
                            ...backtestTemporalStats.sessions.map((item) => item.count)
                          );

                          return (
                            <div key={row.label} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{row.label}</strong>
                                <span>{row.count} trades</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <span>{row.winRate.toFixed(0)}%</span>
                                <strong className={row.pnl >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(row.pnl)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Hour Performance</h3>
                          <p>Most active hours after the current filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {[...backtestTemporalStats.hours]
                          .sort((left, right) => right.count - left.count || left.hour - right.hour)
                          .slice(0, 12)
                          .map((row, _, list) => {
                            const maxCount = Math.max(1, ...list.map((item) => item.count));

                            return (
                              <div key={row.label} className="backtest-bar-row">
                                <div className="backtest-bar-copy">
                                  <strong>{row.label}</strong>
                                  <span>{row.count} trades</span>
                                </div>
                                <div className="backtest-bar-track">
                                  <div
                                    className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <div className="backtest-bar-values">
                                  <span>{row.winRate.toFixed(0)}%</span>
                                  <strong className={row.pnl >= 0 ? "up" : "down"}>
                                    {formatSignedUsd(row.pnl)}
                                  </strong>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "entryExit" ? (
                <div className="backtest-card">
                  <div className="backtest-card-head">
                    <div>
                      <h3>Entry / Exit Stats</h3>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 10,
                      flexWrap: "wrap"
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        opacity: 0.8,
                        letterSpacing: "0.04em"
                      }}
                    >
                      Mode
                    </div>
                    <select
                      value={entryExitChartMode}
                      onChange={(event) => {
                        setEntryExitChartMode(event.target.value as EntryExitChartMode);
                        setHoveredEntryExitBucket(null);
                      }}
                      style={{
                        height: 34,
                        padding: "0 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.92)",
                        fontWeight: 900,
                        cursor: "pointer",
                        outline: "none",
                        appearance: "none",
                        minWidth: 140
                      }}
                    >
                      <option value="Entry">Entry</option>
                      <option value="Exit">Exit</option>
                    </select>
                    <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
                      Hover bars for count &amp; share
                    </div>
                  </div>

                  <div
                    onMouseLeave={() => setHoveredEntryExitBucket(null)}
                    style={{
                      position: "relative",
                      height: 260,
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.15))",
                      padding: 12
                    }}
                  >
                    {hoveredEntryExitRow ? (
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          left: 12,
                          zIndex: 1,
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
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>{hoveredEntryExitRow.bucket}</div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12
                          }}
                        >
                          <span style={{ opacity: 0.7 }}>Count</span>
                          <span style={{ fontWeight: 900, color: "rgba(15,23,42,0.92)" }}>
                            {hoveredEntryExitRow.count}
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
                            {entryExitChartMetrics.total > 0
                              ? ((hoveredEntryExitRow.count / entryExitChartMetrics.total) * 100).toFixed(1)
                              : "0.0"}
                            %
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {entryExitChartData.length === 0 ? (
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
                      <div
                        style={{
                          height: "100%",
                          overflowX: "auto",
                          paddingTop: hoveredEntryExitRow ? 58 : 20
                        }}
                      >
                        <div
                          style={{
                            minWidth: `${Math.max(entryExitChartData.length * 88, 320)}px`,
                            height: "100%",
                            display: "flex",
                            alignItems: "flex-end",
                            gap: 10,
                            padding: "0 4px"
                          }}
                        >
                          {entryExitChartData.map((row) => {
                            const share =
                              entryExitChartMetrics.total > 0
                                ? (row.count / entryExitChartMetrics.total) * 100
                                : 0;
                            const isActive = hoveredEntryExitBucket === row.bucket;

                            return (
                              <button
                                key={row.bucket}
                                type="button"
                                onMouseEnter={() => setHoveredEntryExitBucket(row.bucket)}
                                onFocus={() => setHoveredEntryExitBucket(row.bucket)}
                                onBlur={() => {
                                  setHoveredEntryExitBucket((current) =>
                                    current === row.bucket ? null : current
                                  );
                                }}
                                title={`${row.bucket}: ${row.count} trades (${share.toFixed(1)}%)`}
                                style={{
                                  flex: "1 0 0",
                                  minWidth: 46,
                                  height: "100%",
                                  border: "none",
                                  background: "transparent",
                                  padding: 0,
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "flex-end",
                                  alignItems: "stretch"
                                }}
                              >
                                <div
                                  style={{
                                    flex: 1,
                                    display: "flex",
                                    alignItems: "flex-end"
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "100%",
                                      minHeight: 6,
                                      height: `${Math.max(
                                        6,
                                        (row.count / entryExitChartMetrics.maxCount) * 100
                                      )}%`,
                                      borderRadius: "10px 10px 0 0",
                                      background: getEntryExitBarFill(row.bucket),
                                      opacity: isActive ? 1 : 0.88,
                                      boxShadow: isActive
                                        ? `0 0 0 2px ${getEntryExitBarFill(row.bucket)}`
                                        : "none",
                                      transition: "opacity 120ms ease, box-shadow 120ms ease"
                                    }}
                                  />
                                </div>
                                <div
                                  style={{
                                    marginTop: 8,
                                    fontSize: 11,
                                    lineHeight: 1.2,
                                    fontWeight: 700,
                                    color: "rgba(255,255,255,0.78)",
                                    textAlign: "center",
                                    wordBreak: "break-word"
                                  }}
                                >
                                  {row.bucket}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
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

              {selectedBacktestTab === "graphs" ? (
                <div style={{ marginTop: 14 }}>
                  <div className="backtest-card">
                    <button
                      type="button"
                      onClick={() => setIsGraphsCollapsed((current) => !current)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        marginBottom: 12,
                        padding: 0
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 18,
                          fontWeight: 600,
                          color: "#f5f5f5"
                        }}
                      >
                        Statistical Graphs
                      </h2>
                    </button>

                    {!isGraphsCollapsed ? (
                      !backtestScatterPlot.points.length ? (
                        <div style={{ padding: "0 12px 24px", fontSize: 13, color: "#9ca3af" }}>
                          No trades to display.
                        </div>
                      ) : (
                        <div
                          className="h-80"
                          style={{
                            background: "rgba(7, 12, 20, 0.72)",
                            border: "1px solid rgba(67, 86, 124, 0.4)",
                            borderRadius: 16
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              marginBottom: 8,
                              padding: "10px 12px 0",
                              fontSize: 12,
                              color: "#9ca3af",
                              flexWrap: "wrap"
                            }}
                          >
                            <span>X:</span>
                            <select
                              value={scatterXKey}
                              onChange={(event) =>
                                setScatterXKey(event.target.value as BacktestScatterKey)
                              }
                              style={{
                                background: "rgba(90,170,255,0.15)",
                                border: "1px solid rgba(90,170,255,0.40)",
                                color: "rgba(90,170,255,0.90)",
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                appearance: "none"
                              }}
                            >
                              {BACKTEST_SCATTER_KEYS.map((key) => (
                                <option key={key} value={key}>
                                  {backtestScatterVarDefs[key].label}
                                </option>
                              ))}
                            </select>
                            <span>Y:</span>
                            <select
                              value={scatterYKey}
                              onChange={(event) =>
                                setScatterYKey(event.target.value as BacktestScatterKey)
                              }
                              style={{
                                background: "rgba(90,170,255,0.15)",
                                border: "1px solid rgba(90,170,255,0.40)",
                                color: "rgba(90,170,255,0.90)",
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                appearance: "none"
                              }}
                            >
                              {BACKTEST_SCATTER_KEYS.map((key) => (
                                <option key={key} value={key}>
                                  {backtestScatterVarDefs[key].label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div
                            style={{ position: "relative", height: "calc(100% - 40px)", padding: "0 8px 10px" }}
                            onMouseLeave={() => setHoveredScatterPointId(null)}
                          >
                            <svg
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              aria-label="scatter plot"
                              style={{ width: "100%", height: "100%" }}
                            >
                              <defs>
                                <filter id="scatterGlow" x="-50%" y="-50%" width="200%" height="200%">
                                  <feGaussianBlur stdDeviation="0.6" result="blur" />
                                  <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                  </feMerge>
                                </filter>
                              </defs>
                              <line x1="10" y1="88" x2="92" y2="88" stroke="#4b5563" strokeWidth="0.5" />
                              <line x1="10" y1="10" x2="10" y2="88" stroke="#4b5563" strokeWidth="0.5" />
                              {backtestScatterPlot.xZero != null ? (
                                <line
                                  x1={backtestScatterPlot.xZero}
                                  y1="10"
                                  x2={backtestScatterPlot.xZero}
                                  y2="88"
                                  stroke="#6b7280"
                                  strokeOpacity="0.35"
                                  strokeWidth="0.45"
                                />
                              ) : null}
                              {backtestScatterPlot.yZero != null ? (
                                <line
                                  x1="10"
                                  y1={backtestScatterPlot.yZero}
                                  x2="92"
                                  y2={backtestScatterPlot.yZero}
                                  stroke="#6b7280"
                                  strokeOpacity="0.35"
                                  strokeWidth="0.45"
                                />
                              ) : null}
                              {backtestScatterPlot.xTicks.map((tick) => (
                                <text
                                  key={`x-${tick.value}`}
                                  x={tick.position}
                                  y="95"
                                  fill="#9ca3af"
                                  fontSize="2.7"
                                  textAnchor="middle"
                                >
                                  {tick.label}
                                </text>
                              ))}
                              {backtestScatterPlot.yTicks.map((tick) => (
                                <text
                                  key={`y-${tick.value}`}
                                  x="2"
                                  y={tick.position}
                                  fill="#9ca3af"
                                  fontSize="2.7"
                                  alignmentBaseline="middle"
                                  textAnchor="start"
                                >
                                  {tick.label}
                                </text>
                              ))}
                              <text
                                x="92"
                                y="99"
                                fill="#9ca3af"
                                fontSize="2.8"
                                textAnchor="end"
                              >
                                {backtestScatterVarDefs[scatterXKey].label}
                              </text>
                              <text
                                x="1"
                                y="6"
                                fill="#9ca3af"
                                fontSize="2.8"
                                textAnchor="start"
                              >
                                {backtestScatterVarDefs[scatterYKey].label}
                              </text>
                              {backtestScatterPlot.points.map((point) => {
                                const active = hoveredScatterPointId === point.id;
                                const stroke = point.isWin ? "#34d399" : "#f87171";

                                return (
                                  <circle
                                    key={point.id}
                                    cx={point.cx}
                                    cy={point.cy}
                                    r={active ? 2.25 : 1.8}
                                    fill={active ? stroke : "transparent"}
                                    stroke={active ? "#ffffff" : stroke}
                                    strokeWidth={active ? 0.55 : 0.42}
                                    filter="url(#scatterGlow)"
                                    style={{ cursor: "pointer" }}
                                    onMouseEnter={() => setHoveredScatterPointId(point.id)}
                                  />
                                );
                              })}
                            </svg>

                            {hoveredScatterPoint ? (
                              <div
                                style={{
                                  position: "absolute",
                                  left: `${clamp(hoveredScatterPoint.cx, 24, 84)}%`,
                                  top: `${clamp(hoveredScatterPoint.cy - 5, 12, 80)}%`,
                                  transform: "translate(-50%, -100%)",
                                  background: "#000000",
                                  border: "1px solid #262626",
                                  borderRadius: 11,
                                  padding: "8px 10px",
                                  color: "#e5e7eb",
                                  fontSize: 12,
                                  minWidth: 180,
                                  pointerEvents: "none"
                                }}
                              >
                                <div style={{ fontWeight: 900, marginBottom: 6 }}>Trade</div>
                                <div>
                                  {backtestScatterVarDefs[scatterYKey].label}:{" "}
                                  <b>{formatScatterTooltipValue(scatterYKey, hoveredScatterPoint.y)}</b>
                                </div>
                                <div>
                                  {backtestScatterVarDefs[scatterXKey].label}:{" "}
                                  <b>{formatScatterTooltipValue(scatterXKey, hoveredScatterPoint.x)}</b>
                                </div>
                                <div style={{ marginTop: 6, opacity: 0.9 }}>
                                  {hoveredScatterPoint.trade.symbol} · {hoveredScatterPoint.trade.side}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "propFirm" ? (
                <div className="backtest-grid two-up">
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
                          <button type="button" className="ai-zip-button pill" onClick={runPropFirm}>
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
                                  <strong>{propStats.avgTradesPass.toFixed(1)}</strong>
                                </div>
                                {propProjectionMethod !== "montecarlo" ? (
                                  <div className="backtest-stat-row">
                                    <span>Avg time to pass</span>
                                    <strong>{formatPropFirmDuration(propStats.avgTimePass)}</strong>
                                  </div>
                                ) : null}
                                <div className="backtest-stat-row">
                                  <span>Avg trades to fail</span>
                                  <strong>{propStats.avgTradesFail.toFixed(1)}</strong>
                                </div>
                                {propProjectionMethod !== "montecarlo" ? (
                                  <div className="backtest-stat-row">
                                    <span>Avg time to fail</span>
                                    <strong>{formatPropFirmDuration(propStats.avgTimeFail)}</strong>
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
                                  <strong>{propStats.incompleteCount.toLocaleString()}</strong>
                                </div>
                                <div className="backtest-stat-row">
                                  <span>Total simulations</span>
                                  <strong>{propStats.totalSimulations.toLocaleString()}</strong>
                                </div>
                                <div className="backtest-stat-row">
                                  <span>Incomplete %</span>
                                  <strong>
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

                  <div className="backtest-stack">
                    {propResult && propHistogramBars.length > 0 ? (
                      <div className="backtest-card compact">
                        <div className="backtest-card-head">
                          <div>
                            <h3>Outcome Distribution</h3>
                            <p>Simulated ending P/L distribution under current limits.</p>
                          </div>
                        </div>
                        <div className="backtest-graph-wrap short">
                          <svg
                            viewBox="0 0 100 34"
                            preserveAspectRatio="none"
                            aria-label="Prop firm distribution histogram"
                          >
                            <line x1="4" y1="32" x2="96" y2="32" className="backtest-grid-line" />
                            {propHistogramBars.map((bar, index) => (
                              <rect
                                key={`prop-hist-${index}`}
                                x={bar.x}
                                y={bar.y}
                                width={bar.width}
                                height={bar.height}
                                rx="0.6"
                                fill={
                                  bar.bin >= 0 ? "rgba(52, 211, 153, 0.88)" : "rgba(248, 113, 113, 0.88)"
                                }
                              />
                            ))}
                          </svg>
                        </div>
                      </div>
                    ) : null}

                    {propLineChart && propLineChart.paths.length > 0 ? (
                      <div className="backtest-card compact">
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
                        <div className="backtest-graph-wrap short">
                          <svg
                            viewBox="0 0 100 40"
                            preserveAspectRatio="none"
                            aria-label="Prop firm simulation progress"
                          >
                            <line x1="4" y1="36" x2="96" y2="36" className="backtest-grid-line" />
                            <line
                              x1="4"
                              y1={propLineChart.targetLineY}
                              x2="96"
                              y2={propLineChart.targetLineY}
                              style={{
                                stroke: "rgba(52, 211, 153, 0.92)",
                                strokeDasharray: "1.8 1.4",
                                strokeWidth: 0.8
                              }}
                            />
                            <line
                              x1="4"
                              y1={propLineChart.totalLossLineY}
                              x2="96"
                              y2={propLineChart.totalLossLineY}
                              style={{
                                stroke: "rgba(248, 113, 113, 0.92)",
                                strokeDasharray: "1.8 1.4",
                                strokeWidth: 0.8
                              }}
                            />
                            {propLineChart.dailyLossPath ? (
                              <path
                                d={propLineChart.dailyLossPath}
                                style={{
                                  fill: "none",
                                  stroke: "rgba(248, 113, 113, 0.86)",
                                  strokeDasharray: "1.1 1.1",
                                  strokeWidth: 0.9
                                }}
                              />
                            ) : null}
                            {propLineChart.paths.map((line, index) => (
                              <path
                                key={`prop-line-${index}`}
                                d={line.path}
                                style={{
                                  fill: "none",
                                  stroke: line.color,
                                  strokeWidth: index === 0 ? 1.45 : 0.95,
                                  opacity: index === 0 ? 1 : 0.8,
                                  strokeLinecap: "round",
                                  strokeLinejoin: "round"
                                }}
                              />
                            ))}
                          </svg>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </section>

      <footer className="statusbar">
        <span>{selectedAsset.symbol}</span>
        <span>{selectedTimeframe}</span>
        <span>Model: {selectedModel.name}</span>
        <span>Feed: simulated</span>
        <span>UTC</span>
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
