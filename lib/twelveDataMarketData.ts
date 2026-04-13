import fs from "node:fs";
import path from "node:path";

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
const CANDLES_CACHE_TTL_MS = 10 * 60_000;
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
const candlesInFlight = new Map<string, Promise<TwelveDataCandlesPayload>>();
let quoteCache: { expiresAt: number; value: TwelveDataQuotePayload } | null = null;
let quoteInFlight: Promise<TwelveDataQuotePayload> | null = null;
type TwelveDataKeyFailureType = "rate_limit" | "auth" | "other";
type TwelveDataKeyTelemetry = {
  creditsUsed: number | null;
  creditsLeft: number | null;
  creditCapacity: number | null;
  recentLatencyMs: number | null;
  updatedAt: number;
};
type TwelveDataRangeChunk = {
  startMs: number;
  endMs: number;
  attempt: number;
  repairDepth: number;
};
type TwelveDataRangeChunkResult = {
  chunk: TwelveDataRangeChunk;
  candles: TwelveDataCandleRecord[];
};

const keyFailureState = new Map<
  string,
  { unavailableUntil: number; failureType: TwelveDataKeyFailureType; details: string }
>();
const keyUsageState = new Map<
  string,
  { lastAttemptAt: number; lastSuccessAt: number }
>();
const keyTelemetryState = new Map<string, TwelveDataKeyTelemetry>();

class TwelveDataRequestError extends Error {
  failureType: TwelveDataKeyFailureType;

  constructor(message: string, failureType: TwelveDataKeyFailureType) {
    super(message);
    this.name = "TwelveDataRequestError";
    this.failureType = failureType;
  }
}

const RATE_LIMIT_COOLDOWN_MS = 65_000;
const AUTH_COOLDOWN_MS = 30 * 60_000;
const TRANSIENT_COOLDOWN_MS = 15_000;
const KEY_MIN_REQUEST_GAP_MS = 500;
const EXACT_RANGE_TARGET_BARS = 4990;
const EXACT_RANGE_OVERLAP_BARS = 1;
const EXACT_RANGE_PADDING_BARS = 2;
const EXACT_RANGE_MAX_REPAIR_DEPTH = 3;
const EXACT_RANGE_MAX_REPAIR_WINDOWS = 24;
const EXACT_RANGE_MAX_WORKERS = 6;
const EXACT_RANGE_REPAIR_GAP_TOLERANCE_MS = 3 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
let localEnvCache: Map<string, string> | null = null;
let runtimeApiKeysOverride: string[] | null = null;

const collectEnvSearchRoots = (): string[] => {
  const roots = new Set<string>();
  const addLineage = (startDir: string | null | undefined) => {
    if (!startDir) {
      return;
    }
    let current = path.resolve(startDir);
    for (let depth = 0; depth < 12; depth += 1) {
      roots.add(current);
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  };

  addLineage(process.cwd());
  if (typeof __dirname === "string" && __dirname.trim().length > 0) {
    addLineage(__dirname);
  }

  return [...roots];
};

const loadLocalEnvCache = (): Map<string, string> => {
  if (localEnvCache) {
    return localEnvCache;
  }

  const resolved = new Map<string, string>();
  for (const rootDir of collectEnvSearchRoots()) {
    for (const candidate of [".env.local", ".env"]) {
      const filePath = path.join(rootDir, candidate);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
          continue;
        }
        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
          continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        if (!key || resolved.has(key)) {
          continue;
        }
        const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
        resolved.set(key, value);
      }
    }
  }

  localEnvCache = resolved;
  return resolved;
};

const getConfigValue = (...names: string[]): string => {
  const fileCache = loadLocalEnvCache();
  for (const name of names) {
    const envValue = process.env[name];
    if (typeof envValue === "string" && envValue.trim().length > 0) {
      return envValue.trim();
    }
    const fileValue = fileCache.get(name);
    if (typeof fileValue === "string" && fileValue.trim().length > 0) {
      return fileValue.trim();
    }
  }
  return "";
};

export const setTwelveDataRuntimeApiKeys = (keys: string[]): void => {
  const normalized = keys
    .map((key) => String(key || "").trim())
    .filter((key, index, source) => key.length > 0 && source.indexOf(key) === index);
  runtimeApiKeysOverride = normalized.length > 0 ? normalized : null;
};

