import type {
  GideonArtifact,
  GideonIntentPacket,
  GideonNeed,
  GideonPromptSnapshot,
  GideonRequestKind,
  GideonStrategyTarget
} from "../contracts";

const SOCIAL_RE =
  /^(hi|hello|hey|yo|sup|what'?s up|how are you|gm|gn|good morning|good afternoon|good evening)[!.?\s]*$/i;
const GRAPH_RE = /\b(graph|chart|plot|visual|visualize|overview)\b/i;
const VISUAL_STATS_RE =
  /\b(curve|distribution|histogram|over time|timeline|session|hourly|weekday|monthly|heatmap|equity curve|drawdown curve)\b/i;
const DRAW_RE =
  /\b(draw|annotate|mark|support|resistance|trendline|trend line|horizontal line|vertical line|box|fvg|arrow|ruler)\b/i;
const ANIMATION_RE = /\b(animate|animation|video|replay|playback|walkthrough|demo)\b/i;
const STATS_RE =
  /\b(stat|stats|statistics|metric|metrics|win rate|hit rate|drawdown|expectancy|profit factor|pnl|distribution|session|hourly|weekday|monthly)\b/i;
const STRATEGY_RE =
  /\b(strategy|playbook|trading system|model json|models tab|turn this into a model|turn this into a strategy)\b/i;
const STRATEGY_RULE_RE =
  /\b(entry|exit|trigger|confirmation|invalidation|stop|target|take profit|setup|retest|breakout|pullback|reclaim|sweep)\b/i;
const CODE_RE =
  /\b(code|script|pine|mql|mt5|metatrader|python|typescript|javascript|implement|patch|refactor)\b/i;
const INTERNET_RE =
  /\b(news|headline|headlines|macro|calendar|event|cpi|nfp|fomc|fed|geopolitical|breaking|today|web|internet)\b/i;
const XAU_RE = /\b(xauusd|xau\/usd|xau_usd|spot gold|gold)\b/i;
const INDICATOR_RE =
  /\b(indicator|rsi|macd|ema|sma|atr|stoch|stochastic|moving average|volatility)\b/i;
const STRICT_SCOPE_OFF_RE = /\b(overview|all the graphs|all graphs|dashboard|everything|full sweep)\b/i;
const BULLET_RE = /\b(list|bullet|bullets|steps|checklist|breakdown|compare|comparison|why)\b/i;

const GRAPH_TEMPLATE_HINTS: Array<{ pattern: RegExp; template: string }> = [
  { pattern: /\b(drawdown|underwater)\b/i, template: "drawdown_curve" },
  { pattern: /\b(win rate|hit rate)\b/i, template: "rolling_win_rate" },
  { pattern: /\b(expectancy)\b/i, template: "rolling_expectancy" },
  { pattern: /\b(profit factor)\b/i, template: "rolling_profit_factor" },
  { pattern: /\b(equity|equity curve)\b/i, template: "equity_curve" },
  { pattern: /\b(distribution|histogram)\b/i, template: "pnl_distribution" },
  { pattern: /\b(session)\b/i, template: "session_performance" },
  { pattern: /\b(hourly|time of day)\b/i, template: "hourly_performance" },
  { pattern: /\b(weekday|day of week)\b/i, template: "weekday_performance" },
  { pattern: /\b(monthly volume)\b/i, template: "monthly_volume" },
  { pattern: /\b(monthly pnl)\b/i, template: "monthly_pnl_bar" },
  { pattern: /\b(rsi)\b/i, template: "rsi_14" },
  { pattern: /\b(macd)\b/i, template: "macd_hist_12_26_9" },
  { pattern: /\b(ema)\b/i, template: "ema_20" },
  { pattern: /\b(price|candles?)\b/i, template: "price_action" }
];

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const pickGoalBullets = (prompt: string): string[] => {
  const normalized = normalizeText(prompt);
  if (!normalized) {
    return [];
  }

  const sourceParts = normalized
    .split(/\n+|(?:\s+and\s+)|(?:\?\s+)|(?:\.\s+)|(?:\;\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const bullets: string[] = [];
  for (const part of sourceParts) {
    const cleaned = part.replace(/^[-*0-9.)\s]+/, "").trim();
    if (!cleaned) {
      continue;
    }
    bullets.push(cleaned);
    if (bullets.length >= 5) {
      break;
    }
  }

  return bullets.length > 0 ? bullets : [normalized];
};

const dedupe = <T>(items: T[]): T[] => Array.from(new Set(items));

const inferRequestKind = (prompt: string): GideonRequestKind => {
  if (SOCIAL_RE.test(prompt)) {
    return "social";
  }
  if (STRATEGY_RE.test(prompt)) {
    return CODE_RE.test(prompt) ? "coding" : "strategy";
  }
  if (CODE_RE.test(prompt)) {
    return "coding";
  }
  if (STATS_RE.test(prompt)) {
    return "stats";
  }
  if (GRAPH_RE.test(prompt) || DRAW_RE.test(prompt) || ANIMATION_RE.test(prompt)) {
    return "analysis";
  }
  return "question";
};

const inferArtifacts = (prompt: string, requestKind: GideonRequestKind): GideonArtifact[] => {
  const output: GideonArtifact[] = ["text"];
  const asksGraph = GRAPH_RE.test(prompt) && !DRAW_RE.test(prompt);

  if (BULLET_RE.test(prompt) || requestKind === "analysis") {
    output.push("bullets");
  }
  if (asksGraph || VISUAL_STATS_RE.test(prompt)) {
    output.push("panel_chart");
  }
  if (DRAW_RE.test(prompt) || requestKind === "strategy") {
    output.push("chart_draw");
  }
  if (ANIMATION_RE.test(prompt)) {
    output.push("animation");
  }
  if (requestKind === "strategy") {
    output.push("strategy_json");
  }
  if (requestKind === "coding" && CODE_RE.test(prompt)) {
    output.push("code_patch");
  }

  return dedupe(output);
};

const inferNeeds = (prompt: string, requestKind: GideonRequestKind): GideonNeed[] => {
  const output: GideonNeed[] = [];
  const needsChartPreview =
    GRAPH_RE.test(prompt) ||
    VISUAL_STATS_RE.test(prompt) ||
    DRAW_RE.test(prompt) ||
    ANIMATION_RE.test(prompt) ||
    requestKind === "strategy";

  if (XAU_RE.test(prompt) || /\b(price|where is|current|latest|chart)\b/i.test(prompt)) {
    output.push("market_data");
  }
  if (STATS_RE.test(prompt)) {
    output.push("backtest_stats");
  }
  if (INTERNET_RE.test(prompt)) {
    output.push("internet_research");
  }
  if (INDICATOR_RE.test(prompt)) {
    output.push("indicator_compute");
  }
  if (needsChartPreview) {
    output.push("chart_preview");
  }
  if (requestKind === "strategy") {
    output.push("strategy_compile");
  }
  if (requestKind === "coding") {
    output.push("code_generation");
  }

  return dedupe(output);
};

const inferFreshness = (prompt: string, needs: GideonNeed[]): GideonIntentPacket["freshness"] => {
  if (needs.includes("internet_research")) {
    return "web_current";
  }
  if (/\b(live|right now|current|latest|today|now)\b/i.test(prompt)) {
    return "live_market";
  }
  if (needs.includes("market_data")) {
    return "recent_market";
  }
  return "cached_ok";
};

const inferStrategyTarget = (prompt: string, requestKind: GideonRequestKind): GideonStrategyTarget | null => {
  if (requestKind !== "strategy" && requestKind !== "coding") {
    return null;
  }
  if (/\b(pine|mql|mt5|metatrader|python|typescript|javascript|script|code)\b/i.test(prompt)) {
    return "platform_code";
  }
  return "korra_model_json";
};

const inferGraphTemplate = (prompt: string): string | null => {
  for (const hint of GRAPH_TEMPLATE_HINTS) {
    if (hint.pattern.test(prompt)) {
      return hint.template;
    }
  }
  return GRAPH_RE.test(prompt) ? "price_action" : null;
};

const inferAmbiguityFlags = (params: {
  prompt: string;
  requestKind: GideonRequestKind;
  snapshot: GideonPromptSnapshot;
}): string[] => {
  const output: string[] = [];
  const { prompt, requestKind, snapshot } = params;

  if ((GRAPH_RE.test(prompt) || DRAW_RE.test(prompt)) && !snapshot.timeframe) {
    output.push("missing_timeframe");
  }
  if (requestKind === "strategy" && !STRATEGY_RULE_RE.test(prompt) && !snapshot.hasStrategyDraft) {
    output.push("missing_strategy_logic");
  }
  if (requestKind === "coding" && inferStrategyTarget(prompt, requestKind) === "platform_code" && !/\b(pine|mql|mt5|python|typescript|javascript)\b/i.test(prompt)) {
    output.push("missing_code_target");
  }

  return output;
};

export const deriveIntentPacket = (snapshot: GideonPromptSnapshot): GideonIntentPacket => {
  const prompt = normalizeText(snapshot.latestUserPrompt || "");
  const requestKind = inferRequestKind(prompt);
  const requestedArtifacts = inferArtifacts(prompt, requestKind);
  const needs = inferNeeds(prompt, requestKind);
  const strategyTarget = inferStrategyTarget(prompt, requestKind);

  return {
    requestKind,
    goalBullets: pickGoalBullets(prompt),
    requestedArtifacts,
    needs,
    symbol: snapshot.symbol ?? null,
    timeframe: snapshot.timeframe ?? null,
    freshness: inferFreshness(prompt, needs),
    ambiguityFlags: inferAmbiguityFlags({ prompt, requestKind, snapshot }),
    riskFlags: strategyTarget === "platform_code" ? ["code_generation"] : [],
    strictScope: !STRICT_SCOPE_OFF_RE.test(prompt),
    strategyTarget,
    recommendedGraphTemplate: inferGraphTemplate(prompt)
  };
};
