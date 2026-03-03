import { clearAnnotations } from "./clearAnnotations";
import { drawArrow } from "./drawArrow";
import { drawBox } from "./drawBox";
import { drawFvg } from "./drawFvg";
import { drawHorizontalLine } from "./drawHorizontalLine";
import { drawLongPosition } from "./drawLongPosition";
import { drawRuler } from "./drawRuler";
import { drawShortPosition } from "./drawShortPosition";
import { drawSupportResistance } from "./drawSupportResistance";
import { drawTrendLine } from "./drawTrendLine";
import { drawVerticalLine } from "./drawVerticalLine";
import { markCandlestick } from "./markCandlestick";
import { moveToDate } from "./moveToDate";
import type { AssistantChartAction, ChartActionRuntimeContext } from "./types";

export const executeAssistantChartActions = (
  actions: AssistantChartAction[],
  ctx: ChartActionRuntimeContext
) => {
  for (const action of actions) {
    if (action.type === "clear_annotations") {
      clearAnnotations(action, ctx);
      continue;
    }

    if (action.type === "move_to_date") {
      moveToDate(action, ctx);
      continue;
    }

    if (action.type === "draw_horizontal_line") {
      drawHorizontalLine(action, ctx);
      continue;
    }

    if (action.type === "draw_vertical_line") {
      drawVerticalLine(action, ctx);
      continue;
    }

    if (action.type === "draw_trend_line") {
      drawTrendLine(action, ctx);
      continue;
    }

    if (action.type === "draw_box") {
      drawBox(action, ctx);
      continue;
    }

    if (action.type === "draw_fvg") {
      drawFvg(action, ctx);
      continue;
    }

    if (action.type === "draw_support_resistance") {
      drawSupportResistance(action, ctx);
      continue;
    }

    if (action.type === "draw_arrow") {
      drawArrow(action, ctx);
      continue;
    }

    if (action.type === "draw_long_position") {
      drawLongPosition(action, ctx);
      continue;
    }

    if (action.type === "draw_short_position") {
      drawShortPosition(action, ctx);
      continue;
    }

    if (action.type === "draw_ruler") {
      drawRuler(action, ctx);
      continue;
    }

    if (action.type === "mark_candlestick") {
      markCandlestick(action, ctx);
    }
  }
};
