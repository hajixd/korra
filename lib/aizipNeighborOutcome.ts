type NeighborLike = {
  label?: unknown;
  metaLabel?: unknown;
  outcomeLabel?: unknown;
  metaOutcomeLabel?: unknown;
  metaOutcome?: unknown;
  outcome?: unknown;
  result?: unknown;
  metaResult?: unknown;
  metaPnl?: unknown;
  pnl?: unknown;
  profit?: unknown;
  netPnl?: unknown;
  pnlUsd?: unknown;
  t?: {
    label?: unknown;
    pnl?: unknown;
    unrealizedPnl?: unknown;
    win?: unknown;
  } | null;
};

export type AIZipNeighborVoteOutcome = "win" | "loss" | "neutral";

const parseFiniteNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractNeighborLabel = (neighbor: NeighborLike): number | null => {
  const label =
    parseFiniteNumber(neighbor.label) ??
    parseFiniteNumber(neighbor.metaLabel) ??
    parseFiniteNumber(neighbor.outcomeLabel) ??
    parseFiniteNumber(neighbor.metaOutcomeLabel) ??
    parseFiniteNumber(neighbor.t?.label);

  if (label == null || label === 0) {
    return null;
  }

  return label > 0 ? 1 : -1;
};

const extractNeighborOutcomeText = (neighbor: NeighborLike): string => {
  return String(
    neighbor.metaOutcome ??
      neighbor.outcome ??
      neighbor.result ??
      neighbor.metaResult ??
      ""
  )
    .trim()
    .toUpperCase();
};

const extractNeighborPnl = (neighbor: NeighborLike): number | null => {
  return (
    parseFiniteNumber(neighbor.metaPnl) ??
    parseFiniteNumber(neighbor.pnl) ??
    parseFiniteNumber(neighbor.profit) ??
    parseFiniteNumber(neighbor.netPnl) ??
    parseFiniteNumber(neighbor.pnlUsd) ??
    parseFiniteNumber(neighbor.t?.pnl) ??
    parseFiniteNumber(neighbor.t?.unrealizedPnl)
  );
};

export const resolveAIZipNeighborVoteOutcome = (
  value: unknown
): AIZipNeighborVoteOutcome => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "neutral";
  }

  const neighbor = value as NeighborLike;
  const label = extractNeighborLabel(neighbor);
  if (label === 1) {
    return "win";
  }
  if (label === -1) {
    return "loss";
  }

  const outcomeText = extractNeighborOutcomeText(neighbor);
  if (
    outcomeText === "TP" ||
    outcomeText === "WIN" ||
    outcomeText.includes("WIN")
  ) {
    return "win";
  }
  if (
    outcomeText === "SL" ||
    outcomeText === "LOSS" ||
    outcomeText.includes("LOSS")
  ) {
    return "loss";
  }

  const pnl = extractNeighborPnl(neighbor);
  if (pnl != null) {
    return pnl >= 0 ? "win" : "loss";
  }

  if (typeof neighbor.t?.win === "boolean") {
    return neighbor.t.win ? "win" : "loss";
  }

  return "neutral";
};

export const isAIZipNeighborVoteWin = (value: unknown) =>
  resolveAIZipNeighborVoteOutcome(value) === "win";

export const isAIZipNeighborVoteLoss = (value: unknown) =>
  resolveAIZipNeighborVoteOutcome(value) === "loss";

export const toneForAIZipNeighborVoteOutcome = (
  outcome: AIZipNeighborVoteOutcome
): "green" | "red" | "neutral" => {
  if (outcome === "win") {
    return "green";
  }
  if (outcome === "loss") {
    return "red";
  }
  return "neutral";
};

export const labelForAIZipNeighborVoteOutcome = (
  outcome: AIZipNeighborVoteOutcome
): "WIN" | "LOSS" | "-" => {
  if (outcome === "win") {
    return "WIN";
  }
  if (outcome === "loss") {
    return "LOSS";
  }
  return "-";
};
