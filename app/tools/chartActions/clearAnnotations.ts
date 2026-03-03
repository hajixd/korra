import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const clearAnnotations = (_action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  ctx.clearOverlays();
};
