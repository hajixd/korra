import type { GideonExecutionSnapshot, GideonToolExecutionResult } from "./contracts";
import { inferMetricIdFromPrompt } from "./tools/stats";

type GideonFastPathBullet = {
  tone: "green" | "red" | "gold" | "black";
  text: string;
};

export type GideonFastPathResult = {
  kind: "social_reply" | "market_price" | "stats_metric" | "indicator_question" | "chart_draw";
  shortAnswer: string;
  bullets: GideonFastPathBullet[];
  toolIds: string[];
  chartActions?: Record<string, unknown>[];
};

type PriceAnchorOutput = {
  symbol?: string;
  timeframe?: string;
  latestClose?: number | null;
  latestTimeIso?: string | null;
  ageMs?: number | null;
  isFresh?: boolean;
  movePct?: number;
  windowHigh?: number | null;
  windowLow?: number | null;
};

type SummaryOutput = {
  source?: string;
  totalTrades?: number;
  winRatePct?: number;
  totalPnlUsd?: number;
  profitFactor?: number | null;
  expectancyUsd?: number;
  maxDrawdownUsd?: number;
};

type MetricOutput = {
  source?: string;
  metricId?: string;
  value?: number | null;
  totalTrades?: number;
};

type IndicatorSnapshotOutput = {
  symbol?: string;
  timeframe?: string;
  latestTimeIso?: string | null;
  rsi14?: {
    value?: number;
    state?: string;
    momentum?: number;
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } | null;
  macd?: {
    histogram?: number;
    regime?: string;
    crossedUp?: boolean;
    crossedDown?: boolean;
  } | null;
  ema20?: {
    value?: number;
    slope?: number;
  } | null;
  sma20?: {
    value?: number;
    slope?: number;
  } | null;
  atr14?: {
    value?: number;
    change?: number;
  } | null;
  stochastic_14_3?: {
    k?: number;
    d?: number;
    state?: string;
  } | null;
};

type ChartActionsOutput = {
  chartActions?: Array<Record<string, unknown>>;
};

const VISUAL_ARTIFACTS = new Set(["panel_chart", "chart_draw", "animation", "strategy_json", "code_patch"]);
const PRICE_QUESTION_RE = /\b(price|current|latest|right now|now|trading at|where is|quote)\b/i;
const MARKET_CONTEXT_RE =
  /\b(loaded range|loaded window|range|top|bottom|flat|candle time|window direction|up, down, or flat)\b/i;
const SIMPLE_GREETING_RE =
  /^(hi|hello|hey|yo|sup|what'?s up|how are you|gm|gn|good morning|good afternoon|good evening)[!.?\s]*$/i;

const normalizeSocialText = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
};

const buildDeterministicSocialReply = (prompt: string): string => {
  const normalized = normalizeSocialText(prompt);
  if (!normalized) {
    return "What do you want to check?";
  }
  if (/\b(good morning|gm)\b/.test(normalized)) {
    return "What do you want to check?";
  }
  if (/\bgood afternoon\b/.test(normalized)) {
    return "What do you want to check?";
  }
  if (/\b(good evening|gn)\b/.test(normalized)) {
    return "What do you want to check?";
  }
  if (/\b(how are you|what s up|whats up|sup|yo)\b/.test(normalized)) {
    return "What do you want to check?";
  }
  return "What do you want to check?";
};

const formatPrice = (value: number): string => {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toFixed(digits);
};

const formatUsd = (value: number): string => {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
};

const formatMetricValue = (metricId: string, value: number): string => {
  if (metricId === "win_rate") {
    return `${value.toFixed(2)}%`;
  }
  if (metricId === "total_trades" || metricId === "long_trades" || metricId === "short_trades") {
    return `${Math.round(value)}`;
  }
  if (
    metricId === "total_pnl_usd" ||
    metricId === "expectancy_usd" ||
    metricId === "average_win_usd" ||
    metricId === "average_loss_usd" ||
    metricId === "max_drawdown_usd"
  ) {
    return formatUsd(value);
  }
  if (metricId === "profit_factor") {
    return value.toFixed(3);
  }
  return `${value}`;
};

