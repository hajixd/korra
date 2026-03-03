import { chartPriceBounds, pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawVerticalLine = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const time = Number(action.time ?? action.timeStart);
  if (!Number.isFinite(time)) {
    return;
  }

  const bounds = chartPriceBounds(ctx);
  const chartTime = ctx.chartTimeFromMs(time);

  const series = ctx.chart.addLineSeries({
    color: pickColor(action.color, "#f0b84f"),
    lineWidth: 1,
    lineStyle: ctx.styleToLineStyle(action.style),
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });

  series.setData([
    { time: chartTime, value: bounds.min },
    { time: chartTime, value: bounds.max }
  ]);

  ctx.overlaySeries.push(series);
};
