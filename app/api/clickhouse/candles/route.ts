import { NextResponse } from "next/server";
import {
  DATABENTO_DEFAULT_PAIR,
  DATABENTO_SUPPORTED_PAIRS,
  DATABENTO_SUPPORTED_TIMEFRAMES,
  buildEmptyDatabentoCandlesPayload,
  fetchDatabentoCandles
} from "../../../../lib/databentoMarketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 2500;
const MIN_LIMIT = 10;
const MAX_LIMIT = 300000;
const LEGACY_MARKET_API_BASE =
  process.env.MARKET_API_BASE || "https://trading-system-delta.vercel.app/api/public/candles";
const MAX_RELIABLE_UPSTREAM_LIMIT = 3800;
const UPSTREAM_TIMEOUT_MS = 3000;
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_TABLE = "candles";
const CLICKHOUSE_TIMEOUT_MS = 20000;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TIMEZONE_RE = /^[A-Za-z0-9_/\-+]+$/;

const toIsoDateTime = (input: string | null) => {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const toClickhouseDateTime = (input: string | null) => {
  if (!input) return null;
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace("T", " ");
};

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildUpstreamAttemptLimits = (requestedLimit: number): number[] => {
  const attempts = new Set<number>();
  attempts.add(Math.min(requestedLimit, MAX_RELIABLE_UPSTREAM_LIMIT));

  for (const candidate of [3000, 2000, 1500, 1000, 500]) {
    if (candidate <= requestedLimit) {
      attempts.add(candidate);
    }
  }

  return Array.from(attempts).filter((value) => value > 0);
};

const toSafeHeaderValue = (value: unknown) =>
  String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();

const buildEmptyHistoryResponse = (params: {
  pair: string;
  timeframe: string;
  count: number;
  start: string | null;
  end: string | null;
  details: string;
}) =>
  NextResponse.json(buildEmptyDatabentoCandlesPayload(params), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Korra-History-Source": "empty-fallback"
    }
  });

const fetchClickHouseFallback = async (params: {
  pair: string;
  timeframe: string;
  count: number;
  start: string | null;
  end: string | null;
}) => {
  const { pair, timeframe, count, start, end } = params;
  const host = process.env.CLICKHOUSE_HOST;
  const user = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  const database = process.env.CLICKHOUSE_DATABASE || "default";
  const table = process.env.CLICKHOUSE_TABLE || DEFAULT_TABLE;
  const timezone = process.env.CLICKHOUSE_TIMEZONE || DEFAULT_TIMEZONE;

  if (!host || !user || !password) {
    throw new Error("Missing ClickHouse connection env vars.");
  }
  if (!IDENTIFIER_RE.test(database) || !IDENTIFIER_RE.test(table)) {
    throw new Error("Invalid ClickHouse database/table name in env vars.");
  }
  if (!TIMEZONE_RE.test(timezone)) {
    throw new Error("Invalid ClickHouse timezone in env vars.");
  }

  const startFilter = start
    ? `\n      AND source.time >= toDateTime('${toClickhouseDateTime(start)}', '${timezone}')`
    : "";
  const endFilter = end
    ? `\n      AND source.time <= toDateTime('${toClickhouseDateTime(end)}', '${timezone}')`
    : "";

  const query = `
    SELECT
      toInt64(toUnixTimestamp(toTimeZone(source.time, '${timezone}'))) * 1000 AS time,
      source.pair AS pair,
      source.timeframe AS timeframe,
      toFloat64(source.open) AS open,
      toFloat64(source.high) AS high,
      toFloat64(source.low) AS low,
      toFloat64(source.close) AS close,
      toFloat64(source.volume) AS volume
    FROM ${database}.${table} AS source
    WHERE source.pair = '${pair}'
      AND source.timeframe = '${timeframe}'
${startFilter}${endFilter}
    ORDER BY source.time DESC
    LIMIT ${count}
    FORMAT JSON
  `;

  const normalizedHost = host.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLICKHOUSE_TIMEOUT_MS);
  const response = await fetch(`${normalizedHost}/`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
    },
    body: query,
    cache: "no-store",
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    throw new Error(`ClickHouse error ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const candles = (payload.data || [])
    .reverse()
    .map((row) => ({
      time: toNumber(row.time),
      pair: String(row.pair ?? pair),
      timeframe: String(row.timeframe ?? timeframe),
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume)
    }))
    .filter(
      (row) =>
        Number.isFinite(row.time) &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    );

  return {
    pair,
    timeframe,
    start,
    end,
    count: candles.length,
    candles,
    source: "clickhouse-fallback"
  };
};

const fetchLegacyMarketFallback = async (params: {
  pair: string;
  timeframe: string;
  count: number;
}) => {
  const url = new URL(LEGACY_MARKET_API_BASE);
  url.searchParams.set("pair", params.pair);
  url.searchParams.set("timeframe", params.timeframe);

  for (const attemptLimit of buildUpstreamAttemptLimits(params.count)) {
    url.searchParams.set("limit", String(attemptLimit));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        headers: {
          "X-API-Key": "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq",
          Accept: "application/json"
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return {
        ...payload,
        source: "legacy-market-fallback"
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("Legacy market fallback unavailable.");
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DATABENTO_DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_LIMIT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_LIMIT, MIN_LIMIT),
    MAX_LIMIT
  );
  const start = toIsoDateTime(searchParams.get("start"));
  const end = toIsoDateTime(searchParams.get("end") || searchParams.get("before") || searchParams.get("to"));

  if (!DATABENTO_SUPPORTED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair format" }, { status: 400 });
  }
  if (!DATABENTO_SUPPORTED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  try {
    if (!process.env.DATABENTO_API_KEY) {
      throw new Error("Missing DATABENTO_API_KEY.");
    }

    const payload = await fetchDatabentoCandles({
      pair,
      timeframe,
      count,
      start,
      end
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-History-Source": "databento"
      }
    });
  } catch (databentoError) {
    try {
      const clickhousePayload = await fetchClickHouseFallback({
        pair,
        timeframe,
        count,
        start,
        end
      });
      return NextResponse.json(clickhousePayload, {
        headers: {
          "Cache-Control": "no-store",
          "X-Korra-History-Source": "clickhouse-fallback",
          "X-Korra-History-Reason": toSafeHeaderValue(
            (databentoError as Error).message || "databento-error"
          )
        }
      });
    } catch (clickhouseError) {
      if (!start && !end) {
        try {
          const legacyPayload = await fetchLegacyMarketFallback({
            pair,
            timeframe,
            count
          });
          return NextResponse.json(legacyPayload, {
            headers: {
              "Cache-Control": "no-store",
              "X-Korra-History-Source": "legacy-market-fallback",
              "X-Korra-History-Reason": toSafeHeaderValue(
                (databentoError as Error).message || "databento-error"
              ),
              "X-Korra-History-Clickhouse": toSafeHeaderValue(
                (clickhouseError as Error).message || "clickhouse-error"
              )
            }
          });
        } catch {
          // Fall through to empty response below.
        }
      }

      return buildEmptyHistoryResponse({
        pair,
        timeframe,
        count,
        start,
        end,
        details:
          `Databento: ${(databentoError as Error).message || "unknown error"} | ` +
          `ClickHouse: ${(clickhouseError as Error).message || "unknown error"}`
      });
    }
  }
}