const formatAge = (ageMs: number | null | undefined): string | null => {
  if (!ageMs || ageMs <= 0) {
    return null;
  }
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m old`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h old`;
  }
  const days = Math.round(hours / 24);
  return `${days}d old`;
};

const findToolResult = (
  execution: GideonExecutionSnapshot,
  toolId: string
): GideonToolExecutionResult | null => {
  for (const result of execution.toolResults) {
    if (result.toolId === toolId && result.status === "completed" && result.output) {
      return result;
    }
  }
  return null;
};

const getToolOutput = <T extends Record<string, unknown>>(
  execution: GideonExecutionSnapshot,
  toolId: string
): T | null => {
  const result = findToolResult(execution, toolId);
  return result?.output as T | null;
};

const hasVisualArtifacts = (execution: GideonExecutionSnapshot): boolean => {
  return execution.intent.requestedArtifacts.some((artifact) => VISUAL_ARTIFACTS.has(artifact));
};

const buildSocialReplyFastPath = (params: {
  execution: GideonExecutionSnapshot;
  prompt: string;
}): GideonFastPathResult | null => {
  const { execution, prompt } = params;
  if (execution.intent.requestKind !== "social") {
    return null;
  }
  if (!SIMPLE_GREETING_RE.test(prompt.trim())) {
    return null;
  }
  return {
    kind: "social_reply",
    shortAnswer: buildDeterministicSocialReply(prompt),
    bullets: [],
    toolIds: []
  };
};

const buildMarketPriceFastPath = (params: {
  execution: GideonExecutionSnapshot;
  prompt: string;
}): GideonFastPathResult | null => {
  const { execution, prompt } = params;
  if (execution.intent.requestKind !== "question") {
    return null;
  }
  if (!execution.intent.needs.includes("market_data")) {
    return null;
  }
  if (execution.intent.needs.includes("indicator_compute")) {
    return null;
  }
  if (execution.intent.needs.includes("internet_research") || execution.intent.needs.includes("backtest_stats")) {
    return null;
  }
  if (!PRICE_QUESTION_RE.test(prompt) && !MARKET_CONTEXT_RE.test(prompt)) {
    return null;
  }

  const price = getToolOutput<PriceAnchorOutput>(execution, "get_latest_price_anchor");
  if (!price || typeof price.latestClose !== "number") {
    return null;
  }

  const symbol = String(price.symbol || execution.runtimeContext.symbol || "XAUUSD");
  const timeframe = String(price.timeframe || execution.runtimeContext.timeframe || "M15");
  const movePct = Number(price.movePct || 0);
  const moveText =
    movePct > 0.02
      ? `up ${movePct.toFixed(2)}%`
      : movePct < -0.02
        ? `down ${Math.abs(movePct).toFixed(2)}%`
        : "roughly flat";
  const freshnessText = price.isFresh ? "fresh" : formatAge(price.ageMs) || "stale";
  const bullets: GideonFastPathBullet[] = [];

  if (typeof price.windowLow === "number" && typeof price.windowHigh === "number") {
    bullets.push({
      tone: "black",
      text: `Loaded range: ${formatPrice(price.windowLow)} to ${formatPrice(price.windowHigh)}`
    });
  }
  if (price.latestTimeIso) {
    bullets.push({
      tone: price.isFresh ? "green" : "gold",
      text: `Latest candle time: ${price.latestTimeIso}`
    });
  }

  const normalizedPrompt = prompt.toLowerCase();
  if (/\b(candle time|latest candle time)\b/.test(normalizedPrompt) && price.latestTimeIso) {
    return {
      kind: "market_price",
      shortAnswer: `Latest loaded ${symbol} ${timeframe} candle time is ${price.latestTimeIso}.`,
      bullets: bullets.slice(0, 1),
      toolIds: ["resolve_symbol", "get_latest_price_anchor"].filter((toolId) => Boolean(findToolResult(execution, toolId)))
    };
  }

  if (
    /\b(top|bottom|loaded range|range)\b/.test(normalizedPrompt) &&
    typeof price.windowLow === "number" &&
    typeof price.windowHigh === "number"
  ) {
    const span = Math.max(0.0001, price.windowHigh - price.windowLow);
    const position = (price.latestClose - price.windowLow) / span;
    const zone = position <= 0.33 ? "bottom" : position >= 0.67 ? "top" : "middle";
    return {
      kind: "market_price",
      shortAnswer: `${symbol} on ${timeframe} is near the ${zone} of the loaded range.`,
      bullets: bullets.slice(0, 2),
      toolIds: ["resolve_symbol", "get_latest_price_anchor"].filter((toolId) => Boolean(findToolResult(execution, toolId)))
    };
  }

  if (/\b(loaded window|up, down, or flat|flat)\b/.test(normalizedPrompt)) {
    return {
      kind: "market_price",
      shortAnswer: `The loaded ${symbol} ${timeframe} window is ${moveText}.`,
      bullets: bullets.slice(0, 2),
      toolIds: ["resolve_symbol", "get_latest_price_anchor"].filter((toolId) => Boolean(findToolResult(execution, toolId)))
    };
  }

  return {
    kind: "market_price",
    shortAnswer: `${symbol} on ${timeframe} is ${formatPrice(price.latestClose)}. The latest loaded candle is ${freshnessText} and the loaded window is ${moveText}.`,
    bullets: bullets.slice(0, 2),
    toolIds: ["resolve_symbol", "get_latest_price_anchor"].filter((toolId) => Boolean(findToolResult(execution, toolId)))
  };
};

