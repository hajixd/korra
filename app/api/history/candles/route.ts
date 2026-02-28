import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { NextResponse } from "next/server";

const MARKET_API_BASE = "https://trading-system-delta.vercel.app/api/public/candles";
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_MAX_BATCH = 5000;
const LOCAL_XAU_CSV_PATH = path.join(process.cwd(), "xauusd_1m.csv");
const LOCAL_XAU_PAIR = "XAU_USD";
const PRACTICE_BASE_URL = "https://api-fxpractice.oanda.com/v3";
const LIVE_BASE_URL = "https://api-fxtrade.oanda.com/v3";
const ALLOWED_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"]);
const ALLOWED_PAIRS = new Set([
  "EUR_USD",
  "GBP_USD",
  "USD_JPY",
  "USD_CHF",
  "AUD_USD",
  "USD_CAD",
  "NZD_USD",
  "XAU_USD",
  "XAG_USD",
  "SPX500_USD",
  "BTC_USD"
]);
const DEFAULT_PAIR = "XAU_USD";
const DEFAULT_TIMEFRAME = "M15";
const DEFAULT_COUNT = 2500;
const MIN_COUNT = 10;
const MAX_COUNT = 60000;
const OANDA_MAX_BATCH = 5000;
const MARKET_FALLBACK_MAX_COUNT = 2000;

const TWELVE_INTERVAL_BY_TIMEFRAME: Record<string, string> = {
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

const LOCAL_SOURCE_BARS_PER_CANDLE: Record<string, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D: 1440,
  W: 10080,
  M: 44640
};

type OandaCandle = {
  complete?: boolean;
  time?: string;
  volume?: number;
  mid?: {
    o?: string;
    h?: string;
    l?: string;
    c?: string;
  };
};

type TwelveDataValue = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
};

type TwelveDataResponse = {
  code?: number;
  message?: string;
  status?: string;
  values?: TwelveDataValue[];
};

