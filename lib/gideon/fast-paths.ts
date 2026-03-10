import type { GideonExecutionSnapshot, GideonToolExecutionResult } from "./contracts";
import { inferMetricIdFromPrompt } from "./tools/stats";

type GideonFastPathBullet = {
  tone: "green" | "red" | "gold" | "black";
  text: string;
};

export type GideonFastPathResult = {
  kind: "market_price" | "stats_metric";
  shortAnswer: string;
  bullets: GideonFastPathBullet[];
  toolIds: string[];
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

const VISUAL_ARTIFACTS = new Set(["panel_chart", "chart_draw", "animation", "strategy_json", "code_patch"]);
const PRICE_QUESTION_RE = /\b(price|current|latest|right now|now|trading at|where is|quote)\b/i;

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
  if (execution.intent.needs.includes("internet_research") || execution.intent.needs.includes("backtest_stats")) {
    return null;
  }
  if (!PRICE_QUESTION_RE.test(prompt)) {
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

  return {
    kind: "market_price",
    shortAnswer: `${symbol} on ${timeframe} is ${formatPrice(price.latestClose)}. The latest loaded candle is ${freshnessText} and the loaded window is ${moveText}.`,
    bullets: bullets.slice(0, 2),
    toolIds: ["resolve_symbol", "get_latest_price_anchor"].filter((toolId) => Boolean(findToolResult(execution, toolId)))
  };
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
  if (hasVisualArtifacts(params.execution)) {
    return null;
  }
  if (
    params.execution.intent.needs.includes("internet_research") ||
    params.execution.intent.needs.includes("strategy_compile") ||
    params.execution.intent.needs.includes("code_generation")
  ) {
    return null;
  }

  return buildMarketPriceFastPath(params) ?? buildStatsMetricFastPath(params);
};
