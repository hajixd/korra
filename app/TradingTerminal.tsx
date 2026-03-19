"use client";

import dynamic from "next/dynamic";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
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
  IPriceLine,
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
  type BacktestEntryNeighbor,
  type BacktestHistoryRow,
  type BacktestHistoryComputeRequest,
  type BacktestTradeAiEntryMeta
} from "./backtestHistoryShared";
import {
  COPYTRADE_BACKTEST_STATE_KEY,
  COPYTRADE_LAST_ROUTE_STORAGE_KEY,
  DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE,
  type CopytradeDashboardSeed,
  type CopytradeDashboardStatsPayload
} from "./copytradeDashboardSeed";
import AssistantPanel from "./AssistantPanel";
import {
  executeAssistantChartActions,
  styleToLineStyle as assistantToolStyleToLineStyle,
  type AssistantChartAction
} from "./tools/chartActions";
import { normalizeChartActions } from "../lib/assistant-tools";
import {
  parseStrategyModelCatalogEntry,
  STRATEGY_MODEL_CATALOG,
  resolveStrategyRuntimeModelProfile,
  type StrategyModelCatalogEntry
} from "../lib/strategyCatalog";
import {
  buildStrategyBacktestSurfaceSummary,
  buildStrategyReplayTradeBlueprints
} from "../lib/strategyModelBacktest";
import {
  AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS,
  BASE_SEEDING_LIBRARY_IDS,
  buildSeededLibraryTradePoolFromCandles,
  canRunAizipLibrariesForSettings,
  countEnabledAizipModels,
  doesAizipHistorySeedSettingsChange,
  getVisibleAizipLibraryIds,
  getMinimumAizipSeedBars,
  hasUsableAizipSeedCandles,
  isBaseSeedingLibraryId,
  isGhostLearningLibraryId,
  isOnlineLearningLibraryId,
  isVisibleAizipLibraryId,
  shouldSkipAizipBacktestHistoryFetch,
  usesAizipEveryCandleMode
} from "./aizipRuntime";

const loadRecharts = () => import("recharts");
let lightweightChartsPromise: Promise<typeof import("lightweight-charts")> | null = null;
const loadLightweightCharts = () => {
  if (!lightweightChartsPromise) {
    lightweightChartsPromise = import("lightweight-charts");
  }

  return lightweightChartsPromise;
};
const ResponsiveContainer = dynamic<any>(() => loadRecharts().then((mod) => mod.ResponsiveContainer), {
  ssr: false
});
const ComposedChart = dynamic<any>(() => loadRecharts().then((mod) => mod.ComposedChart), {
  ssr: false
});
const Area = dynamic<any>(() => loadRecharts().then((mod) => mod.Area), { ssr: false });
const BarChart = dynamic<any>(() => loadRecharts().then((mod) => mod.BarChart), {
  ssr: false
});
const Bar = dynamic<any>(() => loadRecharts().then((mod) => mod.Bar), { ssr: false });
const CartesianGrid = dynamic<any>(() => loadRecharts().then((mod) => mod.CartesianGrid), {
  ssr: false
});
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

const LIGHTWEIGHT_CHART_SOLID_BACKGROUND: ColorType = "solid" as ColorType;
const LIGHTWEIGHT_CHART_CROSSHAIR_NORMAL: CrosshairMode = 0;
const LIGHTWEIGHT_CHART_LINE_SOLID: LineStyle = 0;
const LIGHTWEIGHT_CHART_LINE_DOTTED: LineStyle = 1;
const LIGHTWEIGHT_CHART_LINE_SPARSE_DOTTED: LineStyle = 4;
const SETTINGS_STORAGE_KEY = "korra-settings";
const UI_PREFERENCES_STORAGE_KEY = "korra-ui-preferences";
const PRESETS_STORAGE_KEY = "korra-presets";
const UPLOADED_STRATEGY_MODELS_STORAGE_KEY = "korra-uploaded-strategy-models";
const TERMINAL_VIEW_STATE_STORAGE_KEY = "korra-terminal-view-state";
const DEFAULT_COPYTRADE_ROUTE_PATHNAME = "/settings/account";
const DEFAULT_COPYTRADE_ROUTE_SEARCH = "?view=list";
const DEFAULT_COPYTRADE_ROUTE =
  `${DEFAULT_COPYTRADE_ROUTE_PATHNAME}${DEFAULT_COPYTRADE_ROUTE_SEARCH}`;
const DIRECT_MT5_ADD_ACCOUNT_PATH = "/settings/account?view=add";
type SavedPreset = { name: string; settings: Record<string, any>; savedAt: number };
type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type SurfaceTab = "chart" | "settings" | "models" | "backtest" | "ai" | "copytrade";
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
type PanelTab = "active" | "assets" | "history" | "actions";
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
type StrategyBacktestSurfaceSummary = {
  buyEntryTrigger: string[];
  sellEntryTrigger: string[];
  buyExitTrigger: string[];
  sellExitTrigger: string[];
};

const SURFACE_TAB_IDS: SurfaceTab[] = ["chart", "models", "settings", "backtest", "ai", "copytrade"];
const BACKTEST_TAB_IDS: BacktestTab[] = [
  "mainSettings",
  "mainStats",
  "timeSettings",
  "performanceStats",
  "history",
  "calendar",
  "cluster",
  "entryExit",
  "dimensions",
  "propFirm"
];
const PANEL_TAB_IDS: PanelTab[] = ["active", "assets", "history", "actions"];

const isSurfaceTab = (value: unknown): value is SurfaceTab => {
  return typeof value === "string" && SURFACE_TAB_IDS.includes(value as SurfaceTab);
};

const isChartSurfaceTab = (value: SurfaceTab): boolean => value === "chart";

const isBacktestTab = (value: unknown): value is BacktestTab => {
  return typeof value === "string" && BACKTEST_TAB_IDS.includes(value as BacktestTab);
};
const isPanelTab = (value: unknown): value is PanelTab => {
  return typeof value === "string" && PANEL_TAB_IDS.includes(value as PanelTab);
};

const applyDefaultCopytradeRoute = (parsed: URL): void => {
  parsed.pathname = DEFAULT_COPYTRADE_ROUTE_PATHNAME;
  parsed.search = DEFAULT_COPYTRADE_ROUTE_SEARCH;
};

const normalizeCopytradeRestoredPath = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_COPYTRADE_ROUTE;
  }

  try {
    const parsed = new URL(value, "https://korra.local");

    if (parsed.pathname === "/settings" || parsed.pathname === "/settings/") {
      applyDefaultCopytradeRoute(parsed);
    }

    if (parsed.pathname === "/settings/account-management") {
      applyDefaultCopytradeRoute(parsed);
    }

    if (parsed.pathname === "/tracking" || parsed.pathname === "/tracking/") {
      applyDefaultCopytradeRoute(parsed);
    }

    if (parsed.pathname === "/ftux-add-trade" || parsed.pathname === "/ftux-add-trade/") {
      parsed.pathname = DEFAULT_COPYTRADE_ROUTE_PATHNAME;
      parsed.search = "?view=add";
    }

    if (parsed.pathname === "/ftux-add-trade/mt5" || parsed.pathname === "/ftux-add-trade/mt5/") {
      parsed.pathname = DEFAULT_COPYTRADE_ROUTE_PATHNAME;
      parsed.search = "?view=add";
    }

    if (
      parsed.pathname === "/ftux-add-trade/mt5/sync" ||
      parsed.pathname === "/ftux-add-trade/mt5/sync/"
    ) {
      parsed.pathname = DEFAULT_COPYTRADE_ROUTE_PATHNAME;
      parsed.search = "?view=add";
    }

    if (parsed.pathname.startsWith("/settings/account/")) {
      applyDefaultCopytradeRoute(parsed);
    }

    if (parsed.pathname === DEFAULT_COPYTRADE_ROUTE_PATHNAME) {
      const view = String(parsed.searchParams.get("view") || "").trim().toLowerCase();
      const accountId = String(parsed.searchParams.get("accountId") || "").trim();
      const providerAccountId = String(parsed.searchParams.get("providerAccountId") || "").trim();
      const isAccountSpecificView =
        view === "statistics" || accountId.length > 0 || providerAccountId.length > 0;

      if (isAccountSpecificView) {
        applyDefaultCopytradeRoute(parsed);
      }
    }

    const isAllowedRoute =
      parsed.pathname.startsWith("/settings/account") ||
      parsed.pathname === DIRECT_MT5_ADD_ACCOUNT_PATH;

    if (!isAllowedRoute) {
      return DEFAULT_COPYTRADE_ROUTE;
    }

    if (parsed.pathname.startsWith("/settings/account")) {
      parsed.searchParams.delete("seed");
    }

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return DEFAULT_COPYTRADE_ROUTE;
  }
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
  volume?: number;
};

type MainChartContextMenuCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  index: number | null;
};

type MainChartContextMenuState = {
  clientX: number;
  clientY: number;
  candle: MainChartContextMenuCandle;
};

type AggressorPressurePoint = {
  timestampMs: number;
  buyPressure: number;
  sellPressure: number;
  spread: number;
};

type AggressorPressureSnapshot = {
  buyPressure: number;
  sellPressure: number;
  scaleCeiling: number;
  averageSpread: number;
  tickCount: number;
  updatedAtMs: number;
};

type AggressorTrainingPeak = {
  timestampMs: number;
  peak: number;
};

type VolumeNowcastSnapshot = {
  estimatedCurrentVolume: number;
  estimatedFinalVolume: number;
  baselineVolume: number;
  progressRatio: number;
  confidence: number;
  tickCount: number;
  updatedAtMs: number;
};

type VolumeBaselineProfile = {
  bySlot: Map<number, number>;
  bySlotCount: Map<number, number>;
  byHour: Map<number, number>;
  byHourCount: Map<number, number>;
  byWeekday: Map<number, number>;
  byWeekdayCount: Map<number, number>;
  byWeekdayHour: Map<string, number>;
  byWeekdayHourCount: Map<string, number>;
  globalAverage: number;
  sampleCount: number;
};

type TickDirectionTone = "up" | "down" | "neutral";

type LiveQuoteSnapshot = {
  bid: number | null;
  ask: number | null;
  spread: number | null;
  bidTone: TickDirectionTone;
  askTone: TickDirectionTone;
  updatedAtMs: number;
};

const EMPTY_CANDLES: Candle[] = [];
const STATS_REFRESH_HOLD_MS = 3000;
const STATS_REFRESH_COMPLETE_DELAY_MS = 1000;
const STATS_REFRESH_VISUAL_FULL_THRESHOLD = 99.95;
const WORKSPACE_PANEL_MIN_WIDTH = 350;
const WORKSPACE_PANEL_DEFAULT_WIDTH = 430;
const WORKSPACE_PANEL_MAX_WIDTH = 980;
const WORKSPACE_CHART_MIN_WIDTH = 360;

const resolveWorkspacePanelWidth = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return WORKSPACE_PANEL_DEFAULT_WIDTH;
  }

  const workspaceWidth =
    typeof window !== "undefined"
      ? window.innerWidth
      : WORKSPACE_PANEL_DEFAULT_WIDTH + WORKSPACE_CHART_MIN_WIDTH;
  const maxFromWorkspace = Math.min(
    WORKSPACE_PANEL_MAX_WIDTH,
    workspaceWidth - WORKSPACE_CHART_MIN_WIDTH
  );
  const maxWidth = Math.max(WORKSPACE_PANEL_MIN_WIDTH, maxFromWorkspace);

  return clamp(Math.round(numeric), WORKSPACE_PANEL_MIN_WIDTH, maxWidth);
};

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
} & BacktestTradeAiEntryMeta;

type ServerTradePayload = {
  id: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  entrySource: string;
  exitReason: string;
  pnlPct: number;
  pnlUsd: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
} & BacktestTradeAiEntryMeta;

type ServerLibraryPointPayload = {
  id?: string;
  uid?: string;
  libId?: string;
  model?: string | null;
  metaModel?: string | null;
  entryTime?: number | null;
  metaTime?: number | null;
  pnl?: number | null;
  metaPnl?: number | null;
  result?: string | null;
  metaOutcome?: string | null;
  metaSession?: string | null;
  dir?: number | null;
  label?: number | null;
  v?: number[] | null;
};

const normalizeBacktestHistoryRows = (rows: BacktestHistoryRow[]): HistoryItem[] => {
  return rows.map((row) => ({
    ...row,
    entryTime: row.entryTime as UTCTimestamp,
    exitTime: row.exitTime as UTCTimestamp
  }));
};

const cloneTradeEntryNeighbors = (value: unknown): BacktestEntryNeighbor[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: BacktestEntryNeighbor[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const row = item as Record<string, unknown>;
    const rawTradeRef =
      row.t && typeof row.t === "object" && !Array.isArray(row.t)
        ? (row.t as Record<string, unknown>)
        : null;
    const uid =
      row.metaUid ??
      row.uid ??
      rawTradeRef?.uid ??
      rawTradeRef?.tradeUid ??
      rawTradeRef?.id ??
      null;
    const dir = Number(row.dir ?? rawTradeRef?.direction ?? NaN);
    const label = Number(row.label ?? NaN);
    const d = Number(row.d ?? NaN);
    const w = Number(row.w ?? NaN);
    const metaTime = Number(row.metaTime ?? rawTradeRef?.entryTime ?? NaN);
    const metaPnl = Number(row.metaPnl ?? rawTradeRef?.pnl ?? NaN);

    out.push({
      uid: uid == null ? null : String(uid),
      metaUid: uid == null ? null : String(uid),
      metaTime: Number.isFinite(metaTime) ? metaTime : null,
      metaPnl: Number.isFinite(metaPnl) ? metaPnl : null,
      metaOutcome:
        rawTradeRef?.result != null
          ? String(rawTradeRef.result)
          : row.metaOutcome != null
            ? String(row.metaOutcome)
            : null,
      metaSession:
        rawTradeRef?.session != null
          ? String(rawTradeRef.session)
          : row.metaSession != null
            ? String(row.metaSession)
            : null,
      dir: Number.isFinite(dir) ? dir : null,
      label: Number.isFinite(label) ? label : null,
      d: Number.isFinite(d) ? d : null,
      w: Number.isFinite(w) ? w : null,
      t: rawTradeRef
        ? {
            id: rawTradeRef.id != null ? String(rawTradeRef.id) : undefined,
            uid:
              rawTradeRef.uid != null
                ? String(rawTradeRef.uid)
                : uid == null
                  ? undefined
                  : String(uid),
            tradeUid:
              rawTradeRef.tradeUid != null
                ? String(rawTradeRef.tradeUid)
                : uid == null
                  ? undefined
                  : String(uid),
            direction: Number.isFinite(Number(rawTradeRef.direction))
              ? Number(rawTradeRef.direction)
              : Number.isFinite(dir)
                ? dir
                : undefined,
            entryTime: Number.isFinite(Number(rawTradeRef.entryTime))
              ? Number(rawTradeRef.entryTime)
              : Number.isFinite(metaTime)
                ? metaTime
                : undefined,
            pnl: Number.isFinite(Number(rawTradeRef.pnl))
              ? Number(rawTradeRef.pnl)
              : Number.isFinite(metaPnl)
                ? metaPnl
                : undefined,
            result: rawTradeRef.result != null ? String(rawTradeRef.result) : undefined,
            session: rawTradeRef.session != null ? String(rawTradeRef.session) : undefined,
            entryModel:
              rawTradeRef.entryModel != null ? String(rawTradeRef.entryModel) : undefined,
            chunkType:
              rawTradeRef.chunkType != null ? String(rawTradeRef.chunkType) : undefined,
            model: rawTradeRef.model != null ? String(rawTradeRef.model) : undefined,
            side:
              rawTradeRef.side === "Short"
                ? "Short"
                : rawTradeRef.side === "Long"
                  ? "Long"
                  : undefined
          }
        : uid == null
          ? undefined
          : {
              id: String(uid),
              uid: String(uid),
              tradeUid: String(uid)
            }
    });
  }

  return out;
};

const toServerTradePayload = (trade: HistoryItem): ServerTradePayload => ({
  id: trade.id,
  symbol: trade.symbol,
  side: trade.side,
  result: trade.result,
  entrySource: trade.entrySource,
  exitReason: trade.exitReason,
  pnlPct: trade.pnlPct,
  pnlUsd: trade.pnlUsd,
  entryTime: Number(trade.entryTime),
  exitTime: Number(trade.exitTime),
  entryPrice: trade.entryPrice,
  targetPrice: trade.targetPrice,
  stopPrice: trade.stopPrice,
  outcomePrice: trade.outcomePrice,
  units: trade.units,
  entryConfidence: trade.entryConfidence ?? null,
  confidence: trade.confidence ?? trade.entryConfidence ?? null,
  entryMargin:
    trade.entryMargin ??
    trade.entryConfidence ??
    trade.confidence ??
    null,
  margin:
    trade.margin ??
    trade.entryMargin ??
    trade.entryConfidence ??
    trade.confidence ??
    null,
  aiConfidence: trade.aiConfidence ?? null,
  aiMode:
    trade.aiMode === "knn" || trade.aiMode === "hdbscan" || trade.aiMode === "off"
      ? trade.aiMode
      : null,
  closestClusterUid:
    trade.closestClusterUid == null ? null : String(trade.closestClusterUid),
  entryNeighbors: cloneTradeEntryNeighbors(trade.entryNeighbors)
});

const toServerLibraryPointPayload = (point: any): ServerLibraryPointPayload => ({
  id: point?.id != null ? String(point.id) : undefined,
  uid:
    point?.uid != null
      ? String(point.uid)
      : point?.id != null
        ? String(point.id)
        : undefined,
  libId:
    point?.libId != null
      ? String(point.libId)
      : point?.metaLib != null
        ? String(point.metaLib)
        : undefined,
  model: point?.model != null ? String(point.model) : null,
  metaModel: point?.metaModel != null ? String(point.metaModel) : null,
  entryTime: point?.entryTime == null ? null : Number(point.entryTime),
  metaTime: point?.metaTime == null ? null : Number(point.metaTime),
  pnl: point?.pnl == null ? null : Number(point.pnl),
  metaPnl: point?.metaPnl == null ? null : Number(point.metaPnl),
  result: point?.result != null ? String(point.result) : null,
  metaOutcome: point?.metaOutcome != null ? String(point.metaOutcome) : null,
  metaSession: point?.metaSession != null ? String(point.metaSession) : null,
  dir: point?.dir == null ? null : Number(point.dir),
  label: point?.label == null ? null : Number(point.label),
  v: Array.isArray(point?.v)
    ? point.v
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isFinite(value))
    : null
});

const computeBacktestRowsLocally = (
  payload: BacktestHistoryComputeRequest
): HistoryItem[] => {
  const rows = finalizeBacktestHistoryRows(
    computeBacktestHistoryRowsChunk({
      blueprints: payload.blueprints,
      candleSeriesBySymbol: payload.candleSeriesBySymbol,
      oneMinuteCandlesBySymbol: payload.oneMinuteCandlesBySymbol,
      minutePreciseEnabled: payload.minutePreciseEnabled,
      modelNamesById: payload.modelNamesById,
      tpDollars: payload.tpDollars,
      slDollars: payload.slDollars,
      stopMode: payload.stopMode,
      breakEvenTriggerPct: payload.breakEvenTriggerPct,
      trailingStartPct: payload.trailingStartPct,
      trailingDistPct: payload.trailingDistPct
    }),
    payload.limit
  );

  return normalizeBacktestHistoryRows(rows);
};

const computeBacktestRowsOnServer = async (
  payload: BacktestHistoryComputeRequest,
  signal?: AbortSignal
): Promise<HistoryItem[]> => {
  try {
    const response = await fetch("/api/backtest/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal
    });

    if (!response.ok) {
      throw new Error(`Backtest server compute failed (${response.status}).`);
    }

    const data = (await response.json()) as { rows?: unknown };
    const rows = Array.isArray(data.rows) ? (data.rows as BacktestHistoryRow[]) : [];
    return normalizeBacktestHistoryRows(rows);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    // Prevent false "0 trades" outcomes when the server compute path fails.
    return computeBacktestRowsLocally(payload);
  }
};

type PanelAnalyticsServerPayload = {
  panelSourceTrades: HistoryItem[];
  panelBacktestFilterSettings: BacktestFilterSettings;
  panelConfidenceGateDisabled: boolean;
  panelEffectiveConfidenceThreshold: number;
  panelLibraryPoints?: ServerLibraryPointPayload[];
  activePanelSourceTrades?: HistoryItem[];
  activePanelBacktestFilterSettings?: BacktestFilterSettings;
  activePanelConfidenceGateDisabled?: boolean;
  activePanelEffectiveConfidenceThreshold?: number;
  aiLibraryDefaultsById: Record<string, Record<string, AiLibrarySettingValue>>;
};

type PanelAnalyticsServerResponse = {
  dateFilteredTrades: HistoryItem[];
  libraryCandidateTrades: HistoryItem[];
  timeFilteredTrades: HistoryItem[];
  confidenceByIdEntries: Array<[string, number]>;
  chartPanelHistoryRows: HistoryItem[];
  activePanelHistoryRows: HistoryItem[];
};

const computePanelAnalyticsOnServer = async (
  payload: PanelAnalyticsServerPayload,
  signal?: AbortSignal
): Promise<PanelAnalyticsServerResponse> => {
  const requestBody: Record<string, unknown> = {
    panelSourceTrades: payload.panelSourceTrades.map(toServerTradePayload),
    panelBacktestFilterSettings: payload.panelBacktestFilterSettings,
    panelConfidenceGateDisabled: payload.panelConfidenceGateDisabled,
    panelEffectiveConfidenceThreshold: payload.panelEffectiveConfidenceThreshold,
    aiLibraryDefaultsById: payload.aiLibraryDefaultsById
  };

  if (payload.panelLibraryPoints) {
    requestBody.panelLibraryPoints = payload.panelLibraryPoints.map(
      toServerLibraryPointPayload
    );
  }

  if (payload.activePanelSourceTrades) {
    requestBody.activePanelSourceTrades = payload.activePanelSourceTrades.map(toServerTradePayload);
  }
  if (payload.activePanelBacktestFilterSettings) {
    requestBody.activePanelBacktestFilterSettings = payload.activePanelBacktestFilterSettings;
  }
  if (typeof payload.activePanelConfidenceGateDisabled === "boolean") {
    requestBody.activePanelConfidenceGateDisabled = payload.activePanelConfidenceGateDisabled;
  }
  if (typeof payload.activePanelEffectiveConfidenceThreshold === "number") {
    requestBody.activePanelEffectiveConfidenceThreshold = payload.activePanelEffectiveConfidenceThreshold;
  }

  const response = await fetch("/api/backtest/panel-analytics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new Error(`Panel analytics server compute failed (${response.status}).`);
  }

  const data = (await response.json()) as Partial<PanelAnalyticsServerResponse>;
  return {
    dateFilteredTrades: Array.isArray(data.dateFilteredTrades) ? data.dateFilteredTrades : [],
    libraryCandidateTrades: Array.isArray(data.libraryCandidateTrades)
      ? data.libraryCandidateTrades
      : [],
    timeFilteredTrades: Array.isArray(data.timeFilteredTrades) ? data.timeFilteredTrades : [],
    confidenceByIdEntries: Array.isArray(data.confidenceByIdEntries)
      ? (data.confidenceByIdEntries as Array<[string, number]>)
      : [],
    chartPanelHistoryRows: Array.isArray(data.chartPanelHistoryRows) ? data.chartPanelHistoryRows : [],
    activePanelHistoryRows: Array.isArray(data.activePanelHistoryRows) ? data.activePanelHistoryRows : []
  };
};

const computeBacktestAnalyticsOnServer = async (
  payload: BacktestAnalyticsServerPayload,
  signal?: AbortSignal
): Promise<BacktestAnalyticsServerResponse> => {
  const requestBody = {
    ...payload,
    backtestTrades: payload.backtestTrades.map(toServerTradePayload),
    baselineMainStatsTrades: payload.baselineMainStatsTrades.map(toServerTradePayload)
  };

  const response = await fetch("/api/backtest/analytics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new Error(`Backtest analytics server compute failed (${response.status}).`);
  }

  const data = (await response.json()) as Partial<BacktestAnalyticsServerResponse>;
  return {
    backtestSummary:
      data.backtestSummary && typeof data.backtestSummary === "object"
        ? { ...EMPTY_BACKTEST_SUMMARY_STATS, ...(data.backtestSummary as BacktestSummaryStats) }
        : { ...EMPTY_BACKTEST_SUMMARY_STATS },
    baselineMainStatsSummary:
      data.baselineMainStatsSummary && typeof data.baselineMainStatsSummary === "object"
        ? {
            ...EMPTY_BACKTEST_SUMMARY_STATS,
            ...(data.baselineMainStatsSummary as BacktestSummaryStats)
          }
        : { ...EMPTY_BACKTEST_SUMMARY_STATS },
    mainStatsSummary:
      data.mainStatsSummary && typeof data.mainStatsSummary === "object"
        ? { ...EMPTY_BACKTEST_SUMMARY_STATS, ...(data.mainStatsSummary as BacktestSummaryStats) }
        : { ...EMPTY_BACKTEST_SUMMARY_STATS },
    mainStatsSessionRows: Array.isArray(data.mainStatsSessionRows)
      ? (data.mainStatsSessionRows as MainStatsBucketRow[])
      : [],
    mainStatsModelRows: Array.isArray(data.mainStatsModelRows)
      ? (data.mainStatsModelRows as MainStatsBucketRow[])
      : [],
    mainStatsMonthRows: Array.isArray(data.mainStatsMonthRows)
      ? (data.mainStatsMonthRows as MainStatsMonthRow[])
      : [],
    mainStatsAiEfficiency:
      typeof data.mainStatsAiEfficiency === "number" ? data.mainStatsAiEfficiency : null,
    mainStatsAiEffectivenessPct:
      typeof data.mainStatsAiEffectivenessPct === "number"
        ? data.mainStatsAiEffectivenessPct
        : null,
    mainStatsAiEfficacyPct:
      typeof data.mainStatsAiEfficacyPct === "number" ? data.mainStatsAiEfficacyPct : null,
    availableBacktestMonths: Array.isArray(data.availableBacktestMonths)
      ? data.availableBacktestMonths.map((value) => String(value))
      : [],
    calendarActivityEntries: Array.isArray(data.calendarActivityEntries)
      ? (data.calendarActivityEntries as Array<[string, { count: number; wins: number; pnl: number }]>)
      : [],
    selectedBacktestDayTrades: Array.isArray(data.selectedBacktestDayTrades)
      ? (data.selectedBacktestDayTrades as HistoryItem[])
      : [],
    performanceStatsModelOptions: Array.isArray(data.performanceStatsModelOptions)
      ? data.performanceStatsModelOptions.map((value) => String(value))
      : ["All"],
    performanceStatsTemporalCharts:
      data.performanceStatsTemporalCharts && typeof data.performanceStatsTemporalCharts === "object"
        ? (data.performanceStatsTemporalCharts as PerformanceStatsTemporalCharts)
        : { ...EMPTY_PERFORMANCE_STATS_TEMPORAL_CHARTS },
    entryExitStats:
      data.entryExitStats && typeof data.entryExitStats === "object"
        ? {
            entry: Array.isArray((data.entryExitStats as any).entry)
              ? ((data.entryExitStats as any).entry as Array<[string, number]>)
              : [],
            exit: Array.isArray((data.entryExitStats as any).exit)
              ? ((data.entryExitStats as any).exit as Array<[string, number]>)
              : []
          }
        : { entry: [], exit: [] },
    entryExitChartData:
      data.entryExitChartData && typeof data.entryExitChartData === "object"
        ? {
            entry: Array.isArray((data.entryExitChartData as any).entry)
              ? ((data.entryExitChartData as any).entry as Array<{
                  bucket: string;
                  count: number;
                  share: number;
                }>)
              : [],
            exit: Array.isArray((data.entryExitChartData as any).exit)
              ? ((data.entryExitChartData as any).exit as Array<{
                  bucket: string;
                  count: number;
                  share: number;
                }>)
              : []
          }
        : { entry: [], exit: [] },
    backtestClusterData:
      data.backtestClusterData && typeof data.backtestClusterData === "object"
        ? {
            total: Number((data.backtestClusterData as any).total) || 0,
            nodes: Array.isArray((data.backtestClusterData as any).nodes)
              ? ((data.backtestClusterData as any).nodes as BacktestClusterNode[])
              : [],
            groups: Array.isArray((data.backtestClusterData as any).groups)
              ? ((data.backtestClusterData as any).groups as BacktestClusterGroup[])
              : []
          }
        : { total: 0, nodes: [], groups: [] },
    backtestClusterViewOptions:
      data.backtestClusterViewOptions && typeof data.backtestClusterViewOptions === "object"
        ? {
            sessions: Array.isArray((data.backtestClusterViewOptions as any).sessions)
              ? ((data.backtestClusterViewOptions as any).sessions as string[])
              : [],
            months: Array.isArray((data.backtestClusterViewOptions as any).months)
              ? ((data.backtestClusterViewOptions as any).months as number[])
              : [],
            weekdays: Array.isArray((data.backtestClusterViewOptions as any).weekdays)
              ? ((data.backtestClusterViewOptions as any).weekdays as number[])
              : [],
            hours: Array.isArray((data.backtestClusterViewOptions as any).hours)
              ? ((data.backtestClusterViewOptions as any).hours as number[])
              : []
          }
        : { sessions: [], months: [], weekdays: [], hours: [] }
  };
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

type BacktestSummaryStats = {
  tradeCount: number;
  netPnl: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  avgPnl: number;
  avgHoldMinutes: number;
  avgWinDurationMin: number;
  avgLossDurationMin: number;
  avgR: number;
  avgWin: number;
  avgLoss: number;
  averageConfidence: number;
  tradesPerDay: number;
  tradesPerWeek: number;
  tradesPerMonth: number;
  consistencyPerDay: number;
  consistencyPerWeek: number;
  consistencyPerMonth: number;
  consistencyPerTrade: number;
  avgPnlPerDay: number;
  avgPnlPerWeek: number;
  avgPnlPerMonth: number;
  avgPeakPerTrade: number;
  avgMaxDrawdownPerTrade: number;
  avgTimeInProfitMin: number;
  avgTimeInDeficitMin: number;
  sharpe: number;
  sortino: number;
  wins: number;
  losses: number;
  grossWins: number;
  grossLosses: number;
  maxWin: number;
  maxLoss: number;
  maxDrawdown: number;
  bestDay: { key: string; count: number; pnl: number } | null;
  worstDay: { key: string; count: number; pnl: number } | null;
};

type MainStatsBucketRow = {
  label: string;
  total: number;
  trades: number;
};

type MainStatsMonthRow = {
  key: string;
  total: number;
  trades: number;
  months: number;
  avgPerTrade: number;
};

type TemporalChartRow = {
  bucket: string;
  pnl: number;
  count: number;
};

type PerformanceStatsTemporalCharts = {
  hours: TemporalChartRow[];
  weekday: TemporalChartRow[];
  month: TemporalChartRow[];
  year: TemporalChartRow[];
  hasData: boolean;
};

type BacktestAnalyticsServerPayload = {
  backtestTrades: HistoryItem[];
  baselineMainStatsTrades: HistoryItem[];
  confidenceByIdEntries: Array<[string, number]>;
  aiMode: "off" | "knn" | "hdbscan";
  confidenceGateDisabled: boolean;
  selectedBacktestDateKey: string;
  performanceStatsModel: string;
  isCalendarBacktestTabActive: boolean;
  isPerformanceStatsBacktestTabActive: boolean;
  isEntryExitBacktestTabActive: boolean;
  isClusterBacktestTabActive: boolean;
};

type BacktestAnalyticsServerResponse = {
  backtestSummary: BacktestSummaryStats;
  baselineMainStatsSummary: BacktestSummaryStats;
  mainStatsSummary: BacktestSummaryStats;
  mainStatsSessionRows: MainStatsBucketRow[];
  mainStatsModelRows: MainStatsBucketRow[];
  mainStatsMonthRows: MainStatsMonthRow[];
  mainStatsAiEfficiency: number | null;
  mainStatsAiEffectivenessPct: number | null;
  mainStatsAiEfficacyPct: number | null;
  availableBacktestMonths: string[];
  calendarActivityEntries: Array<[string, { count: number; wins: number; pnl: number }]>;
  selectedBacktestDayTrades: HistoryItem[];
  performanceStatsModelOptions: string[];
  performanceStatsTemporalCharts: PerformanceStatsTemporalCharts;
  entryExitStats: {
    entry: Array<[string, number]>;
    exit: Array<[string, number]>;
  };
  entryExitChartData: {
    entry: Array<{ bucket: string; count: number; share: number }>;
    exit: Array<{ bucket: string; count: number; share: number }>;
  };
  backtestClusterData: {
    total: number;
    nodes: BacktestClusterNode[];
    groups: BacktestClusterGroup[];
  };
  backtestClusterViewOptions: {
    sessions: string[];
    months: number[];
    weekdays: number[];
    hours: number[];
  };
};

const EMPTY_BACKTEST_SUMMARY_STATS: BacktestSummaryStats = {
  tradeCount: 0,
  netPnl: 0,
  totalPnl: 0,
  winRate: 0,
  profitFactor: 0,
  avgPnl: 0,
  avgHoldMinutes: 0,
  avgWinDurationMin: 0,
  avgLossDurationMin: 0,
  avgR: 0,
  avgWin: 0,
  avgLoss: 0,
  averageConfidence: 0,
  tradesPerDay: 0,
  tradesPerWeek: 0,
  tradesPerMonth: 0,
  consistencyPerDay: 0,
  consistencyPerWeek: 0,
  consistencyPerMonth: 0,
  consistencyPerTrade: 0,
  avgPnlPerDay: 0,
  avgPnlPerWeek: 0,
  avgPnlPerMonth: 0,
  avgPeakPerTrade: 0,
  avgMaxDrawdownPerTrade: 0,
  avgTimeInProfitMin: 0,
  avgTimeInDeficitMin: 0,
  sharpe: 0,
  sortino: 0,
  wins: 0,
  losses: 0,
  grossWins: 0,
  grossLosses: 0,
  maxWin: 0,
  maxLoss: 0,
  maxDrawdown: 0,
  bestDay: null,
  worstDay: null
};

const EMPTY_PERFORMANCE_STATS_TEMPORAL_CHARTS: PerformanceStatsTemporalCharts = {
  hours: [],
  weekday: [],
  month: [],
  year: [],
  hasData: false
};

const EMPTY_BACKTEST_ANALYTICS_RESPONSE: BacktestAnalyticsServerResponse = {
  backtestSummary: { ...EMPTY_BACKTEST_SUMMARY_STATS },
  baselineMainStatsSummary: { ...EMPTY_BACKTEST_SUMMARY_STATS },
  mainStatsSummary: { ...EMPTY_BACKTEST_SUMMARY_STATS },
  mainStatsSessionRows: [],
  mainStatsModelRows: [],
  mainStatsMonthRows: [],
  mainStatsAiEfficiency: null,
  mainStatsAiEffectivenessPct: null,
  mainStatsAiEfficacyPct: null,
  availableBacktestMonths: [],
  calendarActivityEntries: [],
  selectedBacktestDayTrades: [],
  performanceStatsModelOptions: ["All"],
  performanceStatsTemporalCharts: { ...EMPTY_PERFORMANCE_STATS_TEMPORAL_CHARTS },
  entryExitStats: {
    entry: [],
    exit: []
  },
  entryExitChartData: {
    entry: [],
    exit: []
  },
  backtestClusterData: {
    total: 0,
    nodes: [],
    groups: []
  },
  backtestClusterViewOptions: {
    sessions: [],
    months: [],
    weekdays: [],
    hours: []
  }
};

const getTradeWeekKey = (timestampSeconds: UTCTimestamp): string => {
  const date = new Date(Number(timestampSeconds) * 1000);
  const day = date.getUTCDay();
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)
  );

  return weekStart.toISOString().slice(0, 10);
};

const summarizeBacktestTradesFallback = (
  trades: HistoryItem[],
  confidenceResolver: (trade: HistoryItem) => number
): BacktestSummaryStats => {
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

const buildModelRunChartData = (trades: HistoryItem[]): ModelRunChartPoint[] => {
  const rows = new Map<string, { pnl: number; tradeCount: number }>();

  for (const trade of [...trades].sort((left, right) => Number(left.exitTime) - Number(right.exitTime))) {
    const label = getTradeDayKey(trade.exitTime);
    const current = rows.get(label) ?? { pnl: 0, tradeCount: 0 };
    current.pnl += trade.pnlUsd;
    current.tradeCount += 1;
    rows.set(label, current);
  }

  let cumulativePnl = 0;

  return Array.from(rows.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([label, row]) => {
      cumulativePnl += row.pnl;

      return {
        label,
        cumulativePnl,
        tradeCount: row.tradeCount
      };
    });
};

const computeMainStatsSessionRowsFallback = (trades: HistoryItem[]): MainStatsBucketRow[] => {
  const map = new Map<string, MainStatsBucketRow>();

  for (const trade of trades) {
    const label = getSessionLabel(trade.entryTime);
    const current = map.get(label) ?? { label, total: 0, trades: 0 };
    current.total += trade.pnlUsd;
    current.trades += 1;
    map.set(label, current);
  }

  return Array.from(map.values()).sort((left, right) => {
    const leftIndex = backtestSessionLabels.indexOf(left.label as (typeof backtestSessionLabels)[number]);
    const rightIndex = backtestSessionLabels.indexOf(
      right.label as (typeof backtestSessionLabels)[number]
    );

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
};

const computeMainStatsModelRowsFallback = (trades: HistoryItem[]): MainStatsBucketRow[] => {
  const map = new Map<string, MainStatsBucketRow>();

  for (const trade of trades) {
    const label = trade.entrySource || "Unknown";
    const current = map.get(label) ?? { label, total: 0, trades: 0 };
    current.total += trade.pnlUsd;
    current.trades += 1;
    map.set(label, current);
  }

  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
};

const computeMainStatsMonthRowsFallback = (trades: HistoryItem[]): MainStatsMonthRow[] => {
  const monthBuckets = new Map<string, { key: string; pnl: number; trades: number }>();

  for (const trade of trades) {
    const key = getTradeMonthKey(trade.exitTime);
    const monthKey = String(getTradeMonthIndex(trade.exitTime) + 1).padStart(2, "0");
    const current = monthBuckets.get(key) ?? { key: monthKey, pnl: 0, trades: 0 };
    current.pnl += trade.pnlUsd;
    current.trades += 1;
    monthBuckets.set(key, current);
  }

  const map = new Map<string, MainStatsMonthRow>();

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
};

const buildBacktestAnalyticsFallbackResponse = (params: {
  backtestTrades: HistoryItem[];
  baselineMainStatsTrades: HistoryItem[];
  selectedBacktestDateKey: string;
  aiMode: BacktestSettingsSnapshot["aiMode"];
  confidenceGateDisabled: boolean;
  confidenceResolver: (trade: HistoryItem) => number;
}): BacktestAnalyticsServerResponse => {
  const {
    backtestTrades,
    baselineMainStatsTrades,
    selectedBacktestDateKey,
    aiMode,
    confidenceGateDisabled,
    confidenceResolver
  } = params;
  const backtestSummary = summarizeBacktestTradesFallback(backtestTrades, confidenceResolver);
  const baselineMainStatsSummary = summarizeBacktestTradesFallback(
    baselineMainStatsTrades,
    confidenceResolver
  );
  const mainStatsSummary = summarizeBacktestTradesFallback(backtestTrades, confidenceResolver);

  const dayMap = new Map<string, { count: number; wins: number; pnl: number }>();
  for (const trade of backtestTrades) {
    const dayKey = getTradeDayKey(trade.entryTime);
    const current = dayMap.get(dayKey) ?? { count: 0, wins: 0, pnl: 0 };
    current.count += 1;
    current.wins += trade.result === "Win" ? 1 : 0;
    current.pnl += trade.pnlUsd;
    dayMap.set(dayKey, current);
  }

  const monthKeys = Array.from(
    new Set(backtestTrades.map((trade) => getTradeDayKey(trade.entryTime).slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a));
  const selectedBacktestDayTrades = selectedBacktestDateKey
    ? backtestTrades.filter((trade) => getTradeDayKey(trade.entryTime) === selectedBacktestDateKey)
    : [];

  const entryCounts: Record<string, number> = {};
  const exitCounts: Record<string, number> = {};
  for (const trade of backtestTrades) {
    const entryKey = trade.entrySource || "Unknown";
    const exitKey = trade.exitReason || "None";
    entryCounts[entryKey] = (entryCounts[entryKey] ?? 0) + 1;
    exitCounts[exitKey] = (exitCounts[exitKey] ?? 0) + 1;
  }

  const entryExitStats = {
    entry: Object.entries(entryCounts).sort((left, right) => right[1] - left[1]),
    exit: Object.entries(exitCounts).sort((left, right) => right[1] - left[1])
  };
  const toRows = (source: Array<[string, number]>) => {
    const total = source.reduce((sum, [, count]) => sum + count, 0);
    return source.map(([bucket, count]) => ({
      bucket,
      count,
      share: total > 0 ? (count / total) * 100 : 0
    }));
  };

  const confidenceDiff =
    baselineMainStatsTrades.length > 0
      ? backtestSummary.averageConfidence - baselineMainStatsSummary.averageConfidence
      : null;
  const canComputeAiDeltas =
    aiMode !== "off" &&
    !confidenceGateDisabled &&
    baselineMainStatsTrades.length >= 5 &&
    backtestTrades.length >= 5;

  return {
    ...EMPTY_BACKTEST_ANALYTICS_RESPONSE,
    backtestSummary,
    baselineMainStatsSummary,
    mainStatsSummary,
    mainStatsSessionRows: computeMainStatsSessionRowsFallback(backtestTrades),
    mainStatsModelRows: computeMainStatsModelRowsFallback(backtestTrades),
    mainStatsMonthRows: computeMainStatsMonthRowsFallback(backtestTrades),
    mainStatsAiEfficiency: null,
    mainStatsAiEffectivenessPct:
      canComputeAiDeltas
        ? mainStatsSummary.winRate - baselineMainStatsSummary.winRate
        : null,
    mainStatsAiEfficacyPct: canComputeAiDeltas ? confidenceDiff : null,
    availableBacktestMonths: monthKeys,
    calendarActivityEntries: Array.from(dayMap.entries()),
    selectedBacktestDayTrades,
    entryExitStats,
    entryExitChartData: {
      entry: toRows(entryExitStats.entry),
      exit: toRows(entryExitStats.exit)
    }
  };
};

const roundCopytradeMetric = (value: number, digits = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const computeCopytradeDirectionalStreaks = (values: number[]) => {
  let currentWinning = 0;
  let currentLosing = 0;
  let maxWinning = 0;
  let maxLosing = 0;
  let activeWinning = 0;
  let activeLosing = 0;

  for (const value of values) {
    if (value > 0) {
      activeWinning += 1;
      activeLosing = 0;
      maxWinning = Math.max(maxWinning, activeWinning);
    } else if (value < 0) {
      activeLosing += 1;
      activeWinning = 0;
      maxLosing = Math.max(maxLosing, activeLosing);
    } else {
      activeWinning = 0;
      activeLosing = 0;
    }
  }

  currentWinning = activeWinning;
  currentLosing = activeLosing;

  return {
    currentWinning,
    currentLosing,
    maxWinning,
    maxLosing
  };
};

const COPYTRADE_LOCAL_ACCOUNT_ID = "local";
const COPYTRADE_LOCAL_ACCOUNT_NAME = "Local";
const COPYTRADE_LOCAL_TIMEZONE = "America/New_York";

const buildCopytradeTradeDetail = (
  trade: HistoryItem,
  confidenceResolver: (trade: HistoryItem) => number
) => {
  const quantity = roundCopytradeMetric(Math.abs(trade.units), 4);
  const entryIso = new Date(Number(trade.entryTime) * 1000).toISOString();
  const exitIso = new Date(Number(trade.exitTime) * 1000).toISOString();
  const riskDistance = Math.abs(trade.entryPrice - trade.stopPrice);
  const riskAmount = riskDistance * Math.max(1, Math.abs(trade.units));
  const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
  const adjustedCost = roundCopytradeMetric(Math.abs(trade.entryPrice * trade.units));
  const adjustedProceeds = roundCopytradeMetric(Math.abs(trade.outcomePrice * trade.units));
  const holdTimeSeconds = Math.max(0, Number(trade.exitTime) - Number(trade.entryTime));
  const zellaScore = roundCopytradeMetric(confidenceResolver(trade));

  return {
    id: trade.id,
    public_uid: trade.id,
    trade_public_uid: trade.id,
    account_id: COPYTRADE_LOCAL_ACCOUNT_ID,
    account_name: COPYTRADE_LOCAL_ACCOUNT_NAME,
    open_date: entryIso,
    created_at: entryIso,
    realized: exitIso,
    status: "Closed",
    symbol: trade.symbol,
    instrument: trade.symbol,
    side: trade.side,
    quantity,
    net_profits: roundCopytradeMetric(trade.pnlUsd),
    net_roi: roundCopytradeMetric(trade.pnlPct),
    ticks_value: 0,
    pips: 0,
    points: 0,
    realized_rr: roundCopytradeMetric(riskAmount > 0 ? trade.pnlUsd / riskAmount : 0),
    avg_buy_price: roundCopytradeMetric(trade.entryPrice, 5),
    avg_sell_price: roundCopytradeMetric(trade.outcomePrice, 5),
    adjusted_cost: adjustedCost,
    adjusted_proceeds: adjustedProceeds,
    calculated_fees: 0,
    commission: 0,
    entry_price: roundCopytradeMetric(trade.entryPrice, 5),
    entry_price_in_currency: roundCopytradeMetric(trade.entryPrice, 5),
    exit_price: roundCopytradeMetric(trade.outcomePrice, 5),
    exit_price_in_currency: roundCopytradeMetric(trade.outcomePrice, 5),
    fee: 0,
    fees: 0,
    hold_time: holdTimeSeconds,
    in_trade_price_range: 0,
    initial_target: roundCopytradeMetric(trade.targetPrice, 5),
    highest_price: roundCopytradeMetric(
      Math.max(trade.entryPrice, trade.targetPrice, trade.stopPrice, trade.outcomePrice),
      5
    ),
    lowest_price: roundCopytradeMetric(
      Math.min(trade.entryPrice, trade.targetPrice, trade.stopPrice, trade.outcomePrice),
      5
    ),
    maximum_profits: roundCopytradeMetric(Math.max(trade.pnlUsd, 0)),
    minimum_profits: roundCopytradeMetric(Math.min(trade.pnlUsd, 0)),
    price_mae: 0,
    price_mfe: 0,
    profit_target: roundCopytradeMetric(trade.targetPrice, 5),
    profits: roundCopytradeMetric(trade.pnlUsd),
    rating: 0,
    reward_ratio: roundCopytradeMetric(
      riskDistance > 0 ? rewardDistance / riskDistance : 0
    ),
    stop_loss: roundCopytradeMetric(trade.stopPrice, 5),
    strike: 0,
    trade_risk: roundCopytradeMetric(riskAmount),
    zella_score: zellaScore,
    reviewed: false,
    aggregated_source: "local",
    market_instrument_for_api: trade.symbol,
    spread_type: "regular",
    chart_layout_id: `local-chart-${trade.id}`,
    trading_hours: {
      timezone: COPYTRADE_LOCAL_TIMEZONE,
      regular: "0930-1600",
      extended: "0400-2000"
    },
    tags: [],
    playbooks: [],
    category_tags: {},
    tags_categories_list: {},
    transactions: [
      {
        id: `${trade.id}-entry`,
        execution_id: `${trade.id}-entry`,
        action: "entry",
        side: trade.side,
        symbol: trade.symbol,
        quantity,
        adjusted: adjustedCost,
        price: roundCopytradeMetric(trade.entryPrice, 5),
        commission: 0,
        fee: 0,
        profits: 0,
        current_position: quantity,
        strike: 0,
        realized: entryIso,
        created_at: entryIso
      },
      {
        id: `${trade.id}-exit`,
        execution_id: `${trade.id}-exit`,
        action: "exit",
        side: trade.side,
        symbol: trade.symbol,
        quantity,
        adjusted: adjustedProceeds,
        price: roundCopytradeMetric(trade.outcomePrice, 5),
        commission: 0,
        fee: 0,
        profits: roundCopytradeMetric(trade.pnlUsd),
        current_position: 0,
        strike: 0,
        realized: exitIso,
        created_at: exitIso
      }
    ],
    performance: [
      {
        trade_public_uid: trade.id,
        realized: entryIso,
        time_zone: COPYTRADE_LOCAL_TIMEZONE,
        symbol: trade.symbol,
        net_profits: 0,
        roi: 0
      },
      {
        trade_public_uid: trade.id,
        realized: exitIso,
        time_zone: COPYTRADE_LOCAL_TIMEZONE,
        symbol: trade.symbol,
        net_profits: roundCopytradeMetric(trade.pnlUsd),
        roi: roundCopytradeMetric(trade.pnlPct)
      }
    ],
    notebook_folder_id: null,
    has_note: false
  };
};

const buildCopytradeDashboardSeed = (
  trades: HistoryItem[],
  confidenceResolver: (trade: HistoryItem) => number
): CopytradeDashboardSeed => {
  const sortedTrades = [...trades].sort((left, right) => {
    const exitDiff = Number(left.exitTime) - Number(right.exitTime);
    if (exitDiff !== 0) {
      return exitDiff;
    }

    const entryDiff = Number(left.entryTime) - Number(right.entryTime);
    if (entryDiff !== 0) {
      return entryDiff;
    }

    return left.id.localeCompare(right.id);
  });
  const summary = summarizeBacktestTradesFallback(sortedTrades, confidenceResolver);
  const tradeCount = sortedTrades.length;
  const dailyPnlMap = new Map<string, number>();
  const dailyVolumeMap = new Map<string, number>();
  let totalVolume = 0;
  let winningTradesCount = 0;
  let losingTradesCount = 0;
  let breakEvenTradesCount = 0;

  for (const trade of sortedTrades) {
    const dayKey = getTradeDayKey(trade.exitTime);
    const tradeUnits = Math.abs(trade.units);
    const nextPnl = (dailyPnlMap.get(dayKey) ?? 0) + trade.pnlUsd;
    const nextVolume = (dailyVolumeMap.get(dayKey) ?? 0) + tradeUnits;

    dailyPnlMap.set(dayKey, nextPnl);
    dailyVolumeMap.set(dayKey, nextVolume);
    totalVolume += tradeUnits;

    if (trade.pnlUsd > 0) {
      winningTradesCount += 1;
    } else if (trade.pnlUsd < 0) {
      losingTradesCount += 1;
    } else {
      breakEvenTradesCount += 1;
    }
  }

  const dailyRows = Array.from(dailyPnlMap.entries())
    .map(([date, profits]) => ({
      date,
      profits: roundCopytradeMetric(profits),
      volume: roundCopytradeMetric(dailyVolumeMap.get(date) ?? 0)
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const winningDays = dailyRows.filter((row) => row.profits > 0).length;
  const losingDays = dailyRows.filter((row) => row.profits < 0).length;
  const breakevenDays = dailyRows.length - winningDays - losingDays;
  const tradeStreaks = computeCopytradeDirectionalStreaks(
    sortedTrades.map((trade) => trade.pnlUsd)
  );
  const dayStreaks = computeCopytradeDirectionalStreaks(dailyRows.map((row) => row.profits));
  const averageDailyVolume =
    dailyRows.length > 0 ? roundCopytradeMetric(totalVolume / dailyRows.length) : 0;

  let runningCumulative = 0;
  let runningPeak = 0;
  let currentDrawdown = 0;
  let averageDrawdownAccumulator = 0;
  const cumulative = dailyRows.map((row) => {
    runningCumulative += row.profits;
    runningPeak = Math.max(runningPeak, runningCumulative);
    currentDrawdown = Math.min(0, runningCumulative - runningPeak);
    averageDrawdownAccumulator += Math.abs(currentDrawdown);

    return {
      date: row.date,
      cumulative: roundCopytradeMetric(runningCumulative),
      drawdown: roundCopytradeMetric(currentDrawdown),
      profits: row.profits
    };
  });

  const maxDrawdownAmount = Math.abs(Math.min(summary.maxDrawdown, 0));
  const averageDrawdownAmount =
    cumulative.length > 0 ? averageDrawdownAccumulator / cumulative.length : 0;
  const currentDrawdownAmount = Math.abs(currentDrawdown);
  const drawdownReference = Math.max(
    runningPeak,
    Math.abs(summary.grossWins),
    Math.abs(summary.netPnl),
    Math.abs(summary.maxLoss),
    1
  );
  const maxDrawdownPercent = roundCopytradeMetric((maxDrawdownAmount / drawdownReference) * 100);
  const averageDrawdownPercent = roundCopytradeMetric(
    (averageDrawdownAmount / drawdownReference) * 100
  );
  const currentDrawdownPercent = roundCopytradeMetric(
    (currentDrawdownAmount / drawdownReference) * 100
  );
  const avgWinToLossValue =
    summary.avgLoss !== 0
      ? roundCopytradeMetric(Math.abs(summary.avgWin / summary.avgLoss))
      : summary.avgWin > 0
        ? roundCopytradeMetric(summary.avgWin)
        : 0;
  const recoveryFactorValue =
    maxDrawdownAmount > 0
      ? roundCopytradeMetric(summary.netPnl / maxDrawdownAmount)
      : summary.netPnl > 0
        ? roundCopytradeMetric(summary.netPnl)
        : 0;

  const zellaScore = {
    win_rate: roundCopytradeMetric(Math.max(0, Math.min(summary.winRate, 100))),
    win_rate_value: roundCopytradeMetric(summary.winRate),
    profit_factor: roundCopytradeMetric(Math.max(0, Math.min(summary.profitFactor * 50, 100))),
    profit_factor_value: roundCopytradeMetric(summary.profitFactor),
    avg_win_to_loss: roundCopytradeMetric(Math.max(0, Math.min(avgWinToLossValue * 50, 100))),
    avg_win_to_loss_value: avgWinToLossValue,
    recovery_factor: roundCopytradeMetric(
      Math.max(0, Math.min(Math.max(recoveryFactorValue, 0) * 25, 100))
    ),
    recovery_factor_value: recoveryFactorValue,
    max_drawdown: roundCopytradeMetric(Math.max(0, Math.min(100 - maxDrawdownPercent * 5, 100))),
    max_drawdown_value: maxDrawdownPercent,
    consistency: roundCopytradeMetric(Math.max(0, Math.min(summary.consistencyPerDay, 100))),
    consistency_value: roundCopytradeMetric(summary.consistencyPerDay),
    zella_score: 0
  };

  zellaScore.zella_score = roundCopytradeMetric(
    (
      zellaScore.win_rate +
      zellaScore.profit_factor +
      zellaScore.avg_win_to_loss +
      zellaScore.recovery_factor +
      zellaScore.max_drawdown +
      zellaScore.consistency
    ) / 6
  );

  const dashboardStats: CopytradeDashboardStatsPayload = {
    data: [],
    items: [],
    results: [],
    templates: [],
    selected_template: DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE,
    top_widgets: [...DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE.top_widgets],
    bottom_widgets: [...DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE.bottom_widgets],
    count: tradeCount,
    page: 1,
    per_page: tradeCount,
    total_pages: 1,
    total_count: tradeCount,
    winners: winningTradesCount,
    losers: losingTradesCount,
    break_evens: breakEvenTradesCount,
    total_gain_loss: roundCopytradeMetric(summary.netPnl),
    trade_count: tradeCount,
    trade_expectancy: roundCopytradeMetric(summary.avgPnl),
    profit_factor: roundCopytradeMetric(summary.profitFactor),
    winning_trades_sum: roundCopytradeMetric(summary.grossWins),
    losing_trades_sum: roundCopytradeMetric(Math.abs(summary.grossLosses)),
    average_daily_volume: averageDailyVolume,
    average_winning_trade: roundCopytradeMetric(summary.avgWin),
    average_losing_trade: roundCopytradeMetric(summary.avgLoss),
    total_commissions: 0,
    max_wins: roundCopytradeMetric(summary.maxWin),
    max_losses: roundCopytradeMetric(summary.maxLoss),
    winning_days: winningDays,
    losing_days: losingDays,
    breakeven_days: breakevenDays,
    winning_trades_count: winningTradesCount,
    losing_trades_count: losingTradesCount,
    breakeven_trades_count: breakEvenTradesCount,
    day_streaks: {
      current_winning: dayStreaks.currentWinning,
      current_losing: dayStreaks.currentLosing,
      winning: dayStreaks.maxWinning,
      losing: dayStreaks.maxLosing
    },
    trade_streaks: {
      current_winning_streak: tradeStreaks.currentWinning,
      current_losing_streak: tradeStreaks.currentLosing,
      max_wins: tradeStreaks.maxWinning,
      max_losses: tradeStreaks.maxLosing
    },
    max_drawdown: {
      drawdown: roundCopytradeMetric(-maxDrawdownAmount),
      percent: maxDrawdownPercent
    },
    average_drawdown: {
      drawdown: roundCopytradeMetric(-averageDrawdownAmount),
      percent: averageDrawdownPercent
    },
    current_drawdown: {
      drawdown: roundCopytradeMetric(-currentDrawdownAmount),
      percent: currentDrawdownPercent
    }
  };

  const allTradesDescending = [...sortedTrades]
    .sort((left, right) => {
      const exitDiff = Number(right.exitTime) - Number(left.exitTime);
      if (exitDiff !== 0) {
        return exitDiff;
      }

      const entryDiff = Number(right.entryTime) - Number(left.entryTime);
      if (entryDiff !== 0) {
        return entryDiff;
      }

      return right.id.localeCompare(left.id);
    })
    .map((trade) => buildCopytradeTradeDetail(trade, confidenceResolver));

  const tradeDetails = Object.fromEntries(
    allTradesDescending.map((trade) => [trade.id, trade])
  ) as CopytradeDashboardSeed["tradeDetails"];
  const tradesByDay = new Map<string, typeof allTradesDescending>();
  for (const trade of allTradesDescending) {
    const dayKey = trade.realized.slice(0, 10);
    const dayTrades = tradesByDay.get(dayKey) ?? [];
    dayTrades.push(trade);
    tradesByDay.set(dayKey, dayTrades);
  }

  const days = Array.from(tradesByDay.entries())
    .map(([dayKey, dayTrades]) => {
      const orderedDayTrades = [...dayTrades].sort((left, right) =>
        left.realized.localeCompare(right.realized)
      );
      let dayGrossWins = 0;
      let dayGrossLosses = 0;
      let dayVolume = 0;
      let dayWinners = 0;
      let dayLosers = 0;
      let dayBreakEvens = 0;

      for (const trade of orderedDayTrades) {
        dayVolume += Math.abs(trade.quantity);
        if (trade.net_profits > 0) {
          dayGrossWins += trade.net_profits;
          dayWinners += 1;
        } else if (trade.net_profits < 0) {
          dayGrossLosses += trade.net_profits;
          dayLosers += 1;
        } else {
          dayBreakEvens += 1;
        }
      }

      const dayLossMagnitude = Math.abs(dayGrossLosses);
      const dayProfitFactor =
        dayLossMagnitude > 0
          ? roundCopytradeMetric(dayGrossWins / dayLossMagnitude)
          : dayGrossWins > 0
            ? roundCopytradeMetric(dayGrossWins)
            : 0;

      return {
        id: dayKey,
        day: dayKey,
        realized: dayKey,
        show_day: true,
        closed: true,
        trades_loaded: true,
        time_zone: COPYTRADE_LOCAL_TIMEZONE,
        daily_note: null,
        stats: {
          trades_count: orderedDayTrades.length,
          winners: dayWinners,
          losers: dayLosers,
          break_evens: dayBreakEvens,
          volume: roundCopytradeMetric(dayVolume),
          profits: roundCopytradeMetric(dayGrossWins + dayGrossLosses),
          net_profits: roundCopytradeMetric(dayGrossWins + dayGrossLosses),
          fees: 0,
          roi_positive: roundCopytradeMetric(dayGrossWins),
          roi_negative: roundCopytradeMetric(dayLossMagnitude),
          profit_factor: dayProfitFactor
        },
        performance: orderedDayTrades.map((trade) => ({
          trade_public_uid: trade.trade_public_uid,
          realized: trade.realized,
          time_zone: COPYTRADE_LOCAL_TIMEZONE,
          symbol: trade.symbol,
          net_profits: trade.net_profits,
          roi: trade.net_roi
        })),
        trades: orderedDayTrades
      };
    })
    .sort((left, right) => right.realized.localeCompare(left.realized));

  const lastImportTime =
    allTradesDescending[0]?.realized ?? new Date().toISOString();

  return {
    updatedAt: new Date().toISOString(),
    dashboardStats,
    stats: {
      winners: winningTradesCount,
      losers: losingTradesCount,
      break_evens: breakEvenTradesCount,
      volume: roundCopytradeMetric(totalVolume),
      gross_pl: roundCopytradeMetric(summary.netPnl),
      net_pl: roundCopytradeMetric(summary.netPnl),
      profit_factor: roundCopytradeMetric(summary.profitFactor),
      total_commissions: 0,
      trade_count: tradeCount
    },
    zellaScore,
    performance: dailyRows.map((row) => ({
      date: row.date,
      profits: row.profits
    })),
    cumulative: {
      cumulative: cumulative.map((row) => ({
        [row.date]: row.cumulative
      })),
      drawdown: cumulative.map((row) => ({
        [row.date]: row.drawdown
      }))
    },
    accountBalanceDatum: {
      result: cumulative.map((row) => ({
        [row.date]: row.cumulative
      })),
      balances: cumulative.map((row) => ({
        [row.date]: row.profits
      })),
      labels: cumulative.map((row) => row.date)
    },
    recentTrades: {
      trades: allTradesDescending.slice(0, 10),
      item_count: allTradesDescending.length
    },
    openPositions: {
      trades: [],
      item_count: 0
    },
    allTrades: {
      trades: allTradesDescending,
      item_count: allTradesDescending.length,
      page_count: allTradesDescending.length > 0 ? 1 : 0,
      from: allTradesDescending.length > 0 ? 1 : 0,
      to: allTradesDescending.length
    },
    tradeStats: {
      gain: roundCopytradeMetric(summary.grossWins),
      loss: roundCopytradeMetric(Math.abs(summary.grossLosses)),
      total_net_profits: roundCopytradeMetric(summary.netPnl),
      total_volume: roundCopytradeMetric(totalVolume),
      profit_factor: roundCopytradeMetric(summary.profitFactor),
      average_winning_trade: roundCopytradeMetric(summary.avgWin),
      average_losing_trade: roundCopytradeMetric(summary.avgLoss),
      total_trades: tradeCount
    },
    days: {
      days,
      page_count: days.length > 0 ? 1 : 0
    },
    tradeDetails,
    accounts: [
      {
        id: COPYTRADE_LOCAL_ACCOUNT_ID,
        name: COPYTRADE_LOCAL_ACCOUNT_NAME,
        account_type: "manual",
        archived: false,
        active: true,
        backtesting: false,
        trades_editable: true,
        read_only: true,
        count: tradeCount,
        running_balance: roundCopytradeMetric(summary.netPnl),
        import_type: "manual",
        broker: null,
        external_account_id: null,
        external_account_failed: false,
        clear_in_progress: false,
        sync_disconnected: false,
        disabled: false,
        failed: false,
        can_resync: false,
        next_manual_resync_time: null,
        next_sync_time: null,
        last_sync_time: lastImportTime,
        has_trades: tradeCount > 0,
        has_performance_report: false,
        profit_calculation_method: "fifo",
        shared: false,
        primary: true,
        color: "#2563eb",
        trades_count: tradeCount,
        account_size: roundCopytradeMetric(summary.netPnl),
        last_import: tradeCount > 0 ? lastImportTime : null,
        last_imported_at: tradeCount > 0 ? lastImportTime : null,
        imports: [],
        broker_name: COPYTRADE_LOCAL_ACCOUNT_NAME,
        display_broker_name: COPYTRADE_LOCAL_ACCOUNT_NAME,
        created_at: lastImportTime,
        updated_at: lastImportTime,
        time_zone: COPYTRADE_LOCAL_TIMEZONE,
        display_currency: "USD",
        user_public_uid: "copytrade-local-user"
      }
    ],
    lastImport: tradeCount > 0
      ? {
          is_sync: false,
          updated_at: lastImportTime,
          last_sync_time: lastImportTime
        }
      : null
  };
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
  modelKind: ReplayModelKind;
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
  volume?: number | string;
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
  medianTradesPass: number;
  medianTradesFail: number;
  medianTimePass: number;
  medianTimeFail: number;
  medianWinRatePass: number;
  medianWinRateFail: number;
  medianWinRateOverall: number;
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
type KnnNeighborSpace = "high" | "post" | "3d" | "2d";

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
type AiLibraryRunStatus = "idle" | "loading" | "ready" | "error";
type AiLibraryHistorySeed = {
  candleSeriesBySymbol: Record<string, Candle[]>;
  oneMinuteCandlesBySymbol: Record<string, Candle[]>;
};

type AiLibraryDef = {
  id: string;
  name: string;
  description: string;
  defaults: Record<string, AiLibrarySettingValue>;
  fields: AiLibraryField[];
};

type StatsRefreshOverlayMode = "idle" | "hold" | "loading";
type BacktestDatePreset =
  | "custom"
  | "pastWeek"
  | "past2Weeks"
  | "pastMonth"
  | "past3Months"
  | "past6Months"
  | "pastYear"
  | "past2Years"
  | "past5Years"
  | "pastDecade";
type BacktestPresetRange = Exclude<BacktestDatePreset, "custom">;

type ModelRunRequest = {
  modelId: string;
  modelName: string;
  symbol: string;
  timeframe: Timeframe;
  preset: BacktestPresetRange;
  tpDollars: number;
  slDollars: number;
  units: number;
  startDate: string;
  endDate: string;
};

type ModelRunChartPoint = {
  label: string;
  cumulativePnl: number;
  tradeCount: number;
};

type ModelRunResult = {
  request: ModelRunRequest;
  trades: HistoryItem[];
  summary: BacktestSummaryStats;
  chartData: ModelRunChartPoint[];
  candleCount: number;
};

type BacktestSettingsSnapshot = {
  symbol: string;
  timeframe: Timeframe;
  minutePreciseEnabled: boolean;
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
  maxBarsInTrade: number;
  maxConcurrentTrades: number;
  aiModelStates: Record<string, AiModelState>;
  aiFeatureLevels: Record<string, AiFeatureLevel>;
  aiFeatureModes: Record<string, AiFeatureMode>;
  selectedAiLibraries: string[];
  selectedAiLibrarySettings: AiLibrarySettings;
  chunkBars: number;
  distanceMetric: AiDistanceMetric;
  knnNeighborSpace: KnnNeighborSpace;
  selectedAiDomains: string[];
  dimensionAmount: number;
  compressionMethod: AiCompressionMethod;
  kEntry: number;
  kExit: number;
  knnVoteMode: KnnVoteMode;
  hdbMinClusterSize: number;
  hdbMinSamples: number;
  hdbEpsQuantile: number;
  staticLibrariesClusters: boolean;
  antiCheatEnabled: boolean;
  validationMode: AiValidationMode;
};
type BacktestFilterSettings = Pick<
  BacktestSettingsSnapshot,
  | "statsDateStart"
  | "statsDateEnd"
  | "enabledBacktestWeekdays"
  | "enabledBacktestSessions"
  | "enabledBacktestMonths"
  | "enabledBacktestHours"
  | "aiMode"
  | "antiCheatEnabled"
  | "validationMode"
  | "selectedAiLibraries"
  | "selectedAiLibrarySettings"
  | "distanceMetric"
  | "knnNeighborSpace"
  | "kEntry"
>;

type AiSettingsModalProps = {
  title: string;
  subtitle?: string;
  size?: "default" | "wide" | "xwide";
  cardClassName?: string;
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

const splitDirectionalStrategyText = (values: readonly string[]) => {
  const buy: string[] = [];
  const sell: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    if (/^(long|buy)\s*:/i.test(normalized)) {
      buy.push(normalized.replace(/^(long|buy)\s*:\s*/i, ""));
      continue;
    }

    if (/^(short|sell)\s*:/i.test(normalized)) {
      sell.push(normalized.replace(/^(short|sell)\s*:\s*/i, ""));
      continue;
    }

    buy.push(normalized);
  }

  return { buy, sell };
};

const buildFallbackModelSurfaceSummary = (
  model: StrategyModelCatalogEntry
): StrategyBacktestSurfaceSummary => {
  const entry = splitDirectionalStrategyText(model.entry.trigger);
  const exit = splitDirectionalStrategyText([
    ...model.exit.stopLoss,
    ...model.exit.takeProfit,
    ...model.exit.timeExit,
    ...model.exit.earlyExit
  ]);

  return {
    buyEntryTrigger: entry.buy,
    sellEntryTrigger: entry.sell,
    buyExitTrigger: exit.buy,
    sellExitTrigger: exit.sell
  };
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
      jumpToResolution: false
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
      jumpToResolution: false
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
      jumpToResolution: false
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
      jumpToResolution: false
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
      jumpToResolution: false
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
const AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY = "targetWinRateMode";
type AiLibraryTargetWinRateMode = "natural" | "artificial";
const AI_LIBRARY_TARGET_WIN_RATE_FIELD: AiLibraryField = {
  key: AI_LIBRARY_TARGET_WIN_RATE_KEY,
  label: "Target Win Rate (%)",
  type: "number",
  min: 0,
  max: 100,
  step: 1,
  help: "Trim this library's loaded neighbors toward the requested win ratio."
};

const getAiLibraryTargetWinRateMode = (
  value: AiLibrarySettingValue | undefined
): AiLibraryTargetWinRateMode => {
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

const withAiLibraryTargetWinRateField = (definition: AiLibraryDef): AiLibraryDef => {
  const defaults = {
    ...definition.defaults,
    [AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]: getAiLibraryTargetWinRateMode(
      definition.defaults[AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]
    )
  };

  if (definition.fields.some((field) => field.key === AI_LIBRARY_TARGET_WIN_RATE_KEY)) {
    return {
      ...definition,
      defaults
    };
  }

  const fields = [...definition.fields];
  const maxSamplesIndex = fields.findIndex((field) => field.key === "maxSamples");
  const insertAt = maxSamplesIndex >= 0 ? maxSamplesIndex : fields.length;
  fields.splice(insertAt, 0, AI_LIBRARY_TARGET_WIN_RATE_FIELD);
  return {
    ...definition,
    defaults,
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

const normalizeResolvedAiLibrarySettings = (
  definition: AiLibraryDef,
  source?: Record<string, AiLibrarySettingValue>
): Record<string, AiLibrarySettingValue> => {
  const merged: Record<string, AiLibrarySettingValue> = {
    ...definition.defaults,
    ...(source ?? {})
  };

  for (const field of definition.fields) {
    const key = field.key;
    const fallback = definition.defaults[key];
    const current = merged[key];

    if (field.type === "boolean") {
      merged[key] = Boolean(current ?? fallback);
      continue;
    }

    if (field.type === "number") {
      const fallbackNumber = Number(fallback);
      let normalized = Number(current);
      if (!Number.isFinite(normalized)) {
        normalized = Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
      }

      if (key === "maxSamples" && normalized <= 0) {
        normalized =
          Number.isFinite(fallbackNumber) && fallbackNumber > 0
            ? fallbackNumber
            : 1;
      }

      if (typeof field.min === "number") {
        normalized = Math.max(field.min, normalized);
      }
      if (typeof field.max === "number") {
        normalized = Math.min(field.max, normalized);
      }

      merged[key] = normalized;
      continue;
    }

    if (field.type === "select" && Array.isArray(field.options) && field.options.length > 0) {
      const normalized = String(current ?? fallback ?? "").trim();
      merged[key] = field.options.some((option) => option.value === normalized)
        ? normalized
        : String(field.options[0]!.value);
      continue;
    }

    merged[key] = String(current ?? fallback ?? "");
  }

  return merged;
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

const AI_DOMAIN_OPTIONS = [
  "Direction",
  "Model",
  "Session",
  "Month",
  "Weekday",
  "Hour"
] as const;
const KNN_NEIGHBOR_SPACE_OPTIONS: Array<{
  value: KnnNeighborSpace;
  label: string;
}> = [
  { value: "high", label: "High Dimensional Space" },
  { value: "post", label: "Post-Compressed Space" },
  { value: "3d", label: "3 Dimensions" },
  { value: "2d", label: "2 Dimensions" }
];

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
  cardClassName,
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
      <div
        className={`ai-zip-modal-card ${size !== "default" ? `size-${size}` : ""} ${cardClassName ?? ""}`.trim()}
      >
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
  modelKind: "momentum",
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
    modelKind: resolveReplayModelKind(name),
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
            kind: "Model",
            modelKind: catalogProfile.modelKind,
            riskMin: catalogProfile.riskMin,
            riskMax: catalogProfile.riskMax,
            rrMin: catalogProfile.rrMin,
            rrMax: catalogProfile.rrMax,
            longBias: catalogProfile.longBias,
            winRate: catalogProfile.winRate
          }
        : createSyntheticModelProfile(name)
    );
  }

  return profiles;
};

const toStrategyReplayModels = (
  models: readonly ModelProfile[],
  aiModelStates: Record<string, AiModelState>
) => {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    riskMin: model.riskMin,
    riskMax: model.riskMax,
    rrMin: model.rrMin,
    rrMax: model.rrMax,
    longBias: model.longBias,
    state: aiModelStates[model.name] ?? aiModelStates[model.id] ?? 0
  }));
};

const futuresAssets: FutureAsset[] = [
  {
    symbol: "XAUUSD",
    name: "XAU / USD",
    basePrice: 2945.25,
    openInterest: "CLICKHOUSE + LIVE",
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
  { id: "actions", label: "Action" }
];

const surfaceTabs: Array<{ id: SurfaceTab; label: string }> = [
  { id: "chart", label: "Chart" },
  { id: "models", label: "Models" },
  { id: "settings", label: "Settings" },
  { id: "backtest", label: "Backtest" },
  { id: "ai", label: "Gideon" },
  { id: "copytrade", label: "Copy-Trade" }
];

const backtestTabs: Array<{ id: BacktestTab; label: string }> = [
  { id: "mainStats", label: "Main Statistics" },
  { id: "history", label: "Trading History" },
  { id: "calendar", label: "Calendar" },
  { id: "cluster", label: "Cluster Map" },
  { id: "performanceStats", label: "Performance Statistics" },
  { id: "entryExit", label: "Entry / Exit Stats" },
  { id: "dimensions", label: "Dimension Statistics" },
  { id: "propFirm", label: "Prop Firm Tool" }
];

const backtestInlineLoaderTabs = new Set<BacktestTab>([
  "mainStats",
  "history",
  "calendar",
  "cluster",
  "performanceStats",
  "entryExit",
  "dimensions",
  "propFirm"
]);

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

const CHART_INITIAL_HISTORY_CANDLES = 5000;

const chartHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": CHART_INITIAL_HISTORY_CANDLES,
  "5m": CHART_INITIAL_HISTORY_CANDLES,
  "15m": CHART_INITIAL_HISTORY_CANDLES,
  "1H": 3000,
  "4H": 1500,
  "1D": 700,
  "1W": 180
};

const BACKTEST_DATE_PRESET_OPTIONS: Array<{ id: BacktestDatePreset; label: string }> = [
  { id: "custom", label: "Custom" },
  { id: "pastWeek", label: "Past Week" },
  { id: "past2Weeks", label: "Past 2 Weeks" },
  { id: "pastMonth", label: "Past Month" },
  { id: "past3Months", label: "Past 3 Months" },
  { id: "past6Months", label: "Past 6 Months" },
  { id: "pastYear", label: "Past Year" },
  { id: "past2Years", label: "Past 2 Years" },
  { id: "past5Years", label: "Past 5 Years" },
  { id: "pastDecade", label: "Past Decade" }
];

const MODEL_RUN_DATE_PRESET_OPTIONS = BACKTEST_DATE_PRESET_OPTIONS.filter(
  (option): option is { id: BacktestPresetRange; label: string } => option.id !== "custom"
);

const BACKTEST_DATE_PRESET_SET = new Set<BacktestDatePreset>(
  BACKTEST_DATE_PRESET_OPTIONS.map((option) => option.id)
);

const isBacktestDatePreset = (value: unknown): value is BacktestDatePreset => {
  return typeof value === "string" && BACKTEST_DATE_PRESET_SET.has(value as BacktestDatePreset);
};

const toLocalDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfLocalDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const shiftLocalDateByMonths = (value: Date, monthsDelta: number) => {
  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();
  const target = new Date(year, month + monthsDelta, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(day, maxDay));
};

const shiftLocalDateByYears = (value: Date, yearsDelta: number) => {
  return shiftLocalDateByMonths(value, yearsDelta * 12);
};

const buildBacktestDateRangeFromPreset = (
  preset: BacktestPresetRange,
  now = new Date()
): { startDate: string; endDate: string } => {
  const endDate = startOfLocalDay(now);
  const startDate = new Date(endDate);

  switch (preset) {
    case "pastWeek":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "past2Weeks":
      startDate.setDate(startDate.getDate() - 14);
      break;
    case "pastMonth":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByMonths(endDate, -1)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past3Months":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByMonths(endDate, -3)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past6Months":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByMonths(endDate, -6)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "pastYear":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -1)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past2Years":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -2)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "past5Years":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -5)),
        endDate: toLocalDateInputValue(endDate)
      };
    case "pastDecade":
      return {
        startDate: toLocalDateInputValue(shiftLocalDateByYears(endDate, -10)),
        endDate: toLocalDateInputValue(endDate)
      };
    default:
      break;
  }

  return {
    startDate: toLocalDateInputValue(startDate),
    endDate: toLocalDateInputValue(endDate)
  };
};

const BACKTEST_DEFAULT_DATE_RANGE = buildBacktestDateRangeFromPreset("pastYear");

const RECENT_ONE_MINUTE_LOOKBACK_DAYS = 31;
const RECENT_ONE_MINUTE_WINDOW_MS = RECENT_ONE_MINUTE_LOOKBACK_DAYS * 24 * 60 * 60_000;
const RECENT_ONE_MINUTE_FETCH_COUNT = CHART_INITIAL_HISTORY_CANDLES;
const BACKTEST_LOOKBACK_YEARS = 10;
const BACKTEST_MAX_HISTORY_CANDLES = 400_000;
const BACKTEST_ONE_MINUTE_FETCH_COUNT = 500_000;
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

const getTimeframeSlotIndex = (timestampMs: number, timeframe: Timeframe): number => {
  const slotMinutes = Math.max(1, timeframeMinutes[timeframe]);
  const date = new Date(timestampMs);
  const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.floor(minuteOfDay / slotMinutes);
};

const createEmptyVolumeBaselineProfile = (): VolumeBaselineProfile => ({
  bySlot: new Map(),
  bySlotCount: new Map(),
  byHour: new Map(),
  byHourCount: new Map(),
  byWeekday: new Map(),
  byWeekdayCount: new Map(),
  byWeekdayHour: new Map(),
  byWeekdayHourCount: new Map(),
  globalAverage: 0,
  sampleCount: 0
});

const finalizeBucketAverages = <T extends string | number>(accumulator: Map<T, { sum: number; count: number }>) => {
  const averages = new Map<T, number>();
  const counts = new Map<T, number>();

  for (const [key, row] of accumulator.entries()) {
    averages.set(key, row.sum / Math.max(1, row.count));
    counts.set(key, row.count);
  }

  return { averages, counts };
};

const buildVolumeBaselineProfile = (
  candles: Candle[],
  timeframe: Timeframe
): VolumeBaselineProfile => {
  const bySlotAccumulator = new Map<number, { sum: number; count: number }>();
  const byHourAccumulator = new Map<number, { sum: number; count: number }>();
  const byWeekdayAccumulator = new Map<number, { sum: number; count: number }>();
  const byWeekdayHourAccumulator = new Map<string, { sum: number; count: number }>();
  let totalVolume = 0;
  let totalCount = 0;

  for (const candle of candles) {
    const volume = Number(candle.volume);
    if (!Number.isFinite(volume) || volume <= 0) {
      continue;
    }

    const date = new Date(candle.time);
    const hour = date.getUTCHours();
    const weekday = date.getUTCDay();
    const weekdayHourKey = `${weekday}-${hour}`;
    const slot = getTimeframeSlotIndex(candle.time, timeframe);

    const slotCurrent = bySlotAccumulator.get(slot) ?? { sum: 0, count: 0 };
    slotCurrent.sum += volume;
    slotCurrent.count += 1;
    bySlotAccumulator.set(slot, slotCurrent);

    const hourCurrent = byHourAccumulator.get(hour) ?? { sum: 0, count: 0 };
    hourCurrent.sum += volume;
    hourCurrent.count += 1;
    byHourAccumulator.set(hour, hourCurrent);

    const weekdayCurrent = byWeekdayAccumulator.get(weekday) ?? { sum: 0, count: 0 };
    weekdayCurrent.sum += volume;
    weekdayCurrent.count += 1;
    byWeekdayAccumulator.set(weekday, weekdayCurrent);

    const weekdayHourCurrent = byWeekdayHourAccumulator.get(weekdayHourKey) ?? { sum: 0, count: 0 };
    weekdayHourCurrent.sum += volume;
    weekdayHourCurrent.count += 1;
    byWeekdayHourAccumulator.set(weekdayHourKey, weekdayHourCurrent);

    totalVolume += volume;
    totalCount += 1;
  }

  const slotResult = finalizeBucketAverages(bySlotAccumulator);
  const hourResult = finalizeBucketAverages(byHourAccumulator);
  const weekdayResult = finalizeBucketAverages(byWeekdayAccumulator);
  const weekdayHourResult = finalizeBucketAverages(byWeekdayHourAccumulator);

  return {
    bySlot: slotResult.averages,
    bySlotCount: slotResult.counts,
    byHour: hourResult.averages,
    byHourCount: hourResult.counts,
    byWeekday: weekdayResult.averages,
    byWeekdayCount: weekdayResult.counts,
    byWeekdayHour: weekdayHourResult.averages,
    byWeekdayHourCount: weekdayHourResult.counts,
    globalAverage: totalCount > 0 ? totalVolume / totalCount : 0,
    sampleCount: totalCount
  };
};

const resolveVolumeBaselineForTimestamp = (
  timestampMs: number,
  timeframe: Timeframe,
  profile: VolumeBaselineProfile
): number => {
  const date = new Date(timestampMs);
  const slot = getTimeframeSlotIndex(timestampMs, timeframe);
  const hour = date.getUTCHours();
  const weekday = date.getUTCDay();
  const weekdayHourKey = `${weekday}-${hour}`;
  const baselineCandidates: Array<{ value: number; count: number; priority: number }> = [];

  const slotValue = profile.bySlot.get(slot);
  if (slotValue != null) {
    baselineCandidates.push({
      value: slotValue,
      count: profile.bySlotCount.get(slot) ?? 0,
      priority: 1
    });
  }

  const weekdayHourValue = profile.byWeekdayHour.get(weekdayHourKey);
  if (weekdayHourValue != null) {
    baselineCandidates.push({
      value: weekdayHourValue,
      count: profile.byWeekdayHourCount.get(weekdayHourKey) ?? 0,
      priority: 0.9
    });
  }

  const hourValue = profile.byHour.get(hour);
  if (hourValue != null) {
    baselineCandidates.push({
      value: hourValue,
      count: profile.byHourCount.get(hour) ?? 0,
      priority: 0.75
    });
  }

  const weekdayValue = profile.byWeekday.get(weekday);
  if (weekdayValue != null) {
    baselineCandidates.push({
      value: weekdayValue,
      count: profile.byWeekdayCount.get(weekday) ?? 0,
      priority: 0.5
    });
  }

  if (profile.globalAverage > 0) {
    baselineCandidates.push({
      value: profile.globalAverage,
      count: profile.sampleCount,
      priority: 0.25
    });
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const candidate of baselineCandidates) {
    if (!Number.isFinite(candidate.value) || candidate.value <= 0) {
      continue;
    }

    if (candidate.count <= 0) {
      continue;
    }

    const reliability = Math.min(1, candidate.count / 24);
    const weight = candidate.priority * (0.35 + reliability * 0.65);
    weightedSum += candidate.value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : Number.NaN;
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
      const volumeRaw = Number(candle.volume);
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

      const normalizedCandle: Candle = {
        time,
        open,
        high,
        low,
        close
      };

      if (Number.isFinite(volumeRaw) && volumeRaw >= 0) {
        normalizedCandle.volume = volumeRaw;
      }

      return normalizedCandle;
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

const MAX_CONTIGUOUS_MERGE_GAP_BARS = 8;

const hasExcessiveTradingGap = (
  previousTimeMs: number,
  nextTimeMs: number,
  timeframe: Timeframe,
  maxMissingBars = MAX_CONTIGUOUS_MERGE_GAP_BARS
): boolean => {
  if (!Number.isFinite(previousTimeMs) || !Number.isFinite(nextTimeMs) || nextTimeMs <= previousTimeMs) {
    return false;
  }

  const stepMs = Math.max(60_000, getTimeframeMs(timeframe));
  let probeTime = previousTimeMs + stepMs;
  let missingBars = 0;

  while (probeTime < nextTimeMs) {
    if (isXauTradingTime(probeTime)) {
      missingBars += 1;
      if (missingBars > maxMissingBars) {
        return true;
      }
    }
    probeTime += stepMs;
  }

  return false;
};

const mergeRecentCandles = (
  historical: Candle[],
  liveWindow: Candle[],
  maxBars: number,
  timeframe: Timeframe
): Candle[] => {
  if (liveWindow.length === 0) {
    return historical.slice(-maxBars);
  }

  const firstLiveTime = liveWindow[0].time;
  const lastLiveTime = liveWindow[liveWindow.length - 1].time;
  const olderHistorical = historical.filter((row) => row.time < firstLiveTime);
  const lastHistoricalBeforeLive = olderHistorical[olderHistorical.length - 1];
  const keepOlderHistorical =
    !lastHistoricalBeforeLive ||
    !hasExcessiveTradingGap(
      lastHistoricalBeforeLive.time,
      firstLiveTime,
      timeframe
    );
  const merged = [
    ...(keepOlderHistorical ? olderHistorical : []),
    ...liveWindow,
    // Keep any candles newer than the sync window so stale API windows
    // never move the chart backward during periodic refresh.
    ...historical.filter((row) => row.time > lastLiveTime)
  ];
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

      const initialVolume = Number(candle.volume);
      activeBucket = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume:
          Number.isFinite(initialVolume) && initialVolume >= 0
            ? initialVolume
            : undefined
      };
      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, candle.high);
    activeBucket.low = Math.min(activeBucket.low, candle.low);
    activeBucket.close = candle.close;
    const candleVolume = Number(candle.volume);
    const nextVolume = (activeBucket.volume ?? 0) + (Number.isFinite(candleVolume) ? candleVolume : 0);
    activeBucket.volume = nextVolume > 0 ? nextVolume : undefined;
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
  maxBars: number,
  timeframe: Timeframe
): Candle[] => {
  if (historical.length === 0) {
    return recent.slice(-maxBars);
  }

  if (recent.length === 0) {
    return historical.slice(-maxBars);
  }

  return mergeRecentCandles(historical, recent, maxBars, timeframe);
};

type HistoryApiRequestWindow = {
  startIso?: string;
  endIso?: string;
};

type HistoryCoverageWindow = {
  startYmd: string;
  endYmd: string;
  leadingBars?: number;
  strictCoverage?: boolean;
};

const fetchMarketCandles = async (
  timeframe: Timeframe,
  limit: number,
  timeoutMs = CLIENT_CANDLE_FETCH_TIMEOUT_MS
): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    limit: String(Math.min(limit, MARKET_MAX_HISTORY_CANDLES))
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/api/market/candles?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();

    return normalizeMarketCandles(payload.candles || []);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchHistoryApiCandles = async (
  timeframe: Timeframe,
  count: number,
  timeoutMs = CLIENT_CANDLE_FETCH_TIMEOUT_MS,
  options?: {
    startIso?: string;
    endIso?: string;
  }
): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    count: String(count)
  });
  if (options?.startIso) {
    params.set("start", options.startIso);
  }
  if (options?.endIso) {
    params.set("end", options.endIso);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/api/history/candles?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();

    return normalizeMarketCandles(payload.candles || []);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

const withTimeout = <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
};

const pickLongestCandleSeries = (...series: Array<Candle[] | undefined | null>): Candle[] => {
  let best = EMPTY_CANDLES;

  for (const candles of series) {
    if (Array.isArray(candles) && candles.length > best.length) {
      best = candles;
    }
  }

  return best;
};

const fetchRecentOneMinuteCandles = async (
  recentOneMinutePromise?: Promise<Candle[]>,
  timeoutMs = CLIENT_CANDLE_FETCH_TIMEOUT_MS
): Promise<Candle[]> => {
  if (recentOneMinutePromise) {
    try {
      return await recentOneMinutePromise;
    } catch {
      return [];
    }
  }

  try {
    const recentHistoryCandles = await fetchHistoryApiCandles(
      "1m",
      RECENT_ONE_MINUTE_FETCH_COUNT,
      timeoutMs
    );
    const trimmedHistoryCandles = trimRecentOneMinuteCandles(recentHistoryCandles);

    if (trimmedHistoryCandles.length >= MIN_SEED_CANDLES) {
      return trimmedHistoryCandles;
    }

    const recentMarketCandles = await fetchMarketCandles(
      "1m",
      RECENT_ONE_MINUTE_FETCH_COUNT,
      timeoutMs
    );
    const trimmedMarketCandles = trimRecentOneMinuteCandles(recentMarketCandles);

    return trimmedMarketCandles.length > 0 ? trimmedMarketCandles : trimmedHistoryCandles;
  } catch {
    try {
      const recentMarketCandles = await fetchMarketCandles(
        "1m",
        RECENT_ONE_MINUTE_FETCH_COUNT,
        timeoutMs
      );
      return trimRecentOneMinuteCandles(recentMarketCandles);
    } catch {
      return [];
    }
  }
};

const candlesSatisfyHistoryCoverage = (
  candles: Candle[],
  timeframe: Timeframe,
  coverageWindow?: HistoryCoverageWindow
): boolean => {
  if (!coverageWindow) {
    return candles.length >= MIN_SEED_CANDLES;
  }

  return candlesCoverDateRange(
    candles,
    timeframe,
    coverageWindow.startYmd,
    coverageWindow.endYmd,
    coverageWindow.leadingBars ?? 0
  );
};

const applyHistoryCoverageWindow = (
  candles: Candle[],
  timeframe: Timeframe,
  coverageWindow?: HistoryCoverageWindow
): Candle[] => {
  if (!coverageWindow) {
    return candles;
  }

  if (
    !candlesCoverDateRange(
      candles,
      timeframe,
      coverageWindow.startYmd,
      coverageWindow.endYmd,
      coverageWindow.leadingBars ?? 0
    )
  ) {
    return candles;
  }

  return filterCandlesToDateRange(
    candles,
    timeframe,
    coverageWindow.startYmd,
    coverageWindow.endYmd,
    coverageWindow.leadingBars ?? 0
  );
};

const fetchHybridHistoryCandles = async (
  timeframe: Timeframe,
  targetBars: number,
  recentOneMinutePromise?: Promise<Candle[]>,
  allowOneMinuteFallback = true,
  timeoutMs = CLIENT_CANDLE_FETCH_TIMEOUT_MS,
  options?: {
    requestWindow?: HistoryApiRequestWindow;
    coverageWindow?: HistoryCoverageWindow;
  }
): Promise<Candle[]> => {
  const coverageWindow = options?.coverageWindow;
  const isRangeScoped =
    Boolean(options?.requestWindow?.startIso) ||
    Boolean(options?.requestWindow?.endIso) ||
    Boolean(coverageWindow);
  try {
    const historyCount = Math.min(targetBars, CLICKHOUSE_MAX_HISTORY_CANDLES);
    let historyCandles = await fetchHistoryApiCandles(
      timeframe,
      historyCount,
      timeoutMs,
      options?.requestWindow
    );

    if (coverageWindow && !candlesSatisfyHistoryCoverage(historyCandles, timeframe, coverageWindow)) {
      const deepHistoryCandles = await fetchHistoryApiCandles(
        timeframe,
        historyCount,
        timeoutMs
      ).catch(() => []);

      if (
        candlesSatisfyHistoryCoverage(deepHistoryCandles, timeframe, coverageWindow) ||
        deepHistoryCandles.length > historyCandles.length
      ) {
        historyCandles = deepHistoryCandles;
      }
    }

    const coveredHistoryCandles = applyHistoryCoverageWindow(
      historyCandles,
      timeframe,
      coverageWindow
    );
    const recentTimeframePromise =
      timeframe === "1m" || Boolean(coverageWindow?.strictCoverage)
        ? Promise.resolve([] as Candle[])
        : fetchMarketCandles(
            timeframe,
            Math.min(targetBars, MARKET_MAX_HISTORY_CANDLES),
            timeoutMs
          ).catch(() => []);

    if (timeframe === "1m") {
      if (
        !coverageWindow ||
        candlesSatisfyHistoryCoverage(historyCandles, timeframe, coverageWindow)
      ) {
        return coveredHistoryCandles.slice(-targetBars);
      }

      if (coveredHistoryCandles.length >= MIN_SEED_CANDLES && !coverageWindow.strictCoverage) {
        return coveredHistoryCandles.slice(-targetBars);
      }

      if (!allowOneMinuteFallback) {
        return coveredHistoryCandles.slice(-targetBars);
      }

      const recentOneMinuteCandles = await fetchRecentOneMinuteCandles(
        recentOneMinutePromise,
        timeoutMs
      );
      return recentOneMinuteCandles.slice(-targetBars);
    }

    const recentTimeframeCandles = await recentTimeframePromise;

    if (
      coverageWindow &&
      candlesSatisfyHistoryCoverage(historyCandles, timeframe, coverageWindow)
    ) {
      return coveredHistoryCandles.slice(-targetBars);
    }

    if (coverageWindow?.strictCoverage) {
      return [];
    }

    if (isRangeScoped && coveredHistoryCandles.length >= MIN_SEED_CANDLES) {
      return coveredHistoryCandles.slice(-targetBars);
    }

    if (coveredHistoryCandles.length >= MIN_SEED_CANDLES) {
      return mergeHistoricalAndRecentCandles(
        coveredHistoryCandles,
        recentTimeframeCandles,
        targetBars,
        timeframe
      );
    }

    if (recentTimeframeCandles.length >= MIN_SEED_CANDLES) {
      return recentTimeframeCandles.slice(-targetBars);
    }

    if (!allowOneMinuteFallback) {
      return coveredHistoryCandles.length > 0
        ? coveredHistoryCandles.slice(-targetBars)
        : recentTimeframeCandles.slice(-targetBars);
    }
  } catch {
    if (!allowOneMinuteFallback) {
      return [];
    }

    // Leave chart and backtest to use the recent 1m window when deeper history is unavailable.
  }

  if (!allowOneMinuteFallback) {
    return [];
  }

  const recentOneMinuteCandles = await fetchRecentOneMinuteCandles(
    recentOneMinutePromise,
    timeoutMs
  );
  const recentTimeframeCandles = aggregateCandlesToTimeframe(recentOneMinuteCandles, timeframe);
  return recentTimeframeCandles.slice(-targetBars);
};

const fetchHistoryCandles = async (
  timeframe: Timeframe,
  recentOneMinutePromise?: Promise<Candle[]>,
  allowOneMinuteFallback = true,
  timeoutMs = CLIENT_CANDLE_FETCH_TIMEOUT_MS
): Promise<Candle[]> => {
  const targetBars = chartHistoryCountByTimeframe[timeframe];
  return fetchHybridHistoryCandles(
    timeframe,
    targetBars,
    recentOneMinutePromise,
    allowOneMinuteFallback,
    timeoutMs
  );
};

const fetchBacktestHistoryCandles = async (
  timeframe: Timeframe,
  targetBars: number,
  recentOneMinutePromise?: Promise<Candle[]>,
  allowOneMinuteFallback = true,
  timeoutMs = BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS,
  options?: {
    requestWindow?: HistoryApiRequestWindow;
    coverageWindow?: HistoryCoverageWindow;
  }
): Promise<Candle[]> => {
  const safeTargetBars = clamp(
    Math.floor(Number.isFinite(targetBars) ? targetBars : BACKTEST_MAX_HISTORY_CANDLES),
    MIN_SEED_CANDLES,
    BACKTEST_MAX_HISTORY_CANDLES
  );

  return fetchHybridHistoryCandles(
    timeframe,
    safeTargetBars,
    recentOneMinutePromise,
    allowOneMinuteFallback,
    timeoutMs,
    options
  );
};

const XAUUSD_PAIR = "XAU_USD";
const MIN_SEED_CANDLES = 40;
const CLIENT_CANDLE_FETCH_TIMEOUT_MS = 3500;
const BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS = AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS;
const AI_LIBRARY_RUN_TIMEOUT_MS = Math.max(15_000, BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS * 2);
const CLICKHOUSE_MAX_HISTORY_CANDLES = 300_000;
const MARKET_MAX_HISTORY_CANDLES = 25_000;
const LIVE_MARKET_SYNC_LIMIT = 160;
const CHART_STREAM_CONNECT_TIMEOUT_MS = 3500;
const AGGRESSOR_PRESSURE_UI_THROTTLE_MS = 220;
const AGGRESSOR_HALF_LIFE_BARS = 1.2;
const AGGRESSOR_TRAINING_BARS = 96;
const AGGRESSOR_MIN_TRAINING_PERIOD_MS = 3 * 60 * 60_000;
const VOLUME_NOWCAST_CALIBRATION_FULL_SAMPLES = 10;
const VOLUME_NOWCAST_CALIBRATION_PENDING_LIMIT = 32;
const VP_THRESHOLD_RATIO = 0.8;
const PRICE_STREAM_URL = "/api/market/stream";

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

const formatAggressorPressure = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value < 10) {
    return value.toFixed(2);
  }

  if (value < 100) {
    return value.toFixed(1);
  }

  return value
    .toLocaleString("en-US", {
      notation: "compact",
      maximumFractionDigits: 2
    })
    .replace("K", "k")
    .replace("M", "m")
    .replace("B", "b");
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

const getUtcDayStartMsFromYmd = (ymd: string): number | null => {
  if (!ymd) {
    return null;
  }

  const value = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(value) ? value : null;
};

const getUtcDayEndExclusiveMsFromYmd = (ymd: string): number | null => {
  const startMs = getUtcDayStartMsFromYmd(ymd);
  if (startMs === null) {
    return null;
  }

  return startMs + 86_400_000;
};

const buildHistoryApiRequestWindow = (params: {
  timeframe: Timeframe;
  startYmd: string;
  endYmd: string;
  leadingBars?: number;
}) => {
  const { timeframe, startYmd, endYmd, leadingBars = 0 } = params;
  const startMs = getUtcDayStartMsFromYmd(startYmd);
  const endExclusiveMs = getUtcDayEndExclusiveMsFromYmd(endYmd);

  if (startMs === null || endExclusiveMs === null || endExclusiveMs <= startMs) {
    return null;
  }

  const paddedStartMs =
    startMs - Math.max(0, Math.floor(leadingBars)) * getTimeframeMs(timeframe);
  const safeEndMs = Math.max(paddedStartMs, endExclusiveMs - 1);

  return {
    startIso: new Date(paddedStartMs).toISOString(),
    endIso: new Date(safeEndMs).toISOString()
  };
};

const estimateHistoryBarsForDateRange = (
  startYmd: string,
  endYmd: string,
  timeframe: Timeframe,
  paddingBars = 0
): number => {
  const fallbackBars = chartHistoryCountByTimeframe[timeframe];
  const startMs = getUtcDayStartMsFromYmd(startYmd);
  const endExclusiveMs = getUtcDayEndExclusiveMsFromYmd(endYmd);

  if (startMs === null || endExclusiveMs === null || endExclusiveMs <= startMs) {
    return fallbackBars;
  }

  const baseBars = Math.ceil((endExclusiveMs - startMs) / Math.max(60_000, getTimeframeMs(timeframe)));
  return clamp(baseBars + Math.max(12, Math.floor(paddingBars)), MIN_SEED_CANDLES, BACKTEST_MAX_HISTORY_CANDLES);
};

const candlesCoverDateRange = (
  candles: Candle[],
  timeframe: Timeframe,
  startYmd: string,
  endYmd: string,
  leadingBars = 0
): boolean => {
  if (candles.length < 3) {
    return false;
  }

  const startMs = getUtcDayStartMsFromYmd(startYmd);
  const endExclusiveMs = getUtcDayEndExclusiveMsFromYmd(endYmd);

  if (startMs === null || endExclusiveMs === null) {
    return false;
  }

  const paddingMs = Math.max(0, Math.floor(leadingBars)) * getTimeframeMs(timeframe);
  const firstTime = candles[0]?.time ?? Number.POSITIVE_INFINITY;
  const lastTime = candles[candles.length - 1]?.time ?? Number.NEGATIVE_INFINITY;

  return firstTime <= startMs - paddingMs && lastTime >= endExclusiveMs - getTimeframeMs(timeframe);
};

const filterCandlesToDateRange = (
  candles: Candle[],
  timeframe: Timeframe,
  startYmd: string,
  endYmd: string,
  leadingBars = 0
): Candle[] => {
  const startMs = getUtcDayStartMsFromYmd(startYmd);
  const endExclusiveMs = getUtcDayEndExclusiveMsFromYmd(endYmd);

  if (startMs === null || endExclusiveMs === null) {
    return candles;
  }

  const paddedStartMs =
    startMs - Math.max(0, Math.floor(leadingBars)) * getTimeframeMs(timeframe);
  const filtered = candles.filter(
    (candle) => candle.time >= paddedStartMs && candle.time < endExclusiveMs
  );

  return filtered.length >= MIN_SEED_CANDLES ? filtered : candles;
};

const filterTradesByDateRange = (
  trades: HistoryItem[],
  startYmd: string,
  endYmd: string
): HistoryItem[] => {
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
  trades: HistoryItem[],
  settings: Pick<
    BacktestFilterSettings,
    | "enabledBacktestWeekdays"
    | "enabledBacktestSessions"
    | "enabledBacktestMonths"
    | "enabledBacktestHours"
  >
): HistoryItem[] => {
  return trades.filter((trade) => {
    const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
    const session = getSessionLabel(trade.entryTime);
    const monthIndex = getTradeMonthIndex(trade.exitTime);
    const entryHour = getTradeHour(trade.entryTime);

    return (
      settings.enabledBacktestWeekdays.includes(weekday) &&
      settings.enabledBacktestSessions.includes(session) &&
      settings.enabledBacktestMonths.includes(monthIndex) &&
      settings.enabledBacktestHours.includes(entryHour)
    );
  });
};

const filterHistoryRowsLocally = (params: {
  sourceTrades: HistoryItem[];
  settings: BacktestFilterSettings;
  confidenceGateDisabled: boolean;
  effectiveConfidenceThreshold: number;
  confidenceResolver: (trade: HistoryItem) => number;
}) => {
  const {
    sourceTrades,
    settings,
    confidenceGateDisabled,
    effectiveConfidenceThreshold,
    confidenceResolver
  } = params;
  const dateFilteredTrades = filterTradesByDateRange(
    sourceTrades,
    settings.statsDateStart,
    settings.statsDateEnd
  );
  const timeFilteredTrades = filterTradesBySessionBuckets(dateFilteredTrades, {
    enabledBacktestWeekdays: settings.enabledBacktestWeekdays,
    enabledBacktestSessions: settings.enabledBacktestSessions,
    enabledBacktestMonths: settings.enabledBacktestMonths,
    enabledBacktestHours: settings.enabledBacktestHours
  });
  const filteredTrades = confidenceGateDisabled
    ? timeFilteredTrades
    : timeFilteredTrades.filter(
        (trade) => confidenceResolver(trade) * 100 >= effectiveConfidenceThreshold
      );

  return [...filteredTrades].sort(
    (left, right) => Number(right.exitTime) - Number(left.exitTime) || right.id.localeCompare(left.id)
  );
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

const DYNAMIC_SR_DEFAULT_LEVELS = 3;
const DYNAMIC_SR_MAX_LEVELS = 8;
const DYNAMIC_SR_MAX_LOOKBACK = 6000;

const ASSISTANT_DRAWABLE_ACTION_TYPES = new Set<AssistantChartAction["type"]>([
  "draw_horizontal_line",
  "draw_vertical_line",
  "draw_trend_line",
  "draw_box",
  "draw_fvg",
  "draw_fibonacci",
  "draw_support_resistance",
  "draw_arrow",
  "draw_long_position",
  "draw_short_position",
  "draw_ruler",
  "mark_candlestick"
]);

const ASSISTANT_SHIFTABLE_PRICE_FIELDS: Array<
  "price" | "priceStart" | "priceEnd" | "entryPrice" | "stopPrice" | "targetPrice"
> = ["price", "priceStart", "priceEnd", "entryPrice", "stopPrice", "targetPrice"];

const ASSISTANT_SHIFTABLE_TIME_FIELDS: Array<"time" | "timeStart" | "timeEnd"> = [
  "time",
  "timeStart",
  "timeEnd"
];

const isAssistantDrawableAction = (action: AssistantChartAction): boolean => {
  return ASSISTANT_DRAWABLE_ACTION_TYPES.has(action.type);
};

const candleQuantile = (values: number[], quantile: number): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(1, quantile)) * (sorted.length - 1);
  const lowIndex = Math.floor(index);
  const highIndex = Math.ceil(index);
  const low = sorted[lowIndex] ?? sorted[0] ?? 0;
  const high = sorted[highIndex] ?? low;
  const weight = index - lowIndex;
  return low * (1 - weight) + high * weight;
};

const computeDynamicSupportResistanceLevels = (params: {
  candles: Candle[];
  levels?: number;
  lookback?: number;
}): { supports: number[]; resistances: number[] } | null => {
  const { candles } = params;
  if (!Array.isArray(candles) || candles.length < 12) {
    return null;
  }

  const levels = clamp(
    Math.round(params.levels ?? DYNAMIC_SR_DEFAULT_LEVELS),
    1,
    DYNAMIC_SR_MAX_LEVELS
  );
  const lookback = Math.max(0, Math.min(DYNAMIC_SR_MAX_LOOKBACK, Math.round(params.lookback ?? 0)));
  const source =
    lookback > 0 && candles.length > lookback ? candles.slice(-lookback) : candles;

  if (source.length < 12) {
    return null;
  }

  const lows = source
    .map((row) => row.low)
    .filter((value): value is number => Number.isFinite(value));
  const highs = source
    .map((row) => row.high)
    .filter((value): value is number => Number.isFinite(value));

  if (lows.length < 12 || highs.length < 12) {
    return null;
  }

  const lastClose = source[source.length - 1]?.close;
  const minLow = Math.min(...lows);
  const maxHigh = Math.max(...highs);
  const span = Math.max(0.0001, maxHigh - minLow);
  const dedupeThreshold = Math.max(0.01, span * 0.01);

  const dedupe = (values: number[]): number[] => {
    const deduped: number[] = [];
    for (const value of values) {
      if (
        !deduped.some((existing) => Math.abs(existing - value) <= dedupeThreshold)
      ) {
        deduped.push(value);
      }
    }
    return deduped;
  };

  const supportsRaw: number[] = [];
  const resistancesRaw: number[] = [];

  for (let index = 0; index < levels; index += 1) {
    const ratio = levels === 1 ? 0.5 : index / (levels - 1);
    const supportQuantile = 0.08 + ratio * 0.30;
    const resistanceQuantile = 0.62 + ratio * 0.30;
    const support = candleQuantile(lows, supportQuantile);
    const resistance = candleQuantile(highs, resistanceQuantile);
    if (support !== null) {
      supportsRaw.push(Number(support.toFixed(4)));
    }
    if (resistance !== null) {
      resistancesRaw.push(Number(resistance.toFixed(4)));
    }
  }

  let supports = dedupe(supportsRaw).sort((left, right) => right - left);
  let resistances = dedupe(resistancesRaw).sort((left, right) => left - right);

  if (Number.isFinite(lastClose)) {
    const anchor = Number(lastClose);
    supports = supports
      .sort((left, right) => Math.abs(anchor - left) - Math.abs(anchor - right))
      .slice(0, levels)
      .sort((left, right) => right - left);
    resistances = resistances
      .sort((left, right) => Math.abs(anchor - left) - Math.abs(anchor - right))
      .slice(0, levels)
      .sort((left, right) => left - right);
  }

  return {
    supports: supports.slice(0, levels),
    resistances: resistances.slice(0, levels)
  };
};

const adjustAssistantDrawAction = (params: {
  action: AssistantChartAction;
  priceDelta: number;
  timeDeltaMs: number;
}): AssistantChartAction => {
  const { action, priceDelta, timeDeltaMs } = params;
  const next: AssistantChartAction = { ...action };

  if (Number.isFinite(priceDelta) && Math.abs(priceDelta) > 0) {
    for (const field of ASSISTANT_SHIFTABLE_PRICE_FIELDS) {
      const value = next[field];
      if (!Number.isFinite(value)) {
        continue;
      }
      next[field] = Number((Number(value) + priceDelta).toFixed(4));
    }
  }

  if (Number.isFinite(timeDeltaMs) && Math.abs(timeDeltaMs) > 0) {
    for (const field of ASSISTANT_SHIFTABLE_TIME_FIELDS) {
      const value = next[field];
      if (!Number.isFinite(value)) {
        continue;
      }
      next[field] = Number(value) + timeDeltaMs;
    }
  }

  if (
    next.type === "draw_support_resistance" &&
    Number.isFinite(next.priceStart) &&
    Number.isFinite(next.priceEnd) &&
    Number(next.priceStart) > Number(next.priceEnd)
  ) {
    const currentSupport = Number(next.priceStart);
    next.priceStart = Number(next.priceEnd);
    next.priceEnd = currentSupport;
  }

  return next;
};

const stripDynamicMeta = (action: AssistantChartAction): AssistantChartAction => {
  const next: AssistantChartAction = { ...action };
  delete next.dynamic;
  delete next.dynamicLookback;
  return next;
};

const getDynamicActionWindow = (candles: Candle[], lookback?: number): Candle[] => {
  if (!Array.isArray(candles) || candles.length === 0) {
    return EMPTY_CANDLES;
  }

  const requested = Number(lookback);
  if (!Number.isFinite(requested) || requested <= 0) {
    return candles;
  }

  const safeLookback = clamp(Math.round(requested), 12, candles.length);
  return candles.slice(-safeLookback);
};

const findLatestDynamicFvg = (
  candles: Candle[]
): { timeStart: number; timeEnd: number; priceStart: number; priceEnd: number } | null => {
  if (candles.length < 3) {
    return null;
  }

  for (let index = candles.length - 1; index >= 2; index -= 1) {
    const left = candles[index - 2];
    const right = candles[index];
    if (!left || !right) {
      continue;
    }

    // Bullish imbalance: gap between two non-overlapping candles.
    if (left.high < right.low) {
      return {
        timeStart: left.time,
        timeEnd: right.time,
        priceStart: Number(left.high.toFixed(4)),
        priceEnd: Number(right.low.toFixed(4))
      };
    }

    // Bearish imbalance.
    if (left.low > right.high) {
      return {
        timeStart: left.time,
        timeEnd: right.time,
        priceStart: Number(right.high.toFixed(4)),
        priceEnd: Number(left.low.toFixed(4))
      };
    }
  }

  return null;
};

const findDynamicFibAnchors = (
  candles: Candle[]
): { timeStart: number; timeEnd: number; priceStart: number; priceEnd: number } | null => {
  if (candles.length < 2) {
    return null;
  }

  let lowIndex = 0;
  let highIndex = 0;
  for (let index = 1; index < candles.length; index += 1) {
    if ((candles[index]?.low ?? Number.POSITIVE_INFINITY) < (candles[lowIndex]?.low ?? Number.POSITIVE_INFINITY)) {
      lowIndex = index;
    }
    if ((candles[index]?.high ?? Number.NEGATIVE_INFINITY) > (candles[highIndex]?.high ?? Number.NEGATIVE_INFINITY)) {
      highIndex = index;
    }
  }

  const firstIndex = Math.min(lowIndex, highIndex);
  const lastIndex = Math.max(lowIndex, highIndex);
  const first = candles[firstIndex];
  const last = candles[lastIndex];
  if (!first || !last) {
    return null;
  }

  const useLowToHigh = lowIndex <= highIndex;
  return useLowToHigh
    ? {
        timeStart: first.time,
        timeEnd: last.time,
        priceStart: Number(first.low.toFixed(4)),
        priceEnd: Number(last.high.toFixed(4))
      }
    : {
        timeStart: first.time,
        timeEnd: last.time,
        priceStart: Number(first.high.toFixed(4)),
        priceEnd: Number(last.low.toFixed(4))
      };
};

const resolveDynamicAssistantAction = (params: {
  action: AssistantChartAction;
  candles: Candle[];
}): AssistantChartAction[] => {
  const action = params.action;
  const sourceWindow = getDynamicActionWindow(
    params.candles,
    action.dynamicLookback ?? action.lookback
  );

  if (sourceWindow.length === 0) {
    return [];
  }

  const first = sourceWindow[0]!;
  const last = sourceWindow[sourceWindow.length - 1]!;
  const lows = sourceWindow.map((row) => row.low);
  const highs = sourceWindow.map((row) => row.high);
  const closes = sourceWindow.map((row) => row.close);
  const support = candleQuantile(lows, 0.2) ?? last.low;
  const resistance = candleQuantile(highs, 0.8) ?? last.high;
  const median = candleQuantile(closes, 0.5) ?? last.close;

  if (action.type === "draw_support_resistance") {
    const levelsRequested = Number.isFinite(action.levels) ? Number(action.levels) : 1;
    const levels = clamp(Math.round(levelsRequested), 1, DYNAMIC_SR_MAX_LEVELS);
    if (levels <= 1) {
      return [
        {
          ...stripDynamicMeta(action),
          type: "draw_support_resistance",
          priceStart: Number(support.toFixed(4)),
          priceEnd: Number(resistance.toFixed(4))
        }
      ];
    }

    const computed = computeDynamicSupportResistanceLevels({
      candles: sourceWindow,
      levels,
      lookback: sourceWindow.length
    });

    if (!computed) {
      return [];
    }

    const lines: AssistantChartAction[] = [];
    computed.supports.forEach((price, index) => {
      lines.push({
        type: "draw_horizontal_line",
        label: action.label ? `${action.label} Support ${index + 1}` : `Support ${index + 1}`,
        color: "#13c98f",
        style: action.style ?? "dashed",
        price: Number(price.toFixed(4))
      });
    });
    computed.resistances.forEach((price, index) => {
      lines.push({
        type: "draw_horizontal_line",
        label: action.label ? `${action.label} Resistance ${index + 1}` : `Resistance ${index + 1}`,
        color: "#f0455a",
        style: action.style ?? "dashed",
        price: Number(price.toFixed(4))
      });
    });
    return lines;
  }

  if (action.type === "draw_horizontal_line") {
    const price = Number.isFinite(action.price)
      ? Number(action.price)
      : Number(median.toFixed(4));
    return [{ ...stripDynamicMeta(action), price: Number(price.toFixed(4)) }];
  }

  if (action.type === "draw_vertical_line") {
    return [{ ...stripDynamicMeta(action), time: last.time }];
  }

  if (action.type === "draw_trend_line") {
    return [
      {
        ...stripDynamicMeta(action),
        timeStart: first.time,
        priceStart: Number(first.close.toFixed(4)),
        timeEnd: last.time,
        priceEnd: Number(last.close.toFixed(4))
      }
    ];
  }

  if (action.type === "draw_box") {
    return [
      {
        ...stripDynamicMeta(action),
        timeStart: first.time,
        timeEnd: last.time,
        priceStart: Number(support.toFixed(4)),
        priceEnd: Number(resistance.toFixed(4))
      }
    ];
  }

  if (action.type === "draw_fvg") {
    const fvg = findLatestDynamicFvg(sourceWindow);
    if (fvg) {
      return [{ ...stripDynamicMeta(action), ...fvg }];
    }
    return [
      {
        ...stripDynamicMeta(action),
        timeStart: sourceWindow[Math.max(0, sourceWindow.length - 3)]?.time ?? first.time,
        timeEnd: last.time,
        priceStart: Number(((support + median) / 2).toFixed(4)),
        priceEnd: Number(((resistance + median) / 2).toFixed(4))
      }
    ];
  }

  if (action.type === "draw_fibonacci") {
    const fibAnchors = findDynamicFibAnchors(sourceWindow);
    if (!fibAnchors) {
      return [];
    }
    return [{ ...stripDynamicMeta(action), ...fibAnchors }];
  }

  if (action.type === "draw_arrow") {
    return [
      {
        ...stripDynamicMeta(action),
        time: last.time,
        price: Number(last.close.toFixed(4)),
        markerShape: last.close >= last.open ? "arrowUp" : "arrowDown"
      }
    ];
  }

  if (action.type === "draw_long_position") {
    return [
      {
        ...stripDynamicMeta(action),
        entryPrice: Number(last.close.toFixed(4)),
        stopPrice: Number(support.toFixed(4)),
        targetPrice: Number(resistance.toFixed(4)),
        side: "long"
      }
    ];
  }

  if (action.type === "draw_short_position") {
    return [
      {
        ...stripDynamicMeta(action),
        entryPrice: Number(last.close.toFixed(4)),
        stopPrice: Number(resistance.toFixed(4)),
        targetPrice: Number(support.toFixed(4)),
        side: "short"
      }
    ];
  }

  if (action.type === "draw_ruler") {
    return [
      {
        ...stripDynamicMeta(action),
        timeStart: first.time,
        priceStart: Number(first.close.toFixed(4)),
        timeEnd: last.time,
        priceEnd: Number(last.close.toFixed(4))
      }
    ];
  }

  if (action.type === "mark_candlestick") {
    return [
      {
        ...stripDynamicMeta(action),
        time: last.time,
        price: Number(last.close.toFixed(4)),
        markerShape: action.markerShape ?? "circle"
      }
    ];
  }

  if (action.type === "move_to_date") {
    return [{ ...stripDynamicMeta(action), time: last.time }];
  }

  return [stripDynamicMeta(action)];
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

const doesTradeFitCandles = (
  trade: Pick<HistoryItem, "entryTime" | "exitTime">,
  candles: Candle[]
): boolean => {
  if (candles.length < 2) {
    return false;
  }

  const entryMs = Number(trade.entryTime) * 1000;
  const exitMs = Number(trade.exitTime) * 1000;

  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs)) {
    return false;
  }

  const startMs = Math.min(entryMs, exitMs);
  const endMs = Math.max(entryMs, exitMs);
  const firstTime = candles[0]?.time ?? Number.POSITIVE_INFINITY;
  const lastIndex = candles.length - 1;
  const lastTime = candles[lastIndex]?.time ?? Number.NEGATIVE_INFINITY;
  const tailStepMs =
    lastIndex > 0 ? Math.max(60_000, lastTime - candles[lastIndex - 1].time) : 60_000;

  if (startMs < firstTime || endMs > lastTime + tailStepMs) {
    return false;
  }

  const entryIndex = findCandleIndexAtOrBefore(candles, entryMs);
  const exitIndex = findCandleIndexAtOrBefore(candles, exitMs);

  return entryIndex >= 0 && exitIndex >= entryIndex;
};

const resolveTradeMiniChartCandles = (
  trade: Pick<HistoryItem, "entryTime" | "exitTime">,
  preferredCandles: Candle[],
  fallbackCandles: Candle[]
): Candle[] => {
  if (doesTradeFitCandles(trade, preferredCandles)) {
    return preferredCandles;
  }

  if (doesTradeFitCandles(trade, fallbackCandles)) {
    return fallbackCandles;
  }

  if (preferredCandles.length > 0) {
    return preferredCandles;
  }

  if (fallbackCandles.length > 0) {
    return fallbackCandles;
  }

  return EMPTY_CANDLES;
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
  const direction = side === "BUY" ? 1 : -1;
  const formatChartPrice = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
      : "–";
  const formatChartPnl = (value: number) => `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(3)}`;
  const toPnl = (price: number) => (price - entryPrice) * direction * usdPerUnit;
  const miniSegments = useMemo(() => {
    const segments: Array<{
      key: string;
      stroke: string;
      segment: [{ x: number; y: number }, { x: number; y: number }];
    }> = [];

    if (data.length < 2) {
      return segments;
    }

    const pnlEpsilon = 0.000001;
    const getTone = (pnl: number): "up" | "down" | "flat" => {
      if (pnl > pnlEpsilon) {
        return "up";
      }

      if (pnl < -pnlEpsilon) {
        return "down";
      }

      return "flat";
    };
    const getStroke = (tone: "up" | "down" | "flat") =>
      tone === "up" ? "#34d399" : tone === "down" ? "#f87171" : "#ffffff";
    const pushSegment = (
      leftBar: number,
      leftPrice: number,
      rightBar: number,
      rightPrice: number,
      tone: "up" | "down" | "flat",
      index: number
    ) => {
      if (
        !Number.isFinite(leftBar) ||
        !Number.isFinite(leftPrice) ||
        !Number.isFinite(rightBar) ||
        !Number.isFinite(rightPrice)
      ) {
        return;
      }

      if (Math.abs(rightBar - leftBar) <= 0.000000001 && Math.abs(rightPrice - leftPrice) <= 0.000000001) {
        return;
      }

      segments.push({
        key: `mini-segment-${index}-${segments.length}`,
        stroke: getStroke(tone),
        segment: [
          { x: leftBar, y: leftPrice },
          { x: rightBar, y: rightPrice }
        ]
      });
    };

    for (let index = 1; index < data.length; index += 1) {
      const previous = data[index - 1]!;
      const current = data[index]!;
      const previousPnl = (previous.price - entryPrice) * direction * usdPerUnit;
      const currentPnl = (current.price - entryPrice) * direction * usdPerUnit;
      const previousTone = getTone(previousPnl);
      const currentTone = getTone(currentPnl);

      if (previousTone === currentTone) {
        pushSegment(previous.bar, previous.price, current.bar, current.price, previousTone, index);
        continue;
      }

      const isSignFlip =
        (previousTone === "up" && currentTone === "down") ||
        (previousTone === "down" && currentTone === "up");

      if (isSignFlip) {
        const priceDelta = current.price - previous.price;
        if (Math.abs(priceDelta) > 0.000000001) {
          const crossingRatio = (entryPrice - previous.price) / priceDelta;

          if (crossingRatio > 0 && crossingRatio < 1) {
            const crossingBar = previous.bar + (current.bar - previous.bar) * crossingRatio;
            pushSegment(previous.bar, previous.price, crossingBar, entryPrice, previousTone, index);
            pushSegment(crossingBar, entryPrice, current.bar, current.price, currentTone, index);
            continue;
          }
        }
      }

      if (previousTone === "flat") {
        pushSegment(previous.bar, previous.price, current.bar, current.price, currentTone, index);
      } else if (currentTone === "flat") {
        pushSegment(previous.bar, previous.price, current.bar, current.price, previousTone, index);
      } else {
        pushSegment(previous.bar, previous.price, current.bar, current.price, currentTone, index);
      }
    }

    return segments;
  }, [data, direction, entryPrice, usdPerUnit]);

  return (
    <div className="backtest-trade-mini-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 24, left: 12, bottom: 10 }}>
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <rect x="0" y="0" width={reveal} height="1" />
            </clipPath>
          </defs>

          <XAxis
            dataKey="bar"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(value: number) => String(Math.max(0, Math.round(value)))}
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
            <ReferenceLine
              y={tpPrice as number}
              stroke="#34d399"
              strokeDasharray="4 6"
              ifOverflow="extendDomain"
            />
          ) : null}
          {Number.isFinite(slPrice as number) ? (
            <ReferenceLine
              y={slPrice as number}
              stroke="#f87171"
              strokeDasharray="4 6"
              ifOverflow="extendDomain"
            />
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
              type="linear"
              dataKey="price"
              stroke="rgba(255, 255, 255, 0)"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 5, fill: "#111827", stroke: "#e5e7eb", strokeWidth: 1 }}
              isAnimationActive={false}
              connectNulls
            />
            {miniSegments.map((item) => (
              <ReferenceLine
                key={item.key}
                segment={item.segment}
                stroke={item.stroke}
                strokeWidth={2.75}
                strokeLinecap="butt"
                ifOverflow="extendDomain"
              />
            ))}
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
  isOpen
}: {
  trade: HistoryItem;
  candles: Candle[];
  isOpen: boolean;
}) => {
  const entryIndex = findCandleIndexAtOrBefore(candles, Number(trade.entryTime) * 1000);
  const exitIndex = findCandleIndexAtOrBefore(candles, Number(trade.exitTime) * 1000);

  const data = useMemo(() => {
    const entryTimeMs = Number(trade.entryTime) * 1000;
    const exitTimeMs = Number(trade.exitTime) * 1000;

    if (entryIndex < 0 || exitIndex < entryIndex || candles.length === 0) {
      if (!Number.isFinite(entryTimeMs) || !Number.isFinite(exitTimeMs)) {
        return [];
      }

      const safeExitTimeMs = Math.max(entryTimeMs + 60_000, exitTimeMs);
      const syntheticExitBar = Math.max(
        1,
        Math.ceil((safeExitTimeMs + 60_000 - entryTimeMs) / 60_000)
      );

      return [
        {
          bar: 0,
          price: trade.entryPrice,
          high: trade.entryPrice,
          low: trade.entryPrice,
          relCand: -1,
          ts: entryTimeMs
        },
        {
          bar: syntheticExitBar,
          price: trade.outcomePrice,
          high: Math.max(trade.entryPrice, trade.outcomePrice),
          low: Math.min(trade.entryPrice, trade.outcomePrice),
          relCand: 0,
          ts: safeExitTimeMs
        }
      ];
    }

    const endIndex = Math.min(candles.length - 1, Math.max(entryIndex, exitIndex));
    const rows: Array<{
      bar: number;
      price: number;
      high: number;
      low: number;
      relCand: number;
      candIdx?: number;
      ts?: number;
    }> = [];

    rows.push({
      bar: 0,
      price: trade.entryPrice,
      high: trade.entryPrice,
      low: trade.entryPrice,
      relCand: -1,
      ts: entryTimeMs
    });

    let previousPrice = trade.entryPrice;

    for (let index = entryIndex; index <= endIndex; index += 1) {
      const candle = candles[index];
      const close = candle?.close ?? previousPrice;
      const high = candle?.high ?? close;
      const low = candle?.low ?? close;
      const candleTime = candle?.time ?? entryTimeMs;
      const minuteIndex = Math.max(1, Math.ceil((candleTime + 60_000 - entryTimeMs) / 60_000));

      rows.push({
        bar: minuteIndex,
        price: close,
        high,
        low,
        relCand: index - entryIndex,
        candIdx: index,
        ts: candleTime
      });

      previousPrice = close;
    }

    if (rows.length > 0) {
      const last = rows[rows.length - 1]!;
      const exitPrice = trade.outcomePrice;
      const exitMinuteIndex = Math.max(
        1,
        Math.ceil((exitTimeMs + 60_000 - entryTimeMs) / 60_000)
      );

      if (exitMinuteIndex > last.bar) {
        rows.push({
          bar: exitMinuteIndex,
          price: exitPrice,
          high: Math.max(last.price, exitPrice),
          low: Math.min(last.price, exitPrice),
          relCand: last.relCand,
          candIdx: last.candIdx,
          ts: exitTimeMs
        });
      } else {
        last.price = exitPrice;
        last.high = Math.max(last.high, exitPrice);
        last.low = Math.min(last.low, exitPrice);
        last.ts = exitTimeMs;
      }
    }

    return rows;
  }, [
    candles,
    entryIndex,
    exitIndex,
    trade.entryPrice,
    trade.entryTime,
    trade.exitTime,
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
      low = Math.min(low, trade.targetPrice);
      high = Math.max(high, trade.targetPrice);
    }

    if (Number.isFinite(trade.stopPrice)) {
      low = Math.min(low, trade.stopPrice);
      high = Math.max(high, trade.stopPrice);
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

type ReplayModelKind =
  | "momentum"
  | "meanReversion"
  | "seasons"
  | "timeOfDay"
  | "fibonacci"
  | "fairValueGap"
  | "supportResistance";

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
    normalized.includes("fair value gap") ||
    normalized.includes("fvg") ||
    normalized.includes("imbalance")
  ) {
    return "fairValueGap";
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

const insertSortedExit = (activeExitMs: number[], exitMs: number) => {
  let insertAt = activeExitMs.length;
  while (insertAt > 0 && activeExitMs[insertAt - 1]! > exitMs) {
    insertAt -= 1;
  }
  activeExitMs.splice(insertAt, 0, exitMs);
};

const enforceMaxConcurrentTradeBlueprints = (
  blueprints: TradeBlueprint[],
  maxConcurrentTrades: number
): TradeBlueprint[] => {
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
  const selected: TradeBlueprint[] = [];
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

const enforceMaxConcurrentHistoryRows = (
  rows: HistoryItem[],
  maxConcurrentTrades: number,
  allowZeroDuration = false
): HistoryItem[] => {
  const limit = clamp(Math.floor(Number(maxConcurrentTrades) || 0), 0, 500);
  if (limit <= 0 || rows.length === 0) {
    return [];
  }

  const chronological = [...rows]
    .filter((row) => {
      const entrySec = Number(row.entryTime);
      const exitSec = Number(row.exitTime);
      return (
        Number.isFinite(entrySec) &&
        Number.isFinite(exitSec) &&
        (allowZeroDuration ? exitSec >= entrySec : exitSec > entrySec)
      );
    })
    .sort(
      (left, right) =>
        Number(left.entryTime) - Number(right.entryTime) ||
        Number(left.exitTime) - Number(right.exitTime) ||
        left.id.localeCompare(right.id)
    );
  const selected: HistoryItem[] = [];
  const activeExitSec: number[] = [];

  for (const row of chronological) {
    const entrySec = Number(row.entryTime);
    const exitSec = Number(row.exitTime);

    while (activeExitSec.length > 0 && activeExitSec[0]! <= entrySec) {
      activeExitSec.shift();
    }

    if (activeExitSec.length >= limit) {
      continue;
    }

    selected.push(row);
    insertSortedExit(activeExitSec, exitSec);
  }

  return selected.sort(
    (left, right) =>
      Number(left.exitTime) - Number(right.exitTime) || left.id.localeCompare(right.id)
  );
};

const ModelRunEquityChart = ({
  data,
  emptyLabel
}: {
  data: ModelRunChartPoint[];
  emptyLabel: string;
}) => {
  if (data.length === 0) {
    return <div className="model-run-empty">{emptyLabel}</div>;
  }

  const minValue = Math.min(0, ...data.map((point) => point.cumulativePnl));
  const maxValue = Math.max(0, ...data.map((point) => point.cumulativePnl));
  const padding = Math.max(25, (maxValue - minValue) * 0.14);
  const yDomain: [number, number] = [minValue - padding, maxValue + padding];

  return (
    <div className="model-run-chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="model-run-equity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.16)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="rgba(205, 220, 239, 0.5)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            stroke="rgba(205, 220, 239, 0.5)"
            tick={{ fontSize: 11 }}
            tickFormatter={formatChartUsd}
            tickLine={false}
            axisLine={false}
            width={86}
            domain={yDomain}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.16)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.24)", strokeWidth: 1 }}
            content={({ active, payload, label }: RechartsTooltipRenderProps & { label?: string }) => {
              if (!active || !payload || payload.length === 0) {
                return null;
              }

              const point = payload[0]?.payload as ModelRunChartPoint | undefined;

              if (!point) {
                return null;
              }

              return (
                <div className="model-run-tooltip">
                  <strong>{label}</strong>
                  <span>Equity: {formatSignedUsd(point.cumulativePnl)}</span>
                  <span>Trades: {point.tradeCount.toLocaleString("en-US")}</span>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulativePnl"
            stroke="none"
            fill="url(#model-run-equity-fill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cumulativePnl"
            stroke="rgba(242, 244, 247, 0.92)"
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
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

const ChartLoadingSpinner = ({ label }: { label: string }) => {
  return (
    <div className="chart-loading-overlay" role="status" aria-live="polite">
      <div className="chart-loading-core">
        <span className="chart-loading-spinner" aria-hidden />
        <span className="chart-loading-text">{label}</span>
      </div>
    </div>
  );
};

const stableHashToUnit = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
};

const getAiZipTradeDisplayId = (trade: Pick<HistoryItem, "id" | "entryTime">) => {
  const rawId = String(
    (trade as any)?.uid ??
      (trade as any)?.tradeUid ??
      (trade as any)?.tradeId ??
      (trade as any)?.metaUid ??
      (trade as any)?.metaTradeUid ??
      trade.id ??
      ""
  ).trim();

  if (!rawId) {
    return "—";
  }

  const entryMs = (() => {
    const raw = (trade as any).entryTime;
    if (raw == null || raw === "") return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      if (raw > 1e12) return Math.floor(raw);
      if (raw > 1e9) return Math.floor(raw * 1000);
      return Math.floor(raw);
    }
    const s = String(raw).trim();
    if (!s) return null;
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
    const digits = s.replace(/[^0-9]/g, "");
    if (!digits) return null;
    const asNum = Number(digits);
    if (!Number.isFinite(asNum)) return null;
    if (asNum > 1e12) return Math.floor(asNum);
    if (asNum > 1e9) return Math.floor(asNum * 1000);
    return Math.floor(asNum);
  })();

  const seedText =
    entryMs == null ? `idNoTs|${rawId}` : `idTs|${entryMs}|${rawId}`;
  const h = Math.floor(stableHashToUnit(seedText) * 0xffffffff) >>> 0;
  const shortCode = h.toString(36).toUpperCase().padStart(6, "0").slice(-6);

  return `live| ${shortCode}`;
};

const cloneAiLibrarySettings = (settings: AiLibrarySettings): AiLibrarySettings => {
  const next: AiLibrarySettings = {};

  for (const [libraryId, values] of Object.entries(settings)) {
    next[libraryId] = { ...values };
  }

  return next;
};

const serializeBacktestSettingsSnapshot = (settings: BacktestSettingsSnapshot) =>
  JSON.stringify(settings);

const areAiModelStatesEqual = (
  left: BacktestSettingsSnapshot["aiModelStates"],
  right: BacktestSettingsSnapshot["aiModelStates"]
) => {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  for (const key of keys) {
    if ((left?.[key] ?? 0) !== (right?.[key] ?? 0)) {
      return false;
    }
  }
  return true;
};

const doesBacktestHistoryGenerationInputChange = (
  previous: BacktestSettingsSnapshot,
  next: BacktestSettingsSnapshot
) => {
  if (previous.symbol !== next.symbol) return true;
  if (previous.timeframe !== next.timeframe) return true;
  if (previous.minutePreciseEnabled !== next.minutePreciseEnabled) return true;
  if (!areAiModelStatesEqual(previous.aiModelStates, next.aiModelStates)) return true;
  if (previous.dollarsPerMove !== next.dollarsPerMove) return true;
  if (previous.tpDollars !== next.tpDollars) return true;
  if (previous.slDollars !== next.slDollars) return true;
  if (previous.stopMode !== next.stopMode) return true;
  if (previous.breakEvenTriggerPct !== next.breakEvenTriggerPct) return true;
  if (previous.trailingStartPct !== next.trailingStartPct) return true;
  if (previous.trailingDistPct !== next.trailingDistPct) return true;
  if (previous.maxBarsInTrade !== next.maxBarsInTrade) return true;
  if (previous.maxConcurrentTrades !== next.maxConcurrentTrades) return true;
  return false;
};

const getStatsRefreshPhaseKey = (status: string): string => {
  if (status === "Recovering Replay Locally") {
    return "Replaying Backtest Trades";
  }

  if (status === "Applying AI Analysis") {
    return "Loading AI Libraries";
  }

  if (status === "Historical Candle Range Unavailable") {
    return "Loading Candle History";
  }

  return status;
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

const normalizeTimestampMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return NaN;
  }

  return value > 1_000_000_000_000 ? value : value * 1000;
};

const getStatsRefreshPhaseDurationMs = (status: string): number => {
  const phaseKey = getStatsRefreshPhaseKey(status);

  if (phaseKey === "Preparing Backtest Replay") {
    return 900;
  }

  if (phaseKey === "Finalizing Statistics") {
    return 800;
  }

  if (phaseKey === "Loading AI Libraries") {
    return 1200;
  }

  if (phaseKey === "No Trades In Selected Range") {
    return 1000;
  }

  if (status === "Historical Candle Range Unavailable") {
    return 1200;
  }

  return 2200;
};

const isStatsRefreshAutoFinishPhase = (status: string): boolean => {
  const phaseKey = getStatsRefreshPhaseKey(status);
  return (
    phaseKey === "Finalizing Statistics" ||
    phaseKey === "No Trades In Selected Range" ||
    status === "Historical Candle Range Unavailable"
  );
};

const getStatsRefreshStatusDetail = (status: string): string => {
  if (status === "Loading Candle History") {
    return "Fetching historical candles and 1-minute support data.";
  }

  if (status === "Preparing Backtest Replay") {
    return "Applying date filters and building replay timeline.";
  }

  if (status === "Replaying Backtest Trades") {
    return "Replaying backtest trades across the full selected date range.";
  }

  if (status === "Recovering Replay Locally") {
    return "Server replay ran long, so the run is finishing with the local replay engine.";
  }

  if (status === "Loading AI Libraries") {
    return "Applying selected AI libraries to replayed backtest results.";
  }

  if (status === "Applying AI Analysis") {
    return "Applying AI filters, confidence, and nearest-neighbor analysis to replayed trades.";
  }

  if (status === "Finalizing Statistics") {
    return "Aggregating performance metrics and updating panels.";
  }

  if (status === "No Trades In Selected Range") {
    return "No trades were found inside the selected backtest range.";
  }

  if (status === "Historical Candle Range Unavailable") {
    return "The requested historical candle range could not be loaded. Adjust the date window or rerun after history sync completes.";
  }

  return "Updating backtest statistics.";
};

const buildStatsRefreshPhasePlan = ({
  needsHistorySeedReload,
  loadingLibraries
}: {
  needsHistorySeedReload: boolean;
  loadingLibraries: boolean;
}): string[] => {
  const phases: string[] = [];

  if (needsHistorySeedReload) {
    phases.push("Loading Candle History");
  }

  phases.push("Preparing Backtest Replay");
  phases.push("Replaying Backtest Trades");

  if (loadingLibraries) {
    phases.push("Loading AI Libraries");
  }

  phases.push("Finalizing Statistics");

  return phases;
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
  const normalizeSelectedAiLibraries = useCallback((value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const cleaned: string[] = [];

    for (const libraryId of value) {
      const id = String(libraryId ?? "").trim();

      if (id.length === 0 || !aiLibraryDefById[id] || seen.has(id)) {
        continue;
      }

      seen.add(id);
      cleaned.push(id);
    }

    const isLegacyDefault =
      cleaned.length === 3 &&
      cleaned[0] === "core" &&
      cleaned[1] === "recent" &&
      cleaned[2] === "base";
    const isLegacyCoreOnly = cleaned.length === 1 && cleaned[0] === "core";

    return isLegacyDefault || isLegacyCoreOnly ? [] : cleaned;
  }, [aiLibraryDefById]);
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [selectedBacktestTimeframe, setSelectedBacktestTimeframe] = useState<Timeframe>("15m");
  const [minutePreciseEnabled, setMinutePreciseEnabled] = useState(false);
  const [selectedSurfaceTab, setSelectedSurfaceTab] = useState<SurfaceTab>("chart");
  const [selectedBacktestTab, setSelectedBacktestTab] = useState<BacktestTab>("mainStats");
  const [terminalViewStateReady, setTerminalViewStateReady] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(WORKSPACE_PANEL_DEFAULT_WIDTH);
  const [isWorkspacePanelResizing, setIsWorkspacePanelResizing] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryInteractionTick, setSelectedHistoryInteractionTick] = useState(0);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [showActiveTradeOnChart, setShowActiveTradeOnChart] = useState(false);
  const [chartPanelLiveSimulationEnabled, setChartPanelLiveSimulationEnabled] = useState(false);
  const [activePanelLiveSimulationEnabled, setActivePanelLiveSimulationEnabled] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [chartContextMenu, setChartContextMenu] = useState<MainChartContextMenuState | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>({});
  const [chartHistoryLoadingKey, setChartHistoryLoadingKey] = useState<string | null>(null);
  const [backtestSeriesMap, setBacktestSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestOneMinuteSeriesMap, setBacktestOneMinuteSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestHistoryQuery, setBacktestHistoryQuery] = useState("");
  const [backtestHistoryPage, setBacktestHistoryPage] = useState(1);
  const [backtestHistoryCollapsed, setBacktestHistoryCollapsed] = useState(false);
  const [hoveredBacktestHistoryId, setHoveredBacktestHistoryId] = useState<string | null>(null);
  const [activeBacktestTradeDetails, setActiveBacktestTradeDetails] = useState<
    Record<string, unknown> | null
  >(null);
  const [statsDateStart, setStatsDateStart] = useState(BACKTEST_DEFAULT_DATE_RANGE.startDate);
  const [statsDateEnd, setStatsDateEnd] = useState(BACKTEST_DEFAULT_DATE_RANGE.endDate);
  const [statsDatePreset, setStatsDatePreset] = useState<BacktestDatePreset>("pastYear");
  const [statsDatePresetDdOpen, setStatsDatePresetDdOpen] = useState(false);
  const [statsTimeframeDdOpen, setStatsTimeframeDdOpen] = useState(false);
  const [modelRunModalModelId, setModelRunModalModelId] = useState<string | null>(null);
  const [modelRunTimeframe, setModelRunTimeframe] = useState<Timeframe>("15m");
  const [modelRunPreset, setModelRunPreset] = useState<BacktestPresetRange>("pastMonth");
  const [modelRunTpDollars, setModelRunTpDollars] = useState(1000);
  const [modelRunSlDollars, setModelRunSlDollars] = useState(1000);
  const [modelRunUnits, setModelRunUnits] = useState(25);
  const [modelRunPresetDdOpen, setModelRunPresetDdOpen] = useState(false);
  const [modelRunTimeframeDdOpen, setModelRunTimeframeDdOpen] = useState(false);
  const [modelRunRunning, setModelRunRunning] = useState(false);
  const [modelRunError, setModelRunError] = useState("");
  const [modelRunResult, setModelRunResult] = useState<ModelRunResult | null>(null);
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
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState(1);
  const [stopMode, setStopMode] = useState(0); // 0=Off, 1=Break-Even, 2=Trailing
  const [breakEvenTriggerPct, setBreakEvenTriggerPct] = useState(50);
  const [trailingStartPct, setTrailingStartPct] = useState(50);
  const [trailingDistPct, setTrailingDistPct] = useState(30);
  const [methodSettingsOpen, setMethodSettingsOpen] = useState(false);
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [uploadedStrategyModels, setUploadedStrategyModels] = useState<StrategyModelCatalogEntry[]>([]);
  const [uploadedStrategyModelsReady, setUploadedStrategyModelsReady] = useState(false);
  const settingsModelNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    const pushName = (value: string) => {
      const trimmed = value.trim();

      if (!trimmed || seen.has(trimmed)) {
        return;
      }

      seen.add(trimmed);
      names.push(trimmed);
    };

    availableAiModelNames.forEach(pushName);
    STRATEGY_MODEL_CATALOG.forEach((model) => pushName(model.name));
    uploadedStrategyModels.forEach((model) => pushName(model.name));

    return names;
  }, [availableAiModelNames, uploadedStrategyModels]);
  const [modelsSurfaceNotice, setModelsSurfaceNotice] = useState("");
  const [modelsSurfaceNoticeTone, setModelsSurfaceNoticeTone] = useState<
    "neutral" | "success" | "error"
  >("neutral");
  const [featuresModalOpen, setFeaturesModalOpen] = useState(false);
  const [librariesModalOpen, setLibrariesModalOpen] = useState(false);
  const [aiModelStates, setAiModelStates] = useState<Record<string, AiModelState>>(() => {
    return buildInitialAiModelStates(settingsModelNames);
  });
  const [aiFeatureLevels, setAiFeatureLevels] = useState<Record<string, AiFeatureLevel>>(() => {
    return buildInitialAiFeatureLevels();
  });
  const [aiFeatureModes, setAiFeatureModes] = useState<Record<string, AiFeatureMode>>(() => {
    return buildInitialAiFeatureModes();
  });
  const [selectedAiLibraries, setSelectedAiLibraries] = useState<string[]>([]);
  const [selectedAiLibraryId, setSelectedAiLibraryId] = useState("");
  const [selectedAiLibrarySettings, setSelectedAiLibrarySettings] = useState<AiLibrarySettings>(() => {
    return buildDefaultAiLibrarySettings(aiLibraryDefs);
  });
  const [aiLibraryRunStatus, setAiLibraryRunStatus] = useState<Record<string, AiLibraryRunStatus>>({});
  const [aiLibraryCounts, setAiLibraryCounts] = useState<Record<string, number>>({});
  const [aiLibraryBaselineWinRates, setAiLibraryBaselineWinRates] = useState<Record<string, number>>({});
  const [aiLibraryPoints, setAiLibraryPoints] = useState<any[]>([]);
  const aiLibraryPointsByIdRef = useRef<Record<string, any[]>>({});
  const aiLibraryPoolCacheRef = useRef<Map<string, HistoryItem[]>>(new Map());
  const aiLibraryPoolInFlightRef = useRef<Map<string, Promise<HistoryItem[]>>>(new Map());
  const aiLibraryHistoryInFlightRef = useRef<Map<string, Promise<AiLibraryHistorySeed>>>(new Map());
  const aiLibraryRunTokenRef = useRef<Record<string, number>>({});
  const [aiBulkScope, setAiBulkScope] = useState<"active" | "all">("active");
  const [aiBulkWeight, setAiBulkWeight] = useState(100);
  const [aiBulkStride, setAiBulkStride] = useState(0);
  const [aiBulkMaxSamples, setAiBulkMaxSamples] = useState(10000);
  const [chunkBars, setChunkBars] = useState(24);
  const [distanceMetric, setDistanceMetric] = useState<AiDistanceMetric>("euclidean");
  const [knnNeighborSpace, setKnnNeighborSpace] = useState<KnnNeighborSpace>("post");
  const [selectedAiDomains, setSelectedAiDomains] = useState<string[]>([
    "Direction",
    "Model"
  ]);
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
  const [statsRefreshStatus, setStatsRefreshStatus] = useState("Updating Backtest Statistics");
  const [statsRefreshPhasePlan, setStatsRefreshPhasePlan] = useState<string[]>([]);
  const [statsRefreshProgressLabel, setStatsRefreshProgressLabel] = useState("");
  const [statsRefreshTimelineRange, setStatsRefreshTimelineRange] = useState<{
    startMs: number;
    endMs: number;
  }>(() => ({
    startMs: backtestRefreshNowMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000,
    endMs: backtestRefreshNowMs
  }));
  const [backtestHistorySeedReady, setBacktestHistorySeedReady] = useState(false);
  const [isBacktestSurfaceSettled, setIsBacktestSurfaceSettled] = useState(true);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState<"save" | "load" | null>(null);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [aggressorPressure, setAggressorPressure] = useState<AggressorPressureSnapshot>(() => ({
    buyPressure: 0,
    sellPressure: 0,
    scaleCeiling: 1,
    averageSpread: 0,
    tickCount: 0,
    updatedAtMs: 0
  }));
  const [liveQuote, setLiveQuote] = useState<LiveQuoteSnapshot>(() => ({
    bid: null,
    ask: null,
    spread: null,
    bidTone: "neutral",
    askTone: "neutral",
    updatedAtMs: 0
  }));
  const [volumeNowcast, setVolumeNowcast] = useState<VolumeNowcastSnapshot>(() => ({
    estimatedCurrentVolume: 0,
    estimatedFinalVolume: 0,
    baselineVolume: 0,
    progressRatio: 0,
    confidence: 0,
    tickCount: 0,
    updatedAtMs: 0
  }));

  const buildCurrentBacktestSettingsSnapshot = (): BacktestSettingsSnapshot => ({
    symbol: selectedSymbol,
    timeframe: selectedBacktestTimeframe,
    minutePreciseEnabled,
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
    maxBarsInTrade,
    maxConcurrentTrades,
    aiModelStates: { ...aiModelStates },
    aiFeatureLevels: { ...aiFeatureLevels },
    aiFeatureModes: { ...aiFeatureModes },
    selectedAiLibraries: [...selectedAiLibraries],
    selectedAiLibrarySettings: cloneAiLibrarySettings(selectedAiLibrarySettings),
    chunkBars,
    distanceMetric,
    knnNeighborSpace,
    selectedAiDomains: [...selectedAiDomains],
    dimensionAmount,
    compressionMethod,
    kEntry,
    kExit,
    knnVoteMode,
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
    if (typeof window === "undefined") {
      setTerminalViewStateReady(true);
      return;
    }

    try {
      const raw = localStorage.getItem(TERMINAL_VIEW_STATE_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        surfaceTab?: unknown;
        backtestTab?: unknown;
      };

      if (isSurfaceTab(parsed.surfaceTab)) {
        setSelectedSurfaceTab(parsed.surfaceTab);
      }

      if (isBacktestTab(parsed.backtestTab)) {
        setSelectedBacktestTab(parsed.backtestTab);
      }
    } catch {
      // Ignore corrupted persisted view state.
    } finally {
      setTerminalViewStateReady(true);
    }
  }, [
    setActivePanelTab,
    setAiZipClusterMapView,
    setBacktestHistoryCollapsed,
    setClusterLegendToggles,
    setClusterViewDir,
    setClusterViewHour,
    setClusterViewMonth,
    setClusterViewSession,
    setClusterViewWeekday,
    setIsGraphsCollapsed,
    setPanelExpanded,
    setPerformanceStatsCollapsed,
    setShowActiveTradeOnChart,
    setShowAllTradesOnChart,
    setWorkspacePanelWidth
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !terminalViewStateReady) {
      return;
    }

    try {
      localStorage.setItem(
        TERMINAL_VIEW_STATE_STORAGE_KEY,
        JSON.stringify({
          surfaceTab: selectedSurfaceTab,
          backtestTab: selectedBacktestTab
        })
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [selectedBacktestTab, selectedSurfaceTab, terminalViewStateReady]);

  useEffect(() => {
    setAiModelStates((current) => syncAiModelStates(current, settingsModelNames));
  }, [settingsModelNames]);

  useEffect(() => {
    if (
      selectedSurfaceTab === "backtest" &&
      (selectedBacktestTab === "mainSettings" || selectedBacktestTab === "timeSettings")
    ) {
      setSelectedBacktestTab("mainStats");
    }
  }, [selectedBacktestTab, selectedSurfaceTab]);

  useEffect(() => {
    void loadLightweightCharts();
  }, []);

  useEffect(() => {
    if (selectedSurfaceTab !== "settings") {
      return;
    }

    if (selectedBacktestTab !== "mainSettings") {
      setSelectedBacktestTab("mainSettings");
    }
  }, [selectedBacktestTab, selectedSurfaceTab]);

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
  const chartHistoryReadyByKeyRef = useRef<Record<string, true>>({});
  const chartResetAfterLoadKeyRef = useRef<string | null>(null);
  const selectionRef = useRef<string>("");
  const focusTradeIdRef = useRef<string | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const aggressorPressurePointsRef = useRef<AggressorPressurePoint[]>([]);
  const aggressorTrainingPeaksRef = useRef<AggressorTrainingPeak[]>([]);
  const aggressorPressureStateRef = useRef({
    lastMid: Number.NaN,
    lastUiUpdateMs: 0,
    peakPressure: 1,
    lastTickMs: 0
  });
  const overlayCatchupSeedKeyRef = useRef("");
  const liveQuoteStateRef = useRef({
    bid: Number.NaN,
    ask: Number.NaN
  });
  const volumeNowcastStateRef = useRef({
    candleStartMs: 0,
    lastEventMs: 0,
    lastMid: Number.NaN,
    tickCount: 0,
    absMidMove: 0,
    spreadSum: 0,
    spreadCount: 0,
    lastUiUpdateMs: 0,
    lastEstimatedFinalVolume: 0,
    lastProgressRatio: 0
  });
  const volumeNowcastCalibrationRef = useRef({
    multiplier: 1,
    sampleCount: 0,
    pendingByCandleStart: new Map<number, number>()
  });
  const volumeBaselineRef = useRef<VolumeBaselineProfile>(createEmptyVolumeBaselineProfile());
  const selectedSurfaceTabRef = useRef<SurfaceTab>(selectedSurfaceTab);
  const statsRefreshOverlayModeRef = useRef<StatsRefreshOverlayMode>("idle");
  const statsRefreshStatusRef = useRef(statsRefreshStatus);
  const statsRefreshTimelineRangeRef = useRef<{ startMs: number; endMs: number }>({
    startMs: statsRefreshTimelineRange.startMs,
    endMs: statsRefreshTimelineRange.endMs
  });
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
  const appliedBacktestMinutePreciseEnabledRef = useRef(false);
  const appliedBacktestSettingsRef = useRef<BacktestSettingsSnapshot>(appliedBacktestSettings);
  const appliedBacktestStatsDateStartRef = useRef("");
  const appliedBacktestStatsDateEndRef = useRef("");
  const chartSizeRef = useRef({ width: 0, height: 0 });
  const chartRenderWindowRef = useRef<ChartDataWindow>({ from: 0, to: -1 });
  const chartVisibleGlobalRangeRef = useRef<ChartDataWindow | null>(null);
  const chartPendingVisibleGlobalRangeRef = useRef<ChartDataWindow | null>(null);
  const chartVisibleRangeSyncRafRef = useRef(0);
  const chartFocusedPriceRangeRef = useRef<PriceRange | null>(null);
  const chartFocusedPriceRangeResetRafRef = useRef(0);
  const chartIsApplyingVisibleRangeRef = useRef(false);
  const chartHoverCandleRef = useRef<MainChartContextMenuCandle | null>(null);
  const chartContextMenuRef = useRef<HTMLDivElement | null>(null);
  const chartBarIndexByGaplessTimeRef = useRef<Map<number, number>>(new Map());
  const workspaceRef = useRef<HTMLElement | null>(null);
  const settingsFileInputRef = useRef<HTMLInputElement | null>(null);
  const modelsUploadInputRef = useRef<HTMLInputElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const chartSourceLengthRef = useRef(0);
  const previousChartSourceLengthRef = useRef(0);
  const requestChartVisibleRangeRef = useRef<(visibleRange: ChartDataWindow) => void>(() => {});
  const chartDataLengthRef = useRef(0);
  const chartLastBarTimeRef = useRef(0);
  const chartViewCenterTimeMsRef = useRef<number | null>(null);
  const seriesMapRef = useRef(seriesMap);
  const backtestSeriesMapRef = useRef(backtestSeriesMap);
  const backtestOneMinuteSeriesMapRef = useRef(backtestOneMinuteSeriesMap);
  const appliedBacktestSeedCandlesRef = useRef<Candle[]>(EMPTY_CANDLES);
  const appliedBacktestFallbackCandlesRef = useRef<Candle[]>(EMPTY_CANDLES);
  const appliedBacktestSeedOneMinuteCandlesRef = useRef<Candle[]>(EMPTY_CANDLES);
  const appliedBacktestFallbackOneMinuteCandlesRef = useRef<Candle[]>(EMPTY_CANDLES);
  const selectedChartCandlesRef = useRef<Candle[]>([]);
  const statsDatePresetDdRef = useRef<HTMLDivElement>(null);
  const statsTimeframeDdRef = useRef<HTMLDivElement>(null);
  const modelRunPresetDdRef = useRef<HTMLDivElement>(null);
  const modelRunTimeframeDdRef = useRef<HTMLDivElement>(null);
  const aiChartOverlaySeriesRef = useRef<Array<ISeriesApi<"Line">>>([]);
  const aiChartPriceLinesRef = useRef<IPriceLine[]>([]);
  const aiDynamicChartOverlaySeriesRef = useRef<Array<ISeriesApi<"Line">>>([]);
  const aiDynamicChartPriceLinesRef = useRef<IPriceLine[]>([]);
  const aiChartMarkersRef = useRef<SeriesMarker<Time>[]>([]);
  const aiDynamicChartMarkersRef = useRef<SeriesMarker<Time>[]>([]);
  const dynamicAssistantActionsRef = useRef<AssistantChartAction[]>([]);
  const lastAssistantDrawActionsRef = useRef<AssistantChartAction[]>([]);
  const baseChartMarkersRef = useRef<SeriesMarker<Time>[]>([]);
  const [chartRenderWindow, setChartRenderWindow] = useState<ChartDataWindow>({ from: 0, to: -1 });

  const applyCombinedChartMarkers = useCallback((baseMarkers?: SeriesMarker<Time>[]) => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) {
      return;
    }

    if (Array.isArray(baseMarkers)) {
      baseChartMarkersRef.current = baseMarkers;
    }

    const merged = [
      ...baseChartMarkersRef.current,
      ...aiChartMarkersRef.current,
      ...aiDynamicChartMarkersRef.current
    ];
    merged.sort((left, right) => Number(left.time) - Number(right.time));
    candleSeries.setMarkers(merged);
  }, []);

  const clearAiChartAnnotations = useCallback(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    if (!chart || !candleSeries) {
      aiChartOverlaySeriesRef.current = [];
      aiChartPriceLinesRef.current = [];
      aiChartMarkersRef.current = [];
      return;
    }

    for (const series of aiChartOverlaySeriesRef.current) {
      chart.removeSeries(series);
    }
    aiChartOverlaySeriesRef.current = [];

    for (const priceLine of aiChartPriceLinesRef.current) {
      candleSeries.removePriceLine(priceLine);
    }
    aiChartPriceLinesRef.current = [];

    aiChartMarkersRef.current = [];
    applyCombinedChartMarkers();
  }, [applyCombinedChartMarkers]);

  const clearDynamicAiChartAnnotations = useCallback((preserveRegisteredActions = false) => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) {
      aiDynamicChartOverlaySeriesRef.current = [];
      aiDynamicChartPriceLinesRef.current = [];
      aiDynamicChartMarkersRef.current = [];
      if (!preserveRegisteredActions) {
        dynamicAssistantActionsRef.current = [];
      }
      return;
    }

    const chart = chartRef.current;
    if (chart) {
      for (const series of aiDynamicChartOverlaySeriesRef.current) {
        chart.removeSeries(series);
      }
    }
    aiDynamicChartOverlaySeriesRef.current = [];

    for (const priceLine of aiDynamicChartPriceLinesRef.current) {
      candleSeries.removePriceLine(priceLine);
    }
    aiDynamicChartPriceLinesRef.current = [];
    aiDynamicChartMarkersRef.current = [];
    if (!preserveRegisteredActions) {
      dynamicAssistantActionsRef.current = [];
    }
    applyCombinedChartMarkers();
  }, [applyCombinedChartMarkers]);

  const clearAllAiChartAnnotations = useCallback(() => {
    clearAiChartAnnotations();
    clearDynamicAiChartAnnotations();
    lastAssistantDrawActionsRef.current = [];
  }, [clearAiChartAnnotations, clearDynamicAiChartAnnotations]);

  const clampWorkspacePanelWidth = useCallback((rawWidth: number): number => {
    const workspaceWidth =
      workspaceRef.current?.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : WORKSPACE_PANEL_DEFAULT_WIDTH + WORKSPACE_CHART_MIN_WIDTH);
    const maxFromWorkspace = Math.max(
      WORKSPACE_PANEL_MIN_WIDTH,
      Math.min(WORKSPACE_PANEL_MAX_WIDTH, workspaceWidth - WORKSPACE_CHART_MIN_WIDTH)
    );
    return clamp(Math.round(rawWidth), WORKSPACE_PANEL_MIN_WIDTH, maxFromWorkspace);
  }, []);

  const startWorkspacePanelResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !panelExpanded) {
        return;
      }

      event.preventDefault();
      setIsWorkspacePanelResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onPointerMove = (moveEvent: PointerEvent) => {
        const workspaceElement = workspaceRef.current;
        if (!workspaceElement) {
          return;
        }
        const bounds = workspaceElement.getBoundingClientRect();
        const nextWidth = bounds.right - moveEvent.clientX;
        setWorkspacePanelWidth(clampWorkspacePanelWidth(nextWidth));
      };

      const stopResizing = () => {
        setIsWorkspacePanelResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopResizing);
      window.addEventListener("pointercancel", stopResizing);
    },
    [clampWorkspacePanelWidth, panelExpanded]
  );

  useEffect(() => {
    if (!panelExpanded) {
      setIsWorkspacePanelResizing(false);
      return;
    }

    const clampCurrentWidth = () => {
      setWorkspacePanelWidth((current) => clampWorkspacePanelWidth(current));
    };

    clampCurrentWidth();
    window.addEventListener("resize", clampCurrentWidth);
    return () => {
      window.removeEventListener("resize", clampCurrentWidth);
    };
  }, [clampWorkspacePanelWidth, panelExpanded]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const workspaceStyle = useMemo(() => {
    if (!panelExpanded) {
      return undefined;
    }

    return {
      ["--workspace-panel-width" as string]: `${workspacePanelWidth}px`
    } as CSSProperties;
  }, [panelExpanded, workspacePanelWidth]);

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
  const setStatsRefreshTimelineRangeValue = useCallback((startMs: number, endMs: number) => {
    const safeStartMs = Number.isFinite(startMs)
      ? startMs
      : backtestRefreshNowMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;
    const safeEndMs = Number.isFinite(endMs) ? Math.max(safeStartMs + 60_000, endMs) : backtestRefreshNowMs;
    const nextRange = { startMs: safeStartMs, endMs: safeEndMs };
    statsRefreshTimelineRangeRef.current = nextRange;
    setStatsRefreshTimelineRange(nextRange);
  }, [backtestRefreshNowMs]);
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
        setStatsRefreshStatus("Updating Backtest Statistics");
        setStatsRefreshPhasePlan([]);
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
  const applyBacktestSettingsSnapshot = useCallback((options?: { forceFullReload?: boolean }) => {
    const forceFullReload = options?.forceFullReload ?? false;
    const nextSettings = liveBacktestSettingsRef.current;
    const previousSettings = appliedBacktestSettings;
    const hasBacktestRun = backtestRunCount > 0;
    const settingsChanged =
      forceFullReload ||
      serializeBacktestSettingsSnapshot(previousSettings) !==
      serializeBacktestSettingsSnapshot(nextSettings);

    if (!settingsChanged) {
      updateStatsRefreshOverlayMode("idle");
      setStatsRefreshProgress(0);
      setStatsRefreshLoadingDisplayProgress(0);
      setStatsRefreshStatus("Updating Backtest Statistics");
      setStatsRefreshPhasePlan([]);
      setStatsRefreshProgressLabel("");
      return;
    }

    const needsHistoryRecompute =
      forceFullReload ||
      !hasBacktestRun ||
      doesBacktestHistoryGenerationInputChange(previousSettings, nextSettings);
    const needsHistorySeedReload =
      forceFullReload ||
      !hasBacktestRun ||
      doesAizipHistorySeedSettingsChange(previousSettings, nextSettings);
    const nextRefreshMs = floorToTimeframe(Date.now(), "1m");

    clearStatsRefreshResetTimeout();
    setAppliedBacktestSettings(nextSettings);
    if (needsHistoryRecompute) {
      const hasAiAnalysisPhase =
        nextSettings.aiMode !== "off" &&
        (nextSettings.antiCheatEnabled ||
          ((nextSettings.selectedAiLibraries?.length ?? 0) > 0 &&
            canRunAizipLibrariesForSettings({
              libraryIds: nextSettings.selectedAiLibraries,
              aiModelStates: nextSettings.aiModelStates
            })));
      setBacktestRunCount((current) => current + 1);
      setBacktestRefreshNowMs(nextRefreshMs);
      setBacktestHistorySeedReady(!needsHistorySeedReload);
      updateStatsRefreshOverlayMode("loading");
      setStatsRefreshProgress(0);
      setStatsRefreshLoadingDisplayProgress(0);
      setStatsRefreshPhasePlan(
        buildStatsRefreshPhasePlan({
          needsHistorySeedReload,
          loadingLibraries: hasAiAnalysisPhase
        })
      );
      setStatsRefreshStatus(
        needsHistorySeedReload
          ? "Loading Candle History"
          : "Preparing Backtest Replay"
      );
      const rangeStartMs = normalizeTimestampMs(backtestBlueprintRangeRef.current.startMs);
      const rangeEndMs = normalizeTimestampMs(backtestBlueprintRangeRef.current.endMs);
      const baseStartMs = Number.isFinite(rangeStartMs) && rangeStartMs > 0
        ? rangeStartMs
        : nextRefreshMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;
      const baseEndMs = Number.isFinite(rangeEndMs)
        ? Math.max(baseStartMs + 60_000, rangeEndMs)
        : nextRefreshMs;
      const filterStartMs = nextSettings.statsDateStart
        ? new Date(nextSettings.statsDateStart).getTime()
        : NaN;
      const filterEndMs = nextSettings.statsDateEnd
        ? new Date(nextSettings.statsDateEnd + "T23:59:59.999").getTime()
        : NaN;
      const phaseStartMs = Number.isFinite(filterStartMs)
        ? Math.max(baseStartMs, filterStartMs)
        : baseStartMs;
      const phaseEndMs = Math.max(
        phaseStartMs + 60_000,
        Number.isFinite(filterEndMs) ? Math.min(baseEndMs, filterEndMs) : baseEndMs
      );
      setStatsRefreshTimelineRangeValue(phaseStartMs, phaseEndMs);
      setStatsRefreshProgressLabel(formatStatsRefreshDateLabel(phaseStartMs));
    } else {
      updateStatsRefreshOverlayMode("idle");
      setStatsRefreshProgress(0);
      setStatsRefreshLoadingDisplayProgress(0);
      setStatsRefreshStatus("Updating Backtest Statistics");
      setStatsRefreshPhasePlan([]);
      setStatsRefreshProgressLabel("");
    }
    setPropResult(null);
    setPropStats(null);
  }, [
    appliedBacktestSettings,
    backtestRunCount,
    clearStatsRefreshResetTimeout,
    setStatsRefreshTimelineRangeValue,
    updateStatsRefreshOverlayMode
  ]);

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
    if (!statsDatePresetDdOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        statsDatePresetDdRef.current &&
        !statsDatePresetDdRef.current.contains(e.target as Node)
      ) {
        setStatsDatePresetDdOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statsDatePresetDdOpen]);

  useEffect(() => {
    if (!modelRunTimeframeDdOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        modelRunTimeframeDdRef.current &&
        !modelRunTimeframeDdRef.current.contains(e.target as Node)
      ) {
        setModelRunTimeframeDdOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelRunTimeframeDdOpen]);

  useEffect(() => {
    if (!modelRunPresetDdOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        modelRunPresetDdRef.current &&
        !modelRunPresetDdRef.current.contains(e.target as Node)
      ) {
        setModelRunPresetDdOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelRunPresetDdOpen]);

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
    statsRefreshStatusRef.current = statsRefreshStatus;
  }, [statsRefreshStatus]);

  useEffect(() => {
    if (statsRefreshOverlayMode !== "loading") {
      return;
    }

    setStatsRefreshPhasePlan((current) => {
      let next = current.length > 0 ? [...current] : [statsRefreshStatus];

      if (statsRefreshStatus === "No Trades In Selected Range") {
        next = next.filter(
          (phase) =>
            phase !== "Finalizing Statistics" &&
            phase !== "Loading AI Libraries" &&
            phase !== "No Trades In Selected Range"
        );
        next.push("No Trades In Selected Range");
        return next;
      }

      if (statsRefreshStatus === "Finalizing Statistics") {
        next = next.filter((phase) => phase !== "No Trades In Selected Range");
      }

      if (!next.includes(statsRefreshStatus)) {
        next.push(statsRefreshStatus);
      }

      return next;
    });
  }, [statsRefreshOverlayMode, statsRefreshStatus]);

  useEffect(() => {
    setStatsRefreshLoadingDisplayProgress(statsRefreshProgress);
  }, [statsRefreshProgress]);

  useEffect(() => {
    if (statsRefreshOverlayMode !== "loading") {
      return;
    }

    if (statsRefreshStatus === "Replaying Backtest Trades") {
      return;
    }

    const durationMs = getStatsRefreshPhaseDurationMs(statsRefreshStatus);
    const statusSnapshot = statsRefreshStatus;
    const startedAt = performance.now();
    const rangeSnapshot = statsRefreshTimelineRangeRef.current;
    const rangeStartMs = Number.isFinite(rangeSnapshot.startMs)
      ? rangeSnapshot.startMs
      : backtestRefreshNowMs - BACKTEST_LOOKBACK_YEARS * 365 * 24 * 60 * 60_000;
    const rangeEndMs = Number.isFinite(rangeSnapshot.endMs)
      ? Math.max(rangeStartMs + 60_000, rangeSnapshot.endMs)
      : backtestRefreshNowMs;
    const spanMs = Math.max(60_000, rangeEndMs - rangeStartMs);
    const autoFinish = isStatsRefreshAutoFinishPhase(statusSnapshot);
    let completed = false;
    let rafId = 0;

    setStatsRefreshProgress(0);
    setStatsRefreshLoadingDisplayProgress(0);
    setStatsRefreshProgressLabel(formatStatsRefreshDateLabel(rangeStartMs));

    const tick = () => {
      if (statsRefreshOverlayModeRef.current !== "loading") {
        return;
      }

      if (statsRefreshStatusRef.current !== statusSnapshot) {
        return;
      }

      const ratio = clamp((performance.now() - startedAt) / durationMs, 0, 1);
      const cursorMs = rangeStartMs + spanMs * ratio;
      setStatsRefreshProgress(ratio * 100);
      setStatsRefreshProgressLabel(formatStatsRefreshDateLabel(cursorMs));

      if (ratio < 1) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      if (autoFinish && !completed) {
        completed = true;
        finishStatsRefreshLoading(formatStatsRefreshDateLabel(rangeEndMs));
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [
    backtestRefreshNowMs,
    finishStatsRefreshLoading,
    statsRefreshOverlayMode,
    statsRefreshStatus
  ]);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);
  const settingsModelProfiles = useMemo(() => {
    const next = [...modelProfiles];
    const seen = new Set(next.map((model) => model.id));

    for (const rawName of settingsModelNames) {
      const name = rawName.trim();

      if (!name) {
        continue;
      }

      const catalogProfile = resolveStrategyRuntimeModelProfile(name);
      const modelId = catalogProfile?.id ?? createModelId(name);

      if (seen.has(modelId)) {
        continue;
      }

      seen.add(modelId);
      next.push(
        catalogProfile
          ? {
              id: catalogProfile.id,
              name: catalogProfile.name,
              kind: "Model",
              modelKind: catalogProfile.modelKind,
              riskMin: catalogProfile.riskMin,
              riskMax: catalogProfile.riskMax,
              rrMin: catalogProfile.rrMin,
              rrMax: catalogProfile.rrMax,
              longBias: catalogProfile.longBias,
              winRate: catalogProfile.winRate
            }
          : createSyntheticModelProfile(name)
      );
    }

    return next;
  }, [modelProfiles, settingsModelNames]);
  const modelProfileById = useMemo(() => {
    return settingsModelProfiles.reduce<Record<string, ModelProfile>>((accumulator, model) => {
      accumulator[model.id] = model;
      return accumulator;
    }, {});
  }, [settingsModelProfiles]);
  const aiDisabled = aiMode === "off";
  const confidenceGateDisabled = aiMode === "off";
  const effectiveConfidenceThreshold = confidenceGateDisabled ? 0 : confidenceThreshold;
  const selectedAiModelCount = useMemo(() => {
    return countEnabledAizipModels(aiModelStates);
  }, [aiModelStates]);
  const appliedSelectedAiModelCount = useMemo(() => {
    return countEnabledAizipModels(appliedBacktestSettings.aiModelStates);
  }, [appliedBacktestSettings.aiModelStates]);
  const selectedAiFeatureCount = useMemo(() => {
    return AI_FEATURE_OPTIONS.filter((feature) => (aiFeatureLevels[feature.id] ?? 0) > 0).length;
  }, [aiFeatureLevels]);
  const configuredAiFeatureDimensionCount = useMemo(() => {
    return countConfiguredAiFeatureDimensions(aiFeatureLevels, aiFeatureModes, chunkBars);
  }, [aiFeatureLevels, aiFeatureModes, chunkBars]);
  const onlineLearningEnabled = useMemo(() => {
    return selectedAiLibraries.some((libraryId) => isOnlineLearningLibraryId(libraryId));
  }, [selectedAiLibraries]);
  const ghostLearningEnabled = useMemo(() => {
    return selectedAiLibraries.some((libraryId) => isGhostLearningLibraryId(libraryId));
  }, [selectedAiLibraries]);
  const canRunAiLibrariesForSnapshot = useCallback(
    (
      libraryIds: readonly string[] | null | undefined,
      settingsSnapshot?: BacktestSettingsSnapshot | null
    ) => {
      return canRunAizipLibrariesForSettings({
        libraryIds,
        aiModelStates: settingsSnapshot?.aiModelStates ?? aiModelStates
      });
    },
    [aiModelStates]
  );
  const aiLibraryReadyToRun = useMemo(() => {
    return canRunAiLibrariesForSnapshot(selectedAiLibraries);
  }, [canRunAiLibrariesForSnapshot, selectedAiLibraries]);
  const appliedAiLibraryReadyToRun = useMemo(() => {
    return canRunAiLibrariesForSnapshot(
      appliedBacktestSettings.selectedAiLibraries ?? [],
      appliedBacktestSettings
    );
  }, [appliedBacktestSettings, canRunAiLibrariesForSnapshot]);
  const appliedAiLibraryRunInputsSignature = useMemo(() => {
    return serializeBacktestSettingsSnapshot(appliedBacktestSettings);
  }, [appliedBacktestSettings]);
  const visibleAiLibraries = useMemo(() => {
    return getVisibleAizipLibraryIds(selectedAiLibraries);
  }, [selectedAiLibraries]);
  const appliedVisibleAiLibraries = useMemo(() => {
    return getVisibleAizipLibraryIds(appliedBacktestSettings.selectedAiLibraries);
  }, [appliedBacktestSettings.selectedAiLibraries]);
  const selectedAiLibraryCount = visibleAiLibraries.length;
  const availableAiLibraries = useMemo(() => {
    return aiLibraryDefs.filter(
      (library) =>
        isVisibleAizipLibraryId(library.id) &&
        !selectedAiLibraries.includes(library.id)
    );
  }, [aiLibraryDefs, selectedAiLibraries]);
  const modelsSurfaceCatalog = useMemo(() => {
    const next = new Map<string, StrategyModelCatalogEntry>();

    for (const model of STRATEGY_MODEL_CATALOG) {
      next.set(model.id, model);
    }

    for (const model of uploadedStrategyModels) {
      next.set(model.id, model);
    }

    return Array.from(next.values());
  }, [uploadedStrategyModels]);
  const uploadedModelIdSet = useMemo(() => {
    return new Set(uploadedStrategyModels.map((model) => model.id));
  }, [uploadedStrategyModels]);
  const modelsSurfaceEntries = useMemo(() => {
    return modelsSurfaceCatalog.map((model) => {
      const backtestSummary =
        buildStrategyBacktestSurfaceSummary(model) ?? buildFallbackModelSurfaceSummary(model);

      return {
        ...model,
        backtestSummary
      };
    });
  }, [modelsSurfaceCatalog]);
  const activeModelRunEntry = useMemo(() => {
    if (!modelRunModalModelId) {
      return null;
    }

    return modelsSurfaceEntries.find((model) => model.id === modelRunModalModelId) ?? null;
  }, [modelRunModalModelId, modelsSurfaceEntries]);

  useEffect(() => {
    if (confidenceGateDisabled && confidenceThreshold !== 0) {
      setConfidenceThreshold(0);
    }
  }, [confidenceGateDisabled, confidenceThreshold]);
  const selectedAiLibrary = useMemo(() => {
    return selectedAiLibraryId ? aiLibraryDefById[selectedAiLibraryId] ?? null : null;
  }, [aiLibraryDefById, selectedAiLibraryId]);
  const selectedBacktestModelNames = useMemo(() => {
    return settingsModelNames.filter((modelName) => (aiModelStates[modelName] ?? 0) > 0);
  }, [aiModelStates, settingsModelNames]);
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
      modelKind: backtestModelProfiles[0]!.modelKind,
      riskMin: aggregate.riskMin / count,
      riskMax: aggregate.riskMax / count,
      rrMin: aggregate.rrMin / count,
      rrMax: aggregate.rrMax / count,
      longBias: aggregate.longBias / count,
      winRate: aggregate.winRate / count
    };
  }, [backtestModelProfiles, backtestModelSelectionSummary]);
  const backtestHasRun = backtestRunCount > 0;
  const liveAiLibraryRunInputsSignature = serializeBacktestSettingsSnapshot(
    liveBacktestSettingsRef.current
  );
  const manualLibraryRunUsesAppliedSnapshot =
    backtestHasRun &&
    liveAiLibraryRunInputsSignature === appliedAiLibraryRunInputsSignature;
  const effectiveAiLibraryReadyToRun = manualLibraryRunUsesAppliedSnapshot
    ? appliedAiLibraryReadyToRun
    : aiLibraryReadyToRun;
  const effectiveAiLibraryRunLibraryIds = manualLibraryRunUsesAppliedSnapshot
    ? appliedBacktestSettings.selectedAiLibraries
    : selectedAiLibraries;
  const effectiveAiLibraryRunSettingsSource = manualLibraryRunUsesAppliedSnapshot
    ? appliedBacktestSettings.selectedAiLibrarySettings
    : selectedAiLibrarySettings;
  const effectiveAiLibraryRunBacktestSettings = manualLibraryRunUsesAppliedSnapshot
    ? appliedBacktestSettings
    : liveBacktestSettingsRef.current;
  const appliedBacktestKey = useMemo(() => {
    return symbolTimeframeKey(appliedBacktestSettings.symbol, appliedBacktestSettings.timeframe);
  }, [appliedBacktestSettings.symbol, appliedBacktestSettings.timeframe]);
  const appliedBacktestOneMinuteKey = useMemo(() => {
    return symbolTimeframeKey(appliedBacktestSettings.symbol, "1m");
  }, [appliedBacktestSettings.symbol]);
  const appliedBacktestSeedCandles = backtestSeriesMap[appliedBacktestKey] ?? EMPTY_CANDLES;
  const appliedBacktestFallbackCandles = seriesMap[appliedBacktestKey] ?? EMPTY_CANDLES;
  const appliedBacktestSeedOneMinuteCandles =
    backtestOneMinuteSeriesMap[appliedBacktestOneMinuteKey] ?? EMPTY_CANDLES;
  const appliedBacktestFallbackOneMinuteCandles =
    seriesMap[appliedBacktestOneMinuteKey] ?? EMPTY_CANDLES;
  appliedBacktestSettingsRef.current = appliedBacktestSettings;
  appliedBacktestSeedCandlesRef.current = appliedBacktestSeedCandles;
  appliedBacktestFallbackCandlesRef.current = appliedBacktestFallbackCandles;
  appliedBacktestSeedOneMinuteCandlesRef.current = appliedBacktestSeedOneMinuteCandles;
  appliedBacktestFallbackOneMinuteCandlesRef.current = appliedBacktestFallbackOneMinuteCandles;
  const appliedBacktestModelNames = useMemo(() => {
    return settingsModelNames.filter(
      (modelName) => (appliedBacktestSettings.aiModelStates[modelName] ?? 0) > 0
    );
  }, [appliedBacktestSettings.aiModelStates, settingsModelNames]);
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
  const appliedAiModelEveryCandleMode = usesAizipEveryCandleMode(
    appliedBacktestSettings.aiMode,
    appliedBacktestSettings.aiFilterEnabled
  );
  const shouldSkipBacktestHistoryFetch = shouldSkipAizipBacktestHistoryFetch({
    antiCheatEnabled: appliedBacktestSettings.antiCheatEnabled,
    selectedModelCount: appliedBacktestModelProfiles.length,
    selectedAiLibraries: appliedBacktestSettings.selectedAiLibraries
  });
  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);
  const isChartSurface = isChartSurfaceTab(selectedSurfaceTab);

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
    if (
      selectedSurfaceTab !== "backtest" &&
      selectedSurfaceTab !== "settings" &&
      selectedSurfaceTab !== "models"
    ) {
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

      for (const libraryId of BASE_SEEDING_LIBRARY_IDS) {
        const currentSettings = next[libraryId];
        if (!currentSettings || currentSettings.jumpToResolution !== true) {
          continue;
        }

        next[libraryId] = {
          ...currentSettings,
          jumpToResolution: false
        };
        changed = true;
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
      const nextVisible = getVisibleAizipLibraryIds(next);
      setSelectedAiLibraryId((selectedId) =>
        selectedId !== libraryId ? selectedId : nextVisible[0] ?? ""
      );
      return next;
    });
  };

  const toggleOnlineLearning = useCallback(() => {
    setSelectedAiLibraries((current) => {
      const hasCore = current.some((libraryId) => isOnlineLearningLibraryId(libraryId));
      if (hasCore) {
        return current.filter((id) => !isOnlineLearningLibraryId(id));
      }
      const filtered = current.filter((id) => !isOnlineLearningLibraryId(id));
      return ["core", ...filtered];
    });
  }, []);

  const toggleGhostLearning = useCallback(() => {
    setSelectedAiLibraries((current) => {
      const hasGhost = current.some((libraryId) => isGhostLearningLibraryId(libraryId));
      if (hasGhost) {
        return current.filter((id) => !isGhostLearningLibraryId(id));
      }

      const withoutGhost = current.filter((id) => !isGhostLearningLibraryId(id));
      const coreIndex = withoutGhost.findIndex((id) => isOnlineLearningLibraryId(id));

      if (coreIndex >= 0) {
        const next = [...withoutGhost];
        next.splice(coreIndex + 1, 0, "suppressed");
        return next;
      }

      return ["suppressed", ...withoutGhost];
    });
  }, []);

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
      if (current[nextIndex] === "core") {
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

      return filtered;
    });
  }, [aiLibraryDefById]);

  useEffect(() => {
    if (visibleAiLibraries.length === 0) {
      if (selectedAiLibraryId !== "") {
        setSelectedAiLibraryId("");
      }

      return;
    }

    if (!visibleAiLibraries.includes(selectedAiLibraryId)) {
      setSelectedAiLibraryId(visibleAiLibraries[0] ?? "");
    }
  }, [selectedAiLibraryId, visibleAiLibraries]);

  useEffect(() => {
    setHoveredTime(null);
  }, [selectedTimeframe]);

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | null = null;
    let liveSyncInterval = 0;
    let streamReadyTimeoutId = 0;
    const key = selectedKey;
    const historyLimit = chartHistoryCountByTimeframe[selectedTimeframe];
    const candleDurationMs = Math.max(60_000, timeframeMinutes[selectedTimeframe] * 60_000);
    const aggressorWindowMs = Math.max(60_000, timeframeMinutes[selectedTimeframe] * 60_000);
    const aggressorHalfLifeMs = Math.max(45_000, candleDurationMs * AGGRESSOR_HALF_LIFE_BARS);
    const aggressorDecayLambda = Math.log(2) / aggressorHalfLifeMs;
    const aggressorTrainingPeriodMs = Math.max(
      AGGRESSOR_MIN_TRAINING_PERIOD_MS,
      candleDurationMs * AGGRESSOR_TRAINING_BARS
    );
    const recentOneMinutePromise = fetchRecentOneMinuteCandles();
    const keyWasReady = Boolean(chartHistoryReadyByKeyRef.current[key]);

    if (!keyWasReady) {
      chartResetAfterLoadKeyRef.current = key;
    }

    setChartHistoryLoadingKey(keyWasReady ? null : key);
    aggressorPressurePointsRef.current = [];
    aggressorTrainingPeaksRef.current = [];
    aggressorPressureStateRef.current = {
      lastMid: Number.NaN,
      lastUiUpdateMs: 0,
      peakPressure: 1,
      lastTickMs: 0
    };
    liveQuoteStateRef.current = {
      bid: Number.NaN,
      ask: Number.NaN
    };
    volumeNowcastStateRef.current = {
      candleStartMs: 0,
      lastEventMs: 0,
      lastMid: Number.NaN,
      tickCount: 0,
      absMidMove: 0,
      spreadSum: 0,
      spreadCount: 0,
      lastUiUpdateMs: 0,
      lastEstimatedFinalVolume: 0,
      lastProgressRatio: 0
    };
    volumeNowcastCalibrationRef.current = {
      multiplier: 1,
      sampleCount: 0,
      pendingByCandleStart: new Map<number, number>()
    };
    setLiveQuote({
      bid: null,
      ask: null,
      spread: null,
      bidTone: "neutral",
      askTone: "neutral",
      updatedAtMs: 0
    });
    setVolumeNowcast({
      estimatedCurrentVolume: 0,
      estimatedFinalVolume: 0,
      baselineVolume: 0,
      progressRatio: 0,
      confidence: 0,
      tickCount: 0,
      updatedAtMs: 0
    });
    overlayCatchupSeedKeyRef.current = "";

    const connect = async () => {
      let hasInitialSeed = false;
      let historyResolved = false;
      let liveSyncResolved = true;
      let streamResolved = false;

      const resolveChartInitialLoad = () => {
        if (cancelled) {
          return;
        }

        if (!historyResolved || !liveSyncResolved || !streamResolved) {
          return;
        }

        if (hasInitialSeed) {
          chartHistoryReadyByKeyRef.current[key] = true;
        }

        setChartHistoryLoadingKey((current) => (current === key ? null : current));
      };

      try {
        const historicalCandles = await fetchHistoryCandles(selectedTimeframe, recentOneMinutePromise);

        if (!cancelled && historicalCandles.length > 0) {
          hasInitialSeed = true;
          setSeriesMap((prev) => ({
            ...prev,
            [key]: historicalCandles
          }));
        }
      } catch {
        // Keep the last real candle state if historical loading is unavailable.
      } finally {
        historyResolved = true;
        resolveChartInitialLoad();
      }

      const syncLiveCandlesFromMarket = async () => {
        try {
          const liveCandles = await fetchMarketCandles(selectedTimeframe, LIVE_MARKET_SYNC_LIMIT);

          if (cancelled || liveCandles.length === 0) {
            return;
          }

          hasInitialSeed = true;
          setSeriesMap((prev) => ({
            ...prev,
            [key]: (() => {
              const current = prev[key] ?? [];
              const merged = mergeRecentCandles(current, liveCandles, historyLimit, selectedTimeframe);
              const currentLastTime = current[current.length - 1]?.time ?? Number.NEGATIVE_INFINITY;
              const mergedLastTime = merged[merged.length - 1]?.time ?? Number.NEGATIVE_INFINITY;
              return mergedLastTime < currentLastTime ? current : merged;
            })()
          }));
        } catch {
          // Tick updates can continue even if the live candle window refresh fails.
        }
      };

      resolveChartInitialLoad();
      void syncLiveCandlesFromMarket();

      if (cancelled) {
        return;
      }

      liveSyncInterval = window.setInterval(() => {
        void syncLiveCandlesFromMarket();
      }, 8000);

      const resolveStream = () => {
        if (streamResolved) {
          return;
        }

        streamResolved = true;
        resolveChartInitialLoad();
      };

      streamReadyTimeoutId = window.setTimeout(resolveStream, CHART_STREAM_CONNECT_TIMEOUT_MS);

      try {
        stream = new EventSource(
          `${PRICE_STREAM_URL}?${new URLSearchParams({
            pairs: XAUUSD_PAIR
          }).toString()}`
        );
      } catch {
        resolveStream();
        return;
      }

      streamRef.current = stream;

      stream.onopen = () => {
        resolveStream();
      };

      stream.onerror = () => {
        resolveStream();
      };

      stream.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if ((message.pair || "").toUpperCase() !== XAUUSD_PAIR) {
            return;
          }

          const bid = Number(message.bid);
          const ask = Number(message.ask);
          const price = Number(message.mid);
          const eventTime = Date.parse(String(message.time));

          if (!Number.isFinite(price) || !Number.isFinite(eventTime)) {
            return;
          }

          const hasBid = Number.isFinite(bid);
          const hasAsk = Number.isFinite(ask);
          const spread = hasBid && hasAsk ? Math.max(0, ask - bid) : null;
          const quoteState = liveQuoteStateRef.current;
          const askTone: TickDirectionTone =
            hasAsk && Number.isFinite(quoteState.ask)
              ? ask > quoteState.ask
                ? "up"
                : ask < quoteState.ask
                  ? "down"
                  : "neutral"
              : "neutral";
          const bidTone: TickDirectionTone =
            hasBid && Number.isFinite(quoteState.bid)
              ? bid > quoteState.bid
                ? "up"
                : bid < quoteState.bid
                  ? "down"
                  : "neutral"
              : "neutral";

          if (hasAsk) {
            quoteState.ask = ask;
          }

          if (hasBid) {
            quoteState.bid = bid;
          }

          setLiveQuote({
            bid: hasBid ? bid : null,
            ask: hasAsk ? ask : null,
            spread,
            bidTone,
            askTone,
            updatedAtMs: eventTime
          });

          const nowcastState = volumeNowcastStateRef.current;
          if (eventTime >= nowcastState.lastEventMs) {
            const candleStartMs = floorToTimeframe(eventTime, selectedTimeframe);
            const calibrationState = volumeNowcastCalibrationRef.current;
            if (nowcastState.candleStartMs !== candleStartMs) {
              if (
                nowcastState.candleStartMs > 0 &&
                nowcastState.lastEstimatedFinalVolume > 0 &&
                nowcastState.lastProgressRatio >= 0.35
              ) {
                calibrationState.pendingByCandleStart.set(
                  nowcastState.candleStartMs,
                  nowcastState.lastEstimatedFinalVolume
                );
                if (calibrationState.pendingByCandleStart.size > VOLUME_NOWCAST_CALIBRATION_PENDING_LIMIT) {
                  const oldestKey = calibrationState.pendingByCandleStart.keys().next().value as
                    | number
                    | undefined;
                  if (oldestKey != null) {
                    calibrationState.pendingByCandleStart.delete(oldestKey);
                  }
                }
              }

              nowcastState.candleStartMs = candleStartMs;
              nowcastState.lastMid = price;
              nowcastState.tickCount = 0;
              nowcastState.absMidMove = 0;
              nowcastState.spreadSum = 0;
              nowcastState.spreadCount = 0;
            }

            const deltaMid = Number.isFinite(nowcastState.lastMid) ? price - nowcastState.lastMid : 0;
            nowcastState.lastMid = price;
            nowcastState.lastEventMs = eventTime;
            nowcastState.tickCount += 1;
            nowcastState.absMidMove += Math.abs(deltaMid);

            if (spread != null && Number.isFinite(spread) && spread > 0) {
              nowcastState.spreadSum += spread;
              nowcastState.spreadCount += 1;
            }

            const elapsedMs = Math.max(0, eventTime - candleStartMs);
            const progressRatio = clamp(elapsedMs / candleDurationMs, 0.0001, 1);
            const progressSafe = Math.max(progressRatio, 0.12);
            const baselineProfile = volumeBaselineRef.current;
            const baselineVolumeRaw = resolveVolumeBaselineForTimestamp(
              candleStartMs,
              selectedTimeframe,
              baselineProfile
            );
            const baselineVolumeFallback = Math.max(20, nowcastState.tickCount / progressSafe);
            const baselineVolume =
              Number.isFinite(baselineVolumeRaw) && baselineVolumeRaw > 0
                ? baselineVolumeRaw
                : baselineVolumeFallback;
            const latestChartCandles = selectedChartCandlesRef.current;
            if (calibrationState.pendingByCandleStart.size > 0 && latestChartCandles.length > 0) {
              const recentVolumeByStart = new Map<number, number>();
              const scanStart = Math.max(0, latestChartCandles.length - 120);
              for (let index = scanStart; index < latestChartCandles.length; index += 1) {
                const candle = latestChartCandles[index];
                const candleVolume = Number(candle?.volume);
                if (Number.isFinite(candleVolume) && candleVolume > 0) {
                  recentVolumeByStart.set(candle.time, candleVolume);
                }
              }

              for (const [pendingStartMs, pendingForecast] of Array.from(
                calibrationState.pendingByCandleStart.entries()
              )) {
                if (pendingStartMs >= candleStartMs) {
                  continue;
                }

                const actualClosedVolume = recentVolumeByStart.get(pendingStartMs);
                if (
                  typeof actualClosedVolume !== "number" ||
                  !Number.isFinite(actualClosedVolume) ||
                  actualClosedVolume <= 0
                ) {
                  continue;
                }

                const measuredRatio = clamp(actualClosedVolume / Math.max(1, pendingForecast), 0.75, 1.2);
                const alpha = calibrationState.sampleCount < 6 ? 0.22 : 0.12;
                calibrationState.multiplier = clamp(
                  calibrationState.multiplier * (1 - alpha) + measuredRatio * alpha,
                  0.82,
                  1.06
                );
                calibrationState.sampleCount += 1;
                calibrationState.pendingByCandleStart.delete(pendingStartMs);
              }
            }
            const calibrationStrength = Math.min(
              1,
              calibrationState.sampleCount / VOLUME_NOWCAST_CALIBRATION_FULL_SAMPLES
            );
            const calibrationMultiplier =
              1 + (calibrationState.multiplier - 1) * calibrationStrength;
            const latestCandle = latestChartCandles[latestChartCandles.length - 1];
            const previousCandle = latestChartCandles[latestChartCandles.length - 2];
            const currentCandleVolume = Number(
              latestCandle?.time === candleStartMs ? latestCandle?.volume : Number.NaN
            );
            const hasObservedCurrentVolume =
              Number.isFinite(currentCandleVolume) && currentCandleVolume > 0;
            const observedCurrentVolume =
              hasObservedCurrentVolume ? currentCandleVolume : 0;
            const projectedObservedFinalVolume =
              observedCurrentVolume > 0 ? observedCurrentVolume / progressSafe : Number.NaN;
            const previousCandleVolume = Number(previousCandle?.volume);
            const recentVolumeBias =
              Number.isFinite(previousCandleVolume) && previousCandleVolume > 0
                ? clamp(previousCandleVolume / Math.max(1, baselineVolume), 0.85, 1.9)
                : 1;

            const avgSpreadNow =
              nowcastState.spreadCount > 0
                ? nowcastState.spreadSum / nowcastState.spreadCount
                : Math.max(price * 0.00002, 0.01);
            const normalizedMove = nowcastState.absMidMove / Math.max(avgSpreadNow, 0.000001);
            const projectedMove = normalizedMove / Math.max(progressSafe, 0.2);
            const tickLift = clamp(nowcastState.tickCount / Math.max(4, progressSafe * 18), 0, 1.2);
            const moveLift = clamp(projectedMove / 18, 0, 1.25);
            const flowMultiplier = 1 + tickLift * 0.18 + moveLift * 0.12;
            const baselineProjectedFinal = baselineVolume * recentVolumeBias * flowMultiplier;
            const estimatedFinalVolumeRaw = Math.max(
              baselineProjectedFinal,
              Number.isFinite(projectedObservedFinalVolume)
                ? projectedObservedFinalVolume * (0.985 + progressRatio * 0.015)
                : 0
            );
            const estimatedFinalVolume = Math.max(
              estimatedFinalVolumeRaw * calibrationMultiplier,
              observedCurrentVolume
            );
            const progressCurve = Math.pow(progressRatio, 0.98);
            const estimatedCurrentVolume = hasObservedCurrentVolume
              ? observedCurrentVolume
              : estimatedFinalVolume * progressCurve;
            nowcastState.lastEstimatedFinalVolume = estimatedFinalVolume;
            nowcastState.lastProgressRatio = progressRatio;
            const confidence = clamp(progressRatio * 0.55 + Math.min(1, nowcastState.tickCount / 25) * 0.45, 0, 1);

            if (
              nowcastState.lastUiUpdateMs === 0 ||
              eventTime - nowcastState.lastUiUpdateMs >= AGGRESSOR_PRESSURE_UI_THROTTLE_MS
            ) {
              setVolumeNowcast({
                estimatedCurrentVolume,
                estimatedFinalVolume,
                baselineVolume,
                progressRatio,
                confidence,
                tickCount: nowcastState.tickCount,
                updatedAtMs: eventTime
              });
              nowcastState.lastUiUpdateMs = eventTime;
            }
          }

          const pressureState = aggressorPressureStateRef.current;
          const pressurePoints = aggressorPressurePointsRef.current;
          const trainingPeaks = aggressorTrainingPeaksRef.current;

          if (eventTime >= pressureState.lastTickMs) {
            const spreadValue = spread ?? Number.NaN;
            const safeSpread =
              Number.isFinite(spreadValue) && spreadValue > 0
                ? spreadValue
                : Math.max(price * 0.00002, 0.01);

            if (Number.isFinite(pressureState.lastMid)) {
              const delta = price - pressureState.lastMid;
              const absDelta = Math.abs(delta);

              if (absDelta > 0) {
                const directionalPressure = absDelta / Math.max(safeSpread, 0.000001);
                pressurePoints.push({
                  timestampMs: eventTime,
                  buyPressure: delta > 0 ? directionalPressure : 0,
                  sellPressure: delta < 0 ? directionalPressure : 0,
                  spread: Number.isFinite(spreadValue) ? spreadValue : 0
                });
              }
            }

            pressureState.lastMid = price;
            pressureState.lastTickMs = eventTime;

            const cutoffMs = eventTime - aggressorWindowMs;
            while (pressurePoints.length > 0 && pressurePoints[0]!.timestampMs < cutoffMs) {
              pressurePoints.shift();
            }

            let buyPressure = 0;
            let sellPressure = 0;
            let spreadSum = 0;
            let spreadCount = 0;

            for (const point of pressurePoints) {
              const ageMs = Math.max(0, eventTime - point.timestampMs);
              const weight = Math.exp(-aggressorDecayLambda * ageMs);
              buyPressure += point.buyPressure * weight;
              sellPressure += point.sellPressure * weight;

              if (point.spread > 0) {
                spreadSum += point.spread;
                spreadCount += 1;
              }
            }

            const currentSidePeak = Math.max(buyPressure, sellPressure, 1);
            trainingPeaks.push({
              timestampMs: eventTime,
              peak: currentSidePeak
            });

            const trainingCutoffMs = eventTime - aggressorTrainingPeriodMs;
            while (trainingPeaks.length > 0 && trainingPeaks[0]!.timestampMs < trainingCutoffMs) {
              trainingPeaks.shift();
            }

            let trainingPeak = 1;
            for (const entry of trainingPeaks) {
              if (entry.peak > trainingPeak) {
                trainingPeak = entry.peak;
              }
            }
            pressureState.peakPressure = trainingPeak;

            if (
              pressureState.lastUiUpdateMs === 0 ||
              eventTime - pressureState.lastUiUpdateMs >= AGGRESSOR_PRESSURE_UI_THROTTLE_MS
            ) {
              setAggressorPressure({
                buyPressure,
                sellPressure,
                scaleCeiling: pressureState.peakPressure,
                averageSpread: spreadCount > 0 ? spreadSum / spreadCount : 0,
                tickCount: pressurePoints.length,
                updatedAtMs: eventTime
              });
              pressureState.lastUiUpdateMs = eventTime;
            }
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

      if (streamReadyTimeoutId) {
        window.clearTimeout(streamReadyTimeoutId);
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

    const key = appliedBacktestKey;
    const oneMinuteKey = appliedBacktestOneMinuteKey;

    if (backtestHistorySeedReady) {
      return;
    }

    let cancelled = false;
    const isAlreadyOneMinute = appliedBacktestSettings.timeframe === "1m";
    const shouldLoadOneMinutePrecision =
      appliedBacktestSettings.minutePreciseEnabled && !isAlreadyOneMinute;
    const existingCandles = pickLongestCandleSeries(
      appliedBacktestSeedCandlesRef.current,
      appliedBacktestFallbackCandlesRef.current
    );
    const existingOneMinute = shouldLoadOneMinutePrecision
      ? pickLongestCandleSeries(
          appliedBacktestSeedOneMinuteCandlesRef.current,
          appliedBacktestFallbackOneMinuteCandlesRef.current
        )
      : EMPTY_CANDLES;
    const recentOneMinutePromise = shouldLoadOneMinutePrecision
      ? fetchRecentOneMinuteCandles(undefined, BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS)
      : undefined;
    const minimumReplaySeedBars = getMinimumAizipSeedBars(appliedBacktestSettings.chunkBars);
    const leadingBars = Math.max(
      appliedBacktestSettings.chunkBars * 3,
      appliedBacktestSettings.maxBarsInTrade + 24
    );
    const targetBars = estimateHistoryBarsForDateRange(
      appliedBacktestSettings.statsDateStart,
      appliedBacktestSettings.statsDateEnd,
      appliedBacktestSettings.timeframe,
      leadingBars
    );
    const oneMinutePaddingBars = Math.max(
      leadingBars,
      Math.round(leadingBars * (timeframeMinutes[appliedBacktestSettings.timeframe] ?? 1))
    );
    const oneMinuteTargetBars = shouldLoadOneMinutePrecision
      ? estimateHistoryBarsForDateRange(
          appliedBacktestSettings.statsDateStart,
          appliedBacktestSettings.statsDateEnd,
          "1m",
          oneMinutePaddingBars
        )
      : 0;
    const hasDateRange = Boolean(
      appliedBacktestSettings.statsDateStart && appliedBacktestSettings.statsDateEnd
    );
    const historyRequestWindow = hasDateRange
      ? buildHistoryApiRequestWindow({
          timeframe: appliedBacktestSettings.timeframe,
          startYmd: appliedBacktestSettings.statsDateStart,
          endYmd: appliedBacktestSettings.statsDateEnd,
          leadingBars
        })
      : null;
    const oneMinuteHistoryRequestWindow =
      shouldLoadOneMinutePrecision && hasDateRange
        ? buildHistoryApiRequestWindow({
            timeframe: "1m",
            startYmd: appliedBacktestSettings.statsDateStart,
            endYmd: appliedBacktestSettings.statsDateEnd,
            leadingBars: oneMinutePaddingBars
          })
        : null;
    // A requested historical date range should not silently degrade to a recent fragment.
    const allowOneMinuteFallback = !hasDateRange;
    const needsHistory =
      existingCandles.length < MIN_SEED_CANDLES ||
      existingCandles.length < targetBars ||
      (hasDateRange &&
        !candlesCoverDateRange(
          existingCandles,
          appliedBacktestSettings.timeframe,
          appliedBacktestSettings.statsDateStart,
          appliedBacktestSettings.statsDateEnd,
          leadingBars
        ));
    const needsOneMinute =
      shouldLoadOneMinutePrecision &&
      (existingOneMinute.length < MIN_SEED_CANDLES ||
        existingOneMinute.length < oneMinuteTargetBars);

    if (!needsHistory && !needsOneMinute) {
      if ((backtestSeriesMapRef.current[key]?.length ?? 0) < existingCandles.length) {
        setBacktestSeriesMap((prev) => ({
          ...prev,
          [key]: existingCandles
        }));
      }
      if (
        shouldLoadOneMinutePrecision &&
        existingOneMinute.length > 0 &&
        (backtestOneMinuteSeriesMapRef.current[oneMinuteKey]?.length ?? 0) < existingOneMinute.length
      ) {
        setBacktestOneMinuteSeriesMap((prev) => ({
          ...prev,
          [oneMinuteKey]: existingOneMinute
        }));
      }
      setStatsRefreshStatus("Preparing Backtest Replay");
      setBacktestHistorySeedReady(true);
      return;
    }

    setStatsRefreshStatus("Loading Candle History");

    void (async () => {
      let resolvedReplaySeedCandles = existingCandles;

      try {
        const promises: [Promise<Candle[]>, Promise<Candle[]>] = [
          needsHistory
            ? fetchBacktestHistoryCandles(
                appliedBacktestSettings.timeframe,
                targetBars,
                recentOneMinutePromise,
                allowOneMinuteFallback,
                BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS,
                hasDateRange
                  ? {
                      requestWindow: historyRequestWindow ?? undefined,
                      coverageWindow: {
                        startYmd: appliedBacktestSettings.statsDateStart,
                        endYmd: appliedBacktestSettings.statsDateEnd,
                        leadingBars,
                        strictCoverage: true
                      }
                    }
                  : undefined
              )
            : Promise.resolve(existingCandles),
          shouldLoadOneMinutePrecision
            ? needsOneMinute
              ? fetchBacktestHistoryCandles(
                  "1m",
                  oneMinuteTargetBars,
                  recentOneMinutePromise,
                  true,
                  BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS,
                  hasDateRange
                    ? {
                        requestWindow: oneMinuteHistoryRequestWindow ?? undefined,
                        coverageWindow: {
                          startYmd: appliedBacktestSettings.statsDateStart,
                          endYmd: appliedBacktestSettings.statsDateEnd,
                          leadingBars: oneMinutePaddingBars,
                          strictCoverage: false
                        }
                      }
                    : undefined
                ).catch(() => [])
              : Promise.resolve(existingOneMinute)
            : Promise.resolve([])
        ];

        const [deepHistoryCandles, oneMinuteCandles] = await Promise.all(promises);
        let replaySeedCandles = pickLongestCandleSeries(
          deepHistoryCandles,
          existingCandles
        );

        if (replaySeedCandles.length < MIN_SEED_CANDLES) {
          replaySeedCandles = pickLongestCandleSeries(
            replaySeedCandles,
            appliedBacktestFallbackCandlesRef.current
          );
        }
        resolvedReplaySeedCandles = replaySeedCandles;

        if (!cancelled && hasUsableAizipSeedCandles(replaySeedCandles, minimumReplaySeedBars)) {
          setBacktestSeriesMap((prev) => ({
            ...prev,
            [key]: replaySeedCandles
          }));
        }

        const resolvedOneMinute = pickLongestCandleSeries(
          oneMinuteCandles,
          existingOneMinute
        );

        if (!cancelled && shouldLoadOneMinutePrecision && resolvedOneMinute.length > 0) {
          setBacktestOneMinuteSeriesMap((prev) => ({
            ...prev,
            [oneMinuteKey]: resolvedOneMinute
          }));
        }
      } catch {
        // Backtest falls back to chart history if deep history cannot load.
        if (!cancelled) {
          let fallbackCandles = pickLongestCandleSeries(
            appliedBacktestFallbackCandlesRef.current,
            existingCandles
          );
          if (
            hasDateRange &&
            !candlesCoverDateRange(
              fallbackCandles,
              appliedBacktestSettings.timeframe,
              appliedBacktestSettings.statsDateStart,
              appliedBacktestSettings.statsDateEnd,
              leadingBars
            )
          ) {
            fallbackCandles = EMPTY_CANDLES;
          }
          resolvedReplaySeedCandles = fallbackCandles;
          if (hasUsableAizipSeedCandles(fallbackCandles, minimumReplaySeedBars)) {
            setBacktestSeriesMap((prev) => ({
              ...prev,
              [key]: fallbackCandles
            }));
          }
        }
      } finally {
        if (!cancelled) {
          const hasCoveredReplaySeedCandles =
            hasUsableAizipSeedCandles(resolvedReplaySeedCandles, minimumReplaySeedBars) &&
            (!hasDateRange ||
              candlesCoverDateRange(
                resolvedReplaySeedCandles,
                appliedBacktestSettings.timeframe,
                appliedBacktestSettings.statsDateStart,
                appliedBacktestSettings.statsDateEnd,
                leadingBars
              ));
          if (hasCoveredReplaySeedCandles) {
            setStatsRefreshStatus("Preparing Backtest Replay");
            setBacktestHistorySeedReady(true);
          } else {
            setStatsRefreshStatus(
              hasDateRange
                ? "Historical Candle Range Unavailable"
                : "Loading Candle History"
            );
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appliedBacktestKey,
    appliedBacktestSettings.chunkBars,
    appliedBacktestSettings.maxBarsInTrade,
    appliedBacktestSettings.minutePreciseEnabled,
    appliedBacktestSettings.statsDateEnd,
    appliedBacktestSettings.statsDateStart,
    appliedBacktestSettings.symbol,
    appliedBacktestSettings.timeframe,
    appliedBacktestFallbackCandles.length,
    appliedBacktestFallbackOneMinuteCandles.length,
    backtestHasRun,
    backtestHistorySeedReady,
    backtestRefreshNowMs,
    backtestRunCount,
    appliedBacktestOneMinuteKey,
    appliedBacktestSeedCandles.length,
    appliedBacktestSeedOneMinuteCandles.length,
    shouldSkipBacktestHistoryFetch
  ]);

  const selectedCandles = useMemo(() => {
    return seriesMap[selectedKey] ?? EMPTY_CANDLES;
  }, [selectedKey, seriesMap]);
  const volumeBaselineProfile = useMemo(() => {
    return buildVolumeBaselineProfile(selectedCandles, selectedTimeframe);
  }, [selectedCandles, selectedTimeframe]);

  useEffect(() => {
    volumeBaselineRef.current = volumeBaselineProfile;
  }, [volumeBaselineProfile]);

  useEffect(() => {
    const seedKey = `${selectedKey}__${selectedTimeframe}`;
    if (overlayCatchupSeedKeyRef.current === seedKey) {
      return;
    }

    if (selectedCandles.length === 0) {
      return;
    }

    const nowMs = Date.now();
    const candleDurationMs = Math.max(60_000, timeframeMinutes[selectedTimeframe] * 60_000);
    const aggressorWindowMs = candleDurationMs;
    const aggressorHalfLifeMs = Math.max(45_000, candleDurationMs * AGGRESSOR_HALF_LIFE_BARS);
    const aggressorDecayLambda = Math.log(2) / aggressorHalfLifeMs;
    const aggressorTrainingPeriodMs = Math.max(
      AGGRESSOR_MIN_TRAINING_PERIOD_MS,
      candleDurationMs * AGGRESSOR_TRAINING_BARS
    );
    const trainingCutoffMs = nowMs - aggressorTrainingPeriodMs;
    const windowCutoffMs = nowMs - aggressorWindowMs;

    const seededPoints: AggressorPressurePoint[] = [];
    const seededTrainingPeaks: AggressorTrainingPeak[] = [];

    for (const candle of selectedCandles) {
      const candleEndMs = candle.time + candleDurationMs;
      if (candleEndMs < trainingCutoffMs) {
        continue;
      }

      const volume = Number(candle.volume);
      const range = Math.max(
        0.000001,
        candle.high - candle.low,
        Math.abs(candle.close - candle.open),
        Math.abs(candle.close) * 0.00001
      );
      const closePos = clamp((candle.close - candle.low) / range, 0, 1);
      const fallbackActivity = Math.max(1, Math.abs(candle.close - candle.open) / range * 32);
      const activity = Number.isFinite(volume) && volume > 0 ? volume : fallbackActivity;
      const buyPressure = activity * closePos;
      const sellPressure = activity * (1 - closePos);

      seededTrainingPeaks.push({
        timestampMs: candleEndMs,
        peak: Math.max(buyPressure, sellPressure, 1)
      });

      if (candleEndMs >= windowCutoffMs) {
        seededPoints.push({
          timestampMs: candleEndMs,
          buyPressure,
          sellPressure,
          spread: 0
        });
      }
    }

    let seededBuyPressure = 0;
    let seededSellPressure = 0;
    for (const point of seededPoints) {
      const ageMs = Math.max(0, nowMs - point.timestampMs);
      const weight = Math.exp(-aggressorDecayLambda * ageMs);
      seededBuyPressure += point.buyPressure * weight;
      seededSellPressure += point.sellPressure * weight;
    }

    let trainingPeak = 1;
    for (const row of seededTrainingPeaks) {
      if (row.peak > trainingPeak) {
        trainingPeak = row.peak;
      }
    }

    aggressorPressurePointsRef.current = seededPoints;
    aggressorTrainingPeaksRef.current = seededTrainingPeaks;
    aggressorPressureStateRef.current = {
      ...aggressorPressureStateRef.current,
      peakPressure: trainingPeak
    };

    setAggressorPressure((current) => ({
      ...current,
      buyPressure: seededBuyPressure,
      sellPressure: seededSellPressure,
      scaleCeiling: trainingPeak,
      averageSpread: 0,
      tickCount: seededPoints.length,
      updatedAtMs: nowMs
    }));

    const candleStartMs = floorToTimeframe(nowMs, selectedTimeframe);
    const baselineVolumeRaw = resolveVolumeBaselineForTimestamp(
      candleStartMs,
      selectedTimeframe,
      volumeBaselineProfile
    );
    const baselineVolume = Number.isFinite(baselineVolumeRaw) && baselineVolumeRaw > 0 ? baselineVolumeRaw : 20;
    const progressRatio = clamp((nowMs - candleStartMs) / candleDurationMs, 0.0001, 1);
    const progressSafe = Math.max(progressRatio, 0.12);
    const currentCandleVolume = Number(
      selectedCandles[selectedCandles.length - 1]?.time === candleStartMs
        ? selectedCandles[selectedCandles.length - 1]?.volume
        : Number.NaN
    );
    const previousCandleVolume = Number(selectedCandles[selectedCandles.length - 2]?.volume);
    const recentVolumeBias =
      Number.isFinite(previousCandleVolume) && previousCandleVolume > 0
        ? clamp(previousCandleVolume / Math.max(1, baselineVolume), 0.85, 1.9)
        : 1;
    const estimatedCurrentVolumeBase =
      Number.isFinite(currentCandleVolume) && currentCandleVolume > 0
        ? currentCandleVolume
        : baselineVolume * recentVolumeBias * Math.pow(progressRatio, 0.98);
    const projectedObservedFinalVolume =
      Number.isFinite(currentCandleVolume) && currentCandleVolume > 0
        ? currentCandleVolume / progressSafe
        : Number.NaN;
    const calibrationState = volumeNowcastCalibrationRef.current;
    const calibrationStrength = Math.min(
      1,
      calibrationState.sampleCount / VOLUME_NOWCAST_CALIBRATION_FULL_SAMPLES
    );
    const calibrationMultiplier =
      1 + (calibrationState.multiplier - 1) * calibrationStrength;
    const estimatedFinalVolumeRaw = Math.max(
      baselineVolume * recentVolumeBias,
      estimatedCurrentVolumeBase / progressSafe,
      Number.isFinite(projectedObservedFinalVolume)
        ? projectedObservedFinalVolume * (0.985 + progressRatio * 0.015)
        : 0
    );
    const hasObservedCurrentVolume =
      Number.isFinite(currentCandleVolume) && currentCandleVolume > 0;
    const observedCurrentVolume = hasObservedCurrentVolume ? currentCandleVolume : 0;
    const estimatedFinalVolume = Math.max(
      estimatedFinalVolumeRaw * calibrationMultiplier,
      observedCurrentVolume
    );
    const estimatedCurrentVolume = hasObservedCurrentVolume
      ? observedCurrentVolume
      : Math.min(estimatedCurrentVolumeBase, estimatedFinalVolume);
    const estimatedTickCount = Math.max(1, Math.round(estimatedCurrentVolume));
    const confidence = clamp(
      progressRatio * 0.55 + Math.min(1, estimatedTickCount / 25) * 0.45,
      0,
      1
    );

    volumeNowcastStateRef.current = {
      candleStartMs,
      lastEventMs: nowMs,
      lastMid: selectedCandles[selectedCandles.length - 1]?.close ?? Number.NaN,
      tickCount: estimatedTickCount,
      absMidMove: 0,
      spreadSum: 0,
      spreadCount: 0,
      lastUiUpdateMs: nowMs,
      lastEstimatedFinalVolume: estimatedFinalVolume,
      lastProgressRatio: progressRatio
    };

    setVolumeNowcast({
      estimatedCurrentVolume,
      estimatedFinalVolume,
      baselineVolume,
      progressRatio,
      confidence,
      tickCount: estimatedTickCount,
      updatedAtMs: nowMs
    });

    overlayCatchupSeedKeyRef.current = seedKey;
  }, [selectedCandles, selectedKey, selectedTimeframe, volumeBaselineProfile]);

  const isChartDataLoading = isChartSurface && chartHistoryLoadingKey === selectedKey;

  const selectedBacktestCandles = useMemo(() => {
    return pickLongestCandleSeries(
      backtestSeriesMap[appliedBacktestKey],
      seriesMap[appliedBacktestKey]
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
        ? Math.max(1, selectedBacktestCandles.length - 1)
        : Math.min(BACKTEST_MAX_HISTORY_CANDLES, estimatedSlots);

    // In replay mode we cap by available bars, not synthetic density targets.
    return Math.max(appliedBacktestModelProfiles.length, availableSlots);
  }, [
    appliedBacktestModelProfiles.length,
    appliedBacktestSettings.timeframe,
    backtestHasRun,
    backtestHistorySeedReady,
    backtestBlueprintRange,
    selectedBacktestCandles.length
  ]);

  const deterministicTradeBlueprints = useMemo(() => {
    if (!backtestHasRun || !backtestHistorySeedReady || appliedBacktestModelProfiles.length === 0) {
      return [] as TradeBlueprint[];
    }

    const candles = selectedBacktestCandles;
    if (candles.length < 3) {
      return [] as TradeBlueprint[];
    }

    const unitsPerMove = Math.max(
      1,
      Number.isFinite(appliedBacktestSettings.dollarsPerMove)
        ? appliedBacktestSettings.dollarsPerMove
        : 1
    );

    return buildStrategyReplayTradeBlueprints({
      candles,
      models: toStrategyReplayModels(
        appliedBacktestModelProfiles,
        appliedBacktestSettings.aiModelStates
      ),
      symbol: appliedBacktestSettings.symbol,
      unitsPerMove,
      chunkBars: appliedBacktestSettings.chunkBars,
      strategyCatalog: modelsSurfaceCatalog,
      tpDollars: appliedBacktestSettings.tpDollars,
      slDollars: appliedBacktestSettings.slDollars,
      stopMode: appliedBacktestSettings.stopMode,
      breakEvenTriggerPct: appliedBacktestSettings.breakEvenTriggerPct,
      trailingStartPct: appliedBacktestSettings.trailingStartPct,
      trailingDistPct: appliedBacktestSettings.trailingDistPct,
      maxBarsInTrade: appliedBacktestSettings.maxBarsInTrade
    });
  }, [
    appliedBacktestModelProfiles,
    appliedBacktestSettings.aiModelStates,
    appliedBacktestSettings.chunkBars,
    appliedBacktestSettings.breakEvenTriggerPct,
    appliedBacktestSettings.dollarsPerMove,
    appliedBacktestSettings.maxBarsInTrade,
    appliedBacktestSettings.slDollars,
    appliedBacktestSettings.symbol,
    appliedBacktestSettings.stopMode,
    appliedBacktestSettings.tpDollars,
    appliedBacktestSettings.trailingDistPct,
    appliedBacktestSettings.trailingStartPct,
    backtestHasRun,
    backtestHistorySeedReady,
    modelsSurfaceCatalog,
    selectedBacktestCandles
  ]);

  const everyCandleTradeBlueprints = useMemo(() => {
    if (!appliedAiModelEveryCandleMode) {
      return [] as TradeBlueprint[];
    }

    return deterministicTradeBlueprints;
  }, [appliedAiModelEveryCandleMode, deterministicTradeBlueprints]);

  const shouldBuildSharedLibraryCandidateTrades =
    appliedAiModelEveryCandleMode &&
    (appliedBacktestSettings.antiCheatEnabled || selectedBacktestTab === "cluster");

  const [sharedLibraryCandidateTrades, setSharedLibraryCandidateTrades] = useState<HistoryItem[]>([]);
  useEffect(() => {
    if (!backtestHasRun || !backtestHistorySeedReady || !shouldBuildSharedLibraryCandidateTrades) {
      setSharedLibraryCandidateTrades([]);
      return;
    }

    if (everyCandleTradeBlueprints.length === 0) {
      setSharedLibraryCandidateTrades([]);
      return;
    }

    const modelNamesById: Record<string, string> = {};
    for (const blueprint of everyCandleTradeBlueprints) {
      if (!modelNamesById[blueprint.modelId]) {
        modelNamesById[blueprint.modelId] =
          modelProfileById[blueprint.modelId]?.name ?? "Settings";
      }
    }

    const candleSeriesBySymbol: Record<string, Candle[]> = {};
    const oneMinuteCandlesBySymbol: Record<string, Candle[]> = {};
    for (const blueprint of everyCandleTradeBlueprints) {
      if (!candleSeriesBySymbol[blueprint.symbol]) {
        const timeframeKey = symbolTimeframeKey(
          blueprint.symbol,
          appliedBacktestSettings.timeframe
        );
        candleSeriesBySymbol[blueprint.symbol] = pickLongestCandleSeries(
          backtestSeriesMap[timeframeKey],
          seriesMap[timeframeKey]
        );
      }
      if (
        appliedBacktestSettings.timeframe !== "1m" &&
        !oneMinuteCandlesBySymbol[blueprint.symbol]
      ) {
        const minuteKey = symbolTimeframeKey(blueprint.symbol, "1m");
        const minuteCandles = pickLongestCandleSeries(
          backtestOneMinuteSeriesMap[minuteKey],
          backtestSeriesMap[minuteKey],
          seriesMap[minuteKey]
        );
        if (minuteCandles.length > 0) {
          oneMinuteCandlesBySymbol[blueprint.symbol] = minuteCandles;
        }
      }
    }

    const controller = new AbortController();
    let cancelled = false;

    computeBacktestRowsOnServer(
      {
        blueprints: everyCandleTradeBlueprints,
        candleSeriesBySymbol,
        oneMinuteCandlesBySymbol:
          appliedBacktestSettings.timeframe === "1m" ? undefined : oneMinuteCandlesBySymbol,
        modelNamesById,
        tpDollars: appliedBacktestSettings.tpDollars,
        slDollars: appliedBacktestSettings.slDollars,
        stopMode: appliedBacktestSettings.stopMode,
        breakEvenTriggerPct: appliedBacktestSettings.breakEvenTriggerPct,
        trailingStartPct: appliedBacktestSettings.trailingStartPct,
        trailingDistPct: appliedBacktestSettings.trailingDistPct,
        minutePreciseEnabled: appliedBacktestSettings.minutePreciseEnabled,
        limit: everyCandleTradeBlueprints.length
      },
      controller.signal
    )
      .then((rows) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setSharedLibraryCandidateTrades(rows);
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setSharedLibraryCandidateTrades([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    backtestHasRun,
    backtestHistorySeedReady,
    everyCandleTradeBlueprints,
    modelProfileById,
    appliedBacktestSettings.timeframe,
    appliedBacktestSettings.tpDollars,
    appliedBacktestSettings.slDollars,
    appliedBacktestSettings.stopMode,
    appliedBacktestSettings.breakEvenTriggerPct,
    appliedBacktestSettings.trailingStartPct,
    appliedBacktestSettings.trailingDistPct,
    appliedBacktestSettings.minutePreciseEnabled,
    backtestSeriesMap,
    backtestOneMinuteSeriesMap,
    seriesMap,
    shouldBuildSharedLibraryCandidateTrades
  ]);

  // Keep deep backtest history off the live chart path by default.
  // We only hydrate deep candles when a chart overlay/details flow explicitly needs it.
  const isChartOverlayHydrationActive =
    isChartSurface &&
    (showAllTradesOnChart || showActiveTradeOnChart || selectedHistoryId !== null);
  const isBacktestClusterHydrationActive =
    selectedSurfaceTab === "backtest" &&
    selectedBacktestTab === "cluster";
  const shouldHydrateBacktestChartData =
    isChartOverlayHydrationActive ||
    isBacktestClusterHydrationActive ||
    activeBacktestTradeDetails !== null;
  const deepChartCandles = shouldHydrateBacktestChartData
    ? pickLongestCandleSeries(backtestSeriesMap[selectedKey], seriesMap[selectedKey])
    : null;
  const usesDeepChartHistory = (deepChartCandles?.length ?? 0) > 0;
  const selectedChartCandles = useMemo(() => {
    if (!shouldHydrateBacktestChartData) {
      return selectedCandles;
    }

    if (!usesDeepChartHistory) {
      return selectedCandles;
    }

    const deepHistory = deepChartCandles ?? EMPTY_CANDLES;

    if (!isChartSurface || selectedCandles.length === 0) {
      return deepHistory;
    }

    return mergeRecentCandles(
      deepHistory,
      selectedCandles,
      Math.max(deepHistory.length + selectedCandles.length, selectedCandles.length),
      selectedTimeframe
    );
  }, [
    deepChartCandles,
    isChartSurface,
    selectedCandles,
    selectedTimeframe,
    shouldHydrateBacktestChartData,
    usesDeepChartHistory
  ]);

  seriesMapRef.current = seriesMap;
  backtestSeriesMapRef.current = backtestSeriesMap;
  backtestOneMinuteSeriesMapRef.current = backtestOneMinuteSeriesMap;
  selectedChartCandlesRef.current = selectedChartCandles;

  const gaplessTimeMap = useMemo(() => {
    const realToGapless = new Map<number, number>();
    const gaplessToReal = new Map<number, number>();

    if (!shouldHydrateBacktestChartData || selectedChartCandles.length === 0) {
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
  }, [selectedChartCandles, selectedTimeframe, shouldHydrateBacktestChartData]);

  gaplessToRealRef.current = gaplessTimeMap.gaplessToReal;

  const toGaplessUtc = useCallback(
    (ms: number): UTCTimestamp => {
      const realSec = Math.floor(ms / 1000);
      const mapped = gaplessTimeMap.realToGapless.get(realSec);
      return (mapped ?? realSec) as UTCTimestamp;
    },
    [gaplessTimeMap]
  );

  const renderDynamicAssistantActions = useCallback(
    (candlesInput?: Candle[]) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const candles = candlesInput ?? selectedChartCandlesRef.current;

      if (!chart || !candleSeries || candles.length === 0) {
        return;
      }

      clearDynamicAiChartAnnotations(true);

      const registered = dynamicAssistantActionsRef.current.filter(
        (action) => action.dynamic === true
      );
      if (registered.length === 0) {
        return;
      }

      const resolved = registered
        .flatMap((action) =>
          resolveDynamicAssistantAction({
            action,
            candles
          })
        )
        .slice(0, 64);

      if (resolved.length === 0) {
        return;
      }

      executeAssistantChartActions(resolved, {
        chart,
        candleSeries,
        candles,
        overlaySeries: aiDynamicChartOverlaySeriesRef.current,
        priceLines: aiDynamicChartPriceLinesRef.current,
        markers: aiDynamicChartMarkersRef.current,
        chartTimeFromMs: (timestampMs: number) => toGaplessUtc(timestampMs),
        setCombinedMarkers: () => applyCombinedChartMarkers(),
        clearOverlays: () => clearDynamicAiChartAnnotations(true),
        styleToLineStyle: assistantToolStyleToLineStyle
      });

      applyCombinedChartMarkers();
    },
    [applyCombinedChartMarkers, clearDynamicAiChartAnnotations, toGaplessUtc]
  );

  const runAssistantChartActions = useCallback(
    (actionsRaw: Array<Record<string, unknown>>) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const candles = selectedChartCandlesRef.current;

      if (!chart || !candleSeries || candles.length === 0) {
        return;
      }

      const normalizedActions = normalizeChartActions(actionsRaw) as AssistantChartAction[];
      if (normalizedActions.length === 0) {
        return;
      }

      const toggleDynamicActions = normalizedActions.filter(
        (action) => action.type === "toggle_dynamic_support_resistance"
      );
      if (toggleDynamicActions.length > 0) {
        const hasManagedDynamicSr = (action: AssistantChartAction): boolean => {
          return (
            action.dynamic === true &&
            action.type === "draw_support_resistance" &&
            String(action.label || "")
              .toLowerCase()
              .includes("dynamic s/r")
          );
        };

        for (const toggleAction of toggleDynamicActions) {
          if (toggleAction.enabled === false) {
            dynamicAssistantActionsRef.current = dynamicAssistantActionsRef.current.filter(
              (row) => !hasManagedDynamicSr(row)
            );
            continue;
          }

          const levels = Number.isFinite(toggleAction.levels)
            ? clamp(Math.round(Number(toggleAction.levels)), 1, DYNAMIC_SR_MAX_LEVELS)
            : DYNAMIC_SR_DEFAULT_LEVELS;
          const dynamicLookback = Number.isFinite(toggleAction.lookback)
            ? clamp(Math.round(Number(toggleAction.lookback)), 12, DYNAMIC_SR_MAX_LOOKBACK)
            : undefined;

          const nextDynamicSr: AssistantChartAction = {
            type: "draw_support_resistance",
            dynamic: true,
            dynamicLookback,
            levels,
            style: "dashed",
            label: "Dynamic S/R"
          };

          dynamicAssistantActionsRef.current = [
            ...dynamicAssistantActionsRef.current.filter((row) => !hasManagedDynamicSr(row)),
            nextDynamicSr
          ];
        }
      }

      const adjustActions = normalizedActions.filter(
        (action) => action.type === "adjust_previous_drawings"
      );

      if (adjustActions.length > 0) {
        const applyAdjustments = (input: AssistantChartAction[]) => {
          let changed = false;
          let output = [...input];

          for (const adjustAction of adjustActions) {
            const priceDelta = Number.isFinite(adjustAction.priceDelta)
              ? Number(adjustAction.priceDelta)
              : 0;
            const timeDeltaMs = Number.isFinite(adjustAction.timeDeltaMs)
              ? Number(adjustAction.timeDeltaMs)
              : 0;
            if (Math.abs(priceDelta) <= 0 && Math.abs(timeDeltaMs) <= 0) {
              continue;
            }

            const labelFilter = String(adjustAction.targetLabel || "")
              .trim()
              .toLowerCase();

            output = output.map((drawAction) => {
              if (!isAssistantDrawableAction(drawAction)) {
                return drawAction;
              }

              if (labelFilter) {
                const drawLabel = String(drawAction.label || "").toLowerCase();
                if (!drawLabel.includes(labelFilter)) {
                  return drawAction;
                }
              }

              changed = true;
              return adjustAssistantDrawAction({
                action: drawAction,
                priceDelta,
                timeDeltaMs
              });
            });
          }

          return { output, changed };
        };

        const adjustedStatic = applyAdjustments(lastAssistantDrawActionsRef.current);
        const adjustedDynamic = applyAdjustments(dynamicAssistantActionsRef.current);

        if (adjustedStatic.changed) {
          const adjustedDrawableReplay = adjustedStatic.output.filter(isAssistantDrawableAction);
          clearAiChartAnnotations();
          if (adjustedDrawableReplay.length > 0) {
            executeAssistantChartActions(adjustedDrawableReplay, {
              chart,
              candleSeries,
              candles,
              overlaySeries: aiChartOverlaySeriesRef.current,
              priceLines: aiChartPriceLinesRef.current,
              markers: aiChartMarkersRef.current,
              chartTimeFromMs: (timestampMs: number) => toGaplessUtc(timestampMs),
              setCombinedMarkers: () => applyCombinedChartMarkers(),
              clearOverlays: clearAiChartAnnotations,
              styleToLineStyle: assistantToolStyleToLineStyle
            });
            applyCombinedChartMarkers();
          }
          lastAssistantDrawActionsRef.current = adjustedStatic.output;
        }

        if (adjustedDynamic.changed) {
          dynamicAssistantActionsRef.current = adjustedDynamic.output;
        }
      }

      const drawActions = normalizedActions.filter(
        (action) =>
          action.type !== "adjust_previous_drawings" &&
          action.type !== "toggle_dynamic_support_resistance"
      );
      const hasClearAction = drawActions.some((action) => action.type === "clear_annotations");

      if (hasClearAction) {
        clearAllAiChartAnnotations();
      }

      const actionable = drawActions.filter((action) => action.type !== "clear_annotations");
      const staticActions = actionable.filter((action) => !action.dynamic);
      const incomingDynamicActions = actionable
        .filter((action) => action.dynamic === true)
        .filter((action) => isAssistantDrawableAction(action) || action.type === "move_to_date")
        .map((action) => ({ ...action }));

      if (staticActions.length > 0) {
        executeAssistantChartActions(staticActions, {
          chart,
          candleSeries,
          candles,
          overlaySeries: aiChartOverlaySeriesRef.current,
          priceLines: aiChartPriceLinesRef.current,
          markers: aiChartMarkersRef.current,
          chartTimeFromMs: (timestampMs: number) => toGaplessUtc(timestampMs),
          setCombinedMarkers: () => applyCombinedChartMarkers(),
          clearOverlays: clearAllAiChartAnnotations,
          styleToLineStyle: assistantToolStyleToLineStyle
        });

        applyCombinedChartMarkers();

        const latestDrawableActions = staticActions.filter(isAssistantDrawableAction);
        if (latestDrawableActions.length > 0) {
          lastAssistantDrawActionsRef.current = latestDrawableActions.map((action) => ({
            ...action
          }));
        }
      }

      if (incomingDynamicActions.length > 0) {
        dynamicAssistantActionsRef.current = hasClearAction
          ? incomingDynamicActions
          : [...dynamicAssistantActionsRef.current, ...incomingDynamicActions].slice(-24);
      }

      renderDynamicAssistantActions(candles);
    },
    [
      applyCombinedChartMarkers,
      clearAiChartAnnotations,
      clearAllAiChartAnnotations,
      renderDynamicAssistantActions,
      toGaplessUtc
    ]
  );

  useEffect(() => {
    if (!isChartSurface) {
      clearAllAiChartAnnotations();
    }
  }, [clearAllAiChartAnnotations, isChartSurface, selectedSurfaceTab]);

  useEffect(() => {
    if (!isChartSurface) {
      return;
    }
    renderDynamicAssistantActions(selectedChartCandles);
  }, [
    isChartSurface,
    renderDynamicAssistantActions,
    selectedChartCandles,
    selectedSurfaceTab
  ]);

  useEffect(() => {
    if (!isChartSurface) {
      return;
    }

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
      chartViewCenterTimeMsRef.current = null;
      setChartRenderWindow((current) =>
        current.from === 0 && current.to === -1 ? current : { from: 0, to: -1 }
      );
      return;
    }

    const syncCenterTimeFromVisibleRange = (visibleRange: ChartDataWindow) => {
      if (candles.length === 0) {
        chartViewCenterTimeMsRef.current = null;
        return;
      }

      const centerIndex = Math.round((visibleRange.from + visibleRange.to) / 2);
      const clampedIndex = Math.max(0, Math.min(centerIndex, candles.length - 1));
      chartViewCenterTimeMsRef.current = candles[clampedIndex]?.time ?? null;
    };

    const moveToLatest = () => {
      const visibleCount = timeframeVisibleCount[selectedTimeframe];
      const rightPadding = Math.round(visibleCount * 0.4);
      const visibleFrom = Math.max(0, totalBars - 1 - (visibleCount - rightPadding));
      const visibleTo = visibleFrom + visibleCount;
      const visibleRange = { from: visibleFrom, to: visibleTo };
      const nextWindow = buildChartDataWindow(totalBars, visibleFrom, Math.min(visibleTo, totalBars - 1));

      syncCenterTimeFromVisibleRange(visibleRange);
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

      syncCenterTimeFromVisibleRange(visibleRange);
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
      const visibleSpan =
        currentVisible !== null
          ? Math.max(1, currentVisible.to - currentVisible.from)
          : timeframeVisibleCount[selectedTimeframe];
      const centerTimeMs = chartViewCenterTimeMsRef.current;
      const centerIndexRaw =
        centerTimeMs === null ? -1 : findCandleIndexAtOrBefore(candles, centerTimeMs);
      const fallbackVisible =
        centerIndexRaw >= 0
          ? clampChartDataWindow(
              totalBars,
              centerIndexRaw - visibleSpan / 2,
              centerIndexRaw + visibleSpan / 2
            )
          : currentVisible !== null
            ? clampChartDataWindow(totalBars, currentVisible.from, currentVisible.to)
            : clampChartDataWindow(
                totalBars,
                totalBars - 1 - timeframeVisibleCount[selectedTimeframe],
                totalBars - 1
              );
      const nextWindow = buildChartDataWindow(totalBars, fallbackVisible.from, fallbackVisible.to);

      syncCenterTimeFromVisibleRange(fallbackVisible);
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
  }, [
    isChartSurface,
    selectedChartCandles.length,
    selectedSymbol,
    selectedSurfaceTab,
    selectedTimeframe
  ]);

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
    const visibleCandles = selectedChartCandlesRef.current;
    if (visibleCandles.length > 0) {
      const centerIndex = Math.round((nextVisibleRange.from + nextVisibleRange.to) / 2);
      const clampedCenterIndex = Math.max(0, Math.min(centerIndex, visibleCandles.length - 1));
      chartViewCenterTimeMsRef.current = visibleCandles[clampedCenterIndex]?.time ?? null;
    }

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

  const aggressorScaleCeiling = Math.max(
    1,
    aggressorPressure.scaleCeiling,
    aggressorPressure.buyPressure,
    aggressorPressure.sellPressure
  );
  const aggressorTotalPressure = aggressorPressure.buyPressure + aggressorPressure.sellPressure;
  const aggressorBuyFlowShare =
    aggressorTotalPressure > 0 ? clamp(aggressorPressure.buyPressure / aggressorTotalPressure, 0, 1) : 0.5;
  const aggressorSellFlowShare =
    aggressorTotalPressure > 0 ? clamp(aggressorPressure.sellPressure / aggressorTotalPressure, 0, 1) : 0.5;
  const aggressorSellFillShare = clamp(aggressorPressure.sellPressure / aggressorScaleCeiling, 0, 1);
  const aggressorBuyFillShare = clamp(aggressorPressure.buyPressure / aggressorScaleCeiling, 0, 1);
  const aggressorImbalancePct =
    aggressorTotalPressure > 0
      ? ((aggressorPressure.buyPressure - aggressorPressure.sellPressure) / aggressorTotalPressure) * 100
      : 0;
  const aggressorWindowLabel = selectedTimeframe;
  const liveAskLabel = liveQuote.ask != null ? formatPrice(liveQuote.ask) : "--";
  const liveBidLabel = liveQuote.bid != null ? formatPrice(liveQuote.bid) : "--";
  const liveSpreadLabel = liveQuote.spread != null ? formatPrice(liveQuote.spread) : "--";
  const estimatedVolumeCurrent = Math.max(0, volumeNowcast.estimatedCurrentVolume);
  const estimatedVolumeFinal = Math.max(0, volumeNowcast.estimatedFinalVolume);
  const estimatedBuyVolume = estimatedVolumeCurrent * aggressorBuyFlowShare;
  const estimatedSellVolume = estimatedVolumeCurrent * aggressorSellFlowShare;
  const estimatedVolumeScale = Math.max(1, estimatedVolumeFinal);
  const estimatedVolumeCurrentLabel = formatAggressorPressure(estimatedVolumeCurrent);
  const estimatedVolumeFinalLabel = formatAggressorPressure(estimatedVolumeFinal);

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

    return enforceMaxConcurrentTradeBlueprints(
      deterministicTradeBlueprints,
      appliedBacktestSettings.maxConcurrentTrades
    ).slice(0, backtestTargetTrades);
  }, [
    appliedBacktestModelProfiles,
    appliedBacktestSettings.maxConcurrentTrades,
    deterministicTradeBlueprints,
    backtestTargetTrades
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
    return enforceMaxConcurrentHistoryRows(
      deferredHistoryRows,
      appliedBacktestSettings.maxConcurrentTrades,
      appliedBacktestSettings.minutePreciseEnabled
    );
  }, [
    appliedBacktestSettings.maxConcurrentTrades,
    appliedBacktestSettings.minutePreciseEnabled,
    deferredHistoryRows
  ]);
  const backtestSourceTrades = useMemo(() => {
    return chronologicalHistoryRows;
  }, [chronologicalHistoryRows]);
  const usesChartPanelLiveSimulationForHistory =
    isChartSurface && chartPanelLiveSimulationEnabled;
  const usesChartPanelLiveSimulationForActive =
    isChartSurface && activePanelLiveSimulationEnabled;
  const canBuildChartPanelReplayRows = historyRows.length <= 800;
  const shouldBuildChartPanelReplayRows =
    isChartSurface &&
    canBuildChartPanelReplayRows &&
    (chartPanelLiveSimulationEnabled || activePanelLiveSimulationEnabled);
  const chartPanelFilterSettings = useMemo<BacktestFilterSettings>(
    () => ({
      statsDateStart,
      statsDateEnd,
      enabledBacktestWeekdays: [...enabledBacktestWeekdays],
      enabledBacktestSessions: [...enabledBacktestSessions],
      enabledBacktestMonths: [...enabledBacktestMonths],
      enabledBacktestHours: [...enabledBacktestHours],
      aiMode,
      antiCheatEnabled,
      validationMode,
      selectedAiLibraries: [...selectedAiLibraries],
      selectedAiLibrarySettings: cloneAiLibrarySettings(selectedAiLibrarySettings),
      distanceMetric,
      knnNeighborSpace,
      kEntry
    }),
    [
      antiCheatEnabled,
      aiMode,
      distanceMetric,
      enabledBacktestHours,
      enabledBacktestMonths,
      enabledBacktestSessions,
      enabledBacktestWeekdays,
      kEntry,
      knnNeighborSpace,
      selectedAiLibraries,
      selectedAiLibrarySettings,
      statsDateEnd,
      statsDateStart,
      validationMode
    ]
  );
  const chartPanelConfidenceGateDisabled = aiMode === "off";
  const chartPanelEffectiveConfidenceThreshold = chartPanelConfidenceGateDisabled
    ? 0
    : confidenceThreshold;
  const chartPanelTradeBlueprints = useMemo(() => {
    if (!shouldBuildChartPanelReplayRows) {
      return [] as TradeBlueprint[];
    }

    if (backtestModelProfiles.length === 0 || selectedCandles.length < 3) {
      return [] as TradeBlueprint[];
    }

    const unitsPerMove = Math.max(
      1,
      Number.isFinite(dollarsPerMove)
        ? dollarsPerMove
        : 1
    );
    const blueprints = buildStrategyReplayTradeBlueprints({
      candles: selectedCandles,
      models: toStrategyReplayModels(backtestModelProfiles, aiModelStates),
      symbol: selectedSymbol,
      unitsPerMove,
      chunkBars,
      strategyCatalog: modelsSurfaceCatalog,
      tpDollars,
      slDollars,
      stopMode,
      breakEvenTriggerPct,
      trailingStartPct,
      trailingDistPct,
      maxBarsInTrade
    });

    return enforceMaxConcurrentTradeBlueprints(blueprints, maxConcurrentTrades);
  }, [
    aiModelStates,
    backtestModelProfiles,
    breakEvenTriggerPct,
    chunkBars,
    shouldBuildChartPanelReplayRows,
    dollarsPerMove,
    maxConcurrentTrades,
    maxBarsInTrade,
    modelsSurfaceCatalog,
    selectedCandles,
    selectedSymbol,
    slDollars,
    stopMode,
    tpDollars,
    trailingDistPct,
    trailingStartPct
  ]);
  const chartPanelOneMinuteCandlesBySymbol = useMemo<Record<string, Candle[]> | undefined>(() => {
    if (!shouldBuildChartPanelReplayRows || selectedTimeframe === "1m" || !minutePreciseEnabled) {
      return undefined;
    }

    const minuteKey = symbolTimeframeKey(selectedSymbol, "1m");
    const minuteCandles = pickLongestCandleSeries(
      backtestOneMinuteSeriesMap[minuteKey],
      backtestSeriesMap[minuteKey],
      seriesMap[minuteKey]
    );

    if (minuteCandles.length === 0) {
      return undefined;
    }

    return {
      [selectedSymbol]: minuteCandles
    };
  }, [
    backtestSeriesMap,
    backtestOneMinuteSeriesMap,
    minutePreciseEnabled,
    selectedSymbol,
    selectedTimeframe,
    seriesMap,
    shouldBuildChartPanelReplayRows
  ]);
  const chartPanelModelNamesById = useMemo(() => {
    const modelNamesById: Record<string, string> = {};

    for (const blueprint of chartPanelTradeBlueprints) {
      if (!modelNamesById[blueprint.modelId]) {
        modelNamesById[blueprint.modelId] =
          modelProfileById[blueprint.modelId]?.name ?? "Settings";
      }
    }

    return modelNamesById;
  }, [chartPanelTradeBlueprints, modelProfileById]);
  const [chartPanelReplayRows, setChartPanelReplayRows] = useState<HistoryItem[]>([]);
  useEffect(() => {
    if (!shouldBuildChartPanelReplayRows) {
      setChartPanelReplayRows([]);
      return;
    }

    if (chartPanelTradeBlueprints.length === 0 || selectedCandles.length < 16) {
      setChartPanelReplayRows([]);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    computeBacktestRowsOnServer(
      {
        blueprints: chartPanelTradeBlueprints,
        candleSeriesBySymbol: {
          [selectedSymbol]: selectedCandles
        },
        oneMinuteCandlesBySymbol: chartPanelOneMinuteCandlesBySymbol,
        minutePreciseEnabled,
        modelNamesById: chartPanelModelNamesById,
        tpDollars,
        slDollars,
        stopMode,
        breakEvenTriggerPct,
        trailingStartPct,
        trailingDistPct,
        limit: chartPanelTradeBlueprints.length
      },
      controller.signal
    )
      .then((rows) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setChartPanelReplayRows(
          enforceMaxConcurrentHistoryRows(
            rows,
            maxConcurrentTrades,
            minutePreciseEnabled
          )
        );
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setChartPanelReplayRows([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    breakEvenTriggerPct,
    chartPanelModelNamesById,
    chartPanelOneMinuteCandlesBySymbol,
    chartPanelTradeBlueprints,
    maxConcurrentTrades,
    minutePreciseEnabled,
    selectedCandles,
    selectedSymbol,
    slDollars,
    stopMode,
    tpDollars,
    trailingDistPct,
    trailingStartPct,
    shouldBuildChartPanelReplayRows
  ]);
  const panelBacktestFilterSettings: BacktestFilterSettings =
    usesChartPanelLiveSimulationForHistory
      ? chartPanelFilterSettings
      : appliedBacktestSettings;
  const panelConfidenceGateDisabled =
    usesChartPanelLiveSimulationForHistory
      ? chartPanelConfidenceGateDisabled
      : appliedConfidenceGateDisabled;
  const panelEffectiveConfidenceThreshold =
    usesChartPanelLiveSimulationForHistory
      ? chartPanelEffectiveConfidenceThreshold
      : appliedEffectiveConfidenceThreshold;
  const panelSourceTrades =
    usesChartPanelLiveSimulationForHistory
      ? chartPanelReplayRows
      : backtestSourceTrades;
  const activePanelSourceTrades =
    usesChartPanelLiveSimulationForActive
      ? chartPanelReplayRows
      : backtestSourceTrades;
  const activePanelBacktestFilterSettings: BacktestFilterSettings =
    usesChartPanelLiveSimulationForActive
      ? chartPanelFilterSettings
      : appliedBacktestSettings;
  const activePanelConfidenceGateDisabled =
    usesChartPanelLiveSimulationForActive
      ? chartPanelConfidenceGateDisabled
      : appliedConfidenceGateDisabled;
  const activePanelEffectiveConfidenceThreshold =
    usesChartPanelLiveSimulationForActive
      ? chartPanelEffectiveConfidenceThreshold
      : appliedEffectiveConfidenceThreshold;
  const shouldSendActivePanelOverrides =
    usesChartPanelLiveSimulationForActive !== usesChartPanelLiveSimulationForHistory;
  const shouldComputePanelAnalyticsOnServer =
    panelBacktestFilterSettings.aiMode !== "off" ||
    activePanelBacktestFilterSettings.aiMode !== "off";
  const aiLibraryDefaultsById = useMemo(() => {
    const next: Record<string, Record<string, AiLibrarySettingValue>> = {};
    for (const [libraryId, definition] of Object.entries(aiLibraryDefById)) {
      next[libraryId] = { ...(definition.defaults ?? {}) };
    }
    return next;
  }, [aiLibraryDefById]);
  const [panelAnalyticsData, setPanelAnalyticsData] = useState<PanelAnalyticsServerResponse>({
    dateFilteredTrades: [],
    libraryCandidateTrades: [],
    timeFilteredTrades: [],
    confidenceByIdEntries: [],
    chartPanelHistoryRows: [],
    activePanelHistoryRows: []
  });
  const [panelAnalyticsStatus, setPanelAnalyticsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const fallbackChartPanelHistoryRows = useMemo(() => {
    return filterHistoryRowsLocally({
      sourceTrades: panelSourceTrades,
      settings: panelBacktestFilterSettings,
      confidenceGateDisabled: panelConfidenceGateDisabled,
      effectiveConfidenceThreshold: panelEffectiveConfidenceThreshold,
      confidenceResolver: getTradeConfidenceScore
    });
  }, [
    panelSourceTrades,
    panelBacktestFilterSettings,
    panelConfidenceGateDisabled,
    panelEffectiveConfidenceThreshold
  ]);
  const fallbackActivePanelHistoryRows = useMemo(() => {
    return filterHistoryRowsLocally({
      sourceTrades: activePanelSourceTrades,
      settings: activePanelBacktestFilterSettings,
      confidenceGateDisabled: activePanelConfidenceGateDisabled,
      effectiveConfidenceThreshold: activePanelEffectiveConfidenceThreshold,
      confidenceResolver: getTradeConfidenceScore
    });
  }, [
    activePanelSourceTrades,
    activePanelBacktestFilterSettings,
    activePanelConfidenceGateDisabled,
    activePanelEffectiveConfidenceThreshold
  ]);
  const panelAnalyticsLibraryIdSet = useMemo(() => {
    return new Set(
      (appliedBacktestSettings.selectedAiLibraries ?? []).map((libraryId) =>
        String(libraryId).trim()
      )
    );
  }, [appliedBacktestSettings.selectedAiLibraries]);
  const panelAnalyticsCanonicalLibraryIds = useMemo(() => {
    return [...panelAnalyticsLibraryIdSet].filter((libraryId) => {
      return (
        !isOnlineLearningLibraryId(libraryId) &&
        !isGhostLearningLibraryId(libraryId)
      );
    });
  }, [panelAnalyticsLibraryIdSet]);
  const panelAnalyticsLibraryPoints = useMemo(() => {
    if (panelAnalyticsLibraryIdSet.size === 0) {
      return [] as any[];
    }

    return (aiLibraryPoints as any[]).filter((point) => {
      const libraryId = String(point?.libId ?? point?.metaLib ?? "").trim();
      return libraryId.length > 0 && panelAnalyticsLibraryIdSet.has(libraryId);
    });
  }, [aiLibraryPoints, panelAnalyticsLibraryIdSet]);
  const panelAnalyticsCanonicalLibraryPointIdSet = useMemo(() => {
    return new Set(
      panelAnalyticsLibraryPoints
        .map((point) => String(point?.libId ?? point?.metaLib ?? "").trim().toLowerCase())
        .filter((libraryId) => libraryId.length > 0)
    );
  }, [panelAnalyticsLibraryPoints]);
  const panelAnalyticsLibrarySourcesSettled = useMemo(() => {
    if (panelAnalyticsCanonicalLibraryIds.length === 0) {
      return true;
    }

    return panelAnalyticsCanonicalLibraryIds.every((libraryId) => {
      const status = aiLibraryRunStatus[libraryId] ?? "idle";
      return status === "ready" || status === "error";
    });
  }, [aiLibraryRunStatus, panelAnalyticsCanonicalLibraryIds]);
  const panelAnalyticsCanonicalLibrariesMissingPoints = useMemo(() => {
    if (!panelAnalyticsLibrarySourcesSettled || panelAnalyticsCanonicalLibraryIds.length === 0) {
      return false;
    }

    return panelAnalyticsCanonicalLibraryIds.some((libraryId) => {
      const normalizedLibraryId = String(libraryId ?? "").trim().toLowerCase();
      if (!normalizedLibraryId) {
        return false;
      }
      return !panelAnalyticsCanonicalLibraryPointIdSet.has(normalizedLibraryId);
    });
  }, [
    panelAnalyticsCanonicalLibraryIds,
    panelAnalyticsCanonicalLibraryPointIdSet,
    panelAnalyticsLibrarySourcesSettled
  ]);
  useEffect(() => {
    if (!shouldComputePanelAnalyticsOnServer) {
      setPanelAnalyticsStatus("idle");
      return;
    }

    if (!panelAnalyticsLibrarySourcesSettled) {
      setPanelAnalyticsStatus("loading");
      return;
    }

    if (panelAnalyticsCanonicalLibrariesMissingPoints) {
      setPanelAnalyticsStatus("error");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setPanelAnalyticsStatus("loading");

    computePanelAnalyticsOnServer(
      {
        panelSourceTrades,
        panelBacktestFilterSettings,
        panelConfidenceGateDisabled,
        panelEffectiveConfidenceThreshold,
        ...(shouldSendActivePanelOverrides
          ? {
              activePanelSourceTrades,
              activePanelBacktestFilterSettings,
              activePanelConfidenceGateDisabled,
              activePanelEffectiveConfidenceThreshold
            }
          : {}),
        panelLibraryPoints: panelAnalyticsLibraryPoints,
        aiLibraryDefaultsById
      },
      controller.signal
    )
      .then((result) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setPanelAnalyticsData(result);
        setPanelAnalyticsStatus("ready");
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setPanelAnalyticsStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activePanelBacktestFilterSettings,
    activePanelConfidenceGateDisabled,
    activePanelEffectiveConfidenceThreshold,
    activePanelSourceTrades,
    aiLibraryDefaultsById,
    aiLibraryPoints,
    appliedBacktestSettings,
    chartPanelConfidenceGateDisabled,
    appliedConfidenceGateDisabled,
    chartPanelEffectiveConfidenceThreshold,
    appliedEffectiveConfidenceThreshold,
    panelBacktestFilterSettings,
    panelConfidenceGateDisabled,
    panelEffectiveConfidenceThreshold,
    panelAnalyticsLibraryIdSet,
    panelAnalyticsCanonicalLibrariesMissingPoints,
    panelAnalyticsLibraryPoints,
    panelAnalyticsLibrarySourcesSettled,
    panelSourceTrades,
    shouldComputePanelAnalyticsOnServer,
    shouldSendActivePanelOverrides
  ]);
  const antiCheatBacktestContext = useMemo(() => {
    if (!shouldComputePanelAnalyticsOnServer || panelAnalyticsStatus !== "ready") {
      return {
        dateFilteredTrades: [] as HistoryItem[],
        libraryCandidateTrades: [] as HistoryItem[],
        timeFilteredTrades: [] as HistoryItem[],
        confidenceById: new Map<string, number>()
      };
    }

    return {
      dateFilteredTrades: panelAnalyticsData.dateFilteredTrades,
      libraryCandidateTrades: panelAnalyticsData.libraryCandidateTrades,
      timeFilteredTrades: panelAnalyticsData.timeFilteredTrades,
      confidenceById: new Map<string, number>(panelAnalyticsData.confidenceByIdEntries)
    };
  }, [panelAnalyticsData, panelAnalyticsStatus, shouldComputePanelAnalyticsOnServer]);
  const getEffectiveTradeConfidenceScore = useCallback(
    (trade: HistoryItem) => {
      return antiCheatBacktestContext.confidenceById.get(trade.id) ?? getTradeConfidenceScore(trade);
    },
    [antiCheatBacktestContext]
  );
  const chartPanelHistoryRows =
    shouldComputePanelAnalyticsOnServer && panelAnalyticsStatus === "ready"
      ? panelAnalyticsData.chartPanelHistoryRows
      : fallbackChartPanelHistoryRows;
  const activePanelHistoryRows =
    shouldComputePanelAnalyticsOnServer && panelAnalyticsStatus === "ready"
      ? panelAnalyticsData.activePanelHistoryRows
      : fallbackActivePanelHistoryRows;

  const activeTrade = useMemo<ActiveTrade | null>(() => {
    if (activePanelHistoryRows.length === 0) {
      return null;
    }

    const chartNowSec =
      selectedCandles.length > 0
        ? toUtcTimestamp(selectedCandles[selectedCandles.length - 1]!.time)
        : Math.floor(referenceNowMs / 1000);
    const runtimeNowSec = Math.floor(Date.now() / 1000);
    const activeThresholdSec =
      usesChartPanelLiveSimulationForActive
        ? chartNowSec
        : runtimeNowSec;
    const trade = activePanelHistoryRows.find(
      (candidate) => Number(candidate.exitTime) > activeThresholdSec
    );

    if (!trade) {
      return null;
    }

    const markPrice =
      usesChartPanelLiveSimulationForActive && selectedCandles.length > 0
        ? selectedCandles[selectedCandles.length - 1]!.close
        : trade.outcomePrice;
    const pnlValue =
      trade.side === "Long"
        ? (markPrice - trade.entryPrice) * trade.units
        : (trade.entryPrice - markPrice) * trade.units;
    const pnlPct =
      trade.entryPrice > 0
        ? trade.side === "Long"
          ? ((markPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - markPrice) / trade.entryPrice) * 100
        : 0;
    const elapsedToSec =
      usesChartPanelLiveSimulationForActive
        ? Math.max(Number(trade.entryTime), chartNowSec)
        : Math.floor(referenceNowMs / 1000);

    const riskDist = Math.abs(trade.entryPrice - trade.stopPrice);
    const rewardDist = Math.abs(trade.targetPrice - trade.entryPrice);
    const rr = riskDist > 0 ? rewardDist / riskDist : 0;
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
      elapsed: formatElapsed(Number(trade.entryTime), elapsedToSec),
      pnlPct,
      pnlValue,
      progressPct: clamp(progressRaw * 100, 0, 100),
      rr
    };
  }, [
    activePanelHistoryRows,
    referenceNowMs,
    selectedCandles,
    usesChartPanelLiveSimulationForActive
  ]);

  const latestTradeBarsAgo = useMemo(() => {
    const sourceRows =
      usesChartPanelLiveSimulationForActive
        ? chartPanelReplayRows
        : deferredHistoryRows;

    if (sourceRows.length === 0) {
      return null;
    }

    const latestExitTime = sourceRows.reduce(
      (max, row) => Math.max(max, Number(row.exitTime)),
      0
    );
    if (latestExitTime === 0) {
      return null;
    }

    const activeTimeframe =
      usesChartPanelLiveSimulationForActive
        ? selectedTimeframe
        : appliedBacktestSettings.timeframe;
    const anchorNowSec =
      usesChartPanelLiveSimulationForActive && selectedCandles.length > 0
        ? toUtcTimestamp(selectedCandles[selectedCandles.length - 1]!.time)
        : Math.floor(referenceNowMs / 1000);
    const barSeconds = timeframeMinutes[activeTimeframe] * 60;

    return Math.max(0, Math.floor((anchorNowSec - latestExitTime) / barSeconds));
  }, [
    deferredHistoryRows,
    chartPanelReplayRows,
    referenceNowMs,
    appliedBacktestSettings.timeframe,
    selectedCandles,
    selectedTimeframe,
    usesChartPanelLiveSimulationForActive
  ]);

  const backtestHistorySeriesBySymbol = useMemo(() => {
    const next: Record<string, Candle[]> = {};

    for (const blueprint of tradeBlueprints) {
      if (next[blueprint.symbol]) {
        continue;
      }

      const key = symbolTimeframeKey(blueprint.symbol, appliedBacktestSettings.timeframe);
      next[blueprint.symbol] = pickLongestCandleSeries(
        backtestSeriesMap[key],
        seriesMap[key]
      );
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
      const candles = pickLongestCandleSeries(
        backtestOneMinuteSeriesMap[key],
        backtestSeriesMap[key],
        seriesMap[key]
      );

      if (candles.length > 0) {
        next[blueprint.symbol] = candles;
      }
    }

    return next;
  }, [
    appliedBacktestSettings.timeframe,
    backtestSeriesMap,
    backtestOneMinuteSeriesMap,
    seriesMap,
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
  appliedBacktestMinutePreciseEnabledRef.current = appliedBacktestSettings.minutePreciseEnabled;
  appliedBacktestStatsDateStartRef.current = appliedBacktestSettings.statsDateStart;
  appliedBacktestStatsDateEndRef.current = appliedBacktestSettings.statsDateEnd;

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
    const minutePreciseEnabledSnapshot = appliedBacktestMinutePreciseEnabledRef.current;
    const appliedSettingsSnapshot = appliedBacktestSettingsRef.current;
    const hasActiveLibraries = (appliedSettingsSnapshot.selectedAiLibraries?.length ?? 0) > 0;
    const hasAiAnalysisPass =
      appliedSettingsSnapshot.aiMode !== "off" &&
      (appliedSettingsSnapshot.antiCheatEnabled ||
        (hasActiveLibraries &&
        canRunAizipLibrariesForSettings({
          libraryIds: appliedSettingsSnapshot.selectedAiLibraries,
          aiModelStates: appliedSettingsSnapshot.aiModelStates
        })));
    const aiAnalysisStatus = hasActiveLibraries
      ? "Loading AI Libraries"
      : "Applying AI Analysis";
    const statsDateStartSnapshot = appliedBacktestStatsDateStartRef.current;
    const statsDateEndSnapshot = appliedBacktestStatsDateEndRef.current;

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
    const normalizedTimelineStartMs = normalizeTimestampMs(backtestBlueprintRangeSnapshot.startMs);
    const normalizedTimelineEndMs = normalizeTimestampMs(backtestBlueprintRangeSnapshot.endMs);
    const timelineStartMs = Number.isFinite(normalizedTimelineStartMs)
      ? normalizedTimelineStartMs
      : fallbackStartMs;
    const timelineEndMsRaw = Number.isFinite(normalizedTimelineEndMs)
      ? normalizedTimelineEndMs
      : fallbackEndMs;
    const timelineEndMs = Math.max(timelineStartMs + 60_000, timelineEndMsRaw);
    const chronologicalTradeBlueprints = [...tradeBlueprintsSnapshot].sort(
      (left, right) =>
        left.exitMs - right.exitMs ||
        left.entryMs - right.entryMs ||
        left.id.localeCompare(right.id)
    );
    const lastChronologicalBlueprint =
      chronologicalTradeBlueprints[chronologicalTradeBlueprints.length - 1] ?? null;
    const analysisEndMsRaw = lastChronologicalBlueprint
      ? Math.max(lastChronologicalBlueprint.entryMs, lastChronologicalBlueprint.exitMs)
      : timelineEndMs;
    const filterStartMs = statsDateStartSnapshot
      ? new Date(statsDateStartSnapshot).getTime()
      : NaN;
    const filterEndMs = statsDateEndSnapshot
      ? new Date(statsDateEndSnapshot + "T23:59:59.999").getTime()
      : NaN;
    const analysisStartMs = Number.isFinite(filterStartMs)
      ? Math.max(timelineStartMs, filterStartMs)
      : timelineStartMs;
    const normalizedAnalysisEndMsRaw = normalizeTimestampMs(analysisEndMsRaw);
    const rawEndMs = Number.isFinite(normalizedAnalysisEndMsRaw)
      ? normalizedAnalysisEndMsRaw
      : timelineEndMs;
    const analysisEndMs = Math.max(
      analysisStartMs + 60_000,
      Number.isFinite(filterEndMs) ? Math.min(rawEndMs, filterEndMs) : rawEndMs
    );
    setStatsRefreshTimelineRangeValue(analysisStartMs, analysisEndMs);

    if (tradeBlueprintsSnapshot.length === 0 || backtestTargetTradesSnapshot <= 0) {
      setStatsRefreshStatus("No Trades In Selected Range");
      startTransition(() => {
        setHistoryRows([]);
      });
      return;
    }

    const analysisSpanMs = Math.max(60_000, analysisEndMs - analysisStartMs);
    let lastLoadingProgressRatio = 0;
    const setLoadingProgressFromRatio = (ratio: number) => {
      const normalizedRatio = clamp(ratio, 0, 1);

      if (normalizedRatio <= lastLoadingProgressRatio) {
        return;
      }

      lastLoadingProgressRatio = normalizedRatio;
      const cursorMs = analysisStartMs + analysisSpanMs * normalizedRatio;
      setStatsRefreshProgress(normalizedRatio * 100);
      setStatsRefreshProgressLabel(formatStatsRefreshDateLabel(cursorMs));
    };

    let cancelled = false;
    let settled = false;
    let phaseTransitionTimeoutId = 0;
    let progressTimeoutId = 0;
    let requestTimeoutId = 0;
    const requestController = new AbortController();
    const replayPayload = {
      blueprints: chronologicalTradeBlueprints,
      candleSeriesBySymbol: backtestHistorySeriesBySymbolSnapshot,
      oneMinuteCandlesBySymbol: backtestOneMinuteCandlesBySymbolSnapshot,
      modelNamesById,
      tpDollars: tpDollarsSnapshot,
      slDollars: slDollarsSnapshot,
      stopMode: stopModeSnapshot,
      breakEvenTriggerPct: breakEvenTriggerPctSnapshot,
      trailingStartPct: trailingStartPctSnapshot,
      trailingDistPct: trailingDistPctSnapshot,
      minutePreciseEnabled: minutePreciseEnabledSnapshot,
      limit: backtestTargetTradesSnapshot
    };

    const clearProgressTimeout = () => {
      if (!progressTimeoutId) {
        return;
      }

      window.clearTimeout(progressTimeoutId);
      progressTimeoutId = 0;
    };
    const clearRequestTimeout = () => {
      if (!requestTimeoutId) {
        return;
      }

      window.clearTimeout(requestTimeoutId);
      requestTimeoutId = 0;
    };
    const clearPhaseTransitionTimeout = () => {
      if (!phaseTransitionTimeoutId) {
        return;
      }

      window.clearTimeout(phaseTransitionTimeoutId);
      phaseTransitionTimeoutId = 0;
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
      clearProgressTimeout();
      clearRequestTimeout();
      clearPhaseTransitionTimeout();
      startTransition(() => {
        setHistoryRows(rows);
      });
    };

    const failWithEmptyRows = () => {
      if (cancelled || settled || backtestHistoryJobIdRef.current !== nextJobId) {
        return;
      }

      setStatsRefreshStatus("Finalizing Statistics");
      setLoadingProgressFromRatio(1);
      commitRows([]);
    };

    const finalizeReplayRows = (rows: HistoryItem[]) => {
      if (cancelled || settled || backtestHistoryJobIdRef.current !== nextJobId) {
        return;
      }

      setLoadingProgressFromRatio(1);
      const commitFinalizingPhase = () => {
        if (cancelled || settled || backtestHistoryJobIdRef.current !== nextJobId) {
          return;
        }

        setStatsRefreshStatus("Finalizing Statistics");
        commitRows(rows);
      };

      if (hasAiAnalysisPass) {
        setStatsRefreshStatus(aiAnalysisStatus);
        clearPhaseTransitionTimeout();
        phaseTransitionTimeoutId = window.setTimeout(() => {
          commitFinalizingPhase();
        }, getStatsRefreshPhaseDurationMs(aiAnalysisStatus));
        return;
      }

      commitFinalizingPhase();
    };

    const recoverReplayLocally = () => {
      if (cancelled || settled || backtestHistoryJobIdRef.current !== nextJobId) {
        return;
      }

      clearProgressTimeout();
      clearRequestTimeout();
      setStatsRefreshStatus("Recovering Replay Locally");
      setLoadingProgressFromRatio(0.82);

      window.setTimeout(() => {
        if (cancelled || settled || backtestHistoryJobIdRef.current !== nextJobId) {
          return;
        }

        try {
          const localRows = computeBacktestRowsLocally(replayPayload);
          finalizeReplayRows(localRows);
        } catch {
          failWithEmptyRows();
        }
      }, 0);
    };

    setStatsRefreshProgress(0);
    setStatsRefreshLoadingDisplayProgress(0);
    setStatsRefreshStatus("Replaying Backtest Trades");
    setLoadingProgressFromRatio(0);
    setLoadingProgressFromRatio(0.1);
    progressTimeoutId = window.setTimeout(() => {
      setLoadingProgressFromRatio(0.6);
    }, 350);
    requestTimeoutId = window.setTimeout(() => {
      requestController.abort();
      recoverReplayLocally();
    }, 90_000);

    computeBacktestRowsOnServer(
      replayPayload,
      requestController.signal
    )
      .then((finalizedRows) => {
        if (
          cancelled ||
          settled ||
          requestController.signal.aborted ||
          backtestHistoryJobIdRef.current !== nextJobId
        ) {
          return;
        }

        finalizeReplayRows(finalizedRows);
      })
      .catch(() => {
        if (cancelled || requestController.signal.aborted) {
          return;
        }

        recoverReplayLocally();
      });

    return () => {
      cancelled = true;
      requestController.abort();
      clearProgressTimeout();
      clearRequestTimeout();
      clearPhaseTransitionTimeout();
    };
  }, [
    backtestHasRun,
    backtestHistorySeedReady,
    backtestRunCount,
    backtestRefreshNowMs,
    setStatsRefreshTimelineRangeValue
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

  const shouldBuildCandleIndexByUnix =
    isChartOverlayHydrationActive ||
    isBacktestClusterHydrationActive ||
    (selectedSurfaceTab === "backtest" && selectedBacktestTab === "history") ||
    selectedHistoryId !== null ||
    activeBacktestTradeDetails !== null;
  const candleIndexByUnix = useMemo(() => {
    const map = new Map<number, number>();

    if (!shouldBuildCandleIndexByUnix || selectedChartCandles.length === 0) {
      return map;
    }

    for (let i = 0; i < selectedChartCandles.length; i += 1) {
      map.set(toUtcTimestamp(selectedChartCandles[i].time), i);
    }

    return map;
  }, [selectedChartCandles, shouldBuildCandleIndexByUnix]);

  const getHistoryCandlesForSymbol = useCallback((symbol: string): Candle[] => {
    const key = symbolTimeframeKey(symbol, selectedTimeframe);
    const byTimeframe = pickLongestCandleSeries(
      backtestSeriesMap[key],
      seriesMap[key]
    );
    if (byTimeframe && byTimeframe.length > 0) {
      return byTimeframe;
    }

    const byHistory = backtestHistorySeriesBySymbol[symbol];
    if (byHistory && byHistory.length > 0) {
      return byHistory;
    }

    return selectedChartCandles;
  }, [
    backtestHistorySeriesBySymbol,
    backtestSeriesMap,
    selectedChartCandles,
    selectedTimeframe,
    seriesMap
  ]);

  const openBacktestTradeDetails = (trade: HistoryItem) => {
    const detailCandles = getHistoryCandlesForSymbol(trade.symbol);
    const entryIndex = findCandleIndexAtOrBefore(
      detailCandles,
      Number(trade.entryTime) * 1000
    );
    const exitIndex = findCandleIndexAtOrBefore(
      detailCandles,
      Number(trade.exitTime) * 1000
    );

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
      entryIndex: entryIndex >= 0 ? entryIndex : undefined,
      exitIndex: exitIndex >= 0 ? exitIndex : undefined
    });
  };

  const activeBacktestTradeCandles = useMemo(() => {
    if (!activeBacktestTradeDetails) {
      return selectedChartCandles;
    }

    return getHistoryCandlesForSymbol(String(activeBacktestTradeDetails.symbol ?? ""));
  }, [activeBacktestTradeDetails, getHistoryCandlesForSymbol, selectedChartCandles]);

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

  const collectUiPreferences = useCallback(() => ({
    panelExpanded,
    workspacePanelWidth,
    activePanelTab,
    showAllTradesOnChart,
    showActiveTradeOnChart,
    backtestHistoryCollapsed,
    performanceStatsCollapsed,
    isGraphsCollapsed,
    aiZipClusterMapView,
    clusterLegendToggles,
    clusterViewDir,
    clusterViewSession,
    clusterViewMonth,
    clusterViewWeekday,
    clusterViewHour
  }), [
    activePanelTab,
    aiZipClusterMapView,
    backtestHistoryCollapsed,
    clusterLegendToggles,
    clusterViewDir,
    clusterViewHour,
    clusterViewMonth,
    clusterViewSession,
    clusterViewWeekday,
    isGraphsCollapsed,
    panelExpanded,
    performanceStatsCollapsed,
    showActiveTradeOnChart,
    showAllTradesOnChart,
    workspacePanelWidth
  ]);

  const applyUiPreferences = useCallback((prefs: Record<string, any>) => {
    if (prefs.panelExpanded != null) setPanelExpanded(Boolean(prefs.panelExpanded));
    if (prefs.workspacePanelWidth != null) {
      setWorkspacePanelWidth(resolveWorkspacePanelWidth(prefs.workspacePanelWidth));
    }
    if (isPanelTab(prefs.activePanelTab)) setActivePanelTab(prefs.activePanelTab);
    if (prefs.showAllTradesOnChart != null) {
      setShowAllTradesOnChart(Boolean(prefs.showAllTradesOnChart));
    }
    if (prefs.showActiveTradeOnChart != null) {
      setShowActiveTradeOnChart(Boolean(prefs.showActiveTradeOnChart));
    }
    if (prefs.backtestHistoryCollapsed != null) {
      setBacktestHistoryCollapsed(Boolean(prefs.backtestHistoryCollapsed));
    }
    if (prefs.performanceStatsCollapsed != null) {
      setPerformanceStatsCollapsed(Boolean(prefs.performanceStatsCollapsed));
    }
    if (prefs.isGraphsCollapsed != null) {
      setIsGraphsCollapsed(Boolean(prefs.isGraphsCollapsed));
    }
    if (prefs.aiZipClusterMapView === "2d" || prefs.aiZipClusterMapView === "3d") {
      setAiZipClusterMapView(prefs.aiZipClusterMapView);
    }
    if (prefs.clusterLegendToggles && typeof prefs.clusterLegendToggles === "object") {
      const next = { ...BACKTEST_CLUSTER_LEGEND_DEFAULTS };
      let changed = false;

      for (const key of Object.keys(next)) {
        if ((prefs.clusterLegendToggles as Record<string, unknown>)[key] != null) {
          next[key as keyof typeof next] = Boolean(
            (prefs.clusterLegendToggles as Record<string, unknown>)[key]
          );
          changed = true;
        }
      }

      if (changed) {
        setClusterLegendToggles(next);
      }
    }
    if (prefs.clusterViewDir === "All" || prefs.clusterViewDir === "Buy" || prefs.clusterViewDir === "Sell") {
      setClusterViewDir(prefs.clusterViewDir);
    }
    if (typeof prefs.clusterViewSession === "string") setClusterViewSession(prefs.clusterViewSession);
    if (typeof prefs.clusterViewMonth === "string") setClusterViewMonth(prefs.clusterViewMonth);
    if (typeof prefs.clusterViewWeekday === "string") setClusterViewWeekday(prefs.clusterViewWeekday);
    if (typeof prefs.clusterViewHour === "string") setClusterViewHour(prefs.clusterViewHour);
  }, [
    setActivePanelTab,
    setAiZipClusterMapView,
    setBacktestHistoryCollapsed,
    setClusterLegendToggles,
    setClusterViewDir,
    setClusterViewHour,
    setClusterViewMonth,
    setClusterViewSession,
    setClusterViewWeekday,
    setIsGraphsCollapsed,
    setPanelExpanded,
    setPerformanceStatsCollapsed,
    setShowActiveTradeOnChart,
    setShowAllTradesOnChart,
    setWorkspacePanelWidth
  ]);

  const collectSettings = useCallback(() => ({
    selectedSymbol,
    selectedTimeframe,
    selectedBacktestTimeframe,
    chartPanelLiveSimulationEnabled,
    activePanelLiveSimulationEnabled,
    minutePreciseEnabled,
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
    maxConcurrentTrades,
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
    knnNeighborSpace,
    selectedAiDomains,
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
    statsDatePreset,
    statsDateStart,
    statsDateEnd,
  }), [
    selectedSymbol, selectedTimeframe, selectedBacktestTimeframe, chartPanelLiveSimulationEnabled, activePanelLiveSimulationEnabled, minutePreciseEnabled,
    enabledBacktestWeekdays, enabledBacktestSessions,
    enabledBacktestMonths, enabledBacktestHours, aiMode, aiModelEnabled, aiFilterEnabled,
    staticLibrariesClusters, confidenceThreshold, aiExitStrictness, aiExitLossTolerance,
    aiExitWinTolerance, useMitExit, complexity, volatilityPercentile, tpDollars, slDollars,
    dollarsPerMove, maxBarsInTrade, maxConcurrentTrades, stopMode, breakEvenTriggerPct, trailingStartPct,
    trailingDistPct, aiModelStates, aiFeatureLevels, aiFeatureModes,
    selectedAiLibraries, selectedAiLibrarySettings, selectedAiLibraryId, aiBulkScope,
    aiBulkWeight, aiBulkStride, aiBulkMaxSamples, chunkBars, distanceMetric, knnNeighborSpace,
    selectedAiDomains, dimensionAmount, compressionMethod,
    kEntry, kExit, knnVoteMode, hdbMinClusterSize, hdbMinSamples, hdbEpsQuantile,
    hdbSampleCap, antiCheatEnabled, validationMode, realismLevel, propInitialBalance,
    propDailyMaxLoss, propTotalMaxLoss, propProfitTarget, propProjectionMethod,
    statsDatePreset, statsDateStart, statsDateEnd,
  ]);

  const applySettings = useCallback((s: Record<string, any>) => {
    if (s.selectedSymbol != null) setSelectedSymbol(s.selectedSymbol);
    if (s.selectedTimeframe != null) {
      setSelectedTimeframe(s.selectedTimeframe);
      if (s.selectedBacktestTimeframe == null) {
        setSelectedBacktestTimeframe(s.selectedTimeframe);
      }
    }
    if (s.selectedBacktestTimeframe != null) setSelectedBacktestTimeframe(s.selectedBacktestTimeframe);
    if (s.chartPanelLiveSimulationEnabled != null) {
      setChartPanelLiveSimulationEnabled(Boolean(s.chartPanelLiveSimulationEnabled));
    }
    if (s.activePanelLiveSimulationEnabled != null) {
      setActivePanelLiveSimulationEnabled(Boolean(s.activePanelLiveSimulationEnabled));
    } else if (s.chartPanelLiveSimulationEnabled != null) {
      setActivePanelLiveSimulationEnabled(Boolean(s.chartPanelLiveSimulationEnabled));
    }
    if (s.minutePreciseEnabled != null) setMinutePreciseEnabled(Boolean(s.minutePreciseEnabled));
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
    if (s.maxConcurrentTrades != null) {
      setMaxConcurrentTrades(clamp(Math.floor(Number(s.maxConcurrentTrades) || 1), 1, 500));
    }
    if (s.stopMode != null) setStopMode(s.stopMode);
    if (s.breakEvenTriggerPct != null) setBreakEvenTriggerPct(s.breakEvenTriggerPct);
    if (s.trailingStartPct != null) setTrailingStartPct(s.trailingStartPct);
    if (s.trailingDistPct != null) setTrailingDistPct(s.trailingDistPct);
    if (s.aiModelStates != null) setAiModelStates(s.aiModelStates);
    if (s.aiFeatureLevels != null) setAiFeatureLevels(s.aiFeatureLevels);
    if (s.aiFeatureModes != null) setAiFeatureModes(s.aiFeatureModes);
    const nextSelectedAiLibraries =
      s.selectedAiLibraries != null
        ? normalizeSelectedAiLibraries(s.selectedAiLibraries)
        : null;
    if (nextSelectedAiLibraries != null) {
      setSelectedAiLibraries(nextSelectedAiLibraries);
    }
    if (s.selectedAiLibrarySettings != null) setSelectedAiLibrarySettings(s.selectedAiLibrarySettings);
    if (nextSelectedAiLibraries != null) {
      setSelectedAiLibraryId((current) => {
        const rawId =
          s.selectedAiLibraryId != null
            ? String(s.selectedAiLibraryId ?? "")
            : String(current ?? "");
        return nextSelectedAiLibraries.includes(rawId)
          ? rawId
          : nextSelectedAiLibraries[0] ?? "";
      });
    } else if (s.selectedAiLibraryId != null) {
      setSelectedAiLibraryId(String(s.selectedAiLibraryId ?? ""));
    }
    if (s.aiBulkScope != null) setAiBulkScope(s.aiBulkScope);
    if (s.aiBulkWeight != null) setAiBulkWeight(s.aiBulkWeight);
    if (s.aiBulkStride != null) setAiBulkStride(s.aiBulkStride);
    if (s.aiBulkMaxSamples != null) setAiBulkMaxSamples(s.aiBulkMaxSamples);
    if (s.chunkBars != null) setChunkBars(s.chunkBars);
    if (s.distanceMetric != null) setDistanceMetric(s.distanceMetric);
    if (s.knnNeighborSpace != null) setKnnNeighborSpace(s.knnNeighborSpace);
    if (s.selectedAiDomains != null) setSelectedAiDomains(s.selectedAiDomains);
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
    if (isBacktestDatePreset(s.statsDatePreset)) setStatsDatePreset(s.statsDatePreset);
    if (s.statsDateStart != null) setStatsDateStart(s.statsDateStart);
    if (s.statsDateEnd != null) setStatsDateEnd(s.statsDateEnd);
  }, [normalizeSelectedAiLibraries]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const migrated = { ...parsed } as Record<string, unknown>;

        if (!isBacktestDatePreset(migrated.statsDatePreset)) {
          const hasStoredStart =
            typeof migrated.statsDateStart === "string" && migrated.statsDateStart.trim() !== "";
          const hasStoredEnd =
            typeof migrated.statsDateEnd === "string" && migrated.statsDateEnd.trim() !== "";

          if (!hasStoredStart && !hasStoredEnd) {
            const defaultRange = buildBacktestDateRangeFromPreset("pastYear");
            migrated.statsDatePreset = "pastYear";
            migrated.statsDateStart = defaultRange.startDate;
            migrated.statsDateEnd = defaultRange.endDate;
          } else {
            migrated.statsDatePreset = "custom";
          }
        }

        applySettings(migrated);
      }
    } catch { /* corrupt data – ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      applyUiPreferences(parsed);
    } catch {
      // Ignore corrupted UI preference data.
    }
  }, [applyUiPreferences]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(collectSettings()));
    } catch { /* storage full – ignore */ }
  }, [collectSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(collectUiPreferences()));
    } catch {
      // Ignore persistence failures (for example quota exceeded).
    }
  }, [collectUiPreferences]);


  const handleResetSettings = useCallback(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY);
    setSelectedSymbol(futuresAssets[0].symbol);
    setSelectedTimeframe("15m");
    setSelectedBacktestTimeframe("15m");
    setPanelExpanded(false);
    setWorkspacePanelWidth(WORKSPACE_PANEL_DEFAULT_WIDTH);
    setActivePanelTab("active");
    setShowAllTradesOnChart(false);
    setShowActiveTradeOnChart(false);
    setChartPanelLiveSimulationEnabled(false);
    setActivePanelLiveSimulationEnabled(false);
    setMinutePreciseEnabled(false);
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
    setMaxConcurrentTrades(1);
    setStopMode(0);
    setBreakEvenTriggerPct(50);
    setTrailingStartPct(50);
    setTrailingDistPct(30);
    setAiModelStates(buildInitialAiModelStates(settingsModelNames));
    setAiFeatureLevels(buildInitialAiFeatureLevels());
    setAiFeatureModes(buildInitialAiFeatureModes());
    setSelectedAiLibraries([]);
    setSelectedAiLibraryId("");
    setSelectedAiLibrarySettings(buildDefaultAiLibrarySettings(aiLibraryDefs));
    setAiBulkScope("active");
    setAiBulkWeight(100);
    setAiBulkStride(0);
    setAiBulkMaxSamples(10000);
    setChunkBars(24);
    setDistanceMetric("euclidean");
    setKnnNeighborSpace("post");
    setSelectedAiDomains(["Direction", "Model"]);
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
    setBacktestHistoryCollapsed(false);
    setPerformanceStatsCollapsed(false);
    setIsGraphsCollapsed(false);
    setAiZipClusterMapView("2d");
    setClusterLegendToggles({ ...BACKTEST_CLUSTER_LEGEND_DEFAULTS });
    setClusterViewDir("All");
    setClusterViewSession("All");
    setClusterViewMonth("All");
    setClusterViewWeekday("All");
    setClusterViewHour("All");
    const defaultDateRange = buildBacktestDateRangeFromPreset("pastYear");
    setStatsDatePreset("pastYear");
    setStatsDateStart(defaultDateRange.startDate);
    setStatsDateEnd(defaultDateRange.endDate);
  }, [aiLibraryDefs, settingsModelNames]);

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

  const handleOpenModelUpload = useCallback(() => {
    modelsUploadInputRef.current?.click();
  }, []);

  const handleUploadStrategyModels = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    try {
      const parsedModels: StrategyModelCatalogEntry[] = [];

      for (const file of files) {
        let parsedJson: unknown;

        try {
          parsedJson = JSON.parse(await file.text()) as unknown;
        } catch {
          throw new Error(`${file.name} is not valid JSON.`);
        }

        const parsedModel = parseStrategyModelCatalogEntry(parsedJson);

        if (!parsedModel) {
          throw new Error(`${file.name} is missing required Korra model fields.`);
        }

        parsedModels.push(parsedModel);
      }

      startTransition(() => {
        setUploadedStrategyModels((current) => {
          const next = new Map(current.map((model) => [model.id, model] as const));

          for (const model of parsedModels) {
            next.set(model.id, model);
          }

          return Array.from(next.values());
        });
        setModelsSurfaceNotice(
          `Uploaded ${parsedModels.length} model${parsedModels.length === 1 ? "" : "s"}.`
        );
        setModelsSurfaceNoticeTone("success");
      });
    } catch (error) {
      setModelsSurfaceNotice(error instanceof Error ? error.message : "Model upload failed.");
      setModelsSurfaceNoticeTone("error");
    } finally {
      event.target.value = "";
    }
  }, []);

  const handleImportAssistantStrategyModel = useCallback((draftJson: Record<string, unknown>) => {
    const parsedModel = parseStrategyModelCatalogEntry(draftJson);

    if (!parsedModel) {
      setModelsSurfaceNotice("Gideon returned an invalid model JSON.");
      setModelsSurfaceNoticeTone("error");
      return;
    }

    startTransition(() => {
      setUploadedStrategyModels((current) => {
        const next = new Map(current.map((model) => [model.id, model] as const));
        next.set(parsedModel.id, parsedModel);
        return Array.from(next.values());
      });
      setModelsSurfaceNotice(`Added ${parsedModel.name} to Models.`);
      setModelsSurfaceNoticeTone("success");
    });
  }, []);

  const handleDownloadStrategyModel = useCallback((model: StrategyModelCatalogEntry) => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${model.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);
  const openModelRunModal = useCallback(
    (model: StrategyModelCatalogEntry) => {
      const defaultPreset: BacktestPresetRange =
        statsDatePreset === "custom" ? "pastMonth" : statsDatePreset;

      setModelRunModalModelId(model.id);
      setModelRunTimeframe(selectedBacktestTimeframe);
      setModelRunPreset(defaultPreset);
      setModelRunTpDollars(Math.max(0, Number.isFinite(tpDollars) ? tpDollars : 0));
      setModelRunSlDollars(Math.max(0, Number.isFinite(slDollars) ? slDollars : 0));
      setModelRunUnits(Math.max(1, Number.isFinite(dollarsPerMove) ? dollarsPerMove : 1));
      setModelRunPresetDdOpen(false);
      setModelRunTimeframeDdOpen(false);
      setModelRunRunning(false);
      setModelRunError("");
      setModelRunResult(null);
    },
    [dollarsPerMove, selectedBacktestTimeframe, slDollars, statsDatePreset, tpDollars]
  );

  const closeModelRunModal = useCallback(() => {
    setModelRunModalModelId(null);
    setModelRunPresetDdOpen(false);
    setModelRunTimeframeDdOpen(false);
    setModelRunRunning(false);
    setModelRunError("");
    setModelRunResult(null);
  }, []);

  const handleDeleteStrategyModel = useCallback(
    (model: StrategyModelCatalogEntry) => {
      setUploadedStrategyModels((current) => current.filter((entry) => entry.id !== model.id));
      setModelsSurfaceNotice(`Removed ${model.name}.`);
      setModelsSurfaceNoticeTone("success");
      if (modelRunModalModelId === model.id) {
        closeModelRunModal();
      }
    },
    [closeModelRunModal, modelRunModalModelId]
  );

  const handleRunModelBacktest = useCallback(async () => {
    if (!activeModelRunEntry) {
      return;
    }

    const safeTpDollars = Math.max(
      0,
      Number.isFinite(modelRunTpDollars) ? modelRunTpDollars : 0
    );
    const safeSlDollars = Math.max(
      0,
      Number.isFinite(modelRunSlDollars) ? modelRunSlDollars : 0
    );
    const safeUnits = Math.max(1, Number.isFinite(modelRunUnits) ? modelRunUnits : 1);
    const { startDate, endDate } = buildBacktestDateRangeFromPreset(modelRunPreset);
    const request: ModelRunRequest = {
      modelId: activeModelRunEntry.id,
      modelName: activeModelRunEntry.name,
      symbol: selectedSymbol,
      timeframe: modelRunTimeframe,
      preset: modelRunPreset,
      tpDollars: safeTpDollars,
      slDollars: safeSlDollars,
      units: safeUnits,
      startDate,
      endDate
    };

    setModelRunRunning(true);
    setModelRunError("");

    try {
      const candleKey = symbolTimeframeKey(selectedSymbol, modelRunTimeframe);
      const leadingBars = Math.max(chunkBars * 3, maxBarsInTrade + 24);
      const targetBars = estimateHistoryBarsForDateRange(
        startDate,
        endDate,
        modelRunTimeframe,
        leadingBars
      );
      const historyRequestWindow =
        startDate && endDate
          ? buildHistoryApiRequestWindow({
              timeframe: modelRunTimeframe,
              startYmd: startDate,
              endYmd: endDate,
              leadingBars
            })
          : null;
      let candles = pickLongestCandleSeries(
        backtestSeriesMap[candleKey],
        seriesMap[candleKey]
      );

      if (
        candles.length < MIN_SEED_CANDLES ||
        !candlesCoverDateRange(candles, modelRunTimeframe, startDate, endDate, leadingBars)
      ) {
        candles = await fetchHybridHistoryCandles(
          modelRunTimeframe,
          targetBars,
          undefined,
          !historyRequestWindow,
          CLIENT_CANDLE_FETCH_TIMEOUT_MS,
          {
            requestWindow: historyRequestWindow ?? undefined,
            coverageWindow:
              startDate && endDate
                ? {
                    startYmd: startDate,
                    endYmd: endDate,
                    leadingBars,
                    strictCoverage: true
                  }
                : undefined
          }
        );

        if (candles.length >= MIN_SEED_CANDLES && candles.length > (seriesMap[candleKey]?.length ?? 0)) {
          setSeriesMap((current) => ({
            ...current,
            [candleKey]: candles
          }));
        }
      }

      candles = filterCandlesToDateRange(
        candles,
        modelRunTimeframe,
        startDate,
        endDate,
        leadingBars
      );

      if (candles.length < 3) {
        throw new Error("Not enough history was available to run this model.");
      }

      const runtimeProfile =
        resolveStrategyRuntimeModelProfile(activeModelRunEntry.id) ??
        resolveStrategyRuntimeModelProfile(activeModelRunEntry.name);
      const fallbackProfile = createSyntheticModelProfile(activeModelRunEntry.name);
      const blueprints = buildStrategyReplayTradeBlueprints({
        candles,
        models: [
          {
            id: activeModelRunEntry.id,
            name: activeModelRunEntry.name,
            riskMin: runtimeProfile?.riskMin ?? fallbackProfile.riskMin,
            riskMax: runtimeProfile?.riskMax ?? fallbackProfile.riskMax,
            rrMin: runtimeProfile?.rrMin ?? fallbackProfile.rrMin,
            rrMax: runtimeProfile?.rrMax ?? fallbackProfile.rrMax,
            longBias: runtimeProfile?.longBias ?? fallbackProfile.longBias,
            state: 2
          }
        ],
        symbol: selectedSymbol,
        unitsPerMove: safeUnits,
        chunkBars,
        strategyCatalog: modelsSurfaceCatalog,
        tpDollars: safeTpDollars,
        slDollars: safeSlDollars,
        stopMode,
        breakEvenTriggerPct,
        trailingStartPct,
        trailingDistPct,
        maxBarsInTrade
      });
      const trades = filterTradesByDateRange(
        computeBacktestRowsLocally({
          blueprints,
          candleSeriesBySymbol: {
            [selectedSymbol]: candles
          },
          minutePreciseEnabled: false,
          modelNamesById: {
            [activeModelRunEntry.id]: activeModelRunEntry.name
          },
          tpDollars: safeTpDollars,
          slDollars: safeSlDollars,
          stopMode,
          breakEvenTriggerPct,
          trailingStartPct,
          trailingDistPct,
          limit: Math.max(1, blueprints.length)
        }),
        startDate,
        endDate
      );
      const summary = summarizeBacktestTradesFallback(trades, () => 0.5);
      const result: ModelRunResult = {
        request,
        trades,
        summary,
        chartData: buildModelRunChartData(trades),
        candleCount: candles.length
      };

      startTransition(() => {
        setModelRunResult(result);
      });
    } catch (error) {
      setModelRunResult(null);
      setModelRunError(error instanceof Error ? error.message : "Model run failed.");
    } finally {
      setModelRunRunning(false);
    }
  }, [
    activeModelRunEntry,
    backtestSeriesMap,
    breakEvenTriggerPct,
    chunkBars,
    maxBarsInTrade,
    modelRunPreset,
    modelRunSlDollars,
    modelRunTimeframe,
    modelRunTpDollars,
    modelRunUnits,
    modelsSurfaceCatalog,
    selectedSymbol,
    seriesMap,
    stopMode,
    trailingDistPct,
    trailingStartPct
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (raw) setSavedPresets(JSON.parse(raw));
    } catch { /* corrupt */ }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOADED_STRATEGY_MODELS_STORAGE_KEY);

      if (!raw) {
        setUploadedStrategyModelsReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;

      if (!Array.isArray(parsed)) {
        setUploadedStrategyModelsReady(true);
        return;
      }

      const models = parsed
        .map((entry) => parseStrategyModelCatalogEntry(entry))
        .filter((entry): entry is StrategyModelCatalogEntry => entry !== null);

      setUploadedStrategyModels(models);

      if (models.length !== parsed.length) {
        setModelsSurfaceNotice("Some saved uploaded models were skipped because they were invalid.");
        setModelsSurfaceNoticeTone("error");
      }
    } catch {
      setModelsSurfaceNotice("Saved uploaded models could not be restored.");
      setModelsSurfaceNoticeTone("error");
    } finally {
      setUploadedStrategyModelsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!uploadedStrategyModelsReady) {
      return;
    }

    try {
      localStorage.setItem(
        UPLOADED_STRATEGY_MODELS_STORAGE_KEY,
        JSON.stringify(uploadedStrategyModels)
      );
    } catch {
      // Ignore storage quota failures and keep the in-memory model library usable.
    }
  }, [uploadedStrategyModels, uploadedStrategyModelsReady]);

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
    if (!chartContextMenu) {
      return;
    }

    const close = () => setChartContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    const onDown = (event: MouseEvent) => {
      if (event.button !== 2) {
        const target = event.target as Node | null;
        if (target && chartContextMenuRef.current?.contains(target)) {
          return;
        }
        close();
      }
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [chartContextMenu]);

  useEffect(() => {
    if (isChartSurface) {
      return;
    }

    setChartContextMenu(null);
  }, [isChartSurface, selectedSurfaceTab]);

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
    if (!terminalViewStateReady) {
      return;
    }

    let disposed = false;
    let teardown: (() => void) | undefined;

    const initializeChart = async () => {
      try {
        const container = chartContainerRef.current;

        if (!container || chartRef.current) {
          return;
        }

        const { createChart } = await loadLightweightCharts();

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
          chartHoverCandleRef.current = null;
          return;
        }

        const crosshairTime = parseTimeFromCrosshair(param.time);
        setHoveredTime(crosshairTime);

        const hoveredBar = param.seriesData?.get(candleSeries) as
          | { open?: number; high?: number; low?: number; close?: number }
          | undefined;

        const open = hoveredBar?.open;
        const high = hoveredBar?.high;
        const low = hoveredBar?.low;
        const close = hoveredBar?.close;

        if (
          crosshairTime === null ||
          typeof open !== "number" ||
          !Number.isFinite(open) ||
          typeof high !== "number" ||
          !Number.isFinite(high) ||
          typeof low !== "number" ||
          !Number.isFinite(low) ||
          typeof close !== "number" ||
          !Number.isFinite(close)
        ) {
          chartHoverCandleRef.current = null;
          return;
        }

        chartHoverCandleRef.current = {
          time: crosshairTime,
          open,
          high,
          low,
          close,
          index: chartBarIndexByGaplessTimeRef.current.get(crosshairTime) ?? null
        };
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
        const onContextMenu = (event: MouseEvent) => {
        const candle = chartHoverCandleRef.current;

        if (!candle) {
          return;
        }

        event.preventDefault();
        setChartContextMenu({
          clientX: event.clientX,
          clientY: event.clientY,
          candle
        });
      };
        container.addEventListener("contextmenu", onContextMenu);
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
        if (!isChartSurfaceTab(selectedSurfaceTabRef.current)) {
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

        if (!isChartSurfaceTab(selectedSurfaceTabRef.current)) {
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
        container.removeEventListener("contextmenu", onContextMenu);
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
        chartHoverCandleRef.current = null;
        chartBarIndexByGaplessTimeRef.current = new Map();
        aiChartOverlaySeriesRef.current = [];
        aiChartPriceLinesRef.current = [];
        aiDynamicChartOverlaySeriesRef.current = [];
        aiDynamicChartPriceLinesRef.current = [];
        aiChartMarkersRef.current = [];
        aiDynamicChartMarkersRef.current = [];
        baseChartMarkersRef.current = [];
        lastAssistantDrawActionsRef.current = [];
        dynamicAssistantActionsRef.current = [];
        };

        if (disposed) {
          teardown();
          teardown = undefined;
        }
      } catch (error) {
        console.error("Failed to initialize chart", error);
      }
    };

    void initializeChart();

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [terminalViewStateReady]);

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
      chartBarIndexByGaplessTimeRef.current = new Map();
      chartHoverCandleRef.current = null;
      return;
    }

    const barIndexByTime = new Map<number, number>();
    const candleData: CandlestickData<UTCTimestamp>[] = chartRenderCandles.map((candle, index) => {
      const gaplessTime = toGaplessUtc(candle.time) as number;
      barIndexByTime.set(gaplessTime, chartRenderWindow.from + index);

      return {
        time: gaplessTime as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      };
    });
    chartBarIndexByGaplessTimeRef.current = barIndexByTime;
    if (chartHoverCandleRef.current) {
      const hoverTime = chartHoverCandleRef.current.time;
      const hoverIndex = barIndexByTime.get(hoverTime);
      chartHoverCandleRef.current =
        hoverIndex === undefined ? null : { ...chartHoverCandleRef.current, index: hoverIndex };
    }

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
      const savedVisibleSpan = savedLogicalRange ? Math.max(1, savedLogicalRange.to - savedLogicalRange.from) : 0;
      candleSeries.setData(candleData);

      if (pendingRange) {
        chart.timeScale().setVisibleLogicalRange({
          from: pendingRange.from - chartRenderWindow.from,
          to: pendingRange.to - chartRenderWindow.from
        });
        const allCandles = selectedChartCandlesRef.current;
        if (allCandles.length > 0) {
          const centerIndex = Math.round((pendingRange.from + pendingRange.to) / 2);
          const clampedCenterIndex = Math.max(0, Math.min(centerIndex, allCandles.length - 1));
          chartViewCenterTimeMsRef.current = allCandles[clampedCenterIndex]?.time ?? null;
        }
        chartPendingVisibleGlobalRangeRef.current = null;
      } else if (savedLogicalRange) {
        const allCandles = selectedChartCandlesRef.current;
        const centerTimeMs = chartViewCenterTimeMsRef.current;

        if (centerTimeMs !== null && allCandles.length > 0) {
          const centerIndexRaw = findCandleIndexAtOrBefore(allCandles, centerTimeMs);
          const centerIndex = centerIndexRaw < 0 ? 0 : centerIndexRaw;
          const anchoredVisibleRange = clampChartDataWindow(
            allCandles.length,
            centerIndex - savedVisibleSpan / 2,
            centerIndex + savedVisibleSpan / 2
          );
          const anchoredCenterIndex = Math.round((anchoredVisibleRange.from + anchoredVisibleRange.to) / 2);
          const clampedAnchorCenter = Math.max(0, Math.min(anchoredCenterIndex, allCandles.length - 1));

          chartVisibleGlobalRangeRef.current = anchoredVisibleRange;
          chart.timeScale().setVisibleLogicalRange({
            from: anchoredVisibleRange.from - chartRenderWindow.from,
            to: anchoredVisibleRange.to - chartRenderWindow.from
          });
          chartViewCenterTimeMsRef.current = allCandles[clampedAnchorCenter]?.time ?? null;
        } else {
          chart.timeScale().setVisibleLogicalRange(savedLogicalRange);
        }
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
    if (!isChartSurface) {
      return;
    }

    if (chartHistoryLoadingKey !== null) {
      return;
    }

    if (chartResetAfterLoadKeyRef.current !== selectedKey) {
      return;
    }

    if (selectedCandles.length === 0) {
      return;
    }

    chartResetAfterLoadKeyRef.current = null;

    const resetFrame = window.requestAnimationFrame(() => {
      resetChart();
    });

    return () => {
      window.cancelAnimationFrame(resetFrame);
    };
  }, [
    chartHistoryLoadingKey,
    isChartSurface,
    resetChart,
    selectedCandles.length,
    selectedKey,
    selectedSurfaceTab
  ]);

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

      applyBacktestSettingsSnapshot({ forceFullReload: true });
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
      const isSpace =
        event.code === "Space" || event.key === " " || event.key === "Spacebar";
      if (!isSpace) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as any).isContentEditable)
      ) {
        return;
      }

      event.preventDefault();

      if (event.repeat) {
        return;
      }

      if (
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
      const isSpace =
        event.code === "Space" || event.key === " " || event.key === "Spacebar";
      if (!isSpace) {
        return;
      }

      event.preventDefault();

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
    if (!isChartSurface) {
      return;
    }

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
    isChartSurface,
    selectedChartCandles,
    selectedHistoryInteractionTick,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;

    if (!chart || !container) {
      return;
    }

    if (!isChartSurface) {
      return;
    }

    let frame = 0;
    let attempts = 0;
    const syncChartSize = () => {
      const width = Math.floor(container.clientWidth);
      const height = Math.floor(container.clientHeight);

      if (width <= 0 || height <= 0) {
        if (attempts < 24) {
          attempts += 1;
          frame = window.requestAnimationFrame(syncChartSize);
        }
        return;
      }

      if (chartSizeRef.current.width === width && chartSizeRef.current.height === height) {
        return;
      }

      chartSizeRef.current = { width, height };
      chart.applyOptions({ width, height });
    };

    frame = window.requestAnimationFrame(syncChartSize);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [panelExpanded, activePanelTab, isChartSurface, selectedSurfaceTab]);

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

    if (!isChartSurface) {
      for (const seriesGroup of multiTradeSeriesRef.current) {
        chart.removeSeries(seriesGroup.profitZone);
        chart.removeSeries(seriesGroup.lossZone);
        chart.removeSeries(seriesGroup.entryLine);
        chart.removeSeries(seriesGroup.targetLine);
        chart.removeSeries(seriesGroup.stopLine);
        chart.removeSeries(seriesGroup.pathLine);
      }
      multiTradeSeriesRef.current = [];
      applyCombinedChartMarkers([]);
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);
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
      applyCombinedChartMarkers([]);
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

    const getTradeOverlayGeometry = (
      trade: {
        entryTime: UTCTimestamp;
        exitTime: UTCTimestamp;
      },
      options?: { extendThroughNextBar?: boolean }
    ) => {
      const extendThroughNextBar = options?.extendThroughNextBar === true;
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
      const rangeEndTime = extendThroughNextBar
        ? exitIndex >= 0 && exitIndex + 1 < selectedChartCandles.length
          ? toGaplessUtc(selectedChartCandles[exitIndex + 1]!.time)
          : ((exitTime + stepSeconds) as UTCTimestamp)
        : exitTime;

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
      const { rangeStartTime, startTime, exitTime, rangeEndTime } = getTradeOverlayGeometry(
        {
          entryTime: trade.entryTime,
          exitTime: trade.exitTime
        },
        { extendThroughNextBar: trade.status === "pending" }
      );
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

      applyCombinedChartMarkers([
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
        applyCombinedChartMarkers([]);
        return;
      }

      const allMarkers: SeriesMarker<Time>[] = [];

      for (const trade of currentSymbolHistoryRows) {
        const tradeResult: TradeResult = trade.result;
        const { rangeStartTime, startTime, exitTime, rangeEndTime } = getTradeOverlayGeometry(
          {
            entryTime: trade.entryTime,
            exitTime: trade.exitTime
          },
          { extendThroughNextBar: false }
        );
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
      applyCombinedChartMarkers(allMarkers);
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
    applyCombinedChartMarkers,
    currentSymbolHistoryRows,
    isChartSurface,
    selectedChartCandles,
    selectedHistoryInteractionTick,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe,
    showActiveTradeOnChart,
    showAllTradesOnChart,
    selectedSurfaceTab,
    toGaplessUtc
  ]);

  const fallbackBacktestDateFilteredTrades = useMemo(() => {
    return filterTradesByDateRange(
      backtestSourceTrades,
      appliedBacktestSettings.statsDateStart,
      appliedBacktestSettings.statsDateEnd
    );
  }, [
    appliedBacktestSettings.statsDateEnd,
    appliedBacktestSettings.statsDateStart,
    backtestSourceTrades
  ]);

  const fallbackBacktestTimeFilteredTrades = useMemo(() => {
    return filterTradesBySessionBuckets(fallbackBacktestDateFilteredTrades, {
      enabledBacktestWeekdays: appliedBacktestSettings.enabledBacktestWeekdays,
      enabledBacktestSessions: appliedBacktestSettings.enabledBacktestSessions,
      enabledBacktestMonths: appliedBacktestSettings.enabledBacktestMonths,
      enabledBacktestHours: appliedBacktestSettings.enabledBacktestHours
    });
  }, [
    appliedBacktestSettings.enabledBacktestHours,
    appliedBacktestSettings.enabledBacktestMonths,
    appliedBacktestSettings.enabledBacktestSessions,
    appliedBacktestSettings.enabledBacktestWeekdays,
    fallbackBacktestDateFilteredTrades
  ]);

  const backtestDateFilteredTrades = useMemo(() => {
    return shouldComputePanelAnalyticsOnServer && panelAnalyticsStatus === "ready"
      ? antiCheatBacktestContext.dateFilteredTrades
      : fallbackBacktestDateFilteredTrades;
  }, [
    antiCheatBacktestContext.dateFilteredTrades,
    fallbackBacktestDateFilteredTrades,
    panelAnalyticsStatus,
    shouldComputePanelAnalyticsOnServer
  ]);

  const backtestTimeFilteredTrades = useMemo(() => {
    return shouldComputePanelAnalyticsOnServer && panelAnalyticsStatus === "ready"
      ? antiCheatBacktestContext.timeFilteredTrades
      : fallbackBacktestTimeFilteredTrades;
  }, [
    antiCheatBacktestContext.timeFilteredTrades,
    fallbackBacktestTimeFilteredTrades,
    panelAnalyticsStatus,
    shouldComputePanelAnalyticsOnServer
  ]);

  const backtestLibraryCandidateTrades = useMemo(() => {
    return shouldComputePanelAnalyticsOnServer && panelAnalyticsStatus === "ready"
      ? antiCheatBacktestContext.libraryCandidateTrades
      : fallbackBacktestTimeFilteredTrades;
  }, [
    antiCheatBacktestContext.libraryCandidateTrades,
    fallbackBacktestTimeFilteredTrades,
    panelAnalyticsStatus,
    shouldComputePanelAnalyticsOnServer
  ]);

  const backtestTrades = useMemo(() => {
    return backtestTimeFilteredTrades.filter((trade) => {
      if (appliedConfidenceGateDisabled) {
        return true;
      }

      return (
        getEffectiveTradeConfidenceScore(trade) * 100 >=
        appliedEffectiveConfidenceThreshold
      );
    });
  }, [
    appliedConfidenceGateDisabled,
    appliedEffectiveConfidenceThreshold,
    backtestTimeFilteredTrades,
    getEffectiveTradeConfidenceScore
  ]);
  const deferredBacktestTab = useDeferredValue(selectedBacktestTab);
  const deferredBacktestAnalyticsTrades = useDeferredValue(backtestTrades);
  const isBacktestAnalyticsVisible = selectedSurfaceTab === "backtest";
  const isHistoryBacktestTabActive =
    isBacktestAnalyticsVisible && deferredBacktestTab === "history";
  const isCalendarBacktestTabActive =
    isBacktestAnalyticsVisible && deferredBacktestTab === "calendar";
  const isClusterBacktestTabActive =
    isBacktestAnalyticsVisible && deferredBacktestTab === "cluster";
  const isPerformanceStatsBacktestTabActive =
    isBacktestAnalyticsVisible && deferredBacktestTab === "performanceStats";
  const isEntryExitBacktestTabActive =
    isBacktestAnalyticsVisible && deferredBacktestTab === "entryExit";
  const isPropFirmBacktestTabActive =
    isBacktestAnalyticsVisible && deferredBacktestTab === "propFirm";
  const shouldComputeBacktestAnalyticsOnServer =
    isBacktestAnalyticsVisible &&
    (
      isCalendarBacktestTabActive ||
      isPerformanceStatsBacktestTabActive ||
      isEntryExitBacktestTabActive ||
      isClusterBacktestTabActive ||
      (deferredBacktestTab === "mainStats" && appliedBacktestSettings.aiMode !== "off")
    );
  const isBacktestTabDataPending = selectedBacktestTab !== deferredBacktestTab;
  const isBacktestHistorySeedBlocked =
    statsRefreshStatus === "Historical Candle Range Unavailable";
  const isBacktestTabHistoryPending = backtestHasRun && !backtestHistorySeedReady;
  const shouldShowBacktestInlineLoader =
    isBacktestSurfaceSettled &&
    backtestInlineLoaderTabs.has(selectedBacktestTab) &&
    (isBacktestTabDataPending || (isBacktestTabHistoryPending && !isBacktestHistorySeedBlocked));
  const backtestInlineLoaderLabel =
    selectedBacktestTab === "dimensions"
      ? "Building dimension statistics..."
      : isBacktestTabHistoryPending
        ? "Loading backtest data..."
        : "Loading tab data...";

  const baselineMainStatsTrades = useMemo(
    () => backtestTimeFilteredTrades,
    [backtestTimeFilteredTrades]
  );
  const backtestSourceDiagnosticsKeyRef = useRef("");
  useEffect(() => {
    if (!isClusterBacktestTabActive || appliedBacktestSettings.aiMode === "off") {
      return;
    }

    const trades = panelAnalyticsData.timeFilteredTrades;
    const tradesWithEntryNeighbors = trades.reduce((count, trade) => {
      return count + (Array.isArray((trade as any).entryNeighbors) && (trade as any).entryNeighbors.length > 0 ? 1 : 0);
    }, 0);
    const tradesWithClosestClusterUid = trades.reduce((count, trade) => {
      return count + (String((trade as any).closestClusterUid ?? "").trim() ? 1 : 0);
    }, 0);
    const codes: string[] = [];

    if (!shouldComputePanelAnalyticsOnServer) {
      codes.push("PANEL_ANALYTICS_SKIPPED");
    } else if (panelAnalyticsCanonicalLibrariesMissingPoints) {
      codes.push("PANEL_ANALYTICS_SKIPPED_MISSING_CANONICAL_LIBRARY_POINTS");
    } else if (panelAnalyticsStatus === "error") {
      codes.push("PANEL_ANALYTICS_SERVER_ERROR");
    } else if (panelAnalyticsStatus === "ready" && trades.length > 0) {
      if (tradesWithEntryNeighbors === 0) {
        codes.push("PANEL_ANALYTICS_READY_BUT_NO_ENTRY_NEIGHBORS");
      }
      if (tradesWithClosestClusterUid === 0) {
        codes.push("PANEL_ANALYTICS_READY_BUT_NO_CLOSEST_CLUSTER_UID");
      }
    }

    if (codes.length === 0) {
      return;
    }

    const summary = {
      aiMode: appliedBacktestSettings.aiMode,
      antiCheatEnabled: appliedBacktestSettings.antiCheatEnabled,
      selectedAiLibraries: [...appliedBacktestSettings.selectedAiLibraries],
      shouldComputePanelAnalyticsOnServer,
      panelAnalyticsCanonicalLibrariesMissingPoints,
      panelAnalyticsStatus,
      panelSourceTrades: panelSourceTrades.length,
      activePanelSourceTrades: activePanelSourceTrades.length,
      timeFilteredTrades: trades.length,
      tradesWithEntryNeighbors,
      tradesWithClosestClusterUid
    };
    const key = JSON.stringify({
      codes,
      panelAnalyticsStatus,
      shouldComputePanelAnalyticsOnServer,
      panelAnalyticsCanonicalLibrariesMissingPoints,
      panelSourceTrades: panelSourceTrades.length,
      activePanelSourceTrades: activePanelSourceTrades.length,
      timeFilteredTrades: trades.length,
      tradesWithEntryNeighbors,
      tradesWithClosestClusterUid
    });

    if (backtestSourceDiagnosticsKeyRef.current === key) {
      return;
    }
    backtestSourceDiagnosticsKeyRef.current = key;

    console.error(
      `[AIZip][BacktestSourceDiagnostics] ${codes.join(", ")}`,
      summary
    );
  }, [
    activePanelSourceTrades.length,
    appliedBacktestSettings.aiMode,
    appliedBacktestSettings.antiCheatEnabled,
    appliedBacktestSettings.selectedAiLibraries,
    isClusterBacktestTabActive,
    panelAnalyticsData.timeFilteredTrades,
    panelAnalyticsStatus,
    panelAnalyticsCanonicalLibrariesMissingPoints,
    panelSourceTrades.length,
    shouldComputePanelAnalyticsOnServer
  ]);
  const backtestAnalyticsConfidenceEntries = useMemo(
    () =>
      shouldComputePanelAnalyticsOnServer && panelAnalyticsStatus === "ready"
        ? panelAnalyticsData.confidenceByIdEntries
        : [],
    [panelAnalyticsData.confidenceByIdEntries, panelAnalyticsStatus, shouldComputePanelAnalyticsOnServer]
  );
  const [backtestAnalyticsData, setBacktestAnalyticsData] =
    useState<BacktestAnalyticsServerResponse>(EMPTY_BACKTEST_ANALYTICS_RESPONSE);
  useEffect(() => {
    if (!isBacktestAnalyticsVisible || !backtestHasRun || !backtestHistorySeedReady) {
      return;
    }

    if (
      !shouldComputeBacktestAnalyticsOnServer ||
      (backtestTrades.length === 0 && baselineMainStatsTrades.length === 0)
    ) {
      setBacktestAnalyticsData(
        buildBacktestAnalyticsFallbackResponse({
          backtestTrades,
          baselineMainStatsTrades,
          selectedBacktestDateKey,
          aiMode: appliedBacktestSettings.aiMode,
          confidenceGateDisabled: appliedConfidenceGateDisabled,
          confidenceResolver: getEffectiveTradeConfidenceScore
        })
      );
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    computeBacktestAnalyticsOnServer(
      {
        backtestTrades,
        baselineMainStatsTrades,
        confidenceByIdEntries: backtestAnalyticsConfidenceEntries,
        aiMode: appliedBacktestSettings.aiMode,
        confidenceGateDisabled: appliedConfidenceGateDisabled,
        selectedBacktestDateKey,
        performanceStatsModel,
        isCalendarBacktestTabActive,
        isPerformanceStatsBacktestTabActive,
        isEntryExitBacktestTabActive,
        isClusterBacktestTabActive
      },
      controller.signal
    )
      .then((result) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setBacktestAnalyticsData(result);
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setBacktestAnalyticsData(
          buildBacktestAnalyticsFallbackResponse({
            backtestTrades,
            baselineMainStatsTrades,
            selectedBacktestDateKey,
            aiMode: appliedBacktestSettings.aiMode,
            confidenceGateDisabled: appliedConfidenceGateDisabled,
            confidenceResolver: getEffectiveTradeConfidenceScore
          })
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    appliedBacktestSettings.aiMode,
    appliedConfidenceGateDisabled,
    baselineMainStatsTrades,
    backtestHasRun,
    backtestHistorySeedReady,
    backtestTrades,
    getEffectiveTradeConfidenceScore,
    isBacktestAnalyticsVisible,
    isCalendarBacktestTabActive,
    isClusterBacktestTabActive,
    isEntryExitBacktestTabActive,
    isPerformanceStatsBacktestTabActive,
    backtestAnalyticsConfidenceEntries,
    performanceStatsModel,
    selectedBacktestDateKey,
    shouldComputeBacktestAnalyticsOnServer
  ]);

  const backtestSummary = backtestAnalyticsData.backtestSummary;
  const baselineMainStatsSummary = backtestAnalyticsData.baselineMainStatsSummary;
  const mainStatsSummary = backtestAnalyticsData.mainStatsSummary;
  const mainStatsSessionRows = backtestAnalyticsData.mainStatsSessionRows;
  const mainStatsModelRows = backtestAnalyticsData.mainStatsModelRows;
  const mainStatsMonthRows = backtestAnalyticsData.mainStatsMonthRows;
  const mainStatsAiEfficiency = backtestAnalyticsData.mainStatsAiEfficiency;
  const mainStatsAiEffectivenessPct = backtestAnalyticsData.mainStatsAiEffectivenessPct;
  const mainStatsAiEfficacyPct = backtestAnalyticsData.mainStatsAiEfficacyPct;
  const entryExitStats = backtestAnalyticsData.entryExitStats;
  const entryExitChartData = backtestAnalyticsData.entryExitChartData;
  const copytradeDashboardSeed = useMemo(() => {
    if (!backtestHasRun || !backtestHistorySeedReady) {
      return null;
    }

    return buildCopytradeDashboardSeed(backtestTrades, getEffectiveTradeConfidenceScore);
  }, [
    backtestHasRun,
    backtestHistorySeedReady,
    backtestTrades,
    getEffectiveTradeConfidenceScore
  ]);
  const copytradeDashboardVersion = copytradeDashboardSeed?.updatedAt ?? "empty";
  const copytradeIframeSrc = useMemo(() => {
    const origin = typeof window === "undefined" ? "https://korra.local" : window.location.origin;
    const baseRoute =
      typeof window === "undefined"
        ? DEFAULT_COPYTRADE_ROUTE
        : normalizeCopytradeRestoredPath(
            window.localStorage.getItem(COPYTRADE_LAST_ROUTE_STORAGE_KEY)
          );

    if (!baseRoute.startsWith("/settings/account")) {
      return baseRoute;
    }

    try {
      const parsed = new URL(baseRoute, origin);
      parsed.searchParams.set("seed", String(copytradeDashboardVersion));
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return `${DEFAULT_COPYTRADE_ROUTE}&seed=${encodeURIComponent(
        String(copytradeDashboardVersion)
      )}`;
    }
  }, [copytradeDashboardVersion]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (!copytradeDashboardSeed) {
        localStorage.removeItem(COPYTRADE_BACKTEST_STATE_KEY);
        return;
      }

      localStorage.setItem(
        COPYTRADE_BACKTEST_STATE_KEY,
        JSON.stringify(copytradeDashboardSeed)
      );
    } catch {
      // Copy-trade hydration is additive only; ignore storage failures.
    }
  }, [copytradeDashboardSeed]);
  const resolveLibrarySettingsSnapshot = useCallback(
    (definition: AiLibraryDef, source?: AiLibrarySettings) => {
      const settingsSource = source ?? selectedAiLibrarySettings;
      return normalizeResolvedAiLibrarySettings(
        definition,
        settingsSource[definition.id]
      );
    },
    [selectedAiLibrarySettings]
  );

  const resolveLibraryDollarValue = useCallback(
    (value: AiLibrarySettingValue | undefined, fallback: number) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
      }
      return parsed;
    },
    []
  );

  const resolveLibraryBacktestSnapshot = useCallback(
    (snapshot?: BacktestSettingsSnapshot) => {
      return snapshot ?? liveBacktestSettingsRef.current;
    },
    []
  );

  const buildLibraryModelSelectionKey = useCallback(
    (settings: BacktestSettingsSnapshot) => {
      const parts: string[] = [];

      for (const modelName of settingsModelNames) {
        const state = settings.aiModelStates[modelName] ?? 0;
        if (state <= 0) {
          continue;
        }
        parts.push(`${createModelId(modelName)}:${state}`);
      }

      return parts.length > 0 ? parts.join(",") : "none";
    },
    [settingsModelNames]
  );

  const resolveLibraryModelProfiles = useCallback(
    (settings: BacktestSettingsSnapshot) => {
      return settingsModelNames
        .filter((modelName) => (settings.aiModelStates[modelName] ?? 0) > 0)
        .map((modelName) => modelProfileById[createModelId(modelName)] ?? null)
        .filter((model): model is ModelProfile => model !== null);
    },
    [modelProfileById, settingsModelNames]
  );

  const ensureLibraryHistorySeed = useCallback(
    async (settings: BacktestSettingsSnapshot): Promise<AiLibraryHistorySeed> => {
      const symbol = settings.symbol;
      const timeframe = settings.timeframe;
      const key = symbolTimeframeKey(symbol, timeframe);
      const oneMinuteKey = symbolTimeframeKey(symbol, "1m");
      const isAlreadyOneMinute = timeframe === "1m";
      const shouldLoadOneMinutePrecision = settings.minutePreciseEnabled && !isAlreadyOneMinute;
      const leadingBars = Math.max(settings.chunkBars * 3, settings.maxBarsInTrade + 24);
      const targetBars = estimateHistoryBarsForDateRange(
        settings.statsDateStart,
        settings.statsDateEnd,
        timeframe,
        leadingBars
      );
      const oneMinutePaddingBars = Math.max(
        leadingBars,
        Math.round(leadingBars * (timeframeMinutes[timeframe] ?? 1))
      );
      const oneMinuteTargetBars = shouldLoadOneMinutePrecision
        ? estimateHistoryBarsForDateRange(
            settings.statsDateStart,
            settings.statsDateEnd,
            "1m",
            oneMinutePaddingBars
          )
        : 0;
      const minimumSeedBars = getMinimumAizipSeedBars(settings.chunkBars);

      const existingCandles = pickLongestCandleSeries(
        backtestSeriesMapRef.current[key],
        seriesMapRef.current[key]
      );
      const existingOneMinute = shouldLoadOneMinutePrecision
        ? pickLongestCandleSeries(
            backtestOneMinuteSeriesMapRef.current[oneMinuteKey],
            seriesMapRef.current[oneMinuteKey]
          )
        : EMPTY_CANDLES;
      const hasDateRange = Boolean(settings.statsDateStart && settings.statsDateEnd);
      const historyRequestWindow = hasDateRange
        ? buildHistoryApiRequestWindow({
            timeframe,
            startYmd: settings.statsDateStart,
            endYmd: settings.statsDateEnd,
            leadingBars
          })
        : null;
      const oneMinuteHistoryRequestWindow =
        shouldLoadOneMinutePrecision && hasDateRange
          ? buildHistoryApiRequestWindow({
              timeframe: "1m",
              startYmd: settings.statsDateStart,
              endYmd: settings.statsDateEnd,
              leadingBars: oneMinutePaddingBars
            })
          : null;
      // If a specific date range was requested, only exact range history counts as valid seed data.
      const allowOneMinuteFallback = !hasDateRange;
      const needsHistory =
        existingCandles.length < MIN_SEED_CANDLES ||
        existingCandles.length < targetBars ||
        (hasDateRange &&
          !candlesCoverDateRange(
            existingCandles,
            timeframe,
            settings.statsDateStart,
            settings.statsDateEnd,
            leadingBars
          ));
      const needsOneMinute =
        shouldLoadOneMinutePrecision &&
        (existingOneMinute.length < MIN_SEED_CANDLES ||
          existingOneMinute.length < oneMinuteTargetBars);

      if (!needsHistory && !needsOneMinute) {
        return {
          candleSeriesBySymbol: {
            [symbol]: existingCandles
          },
          oneMinuteCandlesBySymbol:
            shouldLoadOneMinutePrecision && existingOneMinute.length > 0
              ? { [symbol]: existingOneMinute }
              : {}
        };
      }

      const seedKey = [
        `sym:${symbol}`,
        `tf:${timeframe}`,
        `mp:${shouldLoadOneMinutePrecision ? 1 : 0}`,
        `bars:${targetBars}`,
        `m1:${oneMinuteTargetBars}`
      ].join("|");
      const inFlight = aiLibraryHistoryInFlightRef.current.get(seedKey);
      if (inFlight) {
        return inFlight;
      }

      const loadPromise = (async () => {
        let resolvedCandles = existingCandles;
        let resolvedOneMinute = existingOneMinute;
        const recentOneMinutePromise = shouldLoadOneMinutePrecision
          ? fetchRecentOneMinuteCandles(undefined, BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS)
          : undefined;

        if (needsHistory || needsOneMinute) {
          const promises: [Promise<Candle[]>, Promise<Candle[]>] = [
            needsHistory
              ? fetchBacktestHistoryCandles(
                  timeframe,
                  targetBars,
                  recentOneMinutePromise,
                  allowOneMinuteFallback,
                  BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS,
                  hasDateRange
                    ? {
                        requestWindow: historyRequestWindow ?? undefined,
                        coverageWindow: {
                          startYmd: settings.statsDateStart,
                          endYmd: settings.statsDateEnd,
                          leadingBars,
                          strictCoverage: true
                        }
                      }
                    : undefined
                )
              : Promise.resolve(existingCandles),
            shouldLoadOneMinutePrecision
              ? needsOneMinute
                ? fetchBacktestHistoryCandles(
                    "1m",
                    oneMinuteTargetBars,
                    recentOneMinutePromise,
                    true,
                    BACKTEST_SEED_CANDLE_FETCH_TIMEOUT_MS,
                    hasDateRange
                      ? {
                          requestWindow: oneMinuteHistoryRequestWindow ?? undefined,
                          coverageWindow: {
                            startYmd: settings.statsDateStart,
                            endYmd: settings.statsDateEnd,
                            leadingBars: oneMinutePaddingBars,
                            strictCoverage: false
                          }
                        }
                      : undefined
                  ).catch(() => [])
                : Promise.resolve(existingOneMinute)
              : Promise.resolve([])
          ];

          const [deepHistoryCandles, oneMinuteCandles] = await Promise.all(promises);
          let seedCandles = pickLongestCandleSeries(
            deepHistoryCandles,
            existingCandles
          );

          if (hasUsableAizipSeedCandles(seedCandles, minimumSeedBars)) {
            resolvedCandles = seedCandles;
            if (seedCandles.length > (backtestSeriesMapRef.current[key]?.length ?? 0)) {
              setBacktestSeriesMap((prev) => ({
                ...prev,
                [key]: seedCandles
              }));
            }
          }

          const resolvedNextOneMinute = pickLongestCandleSeries(
            oneMinuteCandles,
            existingOneMinute
          );
          if (shouldLoadOneMinutePrecision && resolvedNextOneMinute.length > 0) {
            resolvedOneMinute = resolvedNextOneMinute;
            if (
              resolvedNextOneMinute.length >
              (backtestOneMinuteSeriesMapRef.current[oneMinuteKey]?.length ?? 0)
            ) {
              setBacktestOneMinuteSeriesMap((prev) => ({
                ...prev,
                [oneMinuteKey]: resolvedNextOneMinute
              }));
            }
          }
        }

        if (
          hasDateRange &&
          !candlesCoverDateRange(
            resolvedCandles,
            timeframe,
            settings.statsDateStart,
            settings.statsDateEnd,
            leadingBars
          )
        ) {
          resolvedCandles = EMPTY_CANDLES;
        }

        return {
          candleSeriesBySymbol: {
            [symbol]: resolvedCandles
          },
          oneMinuteCandlesBySymbol:
            shouldLoadOneMinutePrecision && resolvedOneMinute.length > 0
              ? { [symbol]: resolvedOneMinute }
              : {}
        };
      })().finally(() => {
        aiLibraryHistoryInFlightRef.current.delete(seedKey);
      });

      aiLibraryHistoryInFlightRef.current.set(seedKey, loadPromise);

      return loadPromise;
    },
    [
      setBacktestOneMinuteSeriesMap,
      setBacktestSeriesMap
    ]
  );

  const buildLibraryPoolKey = useCallback(
    (
      settings: BacktestSettingsSnapshot,
      tpDollars: number,
      slDollars: number
    ) => {
      const normalizedTp = Math.round(Number(tpDollars) || 0);
      const normalizedSl = Math.round(Number(slDollars) || 0);
      const normalizedUnits = Math.round(Number(settings.dollarsPerMove) || 0);
      const modelKey = buildLibraryModelSelectionKey(settings);

      return [
        `tf:${settings.timeframe}`,
        `sym:${settings.symbol}`,
        `tp:${normalizedTp}`,
        `sl:${normalizedSl}`,
        `stop:${settings.stopMode}`,
        `be:${settings.breakEvenTriggerPct}`,
        `ts:${settings.trailingStartPct}`,
        `td:${settings.trailingDistPct}`,
        `mp:${settings.minutePreciseEnabled ? 1 : 0}`,
        `bars:${settings.chunkBars}`,
        `max:${settings.maxBarsInTrade}`,
        `dpm:${normalizedUnits}`,
        `start:${settings.statsDateStart || "-"}`,
        `end:${settings.statsDateEnd || "-"}`,
        `models:${modelKey}`
      ].join("|");
    },
    [buildLibraryModelSelectionKey]
  );

  const buildSeedLibraryPoolKey = useCallback(
    (
      settings: BacktestSettingsSnapshot,
      tpDollars: number,
      slDollars: number
    ) => {
      const normalizedTp = Math.round(Number(tpDollars) || 0);
      const normalizedSl = Math.round(Number(slDollars) || 0);
      const normalizedUnits = Math.round(Number(settings.dollarsPerMove) || 0);
      return [
        "seed",
        `tf:${settings.timeframe}`,
        `sym:${settings.symbol}`,
        `tp:${normalizedTp}`,
        `sl:${normalizedSl}`,
        `mp:${settings.minutePreciseEnabled ? 1 : 0}`,
        `bars:${settings.chunkBars}`,
        `max:${settings.maxBarsInTrade}`,
        `dpm:${normalizedUnits}`,
        `start:${settings.statsDateStart || "-"}`,
        `end:${settings.statsDateEnd || "-"}`
      ].join("|");
    },
    []
  );

  const loadSeededLibraryTradePool = useCallback(
    async (
      settings: BacktestSettingsSnapshot,
      tpDollars: number,
      slDollars: number
    ): Promise<HistoryItem[]> => {
      const normalizedTp = Number.isFinite(tpDollars) ? tpDollars : 0;
      const normalizedSl = Number.isFinite(slDollars) ? slDollars : 0;
      const poolKey = buildSeedLibraryPoolKey(settings, normalizedTp, normalizedSl);
      const cached = aiLibraryPoolCacheRef.current.get(poolKey);
      if (cached) {
        return cached;
      }

      const inFlight = aiLibraryPoolInFlightRef.current.get(poolKey);
      if (inFlight) {
        return inFlight;
      }

      const computePromise = (async () => {
        const { candleSeriesBySymbol } = await ensureLibraryHistorySeed(settings);
        const candles = candleSeriesBySymbol[settings.symbol] ?? EMPTY_CANDLES;
        const minimumSeedBars = getMinimumAizipSeedBars(settings.chunkBars);

        if (!hasUsableAizipSeedCandles(candles, minimumSeedBars)) {
          console.error("[AIZip][AiLibraryRunDiagnostics] SEEDED_POOL_INSUFFICIENT_CANDLES", {
            poolKey,
            symbol: settings.symbol,
            timeframe: settings.timeframe,
            candleCount: candles.length,
            minimumSeedBars,
            chunkBars: settings.chunkBars,
            statsDateStart: settings.statsDateStart,
            statsDateEnd: settings.statsDateEnd
          });
          return [];
        }

        const formattedTimeCache = new Map<number, string>();
        const formatSeedTime = (timestampSeconds: number) => {
          const normalized = Math.floor(timestampSeconds);
          const cachedLabel = formattedTimeCache.get(normalized);
          if (cachedLabel) {
            return cachedLabel;
          }
          const nextLabel = formatDateTime(normalized * 1000);
          formattedTimeCache.set(normalized, nextLabel);
          return nextLabel;
        };
        const ordered = buildSeededLibraryTradePoolFromCandles({
          candles,
          symbol: settings.symbol,
          unitsPerMove: settings.dollarsPerMove,
          tpDollars: normalizedTp,
          slDollars: normalizedSl,
          chunkBars: settings.chunkBars,
          formatTimestamp: formatSeedTime
        }) as HistoryItem[];
        if (ordered.length === 0) {
          console.error("[AIZip][AiLibraryRunDiagnostics] SEEDED_POOL_BUILT_ZERO_TRADES", {
            poolKey,
            symbol: settings.symbol,
            timeframe: settings.timeframe,
            candleCount: candles.length,
            chunkBars: settings.chunkBars,
            tpDollars: normalizedTp,
            slDollars: normalizedSl,
            dollarsPerMove: settings.dollarsPerMove
          });
        }
        if (ordered.length > 0) {
          aiLibraryPoolCacheRef.current.set(poolKey, ordered);
        }
        return ordered;
      })().finally(() => {
        aiLibraryPoolInFlightRef.current.delete(poolKey);
      });

      aiLibraryPoolInFlightRef.current.set(poolKey, computePromise);

      return computePromise;
    },
    [
      buildSeedLibraryPoolKey,
      ensureLibraryHistorySeed
    ]
  );

  const loadLibraryTradePool = useCallback(
    async (
      settings: BacktestSettingsSnapshot,
      tpDollars: number,
      slDollars: number
    ): Promise<HistoryItem[]> => {
      const normalizedTp = Number.isFinite(tpDollars) ? tpDollars : 0;
      const normalizedSl = Number.isFinite(slDollars) ? slDollars : 0;
      const poolKey = buildLibraryPoolKey(settings, normalizedTp, normalizedSl);
      const cached = aiLibraryPoolCacheRef.current.get(poolKey);
      if (cached) {
        return cached;
      }

      const inFlight = aiLibraryPoolInFlightRef.current.get(poolKey);
      if (inFlight) {
        return inFlight;
      }

      const computePromise = (async () => {
        const { candleSeriesBySymbol, oneMinuteCandlesBySymbol } =
          await ensureLibraryHistorySeed(settings);
        const candles = candleSeriesBySymbol[settings.symbol] ?? EMPTY_CANDLES;
        const minimumSeedBars = getMinimumAizipSeedBars(settings.chunkBars);

        if (!hasUsableAizipSeedCandles(candles, minimumSeedBars)) {
          return [];
        }

        const selectedModels = resolveLibraryModelProfiles(settings);
        if (selectedModels.length === 0) {
          return [];
        }

        const unitsPerMove = Math.max(
          1,
          Number.isFinite(settings.dollarsPerMove)
            ? settings.dollarsPerMove
            : 1
        );
        const blueprints = buildStrategyReplayTradeBlueprints({
          candles,
          models: toStrategyReplayModels(selectedModels, settings.aiModelStates),
          symbol: settings.symbol,
          unitsPerMove,
          chunkBars: settings.chunkBars,
          strategyCatalog: modelsSurfaceCatalog,
          tpDollars: normalizedTp,
          slDollars: normalizedSl,
          stopMode: settings.stopMode,
          breakEvenTriggerPct: settings.breakEvenTriggerPct,
          trailingStartPct: settings.trailingStartPct,
          trailingDistPct: settings.trailingDistPct,
          maxBarsInTrade: settings.maxBarsInTrade
        });

        if (blueprints.length === 0) {
          return [];
        }

        const modelNamesById = selectedModels.reduce<Record<string, string>>(
          (accumulator, model) => {
            accumulator[model.id] = model.name ?? "Settings";
            return accumulator;
          },
          {}
        );
        const rows = await computeBacktestRowsOnServer({
          blueprints,
          candleSeriesBySymbol,
          oneMinuteCandlesBySymbol:
            settings.timeframe === "1m"
              ? undefined
              : oneMinuteCandlesBySymbol,
          minutePreciseEnabled: settings.minutePreciseEnabled,
          modelNamesById,
          tpDollars: normalizedTp,
          slDollars: normalizedSl,
          stopMode: settings.stopMode,
          breakEvenTriggerPct: settings.breakEvenTriggerPct,
          trailingStartPct: settings.trailingStartPct,
          trailingDistPct: settings.trailingDistPct,
          limit: blueprints.length
        });

        const ordered = [...rows].sort(
          (left, right) =>
            Number(left.exitTime) - Number(right.exitTime) ||
            left.id.localeCompare(right.id)
        );
        if (ordered.length > 0) {
          aiLibraryPoolCacheRef.current.set(poolKey, ordered);
        }
        return ordered;
      })().finally(() => {
        aiLibraryPoolInFlightRef.current.delete(poolKey);
      });

      aiLibraryPoolInFlightRef.current.set(poolKey, computePromise);

      return computePromise;
    },
    [
      buildLibraryPoolKey,
      ensureLibraryHistorySeed,
      modelsSurfaceCatalog,
      resolveLibraryModelProfiles
    ]
  );

  const filterLibraryCandidatePool = useCallback(
    (
      pool: HistoryItem[],
      settings: BacktestSettingsSnapshot,
      options?: { skipTemporalBuckets?: boolean }
    ) => {
      const dateFiltered = filterTradesByDateRange(
        pool,
        settings.statsDateStart,
        settings.statsDateEnd
      );

      if (options?.skipTemporalBuckets) {
        return dateFiltered;
      }

      return filterTradesBySessionBuckets(dateFiltered, {
        enabledBacktestWeekdays: settings.enabledBacktestWeekdays,
        enabledBacktestSessions: settings.enabledBacktestSessions,
        enabledBacktestMonths: settings.enabledBacktestMonths,
        enabledBacktestHours: settings.enabledBacktestHours
      });
    },
    []
  );

  const buildLibraryExecutedTradeIds = useCallback(
    (pool: HistoryItem[], settings: BacktestSettingsSnapshot) => {
      const confidenceGateDisabled = settings.aiMode === "off";
      const effectiveConfidenceThreshold = confidenceGateDisabled
        ? 0
        : settings.confidenceThreshold;

      if (confidenceGateDisabled) {
        return new Set(pool.map((trade) => trade.id));
      }

      const ids = new Set<string>();
      for (const trade of pool) {
        if (getTradeConfidenceScore(trade) * 100 >= effectiveConfidenceThreshold) {
          ids.add(trade.id);
        }
      }
      return ids;
    },
    []
  );

  const applyLibraryJumpToResolution = useCallback((pool: HistoryItem[]) => {
    if (pool.length <= 1) {
      return pool;
    }

    const ordered = [...pool].sort(
      (left, right) =>
        Number(left.entryTime) - Number(right.entryTime) ||
        Number(left.exitTime) - Number(right.exitTime) ||
        left.id.localeCompare(right.id)
    );
    const selected: HistoryItem[] = [];
    let lastExit = Number.NEGATIVE_INFINITY;

    for (const trade of ordered) {
      const entrySec = Number(trade.entryTime);
      const exitSec = Number(trade.exitTime);

      if (!Number.isFinite(entrySec) || !Number.isFinite(exitSec)) {
        continue;
      }

      if (entrySec < lastExit) {
        continue;
      }

      selected.push(trade);
      lastExit = exitSec;
    }

    return selected;
  }, []);

  const maxLibrarySignalIndex = Math.max(0, selectedChartCandles.length - 1);

  const resolveLibrarySignalIndex = useCallback(
    (trade: HistoryItem, ordinal: number, total: number) => {
      const entryIndex = candleIndexByUnix.get(Number(trade.entryTime));
      if (typeof entryIndex === "number") {
        return clamp(entryIndex, 0, maxLibrarySignalIndex);
      }
      const exitIndex = candleIndexByUnix.get(Number(trade.exitTime));
      if (typeof exitIndex === "number") {
        return clamp(exitIndex, 0, maxLibrarySignalIndex);
      }
      if (maxLibrarySignalIndex <= 0 || total <= 1) {
        return 0;
      }
      return clamp(
        Math.round((ordinal / Math.max(1, total - 1)) * maxLibrarySignalIndex),
        0,
        maxLibrarySignalIndex
      );
    },
    [candleIndexByUnix, maxLibrarySignalIndex]
  );

  const buildLibrarySnapshotFromPool = useCallback(
    (
      definition: AiLibraryDef,
      settings: Record<string, AiLibrarySettingValue>,
      libraryCandidatePool: HistoryItem[],
      executedTradeIds: Set<string>
    ) => {
      const normalizedId = definition.id.toLowerCase();
      const stride = clamp(
        Math.floor(Number(settings.stride ?? 0) || 0),
        0,
        5000
      );
      const maxSamples = clamp(
        Math.floor(Number(settings.maxSamples ?? 96) || 96),
        0,
        100000
      );
      const suppressedTradePool = libraryCandidatePool.filter(
        (trade) => !executedTradeIds.has(trade.id)
      );
      let source: HistoryItem[] = [];

      if (normalizedId === "core") {
        source = collectCappedItems(libraryCandidatePool, {
          cap: maxSamples,
          stride
        });
      } else if (normalizedId === "suppressed") {
        source = collectCappedItems(suppressedTradePool, {
          cap: maxSamples,
          stride
        });
      } else if (normalizedId === "recent") {
        const windowTrades = clamp(
          Math.floor(Number(settings.windowTrades ?? 1500) || 1500),
          0,
          5000
        );
        const startIndex = Math.max(0, libraryCandidatePool.length - windowTrades);
        source =
          windowTrades > 0
            ? collectCappedItems(libraryCandidatePool, {
                cap: maxSamples,
                stride,
                startIndex,
                endIndex: libraryCandidatePool.length
              })
            : [];
      } else if (normalizedId === "terrific") {
        const count = clamp(
          Math.floor(Number(settings.count ?? 96) || 96),
          0,
          100000
        );
        const effectiveCap = Math.min(maxSamples, count);
        const capped = collectCappedItems(libraryCandidatePool, {
          cap: effectiveCap
        });
        source = applyStrideToItems(
          [...capped].sort((left, right) => right.pnlUsd - left.pnlUsd),
          stride
        );
      } else if (normalizedId === "terrible") {
        const count = clamp(
          Math.floor(Number(settings.count ?? 96) || 96),
          0,
          100000
        );
        const effectiveCap = Math.min(maxSamples, count);
        const capped = collectCappedItems(libraryCandidatePool, {
          cap: effectiveCap
        });
        source = applyStrideToItems(
          [...capped].sort((left, right) => left.pnlUsd - right.pnlUsd),
          stride
        );
      } else if (settings.kind === "model_sim") {
        const targetModel = String(settings.model ?? "");
        source = collectCappedItems(libraryCandidatePool, {
          cap: maxSamples,
          stride,
          predicate: (trade) => trade.entrySource === targetModel
        });
      } else if (isBaseSeedingLibraryId(normalizedId)) {
        const sessionFilter =
          normalizedId === "tokyo"
            ? "Tokyo"
            : normalizedId === "sydney"
            ? "Sydney"
            : normalizedId === "london"
            ? "London"
            : normalizedId === "newyork"
            ? "New York"
            : null;
        let baseSource = sessionFilter
          ? libraryCandidatePool.filter(
              (trade) => getSessionLabel(trade.entryTime) === sessionFilter
            )
          : libraryCandidatePool;

        if (Boolean(settings.jumpToResolution)) {
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

      const baselineWinRate = getOutcomeWinRatePercent(
        source,
        (trade) => trade.result === "Win"
      );
      const targetWinRate = resolveAiLibraryTargetWinRate(
        settings,
        baselineWinRate,
        source.length
      );
      const balanced = rebalanceItemsToTargetWinRate(
        source,
        maxSamples,
        targetWinRate,
        (trade) => trade.result === "Win",
        definition.id === "terrific" || definition.id === "terrible"
      );

      const points: any[] = [];

      for (let sourceIndex = 0; sourceIndex < balanced.length; sourceIndex += 1) {
        const trade = balanced[sourceIndex]!;
        const modelName = trade.entrySource.trim() || "Momentum";
        const signalIndex = resolveLibrarySignalIndex(
          trade,
          sourceIndex,
          balanced.length
        );
        const entryTimeRaw = Number(trade.entryTime);
        const entryTime =
          Number.isFinite(entryTimeRaw) && entryTimeRaw > 0
            ? entryTimeRaw
            : trade.entryAt || trade.time;
        const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
        const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
        const holdMinutes = Math.max(
          1,
          (Number(trade.exitTime) - Number(trade.entryTime)) / 60
        );
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
          metaSession: getSessionLabel(entryTime as UTCTimestamp),
          dir: trade.side === "Long" ? 1 : -1,
          label: trade.result === "Win" ? 1 : -1,
          result: trade.result === "Win" ? "TP" : "SL",
          metaOutcome: trade.result === "Win" ? "Win" : "Loss",
          pnl: trade.pnlUsd,
          metaPnl: trade.pnlUsd,
          v: shapeVector,
          trainingOnly: true,
          metaTrainingOnly: true
        });
      }

      return {
        baselineWinRate,
        sourceCount: source.length,
        count: balanced.length,
        points
      };
    },
    [applyLibraryJumpToResolution, resolveLibrarySignalIndex]
  );

  const runAiLibrary = useCallback(
    async (
      libraryId: string,
      options?: {
        settingsSource?: AiLibrarySettings;
        backtestSettings?: BacktestSettingsSnapshot;
      }
    ) => {
      const definition = aiLibraryDefById[libraryId];

      if (!definition) {
        return;
      }

      const runToken = (aiLibraryRunTokenRef.current[libraryId] ?? 0) + 1;
      aiLibraryRunTokenRef.current[libraryId] = runToken;

      setAiLibraryRunStatus((current) => ({
        ...current,
        [libraryId]: "loading"
      }));

      const settingsSnapshot = resolveLibraryBacktestSnapshot(options?.backtestSettings);

      if (
        !canRunAizipLibrariesForSettings({
          libraryIds: [definition.id],
          aiModelStates: settingsSnapshot.aiModelStates
        })
      ) {
        setAiLibraryRunStatus((current) => ({
          ...current,
          [libraryId]: "idle"
        }));
        return;
      }

      try {
        const settings = resolveLibrarySettingsSnapshot(
          definition,
          options?.settingsSource
        );
        const useBase = isBaseSeedingLibraryId(definition.id);
        const tpDollars = useBase
          ? resolveLibraryDollarValue(settings.tpDollars, settingsSnapshot.tpDollars)
          : settingsSnapshot.tpDollars;
        const slDollars = useBase
          ? resolveLibraryDollarValue(settings.slDollars, settingsSnapshot.slDollars)
          : settingsSnapshot.slDollars;

        const rawPool = useBase
          ? await withTimeout(
              loadSeededLibraryTradePool(
                settingsSnapshot,
                tpDollars,
                slDollars
              ),
              AI_LIBRARY_RUN_TIMEOUT_MS,
              `AI library ${libraryId} timed out while loading its seeded pool.`
            )
          : await withTimeout(
              loadLibraryTradePool(
                settingsSnapshot,
                tpDollars,
                slDollars
              ),
              AI_LIBRARY_RUN_TIMEOUT_MS,
              `AI library ${libraryId} timed out while loading its trade pool.`
            );
        if (aiLibraryRunTokenRef.current[libraryId] !== runToken) {
          return;
        }
        const candidatePool = filterLibraryCandidatePool(rawPool, settingsSnapshot, {
          skipTemporalBuckets: isBaseSeedingLibraryId(definition.id)
        });
        const executedTradeIds = buildLibraryExecutedTradeIds(
          candidatePool,
          settingsSnapshot
        );
        const result = buildLibrarySnapshotFromPool(
          definition,
          settings,
          candidatePool,
          executedTradeIds
        );
        if (result.count === 0) {
          console.error("[AIZip][AiLibraryRunDiagnostics] LIBRARY_READY_WITH_ZERO_RESULTS", {
            libraryId,
            rawPoolCount: rawPool.length,
            candidatePoolCount: candidatePool.length,
            sourceCount: result.sourceCount,
            resultCount: result.count,
            baselineWinRate: result.baselineWinRate
          });
        }

        if (aiLibraryRunTokenRef.current[libraryId] !== runToken) {
          return;
        }

        aiLibraryPointsByIdRef.current = {
          ...aiLibraryPointsByIdRef.current,
          [libraryId]: result.points
        };
        setAiLibraryPoints(Object.values(aiLibraryPointsByIdRef.current).flat());
        setAiLibraryCounts((current) => ({
          ...current,
          [libraryId]: result.count
        }));
        setAiLibraryBaselineWinRates((current) => ({
          ...current,
          [libraryId]: result.baselineWinRate
        }));
        setAiLibraryRunStatus((current) => ({
          ...current,
          [libraryId]: "ready"
        }));
      } catch {
        if (aiLibraryRunTokenRef.current[libraryId] !== runToken) {
          return;
        }
        setAiLibraryRunStatus((current) => ({
          ...current,
          [libraryId]: "error"
        }));
      }
    },
    [
      aiLibraryDefById,
      buildLibraryExecutedTradeIds,
      buildLibrarySnapshotFromPool,
      filterLibraryCandidatePool,
      loadSeededLibraryTradePool,
      loadLibraryTradePool,
      resolveLibraryBacktestSnapshot,
      resolveLibraryDollarValue,
      resolveLibrarySettingsSnapshot
    ]
  );

  const runAllActiveLibraries = useCallback(
    async (options?: {
      libraryIds?: string[];
      settingsSource?: AiLibrarySettings;
      backtestSettings?: BacktestSettingsSnapshot;
    }) => {
      const sourceIds =
        options?.libraryIds && options.libraryIds.length > 0
          ? options.libraryIds
          : selectedAiLibraries;
      const activeIds = sourceIds.filter((libraryId) => Boolean(aiLibraryDefById[libraryId]));

      if (activeIds.length === 0) {
        return;
      }

      const settingsSnapshot = resolveLibraryBacktestSnapshot(options?.backtestSettings);
      const settingsSource = options?.settingsSource ?? selectedAiLibrarySettings;
      const nextStatus: Record<string, AiLibraryRunStatus> = {};
      const runTokens = new Map<string, number>();

      for (const libraryId of activeIds) {
        const nextToken = (aiLibraryRunTokenRef.current[libraryId] ?? 0) + 1;
        aiLibraryRunTokenRef.current[libraryId] = nextToken;
        runTokens.set(libraryId, nextToken);
        nextStatus[libraryId] = "loading";
      }

      setAiLibraryRunStatus((current) => ({ ...current, ...nextStatus }));

      if (
        !canRunAizipLibrariesForSettings({
          libraryIds: activeIds,
          aiModelStates: settingsSnapshot.aiModelStates
        })
      ) {
        setAiLibraryRunStatus((current) => {
          const updated = { ...current };
          for (const libraryId of activeIds) {
            updated[libraryId] = "idle";
          }
          return updated;
        });
        return;
      }

      try {
        const poolParamsByKey = new Map<
          string,
          {
            tpDollars: number;
            slDollars: number;
            useSeedPool: boolean;
            skipTemporalBuckets: boolean;
          }
        >();
        const poolKeyByLibraryId = new Map<string, string>();
        const settingsByLibraryId = new Map<string, Record<string, AiLibrarySettingValue>>();

        for (const libraryId of activeIds) {
          const definition = aiLibraryDefById[libraryId];
          if (!definition) {
            continue;
          }
          const settings = resolveLibrarySettingsSnapshot(definition, settingsSource);
          settingsByLibraryId.set(libraryId, settings);

          const useBase = isBaseSeedingLibraryId(definition.id);
          const tpDollars = useBase
            ? resolveLibraryDollarValue(settings.tpDollars, settingsSnapshot.tpDollars)
            : settingsSnapshot.tpDollars;
          const slDollars = useBase
            ? resolveLibraryDollarValue(settings.slDollars, settingsSnapshot.slDollars)
            : settingsSnapshot.slDollars;

          const poolKey = useBase
            ? buildSeedLibraryPoolKey(settingsSnapshot, tpDollars, slDollars)
            : buildLibraryPoolKey(settingsSnapshot, tpDollars, slDollars);
          poolKeyByLibraryId.set(libraryId, poolKey);
          if (!poolParamsByKey.has(poolKey)) {
            poolParamsByKey.set(poolKey, {
              tpDollars,
              slDollars,
              useSeedPool: useBase,
              skipTemporalBuckets: useBase
            });
          }
        }

        const poolSnapshots = new Map<
          string,
          { rawPoolCount: number; pool: HistoryItem[]; executedTradeIds: Set<string> }
        >();
        const poolErrors = new Set<string>();

        for (const [poolKey, params] of poolParamsByKey.entries()) {
          try {
            const rawPool = params.useSeedPool
              ? await withTimeout(
                  loadSeededLibraryTradePool(
                    settingsSnapshot,
                    params.tpDollars,
                    params.slDollars
                  ),
                  AI_LIBRARY_RUN_TIMEOUT_MS,
                  `AI library pool ${poolKey} timed out while loading its seeded trades.`
                )
              : await withTimeout(
                  loadLibraryTradePool(
                    settingsSnapshot,
                    params.tpDollars,
                    params.slDollars
                  ),
                  AI_LIBRARY_RUN_TIMEOUT_MS,
                  `AI library pool ${poolKey} timed out while loading its trades.`
                );
            const candidatePool = filterLibraryCandidatePool(rawPool, settingsSnapshot, {
              skipTemporalBuckets: params.skipTemporalBuckets
            });
            const executedTradeIds = buildLibraryExecutedTradeIds(
              candidatePool,
              settingsSnapshot
            );
            poolSnapshots.set(poolKey, {
              rawPoolCount: rawPool.length,
              pool: candidatePool,
              executedTradeIds
            });
          } catch (error) {
            poolErrors.add(poolKey);
            console.error("[AIZip][AiLibraryRunDiagnostics] POOL_LOAD_FAILED", {
              poolKey,
              params,
              error
            });
          }
        }

        const countsUpdate: Record<string, number> = {};
        const baselineUpdate: Record<string, number> = {};
        const statusUpdate: Record<string, AiLibraryRunStatus> = {};
        const nextPointsById = { ...aiLibraryPointsByIdRef.current };

        for (const libraryId of activeIds) {
          const token = runTokens.get(libraryId);
          if (!token || aiLibraryRunTokenRef.current[libraryId] !== token) {
            continue;
          }

          const definition = aiLibraryDefById[libraryId];
          const settings = settingsByLibraryId.get(libraryId);
          const poolKey = poolKeyByLibraryId.get(libraryId);

          if (!definition || !settings || !poolKey) {
            statusUpdate[libraryId] = "error";
            continue;
          }

          if (poolErrors.has(poolKey)) {
            statusUpdate[libraryId] = "error";
            continue;
          }

          const poolSnapshot = poolSnapshots.get(poolKey);
          if (!poolSnapshot) {
            statusUpdate[libraryId] = "error";
            continue;
          }

          try {
            const result = buildLibrarySnapshotFromPool(
              definition,
              settings,
              poolSnapshot.pool,
              poolSnapshot.executedTradeIds
            );

            countsUpdate[libraryId] = result.count;
            baselineUpdate[libraryId] = result.baselineWinRate;
            nextPointsById[libraryId] = result.points;
            statusUpdate[libraryId] = "ready";
            if (result.count === 0) {
              console.error("[AIZip][AiLibraryRunDiagnostics] LIBRARY_READY_WITH_ZERO_RESULTS", {
                libraryId,
                poolKey,
                rawPoolCount: poolSnapshot.rawPoolCount,
                candidatePoolCount: poolSnapshot.pool.length,
                sourceCount: result.sourceCount,
                resultCount: result.count,
                baselineWinRate: result.baselineWinRate
              });
            }
          } catch (error) {
            statusUpdate[libraryId] = "error";
            console.error("[AIZip][AiLibraryRunDiagnostics] SNAPSHOT_BUILD_FAILED", {
              libraryId,
              poolKey,
              poolCount: poolSnapshot.pool.length,
              error
            });
          }
        }

        aiLibraryPointsByIdRef.current = nextPointsById;
        setAiLibraryPoints(Object.values(nextPointsById).flat());
        if (Object.keys(countsUpdate).length > 0) {
          setAiLibraryCounts((current) => ({ ...current, ...countsUpdate }));
        }
        if (Object.keys(baselineUpdate).length > 0) {
          setAiLibraryBaselineWinRates((current) => ({ ...current, ...baselineUpdate }));
        }
        if (Object.keys(statusUpdate).length > 0) {
          setAiLibraryRunStatus((current) => ({ ...current, ...statusUpdate }));
        }
      } catch (error) {
        console.error("[AIZip][AiLibraryRunDiagnostics] RUN_ALL_ACTIVE_LIBRARIES_FAILED", {
          activeIds,
          error
        });
        setAiLibraryRunStatus((current) => {
          const next = { ...current };
          for (const libraryId of activeIds) {
            const token = runTokens.get(libraryId);
            if (token && aiLibraryRunTokenRef.current[libraryId] === token) {
              next[libraryId] = "error";
            }
          }
          return next;
        });
      }
    },
    [
      aiLibraryDefById,
      buildLibraryExecutedTradeIds,
      buildSeedLibraryPoolKey,
      buildLibraryPoolKey,
      buildLibrarySnapshotFromPool,
      filterLibraryCandidatePool,
      loadSeededLibraryTradePool,
      loadLibraryTradePool,
      resolveLibraryBacktestSnapshot,
      resolveLibraryDollarValue,
      resolveLibrarySettingsSnapshot,
      selectedAiLibraries,
      selectedAiLibrarySettings
    ]
  );

  const runAllLibrariesRef = useRef(runAllActiveLibraries);
  const aiLibraryAutoRunSignatureRef = useRef<string>("");
  useEffect(() => {
    runAllLibrariesRef.current = runAllActiveLibraries;
  }, [runAllActiveLibraries]);

  useEffect(() => {
    aiLibraryPoolCacheRef.current.clear();
    aiLibraryPoolInFlightRef.current.clear();
    aiLibraryHistoryInFlightRef.current.clear();
    setAiLibraryRunStatus((current) => {
      const next = { ...current };
      let changed = false;
      for (const [libraryId, status] of Object.entries(next)) {
        if (status === "loading") {
          next[libraryId] = "idle";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [backtestRunCount]);

  useEffect(() => {
    if (!backtestHasRun || !backtestHistorySeedReady) {
      return;
    }
    if (!appliedAiLibraryReadyToRun) {
      return;
    }

    const nextAutoRunSignature = `${backtestRunCount}|${appliedAiLibraryRunInputsSignature}`;
    if (aiLibraryAutoRunSignatureRef.current === nextAutoRunSignature) {
      return;
    }
    aiLibraryAutoRunSignatureRef.current = nextAutoRunSignature;

    const appliedSettingsSnapshot = appliedBacktestSettingsRef.current;
    runAllLibrariesRef.current({
      libraryIds: appliedSettingsSnapshot.selectedAiLibraries,
      settingsSource: appliedSettingsSnapshot.selectedAiLibrarySettings,
      backtestSettings: appliedSettingsSnapshot
    });
  }, [
    backtestHasRun,
    backtestHistorySeedReady,
    appliedAiLibraryReadyToRun,
    appliedAiLibraryRunInputsSignature,
    backtestRunCount
  ]);
  const appliedVisibleAiLibrariesSettled = useMemo(() => {
    if (appliedVisibleAiLibraries.length === 0) {
      return true;
    }

    return appliedVisibleAiLibraries.every((libraryId) => {
      const status = aiLibraryRunStatus[String(libraryId).trim()] ?? "idle";
      return status === "ready" || status === "error";
    });
  }, [aiLibraryRunStatus, appliedVisibleAiLibraries]);
  const aiClusterActiveLibraries = useMemo(() => {
    if (
      !backtestHasRun ||
      !backtestHistorySeedReady ||
      !appliedAiLibraryReadyToRun ||
      !appliedVisibleAiLibrariesSettled
    ) {
      return [] as string[];
    }

    return appliedVisibleAiLibraries;
  }, [
    appliedAiLibraryReadyToRun,
    appliedVisibleAiLibraries,
    appliedVisibleAiLibrariesSettled,
    backtestHasRun,
    backtestHistorySeedReady
  ]);
  const aiClusterActiveLibraryIdSet = useMemo(() => {
    return new Set(
      aiClusterActiveLibraries.map((libraryId) => String(libraryId).trim())
    );
  }, [aiClusterActiveLibraries]);
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
  const aiLibraryDiagnosticsKeyRef = useRef<string>("");
  useEffect(() => {
    const appliedLibraryIds = appliedVisibleAiLibraries.map((libraryId) =>
      String(libraryId).trim()
    ).filter(Boolean);
    if (appliedLibraryIds.length === 0) {
      aiLibraryDiagnosticsKeyRef.current = "";
      return;
    }
    if (!backtestHasRun || !backtestHistorySeedReady) {
      aiLibraryDiagnosticsKeyRef.current = "";
      return;
    }

    const totalAppliedCount = appliedLibraryIds.reduce((sum, libraryId) => {
      return sum + Math.max(0, Number(aiLibraryCounts[libraryId] ?? 0));
    }, 0);
    const pointCount = Array.isArray(aiClusterLibraryPoints)
      ? aiClusterLibraryPoints.length
      : 0;
    const statuses = appliedLibraryIds.reduce<Record<string, AiLibraryRunStatus>>(
      (accumulator, libraryId) => {
        accumulator[libraryId] = aiLibraryRunStatus[libraryId] ?? "idle";
        return accumulator;
      },
      {}
    );

    const codes: string[] = [];
    if (!appliedAiLibraryReadyToRun) {
      codes.push("APPLIED_LIBRARIES_BLOCKED_BY_READINESS_GATE");
    }
    if (
      appliedAiLibraryReadyToRun &&
      appliedVisibleAiLibrariesSettled &&
      totalAppliedCount === 0
    ) {
      codes.push("APPLIED_LIBRARIES_PRODUCED_ZERO_COUNTS");
    }
    if (
      appliedAiLibraryReadyToRun &&
      appliedVisibleAiLibrariesSettled &&
      pointCount === 0
    ) {
      codes.push("APPLIED_LIBRARIES_PRODUCED_ZERO_POINTS");
    }
    if (appliedLibraryIds.some((libraryId) => statuses[libraryId] === "error")) {
      codes.push("APPLIED_LIBRARY_RUN_ERROR");
    }
    if (codes.length === 0) return;

    const signature = JSON.stringify({
      codes,
      appliedLibraryIds,
      totalAppliedCount,
      pointCount,
      statuses,
    });
    if (aiLibraryDiagnosticsKeyRef.current === signature) return;
    aiLibraryDiagnosticsKeyRef.current = signature;

    const statusSummary = appliedLibraryIds
      .map((libraryId) => `${libraryId}:${statuses[libraryId] ?? "idle"}`)
      .join("|");

    console.error(
      `[AIZip][AiLibraryDiagnostics] ${codes.join(", ")} :: ids=${appliedLibraryIds.join("|")} :: statuses=${statusSummary}`,
      {
        appliedLibraryIds,
        appliedSelectedAiModelCount,
        appliedAiLibraryReadyToRun,
        backtestHasRun,
        backtestHistorySeedReady,
        totalAppliedCount,
        pointCount,
        statuses,
      }
    );
  }, [
    aiClusterLibraryPoints,
    aiLibraryCounts,
    aiLibraryRunStatus,
    appliedAiLibraryReadyToRun,
    appliedVisibleAiLibrariesSettled,
    appliedVisibleAiLibraries,
    backtestHasRun,
    backtestHistorySeedReady,
    appliedSelectedAiModelCount,
  ]);
  const selectedAiLibraryConfig: Record<string, AiLibrarySettingValue> | null = selectedAiLibrary
    ? ({
        ...selectedAiLibrary.defaults,
        ...(selectedAiLibrarySettings[selectedAiLibrary.id] ?? {}),
        [AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]: getAiLibraryTargetWinRateMode(
          selectedAiLibrarySettings[selectedAiLibrary.id]?.[AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]
        ),
        [AI_LIBRARY_TARGET_WIN_RATE_KEY]:
          selectedAiLibrarySettings[selectedAiLibrary.id]?.[AI_LIBRARY_TARGET_WIN_RATE_KEY] ??
          aiLibraryBaselineWinRates[selectedAiLibrary.id] ??
          50
      } as Record<string, AiLibrarySettingValue>)
    : null;
  const selectedAiLibraryRunStatus: AiLibraryRunStatus = selectedAiLibrary
    ? aiLibraryRunStatus[selectedAiLibrary.id] ?? "idle"
    : "idle";
  const selectedAiLibraryLoadedCount = selectedAiLibrary ? aiLibraryCounts[selectedAiLibrary.id] ?? 0 : 0;
  const selectedAiLibraryStatusLabel =
    selectedAiLibraryRunStatus === "loading"
      ? "Loading"
      : selectedAiLibraryRunStatus === "error"
        ? "Error"
        : selectedAiLibraryLoadedCount > 0
          ? "Loaded"
          : "Not Loaded";
  const selectedAiLibraryStatusClass =
    selectedAiLibraryRunStatus === "loading"
      ? "loading"
      : selectedAiLibraryRunStatus === "error"
        ? "error"
        : selectedAiLibraryLoadedCount > 0
          ? "loaded"
          : "";
  const aiLibraryAnyLoading = useMemo(() => {
    return Object.values(aiLibraryRunStatus).some((status) => status === "loading");
  }, [aiLibraryRunStatus]);
  const selectedAiLibraryTargetWinRateMode: AiLibraryTargetWinRateMode = selectedAiLibraryConfig
    ? getAiLibraryTargetWinRateMode(
        selectedAiLibraryConfig[AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]
      )
    : "natural";
  const selectedAiLibraryNaturalTargetWinRate = selectedAiLibrary
    ? getNaturalAiLibraryTargetWinRate(
        aiLibraryBaselineWinRates[selectedAiLibrary.id] ?? 50,
        selectedAiLibraryLoadedCount
      )
    : 50;
  const totalLoadedLibraryTrades = useMemo(() => {
    const activeIds = appliedVisibleAiLibraries;
    if (activeIds.length === 0) {
      return 0;
    }

    let total = 0;
    for (const libraryId of activeIds) {
      total += Math.max(0, Number(aiLibraryCounts[libraryId] ?? 0));
    }
    return total;
  }, [aiLibraryCounts, appliedVisibleAiLibraries]);
  const totalSimulatedLiveTrades = backtestSourceTrades.length;

  const mainStatsTitle = "Main Statistics";

  const backtestDateRangeStartLabel = useMemo(() => {
    return appliedBacktestSettings.statsDateStart
      ? formatStatsDateLabel(appliedBacktestSettings.statsDateStart)
      : "Start";
  }, [appliedBacktestSettings.statsDateStart]);

  const backtestDateRangeEndLabel = useMemo(() => {
    return appliedBacktestSettings.statsDateEnd
      ? formatStatsDateLabel(appliedBacktestSettings.statsDateEnd)
      : "End";
  }, [appliedBacktestSettings.statsDateEnd]);

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
    const appliedModelCount = countEnabledAizipModels(applied.aiModelStates);
    const appliedFeatureCount = Object.values(applied.aiFeatureLevels).filter((l) => l > 0).length;
    const appliedDimCount = countConfiguredAiFeatureDimensions(applied.aiFeatureLevels, applied.aiFeatureModes, applied.chunkBars);

    const stats: BacktestHeroStatCard[] = [
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

    if (!backtestHasRun) {
      return stats.map((item) => ({
        ...item,
        value: "0",
        tone: "neutral",
        valueStyle: { color: "rgba(255,255,255,0.42)" },
        meta: "Hold SPACE for 3 seconds to run backtest"
      }));
    }

    return stats;
  }, [appliedBacktestSettings, backtestHasRun, backtestSummary.averageConfidence, backtestTrades.length]);


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
      buildStatRow("date-range-row", [
        {
          label: "Start Date",
          value: backtestDateRangeStartLabel,
          tone: "neutral",
          span: 1
        },
        {
          label: "End Date",
          value: backtestDateRangeEndLabel,
          tone: "neutral",
          span: 1
        }
      ]),
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
      }
    ];
  }, [
    backtestDateRangeEndLabel,
    backtestDateRangeStartLabel,
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

  const availableBacktestMonths = backtestAnalyticsData.availableBacktestMonths;

  const backtestCalendarAgg = useMemo(() => {
    const map = new Map<string, { count: number; wins: number; pnl: number; items: HistoryItem[] }>();

    for (const entry of backtestAnalyticsData.calendarActivityEntries) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const dateKey = String(entry[0] ?? "");
      const value = entry[1] as { count?: number; wins?: number; pnl?: number } | undefined;
      if (!dateKey || !value) {
        continue;
      }
      map.set(dateKey, {
        count: Number(value.count) || 0,
        wins: Number(value.wins) || 0,
        pnl: Number(value.pnl) || 0,
        items: []
      });
    }

    return map;
  }, [backtestAnalyticsData.calendarActivityEntries]);

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

  const selectedBacktestDayTrades = backtestAnalyticsData.selectedBacktestDayTrades;

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
        tradeUid: trade.id,
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
        entryConfidence:
          (trade as any).entryConfidence ??
          (trade as any).confidence ??
          getEffectiveTradeConfidenceScore(trade),
        aiConfidence: (trade as any).aiConfidence ?? null,
        confidence:
          (trade as any).confidence ??
          (trade as any).entryConfidence ??
          null,
        entryMargin:
          (trade as any).entryMargin ??
          (trade as any).entryConfidence ??
          (trade as any).confidence ??
          null,
        margin: getEffectiveTradeConfidenceScore(trade),
        aiMode:
          (trade as any).aiMode === "knn" || (trade as any).aiMode === "hdbscan"
            ? (trade as any).aiMode
            : null,
        side: trade.side,
        closestClusterUid: (trade as any).closestClusterUid ?? null,
        entryNeighbors: Array.isArray((trade as any).entryNeighbors)
          ? ((trade as any).entryNeighbors as any[])
          : [],
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

  const performanceStatsModelOptions = backtestAnalyticsData.performanceStatsModelOptions;

  useEffect(() => {
    if (!isPerformanceStatsBacktestTabActive) {
      return;
    }

    if (!performanceStatsModelOptions.includes(performanceStatsModel)) {
      setPerformanceStatsModel("All");
    }
  }, [isPerformanceStatsBacktestTabActive, performanceStatsModel, performanceStatsModelOptions]);

  const performanceStatsTemporalCharts = backtestAnalyticsData.performanceStatsTemporalCharts;
  const performanceStatsTemporalSections = useMemo(
    () => [
      { key: "hours", label: "Hours", data: performanceStatsTemporalCharts.hours },
      { key: "weekday", label: "Weekday", data: performanceStatsTemporalCharts.weekday },
      { key: "month", label: "Month", data: performanceStatsTemporalCharts.month },
      { key: "year", label: "Year", data: performanceStatsTemporalCharts.year }
    ],
    [performanceStatsTemporalCharts]
  );

  const backtestClusterData = backtestAnalyticsData.backtestClusterData;
  const backtestClusterViewOptions = backtestAnalyticsData.backtestClusterViewOptions;

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
    if (!isBacktestAnalyticsVisible || deferredBacktestTab !== "dimensions") {
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
        pickLongestCandleSeries(
          backtestSeriesMap[symbolTimeframeKey(trade.symbol, appliedBacktestSettings.timeframe)],
          seriesMap[symbolTimeframeKey(trade.symbol, appliedBacktestSettings.timeframe)]
        );

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
    deferredBacktestTab,
    deferredBacktestAnalyticsTrades,
    isBacktestAnalyticsVisible,
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

    const computeMedian = (values: number[]) => {
      const filtered = values.filter((value) => Number.isFinite(value));
      if (filtered.length === 0) {
        return 0;
      }

      const sorted = [...filtered].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 1) {
        return sorted[mid]!;
      }
      return (sorted[mid - 1]! + sorted[mid]!) / 2;
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
      const tradesPassSamples: number[] = [];
      const tradesFailSamples: number[] = [];
      const winRatePassSamples: number[] = [];
      const winRateFailSamples: number[] = [];
      const winRateOverallSamples: number[] = [];
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
        winRateOverallSamples.push(winRate);

        if (achievedTarget) {
          passCount += 1;
          sumTradesPass += tradeCount;
          sumWinRatePass += winRate;
          tradesPassSamples.push(tradeCount);
          winRatePassSamples.push(winRate);
        } else if (failed) {
          failCount += 1;
          sumTradesFail += tradeCount;
          sumWinRateFail += winRate;
          tradesFailSamples.push(tradeCount);
          winRateFailSamples.push(winRate);
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

      const medianTradesPass = computeMedian(tradesPassSamples);
      const medianTradesFail = computeMedian(tradesFailSamples);
      const medianWinRatePass = computeMedian(winRatePassSamples);
      const medianWinRateFail = computeMedian(winRateFailSamples);
      const medianWinRateOverall = computeMedian(winRateOverallSamples);

      setPropResult({ probability, data: finals });
      setPropStats({
        avgTradesPass: passCount > 0 ? sumTradesPass / passCount : 0,
        avgTradesFail: failCount > 0 ? sumTradesFail / failCount : 0,
        avgTimePass: 0,
        avgTimeFail: 0,
        avgWinRatePass: passCount > 0 ? sumWinRatePass / passCount : 0,
        avgWinRateFail: failCount > 0 ? sumWinRateFail / failCount : 0,
        avgWinRateOverall: sims > 0 ? sumWinRateOverall / sims : 0,
        medianTradesPass,
        medianTradesFail,
        medianTimePass: 0,
        medianTimeFail: 0,
        medianWinRatePass,
        medianWinRateFail,
        medianWinRateOverall,
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
    const tradesPassSamples: number[] = [];
    const tradesFailSamples: number[] = [];
    const timePassSamples: number[] = [];
    const timeFailSamples: number[] = [];
    const winRatePassSamples: number[] = [];
    const winRateFailSamples: number[] = [];
    const winRateOverallSamples: number[] = [];
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
      winRateOverallSamples.push(winRate);

      if (achievedTarget) {
        passCount += 1;
        sumTradesPass += tradeCount;
        sumTimePass += timeSpent;
        sumWinRatePass += winRate;
        tradesPassSamples.push(tradeCount);
        timePassSamples.push(timeSpent);
        winRatePassSamples.push(winRate);
      } else if (failed) {
        failCount += 1;
        sumTradesFail += tradeCount;
        sumTimeFail += timeSpent;
        sumWinRateFail += winRate;
        tradesFailSamples.push(tradeCount);
        timeFailSamples.push(timeSpent);
        winRateFailSamples.push(winRate);
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

    const medianTradesPass = computeMedian(tradesPassSamples);
    const medianTradesFail = computeMedian(tradesFailSamples);
    const medianTimePass = computeMedian(timePassSamples);
    const medianTimeFail = computeMedian(timeFailSamples);
    const medianWinRatePass = computeMedian(winRatePassSamples);
    const medianWinRateFail = computeMedian(winRateFailSamples);
    const medianWinRateOverall = computeMedian(winRateOverallSamples);

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
      medianTradesPass,
      medianTradesFail,
      medianTimePass,
      medianTimeFail,
      medianWinRatePass,
      medianWinRateFail,
      medianWinRateOverall,
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
  const statsRefreshStatusDetail = getStatsRefreshStatusDetail(statsRefreshStatus);
  const statsRefreshRangeStartLabel = formatStatsRefreshDateLabel(statsRefreshTimelineRange.startMs);
  const statsRefreshRangeEndLabel = formatStatsRefreshDateLabel(statsRefreshTimelineRange.endMs);
  const statsRefreshCurrentDateLabel =
    statsRefreshProgressLabel || statsRefreshRangeStartLabel;
  const statsRefreshPhaseCount = Math.max(1, statsRefreshPhasePlan.length);
  const statsRefreshPhaseIndex = Math.max(
    1,
    statsRefreshPhasePlan.indexOf(getStatsRefreshPhaseKey(statsRefreshStatus)) + 1
  );
  const statsRefreshPhaseLabel = `${statsRefreshPhaseIndex} out of ${statsRefreshPhaseCount} phases`;
  const statsRefreshContextLabel =
    `${appliedBacktestSettings.symbol} · ${appliedBacktestSettings.timeframe} · ` +
    `${appliedBacktestSettings.aiMode === "off" ? "AI Off" : "AI On"}`;
  const isGideonSurface = selectedSurfaceTab === "ai";
  const backtestSurfaceLoadingLabel =
    selectedSurfaceTab === "models" ? "Loading Models..." : "Preparing Backtest...";

  return (
    <main className={`terminal${isGideonSurface ? " terminal-gideon" : ""}`}>
      <div className="surface-strip">
        <span className="site-tag surface-brand">Korra&apos;s Space</span>
        <nav className="surface-tabs" aria-label="primary views">
          {surfaceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`surface-tab ${selectedSurfaceTab === tab.id ? "active" : ""}`}
              onClick={() => {
                if (
                  (tab.id === "backtest" || tab.id === "settings" || tab.id === "models") &&
                  selectedSurfaceTab !== tab.id
                ) {
                  setIsBacktestSurfaceSettled(false);
                }

                if (tab.id === "settings") {
                  setSelectedBacktestTab("mainSettings");
                } else if (
                  tab.id === "backtest" &&
                  (selectedBacktestTab === "mainSettings" || selectedBacktestTab === "timeSettings")
                ) {
                  setSelectedBacktestTab("mainStats");
                }

                setSelectedSurfaceTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {isGideonSurface ? null : (
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
        )}
      </div>

      {!isGideonSurface ? (
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
      ) : null}

      <section className="surface-stage">
        {!terminalViewStateReady ? (
          <section
            aria-label="workspace startup"
            style={{
              flex: 1,
              minHeight: 0,
              background: "#040404"
            }}
          />
        ) : (
          <>
        <div className={`surface-view ${isChartSurface ? "" : "hidden"}`}>
          <section
            ref={workspaceRef}
            className={`workspace ${panelExpanded ? "" : "panel-collapsed"}`}
            style={workspaceStyle}
          >
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
              <div className="chart-overlay-stack">
                <div className="quote-overlay-card" title="Live quote from bid/ask ticks">
                  <div className="quote-overlay-head">
                    <strong>Live Quote</strong>
                  </div>
                  <div className="quote-overlay-grid">
                    <div className="quote-overlay-item">
                      <span>Ask</span>
                      <strong className={liveQuote.askTone}>{liveAskLabel}</strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Spread</span>
                      <strong className="neutral">{liveSpreadLabel}</strong>
                    </div>
                    <div className="quote-overlay-item">
                      <span>Bid</span>
                      <strong className={liveQuote.bidTone}>{liveBidLabel}</strong>
                    </div>
                  </div>
                </div>
                <div
                  className="vp-proxy-card"
                  title="Bookmap VP-style view. Uses quote-direction pressure from bid/ask/mid ticks, not true traded volume."
                  style={{ ["--vp-threshold-ratio" as any]: `${(VP_THRESHOLD_RATIO * 100).toFixed(0)}%` }}
                >
                  <div className="vp-proxy-head">
                    <strong>VP*</strong>
                    <span>{aggressorWindowLabel} quote window</span>
                  </div>

                  <div className="vp-proxy-row">
                    <div className="vp-proxy-row-head">
                      <span>Aggr sells</span>
                      <span>{formatAggressorPressure(estimatedVolumeScale)}</span>
                    </div>
                    <div className="vp-proxy-track">
                      <span
                        className="vp-proxy-fill sell"
                        style={{ width: `${(aggressorSellFillShare * 100).toFixed(1)}%` }}
                      />
                      <span className="vp-proxy-midline" />
                      <span className="vp-proxy-value">
                        {formatAggressorPressure(estimatedSellVolume)}
                      </span>
                    </div>
                  </div>

                  <div className="vp-proxy-row">
                    <div className="vp-proxy-row-head">
                      <span>Aggr buys</span>
                      <span>{formatAggressorPressure(estimatedVolumeScale)}</span>
                    </div>
                    <div className="vp-proxy-track">
                      <span
                        className="vp-proxy-fill buy"
                        style={{ width: `${(aggressorBuyFillShare * 100).toFixed(1)}%` }}
                      />
                      <span className="vp-proxy-midline" />
                      <span className="vp-proxy-value">
                        {formatAggressorPressure(estimatedBuyVolume)}
                      </span>
                    </div>
                  </div>

                  <div className="vp-proxy-meta">
                    <span>
                      Delta {aggressorImbalancePct >= 0 ? "+" : ""}
                      {aggressorImbalancePct.toFixed(1)}%
                    </span>
                    <span>Vol {estimatedVolumeCurrentLabel}/{estimatedVolumeFinalLabel}</span>
                    <span>{Math.round(volumeNowcast.confidence * 100)}%</span>
                  </div>
                </div>
              </div>
              <div className={`chart-stage ${isChartDataLoading ? "chart-stage-loading" : ""}`}>
                <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
                <div ref={countdownOverlayRef} className="candle-countdown-overlay" />
                {isChartDataLoading ? (
                  <ChartLoadingSpinner label="Loading chart candles..." />
                ) : null}
                <div className="chart-stage-actions">
                  <button
                    type="button"
                    className="chart-reset-btn"
                    onClick={resetChart}
                    title="Reset chart view (⌥R)"
                  >
                    Reset Chart
                  </button>
                </div>
                {chartContextMenu
                  ? (() => {
                      const { candle } = chartContextMenu;
                      const bullish = candle.close >= candle.open;
                      const chg = candle.close - candle.open;
                      const chgPct = candle.open !== 0 ? (chg / candle.open) * 100 : 0;
                      const range = candle.high - candle.low;
                      const body = Math.abs(chg);
                      const fp = (value: number) => value.toFixed(2);
                      const fs = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
                      const realSec = gaplessToRealRef.current.get(candle.time) ?? candle.time;
                      const dt = new Date(realSec * 1000);
                      const dateStr = dt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });
                      const timeStr = dt.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit"
                      });
                      const viewportWidth =
                        typeof window !== "undefined" ? window.innerWidth : Number.POSITIVE_INFINITY;
                      const viewportHeight =
                        typeof window !== "undefined" ? window.innerHeight : Number.POSITIVE_INFINITY;
                      const contextMenuWidth = 250;
                      const contextMenuHeight = 332;
                      let left = chartContextMenu.clientX + 4;
                      let top = chartContextMenu.clientY + 4;
                      if (left + contextMenuWidth > viewportWidth - 8) {
                        left = chartContextMenu.clientX - (contextMenuWidth + 4);
                      }
                      if (top + contextMenuHeight > viewportHeight - 8) {
                        top = chartContextMenu.clientY - (contextMenuHeight + 4);
                      }
                      const row = (label: string, value: string, color: string) => (
                        <div
                          key={label}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "3px 0"
                          }}
                        >
                          <span
                            style={{
                              color: "rgba(255,255,255,0.45)",
                              fontSize: 11,
                              fontFamily: "ui-sans-serif,system-ui,sans-serif",
                              fontWeight: 500
                            }}
                          >
                            {label}
                          </span>
                          <span
                            style={{
                              color,
                              fontWeight: 700,
                              fontSize: 13,
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "0.02em"
                            }}
                          >
                            {value}
                          </span>
                        </div>
                      );

                      return (
                        <div
                          ref={chartContextMenuRef}
                          style={{
                            position: "fixed",
                            left,
                            top,
                            zIndex: 99999,
                            background: "rgba(10,10,14,0.97)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 14,
                            padding: "14px 18px",
                            minWidth: 230,
                            boxShadow: "0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)",
                            backdropFilter: "blur(20px)",
                            fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
                            fontSize: 12
                          }}
                          onContextMenu={(event) => event.preventDefault()}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 10,
                              paddingBottom: 8,
                              borderBottom: "1px solid rgba(255,255,255,0.08)"
                            }}
                          >
                            <span
                              style={{
                                color: "rgba(255,255,255,0.55)",
                                fontSize: 11,
                                fontFamily: "ui-sans-serif,system-ui,sans-serif"
                              }}
                            >
                              {dateStr}
                            </span>
                            <span
                              style={{
                                color: "rgba(255,255,255,0.55)",
                                fontSize: 11,
                                fontFamily: "ui-sans-serif,system-ui,sans-serif"
                              }}
                            >
                              {timeStr}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: bullish ? "#34d399" : "#fb7185"
                              }}
                            />
                            <span
                              style={{
                                color: bullish ? "#34d399" : "#fb7185",
                                fontWeight: 700,
                                fontSize: 12,
                                fontFamily: "ui-sans-serif,system-ui,sans-serif"
                              }}
                            >
                              {bullish ? "Bullish" : "Bearish"}
                            </span>
                          </div>
                          {row("Open", fp(candle.open), "rgba(255,255,255,0.85)")}
                          {row("High", fp(candle.high), "#34d399")}
                          {row("Low", fp(candle.low), "#fb7185")}
                          {row("Close", fp(candle.close), bullish ? "#34d399" : "#fb7185")}
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "8px 0" }} />
                          {row(
                            "Change",
                            `${fs(chg)} (${fs(chgPct)}%)`,
                            bullish ? "#34d399" : "#fb7185"
                          )}
                          {row("Range", fp(range), "#fbbf24")}
                          {row("Body", fp(body), "rgba(255,255,255,0.50)")}
                          {row(
                            "Bar #",
                            candle.index === null ? "\u2014" : String(candle.index),
                            "rgba(255,255,255,0.35)"
                          )}
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "9px 0 8px" }} />
                          <div
                            style={{
                              color: "rgba(255,255,255,0.52)",
                              fontSize: 10,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              marginBottom: 6
                            }}
                          >
                            {selectedSymbol} · {selectedTimeframe}
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </div>
            </section>

            <aside className={`side-panel ${panelExpanded ? "expanded" : "collapsed"}`}>
              {panelExpanded ? (
                <button
                  type="button"
                  className={`panel-resizer ${isWorkspacePanelResizing ? "active" : ""}`}
                  onPointerDown={startWorkspacePanelResize}
                  aria-label="Resize side panel"
                  title="Drag to resize panel"
                />
              ) : null}
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

                      if (selectedSurfaceTab === "ai") {
                        setSelectedSurfaceTab("chart");
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
                      <div className="watchlist-head panel-head-centered">
                        <div>
                          <h2>Active Trade</h2>
                        </div>
                      </div>
                      <div className="panel-head-actions">
                        <button
                          type="button"
                          className={`panel-action-btn panel-mode-btn ${
                            activePanelLiveSimulationEnabled ? "on" : "off"
                          }`}
                          onClick={() =>
                            setActivePanelLiveSimulationEnabled((current) => !current)
                          }
                        >
                          {activePanelLiveSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                        </button>
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
                          <p>ClickHouse history + market live feed</p>
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

                  {activePanelTab === "history" ? (
                    <div className="tab-view">
                      <div className="watchlist-head panel-head-centered">
                        <div>
                          <h2>History</h2>
                        </div>
                      </div>
                      <div className="panel-head-actions">
                        <button
                          type="button"
                          className={`panel-action-btn panel-mode-btn ${
                            chartPanelLiveSimulationEnabled ? "on" : "off"
                          }`}
                          onClick={() =>
                            setChartPanelLiveSimulationEnabled((current) => !current)
                          }
                        >
                          {chartPanelLiveSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                        </button>
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
                      <div className="watchlist-head panel-head-centered">
                        <div>
                          <h2>Action</h2>
                        </div>
                      </div>
                      <div className="panel-head-actions">
                        <button
                          type="button"
                          className={`panel-action-btn panel-mode-btn ${
                            chartPanelLiveSimulationEnabled ? "on" : "off"
                          }`}
                          onClick={() =>
                            setChartPanelLiveSimulationEnabled((current) => !current)
                          }
                        >
                          {chartPanelLiveSimulationEnabled ? "Simulation ON" : "Simulation OFF"}
                        </button>
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

                </div>
              ) : null}
            </aside>
          </section>
        </div>

        {isGideonSurface ? (
          <section className="gideon-surface" aria-label="gideon workspace">
            <AssistantPanel
              symbol={selectedSymbol}
              timeframe={selectedTimeframe}
              selectedCandles={selectedCandles}
              activeTrade={
                activeTrade
                  ? {
                      ...activeTrade,
                      openedAt: Number(activeTrade.openedAt)
                    }
                  : null
              }
              historyRows={chartPanelHistoryRows}
              actionRows={actionRows}
              backtestHasRun={backtestHasRun}
              backtestTimeframe={appliedBacktestSettings.timeframe}
              backtestTrades={backtestTrades}
              onRunChartActions={runAssistantChartActions}
              onImportStrategyModel={handleImportAssistantStrategyModel}
            />
          </section>
        ) : null}

        {selectedSurfaceTab === "copytrade" ? (
          <section
            aria-label="copy trade workspace"
            style={{
              height: "100%",
              minHeight: 0,
              padding: 0,
              background: "#040404",
              overflow: "hidden"
            }}
          >
            <iframe
              key={copytradeDashboardVersion}
              src={copytradeIframeSrc}
              title="Copy Trade Dashboard"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                minHeight: "100%",
                border: 0,
                borderRadius: 0,
                background: "#040404"
              }}
            />
          </section>
        ) : null}

        {selectedSurfaceTab === "backtest" ||
        selectedSurfaceTab === "settings" ||
        selectedSurfaceTab === "models" ? (
          <section
            className="backtest-surface"
            aria-label={
              selectedSurfaceTab === "settings"
                ? "settings workspace"
                : selectedSurfaceTab === "models"
                  ? "models workspace"
                  : "backtest workspace"
            }
          >
            <div className="backtest-shell">
              {selectedSurfaceTab === "settings" ? (
                <div
                  className={`backtest-card compact backtest-date-range-card ${
                    !isBacktestSurfaceSettled || statsRefreshOverlayMode === "loading"
                      ? "is-loading"
                      : ""
                  }`}
                >
                <div className="backtest-card-head backtest-stats-head">
                  <div>
                    <h3>Settings</h3>
                  </div>

                  <div
                    className="backtest-stats-range backtest-stats-range-main"
                    aria-label="global backtest settings"
                  >
                    <div className="backtest-date-input-row">
                      <input
                        type="date"
                        value={statsDateStart}
                        onChange={(event) => {
                          setStatsDateStart(event.target.value);
                          setStatsDatePreset("custom");
                        }}
                        className="backtest-date-input"
                        aria-label="global backtest start date"
                      />
                      <span className="backtest-stats-range-arrow">-&gt;</span>
                      <input
                        type="date"
                        value={statsDateEnd}
                        onChange={(event) => {
                          setStatsDateEnd(event.target.value);
                          setStatsDatePreset("custom");
                        }}
                        className="backtest-date-input"
                        aria-label="global backtest end date"
                      />
                    </div>
                    <div className="backtest-date-preset-row">
                      <div ref={statsDatePresetDdRef} className="backtest-date-preset-wrap">
                        <button
                          type="button"
                          className="backtest-date-preset-trigger"
                          onClick={() => setStatsDatePresetDdOpen((open) => !open)}
                          aria-haspopup="listbox"
                          aria-expanded={statsDatePresetDdOpen}
                          aria-label="Select backtest date preset"
                        >
                          {
                            BACKTEST_DATE_PRESET_OPTIONS.find((option) => option.id === statsDatePreset)
                              ?.label ?? "Custom"
                          }
                          <span className="backtest-date-preset-chevron" aria-hidden="true">
                            {statsDatePresetDdOpen ? "▴" : "▾"}
                          </span>
                        </button>
                        {statsDatePresetDdOpen ? (
                          <div
                            className="backtest-date-preset-dd"
                            role="listbox"
                            aria-label="Backtest date preset options"
                          >
                            {BACKTEST_DATE_PRESET_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                role="option"
                                aria-selected={statsDatePreset === option.id}
                                className={`backtest-date-preset-option${
                                  statsDatePreset === option.id ? " active" : ""
                                }`}
                                onClick={() => {
                                  setStatsDatePreset(option.id);
                                  setStatsDatePresetDdOpen(false);
                                  if (option.id === "custom") {
                                    return;
                                  }
                                  const range = buildBacktestDateRangeFromPreset(option.id);
                                  setStatsDateStart(range.startDate);
                                  setStatsDateEnd(range.endDate);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
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
                          {TIMEFRAME_DISPLAY_LABELS[selectedBacktestTimeframe]}
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
                                aria-selected={selectedBacktestTimeframe === tf}
                                className={`stats-timeframe-option${selectedBacktestTimeframe === tf ? " active" : ""}`}
                                onClick={() => {
                                  setSelectedBacktestTimeframe(tf);
                                  setStatsTimeframeDdOpen(false);
                                }}
                              >
                                {TIMEFRAME_DISPLAY_LABELS[tf]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="backtest-minute-precise-row" aria-label="Minute precise execution setting">
                        <button
                          type="button"
                          className={`backtest-minute-precise-btn backtest-minute-precise-single${
                            minutePreciseEnabled ? " active" : ""
                          }`}
                          onClick={() => setMinutePreciseEnabled((current) => !current)}
                          aria-pressed={minutePreciseEnabled}
                          aria-label="Toggle minute precise execution"
                        >
                          <span className="backtest-minute-precise-btn-title">Minute Precise</span>
                          {minutePreciseEnabled ? (
                            <span className="backtest-minute-precise-btn-state">ON</span>
                          ) : null}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backtest-toolbar-note backtest-toolbar-note-stack">
                  <span className="backtest-toolbar-note-range">
                    Start Date: <strong>{backtestDateRangeStartLabel}</strong> · End Date:{" "}
                    <strong>{backtestDateRangeEndLabel}</strong>
                  </span>
                  <span className="backtest-toolbar-note-meta">
                    Total Live Trades: <strong>{totalSimulatedLiveTrades.toLocaleString("en-US")}</strong> ·
                    {" "}Accepted Live Trades: <strong>{backtestTrades.length.toLocaleString("en-US")}</strong> ·
                    {" "}Total Library Trades:{" "}
                    <strong>{totalLoadedLibraryTrades.toLocaleString("en-US")}</strong>
                  </span>
                </div>
                </div>
              ) : null}

              {selectedSurfaceTab === "models" ? (
                <div className="backtest-card compact models-surface-overview">
                  <div className="backtest-card-head backtest-stats-head">
                    <div>
                      <h3>Models</h3>
                    </div>
                    <div className="models-surface-overview-actions">
                      <button
                        type="button"
                        className="panel-action-btn"
                        onClick={handleOpenModelUpload}
                      >
                        Upload Model
                      </button>
                      <input
                        ref={modelsUploadInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleUploadStrategyModels}
                        style={{ display: "none" }}
                      />
                    </div>
                  </div>
                  {modelsSurfaceNotice ? (
                    <div
                      className={`backtest-toolbar-note-meta models-surface-status models-surface-status-${modelsSurfaceNoticeTone}`}
                    >
                      {modelsSurfaceNotice}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedSurfaceTab === "backtest" ? (
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
              ) : null}

              <AiSettingsModal
                title={activeModelRunEntry?.name ?? "Model Run"}
                subtitle={`${selectedSymbol} · JSON replay run`}
                size="xwide"
                cardClassName="model-run-modal-card"
                bodyClassName="model-run-modal-body"
                open={Boolean(activeModelRunEntry)}
                onClose={closeModelRunModal}
              >
                {activeModelRunEntry ? (
                  <div className="model-run-shell">
                    <div className="model-run-toolbar">
                      <div className="model-run-toolbar-main">
                        <div ref={modelRunPresetDdRef} className="backtest-date-preset-wrap">
                          <button
                            type="button"
                            className="backtest-date-preset-trigger"
                            onClick={() => setModelRunPresetDdOpen((open) => !open)}
                            aria-haspopup="listbox"
                            aria-expanded={modelRunPresetDdOpen}
                            aria-label="Select model run range"
                          >
                            {
                              MODEL_RUN_DATE_PRESET_OPTIONS.find((option) => option.id === modelRunPreset)
                                ?.label ?? "Past Month"
                            }
                            <span className="backtest-date-preset-chevron" aria-hidden="true">
                              {modelRunPresetDdOpen ? "▴" : "▾"}
                            </span>
                          </button>
                          {modelRunPresetDdOpen ? (
                            <div
                              className="backtest-date-preset-dd"
                              role="listbox"
                              aria-label="Model run range options"
                            >
                              {MODEL_RUN_DATE_PRESET_OPTIONS.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  role="option"
                                  aria-selected={modelRunPreset === option.id}
                                  className={`backtest-date-preset-option${
                                    modelRunPreset === option.id ? " active" : ""
                                  }`}
                                  onClick={() => {
                                    setModelRunPreset(option.id);
                                    setModelRunPresetDdOpen(false);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div ref={modelRunTimeframeDdRef} className="stats-timeframe-wrap">
                          <button
                            type="button"
                            className="stats-timeframe-trigger"
                            onClick={() => setModelRunTimeframeDdOpen((open) => !open)}
                            aria-haspopup="listbox"
                            aria-expanded={modelRunTimeframeDdOpen}
                            aria-label="Select model run timeframe"
                          >
                            {TIMEFRAME_DISPLAY_LABELS[modelRunTimeframe]}
                            <span className="stats-timeframe-chevron" aria-hidden="true">
                              {modelRunTimeframeDdOpen ? "▴" : "▾"}
                            </span>
                          </button>
                          {modelRunTimeframeDdOpen ? (
                            <div
                              className="stats-timeframe-dd"
                              role="listbox"
                              aria-label="Model run timeframe options"
                            >
                              {timeframes.map((timeframe) => (
                                <button
                                  key={timeframe}
                                  type="button"
                                  role="option"
                                  aria-selected={modelRunTimeframe === timeframe}
                                  className={`stats-timeframe-option${
                                    modelRunTimeframe === timeframe ? " active" : ""
                                  }`}
                                  onClick={() => {
                                    setModelRunTimeframe(timeframe);
                                    setModelRunTimeframeDdOpen(false);
                                  }}
                                >
                                  {TIMEFRAME_DISPLAY_LABELS[timeframe]}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="model-run-toolbar-main model-run-toolbar-main-end">
                        <label className="model-run-number-control">
                          <span>TP</span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={modelRunTpDollars}
                            onChange={(event) => {
                              setModelRunTpDollars(
                                Math.max(0, Number(event.target.value) || 0)
                              );
                            }}
                            className="model-run-number-input"
                            aria-label="Model run take profit"
                          />
                        </label>
                        <label className="model-run-number-control">
                          <span>SL</span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={modelRunSlDollars}
                            onChange={(event) => {
                              setModelRunSlDollars(
                                Math.max(0, Number(event.target.value) || 0)
                              );
                            }}
                            className="model-run-number-input"
                            aria-label="Model run stop loss"
                          />
                        </label>
                        <label className="model-run-number-control">
                          <span>Units</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={modelRunUnits}
                            onChange={(event) => {
                              setModelRunUnits(Math.max(1, Number(event.target.value) || 1));
                            }}
                            className="model-run-number-input"
                            aria-label="Model run units"
                          />
                        </label>
                        <button
                          type="button"
                          className="panel-action-btn model-run-submit-btn"
                          onClick={handleRunModelBacktest}
                          disabled={modelRunRunning}
                        >
                          {modelRunRunning ? "Running..." : "Run"}
                        </button>
                      </div>
                    </div>

                    {modelRunError ? <div className="model-run-error">{modelRunError}</div> : null}

                    <div className="model-run-layout">
                      <section className="model-run-chart-panel">
                        <header className="model-run-panel-head">
                          <div className="model-run-panel-copy">
                            <strong>Equity Curve</strong>
                            <span>
                              {modelRunResult
                                ? `${modelRunResult.request.startDate} to ${modelRunResult.request.endDate} · ${modelRunResult.trades.length.toLocaleString("en-US")} trades`
                                : `${TIMEFRAME_DISPLAY_LABELS[modelRunTimeframe]} · ${selectedSymbol}`}
                            </span>
                          </div>
                        </header>
                        <ModelRunEquityChart
                          data={modelRunResult?.chartData ?? []}
                          emptyLabel={
                            modelRunResult
                              ? "No trades matched this model setup."
                              : "Run the model to load an equity curve."
                          }
                        />
                      </section>

                      <section className="model-run-stats-panel">
                        <header className="model-run-panel-head">
                          <div className="model-run-panel-copy">
                            <strong>Stats</strong>
                            <span>Calculated from the same JSON replay model used by backtesting.</span>
                          </div>
                        </header>
                        <div className="model-run-stats-grid">
                          <article className="model-run-stat-card">
                            <span>Win Rate</span>
                            <strong className={modelRunResult && modelRunResult.summary.winRate >= 50 ? "up" : ""}>
                              {modelRunResult ? `${modelRunResult.summary.winRate.toFixed(1)}%` : "—"}
                            </strong>
                          </article>
                          <article className="model-run-stat-card">
                            <span>Profit Factor</span>
                            <strong>
                              {modelRunResult ? modelRunResult.summary.profitFactor.toFixed(2) : "—"}
                            </strong>
                          </article>
                          <article className="model-run-stat-card">
                            <span>Average Win</span>
                            <strong className={modelRunResult ? "up" : ""}>
                              {modelRunResult ? formatSignedUsd(modelRunResult.summary.avgWin) : "—"}
                            </strong>
                          </article>
                          <article className="model-run-stat-card">
                            <span>Average Loss</span>
                            <strong className={modelRunResult ? "down" : ""}>
                              {modelRunResult ? formatSignedUsd(modelRunResult.summary.avgLoss) : "—"}
                            </strong>
                          </article>
                          <article className="model-run-stat-card">
                            <span>Trades</span>
                            <strong>
                              {modelRunResult
                                ? modelRunResult.summary.tradeCount.toLocaleString("en-US")
                                : "—"}
                            </strong>
                          </article>
                          <article className="model-run-stat-card">
                            <span>Net PnL</span>
                            <strong className={modelRunResult && modelRunResult.summary.netPnl >= 0 ? "up" : modelRunResult ? "down" : ""}>
                              {modelRunResult ? formatSignedUsd(modelRunResult.summary.netPnl) : "—"}
                            </strong>
                          </article>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}
              </AiSettingsModal>

              <section className={`backtest-panel ${!isBacktestSurfaceSettled ? "backtest-panel-loading" : ""}`}>
                {!isBacktestSurfaceSettled ? (
                  <ChartLoadingSpinner label={backtestSurfaceLoadingLabel} />
                ) : (
                  <>
              {selectedSurfaceTab === "models" ? (
                <div className="models-library-grid">
                  {modelsSurfaceEntries.map((model) => (
                    <article
                      key={model.id}
                      className="backtest-card models-library-card models-library-card-interactive"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${model.name} model runner`}
                      onClick={() => openModelRunModal(model)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openModelRunModal(model);
                        }
                      }}
                    >
                      <div className="models-library-card-head">
                        <div className="models-library-card-copy">
                          <div className="models-library-title-row">
                            <h3>{model.name}</h3>
                          </div>
                        </div>
                        {uploadedModelIdSet.has(model.id) ? (
                          <button
                            type="button"
                            className="panel-action-btn models-library-delete-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteStrategyModel(model);
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="panel-action-btn models-library-download-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDownloadStrategyModel(model);
                          }}
                        >
                          Download
                        </button>
                      </div>

                      <div className="models-library-sections">
                        <section className="models-library-section models-library-section-buy">
                          <header>
                            <span>Buy Entry Trigger</span>
                          </header>
                          {model.backtestSummary.buyEntryTrigger.length > 0 ? (
                            <ul className="models-library-rule-list">
                              {model.backtestSummary.buyEntryTrigger.map((item, index) => (
                                <li key={`${model.id}-buy-entry-trigger-${index}`}>
                                  <span className="models-library-rule-copy">{item}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="models-library-rule-spacer" aria-hidden="true" />
                          )}
                        </section>

                        <section className="models-library-section models-library-section-sell">
                          <header>
                            <span>Sell Entry Trigger</span>
                          </header>
                          {model.backtestSummary.sellEntryTrigger.length > 0 ? (
                            <ul className="models-library-rule-list">
                              {model.backtestSummary.sellEntryTrigger.map((item, index) => (
                                <li key={`${model.id}-sell-entry-trigger-${index}`}>
                                  <span className="models-library-rule-copy">{item}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="models-library-rule-spacer" aria-hidden="true" />
                          )}
                        </section>

                        <section className="models-library-section models-library-section-buy">
                          <header>
                            <span>Buy Exit Trigger</span>
                          </header>
                          {model.backtestSummary.buyExitTrigger.length > 0 ? (
                            <ul className="models-library-rule-list">
                              {model.backtestSummary.buyExitTrigger.map((item, index) => (
                                <li key={`${model.id}-buy-exit-trigger-${index}`}>
                                  <span className="models-library-rule-copy">{item}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="models-library-rule-spacer" aria-hidden="true" />
                          )}
                        </section>

                        <section className="models-library-section models-library-section-sell">
                          <header>
                            <span>Sell Exit Trigger</span>
                          </header>
                          {model.backtestSummary.sellExitTrigger.length > 0 ? (
                            <ul className="models-library-rule-list">
                              {model.backtestSummary.sellExitTrigger.map((item, index) => (
                                <li key={`${model.id}-sell-exit-trigger-${index}`}>
                                  <span className="models-library-rule-copy">{item}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="models-library-rule-spacer" aria-hidden="true" />
                          )}
                        </section>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <>
              {selectedSurfaceTab === "backtest" &&
              backtestDateFilteredTrades.length === 0 &&
              backtestModelProfiles.length === 0 ? (
                <div className="backtest-empty">
                  <h3>No models selected</h3>
                  <p>
                    Open Settings and enable at least one model in the MODELS panel to load backtest
                    results.
                  </p>
                </div>
              ) : selectedSurfaceTab === "backtest" &&
                backtestDateFilteredTrades.length === 0 &&
                backtestSourceTrades.length > 0 ? (
                <div className="backtest-empty">
                  <h3>No trades in the selected date range</h3>
                  <p>
                    Open the Settings tab to adjust the Backtest Date Range, or clear it to load the full simulated
                    trade history again.
                  </p>
                </div>
              ) : selectedSurfaceTab === "backtest" &&
                isBacktestHistorySeedBlocked ? (
                <div className="backtest-empty">
                  <h3>Historical candle range unavailable</h3>
                  <p>
                    The requested candle history could not be loaded for the selected backtest
                    window. Narrow the date range or rerun after history sync completes.
                  </p>
                </div>
              ) : null}

              {selectedSurfaceTab === "backtest" && shouldShowBacktestInlineLoader ? (
                <ChartLoadingSpinner label={backtestInlineLoaderLabel} />
              ) : null}

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "mainStats" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <div className="backtest-card-head backtest-stats-head">
                      <div>
                        <h3>{mainStatsTitle}</h3>
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

              {selectedSurfaceTab === "settings" ||
              (selectedSurfaceTab === "backtest" && selectedBacktestTab === "mainSettings") ? (
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
                          className="ai-zip-button"
                          disabled={aiDisabled}
                          onClick={() => setMethodSettingsOpen(true)}
                        >
                          Method Specific Settings
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
                        <div className="ai-zip-note">
                          The active backtest surface applies the confidence gate plus data,
                          dimensionality, and library settings below. Exit-tuning and
                          volatility-only controls remain out of this applied pipeline for now,
                          so they were removed here to keep the surface honest.
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section-title">AI Data &amp; Embedding</div>
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        <div className="ai-zip-toggle-grid ai-zip-data-grid">
                          <button
                            type="button"
                            className={`ai-zip-button ${selectedAiModelCount > 0 ? "active" : ""}`}
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
                            className={`ai-zip-button ${
                              selectedAiLibraryCount > 0 ? "active" : ""
                            }`}
                            disabled={aiDisabled}
                            onClick={() => setLibrariesModalOpen(true)}
                          >
                            Libraries ({selectedAiLibraryCount})
                          </button>
                          <button
                            type="button"
                            className={`ai-zip-button toggle ${
                              staticLibrariesClusters ? "active success" : ""
                            }`}
                            disabled={aiDisabled}
                            onClick={() => setStaticLibrariesClusters((value) => !value)}
                          >
                            Static Libraries {staticLibrariesClusters ? "· ON" : "· OFF"}
                          </button>
                          <button
                            type="button"
                            className={`ai-zip-button toggle ${
                              onlineLearningEnabled ? "active success" : ""
                            }`}
                            disabled={aiDisabled}
                            onClick={toggleOnlineLearning}
                          >
                            Online Learning {onlineLearningEnabled ? "· ON" : "· OFF"}
                          </button>
                          <button
                            type="button"
                            className={`ai-zip-button toggle ${
                              ghostLearningEnabled ? "active success" : ""
                            }`}
                            disabled={aiDisabled}
                            onClick={toggleGhostLearning}
                          >
                            Ghost Learning {ghostLearningEnabled ? "· ON" : "· OFF"}
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
                      </div>
                    </div>

                    <div className="backtest-card" style={{ padding: "0.85rem" }}>
                      <div className="ai-zip-section-title">Dimensionality</div>
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        <div className={`ai-zip-control ${aiDisabled ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Neighbor Calculation Space</div>
                          <div className="ai-zip-toggle-grid tiles compact">
                            {KNN_NEIGHBOR_SPACE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`ai-zip-button pill ${
                                  knnNeighborSpace === option.value ? "active" : ""
                                }`}
                                disabled={aiDisabled}
                                onClick={() => setKnnNeighborSpace(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
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
                        </div>

                        <div className="ai-zip-input-grid compact-trade-row">
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
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">Maximum Trades at a Time</span>
                            <input
                              type="number"
                              min={1}
                              max={500}
                              step={1}
                              value={maxConcurrentTrades}
                              onChange={(event) => {
                                setMaxConcurrentTrades(
                                  clamp(Math.floor(Number(event.target.value) || 1), 1, 500)
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
                            setAntiCheatEnabled((current) => !current);
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
                              disabled={realismLevel === 0}
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
                  {settingsModelNames.map((modelName) => {
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
                      {visibleAiLibraries.length === 0 ? (
                        <p className="ai-zip-library-empty">No active libraries selected.</p>
                      ) : (
                        visibleAiLibraries.map((libraryId, index) => {
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
                                    disabled={index === visibleAiLibraries.length - 1}
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
                      <button
                        type="button"
                        className="ai-zip-library-action primary wide"
                        disabled={!effectiveAiLibraryReadyToRun || aiLibraryAnyLoading}
                        onClick={() =>
                          runAllActiveLibraries({
                            libraryIds: effectiveAiLibraryRunLibraryIds,
                            settingsSource: effectiveAiLibraryRunSettingsSource,
                            backtestSettings: effectiveAiLibraryRunBacktestSettings
                          })
                        }
                      >
                        {aiLibraryAnyLoading ? "Running Libraries..." : "Run All Active Libraries"}
                      </button>
                    </section>

                    <section className="ai-zip-library-column settings">
                      <header>
                        <strong>Settings</strong>
                        <span>{selectedAiLibrary ? selectedAiLibrary.name : "Select an active library"}</span>
                        {selectedAiLibrary ? (
                          <div className="ai-zip-library-settings-meta">
                            <span
                              className={`ai-zip-library-status-badge ${selectedAiLibraryStatusClass}`}
                            >
                              {selectedAiLibraryStatusLabel}
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
                              const isTargetWinRateField =
                                field.key === AI_LIBRARY_TARGET_WIN_RATE_KEY;
                              const isNaturalTargetWinRateMode =
                                isTargetWinRateField &&
                                selectedAiLibraryTargetWinRateMode === "natural";
                              const displayedNumericValue = isNaturalTargetWinRateMode
                                ? selectedAiLibraryNaturalTargetWinRate
                                : numericValue;
                              const canRange =
                                min != null &&
                                max != null &&
                                (field.key === "maxSamples" || max - min <= 50000);
                              const sliderPercent =
                                min != null && max != null && max > min
                                  ? ((displayedNumericValue - min) / (max - min)) * 100
                                  : 50;

                              return (
                                <label key={field.key} className="ai-zip-library-field-block">
                                  <span className="ai-zip-library-field-label">{field.label}</span>
                                  {isTargetWinRateField ? (
                                    <div className="ai-zip-library-actions">
                                      <button
                                        type="button"
                                        className={`ai-zip-library-action ${selectedAiLibraryTargetWinRateMode === "natural" ? "primary" : ""}`}
                                        onClick={() => {
                                          updateAiLibrarySetting(
                                            selectedAiLibrary.id,
                                            AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY,
                                            "natural"
                                          );
                                        }}
                                      >
                                        Natural
                                      </button>
                                      <button
                                        type="button"
                                        className={`ai-zip-library-action ${selectedAiLibraryTargetWinRateMode === "artificial" ? "primary" : ""}`}
                                        onClick={() => {
                                          updateAiLibrarySetting(
                                            selectedAiLibrary.id,
                                            AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY,
                                            "artificial"
                                          );
                                        }}
                                      >
                                        Artificial
                                      </button>
                                    </div>
                                  ) : null}
                                  <input
                                    type="number"
                                    value={displayedNumericValue}
                                    min={min}
                                    max={max}
                                    step={step}
                                    disabled={isNaturalTargetWinRateMode}
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
                                    style={
                                      isNaturalTargetWinRateMode
                                        ? ({
                                            opacity: 0.55,
                                            cursor: "not-allowed"
                                          } as React.CSSProperties)
                                        : undefined
                                    }
                                  />
                                  {canRange ? (
                                    <input
                                      type="range"
                                      min={min}
                                      max={max}
                                      step={step}
                                      value={displayedNumericValue}
                                      disabled={isNaturalTargetWinRateMode}
                                      onChange={(event) => {
                                        updateAiLibrarySetting(
                                          selectedAiLibrary.id,
                                          field.key,
                                          Number(event.target.value)
                                        );
                                      }}
                                      className="backtest-slider"
                                      style={
                                        {
                                          "--p": `${sliderPercent}%`,
                                          ...(isNaturalTargetWinRateMode
                                            ? ({
                                                opacity: 0.4,
                                                filter: "grayscale(0.9)",
                                                cursor: "not-allowed"
                                              } as React.CSSProperties)
                                            : {})
                                        } as React.CSSProperties
                                      }
                                    />
                                  ) : null}
                                  {field.help ? (
                                    <p className="ai-zip-library-field-help">{field.help}</p>
                                  ) : null}
                                  {isTargetWinRateField ? (
                                    <p className="ai-zip-library-field-help">
                                      {isNaturalTargetWinRateMode
                                        ? selectedAiLibraryLoadedCount > 0
                                          ? `Natural mode auto-uses ${selectedAiLibraryNaturalTargetWinRate.toFixed(
                                              1
                                            )}% from loaded neighbors.`
                                          : "Natural mode locks to 50% until neighbors are loaded."
                                        : "Artificial mode lets you set the target manually."}
                                    </p>
                                  ) : null}
                                </label>
                              );
                            })}

                            <div className="ai-zip-library-field-block">
                              <button
                                type="button"
                                className="ai-zip-library-action primary compact"
                                disabled={
                                  !effectiveAiLibraryReadyToRun ||
                                  selectedAiLibraryRunStatus === "loading"
                                }
                                onClick={() =>
                                  runAiLibrary(selectedAiLibrary.id, {
                                    settingsSource: effectiveAiLibraryRunSettingsSource,
                                    backtestSettings: effectiveAiLibraryRunBacktestSettings
                                  })
                                }
                              >
                                {selectedAiLibraryRunStatus === "loading" ? "Loading Library..." : "Run Library"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="ai-zip-library-empty">No library selected.</p>
                        )}
                      </div>
                    </section>
                  </div>
              </AiSettingsModal>

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "history" ? (
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

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "calendar" ? (
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
                          const oneMinuteKey = symbolTimeframeKey(trade.symbol, "1m");
                          const timeframeKey = symbolTimeframeKey(
                            trade.symbol,
                            appliedBacktestSettings.timeframe
                          );
                          const oneMinuteCandles =
                            pickLongestCandleSeries(
                              backtestOneMinuteSeriesMap[oneMinuteKey],
                              backtestSeriesMap[oneMinuteKey],
                              seriesMap[oneMinuteKey]
                            );
                          const timeframeCandles =
                            pickLongestCandleSeries(
                              backtestSeriesMap[timeframeKey],
                              seriesMap[timeframeKey]
                            );
                          const tradeCandles = resolveTradeMiniChartCandles(
                            trade,
                            appliedBacktestSettings.minutePreciseEnabled
                              ? oneMinuteCandles
                              : timeframeCandles,
                            appliedBacktestSettings.minutePreciseEnabled
                              ? timeframeCandles
                              : oneMinuteCandles
                          );
                          const executionFrameLabel =
                            appliedBacktestSettings.minutePreciseEnabled
                              ? appliedBacktestSettings.timeframe === "1m"
                                ? "1m"
                                : "1m exec"
                              : appliedBacktestSettings.timeframe;

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
                                        Entry ({executionFrameLabel}):
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
                                        Exit ({executionFrameLabel}):
                                      </span>
                                      <span className="backtest-calendar-trade-inline-value">
                                        {trade.exitAt}
                                      </span>
                                      <span className="backtest-calendar-trade-inline-price">
                                        @ {formatPrice(trade.outcomePrice)}
                                      </span>
                                    </div>
                                    <div className="backtest-calendar-trade-duration">
                                      Duration: {formatMinutesCompact(durationMinutes)}
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
                                        {formatMinutesCompact(durationMinutes)}
                                      </strong>
                                    </div>
                                    <div className="backtest-calendar-trade-stat">
                                      <span>TP Price</span>
                                      <strong className="backtest-calendar-trade-stat-value tp">
                                        {formatPrice(trade.targetPrice)}
                                      </strong>
                                    </div>
                                    <div className="backtest-calendar-trade-stat">
                                      <span>SL Price</span>
                                      <strong className="backtest-calendar-trade-stat-value sl">
                                        {formatPrice(trade.stopPrice)}
                                      </strong>
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

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "cluster" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <AIZipClusterMap
                      candles={aiZipClusterCandles}
                      trades={aiZipClusterTrades}
                      ghostEntries={[]}
                      libraryPoints={aiClusterLibraryPoints}
                      activeLibraries={aiClusterActiveLibraries}
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
                      aiDomains={appliedBacktestSettings.selectedAiDomains}
                      knnNeighborSpace={appliedBacktestSettings.knnNeighborSpace}
                      distanceMetric={appliedBacktestSettings.distanceMetric}
                      kEntry={appliedBacktestSettings.kEntry}
                      knnVoteMode={appliedBacktestSettings.knnVoteMode}
                      allowTradeNeighborFallback={appliedBacktestSettings.selectedAiLibraries.includes("core")}
                      useEntryNeighborsOnly
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
                  </div>
                </div>
              ) : null}
                </>
              )}
              {selectedSurfaceTab === "settings" ||
              (selectedSurfaceTab === "backtest" && selectedBacktestTab === "timeSettings") ? (
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

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "performanceStats" ? (
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

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "entryExit" ? (
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

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "dimensions" ? (
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

              {selectedSurfaceTab === "backtest" && selectedBacktestTab === "propFirm" ? (
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
                                  <div className="backtest-stat-row">
                                    <span>Median trades to pass</span>
                                    <strong className="up">{propStats.medianTradesPass.toFixed(1)}</strong>
                                  </div>
                                  {propProjectionMethod !== "montecarlo" ? (
                                    <div className="backtest-stat-row">
                                      <span>Avg time to pass</span>
                                      <strong className="up">
                                        {formatPropFirmDuration(propStats.avgTimePass)}
                                      </strong>
                                    </div>
                                  ) : null}
                                  {propProjectionMethod !== "montecarlo" ? (
                                    <div className="backtest-stat-row">
                                      <span>Median time to pass</span>
                                      <strong className="up">
                                        {formatPropFirmDuration(propStats.medianTimePass)}
                                      </strong>
                                    </div>
                                  ) : null}
                                  <div className="backtest-stat-row">
                                    <span>Avg trades to fail</span>
                                    <strong className="down">{propStats.avgTradesFail.toFixed(1)}</strong>
                                  </div>
                                  <div className="backtest-stat-row">
                                    <span>Median trades to fail</span>
                                    <strong className="down">{propStats.medianTradesFail.toFixed(1)}</strong>
                                  </div>
                                  {propProjectionMethod !== "montecarlo" ? (
                                    <div className="backtest-stat-row">
                                      <span>Avg time to fail</span>
                                      <strong className="down">
                                        {formatPropFirmDuration(propStats.avgTimeFail)}
                                      </strong>
                                    </div>
                                  ) : null}
                                  {propProjectionMethod !== "montecarlo" ? (
                                    <div className="backtest-stat-row">
                                      <span>Median time to fail</span>
                                      <strong className="down">
                                        {formatPropFirmDuration(propStats.medianTimeFail)}
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
                                    <span>Median win rate (passes)</span>
                                    <strong
                                      className={propStats.medianWinRatePass >= 0.5 ? "up" : "down"}
                                    >
                                      {(propStats.medianWinRatePass * 100).toFixed(1)}%
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
                                    <span>Median win rate (fails)</span>
                                    <strong
                                      className={propStats.medianWinRateFail >= 0.5 ? "up" : "down"}
                                    >
                                      {(propStats.medianWinRateFail * 100).toFixed(1)}%
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
                                  <div className="backtest-stat-row">
                                    <span>Median win rate (overall)</span>
                                    <strong
                                      className={propStats.medianWinRateOverall >= 0.5 ? "up" : "down"}
                                    >
                                      {(propStats.medianWinRateOverall * 100).toFixed(1)}%
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
          </>
        )}
      </section>

      {!isGideonSurface && statsRefreshOverlayVisible ? (
        statsRefreshOverlayMode === "loading" ? (
          <div className="stats-refresh-loading-overlay" aria-live="polite" aria-atomic="true">
            <div className="stats-refresh-loading-shell">
              <div className="stats-refresh-loading-head">
                <div className="stats-refresh-loading-status">{statsRefreshStatus}</div>
                <div className="stats-refresh-loading-pct">
                  {`${Math.round(statsRefreshDisplayProgress)}%`}
                </div>
              </div>
              <div className="stats-refresh-loading-meta">
                <span>{statsRefreshPhaseLabel}</span>
                <span>{statsRefreshContextLabel}</span>
              </div>
              <div className="stats-refresh-loading-detail">{statsRefreshStatusDetail}</div>
              <div
                key={statsRefreshStatus}
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
              <div className="stats-refresh-loading-range">
                <span>{statsRefreshRangeStartLabel}</span>
                <span>{statsRefreshCurrentDateLabel}</span>
                <span>{statsRefreshRangeEndLabel}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="stats-refresh-overlay" aria-live="polite" aria-atomic="true">
            <div className="stats-refresh-card">
              {`Hold SPACE for ${statsRefreshSecondsRemaining.toFixed(1)}s to reload all backtest data`}
            </div>
          </div>
        )
      ) : null}

      {!isGideonSurface ? (
        <footer className="statusbar backtest-statusbar">
        {backtestHasRun ? (
          <div
            className="backtest-summary-strip backtest-summary-strip-compact"
            aria-label="backtest rolling statistics"
            style={{ "--backtest-stat-item-count": Math.max(1, footerHeroStats.length) } as React.CSSProperties}
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
        ) : (
          <div className="backtest-status-empty" aria-live="polite" aria-atomic="true">
            <strong>No backtest run yet.</strong>
            <span>Hold SPACE for 3 seconds to run your first backtest.</span>
            <span>Tips: tune Date Range, timeframe, and Minute Precise first. Chart reset shortcut: Alt+R.</span>
          </div>
        )}
        </footer>
      ) : null}

      {activeBacktestTradeDetails ? (
        <AIZipTradeDetailsModal
          trade={activeBacktestTradeDetails}
          candles={activeBacktestTradeCandles}
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
