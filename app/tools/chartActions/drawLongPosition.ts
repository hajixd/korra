import { drawHorizontalLine } from "./drawHorizontalLine";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawLongPosition = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const entry = Number(action.entryPrice ?? action.price ?? action.priceStart);
  const stop = Number(action.stopPrice ?? action.priceStart);
  const target = Number(action.targetPrice ?? action.priceEnd);

  if (!Number.isFinite(entry)) {
    return;
  }

  drawHorizontalLine(
    { ...action, price: entry, label: action.label || "Long Entry", color: "#2d6cff" },
    ctx
  );

  if (Number.isFinite(stop)) {
    drawHorizontalLine({ ...action, price: stop, label: "Long Stop", color: "#f0455a" }, ctx);
  }

  if (Number.isFinite(target)) {
    drawHorizontalLine({ ...action, price: target, label: "Long Target", color: "#13c98f" }, ctx);
  }
};
