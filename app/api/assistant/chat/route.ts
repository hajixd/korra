import { NextResponse } from "next/server";
import {
  extractNebiusMessageText,
  fetchNebiusModelCatalog,
  nebiusChatCompletion,
  pickNebiusModels,
  type NebiusChatMessage,
  type NebiusModelSelection
} from "../../../../lib/nebiusTokenFactory";
import {
  buildFallbackChartAnimation,
  chartAnimationsPromptSpec,
  chartActionsPromptSpec,
  detectDeterministicIntent,
  GRAPH_TEMPLATE_ID_SET,
  listGraphTemplatesForPrompt,
  normalizeChartAnimationsFromCoding,
  normalizeChartActions,
  resolveGraphTemplate,
  summarizeMonthlyAggregates
} from "../../../../lib/assistant-tools";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type CandleRow = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type TradeRow = {
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

type ActionRow = {
  id: string;
  tradeId: string;
  symbol: string;
  label: string;
  details: string;
  time: string;
  timestamp: number;
};

type ActiveTrade = {
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

type BacktestSummary = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalPnlUsd: number;
};

type AssistantContext = {
  symbol: string;
  timeframe: string;
  liveCandles: CandleRow[];
  activeTrade: ActiveTrade | null;
  historyRows: TradeRow[];
  actionRows: ActionRow[];
  backtest: {
    hasRun: boolean;
    dataIncluded: boolean;
    timeframe: string;
    summary: BacktestSummary | null;
    trades: TradeRow[];
  };
};

type PlanningOutput = {
  needsBacktestData?: boolean;
  backtestReason?: string;
  needsClickhouseData?: boolean;
  clickhouseQuery?: {
    pair?: string;
    timeframe?: string;
    count?: number;
    start?: string;
    end?: string;
    reason?: string;
  };
};

type ReasoningOutput = {
  cannotAnswer: boolean;
  cannotAnswerReason: string;
  shortAnswer: string;
  bullets: Array<{ tone: "green" | "red" | "gold" | "black"; text: string }>;
  chartHints: Array<{
    template:
      | "equity_curve"
      | "pnl_distribution"
      | "session_performance"
      | "trade_outcomes"
      | "price_action"
      | "action_timeline"
      | "auto";
    title: string;
    reason: string;
    source?: "history" | "backtest" | "candles" | "clickhouse" | "actions";
    priority?: number;
  }>;
};

type ChartPlan = {
  template: string;
  title: string;
  source: "history" | "backtest" | "candles" | "clickhouse" | "actions";
  points?: number;
};

type AssistantChart = {
  id: string;
  template: string;
  title: string;
  subtitle?: string;
  mode?: "static" | "dynamic";
  data: Array<Record<string, string | number>>;
  config?: Record<string, string | number | boolean>;
};

type ChartCodingOutput = {
  chartPlans?: Array<{
    template?: string;
    title?: string;
    source?: "history" | "backtest" | "candles" | "clickhouse" | "actions";
    points?: number;
  }>;
  chartActions?: Array<Record<string, unknown>>;
  chartAnimations?: Array<Record<string, unknown>>;
};

type ChatRequestBody = {
  messages?: unknown;
  context?: unknown;
};

type ToolState = {
  clickhouseCandles: CandleRow[];
  clickhouseMeta: {
    pair: string;
    timeframe: string;
    count: number;
  } | null;
  requestedBacktestData: boolean;
};

const MAX_CHAT_TURNS = 14;
const MAX_HISTORY_ROWS = 700;
const MAX_ACTION_ROWS = 700;
const MAX_BACKTEST_ROWS = 2500;
const MAX_CANDLES = 1200;
const MAX_CLICKHOUSE_COUNT = 1500;

const CLICKHOUSE_TIMEFRAME_RE = /^(M1|M5|M15|M30|H1|H4|D|W|M)$/;
const CLICKHOUSE_PAIR_RE = /^[A-Z0-9]{2,20}_[A-Z0-9]{2,20}$/;
const HISTORICAL_WINDOW_RE =
  /\b(past|previous|historical|history|backtest|since|from|between|before|after|yesterday|last\s+\d+|last week|last month|last year)\b/i;
const DATE_LITERAL_RE = /\b\d{4}-\d{2}-\d{2}\b/;
const DRAW_WORD_RE = /\bdraw\b/i;
const VISUAL_REQUEST_RE = /\b(chart|graph|plot|visual|visualize|overview)\b/i;
const ANIMATION_REQUEST_RE = /\b(animate|animation|video|replay|playback|walkthrough|demo)\b/i;
const TECHNICAL_DRAW_RE =
  /\b(support|resistance|s\/r|trendline|trend line|horizontal line|vertical line|box|fvg|fair value gap|arrow|ruler|mark candlestick|draw)\b/i;

const AI_SYSTEM_PROMPT = [
  "You are KORRA AI Assistant, a trading copilot.",
  "Rules:",
  "1) Be concise and direct.",
  "2) Prefer bullet points, with high-signal trading details only.",
  "2b) Answer only what the user asked. Do not add extra sections or advice unless requested.",
  "2c) If the request is ambiguous and blocks execution, ask one concise clarifying question.",
  "3) Never invent facts. If data is insufficient, explicitly say so.",
  "4) If needed, use tools to fetch only necessary data.",
  "5) Default to the most recent data window unless the user explicitly asks for past/historical dates.",
  "6) Never ask the user to run data-fetch steps manually; fetch required data yourself.",
  "7) Use chart hints only when visual clarity helps the user request.",
  "8) Treat user intent as trading analytics and risk-aware guidance, not guaranteed outcomes."
].join("\n");

const PLANNING_PROMPT = [
  "Return only JSON with this shape:",
  '{"needsBacktestData":boolean,"backtestReason":string,"needsClickhouseData":boolean,"clickhouseQuery":{"pair":string,"timeframe":string,"count":number,"start":string,"end":string,"reason":string}}',
  "Set needsBacktestData=true only when backtest has run but detailed rows are missing and required.",
  "Set needsClickhouseData=true only when current candle/history context is not enough.",
  "Use a recent-window query by default. Set start/end only when the user explicitly asks for past/historical/date ranges.",
  "Do not tell the user to fetch data manually; produce a concrete clickhouseQuery instead.",
  "If no query needed, set clickhouseQuery to null."
].join("\n");

const REASONING_PROMPT = [
  "Return only JSON with this shape:",
  '{"cannotAnswer":boolean,"cannotAnswerReason":string,"shortAnswer":string,"bullets":[{"tone":"green|red|gold|black","text":string}],"chartHints":[{"template":"equity_curve|pnl_distribution|session_performance|trade_outcomes|price_action|action_timeline|auto","title":string,"reason":string,"source":"history|backtest|candles|clickhouse|actions","priority":number}]}',
  "Keep bullets concise and actionable. Use max 3 bullets unless the user explicitly asks for detail.",
  "Do not add extra information beyond the user request.",
  "Never tell the user to run/fetch tools manually.",
  "If data is insufficient, set cannotAnswer=true and explain why.",
  "Do not include markdown code fences."
].join("\n");

const buildCodingPrompt = (): string =>
  [
    "You are a chart-planning model.",
    "Return only JSON with this shape:",
    '{"chartPlans":[{"template":string,"title":string,"source":"history|backtest|candles|clickhouse|actions","points":number}],"chartActions":[object],"chartAnimations":[object]}',
    "Pick up to 3 chart plans and up to 12 chart actions.",
    "Use only supported templates listed below.",
    listGraphTemplatesForPrompt(),
    "Use only supported chart actions listed below.",
    chartActionsPromptSpec(),
    "Use chart animations only when user asks for animation/video/replay/demo.",
    chartAnimationsPromptSpec(),
    "Only choose templates/actions relevant to the request."
  ].join("\n");

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const sanitizeAssistantText = (value: string): string => {
  const normalized = value
    .replace(/run\s*contains\s*:\s*false/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (
    /cannot draw support\/resistance/i.test(normalized) ||
    /clickhouse data must be fetched first/i.test(normalized)
  ) {
    return "I cannot complete that chart because required data could not be loaded.";
  }

  return normalized;
};

const safeJsonParse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeTone = (value: unknown): "green" | "red" | "gold" | "black" => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "green" || text === "red" || text === "gold" || text === "black") {
    return text;
  }
  return "black";
};

const normalizeChatTurns = (input: unknown): ChatTurn[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const turns: ChatTurn[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const raw = row as Record<string, unknown>;
    const role = raw.role === "assistant" ? "assistant" : raw.role === "user" ? "user" : null;
    const content = toText(raw.content, "");

    if (!role || !content) {
      continue;
    }

    turns.push({ role, content });
  }

  return turns.slice(-MAX_CHAT_TURNS);
};

const normalizeCandleRows = (input: unknown, cap: number): CandleRow[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const rows: CandleRow[] = [];

  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const raw = row as Record<string, unknown>;
    const time = toNumber(raw.time);
    const open = toNumber(raw.open, Number.NaN);
    const high = toNumber(raw.high, Number.NaN);
    const low = toNumber(raw.low, Number.NaN);
    const close = toNumber(raw.close, Number.NaN);
    const volume = toNumber(raw.volume, 0);

    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      continue;
    }

    rows.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return rows.slice(-cap);
};