const describeDrawAction = (action: Record<string, unknown>): string | null => {
  const type = String(action.type || "");
  if (type === "draw_support_resistance") {
    return "support/resistance levels";
  }
  if (type === "draw_horizontal_line") {
    return "horizontal level";
  }
  if (type === "draw_vertical_line") {
    return "vertical marker";
  }
  if (type === "draw_trend_line") {
    return "trend line";
  }
  if (type === "draw_box") {
    return "box zone";
  }
  if (type === "draw_fvg") {
    return "fair value gap";
  }
  if (type === "draw_fibonacci") {
    return "fibonacci retracement";
  }
  if (type === "draw_arrow") {
    return "arrow marker";
  }
  if (type === "draw_long_position") {
    return "long position";
  }
  if (type === "draw_short_position") {
    return "short position";
  }
  if (type === "mark_candlestick") {
    return "candle marker";
  }
  return null;
};

const buildChartDrawFastPath = (params: {
  execution: GideonExecutionSnapshot;
}): GideonFastPathResult | null => {
  const { execution } = params;
  if (!execution.intent.requestedArtifacts.includes("chart_draw")) {
    return null;
  }
  if (
    execution.intent.needs.includes("internet_research") ||
    execution.intent.needs.includes("strategy_compile") ||
    execution.intent.needs.includes("code_generation")
  ) {
    return null;
  }

  const chartActionsOutput = getToolOutput<ChartActionsOutput>(execution, "build_chart_actions");
  const chartActions = Array.isArray(chartActionsOutput?.chartActions)
    ? chartActionsOutput.chartActions
    : [];
  if (chartActions.length === 0) {
    return null;
  }

  const described = chartActions
    .map((action) => describeDrawAction(action))
    .filter((value): value is string => Boolean(value));
  const preview = described.slice(0, 2).join(" and ");

  return {
    kind: "chart_draw",
    shortAnswer:
      preview.length > 0
        ? `Drew ${preview} on the main chart.`
        : `Drew ${chartActions.length} chart annotation${chartActions.length === 1 ? "" : "s"}.`,
    bullets: [],
    toolIds: ["build_chart_actions"].filter((toolId) => Boolean(findToolResult(execution, toolId))),
    chartActions
  };
};

