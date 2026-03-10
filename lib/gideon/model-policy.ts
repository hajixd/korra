export type GideonModelRole =
  | "fast_router"
  | "coordinator"
  | "reasoner"
  | "analyst"
  | "coder"
  | "writer";

export type GideonModelPolicy = Record<GideonModelRole, string[]>;

export const GIDEON_MODEL_POLICY: GideonModelPolicy = {
  fast_router: [
    "Qwen/Qwen3-32B-fast",
    "Qwen/Qwen3-30B-A3B-fast",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-fast"
  ],
  coordinator: [
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "zai-org/GLM-4.5",
    "moonshotai/Kimi-K2-Instruct"
  ],
  reasoner: [
    "deepseek-ai/DeepSeek-R1-0528",
    "Qwen/Qwen3-235B-A22B-Thinking-2507",
    "zai-org/GLM-4.5"
  ],
  analyst: [
    "deepseek-ai/DeepSeek-V3.2",
    "moonshotai/Kimi-K2.5",
    "zai-org/GLM-4.7-FP8"
  ],
  coder: [
    "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    "zai-org/GLM-4.5"
  ],
  writer: [
    "NousResearch/Hermes-4-70B",
    "meta-llama/Llama-3.3-70B-Instruct",
    "zai-org/GLM-4.5-Air"
  ]
};

export const pickGideonModelCandidates = (
  role: GideonModelRole,
  availableModelIds: string[]
): string[] => {
  const normalized = new Map(
    availableModelIds.map((modelId) => [modelId.toLowerCase(), modelId] as const)
  );

  const matches: string[] = [];
  for (const candidate of GIDEON_MODEL_POLICY[role]) {
    const found = normalized.get(candidate.toLowerCase());
    if (found) {
      matches.push(found);
    }
  }

  return matches.length > 0 ? matches : GIDEON_MODEL_POLICY[role];
};
