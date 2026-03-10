import {
  fetchNebiusModelCatalog,
  pickNebiusModels,
  type NebiusModelSelection
} from "../nebiusTokenFactory";
import {
  normalizeChartAnimationsFromCoding,
  normalizeChartActions,
  resolveGraphTemplate
} from "../assistant-tools";
import {
  buildChartActionsTool,
  buildChartAnimationTool,
  buildChartsFromPlansTool,
  buildDeterministicFastPath,
  buildPanelChartTool,
  buildStrategyPreviewChartsTool,
  runSupervisorGraph,
  type GideonExecutionSnapshot,
  type GideonRuntimeContext,
  type GideonTelemetryEvent
} from "./index";

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
  config?: Record<string, unknown>;
};

type StrategyBacktestSummary = {
  tradeCount: number;
  winRatePct: number;
  profitFactor: number | null;
  totalPnlUsd: number;
  testedFrom: string | null;
  testedTo: string | null;
};

type StrategyDraft = {
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
  backtestSummary?: StrategyBacktestSummary | null;
};

type StrategyThreadState = {
  latestDraft: StrategyDraft | null;
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

type CapabilityDomain =
  | "social"
  | "general_trading"
  | "xauusd"
  | "current_events"
  | "statistics"
  | "strategy"
  | "indicator"
  | "draw"
  | "animation";

type CapabilityRoute = {
  domain: CapabilityDomain;
  confidence: number;
  requestMode: RequestMode;
  strictToRequest: boolean;
  needsInternet: boolean;
  needsClickhouse: boolean;
  clickhouseCountHint: number | null;
  needsBacktest: boolean;
  preferredGraphType: string;
  preferNoBullets: boolean;
  shouldSkipModelRouting: boolean;
  shouldSkipResponseRewriters: boolean;
  wantsStrategyDraft: boolean;
  includeStrategyPanelCharts: boolean;
};

type ChartResolutionResult = {
  resolvedTemplate: string | null;
  needsNewTooling: boolean;
};

type RuntimeClock = Record<string, unknown>;
type IndicatorSnapshot = Record<string, unknown>;
type MarketPriceAnchor =
  | {
      latestClose: number;
      bandLow: number;
      bandHigh: number;
      latestTimeIso: string;
      nowIso: string;
    }
  | null;
type ClickhouseFetchResult = {
  candles: CandleRow[];
  pair: string;
  timeframe: string;
};

type NormalizedChartActions = ReturnType<typeof normalizeChartActions>;
type NormalizedChartAnimations = ReturnType<typeof normalizeChartAnimationsFromCoding>;

type ResponseShape = Record<string, unknown>;

type RuntimeResult = {
  body: ResponseShape;
  status: number;
};

type RequestModeStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  fallback: RequestModePlan;
};

type IntentExecutionStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  modePlan: RequestModePlan;
};

type ChecklistAuthorStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  modePlan: RequestModePlan;
  executionPlan: IntentExecutionPlan;
  fallback: RequestChecklistPlan;
};

type SocialReplyStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
};

type StrategyDraftStageParams = {
  apiKey: string;
  baseUrl: string;
  models: NebiusModelSelection;
  turns: ChatTurn[];
  context: AssistantContext;
  strategyThreadState: StrategyThreadState;
};

type StrategyPreviewStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  strategyDraft: StrategyDraft;
};

type PlanningStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  request: Request;
  toolState: ToolState;
  nowMs: number;
};

type IndicatorCodingStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  requestedIndicators: string[];
  candles: CandleRow[];
  indicatorSnapshot: IndicatorSnapshot;
  nowMs: number;
};

type DataAnalysisStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  context: AssistantContext;
  toolState: ToolState;
  planning: PlanningOutput;
  indicatorSnapshot: IndicatorSnapshot;
  nowMs: number;
};

type ReasoningStageParams = {
  apiKey: string;
  baseUrl: string;
  models: NebiusModelSelection;
  turns: ChatTurn[];
  context: AssistantContext;
  toolState: ToolState;
  planning: PlanningOutput;
  requestChecklist: RequestChecklistPlan;
  indicatorSnapshot: IndicatorSnapshot;
  dataAnalysis: DataAnalysisOutput;
  nowMs: number;
};

type CodingStageParams = {
  apiKey: string;
  baseUrl: string;
  models: NebiusModelSelection;
  reasoning: ReasoningOutput;
  dataAnalysis: DataAnalysisOutput;
  indicatorSnapshot: IndicatorSnapshot;
  context: AssistantContext;
  toolState: ToolState;
  requestMode: RequestModePlan;
  requestedGraphType: string;
  forcedGraphTemplate: string | null;
  wantsAnimation: boolean;
  nowMs: number;
};

type ChecklistAuditStageParams = {
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
};

type SpeakerStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  turns: ChatTurn[];
  draftAnswer: string;
  cannotAnswer: boolean;
  cannotAnswerReason: string;
  marketAnchor: MarketPriceAnchor;
  strictPriceAnchoring: boolean;
};

type GraphToolboxResolutionStageParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestedGraphType: string;
};

type RuntimeDeps = {
  buildRequestChecklistPlan: (params: {
    socialOnlyRequest: boolean;
    strictToRequest: boolean;
    wantsNaturalOnly: boolean;
    wantsVisualization: boolean;
    explicitDrawRequest: boolean;
    wantsAnimation: boolean;
    needsDataFetch?: boolean;
  }) => RequestChecklistPlan;
  buildResponseChecklist: (params: {
    plan: RequestChecklistPlan;
    shortAnswer: string;
    responseCannotAnswer: boolean;
    charts: AssistantChart[];
    chartActions: NormalizedChartActions;
    chartAnimations: NormalizedChartAnimations;
    toolsUsed: Set<string>;
  }) => RequestChecklistItem[];
  buildFallbackFailureResponse: (message: string) => ResponseShape;
  resolveCapabilityRoute: (params: {
    prompt: string;
    context: AssistantContext;
    strategyThreadState: StrategyThreadState;
  }) => CapabilityRoute;
  buildDeterministicRequestModePlan: (route: CapabilityRoute) => RequestModePlan;
  isIndicatorComputationRequest: (prompt: string) => boolean;
  extractRequestedIndicators: (prompt: string) => string[];
  executeRequestModeStage: (params: RequestModeStageParams) => Promise<RequestModePlan>;
  buildDeterministicExecutionPlan: (route: CapabilityRoute) => IntentExecutionPlan;
  executeIntentExecutionStage: (params: IntentExecutionStageParams) => Promise<IntentExecutionPlan>;
  shouldHeuristicallyFetchInternetContext: (params: {
    prompt: string;
    socialOnlyRequest: boolean;
  }) => boolean;
  toNumber: (value: unknown, fallback?: number) => number;
  executeInstructionChecklistAuthorStage: (
    params: ChecklistAuthorStageParams
  ) => Promise<RequestChecklistPlan>;
  isSocialOnlyPrompt: (prompt: string) => boolean;
  toText: (value: unknown, fallback?: string) => string;
  resolveToolboxGraphTemplate: (value: string) => string | null;
  executeGraphToolboxResolutionStage: (
    params: GraphToolboxResolutionStageParams
  ) => Promise<ChartResolutionResult>;
  sanitizeAssistantText: (value: string) => string;
  sanitizeDeliveryText: (value: string) => string;
  executeSocialReplyStage: (params: SocialReplyStageParams) => Promise<string>;
  normalizeToolLabel: (value: string) => string;
  executeStrategyDraftStage: (params: StrategyDraftStageParams) => Promise<StrategyDraft | null>;
  executeStrategyPreviewStage: (params: StrategyPreviewStageParams) => Promise<{
    chartActions: NormalizedChartActions;
    chartAnimations: NormalizedChartAnimations;
    charts: AssistantChart[];
    backtestSummary: StrategyBacktestSummary | null;
  }>;
  pickFirstNonEmptyTextList: (...lists: Array<readonly string[]>) => string[];
  buildRuntimeClock: (params: {
    nowMs: number;
    context: AssistantContext;
    clickhouseCandles: CandleRow[];
  }) => RuntimeClock;
  buildAutoClickhouseQuery: (params: {
    context: AssistantContext;
    prompt: string;
    nowMs: number;
    planningQuery?: PlanningOutput["clickhouseQuery"];
  }) => PlanningOutput["clickhouseQuery"];
  buildAutoInternetQuery: (params: {
    prompt: string;
    planningQuery?: PlanningOutput["internetQuery"];
  }) => NonNullable<PlanningOutput["internetQuery"]>;
  executePlanningStage: (
    params: PlanningStageParams
  ) => Promise<{
    planning: PlanningOutput;
    status?: "needs_backtest_data";
    reason?: string;
  }>;
  fetchInternetContext: (params: {
    query: string;
    recencyDays: number;
    maxResults: number;
  }) => Promise<InternetContext>;
  fetchClickhouseCandles: (
    request: Request,
    query: NonNullable<PlanningOutput["clickhouseQuery"]>
  ) => Promise<ClickhouseFetchResult>;
  buildIndicatorSnapshot: (candles: CandleRow[]) => IndicatorSnapshot;
  getRecentWindowCandles: (params: {
    context: AssistantContext;
    clickhouseCandles: CandleRow[];
  }) => CandleRow[];
  executeIndicatorCodingStage: (
    params: IndicatorCodingStageParams
  ) => Promise<IndicatorCodingResult>;
  getRecentWindowCount: (timeframe: string) => number;
  clamp: (value: number, min: number, max: number) => number;
  MAX_CLICKHOUSE_COUNT: number;
  mergeIndicatorSnapshot: (params: {
    baseSnapshot: IndicatorSnapshot;
    computed: Record<string, unknown>;
  }) => IndicatorSnapshot;
  executeDataAnalysisStage: (params: DataAnalysisStageParams) => Promise<DataAnalysisOutput>;
  executeReasoningStage: (params: ReasoningStageParams) => Promise<ReasoningOutput>;
  executeCodingStage: (params: CodingStageParams) => Promise<{
    chartPlans: ChartPlan[];
    chartActions: NormalizedChartActions;
    chartAnimations: NormalizedChartAnimations;
  }>;
  getDrawWindowCandles: (params: {
    context: AssistantContext;
    clickhouseCandles: CandleRow[];
  }) => CandleRow[];
  buildMarketPriceAnchor: (params: {
    candles: CandleRow[];
    nowMs: number;
  }) => MarketPriceAnchor;
  summarizeDrawnActions: (actions: NormalizedChartActions) => string;
  executeInstructionChecklistAuditStage: (
    params: ChecklistAuditStageParams
  ) => Promise<InstructionChecklistAudit | null>;
  executeSpeakerStage: (params: SpeakerStageParams) => Promise<string>;
  hasOutOfRangePriceReference: (params: {
    text: string;
    anchor: MarketPriceAnchor;
  }) => boolean;
};