const buildIndicatorQuestionFastPath = (params: {
  execution: GideonExecutionSnapshot;
  prompt: string;
}): GideonFastPathResult | null => {
  const { execution, prompt } = params;
  if (execution.intent.requestKind !== "question") {
    return null;
  }
  if (!execution.intent.needs.includes("indicator_compute")) {
    return null;
  }
  if (execution.intent.needs.includes("internet_research")) {
    return null;
  }

  const indicators = getToolOutput<IndicatorSnapshotOutput>(execution, "compute_indicator_snapshot");
  if (!indicators) {
    return null;
  }

  const symbol = String(indicators.symbol || execution.runtimeContext.symbol || "XAUUSD");
  const timeframe = String(indicators.timeframe || execution.runtimeContext.timeframe || "M15");
  const normalizedPrompt = prompt.toLowerCase();
  const bullets: GideonFastPathBullet[] = [];

  if ((/\brsi\b|\boverbought\b|\boversold\b/.test(normalizedPrompt)) && indicators.rsi14) {
    const rsi = indicators.rsi14;
    const value = Number(rsi.value ?? NaN);
    if (Number.isFinite(value)) {
      const state = String(rsi.state || "neutral");
      const answer =
        state === "overbought"
          ? `RSI 14 on ${symbol} ${timeframe} is ${value.toFixed(2)}, so it is overbought.`
          : state === "oversold"
            ? `RSI 14 on ${symbol} ${timeframe} is ${value.toFixed(2)}, so it is oversold.`
            : `RSI 14 on ${symbol} ${timeframe} is ${value.toFixed(2)}, so it is not overbought.`;
      if (typeof rsi.momentum === "number") {
        bullets.push({
          tone: rsi.momentum >= 0 ? "green" : "red",
          text: `RSI momentum: ${rsi.momentum >= 0 ? "+" : ""}${rsi.momentum.toFixed(2)}`
        });
      }
      if (indicators.latestTimeIso) {
        bullets.push({
          tone: "black",
          text: `Latest candle time: ${indicators.latestTimeIso}`
        });
      }
      return {
        kind: "indicator_question",
        shortAnswer: answer,
        bullets: bullets.slice(0, 2),
        toolIds: ["compute_indicator_snapshot"]
      };
    }
  }

  if (/\bmacd\b/.test(normalizedPrompt) && indicators.macd) {
    const macd = indicators.macd;
    const histogram = Number(macd.histogram ?? NaN);
    const regime = String(macd.regime || "flat").replace(/_/g, " ");
    if (Number.isFinite(histogram)) {
      return {
        kind: "indicator_question",
        shortAnswer: `MACD on ${symbol} ${timeframe} is ${regime} with histogram ${histogram.toFixed(4)}.`,
        bullets: [
          {
            tone: macd.crossedUp ? "green" : macd.crossedDown ? "red" : "black",
            text: macd.crossedUp ? "Latest cross: bullish" : macd.crossedDown ? "Latest cross: bearish" : "No fresh cross"
          }
        ],
        toolIds: ["compute_indicator_snapshot"]
      };
    }
  }

  if (/\bema\b/.test(normalizedPrompt) && indicators.ema20) {
    const ema = indicators.ema20;
    const value = Number(ema.value ?? NaN);
    if (Number.isFinite(value)) {
      return {
        kind: "indicator_question",
        shortAnswer: `EMA 20 on ${symbol} ${timeframe} is ${value.toFixed(4)}.`,
        bullets:
          typeof ema.slope === "number"
            ? [
                {
                  tone: ema.slope >= 0 ? "green" : "red",
                  text: `EMA slope: ${ema.slope >= 0 ? "+" : ""}${ema.slope.toFixed(4)}`
                }
              ]
            : [],
        toolIds: ["compute_indicator_snapshot"]
      };
    }
  }

  if ((/\bsma\b|\bmoving average\b/.test(normalizedPrompt)) && indicators.sma20) {
    const sma = indicators.sma20;
    const value = Number(sma.value ?? NaN);
    if (Number.isFinite(value)) {
      return {
        kind: "indicator_question",
        shortAnswer: `SMA 20 on ${symbol} ${timeframe} is ${value.toFixed(4)}.`,
        bullets:
          typeof sma.slope === "number"
            ? [
                {
                  tone: sma.slope >= 0 ? "green" : "red",
                  text: `SMA slope: ${sma.slope >= 0 ? "+" : ""}${sma.slope.toFixed(4)}`
                }
              ]
            : [],
        toolIds: ["compute_indicator_snapshot"]
      };
    }
  }

  if (/\batr\b|\bvolatility\b/.test(normalizedPrompt) && indicators.atr14) {
    const atr = indicators.atr14;
    const value = Number(atr.value ?? NaN);
    if (Number.isFinite(value)) {
      return {
        kind: "indicator_question",
        shortAnswer: `ATR 14 on ${symbol} ${timeframe} is ${value.toFixed(4)}.`,
        bullets: typeof atr.change === "number" ? [{
          tone: atr.change >= 0 ? "gold" : "black",
          text: `ATR change: ${atr.change >= 0 ? "+" : ""}${atr.change.toFixed(4)}`
        }] : [],
        toolIds: ["compute_indicator_snapshot"]
      };
    }
  }

  if (/\bstoch\b|\bstochastic\b/.test(normalizedPrompt) && indicators.stochastic_14_3) {
    const stochastic = indicators.stochastic_14_3;
    const k = Number(stochastic.k ?? NaN);
    const d = Number(stochastic.d ?? NaN);
    if (Number.isFinite(k) && Number.isFinite(d)) {
      return {
        kind: "indicator_question",
        shortAnswer: `Stochastic 14 3 on ${symbol} ${timeframe} has %K ${k.toFixed(2)} and %D ${d.toFixed(2)}, so it is ${String(stochastic.state || "neutral")}.`,
        bullets: [],
        toolIds: ["compute_indicator_snapshot"]
      };
    }
  }

  return null;
};

