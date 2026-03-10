import type { GideonToolDefinition } from "../contracts";

export const GIDEON_TOOL_CATALOG: readonly GideonToolDefinition[] = [
  {
    id: "resolve_symbol",
    category: "request",
    description: "Normalize raw symbol text into the app's canonical symbol.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["question", "analysis", "stats", "strategy", "coding", "mixed"],
    needs: [],
    outputArtifacts: ["text"]
  },
  {
    id: "resolve_timeframe",
    category: "request",
    description: "Normalize raw timeframe text into the app's canonical timeframe.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["analysis", "stats", "strategy", "coding", "mixed"],
    needs: [],
    outputArtifacts: ["text"]
  },
  {
    id: "get_latest_price_anchor",
    category: "market",
    description: "Fetch the latest price anchor, recent range, and staleness state.",
    kind: "read",
    cacheable: false,
    latencyClass: "low",
    requestKinds: ["question", "analysis", "stats", "strategy", "mixed"],
    needs: ["market_data"],
    outputArtifacts: ["text"]
  },
  {
    id: "get_recent_candles",
    category: "market",
    description: "Fetch a recent OHLCV candle window for the requested symbol and timeframe.",
    kind: "read",
    cacheable: true,
    latencyClass: "medium",
    requestKinds: ["analysis", "stats", "strategy", "coding", "mixed"],
    needs: ["market_data"],
    outputArtifacts: ["panel_chart", "chart_draw"]
  },
  {
    id: "get_multi_timeframe_context",
    category: "market",
    description: "Build a higher-timeframe context packet for the current symbol.",
    kind: "compute",
    cacheable: true,
    latencyClass: "medium",
    requestKinds: ["analysis", "stats", "strategy", "mixed"],
    needs: ["market_data"],
    outputArtifacts: ["text", "panel_chart"]
  },
  {
    id: "summarize_trade_history",
    category: "stats",
    description: "Compute deterministic history metrics from the app's trade history rows.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["analysis", "stats", "mixed"],
    needs: ["backtest_stats"],
    outputArtifacts: ["text", "panel_chart"]
  },
  {
    id: "summarize_backtest_results",
    category: "stats",
    description: "Compute deterministic backtest metrics and segment breakdowns.",
    kind: "compute",
    cacheable: true,
    latencyClass: "medium",
    requestKinds: ["analysis", "stats", "mixed"],
    needs: ["backtest_stats"],
    outputArtifacts: ["text", "panel_chart"]
  },
  {
    id: "compute_metric",
    category: "stats",
    description: "Compute one named metric such as win rate, drawdown, expectancy, or profit factor.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["stats", "analysis", "mixed"],
    needs: ["backtest_stats"],
    outputArtifacts: ["text", "panel_chart"]
  },
  {
    id: "compute_indicator_snapshot",
    category: "indicator",
    description: "Compute a latest-value snapshot for requested indicators.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["analysis", "stats", "strategy", "mixed"],
    needs: ["indicator_compute"],
    outputArtifacts: ["text"]
  },
  {
    id: "compute_indicator_series",
    category: "indicator",
    description: "Compute indicator series for graphing or visual explanation.",
    kind: "compute",
    cacheable: true,
    latencyClass: "medium",
    requestKinds: ["analysis", "stats", "strategy", "mixed"],
    needs: ["indicator_compute"],
    outputArtifacts: ["panel_chart"]
  },
  {
    id: "resolve_graph_template",
    category: "chart",
    description: "Map user wording to a pre-built graph template id.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["analysis", "stats", "strategy", "mixed"],
    needs: [],
    outputArtifacts: ["panel_chart"]
  },
  {
    id: "build_panel_chart",
    category: "chart",
    description: "Build a deterministic assistant-panel chart payload from a template and source data.",
    kind: "compute",
    cacheable: true,
    latencyClass: "medium",
    requestKinds: ["analysis", "stats", "strategy", "mixed"],
    needs: ["chart_preview"],
    outputArtifacts: ["panel_chart"]
  },
  {
    id: "build_chart_actions",
    category: "chart",
    description: "Build main-chart draw actions from structured level and setup data.",
    kind: "compute",
    cacheable: false,
    latencyClass: "medium",
    requestKinds: ["analysis", "strategy", "coding", "mixed"],
    needs: ["chart_preview"],
    outputArtifacts: ["chart_draw"]
  },
  {
    id: "build_chart_animation",
    category: "chart",
    description: "Build a replay animation sequence from chart actions and an animation template.",
    kind: "compute",
    cacheable: false,
    latencyClass: "medium",
    requestKinds: ["analysis", "strategy", "coding", "mixed"],
    needs: ["chart_preview"],
    outputArtifacts: ["animation"]
  },
  {
    id: "search_current_sources",
    category: "internet",
    description: "Search current web sources for a dated current-events answer.",
    kind: "read",
    cacheable: false,
    latencyClass: "high",
    requestKinds: ["analysis", "question", "mixed"],
    needs: ["internet_research"],
    outputArtifacts: ["text"]
  },
  {
    id: "extract_dated_facts",
    category: "internet",
    description: "Extract dated facts and source provenance from fetched web search results.",
    kind: "compute",
    cacheable: false,
    latencyClass: "medium",
    requestKinds: ["analysis", "question", "mixed"],
    needs: ["internet_research"],
    outputArtifacts: ["text", "bullets"]
  },
  {
    id: "match_strategy_template",
    category: "strategy",
    description: "Match user strategy wording to the closest Korra base model template.",
    kind: "compute",
    cacheable: true,
    latencyClass: "low",
    requestKinds: ["strategy", "coding", "mixed"],
    needs: ["strategy_compile"],
    outputArtifacts: ["strategy_json"]
  },
  {
    id: "build_strategy_model_json",
    category: "strategy",
    description: "Build Models-tab-compatible Korra strategy JSON from user rules.",
    kind: "compute",
    cacheable: false,
    latencyClass: "medium",
    requestKinds: ["strategy", "coding", "mixed"],
    needs: ["strategy_compile"],
    outputArtifacts: ["strategy_json", "text"]
  },
  {
    id: "validate_strategy_model_json",
    category: "strategy",
    description: "Validate Korra strategy JSON shape and supported condition forms.",
    kind: "compute",
    cacheable: false,
    latencyClass: "low",
    requestKinds: ["strategy", "coding", "mixed"],
    needs: ["strategy_compile"],
    outputArtifacts: ["strategy_json"]
  },
  {
    id: "export_strategy_json",
    category: "strategy",
    description: "Prepare a downloadable JSON artifact for a ready strategy draft.",
    kind: "act",
    cacheable: false,
    latencyClass: "low",
    requestKinds: ["strategy", "coding"],
    needs: ["strategy_compile"],
    outputArtifacts: ["strategy_json"]
  },
  {
    id: "build_code_plan",
    category: "code",
    description: "Build a code plan only when the user explicitly asks for platform code or patches.",
    kind: "compute",
    cacheable: false,
    latencyClass: "medium",
    requestKinds: ["coding", "mixed"],
    needs: ["code_generation"],
    outputArtifacts: ["code_patch", "text"]
  }
] as const;