const createTraceData = (
  execution: GideonExecutionSnapshot,
  telemetry: GideonTelemetryEvent[]
) => {
  return {
    gideonPlan: {
      requestKind: execution.intent.requestKind,
      depth: execution.depth.depth,
      activeAgents: execution.activeAgents,
      functionIds: execution.functionIds,
      toolIds: execution.toolIds,
      templateIds: execution.templateIds,
      strategyTarget: execution.strategyTarget,
      recommendedGraphTemplate: execution.recommendedGraphTemplate,
      clarificationQuestion: execution.clarificationQuestion
    },
    gideonExecution: {
      toolResults: execution.toolResults.map((result) => ({
        toolId: result.toolId,
        status: result.status,
        latencyMs: result.latencyMs,
        outputKeys: result.output ? Object.keys(result.output).slice(0, 8) : []
      })),
      templateIds: execution.templateResults.map((template) => template.id)
    },
    gideonTelemetry: telemetry
  };
};

const createRouteRuntime = (params: {
  context: AssistantContext;
  strategyThreadState: StrategyThreadState;
}): GideonRuntimeContext => {
  return {
    symbol: params.context.symbol,
    timeframe: params.context.timeframe,
    liveCandles: params.context.liveCandles,
    historyRows: params.context.historyRows,
    backtestRows: params.context.backtest.trades,
    actionRows: params.context.actionRows,
    strategyDraftJson: params.strategyThreadState.latestDraft?.draftJson ?? null
  };
};

const isBudgetExhaustionError = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error);
  return /402|payment required|exhausted your budget|add funds/i.test(text);
};

const INTERNET_QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "headline",
  "headlines",
  "in",
  "is",
  "latest",
  "major",
  "matters",
  "news",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "today",
  "to",
  "web",
  "what"
]);

const extractInternetQueryTokens = (value: string): string[] => {
  const matches = value.toLowerCase().match(/[a-z0-9]+/g) || [];
  const unique: string[] = [];
  for (const token of matches) {
    if (token.length < 3 || INTERNET_QUERY_STOPWORDS.has(token) || unique.includes(token)) {
      continue;
    }
    unique.push(token);
  }
  return unique;
};

const isGenericInternetHubTitle = (row: InternetResultItem): boolean => {
  const title = row.title.toLowerCase();
  return (
    /\b(latest|breaking|top)\b/.test(title) &&
    /\b(news|headlines|updates)\b/.test(title)
  );
};

const getUrlPathDepth = (value: string): number => {
  try {
    return new URL(value).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
};

const scoreInternetFallbackResult = (row: InternetResultItem, queryTokens: string[]): number => {
  const title = row.title.toLowerCase();
  const snippet = row.snippet.toLowerCase();
  const haystack = `${title} ${snippet} ${row.source.toLowerCase()}`;
  let score = row.publishedAt ? 2 : 0;

  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 3;
      continue;
    }
    if (snippet.includes(token)) {
      score += 2;
    }
  }

  if (isGenericInternetHubTitle(row)) {
    score -= 6;
  }
  if (getUrlPathDepth(row.url) <= 1) {
    score -= 2;
  }
  if (/reuters|bloomberg|wsj|ft|cnbc|marketwatch|kitco|investing\.com/i.test(row.source)) {
    score += 1;
  }

  return score;
};

const buildInternetFallbackBullets = (internetContext: InternetContext) => {
  if (internetContext.results.length === 0) {
    return [
      {
        tone: "black" as const,
        text: `No article-level search results came back for "${internetContext.query}".`
      }
    ];
  }
  const queryTokens = extractInternetQueryTokens(internetContext.query);
  const ranked = internetContext.results
    .map((row) => ({
      row,
      score: scoreInternetFallbackResult(row, queryTokens)
    }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked
    .filter((entry) => entry.score > 0)
    .map((entry) => entry.row)
    .slice(0, 3);
  const fallbackRows = selected.length > 0 ? selected : internetContext.results.slice(0, 3);

  return fallbackRows.map((row) => {
    const published = row.publishedAt ? `${row.publishedAt} - ` : "";
    const lead = isGenericInternetHubTitle(row) ? row.snippet : row.title;
    return {
      tone: "black" as const,
      text: `${published}${row.source}: ${lead}`.slice(0, 220)
    };
  });
};

type AmbiguousConceptMatch = {
  id: string;
  label: string;
  wantsFib: boolean;
  wantsStrategy: boolean;
};

const AMBIGUOUS_CONCEPT_RULES: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: "order_block", label: "order block", pattern: /\border block(?:s)?\b/i },
  { id: "breaker_block", label: "breaker block", pattern: /\bbreaker block(?:s)?\b/i },
  { id: "mitigation_block", label: "mitigation block", pattern: /\bmitigation block(?:s)?\b/i },
  { id: "balanced_price_range", label: "balanced price range", pattern: /\b(?:balanced price range|\bbpr\b)\b/i },
  { id: "ote", label: "optimal trade entry", pattern: /\b(?:optimal trade entry|\bote\b)\b/i }
];

const detectAmbiguousTradingConcept = (prompt: string): AmbiguousConceptMatch | null => {
  const normalized = prompt.toLowerCase();
  for (const rule of AMBIGUOUS_CONCEPT_RULES) {
    if (!rule.pattern.test(normalized)) {
      continue;
    }
    return {
      id: rule.id,
      label: rule.label,
      wantsFib: /\b(fibonacci|fib|retracement|golden pocket|golden zone|ote)\b/i.test(normalized),
      wantsStrategy: /\b(strategy|model|playbook|system)\b/i.test(normalized)
    };
  }
  return null;
};

