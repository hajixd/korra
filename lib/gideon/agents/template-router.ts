import type { GideonPlanSnapshot } from "../contracts";
import { selectTemplateSubset } from "../orchestrator";

export const runTemplateRouterAgent = (plan: GideonPlanSnapshot): string[] => {
  return selectTemplateSubset(plan).map((template) => template.id);
};