const parseConfiguredApiKeys = (): string[] => {
  if (runtimeApiKeysOverride && runtimeApiKeysOverride.length > 0) {
    return [...runtimeApiKeysOverride];
  }

  const raw = [
    getConfigValue("TWELVE_DATA_API_KEYS"),
    getConfigValue("TWELVE_DATA_API_KEY"),
    getConfigValue("TWELVEDATA_API_KEY")
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(",");

  const unique = new Set<string>();
  for (const token of raw.split(/[,\r\n;]+/)) {
    const key = token.trim();
    if (key) {
      unique.add(key);
    }
  }

  return [...unique];
};

const getApiKeys = (): string[] => {
  const keys = parseConfiguredApiKeys();
  if (keys.length === 0) {
    throw new Error("Missing TWELVE_DATA_API_KEY.");
  }
  return keys;
};

const parseHeaderNumber = (headers: Headers, name: string): number | null => {
  const raw = headers.get(name);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const updateApiKeyTelemetry = (apiKey: string, headers: Headers, latencyMs: number) => {
  const creditsUsed = parseHeaderNumber(headers, "api-credits-used");
  const creditsLeft = parseHeaderNumber(headers, "api-credits-left");
  const existing = keyTelemetryState.get(apiKey);
  const creditCapacity =
    creditsUsed != null && creditsLeft != null
      ? creditsUsed + creditsLeft
      : existing?.creditCapacity ?? null;

  keyTelemetryState.set(apiKey, {
    creditsUsed: creditsUsed ?? existing?.creditsUsed ?? null,
    creditsLeft: creditsLeft ?? existing?.creditsLeft ?? null,
    creditCapacity,
    recentLatencyMs:
      Number.isFinite(latencyMs) && latencyMs >= 0
        ? latencyMs
        : existing?.recentLatencyMs ?? null,
    updatedAt: Date.now()
  });
};

export const hasConfiguredTwelveDataApiKeys = (): boolean => {
  return parseConfiguredApiKeys().length > 0;
};

export const isTwelveDataAuthFailureMessage = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes(" 401") ||
    lower.includes(" 403") ||
    lower.includes("http 401") ||
    lower.includes("http 403") ||
    lower.includes("invalid api key") ||
    lower.includes("api key is invalid") ||
    lower.includes("apikey") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("missing twelve_data_api_key")
  );
};

export const isTwelveDataRetryableMessage = (message: string): boolean => {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("key pool cooling down") ||
    lower.includes("retry in") ||
    lower.includes("run out of api credits") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("current limit being") ||
    lower.includes(" 429") ||
    lower.includes("http 429")
  );
};