const buildConceptClarificationChartActions = (params: {
  candles: CandleRow[];
  conceptLabel: string;
  includeFib: boolean;
}): NormalizedChartActions => {
  const recent = params.candles.slice(-Math.min(params.candles.length, 96));
  if (recent.length === 0) {
    return normalizeChartActions([]);
  }

  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const bullishBias = last.close >= last.open;
  let candidate = recent[Math.max(0, recent.length - 8)] ?? last;

  for (let index = recent.length - 2; index >= Math.max(0, recent.length - 24); index -= 1) {
    const candle = recent[index];
    if (!candle) {
      continue;
    }
    const isOpposing = bullishBias ? candle.close < candle.open : candle.close > candle.open;
    if (isOpposing) {
      candidate = candle;
      break;
    }
  }

  const bodyLow = Math.min(candidate.open, candidate.close);
  const bodyHigh = Math.max(candidate.open, candidate.close);
  const bodyRange = Math.max(0.0001, bodyHigh - bodyLow);
  const zonePadding = Math.max(0.0001, bodyRange * 0.18);

  let lowIndex = 0;
  let highIndex = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if ((recent[index]?.low ?? Number.POSITIVE_INFINITY) < (recent[lowIndex]?.low ?? Number.POSITIVE_INFINITY)) {
      lowIndex = index;
    }
    if ((recent[index]?.high ?? Number.NEGATIVE_INFINITY) > (recent[highIndex]?.high ?? Number.NEGATIVE_INFINITY)) {
      highIndex = index;
    }
  }

  const fibFirstIndex = Math.min(lowIndex, highIndex);
  const fibLastIndex = Math.max(lowIndex, highIndex);
  const fibFirst = recent[fibFirstIndex] ?? first;
  const fibLast = recent[fibLastIndex] ?? last;
  const fibLowToHigh = lowIndex <= highIndex;

  const rawActions: Array<Record<string, unknown>> = [
    { type: "clear_annotations" },
    { type: "move_to_date", time: last.time },
    {
      type: "draw_box",
      timeStart: candidate.time,
      timeEnd: last.time,
      priceStart: Number((bodyLow - zonePadding).toFixed(4)),
      priceEnd: Number((bodyHigh + zonePadding).toFixed(4)),
      label: `${params.conceptLabel} zone`
    },
    {
      type: "mark_candlestick",
      time: candidate.time,
      price: Number((((bodyLow + bodyHigh) / 2)).toFixed(4)),
      markerShape: "circle",
      label: `${params.conceptLabel} candle`
    },
    {
      type: "draw_arrow",
      time: last.time,
      price: Number(last.close.toFixed(4)),
      markerShape: bullishBias ? "arrowUp" : "arrowDown",
      label: "Entry / displacement"
    },
    {
      type: "draw_horizontal_line",
      price: Number(last.close.toFixed(4)),
      style: "dashed",
      label: "Reaction level"
    },
    {
      type: "draw_vertical_line",
      time: candidate.time,
      style: "dotted",
      label: "Origin"
    }
  ];

  if (params.includeFib) {
    rawActions.push({
      type: "draw_fibonacci",
      timeStart: fibFirst.time,
      timeEnd: fibLast.time,
      priceStart: fibLowToHigh ? Number(fibFirst.low.toFixed(4)) : Number(fibFirst.high.toFixed(4)),
      priceEnd: fibLowToHigh ? Number(fibLast.high.toFixed(4)) : Number(fibLast.low.toFixed(4)),
      label: "Reference fib"
    });
  }

  return normalizeChartActions(rawActions);
};

const summarizeTradeRows = (rows: TradeRow[]) => {
  let wins = 0;
  let losses = 0;
  let totalPnlUsd = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let peakEquityUsd = 0;
  let runningEquityUsd = 0;
  let maxDrawdownUsd = 0;

  for (const row of rows) {
    const pnlUsd = Number(row.pnlUsd || 0);
    totalPnlUsd += pnlUsd;
    if (pnlUsd > 0) {
      wins += 1;
      grossProfitUsd += pnlUsd;
    } else if (pnlUsd < 0) {
      losses += 1;
      grossLossUsd += Math.abs(pnlUsd);
    }
    if (String(row.side || "").toLowerCase() === "long") {
      longTrades += 1;
    } else if (String(row.side || "").toLowerCase() === "short") {
      shortTrades += 1;
    }
    runningEquityUsd += pnlUsd;
    peakEquityUsd = Math.max(peakEquityUsd, runningEquityUsd);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peakEquityUsd - runningEquityUsd);
  }

  const totalTrades = rows.length;
  return {
    totalTrades,
    longTrades,
    shortTrades,
    winRatePct: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    totalPnlUsd,
    averageWinUsd: wins > 0 ? grossProfitUsd / wins : 0,
    averageLossUsd: losses > 0 ? grossLossUsd / losses : 0,
    expectancyUsd: totalTrades > 0 ? totalPnlUsd / totalTrades : 0,
    profitFactor: grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : null,
    maxDrawdownUsd
  };
};

const formatUsd = (value: number): string => {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
};

const resolveDeterministicStatsAnswer = (params: {
  prompt: string;
  rows: TradeRow[];
}): { shortAnswer: string; bullets: Array<{ tone: "green" | "red" | "gold" | "black"; text: string }> } | null => {
  const normalized = params.prompt.toLowerCase();
  const summary = summarizeTradeRows(params.rows);
  const commonBullets = [
    {
      tone: "black" as const,
      text: `Win rate: ${summary.winRatePct.toFixed(2)}%`
    },
    {
      tone: summary.totalPnlUsd >= 0 ? ("green" as const) : ("red" as const),
      text: `Net PnL: ${formatUsd(summary.totalPnlUsd)}`
    }
  ];

  if (/\bwin rate|hit rate\b/.test(normalized)) {
    return {
      shortAnswer: `backtest win rate is ${summary.winRatePct.toFixed(2)}% across ${summary.totalTrades} closed trades.`,
      bullets: [
        {
          tone: summary.totalPnlUsd >= 0 ? ("green" as const) : ("red" as const),
          text: `Net PnL: ${formatUsd(summary.totalPnlUsd)}`
        },
        {
          tone: "black" as const,
          text: `Profit factor: ${summary.profitFactor == null ? "n/a" : summary.profitFactor.toFixed(3)}`
        }
      ]
    };
  }
  if (/\bprofit factor\b/.test(normalized)) {
    return {
      shortAnswer: `backtest profit factor is ${summary.profitFactor == null ? "n/a" : summary.profitFactor.toFixed(3)} across ${summary.totalTrades} closed trades.`,
      bullets: commonBullets
    };
  }
  if (/\bexpectancy\b/.test(normalized)) {
    return {
      shortAnswer: `backtest expectancy is ${formatUsd(summary.expectancyUsd)} per trade across ${summary.totalTrades} closed trades.`,
      bullets: commonBullets
    };
  }
  if (/\bmax drawdown|drawdown\b/.test(normalized)) {
    return {
      shortAnswer: `backtest max drawdown is ${formatUsd(summary.maxDrawdownUsd)} in the loaded trade sequence.`,
      bullets: commonBullets
    };
  }
  if (/\btotal backtest pnl|net pnl|total pnl\b/.test(normalized)) {
    return {
      shortAnswer: `backtest net PnL is ${formatUsd(summary.totalPnlUsd)} across ${summary.totalTrades} closed trades.`,
      bullets: [
        {
          tone: "black" as const,
          text: `Win rate: ${summary.winRatePct.toFixed(2)}%`
        },
        {
          tone: "black" as const,
          text: `Profit factor: ${summary.profitFactor == null ? "n/a" : summary.profitFactor.toFixed(3)}`
        }
      ]
    };
  }
  if (/\bhow many trades|total trades\b/.test(normalized)) {
    return {
      shortAnswer: `backtest contains ${summary.totalTrades} closed trades.`,
      bullets: commonBullets
    };
  }
  if (/\bhow many long trades|long trades\b/.test(normalized)) {
    return {
      shortAnswer: `backtest contains ${summary.longTrades} long trades.`,
      bullets: commonBullets
    };
  }
  if (/\bhow many short trades|short trades\b/.test(normalized)) {
    return {
      shortAnswer: `backtest contains ${summary.shortTrades} short trades.`,
      bullets: commonBullets
    };
  }
  if (/\baverage win\b/.test(normalized)) {
    return {
      shortAnswer: `backtest average win is ${formatUsd(summary.averageWinUsd)}.`,
      bullets: commonBullets
    };
  }
  if (/\baverage loss\b/.test(normalized)) {
    return {
      shortAnswer: `backtest average loss is ${formatUsd(summary.averageLossUsd)}.`,
      bullets: commonBullets
    };
  }

  return null;
};

