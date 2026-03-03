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
  GRAPH_TEMPLATE_ID_SET,
  listGraphTemplatesForPrompt,
  normalizeChartAnimationsFromCoding,
  normalizeChartActions,
  resolveGraphTemplate
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
  needsInternetData?: boolean;
  internetQuery?: {
    query?: string;
    recencyDays?: number;
    maxResults?: number;
    reason?: string;
  };
};

type InternetResultItem = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

type InternetContext = {
  query: string;
  provider: "serper" | "duckduckgo";
  fetchedAt: string;
  results: InternetResultItem[];
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

type DataAnalysisOutput = {
  summary: string;
  keyFindings: string[];
  suggestedIndicatorFocus: string[];
  confidence: number;
};

type IndicatorCodingPlan = {
  indicator: string;
  output: "snapshot" | "series";
  params: Record<string, number>;
  minCandles: number;
};

type IndicatorCodingResult = {
  computed: Record<string, unknown>;
  computedAny: boolean;
  requiredMinCandles: number;
  needsMoreData: boolean;
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
  internetContext: InternetContext | null;
};

type RequestMode = "natural" | "graph" | "draw" | "animation";

type RequestModePlan = {
  mode: RequestMode;
  wantsNaturalOnly: boolean;
  wantsVisualization: boolean;
  wantsDraw: boolean;
  wantsAnimation: boolean;
  needsClickhouseHint: boolean;
  clickhouseCountHint: number | null;
  needsBacktestHint: boolean;
  strictToRequest: boolean;
};

type IntentExecutionPlan = {
  graphNeeded: boolean;
  graphType: string;
  drawNeeded: boolean;
  animationNeeded: boolean;
  naturalOnly: boolean;
  needsClickhouse: boolean;
  clickhouseCount: number | null;
  needsBacktest: boolean;
  strictToRequest: boolean;
};

type ChecklistArtifact = "natural" | "graph" | "draw" | "animation" | "data" | "scope";

type RequestChecklistTemplateItem = {
  id: string;
  label: string;
  required: boolean;
  artifact: ChecklistArtifact;
};

type RequestChecklistPlan = {
  requestKind: "social" | "task";
  requiresNaturalResponse: boolean;
  requiresGraph: boolean;
  requiresDraw: boolean;
  requiresAnimation: boolean;
  shouldAvoidDataFetch: boolean;
  strictToRequest: boolean;
  items: RequestChecklistTemplateItem[];
  source: "instruction_model" | "fallback";
};

type RequestChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  satisfied: boolean;
};

