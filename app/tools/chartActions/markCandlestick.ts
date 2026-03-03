import { pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const markCandlestick = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const time = Number(action.time ?? action.timeStart);
  if (!Number.isFinite(time)) {
    return;
  }

  const shape = action.markerShape || "circle";
  const isDown = shape === "arrowDown";

  ctx.markers.push({
    time: ctx.chartTimeFromMs(time),
    position: isDown ? "aboveBar" : "belowBar",
    shape,
    color: pickColor(action.color, isDown ? "#f0455a" : "#2d6cff"),
    text: action.note || action.label || "Mark"
  });

  ctx.setCombinedMarkers();
};
