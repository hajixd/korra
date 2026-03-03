import { pickColor } from "./helpers";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawHorizontalLine = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const price = Number(action.price ?? action.priceStart ?? action.entryPrice);
  if (!Number.isFinite(price)) {
    return;
  }

  const priceLine = ctx.candleSeries.createPriceLine({
    price,
    color: pickColor(action.color, "#f0b84f"),
    lineWidth: 2,
    lineStyle: ctx.styleToLineStyle(action.style),
    axisLabelVisible: true,
    title: action.label || "Level"
  });

  ctx.priceLines.push(priceLine);
};
