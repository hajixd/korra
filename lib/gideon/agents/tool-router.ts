import type { GideonPlanSnapshot } from "../contracts";
import { selectToolSubset } from "../orchestrator";

export const runToolRouterAgent = (plan: GideonPlanSnapshot): string[] => {
  return selectToolSubset(plan).map((tool) => tool.id);
};
