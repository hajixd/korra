type EntryNeighborLike = {
  metaTime?: unknown;
  t?: {
    entryTime?: unknown;
  } | null;
};

type TradeDependencySnapshotLike = {
  entryTime?: unknown;
  entryNeighbors?: Array<EntryNeighborLike | null | undefined> | null;
};

export const normalizeTradeTimestampSeconds = (value: unknown): number | null => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : numeric;
};

export const resolveEntryNeighborTimestampSeconds = (
  neighbor: EntryNeighborLike | null | undefined
): number | null => {
  if (!neighbor || typeof neighbor !== "object") {
    return null;
  }

  return normalizeTradeTimestampSeconds(neighbor.metaTime ?? neighbor.t?.entryTime ?? null);
};

export const isTradeCheatedByFutureDependency = (
  trade: TradeDependencySnapshotLike | null | undefined
): boolean => {
  if (!trade || typeof trade !== "object") {
    return false;
  }

  const tradeEntryTime = normalizeTradeTimestampSeconds(trade.entryTime);
  if (tradeEntryTime == null) {
    return false;
  }

  const neighbors = Array.isArray(trade.entryNeighbors) ? trade.entryNeighbors : [];

  for (const neighbor of neighbors) {
    const neighborEntryTime = resolveEntryNeighborTimestampSeconds(neighbor);
    if (neighborEntryTime != null && neighborEntryTime > tradeEntryTime) {
      return true;
    }
  }

  return false;
};
