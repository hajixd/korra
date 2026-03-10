import type {
  GideonExecutionSnapshot,
  GideonPromptSnapshot,
  GideonRuntimeContext,
  GideonTemplateDefinition
} from "../contracts";
import { selectActiveAgents } from "../functions";
import { runClarificationGate, runDepthAgent, runIntakeAgent, runTemplateRouterAgent, runToolRouterAgent } from "./index";
import { buildGideonPlanSnapshot, selectTemplateSubset } from "../orchestrator";
import { createTelemetryEvent, type GideonTelemetryEvent } from "../telemetry";
import { executeSelectedTools } from "../tools/runtime";
import { runInParallel } from "../scheduler";

export const runSupervisorGraph = async (params: {
  requestId: string;
  promptSnapshot: GideonPromptSnapshot;
  runtimeContext: GideonRuntimeContext;
}): Promise<{
  execution: GideonExecutionSnapshot;
  telemetry: GideonTelemetryEvent[];
}> => {
  const telemetry: GideonTelemetryEvent[] = [];

  const intakeStartedAt = Date.now();
  const intent = runIntakeAgent(params.promptSnapshot);
  telemetry.push(
    createTelemetryEvent({
      requestId: params.requestId,
      phase: "intake",
      agentId: "A01",
      startedAtMs: intakeStartedAt,
      finishedAtMs: Date.now(),
      status: "completed",
      meta: {
        requestKind: intent.requestKind
      }
    })
  );

  const depthStartedAt = Date.now();
  const depth = runDepthAgent(intent);
  telemetry.push(
    createTelemetryEvent({
      requestId: params.requestId,
      phase: "depth",
      agentId: "A02",
      startedAtMs: depthStartedAt,
      finishedAtMs: Date.now(),
      status: "completed",
      meta: {
        depth: depth.depth
      }
    })
  );

  const clarificationQuestion = runClarificationGate({ intent, depth });
  telemetry.push(
    createTelemetryEvent({
      requestId: params.requestId,
      phase: "clarification",
      agentId: "A03",
      startedAtMs: Date.now(),
      finishedAtMs: Date.now(),
      status: clarificationQuestion ? "completed" : "skipped",
      meta: {
        clarificationQuestion
      }
    })
  );

  const plan = buildGideonPlanSnapshot(params.promptSnapshot);
  plan.activeAgents = selectActiveAgents(intent, depth);
  plan.clarificationQuestion = clarificationQuestion;

  const routingStartedAt = Date.now();
  const [toolIds, templateIds] = await runInParallel([
    Promise.resolve(runToolRouterAgent(plan)),
    Promise.resolve(runTemplateRouterAgent(plan))
  ]);
  plan.toolIds = toolIds;
  plan.templateIds = templateIds;

  telemetry.push(
    createTelemetryEvent({
      requestId: params.requestId,
      phase: "tool_routing",
      agentId: "A04",
      startedAtMs: routingStartedAt,
      finishedAtMs: Date.now(),
      status: "completed",
      meta: {
        toolCount: toolIds.length
      }
    })
  );
  telemetry.push(
    createTelemetryEvent({
      requestId: params.requestId,
      phase: "template_routing",
      agentId: "A05",
      startedAtMs: routingStartedAt,
      finishedAtMs: Date.now(),
      status: "completed",
      meta: {
        templateCount: templateIds.length
      }
    })
  );

  const executionStartedAt = Date.now();
  const toolResults = await executeSelectedTools({
    plan: {
      ...plan,
      toolResults: [],
      templateResults: [],
      runtimeContext: params.runtimeContext
    },
    prompt: params.promptSnapshot.latestUserPrompt,
    runtime: params.runtimeContext
  });

  const templateResults: GideonTemplateDefinition[] = selectTemplateSubset(plan);

  const execution: GideonExecutionSnapshot = {
    ...plan,
    toolResults,
    templateResults,
    runtimeContext: params.runtimeContext
  };

  telemetry.push(
    createTelemetryEvent({
      requestId: params.requestId,
      phase: "synthesis",
      agentId: "A06",
      startedAtMs: executionStartedAt,
      finishedAtMs: Date.now(),
      status: "completed",
      meta: {
        completedTools: toolResults.filter((result) => result.status === "completed").length,
        failedTools: toolResults.filter((result) => result.status === "failed").length,
        skippedTools: toolResults.filter((result) => result.status === "skipped").length
      }
    })
  );

  return {
    execution,
    telemetry
  };
};