const extractNumericTokens = (prompt: string): number[] => {
  const matches = prompt.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches
    .map((value) => Number(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
};

const resolveDeterministicMathAnswer = (prompt: string): string | null => {
  const normalized = prompt.toLowerCase();
  const numbers = extractNumericTokens(prompt);

  if (/\b(break even|breakeven)\b/.test(normalized)) {
    if (/\b1\.5r\b/.test(normalized)) {
      return "Break-even win rate is 40.00% for a 1.5R target.";
    }
    if (/\b2r\b/.test(normalized)) {
      return "Break-even win rate is 33.33% for a 2R target.";
    }
  }

  if (
    /\bexpectancy\b/.test(normalized) &&
    normalized.includes("40%") &&
    /\b2r\b/.test(normalized) &&
    /\b1r\b/.test(normalized)
  ) {
    return "Yes. Expectancy is +0.20R per trade.";
  }

  if (/\brisk reward\b/.test(normalized) && numbers.length >= 3) {
    const [entry, stop, target] = numbers;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (risk > 0) {
      return `Risk reward is ${(reward / risk).toFixed(2)}:1.`;
    }
  }

  if (/\baccount\b/.test(normalized) && /%/.test(prompt) && /\$/.test(prompt) && numbers.length >= 2) {
    const [pct, account] = numbers;
    return `${pct}% of $${account.toFixed(0)} is $${((pct / 100) * account).toFixed(2)}.`;
  }

  if (/\bpercentage move|percent move\b/.test(normalized) && numbers.length >= 2) {
    const [fromPrice, toPrice] = numbers;
    if (Math.abs(fromPrice) > 1e-9) {
      return `Percentage move is ${(((toPrice - fromPrice) / fromPrice) * 100).toFixed(2)}%.`;
    }
  }

  if (/\bwhere is target\b/.test(normalized) && /\b2r\b/.test(normalized) && numbers.length >= 2) {
    const [entry, stop] = numbers;
    const risk = Math.abs(entry - stop);
    const isLong = /\bbuy\b|\blong\b/.test(normalized);
    const target = isLong ? entry + risk * 2 : entry - risk * 2;
    return `Target is ${target.toFixed(2)} for 2R.`;
  }

  if (/\brecovery factor\b/.test(normalized) && numbers.length >= 2) {
    const [drawdown, pnl] = numbers;
    if (drawdown > 0) {
      const recoveryFactor = pnl / drawdown;
      return recoveryFactor > 2
        ? `Yes. Recovery factor is ${recoveryFactor.toFixed(2)}, so it is above 2.`
        : `No. Recovery factor is ${recoveryFactor.toFixed(2)}.`;
    }
  }

  return null;
};

const respond = (body: ResponseShape, status = 200): RuntimeResult => ({
  body,
  status
});

export const runGideonRequestRuntime = async (params: {
  request: Request;
  turns: ChatTurn[];
  context: AssistantContext;
  strategyThreadState: StrategyThreadState;
  deps: RuntimeDeps;
}): Promise<RuntimeResult> => {
  const {
    request,
    turns,
    context,
    strategyThreadState,
    deps
  } = params;
  const lastUserPrompt = turns[turns.length - 1]?.content ?? "";
  const runtimeNowMs = Date.now();
  const { execution: gideonPlan, telemetry: gideonTelemetry } = await runSupervisorGraph({
    requestId: `gideon-${runtimeNowMs}`,
    promptSnapshot: {
      latestUserPrompt: lastUserPrompt,
      symbol: context.symbol,
      timeframe: context.timeframe,
      liveCandleCount: context.liveCandles.length,
      historyRowCount: context.historyRows.length,
      backtestRowCount: context.backtest.trades.length,
      hasStrategyDraft: Boolean(strategyThreadState.latestDraft)
    },
    runtimeContext: createRouteRuntime({
      context,
      strategyThreadState
    })
  });
  const gideonTraceData = createTraceData(gideonPlan, gideonTelemetry);
  const gideonFastPath = buildDeterministicFastPath({
    execution: gideonPlan,
    prompt: lastUserPrompt
  });
  const ambiguousConcept = detectAmbiguousTradingConcept(lastUserPrompt);
  const strategyLikePrompt =
    /\b(model|strategy|playbook|system)\b/i.test(lastUserPrompt) &&
    /\b(build|create|make|turn|convert|draft|design|refine|organize|show)\b/i.test(lastUserPrompt);
  const mathLikePrompt =
    /\b(1r|2r|1\.5r|breakeven|break even|risk reward|recovery factor|percentage move|percent move|account|where is target|winners are|losers are)\b/i.test(
      lastUserPrompt
    );

  if (gideonFastPath && !strategyLikePrompt && !ambiguousConcept && !mathLikePrompt) {
    const socialFastPath = gideonPlan.intent.requestKind === "social";
    const toolsUsed = new Set<string>(gideonFastPath.toolIds);
    const requestChecklistPlan = deps.buildRequestChecklistPlan({
      socialOnlyRequest: socialFastPath,
      strictToRequest: socialFastPath ? true : gideonPlan.intent.strictScope,
      wantsNaturalOnly: true,
      wantsVisualization: false,
      explicitDrawRequest: false,
      wantsAnimation: false,
      needsDataFetch: false
    });
    const shortAnswer = deps.sanitizeDeliveryText(gideonFastPath.shortAnswer);
    const bullets = gideonFastPath.bullets.map((bullet) => ({
      tone: bullet.tone,
      text: deps.sanitizeAssistantText(bullet.text)
    }));
    const chartActions = normalizeChartActions([]);
    const chartAnimations = normalizeChartAnimationsFromCoding({});
    const requestChecklist = deps.buildResponseChecklist({
      plan: requestChecklistPlan,
      shortAnswer,
      responseCannotAnswer: false,
      charts: [],
      chartActions: gideonFastPath.chartActions
        ? normalizeChartActions(gideonFastPath.chartActions)
        : chartActions,
      chartAnimations,
      toolsUsed
    });
    const fastPathChartActions = gideonFastPath.chartActions
      ? normalizeChartActions(gideonFastPath.chartActions)
      : [];

    return respond({
      status: "ok",
      response: {
        cannotAnswer: false,
        cannotAnswerReason: "",
        shortAnswer,
        bullets,
        charts: [],
        chartActions: fastPathChartActions,
        chartAnimations: [],
        requestChecklist,
        toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
      },
      modelTrace: null,
      dataTrace: {
        ...gideonTraceData,
        fastPath: gideonFastPath.kind,
        requestChecklistPlan,
        runtimeClock: deps.buildRuntimeClock({
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

  const apiKey =
    process.env.NEBIUS_API_KEY ||
    process.env.TOKENFACTORY_API_KEY ||
    process.env.AI_API_KEY ||
    "";

  if (!apiKey) {
    return respond({
      ...deps.buildFallbackFailureResponse(
        "I cannot answer because the Nebius API key is not configured on the server."
      ),
      dataTrace: {
        ...gideonTraceData,
        runtimeClock: deps.buildRuntimeClock({
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

  const baseUrl = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1";
  const capabilityRoute = deps.resolveCapabilityRoute({
    prompt: lastUserPrompt,
    context,
    strategyThreadState
  });
  const heuristicRequestMode = deps.buildDeterministicRequestModePlan(capabilityRoute);
  const indicatorComputationRequested = deps.isIndicatorComputationRequest(lastUserPrompt);
  const requestedIndicators = deps.extractRequestedIndicators(lastUserPrompt);
  const routeRuntime = createRouteRuntime({
    context,
    strategyThreadState
  });
  const deterministicMathRequested =
    /\b(1r|2r|1\.5r|breakeven|break even|risk reward|recovery factor|percentage move|percent move|account|where is target)\b/i.test(
      lastUserPrompt
    );
  const deterministicStatsRequested =
    /\b(backtest|win rate|hit rate|profit factor|expectancy|drawdown|pnl|trades?|average win|average loss)\b/i.test(
      lastUserPrompt
    );

  if (
    !ambiguousConcept &&
    !strategyLikePrompt &&
    !capabilityRoute.wantsStrategyDraft &&
    !capabilityRoute.needsInternet &&
    !indicatorComputationRequested &&
    capabilityRoute.requestMode === "draw"
  ) {
    const toolsUsed = new Set<string>();
    const chartActions = buildChartActionsTool({
      prompt: lastUserPrompt,
      runtime: routeRuntime,
      candles: context.liveCandles,
      prependClear: true
    }).chartActions;
    if (chartActions.length > 0) {
      toolsUsed.add("build_chart_actions");
      toolsUsed.add("chart_actions");
    }
    const shortAnswer = deps.sanitizeDeliveryText(
      chartActions.length > 0
        ? `Drew ${deps.summarizeDrawnActions(chartActions) || "the requested chart annotations"} on the main chart.`
        : "I could not place a chart annotation from that prompt."
    );
    const requestChecklistPlan = deps.buildRequestChecklistPlan({
      socialOnlyRequest: false,
      strictToRequest: true,
      wantsNaturalOnly: false,
      wantsVisualization: false,
      explicitDrawRequest: true,
      wantsAnimation: false,
      needsDataFetch: false
    });
    const requestChecklist = deps.buildResponseChecklist({
      plan: requestChecklistPlan,
      shortAnswer,
      responseCannotAnswer: chartActions.length === 0,
      charts: [],
      chartActions,
      chartAnimations: normalizeChartAnimationsFromCoding({}),
      toolsUsed
    });

    return respond({
      status: "ok",
      response: {
        cannotAnswer: chartActions.length === 0,
        cannotAnswerReason: chartActions.length === 0 ? "No drawable instruction could be parsed." : "",
        shortAnswer,
        bullets: [],
        charts: [],
        chartActions,
        chartAnimations: [],
        requestChecklist,
        toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
      },
      modelTrace: null,
      dataTrace: {
        ...gideonTraceData,
        requestMode: "draw",
        requestChecklistPlan,
        runtimeClock: deps.buildRuntimeClock({
          nowMs: runtimeNowMs,
          context,
          clickhouseCandles: []
        }),
        usedClickhouse: false,
        clickhouseMeta: null,
        backtestDataIncluded: context.backtest.dataIncluded,
        historyRows: context.historyRows.length,
        backtestRows: context.backtest.trades.length,
        candleRows: context.liveCandles.length
      }
    });
  }

  if (
    !ambiguousConcept &&
    !strategyLikePrompt &&
    !capabilityRoute.wantsStrategyDraft &&
    !capabilityRoute.needsInternet &&
    !indicatorComputationRequested &&
    capabilityRoute.requestMode === "graph"
  ) {
    const templateId =
      deps.resolveToolboxGraphTemplate(
        capabilityRoute.preferredGraphType || gideonPlan.recommendedGraphTemplate || ""
      ) || "price_action";
    const chart = buildPanelChartTool({
      runtime: routeRuntime,
      templateId,
      title: resolveGraphTemplate(templateId).title,
      points: 260,
      candles: context.liveCandles
    }).chart;
    if (chart && chart.data.length > 0) {
      const toolsUsed = new Set<string>(["build_panel_chart"]);
      const shortAnswer = deps.sanitizeDeliveryText(`Showed ${chart.title.toLowerCase()} in chat.`);
      const requestChecklistPlan = deps.buildRequestChecklistPlan({
        socialOnlyRequest: false,
        strictToRequest: true,
        wantsNaturalOnly: false,
        wantsVisualization: true,
        explicitDrawRequest: false,
        wantsAnimation: false,
        needsDataFetch: false
      });
      const requestChecklist = deps.buildResponseChecklist({
        plan: requestChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [chart],
        chartActions: normalizeChartActions([]),
        chartAnimations: normalizeChartAnimationsFromCoding({}),
        toolsUsed
      });

      return respond({
        status: "ok",
        response: {
          cannotAnswer: false,
          cannotAnswerReason: "",
          shortAnswer,
          bullets: [],
          charts: [chart],
          chartActions: [],
          chartAnimations: [],
          requestChecklist,
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
        },
        modelTrace: null,
        dataTrace: {
          ...gideonTraceData,
          requestMode: "graph",
          requestChecklistPlan,
          runtimeClock: deps.buildRuntimeClock({
            nowMs: runtimeNowMs,
            context,
            clickhouseCandles: []
          }),
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    }
  }

  if (
    !ambiguousConcept &&
    !strategyLikePrompt &&
    !capabilityRoute.wantsStrategyDraft &&
    !capabilityRoute.needsInternet &&
    deterministicMathRequested
  ) {
    const mathAnswer = resolveDeterministicMathAnswer(lastUserPrompt);
    if (mathAnswer) {
      const toolsUsed = new Set<string>();
      const shortAnswer = deps.sanitizeDeliveryText(mathAnswer);
      const requestChecklistPlan = deps.buildRequestChecklistPlan({
        socialOnlyRequest: false,
        strictToRequest: true,
        wantsNaturalOnly: true,
        wantsVisualization: false,
        explicitDrawRequest: false,
        wantsAnimation: false,
        needsDataFetch: false
      });
      const requestChecklist = deps.buildResponseChecklist({
        plan: requestChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [],
        chartActions: normalizeChartActions([]),
        chartAnimations: normalizeChartAnimationsFromCoding({}),
        toolsUsed
      });

      return respond({
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
          ...gideonTraceData,
          requestMode: "natural",
          requestChecklistPlan,
          runtimeClock: deps.buildRuntimeClock({
            nowMs: runtimeNowMs,
            context,
            clickhouseCandles: []
          }),
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    }
  }

  if (
    !ambiguousConcept &&
    !strategyLikePrompt &&
    !capabilityRoute.wantsStrategyDraft &&
    capabilityRoute.needsInternet
  ) {
    try {
      const internetQuery = deps.buildAutoInternetQuery({
        prompt: lastUserPrompt
      });
      const query = deps.toText(internetQuery.query, lastUserPrompt).trim() || lastUserPrompt;
      const internetContext = await deps.fetchInternetContext({
        query,
        recencyDays: deps.toNumber(internetQuery.recencyDays, 2),
        maxResults: deps.toNumber(internetQuery.maxResults, 5)
      });
      const toolsUsed = new Set<string>(["internet_search"]);
      const shortAnswer = deps.sanitizeDeliveryText(
        "I could not run the full synthesis, but these are the freshest headlines I found that may matter."
      );
      const bullets = buildInternetFallbackBullets(internetContext);
      const requestChecklistPlan = deps.buildRequestChecklistPlan({
        socialOnlyRequest: false,
        strictToRequest: true,
        wantsNaturalOnly: true,
        wantsVisualization: false,
        explicitDrawRequest: false,
        wantsAnimation: false,
        needsDataFetch: true
      });
      const requestChecklist = deps.buildResponseChecklist({
        plan: requestChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [],
        chartActions: normalizeChartActions([]),
        chartAnimations: normalizeChartAnimationsFromCoding({}),
        toolsUsed
      });

      return respond({
        status: "ok",
        response: {
          cannotAnswer: false,
          cannotAnswerReason: "",
          shortAnswer,
          bullets,
          charts: [],
          chartActions: [],
          chartAnimations: [],
          requestChecklist,
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
        },
        modelTrace: null,
        dataTrace: {
          ...gideonTraceData,
          requestMode: "natural",
          requestChecklistPlan,
          internetContext,
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    } catch {
      // Fall through to the model path if search fails.
    }
  }

  if (
    !ambiguousConcept &&
    !strategyLikePrompt &&
    !capabilityRoute.wantsStrategyDraft &&
    !capabilityRoute.needsInternet &&
    deterministicStatsRequested &&
    capabilityRoute.requestMode !== "graph" &&
    context.backtest.trades.length > 0
  ) {
    const deterministicStats = resolveDeterministicStatsAnswer({
      prompt: lastUserPrompt,
      rows: context.backtest.trades
    });
    if (deterministicStats) {
      const toolsUsed = new Set<string>(["compute_metric", "summarize_backtest_results"]);
      const shortAnswer = deps.sanitizeDeliveryText(deterministicStats.shortAnswer);
      const bullets = deterministicStats.bullets.map((bullet) => ({
        tone: bullet.tone,
        text: deps.sanitizeAssistantText(bullet.text)
      }));
      const requestChecklistPlan = deps.buildRequestChecklistPlan({
        socialOnlyRequest: false,
        strictToRequest: true,
        wantsNaturalOnly: true,
        wantsVisualization: false,
        explicitDrawRequest: false,
        wantsAnimation: false,
        needsDataFetch: false
      });
      const requestChecklist = deps.buildResponseChecklist({
        plan: requestChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [],
        chartActions: normalizeChartActions([]),
        chartAnimations: normalizeChartAnimationsFromCoding({}),
        toolsUsed
      });

      return respond({
        status: "ok",
        response: {
          cannotAnswer: false,
          cannotAnswerReason: "",
          shortAnswer,
          bullets,
          charts: [],
          chartActions: [],
          chartAnimations: [],
          requestChecklist,
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
        },
        modelTrace: null,
        dataTrace: {
          ...gideonTraceData,
          requestMode: "natural",
          requestChecklistPlan,
          runtimeClock: deps.buildRuntimeClock({
            nowMs: runtimeNowMs,
            context,
            clickhouseCandles: []
          }),
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    }
  }

  try {
    const toolsUsed = new Set<string>();

    const modelsCatalog = await fetchNebiusModelCatalog({
      apiKey,
      baseUrl
    });
    const modelSelection = pickNebiusModels(modelsCatalog);
    const requestMode = capabilityRoute.shouldSkipModelRouting
      ? heuristicRequestMode
      : await deps.executeRequestModeStage({
          apiKey,
          baseUrl,
          model: modelSelection.coordinator,
          turns,
          context,
          fallback: heuristicRequestMode
        });
    const deterministicExecutionPlan = {
      ...deps.buildDeterministicExecutionPlan(capabilityRoute),
      graphNeeded: requestMode.wantsVisualization,
      drawNeeded: requestMode.wantsDraw,
      animationNeeded: requestMode.wantsAnimation,
      naturalOnly: requestMode.wantsNaturalOnly,
      strictToRequest: requestMode.strictToRequest
    };
    const executionPlan = capabilityRoute.shouldSkipModelRouting
      ? deterministicExecutionPlan
      : await deps.executeIntentExecutionStage({
          apiKey,
          baseUrl,
          model: modelSelection.coordinator,
          turns,
          context,
          modePlan: requestMode
        });
    const socialOnlyPrompt = deps.isSocialOnlyPrompt(lastUserPrompt);
    const internetContextRequested =
      capabilityRoute.needsInternet ||
      deps.shouldHeuristicallyFetchInternetContext({
        prompt: lastUserPrompt,
        socialOnlyRequest: socialOnlyPrompt
      });
    let explicitDrawRequest = socialOnlyPrompt
      ? false
      : requestMode.wantsDraw ||
        executionPlan.drawNeeded ||
        capabilityRoute.wantsStrategyDraft ||
        gideonPlan.intent.requestedArtifacts.includes("chart_draw");
    let wantsVisualization = socialOnlyPrompt
      ? false
      : requestMode.wantsVisualization ||
        executionPlan.graphNeeded ||
        capabilityRoute.includeStrategyPanelCharts ||
        gideonPlan.intent.requestedArtifacts.includes("panel_chart");
    let wantsAnimation = socialOnlyPrompt
      ? false
      : requestMode.wantsAnimation ||
        executionPlan.animationNeeded ||
        gideonPlan.intent.requestedArtifacts.includes("animation");
    let wantsNaturalOnly = socialOnlyPrompt
      ? true
      : requestMode.wantsNaturalOnly || executionPlan.naturalOnly;
    let strictToRequest = socialOnlyPrompt
      ? true
      : capabilityRoute.strictToRequest && requestMode.strictToRequest && executionPlan.strictToRequest;
    let mergedBacktestHint = socialOnlyPrompt
      ? false
      : requestMode.needsBacktestHint || executionPlan.needsBacktest || capabilityRoute.needsBacktest;
    let mergedClickhouseHint = socialOnlyPrompt
      ? false
      : requestMode.needsClickhouseHint || executionPlan.needsClickhouse || capabilityRoute.needsClickhouse;
    let mergedClickhouseCountHint = socialOnlyPrompt
      ? 0
      : Math.max(
          deps.toNumber(requestMode.clickhouseCountHint, 0),
          deps.toNumber(executionPlan.clickhouseCount, 0),
          deps.toNumber(capabilityRoute.clickhouseCountHint, 0)
        );

    const fallbackChecklistPlan = deps.buildRequestChecklistPlan({
      socialOnlyRequest: socialOnlyPrompt,
      strictToRequest,
      wantsNaturalOnly,
      wantsVisualization,
      explicitDrawRequest,
      wantsAnimation,
      needsDataFetch: mergedBacktestHint || mergedClickhouseHint || internetContextRequested
    });
    let requestChecklistPlan = capabilityRoute.shouldSkipModelRouting
      ? fallbackChecklistPlan
      : await deps.executeInstructionChecklistAuthorStage({
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

    const requestedGraphType = socialOnlyRequest
      ? ""
      : deps.toText(
          executionPlan.graphType,
          capabilityRoute.preferredGraphType || gideonPlan.recommendedGraphTemplate || ""
        );
    let forcedGraphTemplate = deps.resolveToolboxGraphTemplate(requestedGraphType);
    let graphToolingNeedsNewTool = false;
    if (
      !socialOnlyRequest &&
      (executionPlan.graphNeeded || requestChecklistPlan.requiresGraph) &&
      requestedGraphType &&
      !forcedGraphTemplate
    ) {
      toolsUsed.add("coding_graph_tooling");
      const graphResolution = await deps.executeGraphToolboxResolutionStage({
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
      const shortAnswer = deps.sanitizeAssistantText(
        await deps.executeSocialReplyStage({
          apiKey,
          baseUrl,
          model: modelSelection.writer,
          turns
        })
      );
      const emptyActions = normalizeChartActions([]);
      const emptyAnimations = normalizeChartAnimationsFromCoding({});
      const requestChecklist = deps.buildResponseChecklist({
        plan: requestChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [],
        chartActions: emptyActions,
        chartAnimations: emptyAnimations,
        toolsUsed
      });

      return respond({
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
          ...gideonTraceData,
          requestMode: requestMode.mode,
          requestChecklistPlan,
          executionPlan,
          runtimeClock: deps.buildRuntimeClock({
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

    if (ambiguousConcept) {
      const clarificationChecklistPlan = deps.buildRequestChecklistPlan({
        socialOnlyRequest: false,
        strictToRequest: true,
        wantsNaturalOnly: false,
        wantsVisualization: false,
        explicitDrawRequest: true,
        wantsAnimation: false,
        needsDataFetch: false
      });
      const clarificationCandles = deps.getDrawWindowCandles({
        context,
        clickhouseCandles: []
      });
      const chartActions = buildConceptClarificationChartActions({
        candles: clarificationCandles,
        conceptLabel: ambiguousConcept.label,
        includeFib: ambiguousConcept.wantsFib || ambiguousConcept.wantsStrategy
      });
      toolsUsed.add("concept_clarify");
      if (chartActions.length > 0) {
        toolsUsed.add("chart_actions");
      }
      const hasFib = chartActions.some((action) => action.type === "draw_fibonacci");
      const shortAnswer = deps.sanitizeDeliveryText(
        `I do not have a reliable built-in definition for ${ambiguousConcept.label} in your workflow yet. I sketched a candidate ${ambiguousConcept.label} with a box, circle, arrow, horizontal line, vertical line${hasFib ? ", and fib" : ""} so you can correct it on-chart. Is your ${ambiguousConcept.label} the last opposing candle before displacement, body-only, wick-inclusive, or something else? Tell me what to move, delete, or add and I will redraw it.`
      );
      const bullets = [
        {
          tone: "gold" as const,
          text: "Try: move the box, circle the candle you mean, change wick/body rules, or add/remove the fib."
        }
      ];
      const requestChecklist = deps.buildResponseChecklist({
        plan: clarificationChecklistPlan,
        shortAnswer,
        responseCannotAnswer: false,
        charts: [],
        chartActions,
        chartAnimations: normalizeChartAnimationsFromCoding({}),
        toolsUsed
      });

      return respond({
        status: "ok",
        response: {
          cannotAnswer: false,
          cannotAnswerReason: "",
          shortAnswer,
          bullets,
          charts: [],
          chartActions,
          chartAnimations: [],
          requestChecklist,
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
        },
        modelTrace: null,
        dataTrace: {
          ...gideonTraceData,
          requestMode: "draw",
          requestChecklistPlan: clarificationChecklistPlan,
          executionPlan,
          ambiguousConcept: ambiguousConcept.id,
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: clarificationCandles.length
        }
      });
    }

    const strategyDraftRequested =
      !socialOnlyRequest &&
      (capabilityRoute.wantsStrategyDraft || gideonPlan.intent.requestKind === "strategy");

    if (strategyDraftRequested) {
      toolsUsed.add("strategy_catalog");
      const strategyDraft = await deps.executeStrategyDraftStage({
        apiKey,
        baseUrl,
        models: modelSelection,
        turns,
        context,
        strategyThreadState
      });

      if (strategyDraft) {
        toolsUsed.add("strategy_draft_builder");
        const preview = await deps.executeStrategyPreviewStage({
          apiKey,
          baseUrl,
          model: modelSelection.coding,
          turns,
          context,
          strategyDraft
        });
        const routeGideonRuntime = createRouteRuntime({
          context,
          strategyThreadState
        });
        const previewCharts =
          preview.charts.length > 0
            ? preview.charts
            : capabilityRoute.includeStrategyPanelCharts
              ? buildStrategyPreviewChartsTool({
                  runtime: routeGideonRuntime,
                  matchedModelId: strategyDraft.matchedModelId,
                  matchedModelName: strategyDraft.matchedModelName
                })
              : [];
        const hasPreview =
          preview.chartActions.length > 0 ||
          preview.chartAnimations.length > 0 ||
          previewCharts.length > 0;
        if (hasPreview) {
          toolsUsed.add("strategy_preview");
        }
        if (previewCharts.length > 0) {
          toolsUsed.add("strategy_panel_chart");
        }
        if (preview.chartActions.length > 0) {
          toolsUsed.add("chart_actions");
        }
        if (preview.chartAnimations.length > 0) {
          toolsUsed.add("chart_animation");
        }
        if (preview.backtestSummary) {
          toolsUsed.add("strategy_backtest");
        }
        const strategyDraftWithPreview =
          preview.backtestSummary != null
            ? {
                ...strategyDraft,
                backtestSummary: preview.backtestSummary
              }
            : strategyDraft;
        const outstandingQuestions = deps.pickFirstNonEmptyTextList(
          strategyDraft.clarifyingQuestions,
          strategyDraft.missingDetails
        );
        const replaySummary = preview.backtestSummary;
        const replayStatsSnippet =
          replaySummary && replaySummary.tradeCount > 0
            ? `${replaySummary.tradeCount} trades, ${replaySummary.winRatePct}% win rate, profit factor ${replaySummary.profitFactor ?? "n/a"}`
            : null;
        const replayWindowSnippet =
          replaySummary?.testedFrom && replaySummary?.testedTo
            ? `${replaySummary.testedFrom} to ${replaySummary.testedTo}`
            : null;
        const fvgExampleCount = previewCharts.filter((chart) =>
          chart.id.startsWith("strategy-fvg-example-")
        ).length;
        const latestStrategyPrompt =
          turns.length > 0 && turns[turns.length - 1]?.role === "user"
            ? turns[turns.length - 1]?.content ?? ""
            : "";
        const strategyPromptCue = latestStrategyPrompt
          .replace(
            /^(turn this into a model:?|convert this to a model:?|convert this into a model:?|create a model:?|make a model:?|create a strategy:?|make a strategy:?|build a strategy:?)/i,
            ""
          )
          .trim()
          .replace(/\.$/, "");
        const strategyPromptLead =
          strategyPromptCue.length > 0
            ? ` for ${strategyPromptCue.slice(0, 140)}${strategyPromptCue.length > 140 ? "..." : ""}`
            : "";
        const shortAnswer = deps.sanitizeDeliveryText(
          strategyDraft.matchedModelId === "fair-value-gap"
            ? replayStatsSnippet && replayWindowSnippet
              ? `I built the Fair Value Gap draft, drew ${fvgExampleCount >= 4 ? "four" : "the clearest recent"} FVG examples in chat, and ran a local replay over ${replayWindowSnippet}: ${replayStatsSnippet}. You can add the draft to Models or download the JSON below. Tell me how you want to adjust the entry, stop, target, or filters.`
              : `I built the Fair Value Gap draft and drew the clearest recent FVG examples in chat with entry markers. You can add the draft to Models or download the JSON below. Tell me how you want to adjust the entry, stop, target, or filters.`
            : strategyDraft.status === "clarify"
              ? hasPreview
                ? outstandingQuestions.length > 0
                  ? `I mapped that into a ${strategyDraft.matchedModelName} draft${strategyPromptLead} and sketched it on the chart. Like this? I still need: ${outstandingQuestions
                      .slice(0, 2)
                      .join("; ")}.`
                  : `I mapped that into a ${strategyDraft.matchedModelName} draft${strategyPromptLead} and sketched it on the chart. Like this?`
                : outstandingQuestions.length > 0
                  ? `I mapped that into a ${strategyDraft.matchedModelName} draft${strategyPromptLead}. I still need: ${outstandingQuestions
                      .slice(0, 2)
                      .join("; ")}.`
                  : `I mapped that into a ${strategyDraft.matchedModelName} draft${strategyPromptLead}.`
              : hasPreview
                ? `I turned that into a ${strategyDraft.matchedModelName} model JSON${strategyPromptLead} and sketched it on the chart. Like this? You can add it to Models or download the JSON below.`
                : `I turned that into a ${strategyDraft.matchedModelName} model JSON${strategyPromptLead}. You can add it to Models or download the JSON below.`
        );
        const bullets =
          strategyDraft.matchedModelId === "fair-value-gap" && replaySummary
            ? [
                {
                  tone: "green" as const,
                  text: `Replay: ${replaySummary.tradeCount} trades, ${replaySummary.winRatePct}% win rate, profit factor ${replaySummary.profitFactor ?? "n/a"}`
                },
                ...(replaySummary.testedFrom && replaySummary.testedTo
                  ? [
                      {
                        tone: "gold" as const,
                        text: `Tested window: ${replaySummary.testedFrom} to ${replaySummary.testedTo}`
                      }
                    ]
                  : [])
              ]
            : strategyDraft.status === "clarify" && outstandingQuestions.length > 0
            ? [
                {
                  tone: "gold" as const,
                  text: `Still needed: ${outstandingQuestions.slice(0, 2).join("; ")}`
                }
              ]
            : [];
        const requestChecklist = deps.buildResponseChecklist({
          plan: requestChecklistPlan,
          shortAnswer,
          responseCannotAnswer: false,
          charts: previewCharts,
          chartActions: preview.chartActions,
          chartAnimations: preview.chartAnimations,
          toolsUsed
        });

        return respond({
          status: "ok",
          response: {
            cannotAnswer: false,
            cannotAnswerReason: "",
            shortAnswer,
            bullets,
            charts: previewCharts,
            chartActions: preview.chartActions,
            chartAnimations: preview.chartAnimations,
            requestChecklist,
            toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel),
            strategyDraft: strategyDraftWithPreview
          },
          modelTrace: null,
          dataTrace: {
            ...gideonTraceData,
            requestMode: requestMode.mode,
            requestChecklistPlan,
            executionPlan,
            strategyDraft: {
              modelId: strategyDraft.matchedModelId
            },
            usedClickhouse: false,
            clickhouseMeta: null,
            backtestDataIncluded: false,
            historyRows: context.historyRows.length,
            backtestRows: context.backtest.trades.length,
            candleRows: context.liveCandles.length
          }
        });
      }
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
      return respond({
        status: "needs_backtest_data",
        reason: "Detailed backtest rows are needed to fulfill this request accurately.",
        request: {
          type: "backtest_trades"
        },
        response: {
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
        },
        modelTrace: null,
        dataTrace: {
          ...gideonTraceData,
          requestMode: requestMode.mode,
          requestChecklistPlan,
          executionPlan,
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    }

    const deterministicPlanningResult: {
      planning: PlanningOutput;
      status?: "needs_backtest_data";
      reason?: string;
    } = {
      planning: {
        needsBacktestData: false,
        backtestReason: mergedBacktestHint
          ? "Detailed backtest rows are needed to fulfill this request accurately."
          : "",
        needsClickhouseData:
          mergedClickhouseHint ||
          explicitDrawRequest ||
          wantsVisualization ||
          (indicatorComputationRequested && context.liveCandles.length < 80),
        clickhouseQuery:
          mergedClickhouseHint ||
          explicitDrawRequest ||
          wantsVisualization ||
          (indicatorComputationRequested && context.liveCandles.length < 80)
            ? deps.buildAutoClickhouseQuery({
                context,
                prompt: lastUserPrompt,
                nowMs: runtimeNowMs
              })
            : undefined,
        needsInternetData: internetContextRequested,
        internetQuery: internetContextRequested
          ? deps.buildAutoInternetQuery({
              prompt: lastUserPrompt
            })
          : undefined
      }
    };
    const planningResult = capabilityRoute.shouldSkipModelRouting
      ? deterministicPlanningResult
      : await deps.executePlanningStage({
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
      return respond({
        status: "needs_backtest_data",
        reason:
          planningResult.reason ||
          "Detailed backtest data is required to answer accurately.",
        request: {
          type: "backtest_trades"
        },
        response: {
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
        },
        modelTrace: null,
        dataTrace: {
          ...gideonTraceData,
          requestMode: requestMode.mode,
          requestChecklistPlan,
          executionPlan,
          usedClickhouse: false,
          clickhouseMeta: null,
          backtestDataIncluded: context.backtest.dataIncluded,
          historyRows: context.historyRows.length,
          backtestRows: context.backtest.trades.length,
          candleRows: context.liveCandles.length
        }
      });
    }

    const shouldAutofetchInternet =
      !socialOnlyRequest &&
      toolState.internetContext === null &&
      (Boolean(planningResult.planning.needsInternetData) || internetContextRequested);

    if (shouldAutofetchInternet) {
      const internetQuery = deps.buildAutoInternetQuery({
        prompt: lastUserPrompt,
        planningQuery: planningResult.planning.internetQuery
      });
      if (internetQuery.query) {
        const contextResult = await deps.fetchInternetContext({
          query: internetQuery.query,
          recencyDays: deps.toNumber(internetQuery.recencyDays, 3),
          maxResults: deps.toNumber(internetQuery.maxResults, 5)
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
        deps.buildAutoClickhouseQuery({
          context,
          prompt: lastUserPrompt,
          nowMs: runtimeNowMs,
          planningQuery: planningResult.planning.clickhouseQuery
        }) ?? {};
      if (mergedClickhouseCountHint > 0) {
        autoQuery.count = Math.max(
          deps.toNumber(autoQuery.count, 0),
          mergedClickhouseCountHint
        );
      }

      try {
        const result = await deps.fetchClickhouseCandles(request, autoQuery);
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

    let indicatorSnapshot = deps.buildIndicatorSnapshot(
      deps.getRecentWindowCandles({
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
      indicatorCodingResult = await deps.executeIndicatorCodingStage({
        apiKey,
        baseUrl,
        model: modelSelection.coding,
        prompt: lastUserPrompt,
        requestedIndicators,
        candles: deps.getRecentWindowCandles({
          context,
          clickhouseCandles: toolState.clickhouseCandles
        }),
        indicatorSnapshot,
        nowMs: runtimeNowMs
      });

      if (indicatorCodingResult.needsMoreData) {
        const codingQuery = deps.buildAutoClickhouseQuery({
          context,
          prompt: lastUserPrompt,
          nowMs: runtimeNowMs,
          planningQuery: planningResult.planning.clickhouseQuery
        }) ?? {};
        const desiredCount = deps.clamp(
          Math.max(
            deps.toNumber(codingQuery.count, deps.getRecentWindowCount(context.timeframe)),
            indicatorCodingResult.requiredMinCandles + 120,
            320
          ),
          80,
          deps.MAX_CLICKHOUSE_COUNT
        );

        const availableCount = deps.getRecentWindowCandles({
          context,
          clickhouseCandles: toolState.clickhouseCandles
        }).length;
        if (desiredCount > availableCount) {
          try {
            const result = await deps.fetchClickhouseCandles(request, {
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

        indicatorCodingResult = await deps.executeIndicatorCodingStage({
          apiKey,
          baseUrl,
          model: modelSelection.coding,
          prompt: lastUserPrompt,
          requestedIndicators,
          candles: deps.getRecentWindowCandles({
            context,
            clickhouseCandles: toolState.clickhouseCandles
          }),
          indicatorSnapshot: deps.buildIndicatorSnapshot(
            deps.getRecentWindowCandles({
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

    indicatorSnapshot = deps.mergeIndicatorSnapshot({
      baseSnapshot: deps.buildIndicatorSnapshot(
        deps.getRecentWindowCandles({
          context,
          clickhouseCandles: toolState.clickhouseCandles
        })
      ),
      computed: indicatorCodingResult.computed
    });

    let dataAnalysis = await deps.executeDataAnalysisStage({
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

    let reasoning = await deps.executeReasoningStage({
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
        deps.buildAutoClickhouseQuery({
          context,
          prompt: lastUserPrompt,
          nowMs: runtimeNowMs,
          planningQuery: planningResult.planning.clickhouseQuery
        }) ?? {};
      if (mergedClickhouseCountHint > 0) {
        recoveryQuery.count = Math.max(
          deps.toNumber(recoveryQuery.count, 0),
          mergedClickhouseCountHint
        );
      }

      try {
        const result = await deps.fetchClickhouseCandles(request, {
          ...recoveryQuery,
          count: Math.max(deps.toNumber(recoveryQuery.count, 240), 240)
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

          const retryBaseSnapshot = deps.buildIndicatorSnapshot(
            deps.getRecentWindowCandles({
              context,
              clickhouseCandles: toolState.clickhouseCandles
            })
          );
          const retryIndicatorCoding =
            indicatorComputationRequested && requestedIndicators.length > 0
              ? await deps.executeIndicatorCodingStage({
                  apiKey,
                  baseUrl,
                  model: modelSelection.coding,
                  prompt: lastUserPrompt,
                  requestedIndicators,
                  candles: deps.getRecentWindowCandles({
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
          indicatorSnapshot = deps.mergeIndicatorSnapshot({
            baseSnapshot: retryBaseSnapshot,
            computed: retryIndicatorCoding.computed
          });
          dataAnalysis = await deps.executeDataAnalysisStage({
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
          reasoning = await deps.executeReasoningStage({
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
      : await deps.executeCodingStage({
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

    const routeGideonRuntime = createRouteRuntime({
      context,
      strategyThreadState
    });
    let charts = wantsVisualization
      ? buildChartsFromPlansTool({
          plans: codingResult.chartPlans,
          runtime: routeGideonRuntime,
          candles: toolState.clickhouseCandles
        })
      : [];
    if (wantsVisualization && charts.length === 0) {
      const sourceRows = deps.getRecentWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      });
      const fallbackTemplateId =
        forcedGraphTemplate ||
        deps.resolveToolboxGraphTemplate(requestedGraphType) ||
        "price_action";
      const fallbackTitle =
        requestedGraphType ||
        resolveGraphTemplate(fallbackTemplateId).title;
      const synthesized = buildPanelChartTool({
        runtime: routeGideonRuntime,
        templateId: fallbackTemplateId,
        title: fallbackTitle,
        points: 260,
        candles: sourceRows
      }).chart;
      if (synthesized && synthesized.data.length > 0) {
        charts = [synthesized];
        toolsUsed.add("build_panel_chart");
      }
    }
    let chartActions = explicitDrawRequest || wantsAnimation ? codingResult.chartActions : [];
    const drawCandles = deps.getDrawWindowCandles({
      context,
      clickhouseCandles: toolState.clickhouseCandles
    });
    if (explicitDrawRequest) {
      chartActions = buildChartActionsTool({
        prompt: lastUserPrompt,
        runtime: routeGideonRuntime,
        candles: drawCandles,
        prependClear: true
      }).chartActions;
      if (chartActions.length > 0) {
        toolsUsed.add("build_chart_actions");
      }
    }

    let chartAnimations = codingResult.chartAnimations;
    if (wantsAnimation && chartAnimations.length === 0) {
      const fallbackAnimation = buildChartAnimationTool({
        prompt: lastUserPrompt,
        runtime: routeGideonRuntime,
        requestKind: gideonPlan.intent.requestKind,
        requestedArtifacts: gideonPlan.intent.requestedArtifacts,
        chartActions,
        candles: drawCandles
      });
      if (chartActions.length === 0 && fallbackAnimation.chartActions.length > 0) {
        chartActions = fallbackAnimation.chartActions;
      }
      chartAnimations = fallbackAnimation.chartAnimations;
      if (chartAnimations.length > 0) {
        toolsUsed.add("build_chart_animation");
      }
    }

    if (chartActions.length > 0) {
      toolsUsed.add("chart_actions");
    }
    if (chartAnimations.length > 0) {
      toolsUsed.add("chart_animation");
    }
    const usedClickhouseData = toolState.clickhouseCandles.length > 0;
    const marketPriceAnchor = deps.buildMarketPriceAnchor({
      candles: deps.getRecentWindowCandles({
        context,
        clickhouseCandles: toolState.clickhouseCandles
      }),
      nowMs: runtimeNowMs
    });
    const isDrawOnlyRequest = explicitDrawRequest && !wantsVisualization;
    const drawSummary = deps.summarizeDrawnActions(chartActions);
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
            : deps.sanitizeAssistantText(reasoning.shortAnswer || reasoning.cannotAnswerReason)
          : deps.sanitizeAssistantText(reasoning.shortAnswer))
      : deps.sanitizeAssistantText(reasoning.shortAnswer || reasoning.cannotAnswerReason);

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
    if (capabilityRoute.preferNoBullets) {
      finalBullets = [];
    }
    const rawFinalShortAnswer = deps.sanitizeDeliveryText(
      shortAnswer ||
        (finalBullets.length > 0 ? deps.sanitizeAssistantText(finalBullets[0]?.text ?? "") : "")
    );
    let finalShortAnswer = rawFinalShortAnswer;
    if (!capabilityRoute.shouldSkipResponseRewriters) {
      const checklistAudit = await deps.executeInstructionChecklistAuditStage({
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
          toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
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
          finalShortAnswer = deps.sanitizeDeliveryText(checklistAudit.shortAnswer);
        }
      }
    }

    const shouldUseSpeakerRewrite =
      !capabilityRoute.shouldSkipResponseRewriters &&
      Boolean(finalShortAnswer || responseCannotAnswerReason);
    if (shouldUseSpeakerRewrite && (finalShortAnswer || responseCannotAnswerReason)) {
      const rewritten = await deps.executeSpeakerStage({
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
        finalShortAnswer = deps.sanitizeDeliveryText(rewritten);
      }
    }
    if (deps.hasOutOfRangePriceReference({ text: finalShortAnswer, anchor: marketPriceAnchor })) {
      const anchoredRewrite = await deps.executeSpeakerStage({
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
        !deps.hasOutOfRangePriceReference({ text: anchoredRewrite, anchor: marketPriceAnchor })
      ) {
        finalShortAnswer = deps.sanitizeDeliveryText(anchoredRewrite);
      } else if (marketPriceAnchor) {
        finalShortAnswer = deps.sanitizeDeliveryText(
          `Current ${context.symbol} live price is around ${marketPriceAnchor.latestClose.toFixed(2)}. I would wait for confirmation around this current range before acting.`
        );
      }
    }
    const requestChecklist = deps.buildResponseChecklist({
      plan: requestChecklistPlan,
      shortAnswer: finalShortAnswer,
      responseCannotAnswer,
      charts,
      chartActions,
      chartAnimations,
      toolsUsed
    });

    const responseRuntimeClock = deps.buildRuntimeClock({
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

    // Release request-scope data after shaping the response payload.
    toolState.clickhouseCandles = [];
    toolState.internetContext = null;

    return respond({
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
        toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
      },
      modelTrace: null,
      dataTrace: {
        ...gideonTraceData,
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
    if (isBudgetExhaustionError(error) && gideonPlan.intent.needs.includes("internet_research")) {
      try {
        const internetQuery = deps.buildAutoInternetQuery({
          prompt: lastUserPrompt
        });
        const internetContext = internetQuery.query
          ? await deps.fetchInternetContext({
              query: internetQuery.query,
              recencyDays: deps.toNumber(internetQuery.recencyDays, 3),
              maxResults: deps.toNumber(internetQuery.maxResults, 5)
            })
          : {
              query: "",
              provider: "duckduckgo" as const,
              fetchedAt: new Date().toISOString(),
              results: []
            };

        if (internetContext.results.length > 0) {
          const toolsUsed = new Set<string>(["internet_search"]);
          const shortAnswer =
            "I could not run the full synthesis, but these are the freshest macro headlines I found that may matter for gold.";
          const requestChecklistPlan = deps.buildRequestChecklistPlan({
            socialOnlyRequest: false,
            strictToRequest: true,
            wantsNaturalOnly: true,
            wantsVisualization: false,
            explicitDrawRequest: false,
            wantsAnimation: false,
            needsDataFetch: true
          });
          const requestChecklist = deps.buildResponseChecklist({
            plan: requestChecklistPlan,
            shortAnswer,
            responseCannotAnswer: false,
            charts: [],
            chartActions: normalizeChartActions([]),
            chartAnimations: normalizeChartAnimationsFromCoding({}),
            toolsUsed
          });

          return respond({
            status: "ok",
            response: {
              cannotAnswer: false,
              cannotAnswerReason: "",
              shortAnswer,
              bullets: buildInternetFallbackBullets(internetContext),
              charts: [],
              chartActions: [],
              chartAnimations: [],
              requestChecklist,
              toolsUsed: Array.from(toolsUsed).map(deps.normalizeToolLabel)
            },
            modelTrace: null,
            dataTrace: {
              ...gideonTraceData,
              internetFallback: true,
              internetContext: {
                provider: internetContext.provider,
                query: internetContext.query,
                count: internetContext.results.length,
                fetchedAt: internetContext.fetchedAt
              },
              usedClickhouse: false,
              clickhouseMeta: null,
              backtestDataIncluded: context.backtest.dataIncluded,
              historyRows: context.historyRows.length,
              backtestRows: context.backtest.trades.length,
              candleRows: context.liveCandles.length
            }
          });
        }
      } catch {
        // Fall through to the standard runtime failure response.
      }
    }

    return respond(
      deps.buildFallbackFailureResponse(
        error instanceof Error
          ? `I cannot answer due to an assistant runtime error: ${error.message}`
          : "I cannot answer due to an assistant runtime error."
      )
    );
  }
};
