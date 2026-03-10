export type GideonRequestKind =
  | "social"
  | "question"
  | "analysis"
  | "stats"
  | "strategy"
  | "coding"
  | "mixed";

export type GideonArtifact =
  | "text"
  | "bullets"
  | "panel_chart"
  | "chart_draw"
  | "animation"
  | "strategy_json"
  | "code_patch";

export type GideonNeed =
  | "market_data"
  | "backtest_stats"
  | "internet_research"
  | "indicator_compute"
  | "strategy_compile"
  | "chart_preview"
  | "code_generation";

export type GideonStrategyTarget = "korra_model_json" | "platform_code";

export type GideonPromptSnapshot = {
  latestUserPrompt: string;
  symbol?: string | null;
  timeframe?: string | null;
  liveCandleCount?: number;
  historyRowCount?: number;
  backtestRowCount?: number;
  hasStrategyDraft?: boolean;
};

export type GideonRuntimeCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type GideonRuntimeTrade = {
  result?: string | null;
  pnlUsd?: number | null;
  entrySource?: string | null;
  side?: string | null;
  entryTime?: number | null;
  exitTime?: number | null;
};

export type GideonRuntimeContext = {
  symbol: string;
  timeframe: string;
  liveCandles: GideonRuntimeCandle[];
  historyRows: GideonRuntimeTrade[];
  backtestRows: GideonRuntimeTrade[];
  strategyDraftJson?: Record<string, unknown> | null;
};

export type GideonIntentPacket = {
  requestKind: GideonRequestKind;
  goalBullets: string[];
  requestedArtifacts: GideonArtifact[];
  needs: GideonNeed[];
  symbol: string | null;
  timeframe: string | null;
  freshness: "cached_ok" | "recent_market" | "live_market" | "web_current";
  ambiguityFlags: string[];
  riskFlags: string[];
  strictScope: boolean;
  strategyTarget: GideonStrategyTarget | null;
  recommendedGraphTemplate: string | null;
};

export type GideonDepthPlan = {
  depth: 0 | 1 | 2 | 3 | 4 | 5;
  complexityReasons: string[];
  maxConcurrentAgents: number;
  maxTotalAgents: number;
  requiresClarification: boolean;
};

export type GideonFunctionCategory =
  | "routing"
  | "validation"
  | "scoring"
  | "synthesis"
  | "animation"
  | "metrics";

export type GideonToolCategory =
  | "request"
  | "market"
  | "stats"
  | "indicator"
  | "chart"
  | "internet"
  | "strategy"
  | "code";

export type GideonTemplateCategory =
  | "graph"
  | "animation"
  | "clarification"
  | "answer"
  | "strategy";

export type GideonFunctionDefinition = {
  id: string;
  category: GideonFunctionCategory;
  description: string;
  deterministic: boolean;
};

export type GideonToolDefinition = {
  id: string;
  category: GideonToolCategory;
  description: string;
  kind: "read" | "compute" | "act";
  cacheable: boolean;
  latencyClass: "low" | "medium" | "high";
  requestKinds: GideonRequestKind[];
  needs: GideonNeed[];
  outputArtifacts: GideonArtifact[];
};

export type GideonTemplateDefinition = {
  id: string;
  category: GideonTemplateCategory;
  description: string;
  requestKinds: GideonRequestKind[];
  outputArtifacts: GideonArtifact[];
};

export type GideonAnimationTemplate = GideonTemplateDefinition & {
  theme: "neutral" | "bullish" | "bearish" | "gold";
  stepHoldMs: number;
  preferredStepCount: number;
  title: string;
  summary: string;
};

export type GideonPlanSnapshot = {
  intent: GideonIntentPacket;
  depth: GideonDepthPlan;
  activeAgents: string[];
  toolIds: string[];
  templateIds: string[];
  functionIds: string[];
  strategyTarget: GideonStrategyTarget | null;
  recommendedGraphTemplate: string | null;
  clarificationQuestion: string | null;
};

export type GideonToolExecutionResult = {
  toolId: string;
  status: "completed" | "skipped" | "failed";
  output: Record<string, unknown> | null;
  latencyMs: number;
  error?: string;
};

export type GideonExecutionSnapshot = GideonPlanSnapshot & {
  toolResults: GideonToolExecutionResult[];
  templateResults: GideonTemplateDefinition[];
  runtimeContext: GideonRuntimeContext;
};
