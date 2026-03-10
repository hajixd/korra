import type { GideonPlanSnapshot } from "./contracts";

export const buildGideonCacheKey = (params: {
  namespace: string;
  plan: GideonPlanSnapshot;
}): string => {
  const { namespace, plan } = params;
  const core = [
    namespace,
    plan.intent.requestKind,
    plan.intent.symbol ?? "na",
    plan.intent.timeframe ?? "na",
    plan.intent.goalBullets.join("|"),
    plan.intent.requestedArtifacts.join("|"),
    plan.intent.needs.join("|")
  ].join("::");

  return core.toLowerCase();
};
