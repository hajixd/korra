export type BacktestExitReasonTradeLike = {
  result?: string | null;
  exitReason?: string | null;
  targetPrice: number;
  stopPrice: number;
  entryPrice: number;
  outcomePrice: number;
};

export const normalizeBacktestExitReason = (reason?: string | null): string => {
  if (!reason) {
    return "";
  }

  const raw = String(reason).trim();

  if (!raw || raw === "-") {
    return "";
  }

  const upper = raw.toUpperCase();

  if (upper === "TP" || upper.includes("TAKE")) {
    return "Take Profit";
  }

  if (
    upper === "BE" ||
    upper === "BREAKEVEN" ||
    upper === "BREAK-EVEN" ||
    upper.includes("BREAK EVEN")
  ) {
    return "Break Even";
  }

  if (upper === "TSL" || upper.includes("TRAIL")) {
    return "Trailing Stop";
  }

  if (upper === "SL" || upper.includes("STOP")) {
    return "Stop Loss";
  }

  if (upper.includes("MIM") || upper.includes("MIT")) {
    return "MIT";
  }

  if (upper.includes("AI")) {
    return "AI";
  }

  if (upper.includes("MODEL")) {
    return "Model Exit";
  }

  return raw;
};

export const getBacktestExitLabel = (trade: BacktestExitReasonTradeLike): string => {
  const normalized = normalizeBacktestExitReason(trade.exitReason);

  if (normalized) {
    return normalized;
  }

  const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
  const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
  const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);

  if (trade.result === "Win" && realizedGap >= targetGap * 0.84) {
    return "Take Profit";
  }

  if (trade.result === "Loss" && realizedGap >= stopGap * 0.84) {
    return "Stop Loss";
  }

  return "Model Exit";
};

export const getBacktestEntryExitStatsExitBucket = (
  trade: BacktestExitReasonTradeLike
): string => {
  const exitLabel = getBacktestExitLabel(trade);

  if (exitLabel === "Model Exit") {
    if (trade.result === "Win") {
      return "Model Exit Win";
    }

    if (trade.result === "Loss") {
      return "Model Exit Loss";
    }
  }

  return exitLabel || "None";
};
