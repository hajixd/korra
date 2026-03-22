const AI_CONFIDENCE_EPS = 1e-8;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const normalizeAiProbabilityScore = (value: unknown): number | null => {
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric > 1 && numeric <= 100) {
    numeric /= 100;
  }

  if (numeric >= -1 && numeric <= 1 && numeric < 0) {
    numeric = (numeric + 1) / 2;
  }

  return clamp(Math.abs(numeric), 0, 1);
};

export const resolveExplicitAiConfidenceScore = (
  value: unknown,
  fields: string[] = [
    "entryConfidence",
    "aiConfidence",
    "confidence",
    "entryMargin",
    "aiMargin",
    "potentialMargin",
    "margin",
    "hdbWinRate",
    "clusterWinRate"
  ]
): number | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  for (const field of fields) {
    const normalized = normalizeAiProbabilityScore(source[field]);
    if (normalized != null) {
      return normalized;
    }
  }

  return null;
};

export const getEntryNeighborOutcomeScore = (
  neighbor: any
): number | null => {
  if (!neighbor || typeof neighbor !== "object") {
    return null;
  }

  const label = Number((neighbor as any).label);
  if (Number.isFinite(label)) {
    if (label > 0) return 1;
    if (label < 0) return 0;
  }

  const outcome = String(
    (neighbor as any).metaOutcome ??
      (neighbor as any).t?.result ??
      ""
  )
    .trim()
    .toLowerCase();

  if (
    outcome === "tp" ||
    outcome === "win" ||
    outcome.includes("win") ||
    outcome.includes("take profit")
  ) {
    return 1;
  }

  if (
    outcome === "sl" ||
    outcome === "loss" ||
    outcome.includes("loss") ||
    outcome.includes("stop loss")
  ) {
    return 0;
  }

  const pnl = Number(
    (neighbor as any).metaPnl ??
      (neighbor as any).t?.pnl ??
      NaN
  );
  if (Number.isFinite(pnl)) {
    return pnl >= 0 ? 1 : 0;
  }

  return null;
};

const getEntryNeighborWeight = (neighbor: any): number => {
  const rawWeight = Number((neighbor as any)?.w);
  if (Number.isFinite(rawWeight) && rawWeight > 0) {
    return rawWeight;
  }
  return 1;
};

export const computeNeighborConfidenceScore = (
  neighbors: Array<any> | null | undefined,
  options?: {
    maxNeighbors?: number | null;
    sortByDistance?: boolean;
  }
): number | null => {
  if (!Array.isArray(neighbors) || neighbors.length === 0) {
    return null;
  }

  const sortByDistance = options?.sortByDistance !== false;
  const maxNeighborsRaw = Number(options?.maxNeighbors);
  const maxNeighbors =
    Number.isFinite(maxNeighborsRaw) && maxNeighborsRaw > 0
      ? Math.max(1, Math.floor(maxNeighborsRaw))
      : null;

  const ordered = sortByDistance
    ? neighbors
        .slice()
        .sort((left, right) => {
          const leftDistance = Number((left as any)?.d);
          const rightDistance = Number((right as any)?.d);
          const leftValue = Number.isFinite(leftDistance) ? leftDistance : Infinity;
          const rightValue = Number.isFinite(rightDistance) ? rightDistance : Infinity;
          return leftValue - rightValue;
        })
    : neighbors.slice();

  const capped = maxNeighbors == null ? ordered : ordered.slice(0, maxNeighbors);
  let wins = 0;
  let losses = 0;

  for (const neighbor of capped) {
    const outcomeScore = getEntryNeighborOutcomeScore(neighbor);
    if (outcomeScore == null) {
      continue;
    }

    const weight = getEntryNeighborWeight(neighbor);
    if (!(weight > 0)) {
      continue;
    }

    wins += weight * outcomeScore;
    losses += weight * (1 - outcomeScore);
  }

  if (wins <= 0 && losses <= 0) {
    return null;
  }

  return clamp(wins / (wins + losses + AI_CONFIDENCE_EPS), 0, 1);
};

export const computeAverageNeighborContributionAtEntryScore = (
  neighbors: Array<any> | null | undefined
): number | null => {
  if (!Array.isArray(neighbors) || neighbors.length === 0) {
    return null;
  }

  const aggregates = new Map<string, { wins: number; losses: number }>();

  for (const neighbor of neighbors) {
    const outcomeScore = getEntryNeighborOutcomeScore(neighbor);
    if (outcomeScore == null) {
      continue;
    }

    const libraryKey =
      String((neighbor as any)?.metaLib ?? "").trim().toLowerCase() || "unknown";
    const weight = getEntryNeighborWeight(neighbor);
    const current = aggregates.get(libraryKey) ?? { wins: 0, losses: 0 };
    current.wins += weight * outcomeScore;
    current.losses += weight * (1 - outcomeScore);
    aggregates.set(libraryKey, current);
  }

  if (aggregates.size === 0) {
    return null;
  }

  let weightedContribution = 0;
  let totalWeight = 0;

  for (const neighbor of neighbors) {
    const libraryKey =
      String((neighbor as any)?.metaLib ?? "").trim().toLowerCase() || "unknown";
    const aggregate = aggregates.get(libraryKey);
    if (!aggregate) {
      continue;
    }

    const libraryTotal = aggregate.wins + aggregate.losses;
    if (!(libraryTotal > 0)) {
      continue;
    }

    const libraryContribution = aggregate.wins / libraryTotal;
    const weight = getEntryNeighborWeight(neighbor);
    weightedContribution += libraryContribution * weight;
    totalWeight += weight;
  }

  if (!(totalWeight > 0)) {
    return null;
  }

  return clamp(weightedContribution / totalWeight, 0, 1);
};