type InstructionChecklistAudit = {
  allowBullets: boolean;
  allowCharts: boolean;
  allowDrawings: boolean;
  allowAnimations: boolean;
  shortAnswer: string;
  bullets: Array<{ tone: "green" | "red" | "gold" | "black"; text: string }>;
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
const INDICATOR_REQUEST_RE =
  /\b(rsi|overbought|oversold|over bought|over sold|macd|stoch|stochastic|ema|sma|moving average|atr|indicator)\b/i;
const SOCIAL_GREETING_RE =
  /^(hi|hello|hey|yo|sup|what'?s up|how are you|gm|gn|good morning|good afternoon|good evening)[!.?\s]*$/i;
const TRADING_REQUEST_RE =
  /\b(trade|trading|chart|graph|draw|support|resistance|trend|line|box|fvg|arrow|ruler|candle|candlestick|price|xau|xauusd|gold|rsi|macd|ema|sma|atr|indicator|backtest|history|pnl|risk|entry|stop|target|buy|sell|volume|volatility)\b/i;
const INTERNET_CONTEXT_RE =
  /\b(news|headline|headlines|macro|calendar|event|cpi|nfp|fomc|fed|interest rate|yield|dxy|geopolitical|war|sanction|breaking|latest|today|internet|web)\b/i;

const AI_SYSTEM_PROMPT = [
  "You are Gideon, a trading copilot.",
  "Rules:",
  "1) Be concise, direct, and natural.",
  "2) Sound human and conversational, not robotic.",
  "2b) Answer only what the user asked. Do not add extra sections or advice unless requested.",
  "2c) If the request is ambiguous and blocks execution, ask one concise clarifying question.",
  "3) Never invent facts. If data is insufficient, explicitly say so.",
  "4) If needed, use tools to fetch only necessary data.",
  "4b) If the request needs external web/news context, use internet search tools and cite only fetched facts.",
  "5) Default to the most recent data window unless the user explicitly asks for past/historical dates.",
  "6) Never ask the user to run data-fetch steps manually; fetch required data yourself.",
  "7) Use chart hints only when visual clarity helps the user request.",
  "8) Treat user intent as trading analytics and risk-aware guidance, not guaranteed outcomes.",
  "9) If the user sends a pure greeting/small-talk message with no trading request, reply briefly and naturally.",
  "10) Do not add market analysis, indicators, charts, drawings, or animations unless requested."
].join("\n");

const PLANNING_PROMPT = [
  "Return only JSON with this shape:",
  '{"needsBacktestData":boolean,"backtestReason":string,"needsClickhouseData":boolean,"clickhouseQuery":{"pair":string,"timeframe":string,"count":number,"start":string,"end":string,"reason":string},"needsInternetData":boolean,"internetQuery":{"query":string,"recencyDays":number,"maxResults":number,"reason":string}}',
  "Set needsBacktestData=true only when backtest has run but detailed rows are missing and required.",
  "Set needsClickhouseData=true only when current candle/history context is not enough.",
  "Set needsInternetData=true only when external/public web data is required to answer.",
  "Use a recent-window query by default. Set start/end only when the user explicitly asks for past/historical/date ranges.",
  "For recent-window queries, anchor end to the current runtime date/time.",
  "Do not tell the user to fetch data manually; produce a concrete clickhouseQuery instead.",
  "If no query needed, set clickhouseQuery to null.",
  "If no web query is needed, set internetQuery to null."
].join("\n");

const MODE_CLASSIFIER_PROMPT = [
  "Return only JSON with this shape:",
  '{"mode":"natural|graph|draw|animation","confidence":number,"requires":{"text":boolean,"panelGraph":boolean,"chartDraw":boolean,"animation":boolean},"toolHints":{"needsClickhouse":boolean,"clickhouseCount":number,"needsBacktest":boolean},"quality":{"strictToRequest":boolean},"reason":string}',
  "Classify by user intent semantics, not keyword matching.",
  "Mode definitions:",
  "- natural: text answer only (no chart drawing/animation required).",
  "- graph: chart(s) inside assistant panel.",
  "- draw: annotate the main trading chart with tools/levels.",
  "- animation: replay/video-like chart action sequence.",
  "If the user asks where support/resistance areas are on chart, pick draw.",
  "If the user asks for replay/step-by-step visual sequence, pick animation.",
  "If the user asks to visualize metric trend in panel chart, pick graph."
].join("\n");

const INTENT_EXECUTION_PROMPT = [
  "Return only JSON with this shape:",
  '{"graphNeeded":boolean,"graphType":string,"drawNeeded":boolean,"animationNeeded":boolean,"naturalOnly":boolean,"needsClickhouse":boolean,"clickhouseCount":number,"needsBacktest":boolean,"strictToRequest":boolean,"reason":string}',
  "Pipeline objective: optimize fulfillment quality and efficiency.",
  "Step 1: decide if a graph is needed.",
  "Step 2: if graphNeeded=true, infer the graph type the user most likely wants.",
  "Step 3: decide if chart drawings are needed.",
  "Step 4: decide if animation is needed.",
  "Step 5: decide minimal required data/tools.",
  "Choose only what is necessary for the user's exact request."
].join("\n");

const GRAPH_TOOLBOX_RESOLUTION_PROMPT = [
  "Return only JSON with this shape:",
  '{"resolvedTemplate":string,"needsNewTooling":boolean,"reason":string}',
  "Use the requested graph intent and the available toolbox templates.",
  "If requested graph exists, return that template id.",
  "If it does not exist, choose the closest template id that can fulfill the request.",
  "Set needsNewTooling=true only when no available template can reasonably fulfill intent."
].join("\n");

const CHECKLIST_AUTHOR_PROMPT = [
  "Return only JSON with this shape:",
  '{"requestKind":"social|task","strictToRequest":boolean,"items":[{"id":string,"label":string,"required":boolean,"artifact":"natural|graph|draw|animation|data|scope"}]}',
  "Author a concise checklist from the user's latest request intent.",
  "Include only necessary items. Use 3 to 7 checklist items.",
  "Set required=true only when the item is required for fulfilling the request."
].join("\n");

const CHECKLIST_AUDIT_PROMPT = [
  "Return only JSON with this shape:",
  '{"allowBullets":boolean,"allowCharts":boolean,"allowDrawings":boolean,"allowAnimations":boolean,"shortAnswer":string,"bullets":[{"tone":"green|red|gold|black","text":string}],"removeExtras":boolean,"reason":string}',
  "Audit candidate response against checklist and user request.",
  "If an artifact was not requested, set corresponding allow* to false.",
  "ShortAnswer must be concise, direct, and free of extra details.",
  "Bullets are optional; include only when they materially help the exact request."
].join("\n");

const DATA_ANALYSIS_PROMPT = [
  "Return only JSON with this shape:",
  '{"summary":string,"keyFindings":[string],"suggestedIndicatorFocus":[string],"confidence":number}',
  "Analyze only the provided market/trade data and recent candle window.",
  "If internetContext is present, include only concrete facts from those results.",
  "Do not invent missing values.",
  "Keep summary concise and trading-focused.",
  "Provide up to 4 keyFindings."
].join("\n");

const INDICATOR_CODING_PROMPT = [
  "Return only JSON with this shape:",
  '{"plans":[{"indicator":string,"output":"snapshot|series","params":{"fast":number,"slow":number,"signal":number,"period":number,"k":number,"d":number},"minCandles":number}]}',
  "You are the coding model deciding how to compute requested indicators from candle OHLCV data.",
  "Only include plans for indicators explicitly requested by the user.",
  "Use standard defaults unless user asks otherwise:",
  "- macd: fast=12, slow=26, signal=9, minCandles>=40",
  "- rsi: period=14, minCandles>=period+2",
  "- ema/sma: period=20 unless specified",
  "- atr: period=14",
  "- stochastic: k=14, d=3",
  "If multiple indicators are requested, return multiple plans."
].join("\n");

const REASONING_PROMPT = [
  "Return only JSON with this shape:",
  '{"cannotAnswer":boolean,"cannotAnswerReason":string,"shortAnswer":string,"bullets":[{"tone":"green|red|gold|black","text":string}],"chartHints":[{"template":"equity_curve|pnl_distribution|session_performance|trade_outcomes|price_action|action_timeline|auto","title":string,"reason":string,"source":"history|backtest|candles|clickhouse|actions","priority":number}]}',
  "Write shortAnswer in a natural human voice, concise and direct.",
  "Keep bullets concise and actionable. Use max 3 bullets unless the user explicitly asks for detail.",
  "Do not add extra information beyond the user request.",
  "Never tell the user to run/fetch tools manually.",
  "Use provided indicators when available (e.g., RSI 14 for overbought/oversold requests).",
  "Only compute indicators when the user explicitly asks for them.",
  "If codingComputedIndicators is provided, treat it as authoritative computed indicator data.",
  "When giving numeric price levels, anchor them to recentWindow latest close/time and runtimeClock recency.",
  "If runtimeClock indicates stale market data, avoid specific price levels and say the live window is stale.",
  "If internetContext is provided, use only that fetched context and do not invent external facts.",
  "Use requestChecklist to enforce scope. If requestChecklist.requestKind='social', return a brief natural reply with no analytics, no bullets, and no chart hints.",
  "Before setting cannotAnswer=true, attempt to answer using available context and indicator snapshots.",
  "If data is insufficient, set cannotAnswer=true and explain why.",
  "Never say phrases like 'in the information provided'.",
  "Do not include markdown code fences."
].join("\n");

const SPEAKER_PROMPT = [
  "You are Gideon, the user-facing speaker.",
  "Return plain text only (no JSON).",
  "Style: natural, conversational, and direct.",
  "Do not sound robotic.",
  "Never output <think> tags or private reasoning.",
  "Never use stage directions or roleplay text (for example: *smiles*, *laughs*, [nods]).",
  "Never ask about the user's day, mood, or personal life.",
  "Stay strictly in trading context.",
  "Answer exactly what the user asked and keep it concise.",
  "If marketAnchor is provided, avoid stale price levels and keep any price references aligned to that current range.",
  "When the user asks broad guidance (for example, 'what should I do?'), give a clear immediate next step in plain language.",
  "Any follow-up question must be trading-specific only.",
  "Use analysis inputs as facts; do not invent data.",
  "Never say phrases like 'in the information provided'.",
  "Do not mention tools, models, prompts, or internal pipeline."
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
    "Only choose templates/actions relevant to the request.",
    "Respect requiredArtifacts from input JSON.",
    "If requiredArtifacts.drawings=true, return at least one drawable chart action.",
    "If requiredArtifacts.graphs=true, return at least one chart plan.",
    "If requiredArtifacts.animation=true, return at least one chart animation.",
    "If requestedGraphType is missing from toolbox, synthesize closest equivalent using available templates."
  ].join("\n");

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const normalizeTimestampMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const abs = Math.abs(value);
  if (abs < 1e11) {
    // Seconds -> milliseconds.
    return Math.trunc(value * 1000);
  }
  if (abs > 1e15) {
    // Microseconds/nanoseconds -> milliseconds.
    return Math.trunc(value / 1000);
  }
  return Math.trunc(value);
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

const toBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
};

const stripRoleplayAndPersonalTalk = (value: string): string => {
  return value
    .replace(/\*(?:\s*[a-z][^*\n]{0,80})\*/gi, " ")
    .replace(/\[(?:\s*[a-z][^\]\n]{0,80})\]/gi, " ")
    .replace(
      /\bhow are you(?:\s+(?:doing|feeling))?(?:\s+today)?\??/gi,
      " "
    )
    .replace(/\bhow'?s your day(?:\s+going)?\??/gi, " ")
    .replace(/\bhope you(?:'re| are)\s+doing\s+well\b/gi, " ");
};

const stripPrivateReasoning = (value: string): string => {
  return value
    .replace(/<\s*think\b[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi, " ")
    .replace(/<\s*analysis\b[^>]*>[\s\S]*?<\s*\/\s*analysis\s*>/gi, " ")
    .replace(/<\s*reasoning\b[^>]*>[\s\S]*?<\s*\/\s*reasoning\s*>/gi, " ")
    .replace(/```(?:think|analysis|reasoning)[\s\S]*?```/gi, " ")
    .replace(/^\s*(?:think|analysis|reasoning)\s*:\s*[\s\S]*?(?:\n{2,}|$)/gi, " ");
};

const sanitizeAssistantText = (value: string): string => {
  return stripPrivateReasoning(value)
    .replace(/^\s*(?:okay|alright|sure)[,:\-\s]+/i, "")
    .replace(/^\s*(?:greetings|hey there)[,:\-\s]+/i, "")
    .replace(/^\s*hi[,:\-\s]+/i, "Hi. ")
    .replace(/^\s*hello[,:\-\s]+/i, "Hello. ")
    .replace(/^\s*hey[,:\-\s]+/i, "Hey. ")
    .replace(/^\s*good\s+(?:morning|afternoon|evening)[,:\-\s]+/i, "")
    .replace(/\bin\s+the\s+information\s+provided\b/gi, "")
    .replace(/\bwith\s+the\s+information\s+provided\b/gi, "")
    .replace(/\bfrom\s+the\s+information\s+provided\b/gi, "")
    .replace(/<\s*\/?\s*think\s*>/gi, " ")
    .replace(/run\s*contains\s*:\s*false/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const sanitizeDeliveryText = (value: string): string => {
  return stripRoleplayAndPersonalTalk(sanitizeAssistantText(value))
    .replace(/<\s*\/?\s*think\s*>/gi, " ")
    .replace(/run\s*contains\s*:\s*false/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    const time = normalizeTimestampMs(toNumber(raw.time));
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
  const date = new Date(normalizeTimestampMs(timestampMs));
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

const isIndicatorComputationRequest = (prompt: string): boolean => {
  const text = toText(prompt, "");
  if (!text) {
    return false;
  }
  if (!INDICATOR_REQUEST_RE.test(text)) {
    return false;
  }
  if (DRAW_WORD_RE.test(text)) {
    return false;
  }
  return true;
};

const isSocialOnlyPrompt = (prompt: string): boolean => {
  const text = toText(prompt, "").trim();
  if (!text) {
    return false;
  }

  if (TRADING_REQUEST_RE.test(text) || /\d/.test(text)) {
    return false;
  }

  if (SOCIAL_GREETING_RE.test(text)) {
    return true;
  }

  const normalized = text.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const shortMessage = words.length > 0 && words.length <= 6;
  const hasGreetingToken = /\b(hi|hello|hey|gm|gn|sup)\b/i.test(normalized);
  return shortMessage && hasGreetingToken;
};

const isChartControlRequest = (prompt: string): boolean => {
  const text = toText(prompt, "").toLowerCase();
  if (!text) {
    return false;
  }

  const adjustIntent =
    /\b(adjust|move|shift|nudge|edit|update|reposition|offset)\b/.test(text) &&
    /\b(draw|drawing|drawings|line|lines|level|levels|annotation|annotations|support|resistance)\b/.test(
      text
    );

  const dynamicIntent =
    /\b(dynamic|indicator|auto)\b/.test(text) &&
    /\b(draw|line|trendline|trend line|box|fvg|fair value gap|arrow|ruler|support|resistance|s\/r|mark|position)\b/.test(
      text
    );

  return adjustIntent || dynamicIntent;
};

const buildRequestModePlan = (mode: RequestMode): RequestModePlan => {
  return {
    mode,
    wantsNaturalOnly: mode === "natural",
    wantsVisualization: mode === "graph" || mode === "animation",
    wantsDraw: mode === "draw",
    wantsAnimation: mode === "animation",
    needsClickhouseHint: false,
    clickhouseCountHint: null,
    needsBacktestHint: false,
    strictToRequest: true
  };
};

const buildFallbackExecutionPlan = (modePlan: RequestModePlan): IntentExecutionPlan => {
  return {
    graphNeeded: modePlan.wantsVisualization,
    graphType: "",
    drawNeeded: modePlan.wantsDraw,
    animationNeeded: modePlan.wantsAnimation,
    naturalOnly: modePlan.wantsNaturalOnly,
    needsClickhouse: modePlan.needsClickhouseHint,
    clickhouseCount: modePlan.clickhouseCountHint,
    needsBacktest: modePlan.needsBacktestHint,
    strictToRequest: modePlan.strictToRequest
  };
};

const buildRequestChecklistPlan = (params: {
  socialOnlyRequest: boolean;
  strictToRequest: boolean;
  wantsNaturalOnly: boolean;
  wantsVisualization: boolean;
  explicitDrawRequest: boolean;
  wantsAnimation: boolean;
}): RequestChecklistPlan => {
  const {
    socialOnlyRequest,
    strictToRequest,
    wantsNaturalOnly,
    wantsVisualization,
    explicitDrawRequest,
    wantsAnimation
  } = params;

  const items: RequestChecklistTemplateItem[] = [
    {
      id: "intent",
      label: socialOnlyRequest ? "Intent: social conversation" : "Intent: task request",
      required: true,
      artifact: "scope"
    },
    {
      id: "natural",
      label: "Natural-language reply",
      required: true,
      artifact: "natural"
    }
  ];

  if (socialOnlyRequest) {
    items.push({
      id: "social_scope",
      label: "No market artifacts for social request",
      required: true,
      artifact: "scope"
    });
  } else {
    if (wantsVisualization) {
      items.push({
        id: "graph",
        label: "Provide requested panel graph",
        required: true,
        artifact: "graph"
      });
    }
    if (explicitDrawRequest) {
      items.push({
        id: "draw",
        label: "Provide requested chart drawings",
        required: true,
        artifact: "draw"
      });
    }
    if (wantsAnimation) {
      items.push({
        id: "animation",
        label: "Provide requested animation",
        required: true,
        artifact: "animation"
      });
    }
    items.push({
      id: "scope",
      label: "No unrequested extras",
      required: strictToRequest,
      artifact: "scope"
    });
    items.push({
      id: "data",
      label: "Use only necessary data fetch",
      required: true,
      artifact: "data"
    });
  }

  return {
    requestKind: socialOnlyRequest ? "social" : "task",
    requiresNaturalResponse: true,
    requiresGraph: !socialOnlyRequest && wantsVisualization,
    requiresDraw: !socialOnlyRequest && explicitDrawRequest,
    requiresAnimation: !socialOnlyRequest && wantsAnimation,
    shouldAvoidDataFetch:
      socialOnlyRequest ||
      (wantsNaturalOnly && !wantsVisualization && !explicitDrawRequest && !wantsAnimation),
    strictToRequest,
    items: items.slice(0, 7),
    source: "fallback"
  };
};

const buildResponseChecklist = (params: {
  plan: RequestChecklistPlan;
  shortAnswer: string;
  responseCannotAnswer: boolean;
  charts: AssistantChart[];
  chartActions: ReturnType<typeof normalizeChartActions>;
  chartAnimations: ReturnType<typeof normalizeChartAnimationsFromCoding>;
  toolsUsed: Set<string>;
}): RequestChecklistItem[] => {
  const { plan, shortAnswer, responseCannotAnswer, charts, chartActions, chartAnimations, toolsUsed } = params;
  const responseHasText = shortAnswer.trim().length > 0 || responseCannotAnswer;
  const usedDataTools =
    toolsUsed.has("clickhouse_candles") ||
    toolsUsed.has("backtest_data_request") ||
    toolsUsed.has("internet_search");
  const unrequestedVisuals =
    (!plan.requiresGraph && charts.length > 0) ||
    (!plan.requiresDraw && chartActions.length > 0) ||
    (!plan.requiresAnimation && chartAnimations.length > 0);
  const resolveArtifactSatisfied = (artifact: ChecklistArtifact): boolean => {
    if (artifact === "natural") {
      return responseHasText;
    }
    if (artifact === "graph") {
      return plan.requiresGraph ? charts.length > 0 : charts.length === 0;
    }
    if (artifact === "draw") {
      return plan.requiresDraw ? chartActions.length > 0 : chartActions.length === 0;
    }
    if (artifact === "animation") {
      return plan.requiresAnimation ? chartAnimations.length > 0 : chartAnimations.length === 0;
    }
    if (artifact === "data") {
      return !plan.shouldAvoidDataFetch || !usedDataTools;
    }
    return !plan.strictToRequest || (!unrequestedVisuals && (!plan.shouldAvoidDataFetch || !usedDataTools));
  };

  const items = plan.items.length > 0 ? plan.items : buildRequestChecklistPlan({
    socialOnlyRequest: plan.requestKind === "social",
    strictToRequest: plan.strictToRequest,
    wantsNaturalOnly: !plan.requiresGraph && !plan.requiresDraw && !plan.requiresAnimation,
    wantsVisualization: plan.requiresGraph,
    explicitDrawRequest: plan.requiresDraw,
    wantsAnimation: plan.requiresAnimation
  }).items;

  return items.slice(0, 7).map((item) => ({
    id: item.id,
    label: item.label,
    required: item.required,
    satisfied: item.required ? resolveArtifactSatisfied(item.artifact) : true
  }));
};

const normalizeGraphTypeCandidate = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const resolveToolboxGraphTemplate = (value: string): string | null => {
  const normalized = normalizeGraphTypeCandidate(value);
  if (!normalized) {
    return null;
  }

  if (GRAPH_TEMPLATE_ID_SET.has(normalized)) {
    return normalized;
  }

  const compact = normalized.replace(/_/g, "");
  for (const templateId of GRAPH_TEMPLATE_ID_SET) {
    if (templateId.replace(/_/g, "") === compact) {
      return templateId;
    }
  }

  return null;
};

const normalizeChecklistArtifact = (value: unknown): ChecklistArtifact | null => {
  const token = toText(value, "").trim().toLowerCase();
  if (!token) {
    return null;
  }

  if (token === "natural" || token === "text" || token === "reply") {
    return "natural";
  }
  if (token === "graph" || token === "chart" || token === "panel_graph") {
    return "graph";
  }
  if (token === "draw" || token === "drawing" || token === "chart_draw") {
    return "draw";
  }
  if (token === "animation" || token === "animate" || token === "replay") {
    return "animation";
  }
  if (token === "data" || token === "fetch" || token === "data_fetch") {
    return "data";
  }
  if (token === "scope" || token === "minimality" || token === "no_extras") {
    return "scope";
  }
  return null;
};

const normalizeRequestMode = (value: unknown): RequestMode | null => {
  const text = toText(value, "").trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (text === "natural" || text === "text" || text === "answer") {
    return "natural";
  }
  if (text === "graph" || text === "chart" || text === "visual") {
    return "graph";
  }
  if (text === "draw" || text === "drawing" || text === "annotate" || text === "annotation") {
    return "draw";
  }
  if (text === "animation" || text === "animate" || text === "replay" || text === "video") {
    return "animation";
  }

  return null;
};

const modeFromRequires = (value: unknown): RequestMode | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const wantsAnimation = Boolean(raw.animation);
  const wantsDraw = Boolean(raw.chartDraw);
  const wantsGraph = Boolean(raw.panelGraph);
  const wantsText = Boolean(raw.text);

  if (wantsAnimation) {
    return "animation";
  }
  if (wantsDraw) {
    return "draw";
  }
  if (wantsGraph) {
    return "graph";
  }
  if (wantsText) {
    return "natural";
  }
  return null;
};

const classifyRequestMode = (prompt: string): RequestModePlan => {
  const text = toText(prompt, "");
  const drawIntent =
    isTechnicalDrawRequest(text) ||
    DRAW_WORD_RE.test(text) ||
    /\b(mark|annotate|plot)\b/i.test(text) ||
    isChartControlRequest(text);
  const animationIntent = ANIMATION_REQUEST_RE.test(text);
  const graphIntent = VISUAL_REQUEST_RE.test(text);

  let mode: RequestMode = "natural";
  if (animationIntent) {
    mode = "animation";
  } else if (drawIntent) {
    mode = "draw";
  } else if (graphIntent) {
    mode = "graph";
  }

  return buildRequestModePlan(mode);
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

const timeframeToMs = (timeframe: string): number => {
  const normalized = mapTimeframeToClickhouse(timeframe);
  const byTimeframe: Record<string, number> = {
    M1: 60_000,
    M5: 5 * 60_000,
    M15: 15 * 60_000,
    M30: 30 * 60_000,
    H1: 60 * 60_000,
    H4: 4 * 60 * 60_000,
    D: 24 * 60 * 60_000,
    W: 7 * 24 * 60 * 60_000,
    M: 30 * 24 * 60 * 60_000
  };
  return byTimeframe[normalized] ?? 15 * 60_000;
};

const getLatestCandleTimeMs = (candles: CandleRow[]): number | null => {
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }
  const latest = candles[candles.length - 1];
  if (!latest || !Number.isFinite(latest.time)) {
    return null;
  }
  return normalizeTimestampMs(latest.time);
};

const buildRuntimeClock = (params: {
  nowMs: number;
  context: AssistantContext;
  clickhouseCandles: CandleRow[];
}): Record<string, unknown> => {
  const { nowMs, context, clickhouseCandles } = params;
  const latestLiveTime = getLatestCandleTimeMs(context.liveCandles);
  const latestClickhouseTime = getLatestCandleTimeMs(clickhouseCandles);
  const mergedLatest = Math.max(latestLiveTime ?? 0, latestClickhouseTime ?? 0);
  const frameMs = timeframeToMs(context.timeframe);
  const freshnessBudgetMs = Math.max(frameMs * 3, 90_000);

  const liveAgeMs = latestLiveTime ? Math.max(0, nowMs - latestLiveTime) : null;
  const clickhouseAgeMs = latestClickhouseTime ? Math.max(0, nowMs - latestClickhouseTime) : null;
  const mergedAgeMs = mergedLatest > 0 ? Math.max(0, nowMs - mergedLatest) : null;

  return {
    nowIso: new Date(nowMs).toISOString(),
    nowEpochMs: nowMs,
    todayUtcDate: new Date(nowMs).toISOString().slice(0, 10),
    timeframeMs: frameMs,
    freshnessBudgetMs,
    live: {
      count: context.liveCandles.length,
      latestTime: latestLiveTime ? new Date(latestLiveTime).toISOString() : null,
      ageMs: liveAgeMs,
      isFresh: liveAgeMs !== null ? liveAgeMs <= freshnessBudgetMs : false
    },
    clickhouse: {
      count: clickhouseCandles.length,
      latestTime: latestClickhouseTime ? new Date(latestClickhouseTime).toISOString() : null,
      ageMs: clickhouseAgeMs,
      isFresh: clickhouseAgeMs !== null ? clickhouseAgeMs <= freshnessBudgetMs : false
    },
    merged: {
      latestTime: mergedLatest > 0 ? new Date(mergedLatest).toISOString() : null,
      ageMs: mergedAgeMs,
      isFresh: mergedAgeMs !== null ? mergedAgeMs <= freshnessBudgetMs : false
    }
  };
};

const buildAutoClickhouseQuery = (params: {
  context: AssistantContext;
  prompt: string;
  nowMs: number;
  planningQuery?: PlanningOutput["clickhouseQuery"];
}): PlanningOutput["clickhouseQuery"] => {
  const { context, prompt, planningQuery, nowMs } = params;
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
    end: historicalRequested ? toText(planningQuery?.end, "") : new Date(nowMs).toISOString(),
    reason: toText(planningQuery?.reason, "Targeted recent-window fetch for chart analysis.")
  };
};

const buildAutoInternetQuery = (params: {
  prompt: string;
  planningQuery?: PlanningOutput["internetQuery"];
}): NonNullable<PlanningOutput["internetQuery"]> => {
  const { prompt, planningQuery } = params;
  const defaultQuery = toText(prompt, "");
  const planningValue = planningQuery && typeof planningQuery === "object" ? planningQuery : {};
  return {
    query: toText(planningValue?.query, defaultQuery).slice(0, 220),
    recencyDays: clamp(Math.round(toNumber(planningValue?.recencyDays, 3)), 1, 30),
    maxResults: clamp(Math.round(toNumber(planningValue?.maxResults, 5)), 1, 8),
    reason: toText(planningValue?.reason, "External web context requested for this answer.").slice(0, 260)
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
  const withDynamicPrefix = (
    action: (typeof actions)[number],
    text: string
  ): string => {
    return action.dynamic ? `dynamic ${text}` : text;
  };

  for (const action of actions.slice(0, 6)) {
    if (action.type === "draw_support_resistance") {
      const support = describePrice(action.priceStart);
      const resistance = describePrice(action.priceEnd);
      descriptions.push(
        withDynamicPrefix(
          action,
          support && resistance
            ? `support ${support} / resistance ${resistance}`
            : "support/resistance levels"
        )
      );
      continue;
    }

    if (action.type === "draw_horizontal_line") {
      const price = describePrice(action.price);
      descriptions.push(withDynamicPrefix(action, price ? `horizontal level ${price}` : "horizontal level"));
      continue;
    }

    if (action.type === "draw_vertical_line") {
      const time = describeTime(action.time);
      descriptions.push(withDynamicPrefix(action, time ? `vertical marker at ${time}` : "vertical marker"));
      continue;
    }

    if (action.type === "draw_trend_line") {
      const start = describePrice(action.priceStart);
      const end = describePrice(action.priceEnd);
      descriptions.push(withDynamicPrefix(action, start && end ? `trend line ${start} -> ${end}` : "trend line"));
      continue;
    }

    if (action.type === "draw_box") {
      descriptions.push(withDynamicPrefix(action, action.label ? `box (${action.label})` : "box zone"));
      continue;
    }

    if (action.type === "draw_fvg") {
      descriptions.push(withDynamicPrefix(action, "fair value gap zone"));
      continue;
    }

    if (action.type === "draw_arrow") {
      descriptions.push(withDynamicPrefix(action, action.label ? `arrow (${action.label})` : "arrow marker"));
      continue;
    }

    if (action.type === "draw_long_position") {
      const entry = describePrice(action.entryPrice);
      descriptions.push(withDynamicPrefix(action, entry ? `long position (entry ${entry})` : "long position"));
      continue;
    }

    if (action.type === "draw_short_position") {
      const entry = describePrice(action.entryPrice);
      descriptions.push(withDynamicPrefix(action, entry ? `short position (entry ${entry})` : "short position"));
      continue;
    }

    if (action.type === "draw_ruler") {
      descriptions.push(withDynamicPrefix(action, "ruler measurement"));
      continue;
    }

    if (action.type === "mark_candlestick") {
      descriptions.push(
        withDynamicPrefix(action, action.note ? `marked candle (${action.note})` : "marked candle")
      );
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

    if (action.type === "adjust_previous_drawings") {
      const delta = Number.isFinite(action.priceDelta)
        ? `${action.priceDelta && action.priceDelta > 0 ? "+" : ""}${Number(action.priceDelta).toFixed(4)}`
        : "";
      descriptions.push(delta ? `adjusted previous drawings (${delta})` : "adjusted previous drawings");
      continue;
    }

    if (action.type === "toggle_dynamic_support_resistance") {
      descriptions.push(action.enabled === false ? "disabled dynamic support/resistance" : "enabled dynamic support/resistance");
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

type MarketPriceAnchor = {
  latestClose: number;
  bandLow: number;
  bandHigh: number;
  latestTimeIso: string;
  nowIso: string;
};

const buildMarketPriceAnchor = (params: {
  candles: CandleRow[];
  nowMs: number;
}): MarketPriceAnchor | null => {
  const { candles, nowMs } = params;
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }

  const recent = candles.slice(-Math.min(candles.length, 320));
  const latest = recent[recent.length - 1];
  if (!latest || !Number.isFinite(latest.close) || !Number.isFinite(latest.time)) {
    return null;
  }

  const closes = recent
    .map((row) => row.close)
    .filter((value) => Number.isFinite(value));
  if (closes.length === 0) {
    return null;
  }

  const bandLow = getPriceQuantile(closes, 0.2) ?? latest.close;
  const bandHigh = getPriceQuantile(closes, 0.8) ?? latest.close;

  return {
    latestClose: Number(latest.close.toFixed(4)),
    bandLow: Number(Math.min(bandLow, bandHigh).toFixed(4)),
    bandHigh: Number(Math.max(bandLow, bandHigh).toFixed(4)),
    latestTimeIso: new Date(normalizeTimestampMs(latest.time)).toISOString(),
    nowIso: new Date(nowMs).toISOString()
  };
};

const extractPriceCandidatesFromText = (text: string): number[] => {
  const matches = text.match(/\$?(?:\d{1,3}(?:,\d{3})+|\d{3,6})(?:\.\d+)?/g);
  if (!matches) {
    return [];
  }

  return matches
    .map((token) => Number(token.replace(/\$/g, "").replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 500 && value <= 20_000);
};

const hasOutOfRangePriceReference = (params: {
  text: string;
  anchor: MarketPriceAnchor | null;
}): boolean => {
  const { text, anchor } = params;
  if (!anchor) {
    return false;
  }

  if (!/\b(price|level|support|resistance|entry|target|stop|at)\b/i.test(text)) {
    return false;
  }

  const prices = extractPriceCandidatesFromText(text);
  if (prices.length === 0) {
    return false;
  }

  const toleranceFromBand = Math.max(
    (anchor.bandHigh - anchor.bandLow) * 1.7,
    anchor.latestClose * 0.35
  );

  return prices.some((value) => Math.abs(value - anchor.latestClose) > toleranceFromBand);
};

const inferCandleStepMs = (candles: CandleRow[]): number => {
  if (candles.length < 2) {
    return 60_000;
  }

  const diffs: number[] = [];
  for (let index = Math.max(1, candles.length - 40); index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current) {
      continue;
    }
    const delta = Math.trunc(current.time) - Math.trunc(previous.time);
    if (Number.isFinite(delta) && delta > 0) {
      diffs.push(delta);
    }
  }

  if (diffs.length === 0) {
    return 60_000;
  }

  diffs.sort((left, right) => left - right);
  const mid = Math.floor(diffs.length / 2);
  return Math.max(1_000, diffs[mid] ?? 60_000);
};

const parseAdjustIntentAction = (params: {
  prompt: string;
  candles: CandleRow[];
}): Record<string, unknown> | null => {
  const prompt = params.prompt.toLowerCase();
  const hasAdjustIntent = /\b(adjust|move|shift|nudge|edit|update|reposition|offset)\b/.test(prompt);
  const hasDrawTarget =
    /\b(drawing|drawings|line|lines|level|levels|annotation|annotations|support|resistance)\b/.test(
      prompt
    );

  if (!hasAdjustIntent || !hasDrawTarget) {
    return null;
  }

  let priceDelta = 0;
  const upMatch = prompt.match(/\b(?:up|higher|raise|increase)\s+(\d+(?:\.\d+)?)\b/);
  const downMatch = prompt.match(/\b(?:down|lower|decrease|reduce)\s+(\d+(?:\.\d+)?)\b/);
  const signedMatch = prompt.match(/\b(?:by|delta|offset)\s*(-?\d+(?:\.\d+)?)\b/);

  if (upMatch) {
    priceDelta = Number(upMatch[1]);
  } else if (downMatch) {
    priceDelta = -Number(downMatch[1]);
  } else if (signedMatch) {
    priceDelta = Number(signedMatch[1]);
  }

  const stepMs = inferCandleStepMs(params.candles);
  let timeDeltaMs = 0;
  const rightMatch = prompt.match(/\b(?:right|forward|ahead)\s+(\d+)\s*(?:bars?|candles?)\b/);
  const leftMatch = prompt.match(/\b(?:left|back|backward)\s+(\d+)\s*(?:bars?|candles?)\b/);
  const minuteForwardMatch = prompt.match(/\b(?:forward|ahead)\s+(\d+)\s*(?:m|min|minutes?)\b/);
  const minuteBackwardMatch = prompt.match(/\b(?:back|backward)\s+(\d+)\s*(?:m|min|minutes?)\b/);

  if (rightMatch) {
    timeDeltaMs = Number(rightMatch[1]) * stepMs;
  } else if (leftMatch) {
    timeDeltaMs = -Number(leftMatch[1]) * stepMs;
  } else if (minuteForwardMatch) {
    timeDeltaMs = Number(minuteForwardMatch[1]) * 60_000;
  } else if (minuteBackwardMatch) {
    timeDeltaMs = -Number(minuteBackwardMatch[1]) * 60_000;
  }

  let targetLabel = "";
  if (prompt.includes("support") && !prompt.includes("resistance")) {
    targetLabel = "support";
  } else if (prompt.includes("resistance") && !prompt.includes("support")) {
    targetLabel = "resistance";
  } else if (prompt.includes("trend")) {
    targetLabel = "trend";
  }

  return {
    type: "adjust_previous_drawings",
    priceDelta: Number.isFinite(priceDelta) ? Number(priceDelta.toFixed(4)) : undefined,
    timeDeltaMs: Number.isFinite(timeDeltaMs) ? Math.trunc(timeDeltaMs) : undefined,
    targetLabel: targetLabel || undefined
  };
};

const parseDynamicSupportResistanceControlAction = (prompt: string): Record<string, unknown> | null => {
  const normalized = prompt.toLowerCase();
  const mentionsDynamic =
    /\b(dynamic|indicator|auto)\b/.test(normalized) &&
    (normalized.includes("support") || normalized.includes("resistance") || normalized.includes("s/r"));
  if (!mentionsDynamic) {
    return null;
  }

  const isControlToggle = /\b(enable|disable|start|stop|off|on|remove)\b/.test(normalized);
  if (!isControlToggle) {
    return null;
  }

  const disableRequested =
    /\b(disable|off|stop|remove)\b/.test(normalized) &&
    /\b(dynamic|indicator|auto)\b/.test(normalized);
  const levelsMatch = normalized.match(/\b(\d+)\s*(?:levels?|lines?)\b/);
  const lookbackMatch = normalized.match(/\b(\d+)\s*(?:bars?|candles?)\b/);

  return {
    type: "toggle_dynamic_support_resistance",
    enabled: !disableRequested,
    levels: levelsMatch ? clamp(toNumber(levelsMatch[1], 3), 1, 8) : undefined,
    lookback: lookbackMatch ? clamp(toNumber(lookbackMatch[1], 0), 0, MAX_CLICKHOUSE_COUNT) : undefined
  };
};

const parseDynamicDrawAction = (params: {
  prompt: string;
  candles: CandleRow[];
}): Record<string, unknown> | null => {
  const normalized = params.prompt.toLowerCase();
  const hasDynamicIntent = /\b(dynamic|indicator|auto)\b/.test(normalized);
  if (!hasDynamicIntent) {
    return null;
  }

  const lookbackMatch = normalized.match(/\b(\d+)\s*(?:bars?|candles?)\b/);
  const levelsMatch = normalized.match(/\b(\d+)\s*(?:levels?|lines?)\b/);
  const dynamicLookback = lookbackMatch
    ? clamp(toNumber(lookbackMatch[1], 0), 0, MAX_CLICKHOUSE_COUNT)
    : undefined;
  const levels = levelsMatch ? clamp(toNumber(levelsMatch[1], 2), 1, 8) : undefined;
  const explicitPrice = extractPromptPrice(normalized);

  const baseAction: Record<string, unknown> = {
    dynamic: true,
    dynamicLookback
  };

  if (normalized.includes("support") || normalized.includes("resistance") || normalized.includes("s/r")) {
    return {
      ...baseAction,
      type: "draw_support_resistance",
      levels,
      label: "Dynamic S/R"
    };
  }

  if (normalized.includes("trendline") || normalized.includes("trend line")) {
    return {
      ...baseAction,
      type: "draw_trend_line",
      label: "Dynamic Trendline"
    };
  }

  if (normalized.includes("horizontal")) {
    return {
      ...baseAction,
      type: "draw_horizontal_line",
      price: explicitPrice ?? undefined,
      label: "Dynamic Horizontal Level"
    };
  }

  if (normalized.includes("vertical")) {
    return {
      ...baseAction,
      type: "draw_vertical_line",
      label: "Dynamic Vertical Marker"
    };
  }

  if (normalized.includes("box")) {
    return {
      ...baseAction,
      type: "draw_box",
      label: "Dynamic Box"
    };
  }

  if (normalized.includes("fvg") || normalized.includes("fair value gap")) {
    return {
      ...baseAction,
      type: "draw_fvg",
      label: "Dynamic FVG"
    };
  }

  if (normalized.includes("arrow")) {
    return {
      ...baseAction,
      type: "draw_arrow",
      markerShape: "arrowUp",
      label: "Dynamic Arrow"
    };
  }

  if (normalized.includes("long")) {
    return {
      ...baseAction,
      type: "draw_long_position",
      label: "Dynamic Long"
    };
  }

  if (normalized.includes("short")) {
    return {
      ...baseAction,
      type: "draw_short_position",
      label: "Dynamic Short"
    };
  }

  if (normalized.includes("ruler")) {
    return {
      ...baseAction,
      type: "draw_ruler",
      label: "Dynamic Ruler"
    };
  }

  if (normalized.includes("mark") || normalized.includes("candle")) {
    return {
      ...baseAction,
      type: "mark_candlestick",
      markerShape: "circle",
      note: "Dynamic candle marker"
    };
  }

  if (params.candles.length > 0) {
    return {
      ...baseAction,
      type: "draw_support_resistance",
      levels,
      label: "Dynamic S/R"
    };
  }

  return null;
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

  const dynamicControlAction = parseDynamicSupportResistanceControlAction(prompt);
  if (dynamicControlAction) {
    return [dynamicControlAction];
  }

  const adjustAction = parseAdjustIntentAction({ prompt, candles });
  if (adjustAction) {
    return [adjustAction];
  }

  const dynamicAction = parseDynamicDrawAction({ prompt, candles });
  if (dynamicAction) {
    return [dynamicAction];
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
      type: "draw_support_resistance",
      priceStart: support,
      priceEnd: resistance,
      label: "Auto S/R"
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

const stripHtmlTags = (value: string): string => {
  return value.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
};

const sanitizeUrl = (value: string): string => {
  const text = toText(value, "");
  if (!text) {
    return "";
  }
  if (!/^https?:\/\//i.test(text)) {
    return "";
  }
  return text.slice(0, 500);
};

const normalizeInternetResults = (
  rows: InternetResultItem[],
  maxResults: number
): InternetResultItem[] => {
  const seen = new Set<string>();
  const normalized: InternetResultItem[] = [];

  for (const row of rows) {
    const url = sanitizeUrl(row.url);
    const title = sanitizeAssistantText(toText(row.title, ""));
    const snippet = sanitizeAssistantText(toText(row.snippet, ""));
    if (!url || !title || !snippet) {
      continue;
    }
    if (seen.has(url.toLowerCase())) {
      continue;
    }
    seen.add(url.toLowerCase());
    normalized.push({
      title: title.slice(0, 220),
      url,
      snippet: snippet.slice(0, 360),
      source: sanitizeAssistantText(toText(row.source, "web")).slice(0, 120),
      publishedAt: toText(row.publishedAt, "")
    });
    if (normalized.length >= maxResults) {
      break;
    }
  }

  return normalized;
};

const fetchInternetContext = async (params: {
  query: string;
  recencyDays: number;
  maxResults: number;
}): Promise<InternetContext> => {
  const query = toText(params.query, "").slice(0, 220);
  const recencyDays = clamp(Math.round(toNumber(params.recencyDays, 3)), 1, 30);
  const maxResults = clamp(Math.round(toNumber(params.maxResults, 5)), 1, 8);
  const nowIso = new Date().toISOString();

  if (!query) {
    return {
      query: "",
      provider: "duckduckgo",
      fetchedAt: nowIso,
      results: []
    };
  }

  const serperApiKey = process.env.SERPER_API_KEY || process.env.SERPAPI_KEY || "";
  if (serperApiKey) {
    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": serperApiKey
        },
        body: JSON.stringify({
          q: query,
          num: maxResults,
          tbs: `qdr:d${recencyDays}`
        }),
        cache: "no-store"
      });

      if (response.ok) {
        const payload = (await response.json()) as Record<string, unknown>;
        const organic = Array.isArray(payload.organic) ? payload.organic : [];
        const results = normalizeInternetResults(
          organic.map((item) => {
            const row = item as Record<string, unknown>;
            return {
              title: toText(row.title, ""),
              url: toText(row.link, ""),
              snippet: toText(row.snippet, ""),
              source: "google",
              publishedAt: toText(row.date, "")
            } satisfies InternetResultItem;
          }),
          maxResults
        );

        return {
          query,
          provider: "serper",
          fetchedAt: nowIso,
          results
        };
      }
    } catch {
      // Fallback below.
    }
  }

  try {
    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_redirect", "1");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        query,
        provider: "duckduckgo",
        fetchedAt: nowIso,
        results: []
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const relatedTopics = Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : [];

    const flatTopics: Array<Record<string, unknown>> = [];
    for (const item of relatedTopics) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const row = item as Record<string, unknown>;
      if (Array.isArray(row.Topics)) {
        for (const nested of row.Topics) {
          if (nested && typeof nested === "object") {
            flatTopics.push(nested as Record<string, unknown>);
          }
        }
      } else {
        flatTopics.push(row);
      }
    }

    const abstractText = stripHtmlTags(toText(payload.AbstractText, ""));
    const abstractUrl = sanitizeUrl(toText(payload.AbstractURL, ""));
    const abstractSource = toText(payload.AbstractSource, "duckduckgo");
    const results: InternetResultItem[] = [];
    if (abstractText && abstractUrl) {
      results.push({
        title: toText(payload.Heading, query),
        url: abstractUrl,
        snippet: abstractText,
        source: abstractSource
      });
    }

    for (const item of flatTopics) {
      const firstUrl = sanitizeUrl(toText(item.FirstURL, ""));
      const text = stripHtmlTags(toText(item.Text, ""));
      if (!firstUrl || !text) {
        continue;
      }
      const [title] = text.split(" - ");
      results.push({
        title: sanitizeAssistantText(title || text).slice(0, 220),
        url: firstUrl,
        snippet: sanitizeAssistantText(text).slice(0, 360),
        source: "duckduckgo"
      });
      if (results.length >= maxResults * 2) {
        break;
      }
    }

    return {
      query,
      provider: "duckduckgo",
      fetchedAt: nowIso,
      results: normalizeInternetResults(results, maxResults)
    };
  } catch {
    return {
      query,
      provider: "duckduckgo",
      fetchedAt: nowIso,
      results: []
    };
  }
};

const executeRequestModeStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  fallback: RequestModePlan;
}): Promise<RequestModePlan> => {
  const { apiKey, baseUrl, model, turns, context, fallback } = params;
  const nowMs = Date.now();

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: `${AI_SYSTEM_PROMPT}\n${MODE_CLASSIFIER_PROMPT}`
        },
        {
          role: "user",
          content: `CLASSIFY_REQUEST_MODE_JSON:\n${JSON.stringify({
            latestPrompt: getLastUserPrompt(turns),
            recentConversation: turns.slice(-6),
            context: {
              symbol: context.symbol,
              timeframe: context.timeframe,
              liveCandleCount: context.liveCandles.length
            },
            runtime: {
              nowIso: new Date(nowMs).toISOString(),
              todayUtcDate: new Date(nowMs).toISOString().slice(0, 10)
            }
          })}`
        }
      ],
      temperature: 0,
      maxTokens: 220,
      responseFormat: {
        type: "json_object"
      }
    });

    const parsed = safeJsonParse<Record<string, unknown>>(
      extractNebiusMessageText(completion.message.content),
      {}
    );
    const mode =
      normalizeRequestMode(parsed.mode) ??
      modeFromRequires(parsed.requires);
    if (!mode) {
      return fallback;
    }

    const confidence = clamp(toNumber(parsed.confidence, 0.8), 0, 1);
    if (confidence < 0.3) {
      return fallback;
    }

    const toolHintsRaw =
      parsed.toolHints && typeof parsed.toolHints === "object"
        ? (parsed.toolHints as Record<string, unknown>)
        : {};
    const qualityRaw =
      parsed.quality && typeof parsed.quality === "object"
        ? (parsed.quality as Record<string, unknown>)
        : {};

    const plan = buildRequestModePlan(mode);
    const hintedCount = Math.round(toNumber(toolHintsRaw.clickhouseCount, 0));
    return {
      ...plan,
      needsClickhouseHint: Boolean(toolHintsRaw.needsClickhouse),
      clickhouseCountHint:
        hintedCount > 0 ? clamp(hintedCount, 40, MAX_CLICKHOUSE_COUNT) : null,
      needsBacktestHint: Boolean(toolHintsRaw.needsBacktest),
      strictToRequest: Boolean(
        qualityRaw.strictToRequest === undefined ? true : qualityRaw.strictToRequest
      )
    };
  } catch {
    return fallback;
  }
};

const executeIntentExecutionStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  modePlan: RequestModePlan;
}): Promise<IntentExecutionPlan> => {
  const { apiKey, baseUrl, model, turns, context, modePlan } = params;
  const nowMs = Date.now();
  const fallback = buildFallbackExecutionPlan(modePlan);

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: `${AI_SYSTEM_PROMPT}\n${INTENT_EXECUTION_PROMPT}`
        },
        {
          role: "user",
          content: `BUILD_EXECUTION_PLAN_JSON:\n${JSON.stringify({
            latestPrompt: getLastUserPrompt(turns),
            recentConversation: turns.slice(-6),
            modePlan,
            context: {
              symbol: context.symbol,
              timeframe: context.timeframe,
              liveCandleCount: context.liveCandles.length,
              historyRows: context.historyRows.length,
              actionRows: context.actionRows.length,
              backtestHasRun: context.backtest.hasRun,
              backtestRows: context.backtest.trades.length
            },
            runtime: {
              nowIso: new Date(nowMs).toISOString(),
              todayUtcDate: new Date(nowMs).toISOString().slice(0, 10)
            }
          })}`
        }
      ],
      temperature: 0,
      maxTokens: 360,
      responseFormat: {
        type: "json_object"
      }
    });

    const parsed = safeJsonParse<Record<string, unknown>>(
      extractNebiusMessageText(completion.message.content),
      {}
    );

    const clickhouseCountRaw = Math.round(toNumber(parsed.clickhouseCount, 0));
    return {
      graphNeeded: Boolean(parsed.graphNeeded),
      graphType: toText(parsed.graphType, ""),
      drawNeeded: Boolean(parsed.drawNeeded),
      animationNeeded: Boolean(parsed.animationNeeded),
      naturalOnly: Boolean(parsed.naturalOnly),
      needsClickhouse: Boolean(parsed.needsClickhouse),
      clickhouseCount: clickhouseCountRaw > 0 ? clamp(clickhouseCountRaw, 40, MAX_CLICKHOUSE_COUNT) : null,
      needsBacktest: Boolean(parsed.needsBacktest),
      strictToRequest: Boolean(parsed.strictToRequest === undefined ? true : parsed.strictToRequest)
    };
  } catch {
    return fallback;
  }
};

const executeInstructionChecklistAuthorStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  modePlan: RequestModePlan;
  executionPlan: IntentExecutionPlan;
  fallback: RequestChecklistPlan;
}): Promise<RequestChecklistPlan> => {
  const { apiKey, baseUrl, model, turns, context, modePlan, executionPlan, fallback } = params;
  const nowMs = Date.now();

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: `${AI_SYSTEM_PROMPT}\n${CHECKLIST_AUTHOR_PROMPT}`
        },
        {
          role: "user",
          content: `AUTHOR_CHECKLIST_JSON:\n${JSON.stringify({
            latestPrompt: getLastUserPrompt(turns),
            recentConversation: turns.slice(-6),
            modePlan,
            executionPlan,
            context: {
              symbol: context.symbol,
              timeframe: context.timeframe,
              liveCandleCount: context.liveCandles.length,
              historyRows: context.historyRows.length,
              actionRows: context.actionRows.length,
              backtestHasRun: context.backtest.hasRun,
              backtestRows: context.backtest.trades.length
            },
            runtime: {
              nowIso: new Date(nowMs).toISOString(),
              todayUtcDate: new Date(nowMs).toISOString().slice(0, 10)
            }
          })}`
        }
      ],
      temperature: 0,
      maxTokens: 520,
      responseFormat: {
        type: "json_object"
      }
    });

    const parsed = safeJsonParse<Record<string, unknown>>(
      extractNebiusMessageText(completion.message.content),
      {}
    );

    const requestKindRaw = toText(parsed.requestKind, "").toLowerCase();
    const requestKind =
      requestKindRaw === "social" || requestKindRaw === "task"
        ? (requestKindRaw as "social" | "task")
        : fallback.requestKind;
    const strictToRequest = toBool(parsed.strictToRequest, fallback.strictToRequest);
    const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];

    const items = itemsRaw
      .map((row, index) => {
        if (!row || typeof row !== "object") {
          return null;
        }
        const raw = row as Record<string, unknown>;
        const artifact = normalizeChecklistArtifact(raw.artifact);
        const label = sanitizeAssistantText(toText(raw.label, ""));
        if (!artifact || !label) {
          return null;
        }
        const id = toText(raw.id, `item_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
        return {
          id: id || `item_${index + 1}`,
          label,
          required: toBool(raw.required, false),
          artifact
        } satisfies RequestChecklistTemplateItem;
      })
      .filter((item): item is RequestChecklistTemplateItem => item !== null)
      .slice(0, 7);

    if (items.length === 0) {
      return fallback;
    }

    const requiresGraph = items.some((item) => item.required && item.artifact === "graph");
    const requiresDraw = items.some((item) => item.required && item.artifact === "draw");
    const requiresAnimation = items.some((item) => item.required && item.artifact === "animation");
    const requiresNaturalResponse = items.some((item) => item.required && item.artifact === "natural");
    const shouldAvoidDataFetch =
      items.some((item) => item.required && item.artifact === "data") || fallback.shouldAvoidDataFetch;

    return {
      requestKind,
      requiresNaturalResponse: requiresNaturalResponse || fallback.requiresNaturalResponse,
      requiresGraph,
      requiresDraw,
      requiresAnimation,
      shouldAvoidDataFetch,
      strictToRequest,
      items,
      source: "instruction_model"
    };
  } catch {
    return fallback;
  }
};

const executeInstructionChecklistAuditStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  checklistPlan: RequestChecklistPlan;
  candidate: {
    shortAnswer: string;
    cannotAnswer: boolean;
    cannotAnswerReason: string;
    bullets: Array<{ tone: "green" | "red" | "gold" | "black"; text: string }>;
    chartsCount: number;
    drawingsCount: number;
    animationsCount: number;
    toolsUsed: string[];
  };
}): Promise<InstructionChecklistAudit | null> => {
  const { apiKey, baseUrl, model, turns, checklistPlan, candidate } = params;

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: `${AI_SYSTEM_PROMPT}\n${CHECKLIST_AUDIT_PROMPT}`
        },
        {
          role: "user",
          content: `AUDIT_RESPONSE_JSON:\n${JSON.stringify({
            latestPrompt: getLastUserPrompt(turns),
            checklistPlan,
            candidate
          })}`
        }
      ],
      temperature: 0,
      maxTokens: 520,
      responseFormat: {
        type: "json_object"
      }
    });

    const parsed = safeJsonParse<Record<string, unknown>>(
      extractNebiusMessageText(completion.message.content),
      {}
    );
    const bulletsRaw = Array.isArray(parsed.bullets) ? parsed.bullets : [];
    const bullets = bulletsRaw
      .map((row) => {
        if (!row || typeof row !== "object") {
          return null;
        }
        const raw = row as Record<string, unknown>;
        const text = sanitizeAssistantText(toText(raw.text, ""));
        if (!text) {
          return null;
        }
        return {
          tone: normalizeTone(raw.tone),
          text
        };
      })
      .filter((row): row is { tone: "green" | "red" | "gold" | "black"; text: string } => row !== null)
      .slice(0, 3);

    return {
      allowBullets: toBool(parsed.allowBullets, true),
      allowCharts: toBool(parsed.allowCharts, true),
      allowDrawings: toBool(parsed.allowDrawings, true),
      allowAnimations: toBool(parsed.allowAnimations, true),
      shortAnswer: sanitizeAssistantText(toText(parsed.shortAnswer, candidate.shortAnswer)),
      bullets
    };
  } catch {
    return null;
  }
};

const executeGraphToolboxResolutionStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestedGraphType: string;
}): Promise<{ resolvedTemplate: string | null; needsNewTooling: boolean }> => {
  const { apiKey, baseUrl, model, requestedGraphType } = params;

  const direct = resolveToolboxGraphTemplate(requestedGraphType);
  if (direct) {
    return { resolvedTemplate: direct, needsNewTooling: false };
  }

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: GRAPH_TOOLBOX_RESOLUTION_PROMPT
        },
        {
          role: "user",
          content: `RESOLVE_GRAPH_TOOLBOX_JSON:\n${JSON.stringify({
            requestedGraphType,
            availableTemplates: listGraphTemplatesForPrompt()
          })}`
        }
      ],
      temperature: 0,
      maxTokens: 260,
      responseFormat: {
        type: "json_object"
      }
    });

    const parsed = safeJsonParse<Record<string, unknown>>(
      extractNebiusMessageText(completion.message.content),
      {}
    );
    const resolvedTemplate = resolveToolboxGraphTemplate(toText(parsed.resolvedTemplate, ""));
    return {
      resolvedTemplate,
      needsNewTooling: Boolean(parsed.needsNewTooling)
    };
  } catch {
    return { resolvedTemplate: null, needsNewTooling: false };
  }
};

const executeSocialReplyStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
}): Promise<string> => {
  const { apiKey, baseUrl, model, turns } = params;
  const lastPrompt = getLastUserPrompt(turns);

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are Gideon.",
            "Respond like a natural human in one short sentence.",
            "The user sent a social/greeting message.",
            "Keep it trading-focused, concise, and professional.",
            "Do not include market analysis, indicators, charts, trading advice, or tool mentions.",
            "Never output <think> tags or private reasoning.",
            "Never use stage directions or roleplay text.",
            "Never ask about the user's day, mood, or personal life."
          ].join("\n")
        },
        {
          role: "user",
          content: lastPrompt
        }
      ],
      maxTokens: 80
    });

    const sanitized = sanitizeDeliveryText(extractNebiusMessageText(completion.message.content));
    if (sanitized) {
      return sanitized;
    }

    const retry = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content:
            "Reply with one short human greeting sentence only. No tags. No private reasoning. No analysis."
        },
        {
          role: "user",
          content: lastPrompt
        }
      ],
      temperature: 0.2,
      maxTokens: 48
    });

    return sanitizeDeliveryText(extractNebiusMessageText(retry.message.content));
  } catch {
    return sanitizeDeliveryText(lastPrompt);
  }
};

const executeSpeakerStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  draftAnswer: string;
  cannotAnswer: boolean;
  cannotAnswerReason: string;
  marketAnchor?: MarketPriceAnchor | null;
  strictPriceAnchoring?: boolean;
}): Promise<string> => {
  const {
    apiKey,
    baseUrl,
    model,
    turns,
    draftAnswer,
    cannotAnswer,
    cannotAnswerReason,
    marketAnchor = null,
    strictPriceAnchoring = false
  } = params;
  const lastPrompt = getLastUserPrompt(turns);

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: SPEAKER_PROMPT
        },
        {
          role: "user",
          content: `REWRITE_FOR_USER_JSON:\n${JSON.stringify({
            userPrompt: lastPrompt,
            draftAnswer,
            cannotAnswer,
            cannotAnswerReason,
            marketAnchor,
            strictPriceAnchoring
          })}`
        }
      ],
      temperature: 0.55,
      maxTokens: 180
    });

    return sanitizeDeliveryText(extractNebiusMessageText(completion.message.content));
  } catch {
    return sanitizeDeliveryText(draftAnswer || cannotAnswerReason);
  }
};

const executePlanningStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  request: Request;
  toolState: ToolState;
  nowMs: number;
}): Promise<{
  planning: PlanningOutput;
  status?: "needs_backtest_data";
  reason?: string;
}> => {
  const { apiKey, baseUrl, model, turns, context, request, toolState, nowMs } = params;

  const planningMessages: NebiusChatMessage[] = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    { role: "system", content: PLANNING_PROMPT },
    ...mapToNebiusConversation(turns),
    {
      role: "user",
      content: `RUNTIME_CONTEXT_JSON:\n${JSON.stringify({
        context: buildContextDigest(context),
        runtimeClock: buildRuntimeClock({
          nowMs,
          context,
          clickhouseCandles: toolState.clickhouseCandles
        })
      })}`
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
    },
    {
      type: "function",
      function: {
        name: "search_internet",
        description: "Fetch concise external web/news context when internal market data is insufficient.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            recencyDays: { type: "number" },
            maxResults: { type: "number" },
            reason: { type: "string" }
          },
          required: ["query"]
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

      if (name === "search_internet") {
        const query = toText(args.query, getLastUserPrompt(turns));
        const recencyDays = clamp(Math.round(toNumber(args.recencyDays, 3)), 1, 30);
        const maxResults = clamp(Math.round(toNumber(args.maxResults, 5)), 1, 8);
        const internetContext = await fetchInternetContext({
          query,
          recencyDays,
          maxResults
        });
        toolState.internetContext = internetContext;

        toolAwareMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: true,
            query: internetContext.query,
            provider: internetContext.provider,
            fetchedAt: internetContext.fetchedAt,
            count: internetContext.results.length,
            results: internetContext.results
          })
        });
        continue;
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

const normalizeDataAnalysisOutput = (input: unknown): DataAnalysisOutput => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const keyFindingsRaw = Array.isArray(raw.keyFindings) ? raw.keyFindings : [];
  const suggestedIndicatorFocusRaw = Array.isArray(raw.suggestedIndicatorFocus)
    ? raw.suggestedIndicatorFocus
    : [];

  return {
    summary: sanitizeAssistantText(toText(raw.summary, "")),
    keyFindings: keyFindingsRaw
      .map((row) => sanitizeAssistantText(toText(row, "")))
      .filter((row) => row.length > 0)
      .slice(0, 4),
    suggestedIndicatorFocus: suggestedIndicatorFocusRaw
      .map((row) => sanitizeAssistantText(toText(row, "")))
      .filter((row) => row.length > 0)
      .slice(0, 4),
    confidence: clamp(toNumber(raw.confidence, 0), 0, 1)
  };
};

const executeDataAnalysisStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  toolState: ToolState;
  planning: PlanningOutput;
  indicatorSnapshot: Record<string, unknown>;
  nowMs: number;
}): Promise<DataAnalysisOutput> => {
  const { apiKey, baseUrl, model, turns, context, toolState, planning, indicatorSnapshot, nowMs } = params;

  const recentWindowCandles = getRecentWindowCandles({
    context,
    clickhouseCandles: toolState.clickhouseCandles
  });

  const input = {
    latestPrompt: getLastUserPrompt(turns),
    conversation: turns.slice(-6),
    context: buildContextDigest(context),
    runtimeClock: buildRuntimeClock({
      nowMs,
      context,
      clickhouseCandles: toolState.clickhouseCandles
    }),
    planning,
    recentWindow: {
      includesLiveStream: true,
      count: recentWindowCandles.length,
      candles: recentWindowCandles.slice(-260)
    },
    indicators: indicatorSnapshot,
    internetContext: toolState.internetContext
  };

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: `${AI_SYSTEM_PROMPT}\n${DATA_ANALYSIS_PROMPT}`
        },
        {
          role: "user",
          content: `ANALYZE_MARKET_DATA_JSON:\n${JSON.stringify(input)}`
        }
      ],
      temperature: 0.1,
      maxTokens: 620,
      responseFormat: {
        type: "json_object"
      }
    });

    return normalizeDataAnalysisOutput(
      safeJsonParse<Record<string, unknown>>(
        extractNebiusMessageText(completion.message.content),
        {}
      )
    );
  } catch {
    return {
      summary: "",
      keyFindings: [],
      suggestedIndicatorFocus: [],
      confidence: 0
    };
  }
};

const executeReasoningStage = async (params: {
  apiKey: string;
  baseUrl: string;
  models: NebiusModelSelection;
  turns: ChatTurn[];
  context: AssistantContext;
  toolState: ToolState;
  planning: PlanningOutput;
  requestChecklist: RequestChecklistPlan;
  indicatorSnapshot: Record<string, unknown>;
  dataAnalysis: DataAnalysisOutput;
  nowMs: number;
}): Promise<ReasoningOutput> => {
  const {
    apiKey,
    baseUrl,
    models,
    turns,
    context,
    toolState,
    planning,
    requestChecklist,
    indicatorSnapshot,
    dataAnalysis
  } = params;
  const recentWindowCandles = getRecentWindowCandles({
    context,
    clickhouseCandles: toolState.clickhouseCandles
  });

  const reasoningInput = {
    conversation: buildConversationTranscript(turns),
    context: buildContextDigest(context),
    planning,
    requestChecklist,
    dataAnalysis,
    runtimeClock: buildRuntimeClock({
      nowMs: params.nowMs,
      context,
      clickhouseCandles: toolState.clickhouseCandles
    }),
    recentWindow: {
      includesLiveStream: true,
      count: recentWindowCandles.length,
      candles: recentWindowCandles.slice(-300)
    },
    indicators: indicatorSnapshot,
    internetContext: toolState.internetContext,
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
  dataAnalysis: DataAnalysisOutput;
  indicatorSnapshot: Record<string, unknown>;
  context: AssistantContext;
  toolState: ToolState;
  requestMode: RequestModePlan;
  requestedGraphType: string;
  forcedGraphTemplate: string | null;
  wantsAnimation: boolean;
  nowMs: number;
}): Promise<{
  chartPlans: ChartPlan[];
  chartActions: ReturnType<typeof normalizeChartActions>;
  chartAnimations: ReturnType<typeof normalizeChartAnimationsFromCoding>;
}> => {
  const {
    apiKey,
    baseUrl,
    models,
    reasoning,
    dataAnalysis,
    indicatorSnapshot,
    context,
    toolState
  } = params;

  const codingInput = {
    analysis: dataAnalysis,
    indicators: indicatorSnapshot,
    chartHints: reasoning.chartHints,
    runtimeClock: buildRuntimeClock({
      nowMs: params.nowMs,
      context,
      clickhouseCandles: toolState.clickhouseCandles
    }),
    internetContext: toolState.internetContext,
    availableSources: {
      history: context.historyRows.length,
      backtest: context.backtest.trades.length,
      candles: context.liveCandles.length,
      clickhouse: toolState.clickhouseCandles.length,
      actions: context.actionRows.length
    },
    requiredArtifacts: {
      text: true,
      graphs: params.requestMode.wantsVisualization,
      drawings: params.requestMode.wantsDraw,
      animation: params.requestMode.wantsAnimation
    },
    requestedGraphType: params.requestedGraphType,
    forcedGraphTemplate: params.forcedGraphTemplate,
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
  if (
    params.requestMode.wantsVisualization &&
    params.forcedGraphTemplate &&
    GRAPH_TEMPLATE_ID_SET.has(params.forcedGraphTemplate) &&
    !plans.some((plan) => plan.template === params.forcedGraphTemplate)
  ) {
    plans.unshift({
      template: params.forcedGraphTemplate,
      title: resolveGraphTemplate(params.forcedGraphTemplate).title,
      source: "candles",
      points: 240
    });
  }
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

const INDICATOR_ALIAS_MAP: Array<{ name: string; regex: RegExp }> = [
  { name: "macd", regex: /\bmacd\b/i },
  { name: "rsi", regex: /\brsi\b|\boverbought\b|\boversold\b/i },
  { name: "ema", regex: /\bema\b|\bexponential moving average\b/i },
  { name: "sma", regex: /\bsma\b|\bsimple moving average\b|\bmoving average\b/i },
  { name: "atr", regex: /\batr\b|\baverage true range\b/i },
  { name: "stochastic", regex: /\bstoch\b|\bstochastic\b/i }
];

const extractRequestedIndicators = (prompt: string): string[] => {
  const normalized = toText(prompt, "");
  if (!normalized) {
    return [];
  }

  const requested: string[] = [];
  for (const entry of INDICATOR_ALIAS_MAP) {
    if (entry.regex.test(normalized)) {
      requested.push(entry.name);
    }
  }

  return Array.from(new Set(requested));
};

const normalizeIndicatorName = (value: string): string => {
  const token = value.trim().toLowerCase();
  if (token === "stoch") return "stochastic";
  return token;
};

const parseIndicatorPeriodFromPrompt = (prompt: string, fallback: number): number => {
  const text = toText(prompt, "");
  if (!text) {
    return fallback;
  }

  const periodMatch = text.match(/\b(?:period|len|length)\s*(?:=|:)?\s*(\d{1,3})\b/i);
  if (periodMatch?.[1]) {
    return clamp(toNumber(periodMatch[1], fallback), 2, 300);
  }

  const trailingMatch = text.match(/\b(?:rsi|ema|sma|atr)\s*(\d{1,3})\b/i);
  if (trailingMatch?.[1]) {
    return clamp(toNumber(trailingMatch[1], fallback), 2, 300);
  }

  return fallback;
};

const buildFallbackIndicatorPlans = (params: {
  requestedIndicators: string[];
  prompt: string;
}): IndicatorCodingPlan[] => {
  const period = parseIndicatorPeriodFromPrompt(params.prompt, 14);
  const plans: IndicatorCodingPlan[] = [];

  for (const rawName of params.requestedIndicators) {
    const name = normalizeIndicatorName(rawName);
    if (name === "macd") {
      plans.push({
        indicator: "macd",
        output: "snapshot",
        params: { fast: 12, slow: 26, signal: 9 },
        minCandles: 40
      });
      continue;
    }
    if (name === "rsi") {
      plans.push({
        indicator: "rsi",
        output: "snapshot",
        params: { period },
        minCandles: Math.max(20, period + 2)
      });
      continue;
    }
    if (name === "ema") {
      plans.push({
        indicator: "ema",
        output: "snapshot",
        params: { period: Math.max(5, period) },
        minCandles: Math.max(30, period + 2)
      });
      continue;
    }
    if (name === "sma") {
      plans.push({
        indicator: "sma",
        output: "snapshot",
        params: { period: Math.max(5, period) },
        minCandles: Math.max(30, period + 2)
      });
      continue;
    }
    if (name === "atr") {
      plans.push({
        indicator: "atr",
        output: "snapshot",
        params: { period: Math.max(5, period) },
        minCandles: Math.max(30, period + 2)
      });
      continue;
    }
    if (name === "stochastic") {
      plans.push({
        indicator: "stochastic",
        output: "snapshot",
        params: { k: 14, d: 3 },
        minCandles: 32
      });
    }
  }

  return plans;
};

const normalizeIndicatorCodingPlans = (
  payload: unknown,
  requestedIndicators: string[],
  fallbackPlans: IndicatorCodingPlan[]
): IndicatorCodingPlan[] => {
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const plansRaw = Array.isArray(raw.plans) ? raw.plans : [];
  if (plansRaw.length === 0) {
    return fallbackPlans;
  }

  const requestedSet = new Set(requestedIndicators.map((entry) => normalizeIndicatorName(entry)));
  const plans = plansRaw
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }
      const item = row as Record<string, unknown>;
      const indicator = normalizeIndicatorName(toText(item.indicator, ""));
      if (!indicator || !requestedSet.has(indicator)) {
        return null;
      }

      const paramsRaw = item.params && typeof item.params === "object"
        ? (item.params as Record<string, unknown>)
        : {};

      const params: Record<string, number> = {};
      for (const [key, value] of Object.entries(paramsRaw)) {
        const numeric = toNumber(value, Number.NaN);
        if (Number.isFinite(numeric)) {
          params[key] = numeric;
        }
      }

      return {
        indicator,
        output: toText(item.output, "snapshot").toLowerCase() === "series" ? "series" : "snapshot",
        params,
        minCandles: clamp(toNumber(item.minCandles, 24), 8, MAX_CLICKHOUSE_COUNT)
      } satisfies IndicatorCodingPlan;
    })
    .filter((row): row is IndicatorCodingPlan => row !== null);

  if (plans.length === 0) {
    return fallbackPlans;
  }

  return plans;
};

const computeLatestRsiSnapshot = (candles: CandleRow[], period = 14) => {
  if (!Array.isArray(candles) || candles.length < period + 1) {
    return null;
  }

  const closes = candles.map((row) => row.close);
  const rsi = computeRsiSeries(closes, period);
  if (rsi.length < period + 1) {
    return null;
  }

  const latest = rsi[rsi.length - 1];
  if (!Number.isFinite(latest)) {
    return null;
  }

  const previous = rsi[Math.max(0, rsi.length - 2)] ?? latest;
  const momentum = latest - previous;
  const state =
    latest >= 70 ? "overbought" : latest <= 30 ? "oversold" : "neutral";

  return {
    value: Number(latest.toFixed(2)),
    previous: Number(previous.toFixed(2)),
    momentum: Number(momentum.toFixed(2)),
    state
  };
};

const computeMacdSeries = (params: {
  candles: CandleRow[];
  fast: number;
  slow: number;
  signal: number;
}): Array<{ time: number; macd: number; signal: number; histogram: number }> => {
  const { candles, fast, slow, signal } = params;
  if (candles.length === 0) {
    return [];
  }
  const closes = candles.map((row) => row.close);
  const fastEma = computeEmaSeries(closes, fast);
  const slowEma = computeEmaSeries(closes, slow);
  const macdLine = fastEma.map((value, index) => value - (slowEma[index] ?? value));
  const signalLine = computeEmaSeries(macdLine, signal);

  return candles.map((candle, index) => {
    const macd = macdLine[index] ?? 0;
    const signalValue = signalLine[index] ?? 0;
    return {
      time: candle.time,
      macd,
      signal: signalValue,
      histogram: macd - signalValue
    };
  });
};

const computeLatestMacdSnapshot = (params: {
  candles: CandleRow[];
  fast: number;
  slow: number;
  signal: number;
}) => {
  const { candles, fast, slow, signal } = params;
  const minCandles = Math.max(24, slow + signal + 4);
  if (candles.length < minCandles) {
    return null;
  }

  const series = computeMacdSeries({ candles, fast, slow, signal });
  if (series.length < 2) {
    return null;
  }

  const latest = series[series.length - 1]!;
  const previous = series[series.length - 2]!;
  const crossedUp = previous.macd <= previous.signal && latest.macd > latest.signal;
  const crossedDown = previous.macd >= previous.signal && latest.macd < latest.signal;
  const regime = latest.histogram > 0 ? "bullish_momentum" : latest.histogram < 0 ? "bearish_momentum" : "flat";

  return {
    macd: Number(latest.macd.toFixed(4)),
    signal: Number(latest.signal.toFixed(4)),
    histogram: Number(latest.histogram.toFixed(4)),
    crossedUp,
    crossedDown,
    regime
  };
};

const computeLatestMovingAverageSnapshot = (params: {
  candles: CandleRow[];
  period: number;
  kind: "ema" | "sma";
}) => {
  const { candles, period, kind } = params;
  if (candles.length < period + 1) {
    return null;
  }

  const closes = candles.map((row) => row.close);
  let series: number[] = [];
  if (kind === "ema") {
    series = computeEmaSeries(closes, period);
  } else {
    series = closes.map((_, index) => rollingMeanAt(closes, index, period));
  }

  const latest = series[series.length - 1];
  const previous = series[Math.max(0, series.length - 2)] ?? latest;
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) {
    return null;
  }

  return {
    value: Number(latest.toFixed(4)),
    previous: Number(previous.toFixed(4)),
    slope: Number((latest - previous).toFixed(4)),
    period
  };
};

const computeLatestAtrSnapshot = (params: {
  candles: CandleRow[];
  period: number;
}) => {
  const { candles, period } = params;
  if (candles.length < period + 2) {
    return null;
  }

  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    const range1 = current.high - current.low;
    const range2 = Math.abs(current.high - previous.close);
    const range3 = Math.abs(current.low - previous.close);
    trueRanges.push(Math.max(range1, range2, range3));
  }

  if (trueRanges.length === 0) {
    return null;
  }

  const atrSeries = trueRanges.map((_, index) => rollingMeanAt(trueRanges, index, period));
  const latest = atrSeries[atrSeries.length - 1] ?? 0;
  const previous = atrSeries[Math.max(0, atrSeries.length - 2)] ?? latest;
  return {
    value: Number(latest.toFixed(4)),
    previous: Number(previous.toFixed(4)),
    change: Number((latest - previous).toFixed(4)),
    period
  };
};

const computeLatestStochasticSnapshot = (params: {
  candles: CandleRow[];
  kPeriod: number;
  dPeriod: number;
}) => {
  const { candles, kPeriod, dPeriod } = params;
  if (candles.length < kPeriod + dPeriod + 2) {
    return null;
  }

  const percentK: number[] = candles.map((row, index) => {
    const start = Math.max(0, index - kPeriod + 1);
    const window = candles.slice(start, index + 1);
    if (window.length === 0) {
      return 50;
    }
    const low = Math.min(...window.map((entry) => entry.low));
    const high = Math.max(...window.map((entry) => entry.high));
    const span = Math.max(1e-9, high - low);
    return ((row.close - low) / span) * 100;
  });
  const percentD = percentK.map((_, index) => rollingMeanAt(percentK, index, dPeriod));

  const latestK = percentK[percentK.length - 1] ?? 50;
  const latestD = percentD[percentD.length - 1] ?? latestK;
  const state = latestK >= 80 ? "overbought" : latestK <= 20 ? "oversold" : "neutral";
  return {
    k: Number(latestK.toFixed(2)),
    d: Number(latestD.toFixed(2)),
    state
  };
};

const buildIndicatorSnapshot = (candles: CandleRow[]): Record<string, unknown> => {
  const latest = candles[candles.length - 1] ?? null;
  const earliest = candles[0] ?? null;
  const movePct =
    latest && earliest && Math.abs(earliest.close) > 1e-9
      ? ((latest.close - earliest.close) / earliest.close) * 100
      : 0;

  const rsi14 = computeLatestRsiSnapshot(candles, 14);
  const rsi21 = computeLatestRsiSnapshot(candles, 21);

  return {
    candleCount: candles.length,
    latestTime: latest ? formatTimeLabel(latest.time) : null,
    movePct: Number(movePct.toFixed(4)),
    rsi14: rsi14
      ? {
          ...rsi14,
          overboughtThreshold: 70,
          oversoldThreshold: 30
        }
      : null,
    rsi21: rsi21
      ? {
          ...rsi21,
          overboughtThreshold: 70,
          oversoldThreshold: 30
        }
      : null
  };
};

const mergeIndicatorSnapshot = (params: {
  baseSnapshot: Record<string, unknown>;
  computed: Record<string, unknown>;
}): Record<string, unknown> => {
  const { baseSnapshot, computed } = params;
  return {
    ...baseSnapshot,
    codedComputedIndicators: computed,
    ...computed
  };
};

const applyIndicatorCodingPlans = (params: {
  candles: CandleRow[];
  plans: IndicatorCodingPlan[];
}): IndicatorCodingResult => {
  const { candles, plans } = params;
  const computed: Record<string, unknown> = {};
  let computedAny = false;
  let requiredMinCandles = 0;
  let needsMoreData = false;

  for (const plan of plans) {
    requiredMinCandles = Math.max(requiredMinCandles, Math.max(2, plan.minCandles));
    if (candles.length < Math.max(2, plan.minCandles)) {
      needsMoreData = true;
      continue;
    }

    const indicator = normalizeIndicatorName(plan.indicator);
    if (indicator === "macd") {
      const fast = clamp(toNumber(plan.params.fast, 12), 2, 120);
      const slow = clamp(toNumber(plan.params.slow, 26), fast + 1, 240);
      const signal = clamp(toNumber(plan.params.signal, 9), 2, 120);
      const snapshot = computeLatestMacdSnapshot({ candles, fast, slow, signal });
      if (!snapshot) {
        needsMoreData = true;
        continue;
      }
      const series =
        plan.output === "series"
          ? computeMacdSeries({ candles, fast, slow, signal }).slice(-240).map((row) => ({
              ...row,
              macd: Number(row.macd.toFixed(6)),
              signal: Number(row.signal.toFixed(6)),
              histogram: Number(row.histogram.toFixed(6))
            }))
          : undefined;
      computed.macd = {
        ...snapshot,
        params: { fast, slow, signal },
        series
      };
      computedAny = true;
      continue;
    }

    if (indicator === "rsi") {
      const period = clamp(toNumber(plan.params.period, 14), 2, 200);
      const snapshot = computeLatestRsiSnapshot(candles, period);
      if (!snapshot) {
        needsMoreData = true;
        continue;
      }
      computed[`rsi${period}`] = {
        ...snapshot,
        period,
        overboughtThreshold: 70,
        oversoldThreshold: 30
      };
      computedAny = true;
      continue;
    }

    if (indicator === "ema" || indicator === "sma") {
      const period = clamp(toNumber(plan.params.period, 20), 2, 240);
      const snapshot = computeLatestMovingAverageSnapshot({
        candles,
        period,
        kind: indicator
      });
      if (!snapshot) {
        needsMoreData = true;
        continue;
      }
      computed[`${indicator}${period}`] = {
        ...snapshot,
        kind: indicator
      };
      computedAny = true;
      continue;
    }

    if (indicator === "atr") {
      const period = clamp(toNumber(plan.params.period, 14), 2, 200);
      const snapshot = computeLatestAtrSnapshot({ candles, period });
      if (!snapshot) {
        needsMoreData = true;
        continue;
      }
      computed[`atr${period}`] = snapshot;
      computedAny = true;
      continue;
    }

    if (indicator === "stochastic") {
      const kPeriod = clamp(toNumber(plan.params.k, 14), 2, 100);
      const dPeriod = clamp(toNumber(plan.params.d, 3), 2, 50);
      const snapshot = computeLatestStochasticSnapshot({
        candles,
        kPeriod,
        dPeriod
      });
      if (!snapshot) {
        needsMoreData = true;
        continue;
      }
      computed[`stochastic_${kPeriod}_${dPeriod}`] = snapshot;
      computedAny = true;
    }
  }

  return {
    computed,
    computedAny,
    requiredMinCandles,
    needsMoreData
  };
};

const executeIndicatorCodingStage = async (params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  requestedIndicators: string[];
  candles: CandleRow[];
  indicatorSnapshot: Record<string, unknown>;
  nowMs: number;
}): Promise<IndicatorCodingResult> => {
  const {
    apiKey,
    baseUrl,
    model,
    prompt,
    requestedIndicators,
    candles,
    indicatorSnapshot,
    nowMs
  } = params;

  if (requestedIndicators.length === 0) {
    return {
      computed: {},
      computedAny: false,
      requiredMinCandles: 0,
      needsMoreData: false
    };
  }

  const fallbackPlans = buildFallbackIndicatorPlans({
    requestedIndicators,
    prompt
  });

  try {
    const completion = await nebiusChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "system",
          content: INDICATOR_CODING_PROMPT
        },
        {
          role: "user",
          content: `INDICATOR_CODING_PLAN_JSON:\n${JSON.stringify({
            prompt,
            requestedIndicators,
            nowIso: new Date(nowMs).toISOString(),
            candleCount: candles.length,
            latestTime:
              candles.length > 0 && Number.isFinite(candles[candles.length - 1]!.time)
                ? new Date(normalizeTimestampMs(candles[candles.length - 1]!.time)).toISOString()
                : null,
            indicatorSnapshot
          })}`
        }
      ],
      temperature: 0,
      maxTokens: 500,
      responseFormat: {
        type: "json_object"
      }
    });

    const parsed = safeJsonParse<Record<string, unknown>>(
      extractNebiusMessageText(completion.message.content),
      {}
    );
    const plans = normalizeIndicatorCodingPlans(parsed, requestedIndicators, fallbackPlans);
    return applyIndicatorCodingPlans({ candles, plans });
  } catch {
    return applyIndicatorCodingPlans({ candles, plans: fallbackPlans });
  }
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
  const runtimeNowMs = Date.now();
  const heuristicRequestMode = classifyRequestMode(lastUserPrompt);
  const indicatorComputationRequested = isIndicatorComputationRequest(lastUserPrompt);
  const requestedIndicators = extractRequestedIndicators(lastUserPrompt);
  const internetContextRequested = INTERNET_CONTEXT_RE.test(lastUserPrompt);

  try {
    const toolsUsed = new Set<string>();

    const modelsCatalog = await fetchNebiusModelCatalog({
      apiKey,
      baseUrl
    });
    const modelSelection = pickNebiusModels(modelsCatalog);
    const requestMode = await executeRequestModeStage({
      apiKey,
      baseUrl,
      model: modelSelection.coordinator,
      turns,
      context,
      fallback: heuristicRequestMode
    });
    const executionPlan = await executeIntentExecutionStage({
      apiKey,
      baseUrl,
      model: modelSelection.coordinator,
      turns,
      context,
      modePlan: requestMode
    });
    const socialOnlyPrompt = isSocialOnlyPrompt(lastUserPrompt);
    let explicitDrawRequest = socialOnlyPrompt
      ? false
      : requestMode.wantsDraw || executionPlan.drawNeeded;
    let wantsVisualization = socialOnlyPrompt
      ? false
      : requestMode.wantsVisualization || executionPlan.graphNeeded;
    let wantsAnimation = socialOnlyPrompt
      ? false
      : requestMode.wantsAnimation || executionPlan.animationNeeded;
    let wantsNaturalOnly = socialOnlyPrompt
      ? true
      : requestMode.wantsNaturalOnly || executionPlan.naturalOnly;
    let strictToRequest = socialOnlyPrompt
      ? true
      : requestMode.strictToRequest && executionPlan.strictToRequest;
    let mergedBacktestHint = socialOnlyPrompt
      ? false
      : requestMode.needsBacktestHint || executionPlan.needsBacktest;
    let mergedClickhouseHint = socialOnlyPrompt
      ? false
      : requestMode.needsClickhouseHint || executionPlan.needsClickhouse;
    let mergedClickhouseCountHint = socialOnlyPrompt
      ? 0
      : Math.max(
          toNumber(requestMode.clickhouseCountHint, 0),
          toNumber(executionPlan.clickhouseCount, 0)
        );

    const fallbackChecklistPlan = buildRequestChecklistPlan({
      socialOnlyRequest: socialOnlyPrompt,
      strictToRequest,
      wantsNaturalOnly,
      wantsVisualization,
      explicitDrawRequest,
      wantsAnimation
    });
    let requestChecklistPlan = await executeInstructionChecklistAuthorStage({
      apiKey,
      baseUrl,
      model: modelSelection.coordinator,
      turns,
      context,
      modePlan: requestMode,
      executionPlan,
      fallback: fallbackChecklistPlan
    });

    let socialOnlyRequest = socialOnlyPrompt;
    if (!socialOnlyRequest && requestChecklistPlan.requestKind !== "task") {
      requestChecklistPlan = {
        ...requestChecklistPlan,
        requestKind: "task",
        source: requestChecklistPlan.source
      };
    }
    if (socialOnlyRequest) {
      explicitDrawRequest = false;
      wantsVisualization = false;
      wantsAnimation = false;
      wantsNaturalOnly = true;
      strictToRequest = true;
      mergedBacktestHint = false;
      mergedClickhouseHint = false;
      mergedClickhouseCountHint = 0;
      requestChecklistPlan = {
        ...requestChecklistPlan,
        requestKind: "social",
        requiresNaturalResponse: true,
        requiresGraph: false,
        requiresDraw: false,
        requiresAnimation: false,
        shouldAvoidDataFetch: true,
        strictToRequest: true,
        items:
          requestChecklistPlan.items.length > 0
            ? requestChecklistPlan.items
            : [
                {
                  id: "intent",
                  label: "Intent: social conversation",
                  required: true,
                  artifact: "scope"
                },
                {
                  id: "natural",
                  label: "Natural-language reply",
                  required: true,
                  artifact: "natural"
                },
                {
                  id: "social_scope",
                  label: "No market artifacts for social request",
                  required: true,
                  artifact: "scope"
                }
              ],
        source: requestChecklistPlan.source
      };
    } else {
      explicitDrawRequest = explicitDrawRequest || requestChecklistPlan.requiresDraw;
      wantsVisualization = wantsVisualization || requestChecklistPlan.requiresGraph;
      wantsAnimation = wantsAnimation || requestChecklistPlan.requiresAnimation;
      wantsNaturalOnly =
        wantsNaturalOnly ||
        (requestChecklistPlan.requiresNaturalResponse &&
          !requestChecklistPlan.requiresGraph &&
          !requestChecklistPlan.requiresDraw &&
          !requestChecklistPlan.requiresAnimation);
      strictToRequest = strictToRequest && requestChecklistPlan.strictToRequest;
    }

    const requestedGraphType = socialOnlyRequest ? "" : toText(executionPlan.graphType, "");
    let forcedGraphTemplate = resolveToolboxGraphTemplate(requestedGraphType);
    let graphToolingNeedsNewTool = false;
    if (
      !socialOnlyRequest &&
      (executionPlan.graphNeeded || requestChecklistPlan.requiresGraph) &&
      requestedGraphType &&
      !forcedGraphTemplate
    ) {
      toolsUsed.add("coding_graph_tooling");
      const graphResolution = await executeGraphToolboxResolutionStage({
        apiKey,
        baseUrl,
        model: modelSelection.coding,
        requestedGraphType
      });
      forcedGraphTemplate = graphResolution.resolvedTemplate;
      graphToolingNeedsNewTool = graphResolution.needsNewTooling;
    }
    if (forcedGraphTemplate) {
      toolsUsed.add("graph_template_resolution");
    }

    if (socialOnlyRequest) {
      const shortAnswer = sanitizeAssistantText(
        await executeSocialReplyStage({
          apiKey,
          baseUrl,
          model: modelSelection.writer,
          turns
        })
      );
      const emptyActions = normalizeChartActions([]);
      const emptyAnimations = normalizeChartAnimationsFromCoding({});
      const requestChecklist = buildResponseChecklist({
        plan: requestChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [],
        chartActions: emptyActions,
        chartAnimations: emptyAnimations,
        toolsUsed
      });

      return NextResponse.json({
        status: "ok",
        response: {
          cannotAnswer: false,
          cannotAnswerReason: "",
          shortAnswer,
          bullets: [],
          charts: [],
          chartActions: [],
          chartAnimations: [],
          requestChecklist,
          toolsUsed: []
        },
        modelTrace: null,
        dataTrace: {
          requestMode: requestMode.mode,
          requestChecklistPlan,
          executionPlan,
          runtimeClock: buildRuntimeClock({
            nowMs: runtimeNowMs,
            context,
            clickhouseCandles: []
          }),
          internetContext: null,
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    }

    if (context.liveCandles.length > 0) {
      toolsUsed.add("live_stream_data");
    }

    const toolState: ToolState = {
      clickhouseCandles: [],
      clickhouseMeta: null,
      requestedBacktestData: false,
      internetContext: null
    };

    if (
      mergedBacktestHint &&
      context.backtest.hasRun &&
      !context.backtest.dataIncluded
    ) {
      toolsUsed.add("backtest_data_request");
      return NextResponse.json({
        status: "needs_backtest_data",
        reason: "Detailed backtest rows are needed to fulfill this request accurately.",
        request: {
          type: "backtest_trades"
        },
        response: {
          toolsUsed: Array.from(toolsUsed).map(normalizeToolLabel)
        },
        modelTrace: null
      });
    }

    const planningResult = await executePlanningStage({
      apiKey,
      baseUrl,
      model: modelSelection.coordinator,
      turns,
      context,
      request,
      toolState,
      nowMs: runtimeNowMs
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

    const shouldAutofetchInternet =
      !socialOnlyRequest &&
      toolState.internetContext === null &&
      (Boolean(planningResult.planning.needsInternetData) || internetContextRequested);

    if (shouldAutofetchInternet) {
      const internetQuery = buildAutoInternetQuery({
        prompt: lastUserPrompt,
        planningQuery: planningResult.planning.internetQuery
      });
      if (internetQuery.query) {
        const contextResult = await fetchInternetContext({
          query: internetQuery.query,
          recencyDays: toNumber(internetQuery.recencyDays, 3),
          maxResults: toNumber(internetQuery.maxResults, 5)
        });
        toolState.internetContext = contextResult;
        planningResult.planning.needsInternetData = true;
        planningResult.planning.internetQuery = internetQuery;
        if (contextResult.results.length > 0) {
          toolsUsed.add("internet_search");
        }
      }
    }
    if (toolState.internetContext && toolState.internetContext.results.length > 0) {
      toolsUsed.add("internet_search");
    }

    const shouldAutofetchClickhouse =
      toolState.clickhouseCandles.length === 0 &&
      (Boolean(planningResult.planning.needsClickhouseData) ||
        mergedClickhouseHint ||
        explicitDrawRequest ||
        wantsVisualization ||
        (indicatorComputationRequested && context.liveCandles.length < 80));

    if (shouldAutofetchClickhouse) {
      const autoQuery: NonNullable<PlanningOutput["clickhouseQuery"]> =
        buildAutoClickhouseQuery({
        context,
        prompt: lastUserPrompt,
        nowMs: runtimeNowMs,
        planningQuery: planningResult.planning.clickhouseQuery
        }) ?? {};
      if (mergedClickhouseCountHint > 0) {
        autoQuery.count = Math.max(
          toNumber(autoQuery.count, 0),
          mergedClickhouseCountHint
        );
      }

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

    let indicatorSnapshot = buildIndicatorSnapshot(
      getRecentWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      })
    );
    let indicatorCodingResult: IndicatorCodingResult = {
      computed: {},
      computedAny: false,
      requiredMinCandles: 0,
      needsMoreData: false
    };
    if (indicatorComputationRequested && requestedIndicators.length > 0) {
      indicatorCodingResult = await executeIndicatorCodingStage({
        apiKey,
        baseUrl,
        model: modelSelection.coding,
        prompt: lastUserPrompt,
        requestedIndicators,
        candles: getRecentWindowCandles({
          context,
          clickhouseCandles: toolState.clickhouseCandles
        }),
        indicatorSnapshot,
        nowMs: runtimeNowMs
      });

      if (indicatorCodingResult.needsMoreData) {
        const codingQuery = buildAutoClickhouseQuery({
          context,
          prompt: lastUserPrompt,
          nowMs: runtimeNowMs,
          planningQuery: planningResult.planning.clickhouseQuery
        }) ?? {};
        const desiredCount = clamp(
          Math.max(
            toNumber(codingQuery.count, getRecentWindowCount(context.timeframe)),
            indicatorCodingResult.requiredMinCandles + 120,
            320
          ),
          80,
          MAX_CLICKHOUSE_COUNT
        );

        const availableCount = getRecentWindowCandles({
          context,
          clickhouseCandles: toolState.clickhouseCandles
        }).length;
        if (desiredCount > availableCount) {
          try {
            const result = await fetchClickhouseCandles(request, {
              ...codingQuery,
              count: desiredCount
            });
            if (result.candles.length > 0) {
              toolState.clickhouseCandles = result.candles;
              toolState.clickhouseMeta = {
                pair: result.pair,
                timeframe: result.timeframe,
                count: result.candles.length
              };
              planningResult.planning.needsClickhouseData = true;
              planningResult.planning.clickhouseQuery = {
                ...codingQuery,
                count: desiredCount
              };
              toolsUsed.add("clickhouse_candles");
            }
          } catch {
            // Continue with current data.
          }
        }

        indicatorCodingResult = await executeIndicatorCodingStage({
          apiKey,
          baseUrl,
          model: modelSelection.coding,
          prompt: lastUserPrompt,
          requestedIndicators,
          candles: getRecentWindowCandles({
            context,
            clickhouseCandles: toolState.clickhouseCandles
          }),
          indicatorSnapshot: buildIndicatorSnapshot(
            getRecentWindowCandles({
              context,
              clickhouseCandles: toolState.clickhouseCandles
            })
          ),
          nowMs: runtimeNowMs
        });
      }

      if (indicatorCodingResult.computedAny) {
        toolsUsed.add("coding_indicator_tooling");
      }
    }

    indicatorSnapshot = mergeIndicatorSnapshot({
      baseSnapshot: buildIndicatorSnapshot(
        getRecentWindowCandles({
          context,
          clickhouseCandles: toolState.clickhouseCandles
        })
      ),
      computed: indicatorCodingResult.computed
    });

    let dataAnalysis = await executeDataAnalysisStage({
      apiKey,
      baseUrl,
      model: modelSelection.analysis,
      turns,
      context,
      toolState,
      planning: planningResult.planning,
      indicatorSnapshot,
      nowMs: runtimeNowMs
    });
    if (dataAnalysis.summary || dataAnalysis.keyFindings.length > 0) {
      toolsUsed.add("analysis_model");
    }

    let reasoning = await executeReasoningStage({
      apiKey,
      baseUrl,
      models: modelSelection,
      turns,
      context,
      toolState,
      planning: planningResult.planning,
      requestChecklist: requestChecklistPlan,
      indicatorSnapshot,
      dataAnalysis,
      nowMs: runtimeNowMs
    });

    const shouldRetryReasoningWithMoreData =
      reasoning.cannotAnswer &&
      toolState.clickhouseCandles.length === 0 &&
      (wantsVisualization ||
        explicitDrawRequest ||
        indicatorComputationRequested ||
        mergedClickhouseHint ||
        context.liveCandles.length < 80);

    if (shouldRetryReasoningWithMoreData) {
      const recoveryQuery: NonNullable<PlanningOutput["clickhouseQuery"]> =
        buildAutoClickhouseQuery({
        context,
        prompt: lastUserPrompt,
        nowMs: runtimeNowMs,
        planningQuery: planningResult.planning.clickhouseQuery
        }) ?? {};
      if (mergedClickhouseCountHint > 0) {
        recoveryQuery.count = Math.max(
          toNumber(recoveryQuery.count, 0),
          mergedClickhouseCountHint
        );
      }

      try {
        const result = await fetchClickhouseCandles(request, {
          ...recoveryQuery,
          count: Math.max(toNumber(recoveryQuery?.count, 240), 240)
        });
        if (result.candles.length > 0) {
          toolState.clickhouseCandles = result.candles;
          toolState.clickhouseMeta = {
            pair: result.pair,
            timeframe: result.timeframe,
            count: result.candles.length
          };
          planningResult.planning.needsClickhouseData = true;
          planningResult.planning.clickhouseQuery = recoveryQuery;
          toolsUsed.add("clickhouse_candles");

          const retryBaseSnapshot = buildIndicatorSnapshot(
            getRecentWindowCandles({
              context,
              clickhouseCandles: toolState.clickhouseCandles
            })
          );
          const retryIndicatorCoding =
            indicatorComputationRequested && requestedIndicators.length > 0
              ? await executeIndicatorCodingStage({
                  apiKey,
                  baseUrl,
                  model: modelSelection.coding,
                  prompt: lastUserPrompt,
                  requestedIndicators,
                  candles: getRecentWindowCandles({
                    context,
                    clickhouseCandles: toolState.clickhouseCandles
                  }),
                  indicatorSnapshot: retryBaseSnapshot,
                  nowMs: runtimeNowMs
                })
              : {
                  computed: {},
                  computedAny: false,
                  requiredMinCandles: 0,
                  needsMoreData: false
                };
          if (retryIndicatorCoding.computedAny) {
            toolsUsed.add("coding_indicator_tooling");
          }
          indicatorSnapshot = mergeIndicatorSnapshot({
            baseSnapshot: retryBaseSnapshot,
            computed: retryIndicatorCoding.computed
          });
          dataAnalysis = await executeDataAnalysisStage({
            apiKey,
            baseUrl,
            model: modelSelection.analysis,
            turns,
            context,
            toolState,
            planning: planningResult.planning,
            indicatorSnapshot,
            nowMs: runtimeNowMs
          });
          if (dataAnalysis.summary || dataAnalysis.keyFindings.length > 0) {
            toolsUsed.add("analysis_model");
          }
          reasoning = await executeReasoningStage({
            apiKey,
            baseUrl,
            models: modelSelection,
            turns,
            context,
            toolState,
            planning: planningResult.planning,
            requestChecklist: requestChecklistPlan,
            indicatorSnapshot,
            dataAnalysis,
            nowMs: runtimeNowMs
          });
        }
      } catch {
        // Keep current reasoning result.
      }
    }

    const codingResult = socialOnlyRequest
      ? {
          chartPlans: [] as ChartPlan[],
          chartActions: normalizeChartActions([]),
          chartAnimations: normalizeChartAnimationsFromCoding({})
        }
      : await executeCodingStage({
          apiKey,
          baseUrl,
          models: modelSelection,
          reasoning,
          dataAnalysis,
          indicatorSnapshot,
          context,
          toolState,
          requestMode,
          requestedGraphType,
          forcedGraphTemplate,
          wantsAnimation,
          nowMs: runtimeNowMs
        });

    if (toolState.clickhouseCandles.length > 0) {
      toolsUsed.add("clickhouse_candles");
    }

    let charts = wantsVisualization
      ? buildChartsFromPlans(codingResult.chartPlans, context, toolState)
      : [];
    if (wantsVisualization && charts.length === 0) {
      const sourceRows = getRecentWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      });
      const fallbackTemplateId =
        forcedGraphTemplate ||
        resolveToolboxGraphTemplate(requestedGraphType) ||
        "price_action";
      const fallbackTitle =
        requestedGraphType ||
        resolveGraphTemplate(fallbackTemplateId).title;
      const synthesized = buildPriceValueSeriesChart(
        sourceRows,
        fallbackTitle,
        260,
        fallbackTemplateId
      );
      if (synthesized && synthesized.data.length > 0) {
        synthesized.mode = resolveGraphTemplate(fallbackTemplateId).mode;
        charts = [synthesized];
        toolsUsed.add("coding_graph_tooling");
      }
    }
    let chartActions = explicitDrawRequest || wantsAnimation ? codingResult.chartActions : [];
    if (explicitDrawRequest) {
      const drawCandles = getDrawWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      });
      const dataAnchoredDrawActions = buildDrawActionsFromPrompt({
        prompt: lastUserPrompt,
        candles: drawCandles
      });
      const hasControlAction = dataAnchoredDrawActions.some((action) => {
        const type = String((action as Record<string, unknown>).type || "");
        return type === "adjust_previous_drawings" || type === "toggle_dynamic_support_resistance";
      });
      chartActions = normalizeChartActions(
        hasControlAction
          ? dataAnchoredDrawActions
          : [{ type: "clear_annotations" }, ...dataAnchoredDrawActions]
      );
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
    const marketPriceAnchor = buildMarketPriceAnchor({
      candles: getRecentWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      }),
      nowMs: runtimeNowMs
    });
    const isDrawOnlyRequest = explicitDrawRequest && !wantsVisualization;
    const drawSummary = summarizeDrawnActions(chartActions);
    const responseCannotAnswer = explicitDrawRequest
      ? chartActions.length === 0 && reasoning.cannotAnswer
      : wantsVisualization
        ? charts.length === 0 && reasoning.cannotAnswer
        : reasoning.cannotAnswer;
    const responseCannotAnswerReason = responseCannotAnswer ? reasoning.cannotAnswerReason : "";
    const shortAnswer = explicitDrawRequest
      ? drawSummary ||
        (isDrawOnlyRequest
          ? responseCannotAnswer
            ? reasoning.cannotAnswerReason
            : sanitizeAssistantText(reasoning.shortAnswer || reasoning.cannotAnswerReason)
          : sanitizeAssistantText(reasoning.shortAnswer))
      : sanitizeAssistantText(reasoning.shortAnswer || reasoning.cannotAnswerReason);

    const baseBullets = isDrawOnlyRequest
      ? []
      : reasoning.bullets.length > 0
        ? reasoning.bullets
        : responseCannotAnswer
          ? [{ tone: "gold" as const, text: reasoning.cannotAnswerReason }]
          : [];
    let finalBullets =
      strictToRequest && wantsNaturalOnly
        ? []
        : baseBullets;
    const rawFinalShortAnswer = sanitizeDeliveryText(
      shortAnswer ||
        (finalBullets.length > 0 ? sanitizeAssistantText(finalBullets[0]?.text ?? "") : "")
    );
    let finalShortAnswer = rawFinalShortAnswer;
    const checklistAudit = await executeInstructionChecklistAuditStage({
      apiKey,
      baseUrl,
      model: modelSelection.coordinator,
      turns,
      checklistPlan: requestChecklistPlan,
      candidate: {
        shortAnswer: finalShortAnswer,
        cannotAnswer: responseCannotAnswer,
        cannotAnswerReason: responseCannotAnswerReason,
        bullets: finalBullets,
        chartsCount: charts.length,
        drawingsCount: chartActions.length,
        animationsCount: chartAnimations.length,
        toolsUsed: Array.from(toolsUsed).map(normalizeToolLabel)
      }
    });
    if (checklistAudit) {
      if (!checklistAudit.allowCharts) {
        charts = [];
        toolsUsed.delete("coding_graph_tooling");
        toolsUsed.delete("graph_template_resolution");
      }
      if (!checklistAudit.allowDrawings) {
        chartActions = [];
        toolsUsed.delete("chart_actions");
      }
      if (!checklistAudit.allowAnimations) {
        chartAnimations = [];
        toolsUsed.delete("chart_animation");
      }
      if (!checklistAudit.allowBullets) {
        finalBullets = [];
      } else if (checklistAudit.bullets.length > 0) {
        finalBullets = checklistAudit.bullets;
      }
      if (checklistAudit.shortAnswer) {
        finalShortAnswer = sanitizeDeliveryText(checklistAudit.shortAnswer);
      }
    }

    const shouldUseSpeakerRewrite = Boolean(finalShortAnswer || responseCannotAnswerReason);
    if (shouldUseSpeakerRewrite && (finalShortAnswer || responseCannotAnswerReason)) {
      const rewritten = await executeSpeakerStage({
        apiKey,
        baseUrl,
        model: modelSelection.writer,
        turns,
        draftAnswer: finalShortAnswer || responseCannotAnswerReason,
        cannotAnswer: responseCannotAnswer,
        cannotAnswerReason: responseCannotAnswerReason,
        marketAnchor: marketPriceAnchor,
        strictPriceAnchoring: true
      });
      if (rewritten) {
        finalShortAnswer = sanitizeDeliveryText(rewritten);
      }
    }
    if (hasOutOfRangePriceReference({ text: finalShortAnswer, anchor: marketPriceAnchor })) {
      const anchoredRewrite = await executeSpeakerStage({
        apiKey,
        baseUrl,
        model: modelSelection.writer,
        turns,
        draftAnswer: finalShortAnswer,
        cannotAnswer: responseCannotAnswer,
        cannotAnswerReason: responseCannotAnswerReason,
        marketAnchor: marketPriceAnchor,
        strictPriceAnchoring: true
      });
      if (
        anchoredRewrite &&
        !hasOutOfRangePriceReference({ text: anchoredRewrite, anchor: marketPriceAnchor })
      ) {
        finalShortAnswer = sanitizeDeliveryText(anchoredRewrite);
      } else if (marketPriceAnchor) {
        finalShortAnswer = sanitizeDeliveryText(
          `Current ${context.symbol} live price is around ${marketPriceAnchor.latestClose.toFixed(2)}. I would wait for confirmation around this current range before acting.`
        );
      }
    }
    const requestChecklist = buildResponseChecklist({
      plan: requestChecklistPlan,
      shortAnswer: finalShortAnswer,
      responseCannotAnswer,
      charts,
      chartActions,
      chartAnimations,
      toolsUsed
    });

    const responseRuntimeClock = buildRuntimeClock({
      nowMs: runtimeNowMs,
      context,
      clickhouseCandles: toolState.clickhouseCandles
    });
    const responseInternetContext = toolState.internetContext
      ? {
          provider: toolState.internetContext.provider,
          query: toolState.internetContext.query,
          count: toolState.internetContext.results.length,
          fetchedAt: toolState.internetContext.fetchedAt
        }
      : null;

    // Ensure request-scope data is explicitly released after shaping response.
    toolState.clickhouseCandles = [];
    toolState.internetContext = null;

    return NextResponse.json({
      status: "ok",
      response: {
        cannotAnswer: responseCannotAnswer,
        cannotAnswerReason: responseCannotAnswerReason,
        shortAnswer: finalShortAnswer,
        bullets: finalBullets,
        charts,
        chartActions,
        chartAnimations,
        requestChecklist,
        toolsUsed: Array.from(toolsUsed).map(normalizeToolLabel)
      },
      modelTrace: null,
      dataTrace: {
        requestMode: requestMode.mode,
        requestChecklistPlan,
        executionPlan,
        runtimeClock: responseRuntimeClock,
        internetContext: responseInternetContext,
        requestModeHints: {
          needsClickhouse: mergedClickhouseHint,
          clickhouseCount: mergedClickhouseCountHint || null,
          needsBacktest: mergedBacktestHint,
          strictToRequest,
          naturalOnly: wantsNaturalOnly
        },
        graphPlan: {
          requestedGraphType,
          forcedGraphTemplate,
          graphToolingNeedsNewTool
        },
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
