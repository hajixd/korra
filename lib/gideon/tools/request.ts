import type { GideonRuntimeContext } from "../contracts";

const COMMON_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"] as const;

const inferClickhousePair = (rawValue: string): string | null => {
  const direct = rawValue.trim().toUpperCase();
  if (!direct) {
    return null;
  }

  const compact = direct.replace(/[^A-Z0-9]/g, "");
  if (!compact) {
    return null;
  }

  const quoteTokens = [
    "USDT",
    "USDC",
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "AUD",
    "CAD",
    "CHF",
    "NZD",
    "BTC",
    "ETH",
    "XAU",
    "XAG"
  ];

  for (const quote of quoteTokens) {
    if (!compact.endsWith(quote)) {
      continue;
    }
    const base = compact.slice(0, compact.length - quote.length);
    if (base.length >= 2) {
      return `${base}_${quote}`;
    }
  }

  if (compact.length === 6) {
    return `${compact.slice(0, 3)}_${compact.slice(3, 6)}`;
  }

  return null;
};

export const resolveSymbolTool = (params: {
  prompt: string;
  runtime: GideonRuntimeContext;
}) => {
  const prompt = params.prompt.toUpperCase();
  const directSymbol = prompt.match(/\b[A-Z]{3,6}(?:[_/][A-Z]{3,6})?\b/);
  const resolved = directSymbol?.[0]?.replace("/", "_") || params.runtime.symbol || "XAUUSD";
  return {
    symbol: resolved,
    clickhousePair: inferClickhousePair(resolved) ?? "XAU_USD",
    source: directSymbol ? "prompt" : "runtime"
  };
};

export const resolveTimeframeTool = (params: {
  prompt: string;
  runtime: GideonRuntimeContext;
}) => {
  const prompt = params.prompt.toUpperCase();
  for (const timeframe of COMMON_TIMEFRAMES) {
    if (prompt.includes(timeframe)) {
      return {
        timeframe,
        source: "prompt"
      };
    }
  }

  return {
    timeframe: params.runtime.timeframe || "M15",
    source: "runtime"
  };
};
