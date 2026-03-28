"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import AssistantInlinePriceActionChart from "./AssistantInlinePriceActionChart";
import AssistantChartAnimationModal from "./AssistantChartAnimationModal";
import GideonWorkView from "./GideonWorkView";
import {
  type AssistantChartAnimation,
  resolveGraphTemplate
} from "../lib/assistant-tools";
import {
  buildStrategyModelFilePayload,
  extractStrategyModelCatalogEntry
} from "../lib/strategyCatalog";

export type AssistantPanelCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type AssistantPanelTrade = {
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
  entryAt: string;
  exitAt: string;
};

export type AssistantPanelAction = {
  id: string;
  tradeId: string;
  symbol: string;
  label: string;
  details: string;
  time: string;
  timestamp: number;
};

export type AssistantPanelActiveTrade = {
  symbol: string;
  side: "Long" | "Short";
  units: number;
  entryPrice: number;
  markPrice: number;
  targetPrice: number;
  stopPrice: number;
  openedAt: number;
  openedAtLabel: string;
  elapsed: string;
  pnlPct: number;
  pnlValue: number;
  progressPct: number;
  rr: number;
};

type AssistantChart = {
  id: string;
  template: string;
  title: string;
  subtitle?: string;
  mode?: "static" | "dynamic";
  data: Array<Record<string, string | number>>;
  config?: Record<string, unknown>;
};

type AssistantBullet = {
  tone: "green" | "red" | "gold" | "black";
  text: string;
};

type AssistantChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  satisfied: boolean;
};

type AssistantStrategyDraft = {
  status: "clarify" | "ready";
  name: string;
  matchedModelId: string;
  matchedModelName: string;
  summary: string;
  entryChecklist: string[];
  confirmationSignals: string[];
  invalidationSignals: string[];
  exitChecklist: string[];
  missingDetails: string[];
  clarifyingQuestions: string[];
  draftJson: Record<string, unknown>;
  backtestSummary?: {
    tradeCount: number;
    winRatePct: number;
    profitFactor: number | null;
    totalPnlUsd: number;
    testedFrom: string | null;
    testedTo: string | null;
  } | null;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  bullets?: AssistantBullet[];
  charts?: AssistantChart[];
  chartActions?: Array<Record<string, unknown>>;
  chartAnimations?: AssistantChartAnimation[];
  requestChecklist?: AssistantChecklistItem[];
  toolsUsed?: string[];
  cannotAnswer?: boolean;
  strategyDraft?: AssistantStrategyDraft;
};

type PersistedAssistantThread = {
  version: number;
  savedAt: number;
  messages: AssistantMessage[];
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  detailsExpandedByMessageId: Record<string, boolean>;
};

type AssistantApiResponse = {
  status: "ok" | "needs_backtest_data";
  reason?: string;
  response?: {
    cannotAnswer: boolean;
    cannotAnswerReason: string;
    shortAnswer: string;
    bullets: AssistantBullet[];
    charts: AssistantChart[];
    chartActions?: Array<Record<string, unknown>>;
    chartAnimations?: AssistantChartAnimation[];
    requestChecklist?: AssistantChecklistItem[];
    toolsUsed?: string[];
    strategyDraft?: AssistantStrategyDraft;
  };
  modelTrace?: {
    instruction: string;
    reasoning: string;
    coding: string;
    writer: string;
  } | null;
};

export type AssistantPanelProps = {
  symbol: string;
  timeframe: string;
  selectedCandles: AssistantPanelCandle[];
  activeTrade: AssistantPanelActiveTrade | null;
  historyRows: AssistantPanelTrade[];
  actionRows: AssistantPanelAction[];
  backtestHasRun: boolean;
  backtestTimeframe: string;
  backtestTrades: AssistantPanelTrade[];
  onRunChartActions?: (actions: Array<Record<string, unknown>>) => void;
  onImportStrategyModel?: (draftJson: Record<string, unknown>) => void;
};

const MAX_CONTEXT_CANDLES = 500;
const MAX_CONTEXT_HISTORY = 380;
const MAX_CONTEXT_ACTIONS = 360;
const MAX_CONTEXT_BACKTEST_WHEN_REQUESTED = 2200;

const PIE_COLORS = ["#13c98f", "#f0455a", "#bfc6d8", "#f0b84f"];
type StrategyChartZone = {
  xStart: string;
  xEnd: string;
  yStart: number;
  yEnd: number;
  direction: "bullish" | "bearish";
  label?: string;
};

type StrategyChartMarker = {
  x: string;
  y: number;
  direction: "bullish" | "bearish";
  label: string;
};

