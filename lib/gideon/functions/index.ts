import type {
  GideonArtifact,
  GideonDepthPlan,
  GideonIntentPacket,
  GideonPromptSnapshot,
  GideonRequestKind,
  GideonStrategyTarget
} from "../contracts";
import { estimateDepthPlan } from "./depth";
import { deriveIntentPacket } from "./intent";

export const GIDEON_FUNCTION_CATALOG = [
  {
    id: "derive_intent_packet",
    category: "routing",
    description: "Classify the prompt into a typed Gideon intent packet.",
    deterministic: true
  },
  {
    id: "estimate_depth_plan",
    category: "scoring",
    description: "Estimate depth, concurrency, and total agent budget.",
    deterministic: true
  },
  {
    id: "select_active_agents",
    category: "routing",
    description: "Pick the smallest useful agent set for the request.",
    deterministic: true
  },
  {
    id: "select_tool_subset",
    category: "routing",
    description: "Filter the tool catalog to the request-specific subset.",
    deterministic: true
  },
  {
    id: "select_template_subset",
    category: "routing",
    description: "Filter the template catalog to the request-specific subset.",
    deterministic: true
  },
  {
    id: "build_clarification_question",
    category: "validation",
    description: "Generate the one blocking clarification question if needed.",
    deterministic: true
  },
  {
    id: "pick_animation_template",
    category: "animation",
    description: "Choose the fallback animation template for replay requests.",
    deterministic: true
  }
] as const;

const ACTIVE_AGENT_MAP: Record<GideonRequestKind, string[]> = {
  social: ["A01", "A06", "A07"],
  question: ["A01", "A02", "A06", "A07"],
  analysis: ["A01", "A02", "A04", "A05", "A06", "A07"],
  stats: ["A01", "A02", "A04", "A10", "A14", "A06", "A07"],
  strategy: ["A01", "A02", "A03", "A04", "A13", "A14", "A15", "A06", "A07"],
  coding: ["A01", "A02", "A03", "A04", "A13", "A16", "A06", "A07"],
  mixed: ["A01", "A02", "A03", "A04", "A05", "A06", "A07"]
};

export const selectActiveAgents = (
  intent: GideonIntentPacket,
  depth: GideonDepthPlan
): string[] => {
  const output = new Set<string>(ACTIVE_AGENT_MAP[intent.requestKind] ?? ACTIVE_AGENT_MAP.question);

  if (intent.needs.includes("market_data")) {
    output.add("A09");
  }
  if (intent.needs.includes("backtest_stats")) {
    output.add("A10");
  }
  if (intent.needs.includes("internet_research")) {
    output.add("A11");
  }
  if (intent.needs.includes("indicator_compute")) {
    output.add("A12");
  }
  if (intent.needs.includes("strategy_compile")) {
    output.add("A13");
  }
  if (intent.requestedArtifacts.includes("panel_chart")) {
    output.add("A14");
  }
  if (intent.requestedArtifacts.includes("chart_draw") || intent.requestedArtifacts.includes("animation")) {
    output.add("A15");
  }
  if (intent.strategyTarget === "platform_code" || intent.needs.includes("code_generation")) {
    output.add("A16");
  }

  return Array.from(output).slice(0, depth.maxTotalAgents);
};

export const buildClarificationQuestion = (
  intent: GideonIntentPacket
): string | null => {
  if (intent.ambiguityFlags.includes("missing_strategy_logic")) {
    return "What are the exact entry and exit rules you want in the Models JSON?";
  }
  if (intent.ambiguityFlags.includes("missing_timeframe")) {
    return "Which timeframe should I use for this chart or stats request?";
  }
  if (intent.ambiguityFlags.includes("missing_code_target")) {
    return "Which coding target do you want: Pine Script, MT5/MQL5, Python, or another platform?";
  }
  return null;
};

export const buildStrategyTarget = (
  intent: GideonIntentPacket
): GideonStrategyTarget | null => intent.strategyTarget;

export const shouldRenderArtifact = (
  intent: GideonIntentPacket,
  artifact: GideonArtifact
): boolean => intent.requestedArtifacts.includes(artifact);

export const buildIntentAndDepth = (snapshot: GideonPromptSnapshot) => {
  const intent = deriveIntentPacket(snapshot);
  const depth = estimateDepthPlan(intent);
  return { intent, depth };
};
