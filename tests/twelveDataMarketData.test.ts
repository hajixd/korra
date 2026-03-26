import test from "node:test";
import assert from "node:assert/strict";

const parseTwelveDate = (value: string | null): number => {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value.replace(" ", "T") + "Z");
};

const formatTwelveDate = (timestampMs: number): string => {
  return new Date(timestampMs).toISOString().replace("T", " ").slice(0, 19);
};

test("fetchTwelveDataCandles stitches exact-range history coverage across chunked calls", async () => {
  const originalFetch = global.fetch;
  const originalKeys = process.env.TWELVE_DATA_API_KEYS;
  process.env.TWELVE_DATA_API_KEYS = "key_a,key_b";
  const usedKeys = new Set<string>();
  const requestWindows: Array<{ startMs: number; endMs: number }> = [];

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const apiKey = url.searchParams.get("apikey") || "unknown";
    usedKeys.add(apiKey);
    const interval = url.searchParams.get("interval") || "1min";
    const stepMs = interval === "1min" ? 60_000 : 15 * 60_000;
    const startMs = parseTwelveDate(url.searchParams.get("start_date"));
    const endMs = parseTwelveDate(url.searchParams.get("end_date"));
    requestWindows.push({ startMs, endMs });

    const values: Array<Record<string, string>> = [];
    for (let cursorMs = startMs; cursorMs <= endMs; cursorMs += stepMs) {
      values.push({
        datetime: formatTwelveDate(cursorMs),
        open: "1",
        high: "2",
        low: "0.5",
        close: "1.5",
        volume: "10"
      });
    }

    return new Response(JSON.stringify({ values }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "api-credits-used": "1",
        "api-credits-left": "7"
      }
    });
  }) as typeof fetch;

  try {
    const { fetchTwelveDataCandles } = await import("../lib/twelveDataMarketData");
    const startIso = "2025-03-24T00:00:00.000Z";
    const endIso = "2025-03-27T18:00:00.000Z";
    const payload = await fetchTwelveDataCandles({
      pair: "XAU_USD",
      timeframe: "M1",
      count: 10,
      start: startIso,
      end: endIso
    });

    assert.ok(requestWindows.length >= 2);
    assert.ok(usedKeys.size >= 2);
    assert.equal(payload.candles[0]?.time, Date.parse(startIso));
    assert.equal(payload.candles[payload.candles.length - 1]?.time, Date.parse(endIso));
    assert.equal(
      payload.candles.length,
      Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 60_000) + 1
    );
  } finally {
    global.fetch = originalFetch;
    if (originalKeys == null) {
      delete process.env.TWELVE_DATA_API_KEYS;
    } else {
      process.env.TWELVE_DATA_API_KEYS = originalKeys;
    }
  }
});