const metricShortAnswer = (params: {
  metricId: string;
  value: number;
  source: string;
  totalTrades: number;
}): string => {
  const sourceLabel = params.source === "history" ? "history" : "backtest";
  if (params.metricId === "win_rate") {
    return `${sourceLabel} win rate is ${formatMetricValue(params.metricId, params.value)} across ${params.totalTrades} closed trades.`;
  }
  if (params.metricId === "total_pnl_usd") {
    return `${sourceLabel} net PnL is ${formatMetricValue(params.metricId, params.value)} across ${params.totalTrades} closed trades.`;
  }
  if (params.metricId === "profit_factor") {
    return `${sourceLabel} profit factor is ${formatMetricValue(params.metricId, params.value)} across ${params.totalTrades} closed trades.`;
  }
  if (params.metricId === "expectancy_usd") {
    return `${sourceLabel} expectancy is ${formatMetricValue(params.metricId, params.value)} per trade across ${params.totalTrades} closed trades.`;
  }
  if (params.metricId === "max_drawdown_usd") {
    return `${sourceLabel} max drawdown is ${formatMetricValue(params.metricId, params.value)} in the loaded trade sequence.`;
  }
  if (params.metricId === "total_trades") {
    return `${sourceLabel} contains ${formatMetricValue(params.metricId, params.value)} closed trades.`;
  }
  if (params.metricId === "average_win_usd") {
    return `${sourceLabel} average win is ${formatMetricValue(params.metricId, params.value)}.`;
  }
  if (params.metricId === "average_loss_usd") {
    return `${sourceLabel} average loss is ${formatMetricValue(params.metricId, params.value)}.`;
  }
  if (params.metricId === "long_trades" || params.metricId === "short_trades") {
    const sideLabel = params.metricId === "long_trades" ? "long" : "short";
    return `${sourceLabel} includes ${formatMetricValue(params.metricId, params.value)} ${sideLabel} trades.`;
  }
  return `${sourceLabel} ${params.metricId.replace(/_/g, " ")} is ${formatMetricValue(params.metricId, params.value)}.`;
};

