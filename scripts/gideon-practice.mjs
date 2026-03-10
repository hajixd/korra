const BASE_URL = process.env.GIDEON_BASE_URL || "http://127.0.0.1:3000";

const now = Date.now();
const minute = 60_000;

const buildCandles = () => {
  const rows = [];
  let close = 2918.4;
  for (let index = 0; index < 240; index += 1) {
    const wave = Math.sin(index / 11) * 0.9 + Math.cos(index / 23) * 0.45;
    const drift = index < 120 ? index * 0.015 : 1.8 - (index - 120) * 0.01;
    const nextClose = 2916.8 + wave + drift;
    const open = close;
    const high = Math.max(open, nextClose) + 0.55;
    const low = Math.min(open, nextClose) - 0.52;
    rows.push({
      time: now - (239 - index) * 15 * minute,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(nextClose.toFixed(2)),
      volume: 100 + (index % 20) * 7
    });
    close = nextClose;
  }
  return rows;
};

const buildHistoryRows = () => {
  return [
    {
      id: "h1",
      symbol: "XAUUSD",
      side: "Long",
      result: "Win",
      entrySource: "breakout",
      pnlPct: 1.2,
      pnlUsd: 120,
      entryTime: now - 9 * 24 * 60 * minute,
      exitTime: now - 9 * 24 * 60 * minute + 90 * minute,
      entryPrice: 2897.2,
      targetPrice: 2903.4,
      stopPrice: 2893.1,
      outcomePrice: 2903.4,
      units: 1,
      entryAt: new Date(now - 9 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 9 * 24 * 60 * minute + 90 * minute).toISOString()
    },
    {
      id: "h2",
      symbol: "XAUUSD",
      side: "Short",
      result: "Loss",
      entrySource: "fade",
      pnlPct: -0.8,
      pnlUsd: -80,
      entryTime: now - 7 * 24 * 60 * minute,
      exitTime: now - 7 * 24 * 60 * minute + 55 * minute,
      entryPrice: 2911.1,
      targetPrice: 2903.7,
      stopPrice: 2915.4,
      outcomePrice: 2915.4,
      units: 1,
      entryAt: new Date(now - 7 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 7 * 24 * 60 * minute + 55 * minute).toISOString()
    }
  ];
};

const buildBacktestRows = () => {
  return [
    {
      id: "b1",
      symbol: "XAUUSD",
      side: "Long",
      result: "Win",
      entrySource: "breakout",
      pnlPct: 1.1,
      pnlUsd: 110,
      entryTime: now - 20 * 24 * 60 * minute,
      exitTime: now - 20 * 24 * 60 * minute + 80 * minute,
      entryPrice: 2862.1,
      targetPrice: 2868.9,
      stopPrice: 2858.3,
      outcomePrice: 2868.9,
      units: 1,
      entryAt: new Date(now - 20 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 20 * 24 * 60 * minute + 80 * minute).toISOString()
    },
    {
      id: "b2",
      symbol: "XAUUSD",
      side: "Long",
      result: "Win",
      entrySource: "retest",
      pnlPct: 0.9,
      pnlUsd: 90,
      entryTime: now - 19 * 24 * 60 * minute,
      exitTime: now - 19 * 24 * 60 * minute + 70 * minute,
      entryPrice: 2869.5,
      targetPrice: 2875.8,
      stopPrice: 2864.2,
      outcomePrice: 2875.8,
      units: 1,
      entryAt: new Date(now - 19 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 19 * 24 * 60 * minute + 70 * minute).toISOString()
    },
    {
      id: "b3",
      symbol: "XAUUSD",
      side: "Short",
      result: "Loss",
      entrySource: "fade",
      pnlPct: -0.7,
      pnlUsd: -70,
      entryTime: now - 18 * 24 * 60 * minute,
      exitTime: now - 18 * 24 * 60 * minute + 50 * minute,
      entryPrice: 2880.2,
      targetPrice: 2874.4,
      stopPrice: 2884.8,
      outcomePrice: 2884.8,
      units: 1,
      entryAt: new Date(now - 18 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 18 * 24 * 60 * minute + 50 * minute).toISOString()
    },
    {
      id: "b4",
      symbol: "XAUUSD",
      side: "Long",
      result: "Win",
      entrySource: "breakout",
      pnlPct: 1.4,
      pnlUsd: 140,
      entryTime: now - 17 * 24 * 60 * minute,
      exitTime: now - 17 * 24 * 60 * minute + 120 * minute,
      entryPrice: 2878.9,
      targetPrice: 2888.5,
      stopPrice: 2872.6,
      outcomePrice: 2888.5,
      units: 1,
      entryAt: new Date(now - 17 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 17 * 24 * 60 * minute + 120 * minute).toISOString()
    },
    {
      id: "b5",
      symbol: "XAUUSD",
      side: "Short",
      result: "Loss",
      entrySource: "reversal",
      pnlPct: -0.4,
      pnlUsd: -40,
      entryTime: now - 16 * 24 * 60 * minute,
      exitTime: now - 16 * 24 * 60 * minute + 45 * minute,
      entryPrice: 2890.6,
      targetPrice: 2886.1,
      stopPrice: 2894.4,
      outcomePrice: 2894.4,
      units: 1,
      entryAt: new Date(now - 16 * 24 * 60 * minute).toISOString(),
      exitAt: new Date(now - 16 * 24 * 60 * minute + 45 * minute).toISOString()
    }
  ];
};