type CandlestickSnapshotRow = {
  x: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const DRAW_STAGE_RE =
  /\b(draw|mark|annotate|support|resistance|trendline|trend line|line|box|fvg|fair value gap|arrow|ruler)\b/i;
const GRAPH_STAGE_RE =
  /\b(graph|chart|plot|visual|visualize|indicator|rsi|macd|ema|sma|atr|volatility|trend|average|mean)\b/i;
const ANIMATION_STAGE_RE =
  /\b(animate|animation|video|replay|playback|walkthrough|demo)\b/i;
const INDICATOR_STAGE_RE =
  /\b(indicator|rsi|macd|ema|sma|atr|stoch|stochastic|moving average)\b/i;
const DATA_STAGE_RE =
  /\b(history|backtest|clickhouse|monthly|weekly|daily|recent|window|from|between|since)\b/i;
const SOCIAL_STAGE_RE =
  /^(hi|hello|hey|yo|sup|what'?s up|how are you|gm|gn|good morning|good afternoon|good evening)[!.?\s]*$/i;
const ASSISTANT_THREAD_STORAGE_KEY = "korra:gideon:thread:v1";
const MAX_PERSISTED_MESSAGES = 80;
const MAX_PERSISTED_TURNS = 160;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const parseStrategyChartZones = (config: AssistantChart["config"]): StrategyChartZone[] => {
  const rawZones = isPlainRecord(config) && Array.isArray(config.fvgZones) ? config.fvgZones : [];
  const mapped: Array<StrategyChartZone | null> = rawZones.map((item) => {
    if (!isPlainRecord(item)) {
      return null;
    }

    const xStart = typeof item.xStart === "string" ? item.xStart : "";
    const xEnd = typeof item.xEnd === "string" ? item.xEnd : "";
    const yStart = Number(item.yStart);
    const yEnd = Number(item.yEnd);
    const direction = item.direction === "bearish" ? "bearish" : "bullish";
    const label = typeof item.label === "string" ? item.label : undefined;

    if (!xStart || !xEnd || !Number.isFinite(yStart) || !Number.isFinite(yEnd)) {
      return null;
    }

    return {
      xStart,
      xEnd,
      yStart,
      yEnd,
      direction,
      label
    };
  });

  return mapped.filter((item): item is StrategyChartZone => item !== null);
};

const parseStrategyChartMarkers = (config: AssistantChart["config"]): StrategyChartMarker[] => {
  const rawMarkers =
    isPlainRecord(config) && Array.isArray(config.entryMarkers) ? config.entryMarkers : [];
  const mapped: Array<StrategyChartMarker | null> = rawMarkers.map((item) => {
    if (!isPlainRecord(item)) {
      return null;
    }

    const x = typeof item.x === "string" ? item.x : "";
    const y = Number(item.y);
    const direction = item.direction === "bearish" ? "bearish" : "bullish";
    const label = typeof item.label === "string" ? item.label : "";

    if (!x || !Number.isFinite(y) || !label) {
      return null;
    }

    return {
      x,
      y,
      direction,
      label
    };
  });

  return mapped.filter((item): item is StrategyChartMarker => item !== null);
};

const parseCandlestickSnapshotRows = (rows: AssistantChart["data"]): CandlestickSnapshotRow[] => {
  return rows
    .map((row) => {
      if (!isPlainRecord(row)) {
        return null;
      }

      const x = typeof row.x === "string" ? row.x : "";
      const time = Number(row.time);
      const open = Number(row.open);
      const high = Number(row.high);
      const low = Number(row.low);
      const close = Number(row.close);

      if (
        !x ||
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      return {
        x,
        time,
        open,
        high,
        low,
        close
      };
    })
    .filter((row): row is CandlestickSnapshotRow => row !== null);
};

const isCandlestickSnapshotChart = (chart: AssistantChart): boolean => {
  if (resolveGraphTemplate(chart.template).family !== "price_action") {
    return false;
  }

  const sampleRow = chart.data[0];
  return (
    isPlainRecord(sampleRow) &&
    typeof sampleRow.x === "string" &&
    Number.isFinite(Number(sampleRow.time)) &&
    Number.isFinite(Number(sampleRow.open)) &&
    Number.isFinite(Number(sampleRow.high)) &&
    Number.isFinite(Number(sampleRow.low)) &&
    Number.isFinite(Number(sampleRow.close))
  );
};

const renderCandlestickSnapshot = (params: {
  chart: AssistantChart;
  zones: StrategyChartZone[];
  markers: StrategyChartMarker[];
}) => {
  const rows = parseCandlestickSnapshotRows(params.chart.data);
  if (rows.length === 0) {
    return null;
  }

  const width = 820;
  const height = 236;
  const padding = {
    top: 14,
    right: 18,
    bottom: 28,
    left: 54
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const slotWidth = plotWidth / rows.length;
  const bodyWidth = Math.max(4, Math.min(slotWidth * 0.62, 14));
  const labelIndexByX = new Map(rows.map((row, index) => [row.x, index]));
  const markerPrices = params.markers.map((marker) => marker.y);
  const zonePrices = params.zones.flatMap((zone) => [zone.yStart, zone.yEnd]);
  const allLows = [...rows.map((row) => row.low), ...markerPrices, ...zonePrices];
  const allHighs = [...rows.map((row) => row.high), ...markerPrices, ...zonePrices];
  const domainLow = Math.min(...allLows);
  const domainHigh = Math.max(...allHighs);
  const range = Math.max(0.0001, domainHigh - domainLow);
  const minPrice = domainLow - range * 0.14;
  const maxPrice = domainHigh + range * 0.14;
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return maxPrice - ratio * (maxPrice - minPrice);
  });
  const xLabelIndices = Array.from(
    new Set([0, Math.floor((rows.length - 1) / 3), Math.floor(((rows.length - 1) * 2) / 3), rows.length - 1])
  ).sort((left, right) => left - right);

  const xForIndex = (index: number) => {
    return padding.left + (index + 0.5) * slotWidth;
  };

  const yForPrice = (price: number) => {
    const ratio = (price - minPrice) / (maxPrice - minPrice);
    return padding.top + (1 - ratio) * plotHeight;
  };

  return (
    <div className="ai-candle-snapshot" role="img" aria-label={params.chart.title}>
      <svg viewBox={`0 0 ${width} ${height}`} className="ai-candle-svg">
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          rx={12}
          fill="rgba(7, 12, 20, 0.98)"
        />

        {yTicks.map((tick) => {
          const y = yForPrice(tick);
          return (
            <g key={`${params.chart.id}-y-${tick.toFixed(4)}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(159, 172, 198, 0.14)"
                strokeDasharray="3 5"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="ai-candle-axis"
              >
                {tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        {xLabelIndices.map((index) => {
          const row = rows[index];
          if (!row) {
            return null;
          }

          const x = xForIndex(index);
          return (
            <g key={`${params.chart.id}-x-${row.x}`}>
              <line
                x1={x}
                x2={x}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke="rgba(159, 172, 198, 0.08)"
              />
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="ai-candle-axis"
              >
                {row.x}
              </text>
            </g>
          );
        })}

        {params.zones.map((zone, index) => {
          const startIndex = labelIndexByX.get(zone.xStart);
          const endIndex = labelIndexByX.get(zone.xEnd);
          if (startIndex == null || endIndex == null) {
            return null;
          }

          const zoneStart = padding.left + Math.min(startIndex, endIndex) * slotWidth;
          const zoneEnd = padding.left + (Math.max(startIndex, endIndex) + 1) * slotWidth;
          const zoneTop = yForPrice(Math.max(zone.yStart, zone.yEnd));
          const zoneBottom = yForPrice(Math.min(zone.yStart, zone.yEnd));
          const bullish = zone.direction === "bullish";

          return (
            <g key={`${params.chart.id}-zone-${index}`}>
              <rect
                x={zoneStart}
                y={zoneTop}
                width={Math.max(zoneEnd - zoneStart, bodyWidth)}
                height={Math.max(zoneBottom - zoneTop, 6)}
                rx={6}
                fill={bullish ? "rgba(19, 201, 143, 0.18)" : "rgba(240, 69, 90, 0.18)"}
                stroke={bullish ? "rgba(19, 201, 143, 0.72)" : "rgba(240, 69, 90, 0.72)"}
              />
              {zone.label ? (
                <text
                  x={zoneStart + 8}
                  y={Math.max(zoneTop + 12, padding.top + 12)}
                  className="ai-candle-zone-label"
                >
                  {zone.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {rows.map((row, index) => {
          const bullish = row.close >= row.open;
          const candleX = xForIndex(index);
          const wickTop = yForPrice(row.high);
          const wickBottom = yForPrice(row.low);
          const bodyTop = yForPrice(Math.max(row.open, row.close));
          const bodyBottom = yForPrice(Math.min(row.open, row.close));
          const bodyHeight = Math.max(bodyBottom - bodyTop, 2);

          return (
            <g key={`${params.chart.id}-candle-${index}`}>
              <line
                x1={candleX}
                x2={candleX}
                y1={wickTop}
                y2={wickBottom}
                stroke={bullish ? "#19d39a" : "#f25f73"}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
              <rect
                x={candleX - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                rx={1.6}
                fill={bullish ? "rgba(19, 201, 143, 0.88)" : "rgba(240, 69, 90, 0.88)"}
                stroke={bullish ? "#baf5df" : "#ffd0d6"}
                strokeWidth={0.8}
              />
            </g>
          );
        })}

        {params.markers.map((marker, index) => {
          const candleIndex = labelIndexByX.get(marker.x);
          if (candleIndex == null) {
            return null;
          }

          const x = xForIndex(candleIndex);
          const y = yForPrice(marker.y);
          const bullish = marker.direction === "bullish";
          const arrowTipY = bullish ? y - 12 : y + 12;
          const labelY = bullish ? y - 18 : y + 24;

          return (
            <g key={`${params.chart.id}-marker-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={bullish ? y - 4 : y + 4}
                y2={arrowTipY}
                stroke={bullish ? "#8bf0c8" : "#ff9eaa"}
                strokeWidth={1.4}
              />
              <polygon
                points={
                  bullish
                    ? `${x},${arrowTipY - 6} ${x - 5},${arrowTipY + 2} ${x + 5},${arrowTipY + 2}`
                    : `${x},${arrowTipY + 6} ${x - 5},${arrowTipY - 2} ${x + 5},${arrowTipY - 2}`
                }
                fill={bullish ? "#13c98f" : "#f0455a"}
              />
              <circle cx={x} cy={y} r={3.5} fill={bullish ? "#13c98f" : "#f0455a"} />
              <text
                x={x}
                y={labelY}
                textAnchor="middle"
                className="ai-candle-marker-label"
              >
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const buildWelcomeMessage = (): AssistantMessage => ({
  id: "welcome",
  role: "assistant",
  content: "How can I help you? Describe a strategy idea and I can turn it into a playbook."
});

const normalizeToolPill = (value: string): string => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text;
};

const formatAnimationDuration = (durationMs: number): string => {
  const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const seconds = safe / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
};

const boldText = (text: string): ReactNode[] => {
  const output: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      output.push(text.slice(lastIndex, match.index));
    }

    output.push(
      <strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>
    );

    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    output.push(text.slice(lastIndex));
  }

  return output;
};

const summarizeTrades = (rows: AssistantPanelTrade[]) => {
  let wins = 0;
  let losses = 0;
  let totalPnlUsd = 0;

  for (const row of rows) {
    if (row.result === "Win") {
      wins += 1;
    } else {
      losses += 1;
    }
    totalPnlUsd += row.pnlUsd;
  }

  const totalTrades = wins + losses;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return {
    totalTrades,
    wins,
    losses,
    winRatePct: Number(winRatePct.toFixed(2)),
    totalPnlUsd: Number(totalPnlUsd.toFixed(2))
  };
};

const takeTail = <T,>(rows: T[], count: number): T[] => {
  if (rows.length <= count) {
    return rows;
  }
  return rows.slice(rows.length - count);
};

const inferThinkingStages = (prompt: string): string[] => {
  const text = prompt.trim().toLowerCase();
  if (!text) {
    return ["Intent Parsing", "Quantitative Reasoning", "Response Drafting"];
  }

  const isSocialOnly =
    SOCIAL_STAGE_RE.test(text) &&
    !DRAW_STAGE_RE.test(text) &&
    !GRAPH_STAGE_RE.test(text) &&
    !ANIMATION_STAGE_RE.test(text);

  if (isSocialOnly) {
    return ["Intent Parsing", "Conversation Drafting"];
  }

  if (ANIMATION_STAGE_RE.test(text)) {
    return ["Intent Parsing", "Data Retrieval", "Action Sequencing", "Animation Rendering"];
  }

  if (DRAW_STAGE_RE.test(text)) {
    return ["Intent Parsing", "Market Structure Reasoning", "Annotation Planning", "Chart Rendering"];
  }

  if (INDICATOR_STAGE_RE.test(text)) {
    return [
      "Intent Parsing",
      "Data Retrieval",
      "Indicator Coding",
      "Quantitative Reasoning",
      "Response Drafting"
    ];
  }

  if (GRAPH_STAGE_RE.test(text)) {
    return ["Intent Parsing", "Data Retrieval", "Statistical Reasoning", "Graph Construction"];
  }

  if (DATA_STAGE_RE.test(text)) {
    return ["Intent Parsing", "Data Retrieval", "Quantitative Reasoning", "Response Drafting"];
  }

  return ["Intent Parsing", "Quantitative Reasoning", "Response Drafting"];
};

const isValidChatTurn = (
  value: unknown
): value is { role: "user" | "assistant"; content: string } => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    (row.role === "user" || row.role === "assistant") &&
    typeof row.content === "string" &&
    row.content.trim().length > 0
  );
};

const isValidMessage = (value: unknown): value is AssistantMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    (row.role === "user" || row.role === "assistant") &&
    typeof row.content === "string" &&
    row.content.trim().length > 0
  );
};

const loadPersistedThread = (): PersistedAssistantThread | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ASSISTANT_THREAD_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAssistantThread>;
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.filter(isValidMessage).slice(-MAX_PERSISTED_MESSAGES)
      : [];
    const turns = Array.isArray(parsed.turns)
      ? parsed.turns.filter(isValidChatTurn).slice(-MAX_PERSISTED_TURNS)
      : [];
    const detailsExpandedByMessageId =
      parsed.detailsExpandedByMessageId &&
      typeof parsed.detailsExpandedByMessageId === "object"
        ? (parsed.detailsExpandedByMessageId as Record<string, boolean>)
        : {};

    if (messages.length === 0 && turns.length === 0) {
      return null;
    }

    return {
      version: Number(parsed.version) || 1,
      savedAt: Number(parsed.savedAt) || Date.now(),
      messages: messages.length > 0 ? messages : [buildWelcomeMessage()],
      turns,
      detailsExpandedByMessageId
    };
  } catch {
    return null;
  }
};

