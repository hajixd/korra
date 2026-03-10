import { pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const addFibSegment = (params: {
  ctx: ChartActionRuntimeContext;
  color: string;
  style: AssistantChartAction["style"];
  lineWidth: 1 | 2;
  points: Array<{ time: number; value: number }>;
}) => {
  const series = params.ctx.chart.addLineSeries({
    color: params.color,
    lineWidth: params.lineWidth,
    lineStyle: params.ctx.styleToLineStyle(params.style),
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });

  series.setData(
    params.points.map((point) => ({
      time: params.ctx.chartTimeFromMs(point.time),
      value: point.value
    }))
  );
  params.ctx.overlaySeries.push(series);
};

export const drawFibonacci = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
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

  const color = pickColor(action.color, "#f0b84f");
  const delta = priceEnd - priceStart;

  addFibSegment({
    ctx,
    color,
    style: action.style || "solid",
    lineWidth: 2,
    points: [
      { time: timeStart, value: priceStart },
      { time: timeEnd, value: priceEnd }
    ]
  });

  for (const level of FIB_LEVELS) {
    const value = Number((priceStart + delta * level).toFixed(4));
    addFibSegment({
      ctx,
      color,
      style: action.style || "dashed",
      lineWidth: level === 0.5 || level === 0.618 ? 2 : 1,
      points: [
        { time: timeStart, value },
        { time: timeEnd, value }
      ]
    });
  }
};
