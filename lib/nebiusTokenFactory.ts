const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;

const DEPRECATED_MODEL_IDS = new Set(
  [
    "Qwen/Qwen2.5-Coder-7B-Instruct",
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/QwQ-32B",
    "deepseek-ai/DeepSeek-R1",
    "meta-llama/Llama-3.2-1B-Instruct",
    "meta-llama/Llama-3.2-3B-Instruct",
    "meta-llama/Llama-3.3-70B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "Qwen/Qwen2.5-14B-Instruct"
  ].map((id) => id.toLowerCase())
);

const GENERATION_EXCLUDE_RE =
  /(embedding|rerank|speech|audio|asr|whisper|tts|transcri|vision-only|image|diffusion|sdxl|flux|moderation)/;

const LLM_HINT_RE =
  /(instruct|chat|assistant|reason|r1|coder|code|llama|qwen|mistral|mixtral|deepseek|nemotron|phi|gemma|command|hermes|glm|devstral|codestral)/;

const MODEL_FALLBACKS = {
  instruction: [
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "THUDM/GLM-4.5",
    "THUDM/GLM-4.5-Air"
  ],
  reasoning: [
    "deepseek-ai/DeepSeek-R1-0528",
    "Qwen/Qwen3-235B-A22B-Thinking-2507",
    "THUDM/GLM-4.5"
  ],
  coding: [
    "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    "mistralai/Devstral-Small-2505",
    "THUDM/GLM-4.5-Air"
  ],
  writer: [
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "THUDM/GLM-4.5-Air",
    "NousResearch/Hermes-3-Llama-3.1-70B"
  ]
} as const;

export type NebiusRole = keyof typeof MODEL_FALLBACKS;

export type NebiusModelEntry = {
  id: string;
  idLower: string;
  meta: string;
  metaLower: string;
  raw: Record<string, unknown>;
};

export type NebiusModelSelection = {
  instruction: string;
  reasoning: string;
  coding: string;
  writer: string;
};

export type NebiusChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
};

export type NebiusChatCompletionParams = {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: NebiusChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: Array<Record<string, unknown>>;
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  responseFormat?: Record<string, unknown>;
};

export type NebiusChatCompletionResult = {
  id?: string;
  model?: string;
  message: NebiusChatMessage;
  finishReason?: string;
};

type ModelCatalogCache = {
  expiresAt: number;
  models: NebiusModelEntry[];
};

let modelCatalogCache: ModelCatalogCache | null = null;
let modelCatalogInFlight: Promise<NebiusModelEntry[]> | null = null;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const isLikelyGenerationModel = (idLower: string, metaLower: string): boolean => {
  const text = `${idLower} ${metaLower}`;
  if (GENERATION_EXCLUDE_RE.test(text)) {
    return false;
  }
  if (LLM_HINT_RE.test(text)) {
    return true;
  }
  return true;
};

const flattenObjectText = (input: unknown): string => {
  if (input == null) {
    return "";
  }

  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }

  if (Array.isArray(input)) {
    return input.map((value) => flattenObjectText(value)).join(" ");
  }

  if (typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>);
    return entries
      .slice(0, 48)
      .map(([key, value]) => `${key}: ${flattenObjectText(value)}`)
      .join(" ");
  }

  return "";
};

const extractModelId = (input: unknown): string => {
  if (!input || typeof input !== "object") {
    return "";
  }

  const raw = input as Record<string, unknown>;
  const candidates: unknown[] = [
    raw.id,
    raw.model,
    raw.name,
    (raw.data as Record<string, unknown> | undefined)?.id
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const value = candidate.trim();
    if (value.length > 0) {
      return value;
    }
  }

  return "";
};

