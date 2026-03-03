export type DeterministicIntent =
  | { type: "monthly_avg_price" }
  | { type: "monthly_volume" }
  | { type: "none" };

export type MonthlyAggregateRow = {
  month: string;
  avg_close: number;
  avg_range: number;
  total_volume: number;
  count: number;
};

export const detectDeterministicIntent = (text: string): DeterministicIntent => {
  const normalized = String(text || "").trim().toLowerCase();

  if (!normalized) {
    return { type: "none" };
  }

  const asksAvgPerMonth =
    (normalized.includes("average") || normalized.includes("avg") || normalized.includes("mean")) &&
    normalized.includes("price") &&
    normalized.includes("month");

  if (asksAvgPerMonth) {
    return { type: "monthly_avg_price" };
  }

  const asksVolumePerMonth =
    normalized.includes("volume") &&
    normalized.includes("month") &&
    (normalized.includes("average") || normalized.includes("avg") || normalized.includes("total") || normalized.includes("sum"));

  if (asksVolumePerMonth) {
    return { type: "monthly_volume" };
  }

  return { type: "none" };
};

export const summarizeMonthlyAggregates = (rows: MonthlyAggregateRow[]) => {
  if (rows.length === 0) {
    return {
      months: 0,
      globalAvgClose: 0,
      highestMonth: null as { month: string; avgClose: number } | null,
      lowestMonth: null as { month: string; avgClose: number } | null,
      totalVolume: 0
    };
  }

  let sumClose = 0;
  let sumVolume = 0;
  let highest = rows[0]!;
  let lowest = rows[0]!;

  for (const row of rows) {
    sumClose += row.avg_close;
    sumVolume += row.total_volume;

    if (row.avg_close > highest.avg_close) {
      highest = row;
    }

    if (row.avg_close < lowest.avg_close) {
      lowest = row;
    }
  }

  return {
    months: rows.length,
    globalAvgClose: Number((sumClose / rows.length).toFixed(4)),
    highestMonth: {
      month: highest.month,
      avgClose: Number(highest.avg_close.toFixed(4))
    },
    lowestMonth: {
      month: lowest.month,
      avgClose: Number(lowest.avg_close.toFixed(4))
    },
    totalVolume: Number(sumVolume.toFixed(2))
  };
};
