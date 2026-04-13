const normalizeStableValue = (value: unknown, inArray = false): unknown => {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return inArray ? null : undefined;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeStableValue(entry, true));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      const normalized = normalizeStableValue(record[key], false);
      if (normalized !== undefined) {
        next[key] = normalized;
      }
    }

    return next;
  }

  return value;
};

export const stableStringify = (value: unknown): string => {
  return JSON.stringify(normalizeStableValue(value));
};
