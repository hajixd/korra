import { drawBox } from "./drawBox";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawFvg = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  drawBox(
    {
      ...action,
      color: action.color || "#f0b84f",
      label: action.label || "FVG",
      style: action.style || "dashed"
    },
    ctx
  );
};
