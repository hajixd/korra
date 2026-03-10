import type { GideonExecutionSnapshot, GideonRuntimeContext, GideonToolExecutionResult } from "../contracts";
import { buildChartActionsTool, buildChartAnimationTool, buildPanelChartTool, resolveGraphTemplateTool } from "./charts";
import { computeIndicatorSnapshotTool } from "./indicators";
import { getLatestPriceAnchorTool, getMultiTimeframeContextTool, getRecentCandlesTool } from "./market";
import { resolveSymbolTool, resolveTimeframeTool } from "./request";
import { computeMetricTool, inferMetricIdFromPrompt, summarizeBacktestResultsTool, summarizeTradeHistoryTool } from "./stats";
import { exportStrategyJsonTool } from "./strategy";

const timed = async (
  toolId: string,
  runner: () => Record<string, unknown> | Promise<Record<string, unknown>>
): Promise<GideonToolExecutionResult> => {
  const startedAt = Date.now();
  try {
    const output = await runner();
    return {
      toolId,
      status: "completed",
      output,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      toolId,
      status: "failed",
      output: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown tool error"
    };
  }
};

export const executeSelectedTools = async (params: {
  plan: GideonExecutionSnapshot;
  prompt: string;
  runtime: GideonRuntimeContext;
}) => {
  const { plan, prompt, runtime } = params;
  const tasks: Array<Promise<GideonToolExecutionResult>> = [];

  for (const toolId of plan.toolIds) {
    if (toolId === "resolve_symbol") {
      tasks.push(timed(toolId, () => resolveSymbolTool({ prompt, runtime })));
    } else if (toolId === "resolve_timeframe") {
      tasks.push(timed(toolId, () => resolveTimeframeTool({ prompt, runtime })));
    } else if (toolId === "get_latest_price_anchor") {
      tasks.push(timed(toolId, () => getLatestPriceAnchorTool(runtime)));
    } else if (toolId === "get_recent_candles") {
      tasks.push(timed(toolId, () => getRecentCandlesTool(runtime)));
    } else if (toolId === "get_multi_timeframe_context") {
      tasks.push(timed(toolId, () => getMultiTimeframeContextTool(runtime)));
    } else if (toolId === "summarize_trade_history") {
      tasks.push(timed(toolId, () => summarizeTradeHistoryTool(runtime)));
    } else if (toolId === "summarize_backtest_results") {
      tasks.push(timed(toolId, () => summarizeBacktestResultsTool(runtime)));
    } else if (toolId === "compute_metric") {
      tasks.push(
        timed(toolId, () =>
          computeMetricTool({
            runtime,
            metricId: inferMetricIdFromPrompt(prompt) ?? "win_rate"
          })
        )
      );
    } else if (toolId === "compute_indicator_snapshot") {
      tasks.push(
        timed(toolId, () =>
          computeIndicatorSnapshotTool({
            prompt,
            runtime
          })
        )
      );
    } else if (toolId === "resolve_graph_template") {
      tasks.push(
        timed(toolId, () =>
          resolveGraphTemplateTool({
            requestedGraphTemplate: plan.recommendedGraphTemplate,
            fallbackTemplate: "price_action"
          })
        )
      );
    } else if (toolId === "build_panel_chart") {
      tasks.push(
        timed(toolId, () =>
          buildPanelChartTool({
            runtime,
            templateId: plan.recommendedGraphTemplate,
            title: null
          })
        )
      );
    } else if (toolId === "build_chart_actions") {
      tasks.push(
        timed(toolId, () =>
          buildChartActionsTool({
            prompt,
            runtime,
            prependClear: true
          })
        )
      );
    } else if (toolId === "build_chart_animation") {
      tasks.push(
        timed(toolId, () =>
          buildChartAnimationTool({
            prompt,
            runtime,
            requestKind: plan.intent.requestKind,
            requestedArtifacts: plan.intent.requestedArtifacts
          })
        )
      );
    } else if (toolId === "export_strategy_json") {
      tasks.push(timed(toolId, () => exportStrategyJsonTool(runtime)));
    } else {
      tasks.push(
        Promise.resolve({
          toolId,
          status: "skipped" as const,
          output: null,
          latencyMs: 0
        })
      );
    }
  }

  return Promise.all(tasks);
};
