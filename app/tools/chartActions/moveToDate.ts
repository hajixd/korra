import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const moveToDate = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const time = Number(action.time);
  if (!Number.isFinite(time)) {
    return;
  }

  const center = ctx.chartTimeFromMs(time);
  const from = (center - 120 * 60) as typeof center;
  const to = (center + 120 * 60) as typeof center;

  ctx.chart.timeScale().setVisibleRange({ from, to });
};