type OneMinuteCsvRow = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type HistoryCandle = {
  time: string;
  timestamp: number;
  pair: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const toIsoCursor = (input: string | null) => {
  if (!input) {
    return null;
  }

  const parsed = new Date(input);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const splitPair = (pair: string) => {
  const [base, quote] = pair.split("_");

  if (!base || !quote) {
    return null;
  }

  return { base, quote };
};

const toTwelveSymbol = (pair: string) => {
  const parts = splitPair(pair);

  if (!parts) {
    return null;
  }

  return `${parts.base}/${parts.quote}`;
};

const padTwoDigits = (value: number) => {
  return String(value).padStart(2, "0");
};

const toTwelveDateTime = (input: string | Date) => {
  const value = typeof input === "string" ? new Date(input) : new Date(input);

  if (!Number.isFinite(value.getTime())) {
    return null;
  }

  return [
    `${value.getUTCFullYear()}-${padTwoDigits(value.getUTCMonth() + 1)}-${padTwoDigits(value.getUTCDate())}`,
    `${padTwoDigits(value.getUTCHours())}:${padTwoDigits(value.getUTCMinutes())}:${padTwoDigits(value.getUTCSeconds())}`
  ].join(" ");
};

const parseTwelveTimestamp = (input: string | undefined) => {
  if (!input) {
    return Number.NaN;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return Date.parse(`${input}T00:00:00Z`);
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input)) {
    return Date.parse(`${input.replace(" ", "T")}Z`);
  }

  return Date.parse(input);
};

const shiftBackOneBar = (timestamp: number, timeframe: string) => {
  const date = new Date(timestamp);

  switch (timeframe) {
    case "M1":
      return timestamp - 60_000;
    case "M5":
      return timestamp - 5 * 60_000;
    case "M15":
      return timestamp - 15 * 60_000;
    case "M30":
      return timestamp - 30 * 60_000;
    case "H1":
      return timestamp - 60 * 60_000;
    case "H4":
      return timestamp - 4 * 60 * 60_000;
    case "D":
      return timestamp - 24 * 60 * 60_000;
    case "W":
      return timestamp - 7 * 24 * 60 * 60_000;
    case "M":
      date.setUTCMonth(date.getUTCMonth() - 1);
      return date.getTime();
    default:
      return timestamp;
  }
};

const isXauTradingTime = (timestamp: number) => {
  const date = new Date(timestamp);
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

const estimateLocalSourceBarsNeeded = (timeframe: string, count: number) => {
  const multiplier = LOCAL_SOURCE_BARS_PER_CANDLE[timeframe] || 1;
  return Math.min(count * multiplier + multiplier, 3_000_000);
};

const floorToBucket = (timestamp: number, timeframe: string) => {
  const date = new Date(timestamp);

  date.setUTCMilliseconds(0);
  date.setUTCSeconds(0);

  switch (timeframe) {
    case "M1":
      return date.getTime();
    case "M5":
    case "M15":
    case "M30": {
      const step = timeframe === "M5" ? 5 : timeframe === "M15" ? 15 : 30;
      date.setUTCMinutes(Math.floor(date.getUTCMinutes() / step) * step);
      return date.getTime();
    }
    case "H1":
      date.setUTCMinutes(0);
      return date.getTime();
    case "H4":
      date.setUTCMinutes(0);
      date.setUTCHours(Math.floor(date.getUTCHours() / 4) * 4);
      return date.getTime();
    case "D":
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    case "W": {
      date.setUTCHours(0, 0, 0, 0);
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - daysSinceMonday);
      return date.getTime();
    }
    case "M":
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(1);
      return date.getTime();
    default:
      return date.getTime();
  }
};

const jsonHistoryResponse = ({
  pair,
  timeframe,
  candles,
  headers
}: {
  pair: string;
  timeframe: string;
  candles: HistoryCandle[];
  headers?: HeadersInit;
}) => {
  return NextResponse.json(
    {
      pair,
      timeframe,
      count: candles.length,
      candles
    },
    headers ? { headers } : undefined
  );
};

const normalizeTwelveCandles = (values: TwelveDataValue[], pair: string, timeframe: string) => {
  const candlesByTimestamp = new Map<number, HistoryCandle>();

  for (const value of values) {
    const timestamp = parseTwelveTimestamp(value.datetime);
    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);

    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      (pair === LOCAL_XAU_PAIR && !isXauTradingTime(timestamp))
    ) {
      continue;
    }

    candlesByTimestamp.set(timestamp, {
      time: new Date(timestamp).toISOString(),
      timestamp,
      pair,
      timeframe,
      open,
      high,
      low,
      close,
      volume: 0
    });
  }

  return Array.from(candlesByTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const normalizeOandaCandles = (candles: OandaCandle[], pair: string, timeframe: string) => {
  return candles
    .filter((candle) => candle.complete !== false && candle.time && candle.mid)
    .map((candle) => {
      const timestamp = Date.parse(String(candle.time));
      const open = Number(candle.mid?.o);
      const high = Number(candle.mid?.h);
      const low = Number(candle.mid?.l);
      const close = Number(candle.mid?.c);
      const volume = Number(candle.volume ?? 0);

      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        (pair === LOCAL_XAU_PAIR && !isXauTradingTime(timestamp))
      ) {
        return null;
      }

      return {
        time: new Date(timestamp).toISOString(),
        timestamp,
        pair,
        timeframe,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0
      };
    })
    .filter((candle): candle is HistoryCandle => candle !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
};

const readLocalOneMinuteRows = async ({
  count,
  cursor
}: {
  count: number;
  cursor: string | null;
}) => {
  if (!fs.existsSync(LOCAL_XAU_CSV_PATH)) {
    return null;
  }

  const beforeMs = cursor ? Date.parse(cursor) : Number.POSITIVE_INFINITY;

  if (cursor && !Number.isFinite(beforeMs)) {
    return [];
  }

  const rows: OneMinuteCsvRow[] = [];
  const input = fs.createReadStream(LOCAL_XAU_CSV_PATH, { encoding: "utf8" });
  const lineReader = readline.createInterface({
    input,
    crlfDelay: Infinity
  });
  let isHeader = true;

  try {
    for await (const rawLine of lineReader) {
      if (isHeader) {
        isHeader = false;
        continue;
      }

      const line = rawLine.trim();

      if (!line) {
        continue;
      }

      const [timestampRaw, , openRaw, highRaw, lowRaw, closeRaw] = line.split(",");
      const timestamp = Number(timestampRaw);

      if (!Number.isFinite(timestamp) || timestamp >= beforeMs || !isXauTradingTime(timestamp)) {
        continue;
      }

      const open = Number(openRaw);
      const high = Number(highRaw);
      const low = Number(lowRaw);
      const close = Number(closeRaw);

      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        continue;
      }

      rows.push({
        timestamp,
        open,
        high,
        low,
        close
      });

      if (rows.length >= count) {
        break;
      }
    }
  } finally {
    lineReader.close();
    input.destroy();
  }

  return rows;
};

