import { drawHorizontalLine } from "./drawHorizontalLine";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const drawSupportResistance = (action: AssistantChartAction, ctx: ChartActionRuntimeContext) => {
  const support = Number(action.priceStart ?? action.stopPrice);
  const resistance = Number(action.priceEnd ?? action.targetPrice);

  if (Number.isFinite(support)) {
    drawHorizontalLine(
      {
        ...action,
        price: support,
        label: action.label ? `${action.label} Support` : "Support",
        color: "#13c98f"
      },
      ctx
    );
  }

  if (Number.isFinite(resistance)) {
    drawHorizontalLine(
      {
        ...action,
        price: resistance,
        label: action.label ? `${action.label} Resistance` : "Resistance",
        color: "#f0455a"
      },
      ctx
    );
  }
};