const buildStatsMetricFastPath = (params: {
  execution: GideonExecutionSnapshot;
  prompt: string;
}): GideonFastPathResult | null => {
  const { execution, prompt } = params;
  if (execution.intent.requestKind !== "stats") {
    return null;
  }
  if (!execution.intent.needs.includes("backtest_stats")) {
    return null;
  }
  if (execution.intent.needs.includes("internet_research")) {
    return null;
  }

  const metricId = inferMetricIdFromPrompt(prompt);
  if (!metricId) {
    return null;
  }

  const metric = getToolOutput<MetricOutput>(execution, "compute_metric");
  if (!metric || metric.metricId !== metricId || typeof metric.value !== "number") {
    return null;
  }

  const summaryToolId = metric.source === "history" ? "summarize_trade_history" : "summarize_backtest_results";
  const summary = getToolOutput<SummaryOutput>(execution, summaryToolId);
  const totalTrades = Number(metric.totalTrades || summary?.totalTrades || 0);
  if (totalTrades <= 0) {
    return null;
  }

  const bullets: GideonFastPathBullet[] = [];
  if (metricId !== "win_rate" && typeof summary?.winRatePct === "number") {
    bullets.push({
      tone: "black",
      text: `Win rate: ${summary.winRatePct.toFixed(2)}%`
    });
  }
  if (metricId !== "total_pnl_usd" && typeof summary?.totalPnlUsd === "number") {
    bullets.push({
      tone: summary.totalPnlUsd >= 0 ? "green" : "red",
      text: `Net PnL: ${formatUsd(summary.totalPnlUsd)}`
    });
  }
  if (metricId !== "profit_factor" && typeof summary?.profitFactor === "number") {
    bullets.push({
      tone: "black",
      text: `Profit factor: ${summary.profitFactor.toFixed(3)}`
    });
  }
  if (metricId !== "max_drawdown_usd" && typeof summary?.maxDrawdownUsd === "number") {
    bullets.push({
      tone: "gold",
      text: `Max drawdown: ${formatUsd(summary.maxDrawdownUsd)}`
    });
  }

  return {
    kind: "stats_metric",
    shortAnswer: metricShortAnswer({
      metricId,
      value: metric.value,
      source: String(metric.source || "backtest"),
      totalTrades
    }),
    bullets: bullets.slice(0, 2),
    toolIds: ["compute_metric", summaryToolId].filter((toolId) => Boolean(findToolResult(execution, toolId)))
  };
};

export const buildDeterministicFastPath = (params: {
  execution: GideonExecutionSnapshot;
  prompt: string;
}): GideonFastPathResult | null => {
  if (
    params.execution.intent.needs.includes("internet_research") ||
    params.execution.intent.needs.includes("strategy_compile") ||
    params.execution.intent.needs.includes("code_generation")
  ) {
    return null;
  }

  const socialFastPath = buildSocialReplyFastPath(params);
  if (socialFastPath) {
    return socialFastPath;
  }

  const drawFastPath = buildChartDrawFastPath(params);
  if (drawFastPath) {
    return drawFastPath;
  }

  if (hasVisualArtifacts(params.execution)) {
    return null;
  }

  return (
    buildIndicatorQuestionFastPath(params) ??
    buildMarketPriceFastPath(params) ??
    buildStatsMetricFastPath(params)
  );
};
