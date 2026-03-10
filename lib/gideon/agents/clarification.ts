import type { GideonDepthPlan, GideonIntentPacket } from "../contracts";
import { buildClarificationQuestion } from "../functions";

export const runClarificationGate = (params: {
  intent: GideonIntentPacket;
  depth: GideonDepthPlan;
}): string | null => {
  return params.depth.requiresClarification ? buildClarificationQuestion(params.intent) : null;
};
