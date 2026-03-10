import type { GideonTemplateDefinition } from "../contracts";
import { GIDEON_ANIMATION_TEMPLATES } from "./animation";

export const GIDEON_TEMPLATE_CATALOG: readonly GideonTemplateDefinition[] = [
  {
    id: "direct_answer",
    category: "answer",
    description: "Short direct answer with no extra sections.",
    requestKinds: ["social", "question", "analysis", "stats", "strategy", "coding", "mixed"],
    outputArtifacts: ["text"]
  },
  {
    id: "answer_with_bullets",
    category: "answer",
    description: "Short answer followed by concise bullets.",
    requestKinds: ["question", "analysis", "stats", "strategy", "coding", "mixed"],
    outputArtifacts: ["text", "bullets"]
  },
  {
    id: "price_action",
    category: "graph",
    description: "Panel chart template for recent price action.",
    requestKinds: ["analysis", "stats", "strategy", "mixed"],
    outputArtifacts: ["panel_chart"]
  },
  {
    id: "equity_curve",
    category: "graph",
    description: "Panel chart template for equity curve and net progression.",
    requestKinds: ["analysis", "stats", "mixed"],
    outputArtifacts: ["panel_chart"]
  },
  {
    id: "pnl_distribution",
    category: "graph",
    description: "Panel chart template for PnL distribution.",
    requestKinds: ["analysis", "stats", "mixed"],
    outputArtifacts: ["panel_chart"]
  },
  {
    id: "strategy_json_response",
    category: "strategy",
    description: "Strategy response template that surfaces Models JSON as the primary artifact.",
    requestKinds: ["strategy", "coding"],
    outputArtifacts: ["text", "strategy_json"]
  },
  {
    id: "strategy_preview_response",
    category: "strategy",
    description: "Strategy response template with preview charts and chart actions.",
    requestKinds: ["strategy", "coding"],
    outputArtifacts: ["text", "strategy_json", "panel_chart", "chart_draw"]
  },
  {
    id: "missing_timeframe_question",
    category: "clarification",
    description: "Clarification template for missing timeframe.",
    requestKinds: ["analysis", "stats", "strategy", "coding", "mixed"],
    outputArtifacts: ["text"]
  },
  {
    id: "missing_strategy_logic_question",
    category: "clarification",
    description: "Clarification template for missing entry and exit logic.",
    requestKinds: ["strategy", "coding"],
    outputArtifacts: ["text"]
  },
  ...GIDEON_ANIMATION_TEMPLATES
] as const;
