import type { GideonPlanSnapshot } from "./contracts";

export const validateGideonPlanSnapshot = (plan: GideonPlanSnapshot): string[] => {
  const errors: string[] = [];

  if (!plan.intent.goalBullets.length) {
    errors.push("intent.goalBullets must not be empty");
  }
  if (!plan.activeAgents.length) {
    errors.push("activeAgents must not be empty");
  }
  if (!plan.functionIds.length) {
    errors.push("functionIds must not be empty");
  }
  if (plan.depth.maxConcurrentAgents > plan.depth.maxTotalAgents) {
    errors.push("maxConcurrentAgents cannot exceed maxTotalAgents");
  }

  return errors;
};
