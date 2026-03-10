import type { GideonDepthPlan, GideonIntentPacket } from "../contracts";
import { estimateDepthPlan } from "../functions/depth";

export const runDepthAgent = (intent: GideonIntentPacket): GideonDepthPlan => {
  return estimateDepthPlan(intent);
};
