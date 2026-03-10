import type { GideonIntentPacket, GideonPromptSnapshot } from "../contracts";
import { deriveIntentPacket } from "../functions/intent";

export const runIntakeAgent = (snapshot: GideonPromptSnapshot): GideonIntentPacket => {
  return deriveIntentPacket(snapshot);
};
