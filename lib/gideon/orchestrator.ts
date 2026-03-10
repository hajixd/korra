import type { GideonPlanSnapshot, GideonPromptSnapshot, GideonToolDefinition } from "./contracts";
import { buildClarificationQuestion, buildIntentAndDepth, GIDEON_FUNCTION_CATALOG, selectActiveAgents } from "./functions";
import { GIDEON_TEMPLATE_CATALOG } from "./templates/catalog";
import { GIDEON_TOOL_CATALOG } from "./tools/catalog";

const includesAny = <T>(haystack: T[], needles: T[]): boolean => {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      return true;
    }
  }
  return false;
};

export const selectToolSubset = (plan: GideonPlanSnapshot): GideonToolDefinition[] => {
  return GIDEON_TOOL_CATALOG.filter((tool) => {
    const requestKindMatch = tool.requestKinds.includes(plan.intent.requestKind);
    const needMatch = tool.needs.length === 0 || includesAny(plan.intent.needs, tool.needs);
    const artifactMatch =
      tool.outputArtifacts.length === 0 || includesAny(plan.intent.requestedArtifacts, tool.outputArtifacts);

    if (plan.strategyTarget === "korra_model_json" && tool.id === "build_code_plan") {
      return false;
    }

    return requestKindMatch && needMatch && artifactMatch;
  });
};

export const selectTemplateSubset = (plan: GideonPlanSnapshot) => {
  return GIDEON_TEMPLATE_CATALOG.filter((template) => {
    const requestKindMatch = template.requestKinds.includes(plan.intent.requestKind);
    const artifactMatch =
      template.outputArtifacts.length === 0 ||
      includesAny(plan.intent.requestedArtifacts, template.outputArtifacts);
    return requestKindMatch && artifactMatch;
  });
};

export const buildGideonPlanSnapshot = (
  snapshot: GideonPromptSnapshot
): GideonPlanSnapshot => {
  const { intent, depth } = buildIntentAndDepth(snapshot);
  const activeAgents = selectActiveAgents(intent, depth);
  const clarificationQuestion = depth.requiresClarification
    ? buildClarificationQuestion(intent)
    : null;

  const draft: GideonPlanSnapshot = {
    intent,
    depth,
    activeAgents,
    toolIds: [],
    templateIds: [],
    functionIds: GIDEON_FUNCTION_CATALOG.map((fn) => fn.id),
    strategyTarget: intent.strategyTarget,
    recommendedGraphTemplate: intent.recommendedGraphTemplate,
    clarificationQuestion
  };

  draft.toolIds = selectToolSubset(draft).map((tool) => tool.id);
  draft.templateIds = selectTemplateSubset(draft).map((template) => template.id);

  return draft;
};
