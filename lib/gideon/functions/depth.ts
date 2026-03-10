import type { GideonDepthPlan, GideonIntentPacket } from "../contracts";

const clampDepth = (value: number): GideonDepthPlan["depth"] => {
  if (value <= 0) return 0;
  if (value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  if (value === 4) return 4;
  return 5;
};

export const estimateDepthPlan = (intent: GideonIntentPacket): GideonDepthPlan => {
  let score = 0;
  const complexityReasons: string[] = [];

  if (intent.freshness === "recent_market" || intent.freshness === "live_market" || intent.freshness === "web_current") {
    score += 1;
    complexityReasons.push("fresh_data_required");
  }
  if (intent.requestedArtifacts.includes("panel_chart") || intent.requestedArtifacts.includes("chart_draw") || intent.requestedArtifacts.includes("animation")) {
    score += 1;
    complexityReasons.push("visual_artifacts");
  }
  if (intent.requestKind === "strategy" || intent.requestKind === "coding") {
    score += 1;
    complexityReasons.push("strategy_or_code");
  }
  if (intent.requestedArtifacts.length >= 3 || intent.goalBullets.length >= 2) {
    score += 1;
    complexityReasons.push("multi_deliverable");
  }
  if (intent.ambiguityFlags.length > 0 || intent.riskFlags.length > 0) {
    score += 1;
    complexityReasons.push("clarification_or_risk");
  }

  const depth = clampDepth(score);
  const concurrencyByDepth: Record<GideonDepthPlan["depth"], number> = {
    0: 2,
    1: 2,
    2: 3,
    3: 4,
    4: 5,
    5: 5
  };
  const totalAgentsByDepth: Record<GideonDepthPlan["depth"], number> = {
    0: 2,
    1: 4,
    2: 6,
    3: 9,
    4: 12,
    5: 16
  };

  return {
    depth,
    complexityReasons,
    maxConcurrentAgents: concurrencyByDepth[depth],
    maxTotalAgents: totalAgentsByDepth[depth],
    requiresClarification: intent.ambiguityFlags.length > 0
  };
};
