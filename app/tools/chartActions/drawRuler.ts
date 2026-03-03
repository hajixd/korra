import { drawTrendLine } from "./drawTrendLine";
import { drawArrow } from "./drawArrow";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawRuler = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
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

  drawTrendLine(
    {
      ...action,
      color: action.color || "#f0b84f",
      style: action.style || "dotted"
    },
    ctx
  );

  const delta = priceEnd - priceStart;
  drawArrow(
    {
      ...action,
      time: timeEnd,
      price: priceEnd,
      markerShape: delta >= 0 ? "arrowUp" : "arrowDown",
      label: action.label || `Δ ${delta.toFixed(2)}`
    },
    ctx
  );
};