export const getTwelveDataRetryAfterSeconds = (message: string): number | null => {
  const normalized = String(message || "");
  const explicitMatch = normalized.match(/retry in\s+(\d+)\s*s/i);
  if (explicitMatch) {
    const seconds = Number(explicitMatch[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  if (isTwelveDataRetryableMessage(normalized)) {
    return Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000);
  }
  return null;
};

const classifyFailureType = (message: string): TwelveDataKeyFailureType => {
  const lower = message.toLowerCase();

  if (
    lower.includes(" 429") ||
    lower.includes("http 429") ||
    lower.includes("run out of api credits") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("current limit being")
  ) {
    return "rate_limit";
  }

  if (isTwelveDataAuthFailureMessage(message)) {
    return "auth";
  }

  return "other";
};

const getFailureCooldownMs = (failureType: TwelveDataKeyFailureType): number => {
  if (failureType === "rate_limit") {
    return RATE_LIMIT_COOLDOWN_MS;
  }
  if (failureType === "auth") {
    return AUTH_COOLDOWN_MS;
  }
  return TRANSIENT_COOLDOWN_MS;
};

const sleep = async (delayMs: number): Promise<void> => {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const getKeyReadyAt = (apiKey: string): number => {
  const lastAttemptAt = keyUsageState.get(apiKey)?.lastAttemptAt ?? 0;
  const unavailableUntil = keyFailureState.get(apiKey)?.unavailableUntil ?? 0;
  return Math.max(unavailableUntil, lastAttemptAt + KEY_MIN_REQUEST_GAP_MS);
};

const getOrderedApiKeys = (apiKeysOverride?: string[]): string[] => {
  const candidateKeys =
    Array.isArray(apiKeysOverride) && apiKeysOverride.length > 0
      ? [...apiKeysOverride]
      : getApiKeys();
  return candidateKeys.sort((left, right) => {
    const leftReadyAt = getKeyReadyAt(left);
    const rightReadyAt = getKeyReadyAt(right);
    if (leftReadyAt !== rightReadyAt) {
      return leftReadyAt - rightReadyAt;
    }
    const leftCredits = keyTelemetryState.get(left)?.creditsLeft ?? Number.POSITIVE_INFINITY;
    const rightCredits = keyTelemetryState.get(right)?.creditsLeft ?? Number.POSITIVE_INFINITY;
    if (leftCredits !== rightCredits) {
      return rightCredits - leftCredits;
    }
    const leftLatency = keyTelemetryState.get(left)?.recentLatencyMs ?? Number.POSITIVE_INFINITY;
    const rightLatency = keyTelemetryState.get(right)?.recentLatencyMs ?? Number.POSITIVE_INFINITY;
    if (leftLatency !== rightLatency) {
      return leftLatency - rightLatency;
    }
    const leftLastSuccessAt = keyUsageState.get(left)?.lastSuccessAt ?? 0;
    const rightLastSuccessAt = keyUsageState.get(right)?.lastSuccessAt ?? 0;
    if (leftLastSuccessAt !== rightLastSuccessAt) {
      return leftLastSuccessAt - rightLastSuccessAt;
    }
    return 0;
  });
};

const markApiKeyAttempt = (apiKey: string) => {
  const current = keyUsageState.get(apiKey);
  keyUsageState.set(apiKey, {
    lastAttemptAt: Date.now(),
    lastSuccessAt: current?.lastSuccessAt ?? 0
  });
};

const markApiKeyFailure = (
  apiKey: string,
  failureType: TwelveDataKeyFailureType,
  details: string
) => {
  keyFailureState.set(apiKey, {
    unavailableUntil: Date.now() + getFailureCooldownMs(failureType),
    failureType,
    details
  });
};

const markApiKeySuccess = (apiKey: string) => {
  keyFailureState.delete(apiKey);
  const current = keyUsageState.get(apiKey);
  keyUsageState.set(apiKey, {
    lastAttemptAt: current?.lastAttemptAt ?? 0,
    lastSuccessAt: Date.now()
  });
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

const requestJsonWithApiKey = async <T extends TwelveDataJson>(
  apiKey: string,
  pathname: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<{ payload: T; headers: Headers; apiKey: string }> => {
  const url = new URL(`${TWELVE_DATA_API_BASE}${pathname}`);
  url.searchParams.set("apikey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const requestStartedAt = Date.now();
  markApiKeyAttempt(apiKey);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal
    });
    const latencyMs = Date.now() - requestStartedAt;
    updateApiKeyTelemetry(apiKey, response.headers, latencyMs);

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
      const message = normalizeError(response.status, payload, text.slice(0, 400));
      throw new TwelveDataRequestError(message, classifyFailureType(message));
    }

    if (!payload) {
      throw new TwelveDataRequestError(
        `Twelve Data ${response.status}: Empty JSON payload.`,
        "other"
      );
    }

    markApiKeySuccess(apiKey);
    return {
      payload,
      headers: response.headers,
      apiKey
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Twelve Data request timed out."
        : error instanceof Error
          ? error.message
          : String(error);
    const requestError =
      error instanceof TwelveDataRequestError
        ? error
        : new TwelveDataRequestError(message, classifyFailureType(message));

    markApiKeyFailure(apiKey, requestError.failureType, requestError.message);
    throw requestError;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getEarliestApiKeyReadyAt = (apiKeysOverride?: string[]): number => {
  const orderedKeys = getOrderedApiKeys(apiKeysOverride);
  if (orderedKeys.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return orderedKeys.reduce(
    (best, apiKey) => Math.min(best, getKeyReadyAt(apiKey)),
    Number.POSITIVE_INFINITY
  );
};

const requestJsonDetailed = async <T extends TwelveDataJson>(
  pathname: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  apiKeysOverride?: string[]
): Promise<{ payload: T; headers: Headers; apiKey: string }> => {
  const requestStartedAt = Date.now();
  const candidateKeys = getOrderedApiKeys(apiKeysOverride);
  if (candidateKeys.length === 0) {
    throw new TwelveDataRequestError("Missing TWELVE_DATA_API_KEY.", "auth");
  }
  let lastError: TwelveDataRequestError | null = null;

  while (Date.now() - requestStartedAt < timeoutMs) {
    let apiKeys = candidateKeys.filter((apiKey) => getKeyReadyAt(apiKey) <= Date.now());

    if (apiKeys.length === 0) {
      const earliestReadyAt = getEarliestApiKeyReadyAt(apiKeysOverride);
      const retryInMs = Math.max(0, earliestReadyAt - Date.now());
      const remainingBudgetMs = timeoutMs - (Date.now() - requestStartedAt);

      if (!Number.isFinite(earliestReadyAt) || remainingBudgetMs <= 250) {
        throw new TwelveDataRequestError(
          `Twelve Data key pool cooling down. Retry in ${Math.max(1, Math.ceil(retryInMs / 1000))}s.`,
          "rate_limit"
        );
      }

      await sleep(Math.min(Math.max(75, retryInMs), Math.max(75, remainingBudgetMs - 200)));
      apiKeys = candidateKeys.filter((apiKey) => getKeyReadyAt(apiKey) <= Date.now());
    }

    for (const apiKey of apiKeys) {
      try {
        return await requestJsonWithApiKey<T>(apiKey, pathname, params, timeoutMs);
      } catch (error) {
        lastError =
          error instanceof TwelveDataRequestError
            ? error
            : new TwelveDataRequestError(String(error), "other");
      }
    }

    if (!lastError || lastError.failureType !== "rate_limit") {
      break;
    }

    const earliestReadyAt = getEarliestApiKeyReadyAt(apiKeysOverride);
    const retryInMs = Math.max(0, earliestReadyAt - Date.now());
    const remainingBudgetMs = timeoutMs - (Date.now() - requestStartedAt);

    if (!Number.isFinite(earliestReadyAt) || remainingBudgetMs <= 250) {
      break;
    }

    await sleep(Math.min(Math.max(100, retryInMs), Math.max(100, remainingBudgetMs - 200)));
  }

  if (lastError) {
    throw new TwelveDataRequestError(
      `All Twelve Data API keys failed. ${lastError.message}`,
      lastError.failureType
    );
  }

  const earliestReadyAt = getEarliestApiKeyReadyAt(apiKeysOverride);
  if (Number.isFinite(earliestReadyAt) && earliestReadyAt > Date.now()) {
    const retryInSeconds = Math.max(1, Math.ceil((earliestReadyAt - Date.now()) / 1000));
    throw new TwelveDataRequestError(
      `Twelve Data key pool cooling down. Retry in ${retryInSeconds}s.`,
      "rate_limit"
    );
  }

  throw new TwelveDataRequestError(
    "Twelve Data request window expired before any key became available.",
    "other"
  );
};

const requestJson = async <T extends TwelveDataJson>(
  pathname: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  apiKeysOverride?: string[]
): Promise<T> => {
  const result = await requestJsonDetailed<T>(pathname, params, timeoutMs, apiKeysOverride);
  return result.payload;
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

const isXauTradingTime = (timestampMs: number): boolean => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (day === 6) {
    return false;
  }

  if (day === 5 && hour >= 22) {
    return false;
  }

  if (day === 0 && hour < 23) {
    return false;
  }

  if (day >= 1 && day <= 4 && hour === 22) {
    return false;
  }

  return true;
};

const floorToStep = (timestampMs: number, stepMs: number): number => {
  return Math.floor(timestampMs / stepMs) * stepMs;
};

const ceilToStep = (timestampMs: number, stepMs: number): number => {
  return Math.ceil(timestampMs / stepMs) * stepMs;
};

const findNextTradingSlotAtOrAfter = (timestampMs: number, timeframe: string): number | null => {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const stepMs = Math.max(60_000, getStepMs(timeframe));
  let probeMs = ceilToStep(timestampMs, stepMs);
  const maxProbeMs = probeMs + 14 * DAY_MS;

  while (probeMs <= maxProbeMs) {
    if (isXauTradingTime(probeMs)) {
      return probeMs;
    }
    probeMs += stepMs;
  }

  return null;
};

const findLastTradingSlotAtOrBefore = (timestampMs: number, timeframe: string): number | null => {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const stepMs = Math.max(60_000, getStepMs(timeframe));
  let probeMs = floorToStep(timestampMs, stepMs);

  while (probeMs >= 0) {
    if (isXauTradingTime(probeMs)) {
      return probeMs;
    }
    probeMs -= stepMs;
  }

  return null;
};

const mergeRangeChunks = (chunks: TwelveDataRangeChunk[]): TwelveDataRangeChunk[] => {
  if (chunks.length <= 1) {
    return chunks;
  }

  const sorted = [...chunks].sort(
    (left, right) => left.startMs - right.startMs || left.endMs - right.endMs
  );
  const merged: TwelveDataRangeChunk[] = [sorted[0]!];

  for (const chunk of sorted.slice(1)) {
    const previous = merged[merged.length - 1]!;
    if (chunk.startMs <= previous.endMs + 1) {
      previous.endMs = Math.max(previous.endMs, chunk.endMs);
      previous.attempt = Math.max(previous.attempt, chunk.attempt);
      previous.repairDepth = Math.max(previous.repairDepth, chunk.repairDepth);
      continue;
    }
    merged.push({ ...chunk });
  }

  return merged;
};

const buildRangeChunks = (
  timeframe: string,
  startMs: number,
  endMs: number,
  repairDepth = 0
): TwelveDataRangeChunk[] => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }

  const stepMs = Math.max(60_000, getStepMs(timeframe));
  const chunkSpanMs = EXACT_RANGE_TARGET_BARS * stepMs;
  const overlapMs = EXACT_RANGE_OVERLAP_BARS * stepMs;
  const chunks: TwelveDataRangeChunk[] = [];
  let cursorStartMs = startMs;

  while (cursorStartMs <= endMs) {
    const chunkEndMs = Math.min(endMs, cursorStartMs + chunkSpanMs - 1);
    chunks.push({
      startMs: cursorStartMs,
      endMs: chunkEndMs,
      attempt: 0,
      repairDepth
    });
    if (chunkEndMs >= endMs) {
      break;
    }
    cursorStartMs = Math.max(cursorStartMs + stepMs, chunkEndMs - overlapMs + 1);
  }

  return chunks;
};

const splitRangeChunk = (
  timeframe: string,
  chunk: TwelveDataRangeChunk
): TwelveDataRangeChunk[] => {
  const stepMs = Math.max(60_000, getStepMs(timeframe));
  const spanMs = chunk.endMs - chunk.startMs;

  if (spanMs <= stepMs * 32) {
    return [
      {
        ...chunk,
        attempt: chunk.attempt + 1
      }
    ];
  }

  const midpointMs = chunk.startMs + Math.floor(spanMs / 2);
  const splitBoundaryMs = floorToStep(midpointMs, stepMs);
  const leftEndMs = Math.min(chunk.endMs, Math.max(chunk.startMs, splitBoundaryMs));
  const rightStartMs = Math.min(
    chunk.endMs,
    Math.max(chunk.startMs, leftEndMs - stepMs + 1)
  );

  return [
    {
      startMs: chunk.startMs,
      endMs: leftEndMs,
      attempt: chunk.attempt + 1,
      repairDepth: chunk.repairDepth + 1
    },
    {
      startMs: rightStartMs,
      endMs: chunk.endMs,
      attempt: chunk.attempt + 1,
      repairDepth: chunk.repairDepth + 1
    }
  ];
};

const getAdaptiveWorkerCount = (chunkCount: number, apiKeysOverride?: string[]): number => {
  const usableKeys = getOrderedApiKeys(apiKeysOverride).filter((apiKey) => {
    const failureType = keyFailureState.get(apiKey)?.failureType;
    return failureType !== "auth";
  });
  const maxKeyPoolWorkers = Math.max(
    1,
    Math.min(EXACT_RANGE_MAX_WORKERS, usableKeys.length)
  );
  const telemetry = usableKeys
    .map((apiKey) => keyTelemetryState.get(apiKey))
    .filter((value): value is TwelveDataKeyTelemetry => value != null);
  const hasHighCreditBudget = telemetry.some(
    (entry) =>
      (entry.creditCapacity != null && entry.creditCapacity >= 24) ||
      (entry.creditsLeft != null && entry.creditsLeft >= 18)
  );
  const inferredParallelBudget =
    telemetry.length === 0
      ? maxKeyPoolWorkers
      : hasHighCreditBudget
        ? maxKeyPoolWorkers
        : Math.max(1, Math.min(maxKeyPoolWorkers, Math.ceil(usableKeys.length / 2)));

  return Math.max(
    1,
    Math.min(
      chunkCount,
      EXACT_RANGE_MAX_WORKERS,
      inferredParallelBudget,
      maxKeyPoolWorkers
    )
  );
};

const normalizeChunkCandles = (
  timeframe: string,
  values: TwelveDataTimeSeriesRecord[],
  startMs: number,
  endMs: number
): TwelveDataCandleRecord[] => {
  return sortAndDedupeCandles(
    values
      .map((entry) => normalizeCandleRecord(entry, timeframe))
      .filter((entry): entry is TwelveDataCandleRecord => entry !== null)
  ).filter((candle) => candle.time >= startMs && candle.time <= endMs);
};

const fetchExactRangeChunk = async (
  timeframe: string,
  chunk: TwelveDataRangeChunk,
  apiKeysOverride?: string[]
): Promise<TwelveDataRangeChunkResult> => {
  const stepMs = Math.max(60_000, getStepMs(timeframe));
  const response = await requestJsonDetailed<TwelveDataTimeSeriesResponse>(
    "/time_series",
    {
      symbol: TWELVE_DATA_SYMBOL,
      interval: getIntervalForTimeframe(timeframe),
      timezone: "UTC",
      order: "asc",
      start_date: toTwelveDateTime(Math.max(0, chunk.startMs - stepMs)),
      end_date: toTwelveDateTime(chunk.endMs)
    },
    DEFAULT_HTTP_TIMEOUT_MS,
    apiKeysOverride
  );
  const values = Array.isArray(response.payload.values) ? response.payload.values : [];

  return {
    chunk,
    candles: normalizeChunkCandles(timeframe, values, chunk.startMs, chunk.endMs)
  };
};

const isNoDataForRequestedDatesError = (error: unknown): boolean => {
  if (!(error instanceof TwelveDataRequestError)) {
    return false;
  }
  return /no data is available on the specified dates/i.test(error.message);
};

const fetchLatestAvailableCandleTimeMs = async (
  timeframe: string,
  apiKeysOverride?: string[]
): Promise<number | null> => {
  const response = await requestJsonDetailed<TwelveDataTimeSeriesResponse>("/time_series", {
    symbol: TWELVE_DATA_SYMBOL,
    interval: getIntervalForTimeframe(timeframe),
    timezone: "UTC",
    outputsize: 1
  }, DEFAULT_HTTP_TIMEOUT_MS, apiKeysOverride);
  const values = Array.isArray(response.payload.values) ? response.payload.values : [];
  const latestCandle = normalizeChunkCandles(
    timeframe,
    values,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY
  ).at(-1);
  return latestCandle ? latestCandle.time : null;
};

const findMissingCoverageChunks = (
  timeframe: string,
  candles: TwelveDataCandleRecord[],
  startMs: number,
  endMs: number,
  repairDepth: number
): TwelveDataRangeChunk[] => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }

  const sorted = sortAndDedupeCandles(candles).filter(
    (candle) => candle.time >= startMs && candle.time <= endMs
  );
  const stepMs = Math.max(60_000, getStepMs(timeframe));
  const repairGapToleranceMs = Math.max(
    EXACT_RANGE_REPAIR_GAP_TOLERANCE_MS,
    12 * stepMs
  );
  const missing: TwelveDataRangeChunk[] = [];
  const paddedStart = Math.max(0, startMs - EXACT_RANGE_PADDING_BARS * stepMs);
  const paddedEnd = endMs + EXACT_RANGE_PADDING_BARS * stepMs;
  const requiredFirstSlotMs = findNextTradingSlotAtOrAfter(startMs, timeframe);
  const requiredLastSlotMs = findLastTradingSlotAtOrBefore(endMs, timeframe);

  if (sorted.length === 0) {
    return buildRangeChunks(timeframe, paddedStart, paddedEnd, repairDepth).slice(
      0,
      EXACT_RANGE_MAX_REPAIR_WINDOWS
    );
  }

  const firstCandleTime = sorted[0]!.time;
  if (
    requiredFirstSlotMs != null &&
    firstCandleTime > requiredFirstSlotMs &&
    firstCandleTime - requiredFirstSlotMs > repairGapToleranceMs
  ) {
    missing.push({
      startMs: paddedStart,
      endMs: Math.min(paddedEnd, firstCandleTime),
      attempt: 0,
      repairDepth
    });
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const currentTime = sorted[index]!.time;
    const nextTime = sorted[index + 1]!.time;
    const expectedNextSlotMs = findNextTradingSlotAtOrAfter(currentTime + stepMs, timeframe);

    if (
      expectedNextSlotMs == null ||
      expectedNextSlotMs >= nextTime ||
      nextTime - expectedNextSlotMs <= repairGapToleranceMs
    ) {
      continue;
    }

    missing.push({
      startMs: Math.max(startMs, expectedNextSlotMs - EXACT_RANGE_PADDING_BARS * stepMs),
      endMs: Math.min(endMs, nextTime + EXACT_RANGE_PADDING_BARS * stepMs),
      attempt: 0,
      repairDepth
    });
  }

  const lastCandleTime = sorted[sorted.length - 1]!.time;
  if (
    requiredLastSlotMs != null &&
    lastCandleTime < requiredLastSlotMs &&
    requiredLastSlotMs - lastCandleTime > repairGapToleranceMs
  ) {
    missing.push({
      startMs: Math.max(startMs, lastCandleTime - EXACT_RANGE_PADDING_BARS * stepMs),
      endMs: paddedEnd,
      attempt: 0,
      repairDepth
    });
  }

  return mergeRangeChunks(missing).slice(0, EXACT_RANGE_MAX_REPAIR_WINDOWS);
};

const fetchExactRangeCandles = async (params: {
  pair: string;
  timeframe: string;
  startMs: number;
  endMs: number;
  apiKeys?: string[];
}): Promise<TwelveDataCandleRecord[]> => {
  const { timeframe, startMs, endMs, apiKeys } = params;
  let pendingChunks = buildRangeChunks(timeframe, startMs, endMs);
  const mergedCandles = new Map<number, TwelveDataCandleRecord>();

  const processChunks = async (chunks: TwelveDataRangeChunk[]) => {
    const queue = [...chunks];
    const workerCount = getAdaptiveWorkerCount(queue.length, apiKeys);

    const worker = async () => {
      while (queue.length > 0) {
        const chunk = queue.shift();
        if (!chunk) {
          return;
        }

        try {
          const result = await fetchExactRangeChunk(timeframe, chunk, apiKeys);
          for (const candle of result.candles) {
            mergedCandles.set(candle.time, candle);
          }
        } catch (error) {
          const failureType =
            error instanceof TwelveDataRequestError ? error.failureType : "other";
          if (failureType === "rate_limit") {
            if (chunk.attempt >= EXACT_RANGE_MAX_REPAIR_DEPTH) {
              throw error;
            }
            const earliestReadyAt = getEarliestApiKeyReadyAt(apiKeys);
            const retryDelayMs = Number.isFinite(earliestReadyAt)
              ? Math.max(750, earliestReadyAt - Date.now() + 250)
              : RATE_LIMIT_COOLDOWN_MS;
            queue.push({
              ...chunk,
              attempt: chunk.attempt + 1
            });
            await sleep(retryDelayMs);
            continue;
          }
          if (failureType === "other" && chunk.attempt < 1) {
            queue.push({
              ...chunk,
              attempt: chunk.attempt + 1
            });
            await sleep(500);
            continue;
          }
          if (chunk.repairDepth >= EXACT_RANGE_MAX_REPAIR_DEPTH) {
            throw error;
          }
          const splitChunks = splitRangeChunk(timeframe, chunk);
          queue.unshift(...splitChunks.reverse());
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  };

  await processChunks(pendingChunks);

  for (let repairPass = 1; repairPass <= EXACT_RANGE_MAX_REPAIR_DEPTH; repairPass += 1) {
    pendingChunks = findMissingCoverageChunks(
      timeframe,
      [...mergedCandles.values()],
      startMs,
      endMs,
      repairPass
    );

    if (pendingChunks.length === 0) {
      break;
    }

    await processChunks(pendingChunks);
  }

  return sortAndDedupeCandles([...mergedCandles.values()]).filter(
    (candle) => candle.time >= startMs && candle.time <= endMs
  );
};

export const fetchTwelveDataCandles = async (params: {
  pair: string;
  timeframe: string;
  count: number;
  start?: string | null;
  end?: string | null;
  apiKeys?: string[];
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
  const explicitRangeRequested = Boolean(params.start);
  const cacheKey = buildCandleCacheKey(params);
  const cached = candlesCache.get(cacheKey);
  const nowMs = Date.now();
  if (
    cached &&
    cached.expiresAt > nowMs &&
    (explicitRangeRequested || cached.value.candles.length >= requestedCount)
  ) {
    const cachedCandles = explicitRangeRequested
      ? cached.value.candles
      : cached.value.candles.slice(-requestedCount);
    return {
      ...cached.value,
      count: cachedCandles.length,
      candles: cachedCandles
    };
  }
  const inFlight = candlesInFlight.get(cacheKey);
  if (inFlight) {
    const payload = await inFlight;
    if (explicitRangeRequested) {
      return payload;
    }
    return payload.count > requestedCount
      ? {
          ...payload,
          count: requestedCount,
          candles: payload.candles.slice(-requestedCount)
        }
      : payload;
  }
  const requestPromise = (async (): Promise<TwelveDataCandlesPayload> => {
    const startMs = parseTimeMs(params.start ?? null);
    const endMs =
      parseTimeMs(params.end ?? null) ??
      Date.now();
    const stepMs = getStepMs(timeframe);
    const hasExplicitStart = startMs != null;
    const hasExplicitEnd = Number.isFinite(endMs);
    const boundedRangeBars =
      hasExplicitStart && hasExplicitEnd
        ? Math.ceil((endMs - startMs) / Math.max(60_000, stepMs)) + 2
        : Number.POSITIVE_INFINITY;
    const shouldUseExactRangeRepair =
      hasExplicitStart &&
      hasExplicitEnd &&
      endMs >= startMs &&
      boundedRangeBars > MAX_PAGE_SIZE;
    if (shouldUseExactRangeRepair) {
      let exactRangeCandles: TwelveDataCandleRecord[];
      try {
        exactRangeCandles = await fetchExactRangeCandles({
          pair,
          timeframe,
          startMs,
          endMs,
          apiKeys: params.apiKeys
        });
      } catch (error) {
        if (!isNoDataForRequestedDatesError(error)) {
          throw error;
        }
        const latestAvailableTimeMs = await fetchLatestAvailableCandleTimeMs(
          timeframe,
          params.apiKeys
        );
        if (
          latestAvailableTimeMs == null ||
          !Number.isFinite(latestAvailableTimeMs) ||
          latestAvailableTimeMs < startMs
        ) {
          throw error;
        }
        exactRangeCandles = await fetchExactRangeCandles({
          pair,
          timeframe,
          startMs,
          endMs: latestAvailableTimeMs,
          apiKeys: params.apiKeys
        });
      }

      const payload = {
        pair,
        timeframe,
        start: params.start ?? null,
        end: params.end ?? null,
        count: exactRangeCandles.length,
        candles: exactRangeCandles,
        source: "twelve-data"
      };

      candlesCache.set(cacheKey, {
        expiresAt: Date.now() + CANDLES_CACHE_TTL_MS,
        value: payload
      });

      return payload;
    }
    const desiredRangeBars =
      hasExplicitStart && Number.isFinite(boundedRangeBars)
        ? Math.max(requestedCount, boundedRangeBars)
        : requestedCount;
    const shouldUseSingleBoundedRequest =
      hasExplicitStart &&
      hasExplicitEnd &&
      boundedRangeBars > 0 &&
      boundedRangeBars <= MAX_PAGE_SIZE;
    const deduped = new Map<number, TwelveDataCandleRecord>();
    let cursorEndMs = endMs;
    let pageCount = 0;
    let previousEarliestMs = Number.POSITIVE_INFINITY;

    while (pageCount < MAX_PAGE_COUNT) {
      const remaining = Math.max(64, desiredRangeBars - deduped.size + 32);
      const outputsize = Math.min(MAX_PAGE_SIZE, remaining);
      const response = await requestJson<TwelveDataTimeSeriesResponse>(
        "/time_series",
        shouldUseSingleBoundedRequest && pageCount === 0
          ? {
              symbol: TWELVE_DATA_SYMBOL,
              interval,
              timezone: "UTC",
              start_date: toTwelveDateTime(Math.max(0, startMs - stepMs)),
              end_date: Number.isFinite(cursorEndMs) ? toTwelveDateTime(cursorEndMs) : undefined
            }
          : {
              symbol: TWELVE_DATA_SYMBOL,
              interval,
              outputsize,
              timezone: "UTC",
              end_date: Number.isFinite(cursorEndMs) ? toTwelveDateTime(cursorEndMs) : undefined
            },
        DEFAULT_HTTP_TIMEOUT_MS,
        params.apiKeys
      );
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
      if (shouldUseSingleBoundedRequest) {
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
      !hasExplicitStart && candles.length > requestedCount
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
      expiresAt: Date.now() + CANDLES_CACHE_TTL_MS,
      value: payload
    });

    return payload;
  })();

  candlesInFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    candlesInFlight.delete(cacheKey);
  }
};

export const fetchTwelveDataLatestQuote = async (
  apiKeys?: string[]
): Promise<TwelveDataQuotePayload> => {
  const nowMs = Date.now();
  if (quoteCache && quoteCache.expiresAt > nowMs) {
    return quoteCache.value;
  }
  if (quoteInFlight) {
    return quoteInFlight;
  }

  quoteInFlight = (async (): Promise<TwelveDataQuotePayload> => {
    let quote: TwelveDataQuoteResponse;

    try {
      quote = await requestJson<TwelveDataQuoteResponse>("/quote", {
        symbol: TWELVE_DATA_SYMBOL
      }, DEFAULT_HTTP_TIMEOUT_MS, apiKeys).catch(async () => {
        return requestJson<TwelveDataQuoteResponse>("/price", {
          symbol: TWELVE_DATA_SYMBOL
        }, DEFAULT_HTTP_TIMEOUT_MS, apiKeys);
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
      expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
      value: payload
    };

    return payload;
  })();

  try {
    return await quoteInFlight;
  } finally {
    quoteInFlight = null;
  }
};

export const probeTwelveDataAccess = async (apiKeys?: string[]): Promise<void> => {
  await fetchTwelveDataLatestQuote(apiKeys);
};