export default function AssistantPanel(props: AssistantPanelProps) {
  const {
    symbol,
    timeframe,
    selectedCandles,
    activeTrade,
    historyRows,
    actionRows,
    backtestHasRun,
    backtestTimeframe,
    backtestTrades,
    onRunChartActions,
    onImportStrategyModel
  } = props;

  const [messages, setMessages] = useState<AssistantMessage[]>(() => [buildWelcomeMessage()]);
  const [turns, setTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [thinkingStage, setThinkingStage] = useState("Intent Parsing");
  const [activeAnimation, setActiveAnimation] = useState<AssistantChartAnimation | null>(null);
  const [showWorkView, setShowWorkView] = useState(false);
  const [detailsExpandedByMessageId, setDetailsExpandedByMessageId] = useState<
    Record<string, boolean>
  >({});

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isIdleThread = turns.length === 0 && messages.length === 1 && !isPending;

  useEffect(() => {
    const persisted = loadPersistedThread();
    if (!persisted) {
      return;
    }
    setMessages(persisted.messages);
    setTurns(persisted.turns);
    setDetailsExpandedByMessageId(persisted.detailsExpandedByMessageId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const payload: PersistedAssistantThread = {
        version: 1,
        savedAt: Date.now(),
        messages: messages.slice(-MAX_PERSISTED_MESSAGES),
        turns: turns.slice(-MAX_PERSISTED_TURNS),
        detailsExpandedByMessageId
      };
      window.localStorage.setItem(ASSISTANT_THREAD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore persistence failures (for example quota exceeded).
    }
  }, [messages, turns, detailsExpandedByMessageId]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, isPending]);

  const backtestSummary = useMemo(() => summarizeTrades(backtestTrades), [backtestTrades]);
  const latestUserPrompt = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "user")
        ?.content ?? "",
    [messages]
  );
  const latestAssistantMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant"),
    [messages]
  );
  const latestStagePlan = useMemo(() => inferThinkingStages(latestUserPrompt), [latestUserPrompt]);

  const resetAssistantThread = useCallback(() => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: "How can I help you? Describe a strategy idea and I can turn it into a playbook."
      }
    ]);
    setTurns([]);
    setInput("");
    setThinkingStage("Intent Parsing");
    setIsPending(false);
    setActiveAnimation(null);
    setShowWorkView(false);
    setDetailsExpandedByMessageId({});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ASSISTANT_THREAD_STORAGE_KEY);
    }

    if (typeof onRunChartActions === "function") {
      onRunChartActions([{ type: "clear_annotations" }]);
    }

    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [onRunChartActions]);

  const toggleMessageDetails = useCallback((messageId: string) => {
    setDetailsExpandedByMessageId((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }));
  }, []);

  const buildPayloadContext = useCallback(
    (includeBacktestData: boolean) => {
      const liveCandles = takeTail(selectedCandles, MAX_CONTEXT_CANDLES).map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0
      }));

      return {
        symbol,
        timeframe,
        liveCandles,
        activeTrade,
        historyRows: takeTail(historyRows, MAX_CONTEXT_HISTORY),
        actionRows: takeTail(actionRows, MAX_CONTEXT_ACTIONS),
        backtest: {
          hasRun: backtestHasRun,
          dataIncluded: includeBacktestData,
          timeframe: backtestTimeframe,
          summary: backtestHasRun ? backtestSummary : null,
          trades: includeBacktestData
            ? takeTail(backtestTrades, MAX_CONTEXT_BACKTEST_WHEN_REQUESTED)
            : []
        }
      };
    },
    [
      activeTrade,
      actionRows,
      backtestHasRun,
      backtestSummary,
      backtestTimeframe,
      backtestTrades,
      historyRows,
      selectedCandles,
      symbol,
      timeframe
    ]
  );

  const buildThreadState = useCallback(() => {
    const latestDraftMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.strategyDraft);

    return {
      latestDraft: latestDraftMessage?.strategyDraft ?? null
    };
  }, [messages]);

  const runAssistantRequest = useCallback(
    async (chatTurns: Array<{ role: "user" | "assistant"; content: string }>, includeBacktestData: boolean): Promise<AssistantApiResponse> => {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: chatTurns,
          context: buildPayloadContext(includeBacktestData),
          threadState: buildThreadState()
        })
      });

      const payload = (await response.json()) as AssistantApiResponse;

      if (
        payload.status === "needs_backtest_data" &&
        backtestHasRun &&
        !includeBacktestData
      ) {
        return runAssistantRequest(chatTurns, true);
      }

      return payload;
    },
    [backtestHasRun, buildPayloadContext, buildThreadState]
  );

  const replayChartActions = useCallback(
    (actions: Array<Record<string, unknown>>) => {
      if (!Array.isArray(actions) || actions.length === 0 || typeof onRunChartActions !== "function") {
        return;
      }

      onRunChartActions(actions);
    },
    [onRunChartActions]
  );

  const downloadStrategyDraft = useCallback((draft: AssistantStrategyDraft) => {
    const parsedModel = extractStrategyModelCatalogEntry(draft.draftJson);
    if (!parsedModel) {
      return;
    }
    const payload = buildStrategyModelFilePayload(parsedModel);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${String(
      draft.draftJson.id || draft.matchedModelId || "strategy-draft"
    )}.korra-model.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const importStrategyDraft = useCallback(
    (draft: AssistantStrategyDraft) => {
      if (typeof onImportStrategyModel !== "function") {
        return;
      }

      onImportStrategyModel(draft.draftJson);
    },
    [onImportStrategyModel]
  );

  const submit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const prompt = input.trim();
      if (!prompt || isPending) {
        return;
      }

      const userMessage: AssistantMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt
      };

      const nextTurns = [...turns, { role: "user" as const, content: prompt }];

      setInput("");
      setMessages((current) => [...current, userMessage]);
      setTurns(nextTurns);
      setIsPending(true);
      const stagePlan = inferThinkingStages(prompt);
      const safeStagePlan =
        stagePlan.length > 0
          ? stagePlan
          : ["Intent Parsing", "Quantitative Reasoning", "Response Drafting"];
      setThinkingStage(safeStagePlan[0] ?? "Intent Parsing");

      const stageTimers = safeStagePlan.slice(1).map((stage, index) =>
        window.setTimeout(() => {
          setThinkingStage(stage);
        }, 340 + index * 640)
      );

      try {
        const payload = await runAssistantRequest(nextTurns, false);

        if (payload.status !== "ok" || !payload.response) {
          const errorMessage: AssistantMessage = {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            content: payload.reason || "I cannot answer this request right now.",
            bullets: [
              {
                tone: "gold",
                text: payload.reason || "I cannot answer this request right now."
              }
            ],
            cannotAnswer: true
          };

          setMessages((current) => [...current, errorMessage]);
          setTurns((current) => [
            ...current,
            { role: "assistant", content: errorMessage.content }
          ]);
          return;
        }

        const assistantContentCandidates = [
          payload.response.shortAnswer,
          payload.response.bullets[0]?.text,
          payload.response.cannotAnswerReason
        ];
        const assistantContent =
          assistantContentCandidates.find(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          ) ?? "";

        const assistantMessage: AssistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          bullets: payload.response.bullets,
          charts: payload.response.charts,
          chartActions: payload.response.chartActions,
          chartAnimations: Array.isArray(payload.response.chartAnimations)
            ? payload.response.chartAnimations
            : [],
          requestChecklist: Array.isArray(payload.response.requestChecklist)
            ? payload.response.requestChecklist
            : [],
          toolsUsed: Array.isArray(payload.response.toolsUsed)
            ? payload.response.toolsUsed.map(normalizeToolPill).filter((tool) => tool.length > 0)
            : [],
          cannotAnswer: payload.response.cannotAnswer,
          strategyDraft:
            payload.response.strategyDraft && typeof payload.response.strategyDraft === "object"
              ? (payload.response.strategyDraft as AssistantStrategyDraft)
              : undefined
        };

        const hasAnimationResponse =
          Array.isArray(payload.response.chartAnimations) &&
          payload.response.chartAnimations.length > 0;
        const hasEmbeddedStrategyCharts =
          Boolean(payload.response.strategyDraft) &&
          Array.isArray(payload.response.charts) &&
          payload.response.charts.length > 0;

        if (
          !hasAnimationResponse &&
          !hasEmbeddedStrategyCharts &&
          Array.isArray(payload.response.chartActions) &&
          payload.response.chartActions.length > 0 &&
          typeof onRunChartActions === "function"
        ) {
          onRunChartActions(payload.response.chartActions);
        }

        setMessages((current) => [...current, assistantMessage]);
        setTurns((current) => [
          ...current,
          { role: "assistant", content: assistantContent }
        ]);
      } catch (error) {
        const fallback =
          error instanceof Error
            ? `I cannot answer due to an assistant request error: ${error.message}`
            : "I cannot answer due to an assistant request error.";

        const assistantMessage: AssistantMessage = {
          id: `assistant-catch-${Date.now()}`,
          role: "assistant",
          content: fallback,
          bullets: [{ tone: "gold", text: fallback }],
          cannotAnswer: true
        };

        setMessages((current) => [...current, assistantMessage]);
        setTurns((current) => [
          ...current,
          { role: "assistant", content: fallback }
        ]);
      } finally {
        stageTimers.forEach((timerId) => window.clearTimeout(timerId));
        setIsPending(false);
        setThinkingStage("Intent Parsing");
      }
    },
    [input, isPending, onRunChartActions, runAssistantRequest, turns]
  );

  const renderChart = (chart: AssistantChart) => {
    const family = resolveGraphTemplate(chart.template).family;
    const sampleRow = chart.data[0] ?? {};
    const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(sampleRow, key);
    const fvgZones = parseStrategyChartZones(chart.config);
    const entryMarkers = parseStrategyChartMarkers(chart.config);
    const xKey = hasKey("x")
      ? "x"
      : hasKey("month")
        ? "month"
        : hasKey("bucket")
          ? "bucket"
          : hasKey("session")
            ? "session"
            : hasKey("label")
              ? "label"
              : "x";

    if (isCandlestickSnapshotChart(chart)) {
      return (
        <AssistantInlinePriceActionChart
          chartId={chart.id}
          rows={parseCandlestickSnapshotRows(chart.data)}
          zones={fvgZones}
          markers={entryMarkers}
        />
      );
    }

    if (family === "equity_curve" && hasKey("equity")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 18} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={48} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Line type="monotone" dataKey="equity" stroke="#13c98f" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (family === "pnl_distribution" && hasKey("count")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 10} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={42} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Bar dataKey="count" fill="#2d6cff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (family === "session_performance" && hasKey("session") && hasKey("pnl")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="session" tick={{ fill: "#8b94a8", fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fill: "#8b94a8", fontSize: 10 }} width={48} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#8b94a8", fontSize: 10 }} width={44} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#b8c1d5" }} />
            <Bar yAxisId="left" dataKey="pnl" fill="#2d6cff" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="#f0b84f" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (family === "trade_outcomes" && hasKey("value") && hasKey("label")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Pie
              data={chart.data}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={3}
            >
              {chart.data.map((_, index) => (
                <Cell key={`${chart.id}-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11, color: "#b8c1d5" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (family === "price_action" && hasKey("high") && hasKey("low") && hasKey("close")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 20} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={52} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            {fvgZones.map((zone, index) => (
              <ReferenceArea
                key={`${chart.id}-zone-${index}`}
                x1={zone.xStart}
                x2={zone.xEnd}
                y1={zone.yStart}
                y2={zone.yEnd}
                ifOverflow="extendDomain"
                fill={
                  zone.direction === "bullish"
                    ? "rgba(19, 201, 143, 0.18)"
                    : "rgba(240, 69, 90, 0.18)"
                }
                stroke={
                  zone.direction === "bullish"
                    ? "rgba(19, 201, 143, 0.78)"
                    : "rgba(240, 69, 90, 0.78)"
                }
                strokeOpacity={0.9}
              />
            ))}
            <Area type="monotone" dataKey="high" stroke="rgba(45,108,255,0.25)" fill="rgba(45,108,255,0.12)" />
            <Area type="monotone" dataKey="low" stroke="rgba(240,69,90,0.25)" fill="rgba(240,69,90,0.10)" />
            <Line type="monotone" dataKey="close" stroke="#13c98f" strokeWidth={2} dot={false} />
            {entryMarkers.map((marker, index) => (
              <ReferenceDot
                key={`${chart.id}-marker-${index}`}
                x={marker.x}
                y={marker.y}
                r={5}
                ifOverflow="extendDomain"
                fill={marker.direction === "bullish" ? "#13c98f" : "#f0455a"}
                stroke="#09111a"
                strokeWidth={1.5}
                label={{
                  value: `${marker.direction === "bullish" ? "↑" : "↓"} ${marker.label}`,
                  position: marker.direction === "bullish" ? "top" : "bottom",
                  fill: "#dbe7f9",
                  fontSize: 10
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (family === "price_action" && hasKey("value")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 16} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={52} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Line type="monotone" dataKey="value" stroke="#13c98f" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    const fallbackYKey = hasKey("count") ? "count" : hasKey("value") ? "value" : "count";

    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart.data}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={42} />
          <Tooltip
            contentStyle={{
              background: "#0e1521",
              border: "1px solid #1f2a40",
              color: "#d4dae5"
            }}
          />
          <Bar dataKey={fallbackYKey} fill="#8797ba" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderChartCards = (charts: AssistantChart[]) => (
    <div className="ai-chart-grid">
      {charts.map((chart) => {
        const templateMeta = resolveGraphTemplate(chart.template);
        const mode = chart.mode ?? templateMeta.mode;
        const candlestickSnapshot = isCandlestickSnapshotChart(chart);
        return (
          <section
            key={chart.id}
            className={`ai-chart-card${candlestickSnapshot ? " photo" : ""}`}
          >
            <div className="ai-chart-head">
              <strong>{chart.title}</strong>
              <div className="ai-chart-head-meta">
                <span className={`ai-chart-mode-pill mode-${mode}`}>
                  {mode === "dynamic" ? "Dynamic" : "Static"}
                </span>
                {chart.subtitle ? <small>{chart.subtitle}</small> : null}
              </div>
            </div>
            <div className="ai-chart-body">{renderChart(chart)}</div>
          </section>
        );
      })}
    </div>
  );

  const renderStrategySection = (title: string, items: string[]) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <section className="ai-strategy-section" key={title}>
        <strong>{title}</strong>
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{boldText(item)}</li>
          ))}
        </ul>
      </section>
    );
  };

  const renderStrategyBacktestSummary = (draft: AssistantStrategyDraft) => {
    const summary = draft.backtestSummary;
    if (!summary) {
      return null;
    }

    const testedWindow =
      summary.testedFrom && summary.testedTo
        ? `${summary.testedFrom} -> ${summary.testedTo}`
        : "Local replay window";

    return (
      <section className="ai-strategy-stats" aria-label="strategy replay summary">
        <div className="ai-strategy-stat">
          <span className="ai-strategy-stat-label">Trades</span>
          <strong className="ai-strategy-stat-value">{summary.tradeCount}</strong>
        </div>
        <div className="ai-strategy-stat">
          <span className="ai-strategy-stat-label">Win Rate</span>
          <strong className="ai-strategy-stat-value">{summary.winRatePct.toFixed(1)}%</strong>
        </div>
        <div className="ai-strategy-stat">
          <span className="ai-strategy-stat-label">Profit Factor</span>
          <strong className="ai-strategy-stat-value">
            {summary.profitFactor == null ? "N/A" : summary.profitFactor.toFixed(2)}
          </strong>
        </div>
        <div className="ai-strategy-stat">
          <span className="ai-strategy-stat-label">Net PnL</span>
          <strong className="ai-strategy-stat-value">
            {summary.totalPnlUsd >= 0 ? "+$" : "-$"}
            {Math.abs(summary.totalPnlUsd).toFixed(2)}
          </strong>
        </div>
        <div className="ai-strategy-stat wide">
          <span className="ai-strategy-stat-label">Tested Window</span>
          <strong className="ai-strategy-stat-value">{testedWindow}</strong>
        </div>
      </section>
    );
  };

  return (
    <div className="ai-tab-shell">
      <div className="watchlist-head ai-head">
        <div>
          <h2>Gideon</h2>
        </div>
        <div className="ai-head-actions">
          <button
            type="button"
            className={`panel-action-btn ai-workview-btn${showWorkView ? " open" : ""}${isPending ? " live" : ""}`}
            onClick={() => setShowWorkView((current) => !current)}
          >
            {showWorkView ? "Hide View" : "View Working"}
          </button>
          <button
            type="button"
            className="panel-action-btn ai-reset-btn"
            onClick={resetAssistantThread}
            disabled={isPending}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        className={`ai-thread${isIdleThread ? " idle" : ""}`}
        ref={messageListRef}
        aria-live="polite"
      >
        {messages.map((message) => {
          const hasTools = Boolean(message.toolsUsed && message.toolsUsed.length > 0);
          const hasBullets = Boolean(message.bullets && message.bullets.length > 0);
          const hasChecklist = Boolean(message.requestChecklist && message.requestChecklist.length > 0);
          const hasStrategyDraft = Boolean(message.strategyDraft);
          const inlineStrategyCharts =
            hasStrategyDraft && Array.isArray(message.charts)
              ? message.charts.filter(
                  (chart) => resolveGraphTemplate(chart.template).family === "price_action"
                )
              : [];
          const inlineStrategyChartIds = new Set(inlineStrategyCharts.map((chart) => chart.id));
          const remainingCharts = Array.isArray(message.charts)
            ? message.charts.filter((chart) => !inlineStrategyChartIds.has(chart.id))
            : [];
          const hasInlineStrategyCharts = inlineStrategyCharts.length > 0;
          const hasDetails =
            message.role === "assistant" &&
            (hasTools || hasBullets || hasChecklist || hasStrategyDraft);
          const detailsExpanded = hasDetails && Boolean(detailsExpandedByMessageId[message.id]);

          return (
          <article
            key={message.id}
            className={`ai-msg ${message.role === "assistant" ? "assistant" : "user"}`}
          >
            <header className="ai-msg-head">
              <span>{message.role === "assistant" ? "Gideon" : "You"}</span>
              {message.cannotAnswer ? <small className="ai-cannot">Insufficient Data</small> : null}
            </header>

            <p className="ai-msg-content">{boldText(message.content)}</p>

            {message.strategyDraft ? (
              <section className="ai-strategy-card">
                <div className="ai-strategy-head">
                  <div className="ai-strategy-head-copy">
                    <strong>{message.strategyDraft.name}</strong>
                    <span>{message.strategyDraft.matchedModelName}</span>
                  </div>
                  <div className="ai-strategy-pill-row">
                    <span className="ai-strategy-pill">{message.strategyDraft.matchedModelId}</span>
                    <span className="ai-strategy-pill">
                      {message.strategyDraft.status === "ready" ? "Ready" : "Clarify"}
                    </span>
                  </div>
                </div>

                <p className="ai-strategy-summary">{boldText(message.strategyDraft.summary)}</p>

                {renderStrategyBacktestSummary(message.strategyDraft)}

                <div className="ai-strategy-actions">
                  {!hasInlineStrategyCharts && message.chartActions && message.chartActions.length > 0 ? (
                    <button
                      type="button"
                      className="panel-action-btn"
                      onClick={() => replayChartActions(message.chartActions!)}
                    >
                      Preview on Chart
                    </button>
                  ) : null}
                  {typeof onImportStrategyModel === "function" ? (
                    <button
                      type="button"
                      className="panel-action-btn"
                      onClick={() => importStrategyDraft(message.strategyDraft!)}
                    >
                      {message.strategyDraft.status === "ready" ? "Add to Models" : "Add Draft to Models"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="panel-action-btn"
                    onClick={() => downloadStrategyDraft(message.strategyDraft!)}
                  >
                    Download JSON
                  </button>
                </div>

                <div className="ai-strategy-grid">
                  {renderStrategySection("Entry", message.strategyDraft.entryChecklist)}
                  {renderStrategySection("Confirmation", message.strategyDraft.confirmationSignals)}
                  {renderStrategySection("Invalidation", message.strategyDraft.invalidationSignals)}
                  {renderStrategySection("Exit", message.strategyDraft.exitChecklist)}
                  {renderStrategySection("Clarifying Questions", message.strategyDraft.clarifyingQuestions)}
                  {renderStrategySection("Missing Details", message.strategyDraft.missingDetails)}
                </div>

                {hasInlineStrategyCharts ? (
                  <section className="ai-strategy-visuals">
                    <header className="ai-strategy-visuals-head">
                      <span>Chart Examples</span>
                      <small>Embedded in chat</small>
                    </header>
                    {renderChartCards(inlineStrategyCharts)}
                  </section>
                ) : null}
              </section>
            ) : null}

            {hasDetails ? (
              <button
                type="button"
                className="ai-details-toggle"
                onClick={() => toggleMessageDetails(message.id)}
                aria-expanded={detailsExpanded}
              >
                {detailsExpanded ? "Hide Details" : "Details"}
              </button>
            ) : null}

            {detailsExpanded ? (
              <section className="ai-details-panel">
                {hasTools ? (
                  <div className="ai-tool-pills" aria-label="tools used">
                    {message.toolsUsed!.map((tool, index) => (
                      <span className="ai-tool-pill" key={`${message.id}-tool-${index}`}>
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : null}

                {hasBullets ? (
                  <ul className="ai-bullets">
                    {message.bullets!.map((bullet, index) => (
                      <li key={`${message.id}-bullet-${index}`} className={`tone-${bullet.tone}`}>
                        <span className="ai-bullet-dot" aria-hidden>
                          •
                        </span>
                        <span>{boldText(bullet.text)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {hasChecklist ? (
                  <ul className="ai-checklist">
                    {message.requestChecklist!.map((item) => (
                      <li
                        key={`${message.id}-check-${item.id}`}
                        className={item.satisfied ? "done" : "todo"}
                      >
                        <span className="ai-check-status" aria-hidden>
                          {item.satisfied ? "✓" : "○"}
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {message.strategyDraft ? (
                  <section className="ai-strategy-json">
                    <header>
                      <strong>Strategy JSON</strong>
                    </header>
                    <pre>{JSON.stringify(message.strategyDraft.draftJson, null, 2)}</pre>
                  </section>
                ) : null}
              </section>
            ) : null}

            {remainingCharts.length > 0 ? (
              <>
                {remainingCharts.some((chart) => resolveGraphTemplate(chart.template).mode === "static") ? (
                  <section className="ai-chart-group">
                    <header className="ai-chart-group-head">
                      <span>Static Charts</span>
                    </header>
                    {renderChartCards(
                      remainingCharts.filter(
                        (chart) => resolveGraphTemplate(chart.template).mode === "static"
                      )
                    )}
                  </section>
                ) : null}

                {remainingCharts.some((chart) => resolveGraphTemplate(chart.template).mode === "dynamic") ? (
                  <section className="ai-chart-group">
                    <header className="ai-chart-group-head">
                      <span>Dynamic Indicators</span>
                    </header>
                    {renderChartCards(
                      remainingCharts.filter(
                        (chart) => resolveGraphTemplate(chart.template).mode === "dynamic"
                      )
                    )}
                  </section>
                ) : null}
              </>
            ) : null}

            {message.chartAnimations && message.chartAnimations.length > 0 ? (
              <section className="ai-animation-grid">
                {message.chartAnimations.map((animation) => (
                  <button
                    key={animation.id}
                    type="button"
                    className={`ai-animation-thumb theme-${animation.theme}`}
                    onClick={() => setActiveAnimation(animation)}
                  >
                    <span className="ai-animation-thumb-play" aria-hidden>
                      ▶
                    </span>
                    <div className="ai-animation-thumb-copy">
                      <strong>{animation.thumbnailTitle || animation.title}</strong>
                      <span>{animation.thumbnailSubtitle || animation.summary}</span>
                    </div>
                    <div className="ai-animation-thumb-meta">
                      <span>{animation.steps.length} steps</span>
                      <span>{formatAnimationDuration(animation.durationMs)}</span>
                    </div>
                  </button>
                ))}
              </section>
            ) : null}

          </article>
        )})}

        {isPending ? (
          <article className="ai-msg assistant pending">
            <header className="ai-msg-head">
              <span>Gideon</span>
              <small className="ai-stage">{thinkingStage}</small>
            </header>
            <div className="ai-thinking" aria-label="assistant thinking">
              <span />
              <span />
              <span />
            </div>
          </article>
        ) : null}
      </div>

      <form className="ai-compose" onSubmit={submit}>
        <label htmlFor="ai-input" className="ai-compose-label">
          Prompt
        </label>
        <textarea
          id="ai-input"
          ref={inputRef}
          className="ai-compose-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="Ask about trades, charts, or describe a strategy idea."
          disabled={isPending}
        />
        <div className="ai-compose-meta">
          <span>
            Backtest {backtestHasRun ? `${backtestSummary.totalTrades.toLocaleString("en-US")} rows available` : "not run"}
          </span>
          <button type="submit" className="panel-action-btn ai-send-btn" disabled={isPending || input.trim().length === 0}>
            {isPending ? "Thinking..." : "Send"}
          </button>
        </div>
      </form>

      <GideonWorkView
        open={showWorkView}
        onClose={() => setShowWorkView(false)}
        isPending={isPending}
        thinkingStage={thinkingStage}
        stagePlan={latestStagePlan}
        latestPrompt={latestUserPrompt}
        latestResponse={latestAssistantMessage?.content ?? ""}
        latestTools={latestAssistantMessage?.toolsUsed ?? []}
        latestChartCount={latestAssistantMessage?.charts?.length ?? 0}
        latestAnimationCount={latestAssistantMessage?.chartAnimations?.length ?? 0}
        latestChecklistCount={latestAssistantMessage?.requestChecklist?.length ?? 0}
        latestHasStrategyDraft={Boolean(latestAssistantMessage?.strategyDraft)}
        latestCannotAnswer={Boolean(latestAssistantMessage?.cannotAnswer)}
        symbol={symbol}
        timeframe={timeframe}
        candleCount={selectedCandles.length}
        historyCount={historyRows.length}
        actionCount={actionRows.length}
      />

      <AssistantChartAnimationModal
        open={activeAnimation !== null}
        animation={activeAnimation}
        candles={selectedCandles}
        onClose={() => setActiveAnimation(null)}
      />
    </div>
  );
}