const extractModelSizeB = (idLower: string): number | null => {
  const match = idLower.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const scoreModelForRole = (model: NebiusModelEntry, role: NebiusRole): number => {
  const text = `${model.idLower} ${model.metaLower}`;
  const sizeB = extractModelSizeB(model.idLower);
  let score = 0;

  if (/(preview|experimental|beta|test)/.test(text)) {
    score -= 8;
  }

  if (/(instruct|chat|assistant)/.test(text)) {
    score += 24;
  }

  if (/(llama|qwen|mistral|mixtral|deepseek|nemotron|glm|hermes|phi|gemma|command|codestral|devstral)/.test(text)) {
    score += 14;
  }

  if (role === "instruction") {
    if (/(qwen3-235b|qwen3\b|glm-4\.5|instruct|assistant)/.test(text)) {
      score += 54;
    }
    if (/(reason|r1)/.test(text)) {
      score += 5;
    }
    if (sizeB !== null) {
      if (sizeB >= 70) score += 10;
      if (sizeB <= 8) score -= 9;
    }
  }

  if (role === "reasoning") {
    if (/(deepseek-r1|deepseek\-r1|reason|r1|qwq|thinking|reasoner)/.test(text)) {
      score += 74;
    }
    if (/(coder|codestral)/.test(text)) {
      score -= 8;
    }
    if (sizeB !== null) {
      if (sizeB >= 30) score += 8;
      if (sizeB <= 10) score -= 10;
    }
  }

  if (role === "coding") {
    if (/(qwen3-coder|coder|codestral|deepseek-coder|devstral|code)/.test(text)) {
      score += 78;
    }
    if (/(reason|r1|thinking|qwq)/.test(text)) {
      score -= 6;
    }
    if (sizeB !== null) {
      if (sizeB >= 20) score += 10;
      if (sizeB < 8) score -= 7;
    }
  }

  if (role === "writer") {
    if (/(hermes|chat|assistant|dialogue|instruct|qwen3|llama-3\.3|glm-4\.5)/.test(text)) {
      score += 42;
    }
    if (/(reason|r1|thinking|qwq)/.test(text)) {
      score -= 10;
    }
    if (sizeB !== null) {
      if (sizeB >= 14 && sizeB <= 120) score += 6;
      if (sizeB < 8) score -= 4;
    }
  }

  return score;
};

const selectBestModelForRole = (models: NebiusModelEntry[], role: NebiusRole): string => {
  const ranked = [...models]
    .map((model) => ({ model, score: scoreModelForRole(model, role) }))
    .sort((left, right) => right.score - left.score);

  if (ranked.length > 0) {
    return ranked[0]!.model.id;
  }

  return MODEL_FALLBACKS[role][0];
};

const tryResolveFallbackFromCatalog = (
  models: NebiusModelEntry[],
  fallbackCandidates: readonly string[]
): string | null => {
  if (models.length === 0) {
    return null;
  }

  const byId = new Map(models.map((model) => [model.idLower, model.id]));

  for (const fallback of fallbackCandidates) {
    const found = byId.get(fallback.toLowerCase());
    if (found) {
      return found;
    }
  }

  return null;
};

const parseModelCatalogPayload = (payload: unknown): NebiusModelEntry[] => {
  const rows =
    payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>).data as unknown[]) ??
        ((payload as Record<string, unknown>).models as unknown[]) ??
        []
      : [];

  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  const models: NebiusModelEntry[] = [];

  for (const row of list) {
    const id = extractModelId(row);
    if (!id) {
      continue;
    }

    const idLower = id.toLowerCase();
    if (seen.has(idLower) || DEPRECATED_MODEL_IDS.has(idLower)) {
      continue;
    }

    const raw = row && typeof row === "object" ? (row as Record<string, unknown>) : { value: row };
    const meta = flattenObjectText(raw).slice(0, 3000);
    const metaLower = meta.toLowerCase();

    if (!isLikelyGenerationModel(idLower, metaLower)) {
      continue;
    }

    seen.add(idLower);
    models.push({
      id,
      idLower,
      meta,
      metaLower,
      raw
    });
  }

  return models;
};

export const fetchNebiusModelCatalog = async (params: {
  apiKey: string;
  baseUrl: string;
  force?: boolean;
}): Promise<NebiusModelEntry[]> => {
  const { apiKey, baseUrl, force = false } = params;
  const now = Date.now();

  if (!force && modelCatalogCache && modelCatalogCache.expiresAt > now) {
    return modelCatalogCache.models;
  }

  if (!force && modelCatalogInFlight) {
    return modelCatalogInFlight;
  }

  const normalizedBase = trimTrailingSlash(baseUrl);

  modelCatalogInFlight = (async () => {
    const urls = [`${normalizedBase}/models?verbose=true`, `${normalizedBase}/models`];
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          cache: "no-store"
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          lastError = new Error(`Model catalog ${response.status}: ${body.slice(0, 500)}`);
          continue;
        }

        const payload = (await response.json()) as unknown;
        const models = parseModelCatalogPayload(payload);

        if (models.length > 0) {
          modelCatalogCache = {
            expiresAt: Date.now() + MODEL_CATALOG_TTL_MS,
            models
          };
          return models;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (modelCatalogCache?.models.length) {
      return modelCatalogCache.models;
    }

    if (lastError) {
      throw lastError;
    }

    return [];
  })();

  try {
    return await modelCatalogInFlight;
  } finally {
    modelCatalogInFlight = null;
  }
};

export const pickNebiusModels = (models: NebiusModelEntry[]): NebiusModelSelection => {
  const instruction =
    tryResolveFallbackFromCatalog(models, MODEL_FALLBACKS.instruction) ??
    selectBestModelForRole(models, "instruction");
  const reasoning =
    tryResolveFallbackFromCatalog(models, MODEL_FALLBACKS.reasoning) ??
    selectBestModelForRole(models, "reasoning");
  const coding =
    tryResolveFallbackFromCatalog(models, MODEL_FALLBACKS.coding) ??
    selectBestModelForRole(models, "coding");
  const writer =
    tryResolveFallbackFromCatalog(models, MODEL_FALLBACKS.writer) ??
    selectBestModelForRole(models, "writer");

  return {
    instruction,
    reasoning,
    coding,
    writer
  };
};

export const nebiusChatCompletion = async (
  params: NebiusChatCompletionParams
): Promise<NebiusChatCompletionResult> => {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    temperature,
    maxTokens,
    tools,
    toolChoice,
    responseFormat
  } = params;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens ?? 900
  };

  if (typeof temperature === "number") {
    body.temperature = temperature;
  }

  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }

  if (toolChoice) {
    body.tool_choice = toolChoice;
  }

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch(`${trimTrailingSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Nebius chat completion ${response.status}: ${text.slice(0, 1200)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices)
    ? (payload.choices as Array<Record<string, unknown>>)
    : [];

  const topChoice = choices[0] ?? {};
  const message =
    (topChoice.message as NebiusChatMessage | undefined) ??
    ({ role: "assistant", content: "" } as NebiusChatMessage);

  return {
    id: typeof payload.id === "string" ? payload.id : undefined,
    model: typeof payload.model === "string" ? payload.model : undefined,
    message,
    finishReason:
      typeof topChoice.finish_reason === "string" ? topChoice.finish_reason : undefined
  };
};

export const extractNebiusMessageText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    if (typeof row.text === "string") {
      parts.push(row.text);
      continue;
    }

    if (typeof row.content === "string") {
      parts.push(row.content);
    }
  }

  return parts.join("\n").trim();
};
