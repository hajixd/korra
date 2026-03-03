import { pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawTrendLine = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const timeStart = Number(action.timeStart ?? action.time);
  const timeEnd = Number(action.timeEnd ?? action.time);
  const priceStart = Number(action.priceStart ?? action.price ?? action.entryPrice);
  const priceEnd = Number(action.priceEnd ?? action.price ?? action.targetPrice);

  if (!Number.isFinite(timeStart) || !Number.isFinite(timeEnd)) {
    return;
  }

  if (!Number.isFinite(priceStart) || !Number.isFinite(priceEnd)) {
    return;
  }

  const series = ctx.chart.addLineSeries({
    color: pickColor(action.color, "#2d6cff"),
    lineWidth: 2,
    lineStyle: ctx.styleToLineStyle(action.style),
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });

  series.setData([
    { time: ctx.chartTimeFromMs(timeStart), value: priceStart },
    { time: ctx.chartTimeFromMs(timeEnd), value: priceEnd }
  ]);

  ctx.overlaySeries.push(series);
};
