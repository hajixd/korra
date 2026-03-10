export type GideonTelemetryEvent = {
  requestId: string;
  phase:
    | "intake"
    | "depth"
    | "clarification"
    | "tool_routing"
    | "template_routing"
    | "synthesis"
    | "audit";
  agentId?: string;
  startedAtMs: number;
  finishedAtMs?: number;
  status: "started" | "completed" | "failed" | "skipped";
  meta?: Record<string, unknown>;
};

export const createTelemetryEvent = (
  event: GideonTelemetryEvent
): GideonTelemetryEvent => ({
  ...event
});
