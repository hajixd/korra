import { NextResponse } from "next/server";

const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"]);
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_PAIR = "XAU_USD";
const DEFAULT_TABLE = "candles";
const DEFAULT_LIMIT = 2500;
const MIN_LIMIT = 10;
const MAX_LIMIT = 300000;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PAIR_RE = /^[A-Z0-9]{2,20}_[A-Z0-9]{2,20}$/;
const TIMEZONE_RE = /^[A-Za-z0-9_/\-+]+$/;

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

const toNullableInteger = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "t";
  }
  return false;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_LIMIT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_LIMIT, MIN_LIMIT),
    MAX_LIMIT
  );
  const start = toClickhouseDateTime(searchParams.get("start"));
  const end = toClickhouseDateTime(
    searchParams.get("end") ||
      searchParams.get("before") ||
      searchParams.get("to")
  );

  if (!PAIR_RE.test(pair)) {
    return NextResponse.json({ error: "Unsupported pair format" }, { status: 400 });
  }
  if (!TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  const host = process.env.CLICKHOUSE_HOST;
  const user = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  const database = process.env.CLICKHOUSE_DATABASE || "default";
  const table = process.env.CLICKHOUSE_TABLE || DEFAULT_TABLE;
  const timezone = process.env.CLICKHOUSE_TIMEZONE || DEFAULT_TIMEZONE;

  if (!host || !user || !password) {
    return NextResponse.json(
      { error: "Missing ClickHouse connection env vars." },
      { status: 500 }
    );
  }
  if (!IDENTIFIER_RE.test(database) || !IDENTIFIER_RE.test(table)) {
    return NextResponse.json(
      { error: "Invalid ClickHouse database/table name in env vars." },
      { status: 500 }
    );
  }
  if (!TIMEZONE_RE.test(timezone)) {
    return NextResponse.json(
      { error: "Invalid ClickHouse timezone in env vars." },
      { status: 500 }
    );
  }

  const startFilter = start
    ? `\n      AND time >= toDateTime('${start}', '${timezone}')`
    : "";
  const endFilter = end
    ? `\n      AND time <= toDateTime('${end}', '${timezone}')`
    : "";

  const query = `
    SELECT
      toInt64(toUnixTimestamp(toTimeZone(time, '${timezone}'))) * 1000 AS time,
      pair,
      timeframe,
      toFloat64(open) AS open,
      toFloat64(high) AS high,
      toFloat64(low) AS low,
      toFloat64(close) AS close,
      toFloat64(volume) AS volume,
      CAST(time_to_high_ms, 'Nullable(Int64)') AS time_to_high_ms,
      CAST(time_to_low_ms, 'Nullable(Int64)') AS time_to_low_ms,
      toUInt8(high_formed_first) AS high_formed_first,
      toFloat64(body_percent) AS body_percent,
      toFloat64(range_pips) AS range_pips,
      toUInt8(is_displacement) AS is_displacement,
      toFloat64(displacement_score) AS displacement_score
    FROM ${database}.${table}
    WHERE pair = '${pair}'
      AND timeframe = '${timeframe}'
${startFilter}${endFilter}
    ORDER BY time DESC
    LIMIT ${count}
    FORMAT JSON
  `;

  try {
    const normalizedHost = host.replace(/\/+$/, "");
    const response = await fetch(`${normalizedHost}/`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
      },
      body: query,
      cache: "no-store"
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `ClickHouse error ${response.status}: ${text}` },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const candles = ((payload.data || []) as Array<Record<string, unknown>>)
      .reverse()
      .map((row) => ({
        time: toNumber(row.time),
        pair: String(row.pair ?? pair),
        timeframe: String(row.timeframe ?? timeframe),
        open: toNumber(row.open),
        high: toNumber(row.high),
        low: toNumber(row.low),
        close: toNumber(row.close),
        volume: toNumber(row.volume),
        time_to_high_ms: toNullableInteger(row.time_to_high_ms),
        time_to_low_ms: toNullableInteger(row.time_to_low_ms),
        high_formed_first: toBoolean(row.high_formed_first),
        body_percent: toNumber(row.body_percent),
        range_pips: toNumber(row.range_pips),
        is_displacement: toBoolean(row.is_displacement),
        displacement_score: toNumber(row.displacement_score)
      }))
      .filter(
        (row) =>
          Number.isFinite(row.time) &&
          Number.isFinite(row.open) &&
          Number.isFinite(row.high) &&
          Number.isFinite(row.low) &&
          Number.isFinite(row.close)
      );

    return NextResponse.json({
      pair,
      timeframe,
      start: start || null,
      end: end || null,
      count: candles.length,
      candles
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unknown error" },
      { status: 500 }
    );
  }
}