const normalizeTradeRows = (input: unknown, cap: number): TradeRow[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const rows: TradeRow[] = [];

  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const raw = row as Record<string, unknown>;

    const id = toText(raw.id, "");
    const symbol = toText(raw.symbol, "XAUUSD");
    const side = toText(raw.side, "Long") === "Short" ? "Short" : "Long";
    const result = toText(raw.result, "Loss") === "Win" ? "Win" : "Loss";

    if (!id) {
      continue;
    }

    rows.push({
      id,
      symbol,
      side,
      result,
      entrySource: toText(raw.entrySource, "Unknown"),
      pnlPct: toNumber(raw.pnlPct),
      pnlUsd: toNumber(raw.pnlUsd),
      entryTime: toNumber(raw.entryTime),
      exitTime: toNumber(raw.exitTime),
      entryPrice: toNumber(raw.entryPrice),
      targetPrice: toNumber(raw.targetPrice),
      stopPrice: toNumber(raw.stopPrice),
      outcomePrice: toNumber(raw.outcomePrice),
      units: toNumber(raw.units),
      entryAt: toText(raw.entryAt, ""),
      exitAt: toText(raw.exitAt, "")
    });
  }

  return rows.slice(-cap);
};

const normalizeActionRows = (input: unknown, cap: number): ActionRow[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const rows: ActionRow[] = [];

  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const raw = row as Record<string, unknown>;
    const id = toText(raw.id, "");
    if (!id) {
      continue;
    }

    rows.push({
      id,
      tradeId: toText(raw.tradeId, ""),
      symbol: toText(raw.symbol, ""),
      label: toText(raw.label, ""),
      details: toText(raw.details, ""),
      time: toText(raw.time, ""),
      timestamp: toNumber(raw.timestamp),
    });
  }

  return rows.slice(-cap);
};

const normalizeContext = (input: unknown): AssistantContext => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const backtestRaw =
    raw.backtest && typeof raw.backtest === "object"
      ? (raw.backtest as Record<string, unknown>)
      : {};

  const summaryRaw =
    backtestRaw.summary && typeof backtestRaw.summary === "object"
      ? (backtestRaw.summary as Record<string, unknown>)
      : {};

  const activeTradeRaw =
    raw.activeTrade && typeof raw.activeTrade === "object"
      ? (raw.activeTrade as Record<string, unknown>)
      : null;

  const activeTrade: ActiveTrade | null = activeTradeRaw
    ? {
        symbol: toText(activeTradeRaw.symbol, ""),
        side: toText(activeTradeRaw.side, "Long") === "Short" ? "Short" : "Long",
        units: toNumber(activeTradeRaw.units),
        entryPrice: toNumber(activeTradeRaw.entryPrice),
        markPrice: toNumber(activeTradeRaw.markPrice),
        targetPrice: toNumber(activeTradeRaw.targetPrice),
        stopPrice: toNumber(activeTradeRaw.stopPrice),
        openedAt: toNumber(activeTradeRaw.openedAt),
        openedAtLabel: toText(activeTradeRaw.openedAtLabel, ""),
        elapsed: toText(activeTradeRaw.elapsed, ""),
        pnlPct: toNumber(activeTradeRaw.pnlPct),
        pnlValue: toNumber(activeTradeRaw.pnlValue),
        progressPct: toNumber(activeTradeRaw.progressPct),
        rr: toNumber(activeTradeRaw.rr)
      }
    : null;

  return {
    symbol: toText(raw.symbol, "XAUUSD"),
    timeframe: toText(raw.timeframe, "15m"),
    liveCandles: normalizeCandleRows(raw.liveCandles, MAX_CANDLES),
    activeTrade,
    historyRows: normalizeTradeRows(raw.historyRows, MAX_HISTORY_ROWS),
    actionRows: normalizeActionRows(raw.actionRows, MAX_ACTION_ROWS),
    backtest: {
      hasRun: Boolean(backtestRaw.hasRun),
      dataIncluded: Boolean(backtestRaw.dataIncluded),
      timeframe: toText(backtestRaw.timeframe, "15m"),
      summary:
        summaryRaw && Object.keys(summaryRaw).length > 0
          ? {
              totalTrades: toNumber(summaryRaw.totalTrades),
              wins: toNumber(summaryRaw.wins),
              losses: toNumber(summaryRaw.losses),
              winRatePct: toNumber(summaryRaw.winRatePct),
              totalPnlUsd: toNumber(summaryRaw.totalPnlUsd)
            }
          : null,
      trades: normalizeTradeRows(backtestRaw.trades, MAX_BACKTEST_ROWS)
    }
  };
};

const getSessionLabel = (timestampSeconds: number): "Tokyo" | "London" | "New York" | "Sydney" => {
  const hour = new Date(timestampSeconds * 1000).getUTCHours();
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  if (hour >= 21 || hour < 1) return "Sydney";
  return "Tokyo";
};

const summarizeTrades = (rows: TradeRow[]): BacktestSummary => {
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
    winRatePct,
    totalPnlUsd
  };
};

