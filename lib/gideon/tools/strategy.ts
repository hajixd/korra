import type { GideonRuntimeContext } from "../contracts";

export const exportStrategyJsonTool = (runtime: GideonRuntimeContext) => {
  const draftJson = runtime.strategyDraftJson ?? null;
  if (!draftJson || typeof draftJson !== "object") {
    return {
      ready: false,
      filename: null,
      byteLength: 0
    };
  }

  const idCandidate =
    typeof draftJson.id === "string" && draftJson.id.trim().length > 0
      ? draftJson.id.trim()
      : "strategy-draft";
  const filename = `${idCandidate}.json`;
  const body = JSON.stringify(draftJson, null, 2);

  return {
    ready: true,
    filename,
    byteLength: Buffer.byteLength(body, "utf8")
  };
};