const aggregateLocalRows = ({
  rowsDescending,
  pair,
  timeframe,
  count
}: {
  rowsDescending: OneMinuteCsvRow[];
  pair: string;
  timeframe: string;
  count: number;
}) => {
  const rowsAscending = rowsDescending.slice().reverse();

  if (timeframe === "M1") {
    return rowsAscending
      .map((row) => ({
        time: new Date(row.timestamp).toISOString(),
        timestamp: row.timestamp,
        pair,
        timeframe,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: 0
      }))
      .slice(-count);
  }

  const candles: HistoryCandle[] = [];
  let activeBucket: HistoryCandle | null = null;

  for (const row of rowsAscending) {
    const bucketTime = floorToBucket(row.timestamp, timeframe);

    if (!activeBucket || activeBucket.timestamp !== bucketTime) {
      if (activeBucket) {
        candles.push(activeBucket);
      }

      activeBucket = {
        time: new Date(bucketTime).toISOString(),
        timestamp: bucketTime,
        pair,
        timeframe,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: 0
      };

      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, row.high);
    activeBucket.low = Math.min(activeBucket.low, row.low);
    activeBucket.close = row.close;
  }

  if (activeBucket) {
    candles.push(activeBucket);
  }

  return candles.slice(-count);
};

const loadLocalXauHistory = async ({
  pair,
  timeframe,
  count,
  cursor
}: {
  pair: string;
  timeframe: string;
  count: number;
  cursor: string | null;
}) => {
  if (pair !== LOCAL_XAU_PAIR) {
    return null;
  }

  const sourceBarsNeeded = estimateLocalSourceBarsNeeded(timeframe, count);
  const rows = await readLocalOneMinuteRows({
    count: sourceBarsNeeded,
    cursor
  });

  if (!rows || rows.length === 0) {
    return null;
  }

  const candles = aggregateLocalRows({
    rowsDescending: rows,
    pair,
    timeframe,
    count
  });

  if (candles.length === 0) {
    return null;
  }

  return jsonHistoryResponse({
    pair,
    timeframe,
    candles,
    headers: {
      "X-Korra-Data-Source": "local-xauusd-csv-history",
      "X-Korra-History-Start": candles[0].time,
      "X-Korra-History-End": candles[candles.length - 1].time
    }
  });
};

const loadTwelveDataHistory = async ({
  pair,
  timeframe,
  count,
  cursor
}: {
  pair: string;
  timeframe: string;
  count: number;
  cursor: string | null;
}) => {
  const apiKey =
    process.env.TWELVE_DATA_API_KEY ||
    process.env.TWELVEDATA_API_KEY ||
    process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY;
  const symbol = toTwelveSymbol(pair);
  const interval = TWELVE_INTERVAL_BY_TIMEFRAME[timeframe];

  if (!apiKey || !symbol || !interval) {
    return null;
  }

  const candlesByTimestamp = new Map<number, HistoryCandle>();
  let nextEndDate = cursor ? toTwelveDateTime(cursor) : null;
  let pages = 0;
  const maxPages = Math.max(1, Math.ceil(count / TWELVE_DATA_MAX_BATCH) + 1);

  try {
    while (candlesByTimestamp.size < count && pages < maxPages) {
      const remaining = count - candlesByTimestamp.size;
      const batchSize = Math.min(remaining, TWELVE_DATA_MAX_BATCH);
      const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);

      url.searchParams.set("symbol", symbol);
      url.searchParams.set("interval", interval);
      url.searchParams.set("outputsize", String(batchSize));
      url.searchParams.set("order", "desc");
      url.searchParams.set("timezone", "UTC");
      url.searchParams.set("apikey", apiKey);

      if (nextEndDate) {
        url.searchParams.set("end_date", nextEndDate);
      }

      const response = await fetch(url.toString(), {
        cache: "no-store"
      });
      const payload = (await response.json()) as TwelveDataResponse;

      if (!response.ok || payload.status === "error" || !Array.isArray(payload.values)) {
        return null;
      }

      const normalized = normalizeTwelveCandles(payload.values, pair, timeframe);

      if (normalized.length === 0) {
        break;
      }

      const sizeBefore = candlesByTimestamp.size;

      for (const candle of normalized) {
        candlesByTimestamp.set(candle.timestamp, candle);
      }

      const oldest = normalized[0];
      const previousStepTimestamp = shiftBackOneBar(oldest.timestamp, timeframe);

      if (!Number.isFinite(previousStepTimestamp) || previousStepTimestamp >= oldest.timestamp) {
        break;
      }

      nextEndDate = toTwelveDateTime(new Date(previousStepTimestamp));
      pages += 1;

      if (candlesByTimestamp.size === sizeBefore || normalized.length < batchSize || !nextEndDate) {
        break;
      }
    }

    const candles = Array.from(candlesByTimestamp.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-count);

    if (candles.length === 0) {
      return null;
    }

    return jsonHistoryResponse({
      pair,
      timeframe,
      candles,
      headers: {
        "X-Korra-Data-Source": "twelve-data-history",
        "X-Korra-History-Start": candles[0].time,
        "X-Korra-History-End": candles[candles.length - 1].time
      }
    });
  } catch {
    return null;
  }
};

