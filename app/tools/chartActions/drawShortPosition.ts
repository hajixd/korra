import { drawHorizontalLine } from "./drawHorizontalLine";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawShortPosition = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const entry = Number(action.entryPrice ?? action.price ?? action.priceStart);
  const stop = Number(action.stopPrice ?? action.priceEnd);
  const target = Number(action.targetPrice ?? action.priceStart);

  if (!Number.isFinite(entry)) {
    return;
  }

  drawHorizontalLine(
    { ...action, price: entry, label: action.label || "Short Entry", color: "#2d6cff" },
    ctx
  );

  if (Number.isFinite(stop)) {
    drawHorizontalLine({ ...action, price: stop, label: "Short Stop", color: "#f0455a" }, ctx);
  }

  if (Number.isFinite(target)) {
    drawHorizontalLine({ ...action, price: target, label: "Short Target", color: "#13c98f" }, ctx);
  }
};
