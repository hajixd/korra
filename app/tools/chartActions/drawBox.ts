import { pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

const addLine = (
  ctx: ChartActionRuntimeContext,
  color: string,
  style: AssistantChartAction["style"],
  points: Array<{ time: number; value: number }>
) => {
  const series = ctx.chart.addLineSeries({
    color,
    lineWidth: 1,
    lineStyle: ctx.styleToLineStyle(style),
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });

  series.setData(
    points.map((point) => ({ time: ctx.chartTimeFromMs(point.time), value: point.value }))
  );
  ctx.overlaySeries.push(series);
};

export const drawBox = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const timeStart = Number(action.timeStart);
  const timeEnd = Number(action.timeEnd);
  const priceStart = Number(action.priceStart);
  const priceEnd = Number(action.priceEnd);

  if (!Number.isFinite(timeStart) || !Number.isFinite(timeEnd)) {
    return;
  }

  if (!Number.isFinite(priceStart) || !Number.isFinite(priceEnd)) {
    return;
  }

  const color = pickColor(action.color, "#8797ba");
  const top = Math.max(priceStart, priceEnd);
  const bottom = Math.min(priceStart, priceEnd);

  addLine(ctx, color, action.style, [
    { time: timeStart, value: top },
    { time: timeEnd, value: top }
  ]);
  addLine(ctx, color, action.style, [
    { time: timeStart, value: bottom },
    { time: timeEnd, value: bottom }
  ]);
  addLine(ctx, color, action.style, [
    { time: timeStart, value: top },
    { time: timeStart, value: bottom }
  ]);
  addLine(ctx, color, action.style, [
    { time: timeEnd, value: top },
    { time: timeEnd, value: bottom }
  ]);
};
