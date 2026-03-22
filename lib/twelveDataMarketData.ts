export const TWELVE_DATA_DEFAULT_PAIR = "XAU_USD";
export const TWELVE_DATA_SUPPORTED_PAIRS = new Set([TWELVE_DATA_DEFAULT_PAIR]);
export const TWELVE_DATA_SUPPORTED_TIMEFRAMES = new Set([
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D",
  "W",
  "M"
]);

const TWELVE_DATA_API_BASE = "https://api.twelvedata.com";
const TWELVE_DATA_SYMBOL = "XAU/USD";
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const MAX_PAGE_SIZE = 5000;
const MAX_PAGE_COUNT = 60;
const CANDLES_CACHE_TTL_MS = 60_000;
const QUOTE_CACHE_TTL_MS = 30_000;

const TIMEFRAME_TO_INTERVAL: Record<string, string> = {
  M1: "1min",
  M5: "5min",
  M15: "15min",
  M30: "30min",
  H1: "1h",
  H4: "4h",
  D: "1day",
  W: "1week",
  M: "1month"
};

const TIMEFRAME_MS: Record<string, number> = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
  M30: 30 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
  D: 24 * 60 * 60_000,
  W: 7 * 24 * 60 * 60_000,
  M: 31 * 24 * 60 * 60_000
};

type TwelveDataJson = Record<string, unknown>;

type TwelveDataTimeSeriesRecord = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type TwelveDataTimeSeriesResponse = {
  status?: string;
  code?: number | string;
  message?: string;
  meta?: Record<string, unknown>;
  values?: TwelveDataTimeSeriesRecord[];
};

type TwelveDataQuoteResponse = {
  status?: string;
  code?: number | string;
  message?: string;
  close?: string;
  price?: string;
  last_quote_at?: number | string;
  timestamp?: number | string;
};

export type TwelveDataCandleRecord = {
  time: number;
  pair: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TwelveDataCandlesPayload = {
  pair: string;
  timeframe: string;
  start: string | null;
  end: string | null;
  count: number;
  candles: TwelveDataCandleRecord[];
  source: string;
};

export type TwelveDataQuotePayload = {
  pair: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  time: string;
  source: string;
};

const candlesCache = new Map<
  string,
  { expiresAt: number; value: TwelveDataCandlesPayload }
>();
let quoteCache: { expiresAt: number; value: TwelveDataQuotePayload } | null = null;

const getApiKey = (): string => {
  const key =
    (process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY || "").trim();
  if (!key) {
    throw new Error("Missing TWELVE_DATA_API_KEY.");
  }
  return key;
};

const parseMaybeNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
};

const parseTimeMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTwelveDateTimeMs = (value: string | undefined): number => {
  if (!value) {
    return Number.NaN;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return Date.parse(`${value.replace(" ", "T")}Z`);
  }
  return Date.parse(value);
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const toTwelveDateTime = (timestampMs: number): string => {
  const value = new Date(timestampMs);
  return [
    `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`,
    `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}:${pad2(value.getUTCSeconds())}`
  ].join(" ");
};

const normalizeError = (status: number, payload: TwelveDataJson | null, fallbackText: string): string => {
  const message =
    (payload && typeof payload.message === "string" && payload.message.trim()) ||
    fallbackText ||
    `Twelve Data HTTP ${status}`;
  return `Twelve Data ${status}: ${message}`;
};

const requestJson = async <T extends TwelveDataJson>(
  pathname: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<T> => {
  const url = new URL(`${TWELVE_DATA_API_BASE}${pathname}`);
  url.searchParams.set("apikey", getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    let payload: T | null = null;

    try {
      payload = JSON.parse(text) as T;
    } catch {
      payload = null;
    }

    const statusValue =
      payload && typeof payload.status === "string" ? payload.status.toLowerCase() : "";

    if (!response.ok || statusValue === "error") {
      throw new Error(normalizeError(response.status, payload, text.slice(0, 400)));
    }

    if (!payload) {
      throw new Error(`Twelve Data ${response.status}: Empty JSON payload.`);
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Twelve Data request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeCandleRecord = (
  raw: TwelveDataTimeSeriesRecord,
  timeframe: string
): TwelveDataCandleRecord | null => {
  const time = parseTwelveDateTimeMs(raw.datetime);
  const open = parseMaybeNumber(raw.open);
  const high = parseMaybeNumber(raw.high);
  const low = parseMaybeNumber(raw.low);
  const close = parseMaybeNumber(raw.close);
  const volume = parseMaybeNumber(raw.volume);

  if (
    !Number.isFinite(time) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }

  return {
    time,
    pair: TWELVE_DATA_DEFAULT_PAIR,
    timeframe,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0
  };
};

const sortAndDedupeCandles = (candles: TwelveDataCandleRecord[]): TwelveDataCandleRecord[] => {
  const byTime = new Map<number, TwelveDataCandleRecord>();
  for (const candle of candles) {
    byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
};

const buildCandleCacheKey = (params: {
  pair: string;
  timeframe: string;
  start?: string | null;
  end?: string | null;
}) => {
  return [
    params.pair.toUpperCase(),
    params.timeframe.toUpperCase(),
    params.start ?? "",
    params.end ?? ""
  ].join("|");
};

const buildQuoteFromCandle = (candle: TwelveDataCandleRecord): TwelveDataQuotePayload => {
  return {
    pair: TWELVE_DATA_DEFAULT_PAIR,
    bid: candle.close,
    ask: candle.close,
    mid: candle.close,
    time: new Date(candle.time).toISOString(),
    source: "twelve-data-cached-candle"
  };
};

const getCachedQuoteFallback = (): TwelveDataQuotePayload | null => {
  let latestCandle: TwelveDataCandleRecord | null = null;

  for (const entry of candlesCache.values()) {
    if (entry.expiresAt <= Date.now()) {
      continue;
    }

    const candle = entry.value.candles[entry.value.candles.length - 1] ?? null;
    if (!candle) {
      continue;
    }

    if (!latestCandle || candle.time > latestCandle.time) {
      latestCandle = candle;
    }
  }

  return latestCandle ? buildQuoteFromCandle(latestCandle) : null;
};

const getIntervalForTimeframe = (timeframe: string): string => {
  const interval = TIMEFRAME_TO_INTERVAL[timeframe];
  if (!interval) {
    throw new Error(`Unsupported Twelve Data timeframe: ${timeframe}`);
  }
  return interval;
};

const getStepMs = (timeframe: string): number => {
  return TIMEFRAME_MS[timeframe] || TIMEFRAME_MS.M1;
};

export const fetchTwelveDataCandles = async (params: {
  pair: string;
  timeframe: string;
  count: number;
  start?: string | null;
  end?: string | null;
}): Promise<TwelveDataCandlesPayload> => {
  const pair = params.pair.toUpperCase();
  const timeframe = params.timeframe.toUpperCase();

  if (!TWELVE_DATA_SUPPORTED_PAIRS.has(pair)) {
    throw new Error(`Unsupported pair: ${pair}`);
  }
  if (!TWELVE_DATA_SUPPORTED_TIMEFRAMES.has(timeframe)) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const interval = getIntervalForTimeframe(timeframe);
  const requestedCount = Math.max(1, Math.trunc(params.count));
  const cacheKey = buildCandleCacheKey(params);
  const cached = candlesCache.get(cacheKey);
  const nowMs = Date.now();
  if (cached && cached.expiresAt > nowMs && cached.value.candles.length >= requestedCount) {
    const cachedCandles = cached.value.candles.slice(-requestedCount);
    return {
      ...cached.value,
      count: cachedCandles.length,
      candles: cachedCandles
    };
  }
  const startMs = parseTimeMs(params.start ?? null);
  const endMs =
    parseTimeMs(params.end ?? null) ??
    Date.now();
  const deduped = new Map<number, TwelveDataCandleRecord>();
  const stepMs = getStepMs(timeframe);
  let cursorEndMs = endMs;
  let pageCount = 0;
  let previousEarliestMs = Number.POSITIVE_INFINITY;

  while (pageCount < MAX_PAGE_COUNT) {
    const remaining = Math.max(64, requestedCount - deduped.size + 32);
    const outputsize = Math.min(MAX_PAGE_SIZE, remaining);
    const response = await requestJson<TwelveDataTimeSeriesResponse>("/time_series", {
      symbol: TWELVE_DATA_SYMBOL,
      interval,
      outputsize,
      timezone: "UTC",
      start_date: startMs == null ? undefined : toTwelveDateTime(Math.max(0, startMs - stepMs)),
      end_date: Number.isFinite(cursorEndMs) ? toTwelveDateTime(cursorEndMs) : undefined
    });
    const values = Array.isArray(response.values) ? response.values : [];

    if (values.length === 0) {
      break;
    }

    const pageCandles = sortAndDedupeCandles(
      values
        .map((entry) => normalizeCandleRecord(entry, timeframe))
        .filter((entry): entry is TwelveDataCandleRecord => entry !== null)
    );

    if (pageCandles.length === 0) {
      break;
    }

    for (const candle of pageCandles) {
      deduped.set(candle.time, candle);
    }

    const earliestMs = pageCandles[0]!.time;
    if (startMs != null && earliestMs <= startMs) {
      break;
    }
    if (deduped.size >= requestedCount && startMs == null) {
      break;
    }
    if (pageCandles.length < outputsize) {
      break;
    }
    if (!Number.isFinite(earliestMs) || earliestMs >= previousEarliestMs) {
      break;
    }

    previousEarliestMs = earliestMs;
    cursorEndMs = earliestMs - 1000;
    pageCount += 1;
  }

  const candles = sortAndDedupeCandles([...deduped.values()]).filter((candle) => {
    if (startMs != null && candle.time < startMs) {
      return false;
    }
    if (Number.isFinite(endMs) && candle.time > endMs) {
      return false;
    }
    return true;
  });

  const trimmed =
    candles.length > requestedCount
      ? candles.slice(-requestedCount)
      : candles;

  const payload = {
    pair,
    timeframe,
    start: params.start ?? null,
    end: params.end ?? null,
    count: trimmed.length,
    candles: trimmed,
    source: "twelve-data"
  };

  candlesCache.set(cacheKey, {
    expiresAt: nowMs + CANDLES_CACHE_TTL_MS,
    value: payload
  });

  return payload;
};

export const fetchTwelveDataLatestQuote = async (): Promise<TwelveDataQuotePayload> => {
  const nowMs = Date.now();
  if (quoteCache && quoteCache.expiresAt > nowMs) {
    return quoteCache.value;
  }

  let quote: TwelveDataQuoteResponse;

  try {
    quote = await requestJson<TwelveDataQuoteResponse>("/quote", {
      symbol: TWELVE_DATA_SYMBOL
    }).catch(async () => {
      return requestJson<TwelveDataQuoteResponse>("/price", {
        symbol: TWELVE_DATA_SYMBOL
      });
    });
  } catch (error) {
    const fallback = getCachedQuoteFallback();
    if (fallback) {
      quoteCache = {
        expiresAt: nowMs + QUOTE_CACHE_TTL_MS,
        value: fallback
      };
      return fallback;
    }
    throw error;
  }

  const mid =
    parseMaybeNumber(quote.close) ||
    parseMaybeNumber(quote.price);
  const timeSeconds =
    parseMaybeNumber(quote.last_quote_at) ||
    parseMaybeNumber(quote.timestamp);
  const timeMs = Number.isFinite(timeSeconds) ? timeSeconds * 1000 : Date.now();

  const payload = {
    pair: TWELVE_DATA_DEFAULT_PAIR,
    bid: Number.isFinite(mid) ? mid : null,
    ask: Number.isFinite(mid) ? mid : null,
    mid: Number.isFinite(mid) ? mid : null,
    time: new Date(timeMs).toISOString(),
    source: "twelve-data"
  };

  quoteCache = {
    expiresAt: nowMs + QUOTE_CACHE_TTL_MS,
    value: payload
  };

  return payload;
};

export const probeTwelveDataAccess = async (): Promise<void> => {
  await fetchTwelveDataLatestQuote();
};