const formatTimeLabel = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes} UTC`;
};

const extractTemplatePeriod = (templateId: string, fallback: number): number => {
  const match = templateId.match(/_(\d{1,3})(?:_|$)/);
  if (!match) {
    return fallback;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clamp(Math.round(value), 2, 300);
};

const rollingMeanAt = (values: number[], index: number, period: number): number => {
  const end = Math.max(0, Math.min(values.length - 1, index));
  const start = Math.max(0, end - Math.max(1, period) + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      continue;
    }
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
};

const rollingStdAt = (values: number[], index: number, period: number): number => {
  const mean = rollingMeanAt(values, index, period);
  const end = Math.max(0, Math.min(values.length - 1, index));
  const start = Math.max(0, end - Math.max(1, period) + 1);
  let sumSq = 0;
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      continue;
    }
    const diff = value - mean;
    sumSq += diff * diff;
    count += 1;
  }
  if (count <= 1) {
    return 0;
  }
  return Math.sqrt(sumSq / count);
};

const computeEmaSeries = (values: number[], period: number): number[] => {
  if (values.length === 0) {
    return [];
  }
  const alpha = 2 / (Math.max(2, period) + 1);
  const output: number[] = new Array(values.length).fill(0);
  output[0] = values[0] ?? 0;
  for (let i = 1; i < values.length; i += 1) {
    const prev = output[i - 1] ?? values[i - 1] ?? 0;
    const next = values[i] ?? prev;
    output[i] = prev + alpha * (next - prev);
  }
  return output;
};

const computeRsiSeries = (closes: number[], period: number): number[] => {
  if (closes.length === 0) {
    return [];
  }

  const normalizedPeriod = Math.max(2, period);
  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);

  for (let i = 1; i < closes.length; i += 1) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? Math.abs(diff) : 0;
  }

  const rsi: number[] = new Array(closes.length).fill(50);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < closes.length; i += 1) {
    avgGain = ((avgGain * (normalizedPeriod - 1)) + gains[i]!) / normalizedPeriod;
    avgLoss = ((avgLoss * (normalizedPeriod - 1)) + losses[i]!) / normalizedPeriod;

    if (avgLoss <= 1e-9) {
      rsi[i] = 100;
      continue;
    }

    const rs = avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
};

const buildDerivedPriceValues = (rows: CandleRow[], templateId: string): number[] => {
  if (rows.length === 0) {
    return [];
  }

  const normalizedTemplate = templateId.toLowerCase();
  const closes = rows.map((row) => row.close);
  const highs = rows.map((row) => row.high);
  const lows = rows.map((row) => row.low);
  const volumes = rows.map((row) => row.volume);
  const ranges = rows.map((row) => Math.max(0, row.high - row.low));
  const period = extractTemplatePeriod(normalizedTemplate, 14);
  const ema = computeEmaSeries(closes, period);
  const fastEma = computeEmaSeries(closes, 12);
  const slowEma = computeEmaSeries(closes, 26);
  const signalEma = computeEmaSeries(
    fastEma.map((value, index) => value - (slowEma[index] ?? value)),
    9
  );
  const rsi = computeRsiSeries(closes, period);

  if (normalizedTemplate.startsWith("sma_")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period));
  }

  if (
    normalizedTemplate.startsWith("ema_") ||
    normalizedTemplate.startsWith("rma_") ||
    normalizedTemplate.startsWith("kama_") ||
    normalizedTemplate.startsWith("zlema_")
  ) {
    return ema;
  }

  if (normalizedTemplate.startsWith("wma_")) {
    return closes.map((_, index) => {
      const end = index;
      const start = Math.max(0, end - period + 1);
      let weightedSum = 0;
      let weightTotal = 0;
      let weight = 1;
      for (let i = start; i <= end; i += 1) {
        const close = closes[i] ?? 0;
        weightedSum += close * weight;
        weightTotal += weight;
        weight += 1;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : closes[end] ?? 0;
    });
  }

  if (normalizedTemplate.startsWith("hma_")) {
    return closes.map((_, index) => {
      const half = Math.max(2, Math.floor(period / 2));
      const sqrtPeriod = Math.max(2, Math.floor(Math.sqrt(period)));
      const wmaHalf = rollingMeanAt(closes, index, half);
      const wmaFull = rollingMeanAt(closes, index, period);
      return rollingMeanAt([2 * wmaHalf - wmaFull], 0, sqrtPeriod);
    });
  }

  if (normalizedTemplate.startsWith("vwma_")) {
    return closes.map((_, index) => {
      const end = index;
      const start = Math.max(0, end - period + 1);
      let weightedPrice = 0;
      let weightedVolume = 0;
      for (let i = start; i <= end; i += 1) {
        const volume = volumes[i] ?? 0;
        weightedPrice += (closes[i] ?? 0) * volume;
        weightedVolume += volume;
      }
      return weightedVolume > 0 ? weightedPrice / weightedVolume : closes[end] ?? 0;
    });
  }

  if (normalizedTemplate.includes("bollinger_upper")) {
    return closes.map((_, index) => {
      const mean = rollingMeanAt(closes, index, period);
      return mean + 2 * rollingStdAt(closes, index, period);
    });
  }

  if (normalizedTemplate.includes("bollinger_lower")) {
    return closes.map((_, index) => {
      const mean = rollingMeanAt(closes, index, period);
      return mean - 2 * rollingStdAt(closes, index, period);
    });
  }

  if (normalizedTemplate.includes("bollinger_mid")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period));
  }

  if (normalizedTemplate.includes("keltner_upper")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period) + 1.5 * rollingMeanAt(ranges, index, period));
  }

  if (normalizedTemplate.includes("keltner_lower")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period) - 1.5 * rollingMeanAt(ranges, index, period));
  }

  if (normalizedTemplate.includes("keltner_mid")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period));
  }

  if (normalizedTemplate.includes("donchian_upper")) {
    return highs.map((_, index) => Math.max(...highs.slice(Math.max(0, index - period + 1), index + 1)));
  }

  if (normalizedTemplate.includes("donchian_lower")) {
    return lows.map((_, index) => Math.min(...lows.slice(Math.max(0, index - period + 1), index + 1)));
  }

  if (normalizedTemplate.includes("donchian_mid")) {
    return highs.map((_, index) => {
      const start = Math.max(0, index - period + 1);
      const localHigh = Math.max(...highs.slice(start, index + 1));
      const localLow = Math.min(...lows.slice(start, index + 1));
      return (localHigh + localLow) / 2;
    });
  }

  if (normalizedTemplate.includes("vwap")) {
    let cumulativePV = 0;
    let cumulativeVolume = 0;
    return closes.map((close, index) => {
      const typicalPrice = ((highs[index] ?? close) + (lows[index] ?? close) + close) / 3;
      const volume = volumes[index] ?? 0;
      cumulativePV += typicalPrice * volume;
      cumulativeVolume += volume;
      return cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : close;
    });
  }

  if (normalizedTemplate.includes("rsi")) {
    return rsi;
  }

  if (normalizedTemplate.includes("macd_hist")) {
    return fastEma.map((value, index) => value - (slowEma[index] ?? value) - (signalEma[index] ?? 0));
  }

  if (normalizedTemplate.includes("macd_signal")) {
    return signalEma;
  }

  if (normalizedTemplate.includes("macd_line")) {
    return fastEma.map((value, index) => value - (slowEma[index] ?? value));
  }

  if (normalizedTemplate.includes("roc") || normalizedTemplate.includes("ppo")) {
    return closes.map((close, index) => {
      const priorIndex = Math.max(0, index - period);
      const prior = closes[priorIndex] ?? close;
      if (Math.abs(prior) <= 1e-9) {
        return 0;
      }
      return ((close - prior) / prior) * 100;
    });
  }

  if (
    normalizedTemplate.includes("momentum") ||
    normalizedTemplate.includes("mom_") ||
    normalizedTemplate.includes("close_change")
  ) {
    return closes.map((close, index) => {
      if (index === 0) {
        return 0;
      }
      return close - (closes[index - 1] ?? close);
    });
  }

  if (normalizedTemplate.includes("cumulative_volume")) {
    let cumulative = 0;
    return volumes.map((volume) => {
      cumulative += volume;
      return cumulative;
    });
  }

  if (normalizedTemplate.includes("volume")) {
    return volumes;
  }

  if (
    normalizedTemplate.includes("atr") ||
    normalizedTemplate.includes("volatility") ||
    normalizedTemplate.includes("range")
  ) {
    return ranges.map((_, index) => rollingMeanAt(ranges, index, period));
  }

  if (normalizedTemplate.includes("percentile")) {
    return closes.map((close, index) => {
      const window = closes.slice(Math.max(0, index - period + 1), index + 1);
      if (window.length === 0) {
        return 0;
      }
      const sorted = [...window].sort((left, right) => left - right);
      let rank = 0;
      while (rank < sorted.length && sorted[rank]! <= close) {
        rank += 1;
      }
      return (rank / sorted.length) * 100;
    });
  }

  return closes;
};

const buildContextDigest = (context: AssistantContext): Record<string, unknown> => {
  const latestCandle = context.liveCandles[context.liveCandles.length - 1] ?? null;
  const earliestCandle = context.liveCandles[0] ?? null;
  const candleMovePct =
    latestCandle && earliestCandle && earliestCandle.close !== 0
      ? ((latestCandle.close - earliestCandle.close) / earliestCandle.close) * 100
      : 0;

  const historySummary = summarizeTrades(context.historyRows);
  const backtestSummary =
    context.backtest.summary ?? (context.backtest.trades.length > 0 ? summarizeTrades(context.backtest.trades) : null);

  return {
    symbol: context.symbol,
    timeframe: context.timeframe,
    candles: {
      count: context.liveCandles.length,
      firstTime: earliestCandle ? formatTimeLabel(earliestCandle.time) : null,
      lastTime: latestCandle ? formatTimeLabel(latestCandle.time) : null,
      latestClose: latestCandle?.close ?? null,
      movePct: Number(candleMovePct.toFixed(4))
    },
    activeTrade: context.activeTrade,
    historySummary,
    historyPreview: context.historyRows.slice(-30),
    actionsPreview: context.actionRows.slice(-36),
    backtest: {
      hasRun: context.backtest.hasRun,
      dataIncluded: context.backtest.dataIncluded,
      timeframe: context.backtest.timeframe,
      summary: backtestSummary,
      tradePreview: context.backtest.trades.slice(-40)
    }
  };
};

const buildConversationTranscript = (turns: ChatTurn[]): string => {
  return turns
    .map((turn) => `${turn.role === "user" ? "USER" : "ASSISTANT"}: ${turn.content}`)
    .join("\n");
};

const mapToNebiusConversation = (turns: ChatTurn[]): NebiusChatMessage[] => {
  return turns.map((turn) => ({
    role: turn.role,
    content: turn.content
  }));
};

const getLastUserPrompt = (turns: ChatTurn[]): string => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.role === "user") {
      return turn.content;
    }
  }
  return "";
};

const isHistoricalWindowRequested = (prompt: string): boolean => {
  const text = toText(prompt, "");
  if (!text) {
    return false;
  }
  if (DATE_LITERAL_RE.test(text)) {
    return true;
  }
  return HISTORICAL_WINDOW_RE.test(text);
};

const isTechnicalDrawRequest = (prompt: string): boolean => {
  const text = toText(prompt, "");
  if (!text) {
    return false;
  }
  return TECHNICAL_DRAW_RE.test(text);
};

const inferClickhousePair = (rawValue: string): string | null => {
  const direct = rawValue.trim().toUpperCase();
  if (!direct) {
    return null;
  }

  if (CLICKHOUSE_PAIR_RE.test(direct)) {
    return direct;
  }

  let compact = direct.replace(/[^A-Z0-9]/g, "");
  if (!compact) {
    return null;
  }

  if (direct.includes(".") && compact.endsWith("P") && compact.length > 6) {
    compact = compact.slice(0, -1);
  }

  if (compact.endsWith("PERP") && compact.length > 8) {
    compact = compact.slice(0, -4);
  }

  const quoteTokens = [
    "USDT",
    "USDC",
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "AUD",
    "CAD",
    "CHF",
    "NZD",
    "BTC",
    "ETH",
    "XAU",
    "XAG"
  ];

  for (const quote of quoteTokens) {
    if (!compact.endsWith(quote)) {
      continue;
    }
    const base = compact.slice(0, compact.length - quote.length);
    if (base.length >= 2) {
      return `${base}_${quote}`;
    }
  }

  const alphaNum = compact.match(/^([A-Z]{2,12})(\d{2,8})$/);
  if (alphaNum) {
    return `${alphaNum[1]}_${alphaNum[2]}`;
  }

  const numAlpha = compact.match(/^(\d{2,8})([A-Z]{2,12})$/);
  if (numAlpha) {
    return `${numAlpha[1]}_${numAlpha[2]}`;
  }

  if (compact.length === 6) {
    return `${compact.slice(0, 3)}_${compact.slice(3, 6)}`;
  }

  return null;
};

const symbolToClickhousePair = (symbol: string): string => {
  return inferClickhousePair(symbol) ?? "XAU_USD";
};

const getRecentWindowCount = (timeframe: string): number => {
  const normalized = mapTimeframeToClickhouse(timeframe);
  const byTimeframe: Record<string, number> = {
    M1: 720,
    M5: 600,
    M15: 480,
    M30: 420,
    H1: 360,
    H4: 300,
    D: 220,
    W: 160,
    M: 120
  };
  return byTimeframe[normalized] ?? 480;
};

const buildAutoClickhouseQuery = (params: {
  context: AssistantContext;
  prompt: string;
  planningQuery?: PlanningOutput["clickhouseQuery"];
}): PlanningOutput["clickhouseQuery"] => {
  const { context, prompt, planningQuery } = params;
  const historicalRequested = isHistoricalWindowRequested(prompt);

  const pair = normalizeClickhousePair(
    toText(planningQuery?.pair, symbolToClickhousePair(context.symbol))
  );
  const timeframe = mapTimeframeToClickhouse(
    toText(planningQuery?.timeframe, context.timeframe)
  );
  const defaultCount = getRecentWindowCount(timeframe);
  const count = clamp(toNumber(planningQuery?.count, defaultCount), 40, MAX_CLICKHOUSE_COUNT);

  return {
    pair,
    timeframe,
    count,
    start: historicalRequested ? toText(planningQuery?.start, "") : "",
    end: historicalRequested ? toText(planningQuery?.end, "") : "",
    reason: toText(planningQuery?.reason, "Targeted recent-window fetch for chart analysis.")
  };
};

const mergeCandleRowsPreferLive = (params: {
  clickhouse: CandleRow[];
  live: CandleRow[];
}): CandleRow[] => {
  const { clickhouse, live } = params;
  const byTime = new Map<number, CandleRow>();

  for (const row of clickhouse) {
    if (!Number.isFinite(row.time)) {
      continue;
    }
    byTime.set(Math.trunc(row.time), row);
  }

  // Live stream candles override overlapping ClickHouse rows in the recent window.
  for (const row of live) {
    if (!Number.isFinite(row.time)) {
      continue;
    }
    byTime.set(Math.trunc(row.time), row);
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
};

const getRecentWindowCandles = (params: {
  context: AssistantContext;
  clickhouseCandles: CandleRow[];
}): CandleRow[] => {
  const { context, clickhouseCandles } = params;
  const merged = mergeCandleRowsPreferLive({
    clickhouse: clickhouseCandles,
    live: context.liveCandles
  });
  const windowCount = getRecentWindowCount(context.timeframe);

  if (merged.length > 0) {
    return merged.slice(-windowCount);
  }

  return context.liveCandles.slice(-windowCount);
};

const getDrawWindowCandles = (params: {
  context: AssistantContext;
  clickhouseCandles: CandleRow[];
}): CandleRow[] => {
  const { context, clickhouseCandles } = params;
  const windowCount = getRecentWindowCount(context.timeframe);
  const liveTail = context.liveCandles.slice(-windowCount);

  // Prefer live stream candles for draw accuracy on the active chart.
  if (liveTail.length >= 24) {
    return liveTail;
  }

  return getRecentWindowCandles({ context, clickhouseCandles });
};

const getPriceQuantile = (values: number[], quantile: number): number | null => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(1, quantile)) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const lowValue = sorted[low] ?? sorted[0] ?? 0;
  const highValue = sorted[high] ?? lowValue;
  const weight = index - low;

  return Number((lowValue * (1 - weight) + highValue * weight).toFixed(4));
};

const extractPromptPrice = (prompt: string): number | null => {
  const matches = prompt.match(/\b\d{3,6}(?:\.\d+)?\b/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const candidate = Number(matches[0]);
  return Number.isFinite(candidate) ? candidate : null;
};

const normalizeToolLabel = (value: string): string => {
  const text = value.replace(/_/g, " ").trim();
  return text.length > 0 ? text : "tool";
};

const summarizeDrawnActions = (
  actions: ReturnType<typeof normalizeChartActions>
): string => {
  if (!Array.isArray(actions) || actions.length === 0) {
    return "";
  }

  const describeTime = (timeMs: number | undefined): string => {
    if (!Number.isFinite(timeMs)) {
      return "";
    }
    return formatTimeLabel(Number(timeMs));
  };

  const describePrice = (price: number | undefined): string => {
    if (!Number.isFinite(price)) {
      return "";
    }
    return Number(price).toFixed(4);
  };

  const descriptions: string[] = [];

  for (const action of actions.slice(0, 6)) {
    if (action.type === "draw_support_resistance") {
      const support = describePrice(action.priceStart);
      const resistance = describePrice(action.priceEnd);
      descriptions.push(
        support && resistance
          ? `support ${support} / resistance ${resistance}`
          : "support/resistance levels"
      );
      continue;
    }

    if (action.type === "draw_horizontal_line") {
      const price = describePrice(action.price);
      descriptions.push(price ? `horizontal level ${price}` : "horizontal level");
      continue;
    }

    if (action.type === "draw_vertical_line") {
      const time = describeTime(action.time);
      descriptions.push(time ? `vertical marker at ${time}` : "vertical marker");
      continue;
    }

    if (action.type === "draw_trend_line") {
      const start = describePrice(action.priceStart);
      const end = describePrice(action.priceEnd);
      descriptions.push(
        start && end ? `trend line ${start} -> ${end}` : "trend line"
      );
      continue;
    }

    if (action.type === "draw_box") {
      descriptions.push(action.label ? `box (${action.label})` : "box zone");
      continue;
    }

    if (action.type === "draw_fvg") {
      descriptions.push("fair value gap zone");
      continue;
    }

    if (action.type === "draw_arrow") {
      descriptions.push(action.label ? `arrow (${action.label})` : "arrow marker");
      continue;
    }

    if (action.type === "draw_long_position") {
      const entry = describePrice(action.entryPrice);
      descriptions.push(entry ? `long position (entry ${entry})` : "long position");
      continue;
    }

    if (action.type === "draw_short_position") {
      const entry = describePrice(action.entryPrice);
      descriptions.push(entry ? `short position (entry ${entry})` : "short position");
      continue;
    }

    if (action.type === "draw_ruler") {
      descriptions.push("ruler measurement");
      continue;
    }

    if (action.type === "mark_candlestick") {
      descriptions.push(action.note ? `marked candle (${action.note})` : "marked candle");
      continue;
    }

    if (action.type === "move_to_date") {
      const time = describeTime(action.time);
      descriptions.push(time ? `moved chart to ${time}` : "moved chart to target date");
      continue;
    }

    if (action.type === "clear_annotations") {
      descriptions.push("cleared existing annotations");
      continue;
    }
  }

  if (descriptions.length === 0) {
    return "";
  }

  const preview = descriptions.slice(0, 3).join("; ");
  const suffix = descriptions.length > 3 ? "; ..." : "";
  return `Drew ${actions.length} item${actions.length === 1 ? "" : "s"}: ${preview}${suffix}.`;
};

const buildDrawActionsFromPrompt = (params: {
  prompt: string;
  candles: CandleRow[];
}): Array<Record<string, unknown>> => {
  const prompt = params.prompt.toLowerCase();
  const candles = params.candles;
  if (candles.length === 0) {
    return [];
  }

  const recent = candles.slice(-Math.min(candles.length, 240));
  const last = recent[recent.length - 1]!;
  const first = recent[0]!;
  const lows = recent.map((row) => row.low);
  const highs = recent.map((row) => row.high);
  const support = getPriceQuantile(lows, 0.2) ?? Number(last.low.toFixed(4));
  const resistance = getPriceQuantile(highs, 0.8) ?? Number(last.high.toFixed(4));
  const explicitPrice = extractPromptPrice(prompt);
  const actions: Array<Record<string, unknown>> = [];

  if (prompt.includes("support") || prompt.includes("resistance") || prompt.includes("s/r")) {
    actions.push({
      type: "draw_support_resistance",
      priceStart: support,
      priceEnd: resistance,
      label: "Auto S/R"
    });
  }

  if (prompt.includes("trendline") || prompt.includes("trend line")) {
    actions.push({
      type: "draw_trend_line",
      timeStart: first.time,
      priceStart: first.close,
      timeEnd: last.time,
      priceEnd: last.close,
      label: "Trendline"
    });
  }

  if (prompt.includes("horizontal")) {
    actions.push({
      type: "draw_horizontal_line",
      price: explicitPrice ?? Number(last.close.toFixed(4)),
      label: "Horizontal Level"
    });
  }

  if (prompt.includes("vertical")) {
    actions.push({
      type: "draw_vertical_line",
      time: last.time,
      label: "Vertical Marker"
    });
  }

  if (prompt.includes("box")) {
    actions.push({
      type: "draw_box",
      timeStart: recent[Math.max(0, recent.length - 50)]?.time ?? first.time,
      timeEnd: last.time,
      priceStart: support,
      priceEnd: resistance,
      label: "Range Box"
    });
  }

  if (prompt.includes("fvg") || prompt.includes("fair value gap")) {
    actions.push({
      type: "draw_fvg",
      timeStart: recent[Math.max(0, recent.length - 25)]?.time ?? first.time,
      timeEnd: last.time,
      priceStart: Number(((support + last.close) / 2).toFixed(4)),
      priceEnd: Number(((resistance + last.close) / 2).toFixed(4)),
      label: "FVG"
    });
  }

  if (prompt.includes("arrow")) {
    actions.push({
      type: "draw_arrow",
      time: last.time,
      price: explicitPrice ?? Number(last.close.toFixed(4)),
      markerShape: "arrowUp",
      label: "Arrow"
    });
  }

  if (prompt.includes("ruler")) {
    actions.push({
      type: "draw_ruler",
      timeStart: first.time,
      priceStart: first.close,
      timeEnd: last.time,
      priceEnd: last.close,
      label: "Ruler"
    });
  }

  if (actions.length === 0) {
    actions.push({
      type: "mark_candlestick",
      time: last.time,
      markerShape: "circle",
      note: "Draw marker"
    });
  }

  return actions.slice(0, 12);
};

const sanitizeDrawActionsAgainstCandles = (params: {
  actions: ReturnType<typeof normalizeChartActions>;
  candles: CandleRow[];
}): ReturnType<typeof normalizeChartActions> => {
  const { actions, candles } = params;
  if (actions.length === 0) {
    return [];
  }

  const recent = candles.slice(-Math.min(candles.length, 320));
  if (recent.length < 4) {
    return actions;
  }

  const lows = recent.map((row) => row.low);
  const highs = recent.map((row) => row.high);
  const closes = recent.map((row) => row.close);
  const last = recent[recent.length - 1]!;
  const minLow = Math.min(...lows);
  const maxHigh = Math.max(...highs);
  const span = Math.max(0.0001, maxHigh - minLow);
  const lowerBound = minLow - span * 0.5;
  const upperBound = maxHigh + span * 0.5;
  const support = getPriceQuantile(lows, 0.2) ?? last.low;
  const resistance = getPriceQuantile(highs, 0.8) ?? last.high;
  const median = getPriceQuantile(closes, 0.5) ?? last.close;

  const clampPriceToBand = (value: number | undefined, fallback: number): number => {
    if (!Number.isFinite(value)) {
      return Number(fallback.toFixed(4));
    }
    const numeric = Number(value);
    if (numeric < lowerBound || numeric > upperBound) {
      return Number(fallback.toFixed(4));
    }
    return Number(numeric.toFixed(4));
  };

  const patched = actions.map((action) => {
    const next = { ...action };

    if (next.type === "draw_support_resistance") {
      next.priceStart = clampPriceToBand(next.priceStart, support);
      next.priceEnd = clampPriceToBand(next.priceEnd, resistance);
      return next;
    }

    if (next.type === "draw_horizontal_line") {
      next.price = clampPriceToBand(next.price, median);
      return next;
    }

    if (next.type === "draw_box" || next.type === "draw_fvg" || next.type === "draw_ruler") {
      next.priceStart = clampPriceToBand(next.priceStart, support);
      next.priceEnd = clampPriceToBand(next.priceEnd, resistance);
      return next;
    }

    if (next.type === "draw_trend_line") {
      next.priceStart = clampPriceToBand(next.priceStart, support);
      next.priceEnd = clampPriceToBand(next.priceEnd, resistance);
      return next;
    }

    if (next.type === "draw_arrow" || next.type === "mark_candlestick") {
      next.price = clampPriceToBand(next.price, last.close);
      return next;
    }

    if (next.type === "draw_long_position") {
      next.entryPrice = clampPriceToBand(next.entryPrice, median);
      next.stopPrice = clampPriceToBand(next.stopPrice, support);
      next.targetPrice = clampPriceToBand(next.targetPrice, resistance);
      return next;
    }

    if (next.type === "draw_short_position") {
      next.entryPrice = clampPriceToBand(next.entryPrice, median);
      next.stopPrice = clampPriceToBand(next.stopPrice, resistance);
      next.targetPrice = clampPriceToBand(next.targetPrice, support);
      return next;
    }

    return next;
  });

  return patched;
};

const buildDefaultAnimationActions = (candles: CandleRow[]): Array<Record<string, unknown>> => {
  if (candles.length === 0) {
    return [];
  }

  const recent = candles.slice(-Math.min(candles.length, 220));
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const lows = recent.map((row) => row.low);
  const highs = recent.map((row) => row.high);
  const support = getPriceQuantile(lows, 0.2) ?? Number(last.low.toFixed(4));
  const resistance = getPriceQuantile(highs, 0.8) ?? Number(last.high.toFixed(4));

  return [
    { type: "clear_annotations" },
    { type: "move_to_date", time: last.time },
    {
      type: "draw_support_resistance",
      priceStart: support,
      priceEnd: resistance,
      label: "Range"
    },
    {
      type: "draw_trend_line",
      timeStart: first.time,
      priceStart: first.close,
      timeEnd: last.time,
      priceEnd: last.close,
      label: "Trend"
    },
    {
      type: "draw_arrow",
      time: last.time,
      price: last.close,
      markerShape: last.close >= first.close ? "arrowUp" : "arrowDown",
      label: "Latest"
    }
  ];
};

const normalizeClickhousePair = (pair: string): string => {
  return inferClickhousePair(pair) ?? "XAU_USD";
};

const mapTimeframeToClickhouse = (timeframe: string): string => {
  const normalized = timeframe.trim().toUpperCase();
  if (CLICKHOUSE_TIMEFRAME_RE.test(normalized)) {
    return normalized;
  }

  const lookup: Record<string, string> = {
    "1M": "M1",
    "5M": "M5",
    "15M": "M15",
    "30M": "M30",
    "1H": "H1",
    "4H": "H4",
    "1D": "D",
    "1W": "W"
  };

  return lookup[normalized] ?? "M15";
};

const fetchClickhouseCandles = async (
  request: Request,
  args: PlanningOutput["clickhouseQuery"]
): Promise<{ candles: CandleRow[]; pair: string; timeframe: string }> => {
  const pair = normalizeClickhousePair(toText(args?.pair, "XAU_USD"));
  const timeframe = mapTimeframeToClickhouse(toText(args?.timeframe, "M15"));
  const count = clamp(toNumber(args?.count, 180), 20, MAX_CLICKHOUSE_COUNT);

  const url = new URL("/api/clickhouse/candles", request.url);
  url.searchParams.set("pair", pair);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("count", String(count));

  const start = toText(args?.start, "");
  if (start) {
    url.searchParams.set("start", start);
  }

  const end = toText(args?.end, "");
  if (end) {
    url.searchParams.set("end", end);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ClickHouse fetch failed ${response.status}: ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const candles = normalizeCandleRows(payload.candles, MAX_CLICKHOUSE_COUNT);

  return {
    candles,
    pair,
    timeframe
  };
};

const fetchClickhouseMonthlyAnalytics = async (params: {
  request: Request;
  pair: string;
  timeframe: string;
  metric: "monthly_avg_price" | "monthly_volume";
}): Promise<
  Array<{
    month: string;
    metric_value: number;
    avg_range: number;
    total_volume: number;
    count: number;
  }>
> => {
  const { request, pair, timeframe, metric } = params;
  const url = new URL("/api/clickhouse/analytics", request.url);
  url.searchParams.set("pair", normalizeClickhousePair(pair));
  url.searchParams.set("timeframe", mapTimeframeToClickhouse(timeframe));
  url.searchParams.set("metric", metric);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ClickHouse analytics failed ${response.status}: ${body.slice(0, 320)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const raw = row as Record<string, unknown>;
      return {
        month: toText(raw.month, ""),
        metric_value: toNumber(raw.metric_value),
        avg_range: toNumber(raw.avg_range),
        total_volume: toNumber(raw.total_volume),
        count: toNumber(raw.count)
      };
    })
    .filter(
      (
        row
      ): row is {
        month: string;
        metric_value: number;
        avg_range: number;
        total_volume: number;
        count: number;
      } => row !== null && row.month.length > 0
    );
};

const executePlanningStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  request: Request;
  toolState: ToolState;
}): Promise<{
  planning: PlanningOutput;
  status?: "needs_backtest_data";
  reason?: string;
}> => {
  const { apiKey, baseUrl, model, turns, context, request, toolState } = params;

  const planningMessages: NebiusChatMessage[] = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    { role: "system", content: PLANNING_PROMPT },
    ...mapToNebiusConversation(turns),
    {
      role: "user",
      content: `RUNTIME_CONTEXT_JSON:\n${JSON.stringify(buildContextDigest(context))}`
    }
  ];

  const tools: Array<Record<string, unknown>> = [
    {
      type: "function",
      function: {
        name: "request_backtest_data",
        description:
          "Request full backtest rows when backtest has run but detailed data was not included.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string" },
            neededFields: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["reason"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "query_clickhouse_candles",
        description: "Fetch an exact candle slice from ClickHouse using only required bounds.",
        parameters: {
          type: "object",
          properties: {
            pair: { type: "string" },
            timeframe: { type: "string" },
            count: { type: "number" },
            start: { type: "string" },
            end: { type: "string" },
            reason: { type: "string" }
          }
        }
      }
    }
  ];

  const toolAwareMessages = [...planningMessages];
  let parsedPlanning: PlanningOutput = {};

  for (let step = 0; step < 3; step += 1) {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: toolAwareMessages,
      temperature: 0.1,
      maxTokens: 900,
      tools,
      toolChoice: "auto"
    });

    const assistantMessage = completion.message;
    toolAwareMessages.push({
      role: "assistant",
      content: extractNebiusMessageText(assistantMessage.content),
      tool_calls: assistantMessage.tool_calls
    });

    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];

    if (toolCalls.length === 0) {
      const contentText = extractNebiusMessageText(assistantMessage.content);
      parsedPlanning = safeJsonParse<PlanningOutput>(contentText, {});
      break;
    }

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name;
      const args = safeJsonParse<Record<string, unknown>>(toolCall.function?.arguments ?? "{}", {});

      if (name === "request_backtest_data") {
        toolState.requestedBacktestData = true;

        if (context.backtest.hasRun && !context.backtest.dataIncluded) {
          return {
            planning: {
              needsBacktestData: true,
              backtestReason: toText(args.reason, "Detailed backtest rows are required.")
            },
            status: "needs_backtest_data",
            reason: toText(args.reason, "Detailed backtest rows are required.")
          };
        }

        toolAwareMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: true,
            backtestAvailable: context.backtest.hasRun,
            backtestDataIncluded: context.backtest.dataIncluded,
            rowCount: context.backtest.trades.length
          })
        });

        continue;
      }

      if (name === "query_clickhouse_candles") {
        try {
          const result = await fetchClickhouseCandles(request, args as PlanningOutput["clickhouseQuery"]);
          toolState.clickhouseCandles = result.candles;
          toolState.clickhouseMeta = {
            pair: result.pair,
            timeframe: result.timeframe,
            count: result.candles.length
          };

          toolAwareMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              ok: true,
              pair: result.pair,
              timeframe: result.timeframe,
              count: result.candles.length,
              candles: result.candles.slice(-300)
            })
          });
        } catch (error) {
          toolAwareMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            })
          });
        }
      }
    }
  }

  return {
    planning: parsedPlanning
  };
};

const normalizeReasoningOutput = (input: unknown): ReasoningOutput => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const bulletsRaw = Array.isArray(raw.bullets) ? raw.bullets : [];
  const chartHintsRaw = Array.isArray(raw.chartHints) ? raw.chartHints : [];

  const bullets = bulletsRaw
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const item = row as Record<string, unknown>;
      const text = sanitizeAssistantText(toText(item.text, ""));
      if (!text) {
        return null;
      }

      return {
        tone: normalizeTone(item.tone),
        text
      };
    })
    .filter((row): row is { tone: "green" | "red" | "gold" | "black"; text: string } => row !== null)
    .slice(0, 3);

  const chartHints: ReasoningOutput["chartHints"] = [];

  for (const row of chartHintsRaw) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const item = row as Record<string, unknown>;
    const template = toText(item.template, "auto");
    const source = toText(item.source, "history");

    if (
      ![
        "equity_curve",
        "pnl_distribution",
        "session_performance",
        "trade_outcomes",
        "price_action",
        "action_timeline",
        "auto"
      ].includes(template)
    ) {
      continue;
    }

    if (!["history", "backtest", "candles", "clickhouse", "actions"].includes(source)) {
      continue;
    }

    chartHints.push({
      template: template as ReasoningOutput["chartHints"][number]["template"],
      title: toText(item.title, "Chart"),
      reason: toText(item.reason, ""),
      source: source as "history" | "backtest" | "candles" | "clickhouse" | "actions",
      priority: clamp(toNumber(item.priority, 5), 1, 10)
    });
  }

  const limitedChartHints = chartHints.slice(0, 6);

  return {
    cannotAnswer: Boolean(raw.cannotAnswer),
    cannotAnswerReason: sanitizeAssistantText(
      toText(raw.cannotAnswerReason, "Insufficient data to answer reliably.")
    ),
    shortAnswer: sanitizeAssistantText(toText(raw.shortAnswer, "")),
    bullets,
    chartHints: limitedChartHints
  };
};

const executeReasoningStage = async (params: {
  apiKey: string;
  baseUrl: string;
  models: NebiusModelSelection;
  turns: ChatTurn[];
  context: AssistantContext;
  toolState: ToolState;
  planning: PlanningOutput;
}): Promise<ReasoningOutput> => {
  const { apiKey, baseUrl, models, turns, context, toolState, planning } = params;
  const recentWindowCandles = getRecentWindowCandles({
    context,
    clickhouseCandles: toolState.clickhouseCandles
  });

  const reasoningInput = {
    conversation: buildConversationTranscript(turns),
    context: buildContextDigest(context),
    planning,
    recentWindow: {
      includesLiveStream: true,
      count: recentWindowCandles.length,
      candles: recentWindowCandles.slice(-300)
    },
    clickhouse:
      toolState.clickhouseCandles.length > 0
        ? {
            meta: toolState.clickhouseMeta,
            candles: recentWindowCandles.slice(-300)
          }
        : null
  };

  const completion = await nebiusChatCompletion({
    apiKey,
    baseUrl,
    model: models.reasoning,
    messages: [
      {
        role: "system",
        content: `${AI_SYSTEM_PROMPT}\n${REASONING_PROMPT}`
      },
      {
        role: "user",
        content: `ANALYZE_THIS_JSON:\n${JSON.stringify(reasoningInput)}`
      }
    ],
    maxTokens: 1300,
    responseFormat: {
      type: "json_object"
    }
  });

  const parsed = safeJsonParse<ReasoningOutput>(
    extractNebiusMessageText(completion.message.content),
    {
      cannotAnswer: true,
      cannotAnswerReason: "Failed to parse model output.",
      shortAnswer: "",
      bullets: [],
      chartHints: []
    }
  );

  return normalizeReasoningOutput(parsed);
};

const normalizeChartPlans = (input: unknown): ChartPlan[] => {
  const raw = input && typeof input === "object" ? (input as ChartCodingOutput) : {};
  const plansRaw = Array.isArray(raw.chartPlans) ? raw.chartPlans : [];

  const plans: ChartPlan[] = [];

  for (const row of plansRaw) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const item = row as Record<string, unknown>;
    const template = toText(item.template, "").toLowerCase();
    const source = toText(item.source, "");

    if (!GRAPH_TEMPLATE_ID_SET.has(template)) {
      continue;
    }

    if (!["history", "backtest", "candles", "clickhouse", "actions"].includes(source)) {
      continue;
    }

    plans.push({
      template,
      title: toText(item.title, resolveGraphTemplate(template).title),
      source: source as ChartPlan["source"],
      points: clamp(toNumber(item.points, 180), 40, 1000)
    });
  }

  return plans.slice(0, 3);
};

const deriveFallbackChartPlans = (context: AssistantContext, reasoning: ReasoningOutput): ChartPlan[] => {
  if (reasoning.chartHints.length > 0) {
    return reasoning.chartHints
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .slice(0, 3)
      .map((hint) => ({
        template: hint.template === "auto" ? "equity_curve" : (hint.template as ChartPlan["template"]),
        title: hint.title,
        source: hint.source ?? "history",
        points: 220
      }));
  }

  const plans: ChartPlan[] = [];
  if (context.historyRows.length > 0) {
    plans.push({ template: "equity_curve", title: "Equity Curve", source: "history", points: 260 });
    plans.push({ template: "trade_outcomes", title: "Win vs Loss", source: "history", points: 120 });
  }

  if (context.liveCandles.length > 0) {
    plans.push({ template: "price_action", title: "Price Action", source: "candles", points: 240 });
  }

  return plans.slice(0, 3);
};

const executeCodingStage = async (params: {
  apiKey: string;
  baseUrl: string;
  models: NebiusModelSelection;
  reasoning: ReasoningOutput;
  context: AssistantContext;
  toolState: ToolState;
  wantsAnimation: boolean;
}): Promise<{
  chartPlans: ChartPlan[];
  chartActions: ReturnType<typeof normalizeChartActions>;
  chartAnimations: ReturnType<typeof normalizeChartAnimationsFromCoding>;
}> => {
  const { apiKey, baseUrl, models, reasoning, context, toolState } = params;

  const codingInput = {
    chartHints: reasoning.chartHints,
    availableSources: {
      history: context.historyRows.length,
      backtest: context.backtest.trades.length,
      candles: context.liveCandles.length,
      clickhouse: toolState.clickhouseCandles.length,
      actions: context.actionRows.length
    },
    wantsAnimation: params.wantsAnimation
  };

  const completion = await nebiusChatCompletion({
    apiKey,
    baseUrl,
    model: models.coding,
    messages: [
      {
        role: "system",
        content: buildCodingPrompt()
      },
      {
        role: "user",
        content: `PLAN_CHARTS_FROM_JSON:\n${JSON.stringify(codingInput)}`
      }
    ],
    temperature: 0.1,
    maxTokens: 850,
    responseFormat: {
      type: "json_object"
    }
  });

  const parsed = safeJsonParse<Record<string, unknown>>(
    extractNebiusMessageText(completion.message.content),
    {}
  );

  const plans = normalizeChartPlans(parsed);
  const chartActions = normalizeChartActions((parsed as ChartCodingOutput).chartActions);
  const chartAnimations = normalizeChartAnimationsFromCoding(parsed);
  if (plans.length > 0) {
    return { chartPlans: plans, chartActions, chartAnimations };
  }

  return {
    chartPlans: deriveFallbackChartPlans(context, reasoning),
    chartActions,
    chartAnimations
  };
};

const takeTail = <T>(rows: T[], count: number): T[] => {
  if (rows.length <= count) {
    return rows;
  }
  return rows.slice(rows.length - count);
};

const buildEquityCurveChart = (
  rows: TradeRow[],
  title: string,
  points: number,
  templateId: string
): AssistantChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort((a, b) => a.exitTime - b.exitTime);
  const sliced = takeTail(sorted, points);
  let equity = 0;

  const data = sliced.map((row) => {
    equity += row.pnlUsd;
    return {
      x: formatTimeLabel(row.exitTime * 1000),
      equity: Number(equity.toFixed(2)),
      pnl: Number(row.pnlUsd.toFixed(2))
    };
  });

  return {
    id: `equity-${rows[rows.length - 1]?.id ?? "chart"}`,
    template: templateId,
    title,
    subtitle: `${rows.length} trades`,
    data,
    config: {
      xKey: "x",
      yKey: "equity"
    }
  };
};

const buildPnlDistributionChart = (
  rows: TradeRow[],
  title: string,
  templateId: string
): AssistantChart | null => {
  if (rows.length < 2) {
    return null;
  }

  const values = rows.map((row) => row.pnlUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bins = 12;
  const span = Math.max(1, max - min);
  const step = span / bins;

  const histogram = Array.from({ length: bins }, (_, idx) => ({
    start: min + step * idx,
    end: min + step * (idx + 1),
    count: 0
  }));

  for (const value of values) {
    const bucket = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / step)));
    histogram[bucket]!.count += 1;
  }

  return {
    id: `hist-${rows[rows.length - 1]?.id ?? "chart"}`,
    template: templateId,
    title,
    subtitle: "PnL histogram",
    data: histogram.map((bucket) => ({
      bucket: `${bucket.start.toFixed(0)}..${bucket.end.toFixed(0)}`,
      count: bucket.count
    })),
    config: {
      xKey: "bucket",
      yKey: "count"
    }
  };
};

const buildSessionPerformanceChart = (
  rows: TradeRow[],
  title: string,
  templateId: string
): AssistantChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const order: Array<"Tokyo" | "London" | "New York" | "Sydney"> = [
    "Tokyo",
    "London",
    "New York",
    "Sydney"
  ];

  const buckets = new Map<string, { pnl: number; count: number; wins: number }>();
  for (const row of rows) {
    const session = getSessionLabel(row.entryTime);
    const current = buckets.get(session) ?? { pnl: 0, count: 0, wins: 0 };
    current.pnl += row.pnlUsd;
    current.count += 1;
    current.wins += row.result === "Win" ? 1 : 0;
    buckets.set(session, current);
  }

  return {
    id: `session-${rows[rows.length - 1]?.id ?? "chart"}`,
    template: templateId,
    title,
    data: order.map((session) => {
      const item = buckets.get(session) ?? { pnl: 0, count: 0, wins: 0 };
      const winRate = item.count > 0 ? (item.wins / item.count) * 100 : 0;
      return {
        session,
        pnl: Number(item.pnl.toFixed(2)),
        trades: item.count,
        winRate: Number(winRate.toFixed(2))
      };
    }),
    config: {
      xKey: "session",
      yKey: "pnl",
      yKeyAlt: "winRate"
    }
  };
};

const buildTradeOutcomeChart = (
  rows: TradeRow[],
  title: string,
  templateId: string
): AssistantChart | null => {
  if (rows.length === 0) {
    return null;
  }

  let wins = 0;
  let losses = 0;

  for (const row of rows) {
    if (row.result === "Win") {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  return {
    id: `outcomes-${rows[rows.length - 1]?.id ?? "chart"}`,
    template: templateId,
    title,
    data: [
      { label: "Wins", value: wins },
      { label: "Losses", value: losses }
    ],
    config: {
      labelKey: "label",
      valueKey: "value"
    }
  };
};

const buildPriceActionChart = (
  rows: CandleRow[],
  title: string,
  points: number,
  templateId: string
): AssistantChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const data = takeTail(rows, points).map((row) => ({
    x: formatTimeLabel(row.time),
    close: Number(row.close.toFixed(4)),
    high: Number(row.high.toFixed(4)),
    low: Number(row.low.toFixed(4)),
    volume: Number(row.volume.toFixed(2))
  }));

  return {
    id: `price-${rows[rows.length - 1]?.time ?? "chart"}`,
    template: templateId,
    title,
    subtitle: `${rows.length} candles`,
    data,
    config: {
      xKey: "x",
      yKey: "close",
      yKeyHigh: "high",
      yKeyLow: "low"
    }
  };
};

const buildPriceValueSeriesChart = (
  rows: CandleRow[],
  title: string,
  points: number,
  templateId: string
): AssistantChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const slicedRows = takeTail(rows, points);
  const values = buildDerivedPriceValues(slicedRows, templateId);
  if (values.length === 0) {
    return null;
  }

  const data = slicedRows.map((row, index) => ({
    x: formatTimeLabel(row.time),
    value: Number((values[index] ?? 0).toFixed(6)),
    close: Number(row.close.toFixed(6))
  }));

  return {
    id: `series-${templateId}-${slicedRows[slicedRows.length - 1]?.time ?? "chart"}`,
    template: templateId,
    title,
    subtitle: `${rows.length} candles`,
    data,
    config: {
      xKey: "x",
      yKey: "value"
    }
  };
};

const STATIC_PRICE_ACTION_TEMPLATE_SET = new Set<string>([
  "price_action",
  "close_with_range",
  "equity_vs_price"
]);

const buildActionTimelineChart = (
  rows: ActionRow[],
  title: string,
  templateId: string
): AssistantChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const buckets = new Map<string, number>();

  for (const row of rows) {
    const label = row.label || "Action";
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  const data = Array.from(buckets.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    id: `actions-${rows[rows.length - 1]?.id ?? "chart"}`,
    template: templateId,
    title,
    data,
    config: {
      xKey: "label",
      yKey: "count"
    }
  };
};

const buildChartsFromPlans = (
  plans: ChartPlan[],
  context: AssistantContext,
  toolState: ToolState
): AssistantChart[] => {
  const charts: AssistantChart[] = [];

  for (const plan of plans) {
    const points = clamp(toNumber(plan.points, 220), 40, 1000);
    const resolvedTemplate = resolveGraphTemplate(plan.template);
    const templateId = resolvedTemplate.id;
    const templateFamily = resolvedTemplate.family;
    const chartTitle = toText(plan.title, resolvedTemplate.title);
    const historyRows = context.historyRows;
    const backtestRows = context.backtest.trades;
    const candleRows = context.liveCandles;
    const clickhouseRows = toolState.clickhouseCandles;
    const recentWindowRows = getRecentWindowCandles({
      context,
      clickhouseCandles: clickhouseRows
    });
    const actionRows = context.actionRows;

    let chart: AssistantChart | null = null;

    if (templateFamily === "equity_curve") {
      const sourceRows =
        plan.source === "backtest" && backtestRows.length > 0
          ? backtestRows
          : historyRows.length > 0
            ? historyRows
            : backtestRows;
      chart = buildEquityCurveChart(sourceRows, chartTitle, points, templateId);
    } else if (templateFamily === "pnl_distribution") {
      const sourceRows =
        plan.source === "backtest" && backtestRows.length > 0
          ? backtestRows
          : historyRows.length > 0
            ? historyRows
            : backtestRows;
      chart = buildPnlDistributionChart(sourceRows, chartTitle, templateId);
    } else if (templateFamily === "session_performance") {
      const sourceRows =
        plan.source === "backtest" && backtestRows.length > 0
          ? backtestRows
          : historyRows.length > 0
            ? historyRows
            : backtestRows;
      chart = buildSessionPerformanceChart(sourceRows, chartTitle, templateId);
    } else if (templateFamily === "trade_outcomes") {
      const sourceRows =
        plan.source === "backtest" && backtestRows.length > 0
          ? backtestRows
          : historyRows.length > 0
            ? historyRows
            : backtestRows;
      chart = buildTradeOutcomeChart(sourceRows, chartTitle, templateId);
    } else if (templateFamily === "price_action") {
      const sourceRows =
        plan.source === "clickhouse" && clickhouseRows.length > 0
          ? recentWindowRows
          : candleRows.length > 0
            ? candleRows
            : recentWindowRows;

      if (STATIC_PRICE_ACTION_TEMPLATE_SET.has(templateId)) {
        chart = buildPriceActionChart(sourceRows, chartTitle, points, templateId);
      } else {
        chart = buildPriceValueSeriesChart(sourceRows, chartTitle, points, templateId);
      }
    } else if (templateFamily === "action_timeline") {
      chart = buildActionTimelineChart(actionRows, chartTitle, templateId);
    }

    if (chart && chart.data.length > 0) {
      chart.mode = resolvedTemplate.mode;
      charts.push(chart);
    }
  }

  const uniqueByTemplate = new Map<string, AssistantChart>();
  for (const chart of charts) {
    if (!uniqueByTemplate.has(chart.template)) {
      uniqueByTemplate.set(chart.template, chart);
    }
  }

  return Array.from(uniqueByTemplate.values()).slice(0, 3);
};

const buildFallbackFailureResponse = (message: string) => {
  return {
    status: "ok",
    response: {
      cannotAnswer: true,
      cannotAnswerReason: message,
      shortAnswer: "",
      bullets: [
        {
          tone: "gold",
          text: message
        }
      ],
      charts: [],
      toolsUsed: [] as string[]
    },
    modelTrace: null
  };
};

const buildDeterministicMonthlyResponse = async (params: {
  request: Request;
  context: AssistantContext;
  intent: ReturnType<typeof detectDeterministicIntent>;
  includeVisualization: boolean;
}) => {
  const { request, context, intent, includeVisualization } = params;
  const metric = intent.type === "monthly_volume" ? "monthly_volume" : "monthly_avg_price";
  const pair = symbolToClickhousePair(context.symbol);

  const rows = await fetchClickhouseMonthlyAnalytics({
    request,
    pair,
    timeframe: context.timeframe,
    metric
  });

  if (rows.length === 0) {
    return {
      status: "ok" as const,
      response: {
        cannotAnswer: true,
        cannotAnswerReason: "No ClickHouse rows were returned for the requested monthly calculation.",
        shortAnswer: "",
        bullets: [
          {
            tone: "gold" as const,
            text: "No ClickHouse rows were returned for the requested monthly calculation."
          }
        ],
        charts: [] as AssistantChart[],
        chartActions: [] as Array<Record<string, unknown>>,
        chartAnimations: [] as Array<Record<string, unknown>>,
        toolsUsed: ["clickhouse analytics"]
      },
      modelTrace: null
    };
  }

  const normalized = rows.map((row) => ({
    month: row.month,
    avg_close: row.metric_value,
    avg_range: row.avg_range,
    total_volume: row.total_volume,
    count: row.count
  }));
  const summary = summarizeMonthlyAggregates(normalized);
  const topMonth = summary.highestMonth?.month ?? "N/A";
  const lowMonth = summary.lowestMonth?.month ?? "N/A";

  const chart: AssistantChart | null = includeVisualization
      ? {
        id: `monthly-${Date.now()}`,
        template: metric === "monthly_volume" ? "monthly_volume" : "monthly_avg_close",
        title: metric === "monthly_volume" ? "Monthly Volume" : "Monthly Average Price",
        subtitle: `${rows.length} months`,
        mode: "static",
        data: rows.map((row) => ({
          month: row.month,
          value: Number(row.metric_value.toFixed(4)),
          avgRange: Number(row.avg_range.toFixed(4)),
          volume: Number(row.total_volume.toFixed(2))
        })),
        config: {
          xKey: "month",
          yKey: "value"
        }
      }
    : null;

  const action: Record<string, unknown> | null = includeVisualization
    ? {
        type: "move_to_date",
        time:
          rows.length > 0
            ? new Date(`${rows[rows.length - 1]!.month}-01T00:00:00.000Z`).getTime()
            : undefined,
        label: "Monthly aggregate focus"
      }
    : null;

  return {
    status: "ok" as const,
    response: {
      cannotAnswer: false,
      cannotAnswerReason: "",
      shortAnswer:
        metric === "monthly_volume"
          ? `Monthly volume computed from ClickHouse for ${rows.length} months.`
          : `Monthly average price computed from ClickHouse for ${rows.length} months.`,
      bullets: [
        {
          tone: "black" as const,
          text:
            metric === "monthly_volume"
              ? `**Months analyzed:** ${rows.length} • **Total volume:** ${summary.totalVolume.toLocaleString("en-US")}`
              : `**Global monthly mean price:** ${summary.globalAvgClose.toFixed(4)}`
        },
        {
          tone: "green" as const,
          text:
            metric === "monthly_volume"
              ? `**Highest activity month:** ${topMonth}`
              : `**Highest avg month:** ${topMonth} (${summary.highestMonth?.avgClose?.toFixed(4) ?? "N/A"})`
        },
        {
          tone: "red" as const,
          text:
            metric === "monthly_volume"
              ? `**Lowest activity month:** ${lowMonth}`
              : `**Lowest avg month:** ${lowMonth} (${summary.lowestMonth?.avgClose?.toFixed(4) ?? "N/A"})`
        }
      ],
      charts: chart ? [chart] : [],
      chartActions: action ? [action] : [],
      chartAnimations: [],
      toolsUsed: includeVisualization
        ? ["clickhouse analytics", "chart actions"]
        : ["clickhouse analytics"]
    },
    modelTrace: null,
    dataTrace: {
      usedClickhouse: true,
      mode: "monthly_aggregate",
      metric,
      rows: rows.length
    }
  };
};

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const turns = normalizeChatTurns(body.messages);
  const context = normalizeContext(body.context);

  if (turns.length === 0) {
    return NextResponse.json({ error: "At least one user message is required." }, { status: 400 });
  }

  const apiKey =
    process.env.NEBIUS_API_KEY ||
    process.env.TOKENFACTORY_API_KEY ||
    process.env.AI_API_KEY ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      buildFallbackFailureResponse(
        "I cannot answer because the Nebius API key is not configured on the server."
      ),
      { status: 200 }
    );
  }

  const baseUrl = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1";
  const lastUserPrompt = getLastUserPrompt(turns);
  const explicitDrawRequest = DRAW_WORD_RE.test(lastUserPrompt);
  const wantsVisualization = VISUAL_REQUEST_RE.test(lastUserPrompt);
  const wantsAnimation = ANIMATION_REQUEST_RE.test(lastUserPrompt);
  const deterministicIntent = detectDeterministicIntent(lastUserPrompt);

  if (deterministicIntent.type !== "none") {
    try {
      return NextResponse.json(
        await buildDeterministicMonthlyResponse({
          request,
          context,
          intent: deterministicIntent,
          includeVisualization: wantsVisualization
        })
      );
    } catch (error) {
      return NextResponse.json(
        buildFallbackFailureResponse(
          error instanceof Error
            ? `I cannot answer due to deterministic analytics error: ${error.message}`
            : "I cannot answer due to deterministic analytics error."
        ),
        { status: 200 }
      );
    }
  }

  try {
    const toolsUsed = new Set<string>();
    if (context.liveCandles.length > 0) {
      toolsUsed.add("live_stream_data");
    }

    const modelsCatalog = await fetchNebiusModelCatalog({
      apiKey,
      baseUrl
    });
    const modelSelection = pickNebiusModels(modelsCatalog);

    const toolState: ToolState = {
      clickhouseCandles: [],
      clickhouseMeta: null,
      requestedBacktestData: false
    };

    const planningResult = await executePlanningStage({
      apiKey,
      baseUrl,
      model: modelSelection.instruction,
      turns,
      context,
      request,
      toolState
    });

    if (planningResult.status === "needs_backtest_data") {
      toolsUsed.add("backtest_data_request");
      return NextResponse.json({
        status: "needs_backtest_data",
        reason:
          planningResult.reason ||
          "Detailed backtest data is required to answer accurately.",
        request: {
          type: "backtest_trades"
        },
        response: {
          toolsUsed: Array.from(toolsUsed).map(normalizeToolLabel)
        },
        modelTrace: null
      });
    }

    const shouldAutofetchClickhouse =
      toolState.clickhouseCandles.length === 0 &&
      (Boolean(planningResult.planning.needsClickhouseData) || isTechnicalDrawRequest(lastUserPrompt));

    if (shouldAutofetchClickhouse) {
      const autoQuery = buildAutoClickhouseQuery({
        context,
        prompt: lastUserPrompt,
        planningQuery: planningResult.planning.clickhouseQuery
      });

      try {
        const result = await fetchClickhouseCandles(request, autoQuery);
        toolState.clickhouseCandles = result.candles;
        toolState.clickhouseMeta = {
          pair: result.pair,
          timeframe: result.timeframe,
          count: result.candles.length
        };

        planningResult.planning.needsClickhouseData = true;
        planningResult.planning.clickhouseQuery = autoQuery;
        toolsUsed.add("clickhouse_candles");
      } catch {
        // Continue to reasoning stage; it will handle insufficient data safely.
      }
    }

    const reasoning = await executeReasoningStage({
      apiKey,
      baseUrl,
      models: modelSelection,
      turns,
      context,
      toolState,
      planning: planningResult.planning
    });

    const codingResult = await executeCodingStage({
      apiKey,
      baseUrl,
      models: modelSelection,
      reasoning,
      context,
      toolState,
      wantsAnimation
    });

    if (toolState.clickhouseCandles.length > 0) {
      toolsUsed.add("clickhouse_candles");
    }

    const charts = wantsVisualization
      ? buildChartsFromPlans(codingResult.chartPlans, context, toolState)
      : [];
    let chartActions = codingResult.chartActions;
    if (explicitDrawRequest) {
      const drawCandles = getDrawWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      });
      const dataAnchoredDrawActions = buildDrawActionsFromPrompt({
        prompt: lastUserPrompt,
        candles: drawCandles
      });
      chartActions = normalizeChartActions([
        { type: "clear_annotations" },
        ...dataAnchoredDrawActions
      ]);
      chartActions = sanitizeDrawActionsAgainstCandles({
        actions: chartActions,
        candles: drawCandles
      });
    }

    if (wantsAnimation && chartActions.length === 0) {
      chartActions = normalizeChartActions(
        buildDefaultAnimationActions(
          getDrawWindowCandles({
            context,
            clickhouseCandles: toolState.clickhouseCandles
          })
        )
      );
    }

    let chartAnimations = codingResult.chartAnimations;
    if (wantsAnimation && chartAnimations.length === 0) {
      const fallbackAnimation = buildFallbackChartAnimation({
        title: "Chart Animation",
        summary: "Sequential replay on chart with drawn tools and level annotations.",
        actions: chartActions,
        theme: "gold"
      });
      chartAnimations = fallbackAnimation ? [fallbackAnimation] : [];
    }

    if (chartActions.length > 0) {
      toolsUsed.add("chart_actions");
    }
    if (chartAnimations.length > 0) {
      toolsUsed.add("chart_animation");
    }
    const usedClickhouseData = toolState.clickhouseCandles.length > 0;
    const isDrawOnlyRequest = explicitDrawRequest && !wantsVisualization;
    const drawSummary = summarizeDrawnActions(chartActions);
    const shortAnswer = explicitDrawRequest
      ? drawSummary ||
        (isDrawOnlyRequest
          ? reasoning.cannotAnswer
            ? reasoning.cannotAnswerReason
            : sanitizeAssistantText(reasoning.shortAnswer || "Draw request completed.")
          : sanitizeAssistantText(reasoning.shortAnswer))
      : sanitizeAssistantText(reasoning.shortAnswer);

    const finalBullets = isDrawOnlyRequest
      ? []
      : reasoning.bullets.length > 0
        ? reasoning.bullets
        : reasoning.cannotAnswer
          ? [{ tone: "gold" as const, text: reasoning.cannotAnswerReason }]
          : [];

    // Ensure request-scope data is explicitly released after shaping response.
    toolState.clickhouseCandles = [];

    return NextResponse.json({
      status: "ok",
      response: {
        cannotAnswer: reasoning.cannotAnswer,
        cannotAnswerReason: reasoning.cannotAnswerReason,
        shortAnswer,
        bullets: finalBullets,
        charts,
        chartActions,
        chartAnimations,
        toolsUsed: Array.from(toolsUsed).map(normalizeToolLabel)
      },
      modelTrace: null,
      dataTrace: {
        usedClickhouse: usedClickhouseData,
        clickhouseMeta: toolState.clickhouseMeta,
        backtestDataIncluded: context.backtest.dataIncluded,
        historyRows: context.historyRows.length,
        backtestRows: context.backtest.trades.length,
        candleRows: context.liveCandles.length
      }
    });
  } catch (error) {
    return NextResponse.json(
      buildFallbackFailureResponse(
        error instanceof Error
          ? `I cannot answer due to an assistant runtime error: ${error.message}`
          : "I cannot answer due to an assistant runtime error."
      ),
      { status: 200 }
    );
  }
}