const baseContext = {
  symbol: "XAUUSD",
  timeframe: "M15",
  liveCandles: buildCandles(),
  activeTrade: null,
  historyRows: buildHistoryRows(),
  actionRows: [],
  backtest: {
    hasRun: true,
    dataIncluded: true,
    timeframe: "M15",
    summary: {
      totalTrades: 5,
      wins: 3,
      losses: 2,
      winRatePct: 60,
      totalPnlUsd: 230
    },
    trades: buildBacktestRows()
  }
};

const cases = [
  {
    id: "social",
    prompt: "hey",
    expected: ["brief", "no charts", "no bullets"]
  },
  {
    id: "price",
    prompt: "What is XAUUSD doing right now?",
    expected: ["current price", "freshness", "natural"]
  },
  {
    id: "stats",
    prompt: "What is the backtest win rate?",
    expected: ["win rate", "trade count", "no chart"]
  },
  {
    id: "draw",
    prompt: "Draw the nearest support and resistance on the chart.",
    expected: ["chart actions", "minimal text"]
  },
  {
    id: "indicator",
    prompt: "Is RSI overbought on XAUUSD M15 right now?",
    expected: ["indicator", "natural", "no extra charts"]
  },
  {
    id: "strategy",
    prompt:
      "Turn this into a model: buy gold after a sweep low and reclaim, confirm with bullish close, invalidate on loss of reclaim, take profit at 2R.",
    expected: ["strategy draft", "possibly chart preview"]
  },
  {
    id: "internet",
    prompt: "Any major macro news today that matters for gold?",
    expected: ["fresh web context", "dated facts"]
  }
];

const summarize = (payload) => {
  const response = payload?.response ?? {};
  return {
    cannotAnswer: Boolean(response.cannotAnswer),
    shortAnswer: String(response.shortAnswer ?? ""),
    bullets: Array.isArray(response.bullets) ? response.bullets.map((row) => row.text) : [],
    charts: Array.isArray(response.charts) ? response.charts.length : 0,
    drawings: Array.isArray(response.chartActions) ? response.chartActions.length : 0,
    animations: Array.isArray(response.chartAnimations) ? response.chartAnimations.length : 0,
    toolsUsed: Array.isArray(response.toolsUsed) ? response.toolsUsed : [],
    status: String(payload?.status ?? "")
  };
};

const runCase = async (practiceCase) => {
  const res = await fetch(`${BASE_URL}/api/assistant/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: practiceCase.prompt }],
      context: baseContext,
      threadState: {
        latestDraft: null
      }
    })
  });
  const payload = await res.json();
  return {
    httpStatus: res.status,
    payload,
    summary: summarize(payload)
  };
};

for (const practiceCase of cases) {
  console.log(`\n=== ${practiceCase.id} ===`);
  console.log(`Prompt: ${practiceCase.prompt}`);
  console.log(`Expect: ${practiceCase.expected.join(", ")}`);
  try {
    const result = await runCase(practiceCase);
    console.log(`HTTP: ${result.httpStatus}`);
    console.log(JSON.stringify(result.summary, null, 2));
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
  }
}