const loadMarketFallback = async ({
  pair,
  timeframe,
  count
}: {
  pair: string;
  timeframe: string;
  count: number;
}) => {
  const apiKey =
    process.env.MARKET_API_KEY ||
    process.env.NEXT_PUBLIC_MARKET_API_KEY ||
    "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq";

  const url = new URL(MARKET_API_BASE);
  url.searchParams.set("pair", pair);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("limit", String(Math.min(count, MARKET_FALLBACK_MAX_COUNT)));

  const response = await fetch(url.toString(), {
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const text = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `Fallback upstream error ${response.status}`,
        details: text.slice(0, 2000)
      },
      { status: response.status }
    );
  }

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Korra-Data-Source": "market-history-fallback",
      "X-RateLimit-Limit": response.headers.get("X-RateLimit-Limit") || "",
      "X-RateLimit-Remaining": response.headers.get("X-RateLimit-Remaining") || "",
      "X-RateLimit-Reset": response.headers.get("X-RateLimit-Reset") || ""
    }
  });
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || DEFAULT_TIMEFRAME).toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_COUNT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_COUNT, MIN_COUNT),
    MAX_COUNT
  );
  const cursorRaw =
    searchParams.get("before") || searchParams.get("end") || searchParams.get("to");
  const cursor = cursorRaw ? toIsoCursor(cursorRaw) : null;

  if (!ALLOWED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
  }

  if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  if (cursorRaw && !cursor) {
    return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
  }

  const localCsvResponse = await loadLocalXauHistory({
    pair,
    timeframe,
    count,
    cursor
  });

  if (localCsvResponse) {
    return localCsvResponse;
  }

  const twelveDataResponse = await loadTwelveDataHistory({
    pair,
    timeframe,
    count,
    cursor
  });

  if (twelveDataResponse) {
    return twelveDataResponse;
  }

  const token = process.env.OANDA_API_TOKEN;

  if (!token) {
    return loadMarketFallback({ pair, timeframe, count });
  }

  const baseUrl = process.env.OANDA_ENV === "live" ? LIVE_BASE_URL : PRACTICE_BASE_URL;
  const candlesByTimestamp = new Map<number, HistoryCandle>();
  let nextCursor = cursor;
  let pages = 0;
  const maxPages = Math.max(1, Math.ceil(count / OANDA_MAX_BATCH) + 1);

  try {
    while (candlesByTimestamp.size < count && pages < maxPages) {
      const remaining = count - candlesByTimestamp.size;
      const batchSize = Math.min(remaining + (nextCursor ? 1 : 0), OANDA_MAX_BATCH);
      const url = new URL(`${baseUrl}/instruments/${pair}/candles`);

      url.searchParams.set("granularity", timeframe);
      url.searchParams.set("count", String(batchSize));
      url.searchParams.set("price", "M");

      if (nextCursor) {
        url.searchParams.set("to", nextCursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        const text = await response.text();

        if (candlesByTimestamp.size > 0) {
          break;
        }

        const fallbackResponse = await loadMarketFallback({ pair, timeframe, count });

        fallbackResponse.headers.set(
          "X-Korra-Oanda-Error",
          `OANDA error ${response.status}: ${text.slice(0, 120)}`
        );

        return fallbackResponse;
      }

      const payload = (await response.json()) as { candles?: OandaCandle[] };
      const normalized = normalizeOandaCandles(payload.candles || [], pair, timeframe);

      if (normalized.length === 0) {
        break;
      }

      const sizeBefore = candlesByTimestamp.size;

      for (const candle of normalized) {
        candlesByTimestamp.set(candle.timestamp, candle);
      }

      const oldest = normalized[0];

      nextCursor = oldest.time;
      pages += 1;

      if (candlesByTimestamp.size === sizeBefore || normalized.length < batchSize) {
        break;
      }
    }

    const candles = Array.from(candlesByTimestamp.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-count);

    if (candles.length === 0) {
      return loadMarketFallback({ pair, timeframe, count });
    }

    return jsonHistoryResponse({
      pair,
      timeframe,
      candles,
      headers: {
        "X-Korra-Data-Source": "oanda-history"
      }
    });
  } catch (error) {
    if (candlesByTimestamp.size > 0) {
      const candles = Array.from(candlesByTimestamp.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-count);

      return jsonHistoryResponse({
        pair,
        timeframe,
        candles,
        headers: {
          "X-Korra-Data-Source": "oanda-history-partial"
        }
      });
    }

    const fallbackResponse = await loadMarketFallback({ pair, timeframe, count });

    fallbackResponse.headers.set(
      "X-Korra-Oanda-Error",
      (error as Error).message || "Unknown error"
    );

    return fallbackResponse;
  }
}
