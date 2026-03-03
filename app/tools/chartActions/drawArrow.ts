import { pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawArrow = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const time = Number(action.time ?? action.timeStart);
  const price = Number(action.price ?? action.priceStart ?? action.entryPrice);

  if (!Number.isFinite(time) || !Number.isFinite(price)) {
    return;
  }

  const isDown = action.markerShape === "arrowDown";
  ctx.markers.push({
    time: ctx.chartTimeFromMs(time),
    position: isDown ? "aboveBar" : "belowBar",
    shape: action.markerShape || "arrowUp",
    color: pickColor(action.color, isDown ? "#f0455a" : "#13c98f"),
    text: action.label || action.note || "Signal"
  });

  ctx.setCombinedMarkers();
};
