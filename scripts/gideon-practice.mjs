const BASE_URL = process.env.GIDEON_BASE_URL || "http://127.0.0.1:3000";
const CATEGORY_FILTER = new Set(
  String(process.env.GIDEON_CATEGORIES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const CASE_LIMIT = Number(process.env.GIDEON_LIMIT || 0);

const now = Date.now();
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const buildCandles = () => {
  const rows = [];
  let close = 2918.4;
  for (let index = 0; index < 320; index += 1) {
    const wave = Math.sin(index / 11) * 0.9 + Math.cos(index / 23) * 0.45;
    const drift = index < 180 ? index * 0.014 : 2.4 - (index - 180) * 0.012;
    const shock = index % 37 === 0 ? -0.35 : index % 53 === 0 ? 0.42 : 0;
    const nextClose = 2916.8 + wave + drift + shock;
    const open = close;
    const high = Math.max(open, nextClose) + 0.55;
    const low = Math.min(open, nextClose) - 0.52;
    rows.push({
      time: now - (319 - index) * 15 * minute,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(nextClose.toFixed(2)),
      volume: 110 + (index % 24) * 8
    });
    close = nextClose;
  }

  const injectBullishFvgPattern = (formationIndex) => {
    if (formationIndex < 2 || formationIndex + 4 >= rows.length) {
      return;
    }

    const left = rows[formationIndex - 2];
    const middle = rows[formationIndex - 1];
    const right = rows[formationIndex];
    const retest = rows[formationIndex + 4];
    if (!left || !middle || !right || !retest) {
      return;
    }

    const gapLow = Number((left.high + 0.24).toFixed(2));
    const gapHigh = Number((gapLow + 0.62).toFixed(2));
    const midpoint = Number((((gapLow + gapHigh) / 2)).toFixed(2));

    middle.open = Number((gapLow - 0.18).toFixed(2));
    middle.close = Number((gapHigh + 0.74).toFixed(2));
    middle.high = Number((middle.close + 0.26).toFixed(2));
    middle.low = Number((middle.open - 0.2).toFixed(2));

    right.open = Number((gapHigh + 0.28).toFixed(2));
    right.low = gapHigh;
    right.close = Number((gapHigh + 0.58).toFixed(2));
    right.high = Number((right.close + 0.24).toFixed(2));

    retest.open = Number((gapHigh + 0.18).toFixed(2));
    retest.high = Number((gapHigh + 0.34).toFixed(2));
    retest.low = Number((gapLow + 0.08).toFixed(2));
    retest.close = Number((midpoint + 0.19).toFixed(2));
  };

  const injectBearishFvgPattern = (formationIndex) => {
    if (formationIndex < 2 || formationIndex + 4 >= rows.length) {
      return;
    }

    const left = rows[formationIndex - 2];
    const middle = rows[formationIndex - 1];
    const right = rows[formationIndex];
    const retest = rows[formationIndex + 4];
    if (!left || !middle || !right || !retest) {
      return;
    }

    const gapHigh = Number((left.low - 0.24).toFixed(2));
    const gapLow = Number((gapHigh - 0.62).toFixed(2));
    const midpoint = Number((((gapLow + gapHigh) / 2)).toFixed(2));

    middle.open = Number((gapHigh + 0.2).toFixed(2));
    middle.close = Number((gapLow - 0.74).toFixed(2));
    middle.high = Number((middle.open + 0.18).toFixed(2));
    middle.low = Number((middle.close - 0.26).toFixed(2));

    right.open = Number((gapLow - 0.28).toFixed(2));
    right.high = gapLow;
    right.close = Number((gapLow - 0.58).toFixed(2));
    right.low = Number((right.close - 0.24).toFixed(2));

    retest.open = Number((gapLow - 0.18).toFixed(2));
    retest.low = Number((gapLow - 0.34).toFixed(2));
    retest.high = Number((gapHigh - 0.08).toFixed(2));
    retest.close = Number((midpoint - 0.19).toFixed(2));
  };

  injectBullishFvgPattern(68);
  injectBearishFvgPattern(126);
  injectBullishFvgPattern(188);
  injectBearishFvgPattern(248);

  return rows;
};

const normalizeTimestamp = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
};

const summarizeTrades = (rows) => {
  let wins = 0;
  let losses = 0;
  let totalPnlUsd = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let runningEquityUsd = 0;
  let peakEquityUsd = 0;
  let maxDrawdownUsd = 0;

  const ordered = [...rows].sort((left, right) => normalizeTimestamp(left.exitTime) - normalizeTimestamp(right.exitTime));

  for (const row of ordered) {
    const pnlUsd = Number(row.pnlUsd || 0);
    totalPnlUsd += pnlUsd;
    if (pnlUsd > 0) {
      wins += 1;
      grossProfitUsd += pnlUsd;
    } else if (pnlUsd < 0) {
      losses += 1;
      grossLossUsd += Math.abs(pnlUsd);
    }

    if (String(row.side || "").toLowerCase() === "long") {
      longTrades += 1;
    } else if (String(row.side || "").toLowerCase() === "short") {
      shortTrades += 1;
    }

    runningEquityUsd += pnlUsd;
    peakEquityUsd = Math.max(peakEquityUsd, runningEquityUsd);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peakEquityUsd - runningEquityUsd);
  }

  const totalTrades = ordered.length;
  return {
    totalTrades,
    wins,
    losses,
    longTrades,
    shortTrades,
    winRatePct: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    totalPnlUsd,
    grossProfitUsd,
    grossLossUsd,
    averageWinUsd: wins > 0 ? grossProfitUsd / wins : 0,
    averageLossUsd: losses > 0 ? grossLossUsd / losses : 0,
    expectancyUsd: totalTrades > 0 ? totalPnlUsd / totalTrades : 0,
    profitFactor: grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : null,
    maxDrawdownUsd
  };
};

const buildTradeRows = (params) => {
  const { count, startDaysAgo, startingId } = params;
  const pnlPattern = [120, -80, 90, 140, -60, 110, -70, 100, 130, -50, 95, -65];
  const entrySources = ["breakout", "retest", "fade", "reversal", "sweep", "pullback"];
  const rows = [];

  for (let index = 0; index < count; index += 1) {
    const pnlUsd = pnlPattern[index % pnlPattern.length];
    const isLong = index % 2 === 0;
    const entryTime = now - (startDaysAgo - Math.floor(index / 2)) * day - (index % 4) * 6 * hour;
    const exitTime = entryTime + (45 + (index % 5) * 20) * minute;
    const basePrice = 2864 + index * 1.45 + Math.sin(index / 3) * 8.5;
    const riskDistance = 3.2 + (index % 4) * 0.7;
    const rewardDistance = riskDistance * (Math.abs(pnlUsd) >= 100 ? 1.8 : 1.1);
    const entryPrice = Number(basePrice.toFixed(2));
    const stopPrice = Number((isLong ? entryPrice - riskDistance : entryPrice + riskDistance).toFixed(2));
    const targetPrice = Number((isLong ? entryPrice + rewardDistance : entryPrice - rewardDistance).toFixed(2));
    const outcomePrice = Number(
      (pnlUsd >= 0 ? targetPrice : stopPrice).toFixed(2)
    );

    rows.push({
      id: `${startingId}${index + 1}`,
      symbol: "XAUUSD",
      side: isLong ? "Long" : "Short",
      result: pnlUsd >= 0 ? "Win" : "Loss",
      entrySource: entrySources[index % entrySources.length],
      pnlPct: Number((pnlUsd / 100).toFixed(2)),
      pnlUsd,
      entryTime,
      exitTime,
      entryPrice,
      targetPrice,
      stopPrice,
      outcomePrice,
      units: 1,
      entryAt: new Date(entryTime).toISOString(),
      exitAt: new Date(exitTime).toISOString()
    });
  }

  return rows;
};

const buildActionRows = (historyRows) => {
  const rows = [];
  for (const trade of historyRows) {
    rows.push({
      id: `a-${trade.id}-entry`,
      tradeId: trade.id,
      symbol: trade.symbol,
      label: "Entry",
      details: `${trade.side} ${trade.entrySource}`,
      time: trade.entryAt,
      timestamp: trade.entryTime
    });
    rows.push({
      id: `a-${trade.id}-exit`,
      tradeId: trade.id,
      symbol: trade.symbol,
      label: "Exit",
      details: trade.result,
      time: trade.exitAt,
      timestamp: trade.exitTime
    });
  }
  return rows;
};

const liveCandles = buildCandles();
const historyRows = buildTradeRows({ count: 12, startDaysAgo: 14, startingId: "h" });
const backtestRows = buildTradeRows({ count: 24, startDaysAgo: 38, startingId: "b" });
const backtestSummary = summarizeTrades(backtestRows);
const latestCandle = liveCandles[liveCandles.length - 1];

const baseContext = {
  symbol: "XAUUSD",
  timeframe: "M15",
  liveCandles,
  activeTrade: {
    symbol: "XAUUSD",
    side: "Long",
    units: 1,
    entryPrice: 2914.7,
    markPrice: latestCandle.close,
    targetPrice: 2924.8,
    stopPrice: 2910.9,
    openedAt: now - 95 * minute,
    openedAtLabel: new Date(now - 95 * minute).toISOString(),
    elapsed: "95m",
    pnlPct: Number((((latestCandle.close - 2914.7) / 2914.7) * 100).toFixed(2)),
    pnlValue: Number(((latestCandle.close - 2914.7) * 100).toFixed(2)),
    progressPct: 46,
    rr: 1.82
  },
  historyRows,
  actionRows: buildActionRows(historyRows),
  backtest: {
    hasRun: true,
    dataIncluded: true,
    timeframe: "M15",
    summary: {
      totalTrades: backtestSummary.totalTrades,
      wins: backtestSummary.wins,
      losses: backtestSummary.losses,
      winRatePct: Number(backtestSummary.winRatePct.toFixed(2)),
      totalPnlUsd: Number(backtestSummary.totalPnlUsd.toFixed(2))
    },
    trades: backtestRows
  }
};

const lower = (value) => String(value || "").toLowerCase();

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const numberTokens = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return [];
  }
  return unique([
    String(value),
    value.toFixed(digits),
    value.toFixed(Math.max(0, digits - 1)),
    Math.round(value).toString()
  ]);
};

const currencyTokens = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return [];
  }
  return unique([
    `$${value.toFixed(digits)}`,
    `$${value.toFixed(Math.max(0, digits - 1))}`,
    `$${Math.round(value)}`,
    ...numberTokens(value, digits)
  ]);
};

const percentTokens = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return [];
  }
  return unique([
    `${value.toFixed(digits)}%`,
    `${value.toFixed(Math.max(0, digits - 1))}%`,
    `${Math.round(value)}%`,
    ...numberTokens(value, digits)
  ]);
};

const expected = {
  latestClose: latestCandle.close,
  latestTimeIso: new Date(latestCandle.time).toISOString(),
  summary: backtestSummary,
  breakEven2R: 100 / 3,
  breakEven15R: 40,
  expectancy40pct2R: 0.2,
  riskReward2917: 2,
  accountRisk50: 50,
  percentMove: ((2922.5 - 2910) / 2910) * 100,
  long2RTarget: 2925,
  recoveryFactor: backtestSummary.maxDrawdownUsd > 0 ? backtestSummary.totalPnlUsd / backtestSummary.maxDrawdownUsd : 0
};

const questionBank = [
  {
    id: "social_hey",
    category: "social",
    prompt: "hey",
    checks: { maxBullets: 0, maxCharts: 0, maxDrawings: 0, maxAnimations: 0, minShortAnswerLength: 12, maxShortAnswerWords: 10 }
  },
  {
    id: "social_morning",
    category: "social",
    prompt: "good morning",
    checks: { maxBullets: 0, maxCharts: 0, maxDrawings: 0, maxAnimations: 0, minShortAnswerLength: 12, maxShortAnswerWords: 12 }
  },
  {
    id: "social_sup",
    category: "social",
    prompt: "sup",
    checks: { maxBullets: 0, maxCharts: 0, maxDrawings: 0, maxAnimations: 0, minShortAnswerLength: 12, maxShortAnswerWords: 10 }
  },
  {
    id: "social_how_are_you",
    category: "social",
    prompt: "how are you",
    checks: { maxBullets: 0, maxCharts: 0, maxDrawings: 0, maxAnimations: 0, minShortAnswerLength: 12, maxShortAnswerWords: 12 }
  },
  {
    id: "price_current",
    category: "price",
    prompt: "What is XAUUSD doing right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      minShortAnswerLength: 20,
      mustIncludeAny: currencyTokens(expected.latestClose),
      mustIncludeAll: ["xauusd"],
      toolsIncludeAny: ["get latest price anchor"]
    }
  },
  {
    id: "price_gold_quote",
    category: "price",
    prompt: "Give me the latest gold price on M15.",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: currencyTokens(expected.latestClose),
      mustIncludeAnyText: ["gold", "xauusd"],
      toolsIncludeAny: ["get latest price anchor"]
    }
  },
  {
    id: "price_latest_candle",
    category: "price",
    prompt: "What is the latest candle time for gold?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: [expected.latestTimeIso.slice(0, 16).toLowerCase(), "latest candle time"],
      toolsIncludeAny: ["get latest price anchor"]
    }
  },
  {
    id: "price_range_position",
    category: "price",
    prompt: "Are we near the top or bottom of the loaded range right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      minShortAnswerLength: 12,
      mustIncludeAnyText: ["range", "top", "bottom", "high", "low"]
    }
  },
  {
    id: "price_window_direction",
    category: "price",
    prompt: "Is the loaded window up, down, or flat?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAnyText: ["up", "down", "flat"]
    }
  },
  {
    id: "price_no_chart",
    category: "price",
    prompt: "Give me the current XAUUSD price with no chart.",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: currencyTokens(expected.latestClose),
      toolsIncludeAny: ["get latest price anchor"]
    }
  },
  {
    id: "indicator_rsi_overbought",
    category: "indicator",
    prompt: "Is RSI overbought on XAUUSD M15 right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["rsi"],
      mustIncludeAnyText: ["overbought", "oversold", "not overbought"],
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_rsi_value",
    category: "indicator",
    prompt: "What is RSI 14 on XAUUSD M15 right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["rsi"],
      requireNumber: true,
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_rsi_oversold",
    category: "indicator",
    prompt: "Is gold oversold on RSI right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["rsi"],
      mustIncludeAnyText: ["oversold", "not overbought", "overbought"],
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_macd_state",
    category: "indicator",
    prompt: "What does MACD look like on XAUUSD M15?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["macd"],
      mustIncludeAnyText: ["bullish", "bearish", "histogram", "cross"],
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_macd_cross",
    category: "indicator",
    prompt: "Did MACD just cross bullish or bearish?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["macd"],
      mustIncludeAnyText: ["bullish", "bearish", "cross", "no fresh cross"],
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_ema20",
    category: "indicator",
    prompt: "What is EMA 20 on XAUUSD M15?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["ema"],
      requireNumber: true
    }
  },
  {
    id: "indicator_sma20",
    category: "indicator",
    prompt: "What is SMA 20 on XAUUSD M15?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["sma"],
      requireNumber: true
    }
  },
  {
    id: "indicator_atr14",
    category: "indicator",
    prompt: "What is ATR 14 right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["atr"],
      requireNumber: true,
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_volatility",
    category: "indicator",
    prompt: "Is volatility expanding or contracting right now?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAnyText: ["atr", "volatility", "expanding", "contracting"],
      toolsIncludeAny: ["compute indicator snapshot"]
    }
  },
  {
    id: "indicator_stochastic",
    category: "indicator",
    prompt: "What is stochastic 14 3 showing?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAnyText: ["stoch", "stochastic", "overbought", "oversold", "k", "d"],
      requireNumber: true
    }
  },
  {
    id: "stats_win_rate",
    category: "stats",
    prompt: "What is the backtest win rate?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["win rate"],
      mustIncludeAny: percentTokens(expected.summary.winRatePct),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_profit_factor",
    category: "stats",
    prompt: "What is the profit factor?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["profit factor"],
      mustIncludeAny: numberTokens(expected.summary.profitFactor || 0, 3),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_expectancy",
    category: "stats",
    prompt: "What is expectancy per trade?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["expectancy"],
      mustIncludeAny: currencyTokens(expected.summary.expectancyUsd),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_drawdown",
    category: "stats",
    prompt: "What is max drawdown?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["drawdown"],
      mustIncludeAny: currencyTokens(expected.summary.maxDrawdownUsd),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_total_pnl",
    category: "stats",
    prompt: "What is total backtest PnL?",
    checks: {
      maxCharts: 0,
      mustIncludeAnyText: ["pnl", "net"],
      mustIncludeAny: currencyTokens(expected.summary.totalPnlUsd),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_total_trades",
    category: "stats",
    prompt: "How many trades are in the backtest?",
    checks: {
      maxCharts: 0,
      mustIncludeAny: [String(expected.summary.totalTrades)],
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_long_trades",
    category: "stats",
    prompt: "How many long trades are there?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["long"],
      mustIncludeAny: [String(expected.summary.longTrades)],
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_short_trades",
    category: "stats",
    prompt: "How many short trades are there?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["short"],
      mustIncludeAny: [String(expected.summary.shortTrades)],
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_average_win",
    category: "stats",
    prompt: "What is average win?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["average win"],
      mustIncludeAny: currencyTokens(expected.summary.averageWinUsd),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "stats_average_loss",
    category: "stats",
    prompt: "What is average loss?",
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["average loss"],
      mustIncludeAny: currencyTokens(expected.summary.averageLossUsd),
      toolsIncludeAny: ["compute metric"]
    }
  },
  {
    id: "graph_equity_curve",
    category: "graph",
    prompt: "Show the equity curve.",
    checks: { minCharts: 1, maxDrawings: 0, mustIncludeAnyText: ["equity", "curve", "chart", "graph"] }
  },
  {
    id: "graph_pnl_distribution",
    category: "graph",
    prompt: "Plot the PnL distribution.",
    checks: { minCharts: 1, mustIncludeAnyText: ["distribution", "pnl", "chart", "graph"] }
  },
  {
    id: "graph_session_performance",
    category: "graph",
    prompt: "Show session performance.",
    checks: { minCharts: 1, mustIncludeAnyText: ["session", "chart", "graph"] }
  },
  {
    id: "graph_hourly_performance",
    category: "graph",
    prompt: "Show hourly performance.",
    checks: { minCharts: 1, mustIncludeAnyText: ["hourly", "chart", "graph", "hour"] }
  },
  {
    id: "graph_weekday_performance",
    category: "graph",
    prompt: "Show weekday performance.",
    checks: { minCharts: 1, mustIncludeAnyText: ["weekday", "chart", "graph", "day"] }
  },
  {
    id: "graph_trade_outcomes",
    category: "graph",
    prompt: "Graph the trade outcomes.",
    checks: { minCharts: 1, mustIncludeAnyText: ["trade", "outcome", "chart", "graph"] }
  },
  {
    id: "draw_support_resistance",
    category: "draw",
    prompt: "Draw the nearest support and resistance on the chart.",
    checks: { minDrawings: 1, maxCharts: 0, maxAnimations: 0 }
  },
  {
    id: "draw_trendline",
    category: "draw",
    prompt: "Draw a bullish trend line under the recent swing lows.",
    checks: { minDrawings: 1, maxCharts: 0 }
  },
  {
    id: "draw_mark_swings",
    category: "draw",
    prompt: "Mark the latest swing high and swing low.",
    checks: { minDrawings: 1, maxCharts: 0 }
  },
  {
    id: "draw_range_box",
    category: "draw",
    prompt: "Draw a box around the most recent range.",
    checks: { minDrawings: 1, maxCharts: 0 }
  },
  {
    id: "draw_long_position",
    category: "draw",
    prompt: "Draw a long position from 2917 with stop 2913 and target 2925.",
    checks: { minDrawings: 1, maxCharts: 0, mustIncludeAnyText: ["draw", "long", "position"] }
  },
  {
    id: "draw_short_position",
    category: "draw",
    prompt: "Draw a short position from 2917 with stop 2921 and target 2910.",
    checks: { minDrawings: 1, maxCharts: 0, mustIncludeAnyText: ["draw", "short", "position"] }
  },
  {
    id: "math_break_even_2r",
    category: "math",
    prompt: "If I risk 1R to make 2R, what win rate do I need to break even?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: percentTokens(expected.breakEven2R),
      mustIncludeAnyText: ["break even", "win rate", "33"]
    }
  },
  {
    id: "math_break_even_15r",
    category: "math",
    prompt: "What breakeven win rate do I need for 1.5R targets?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: percentTokens(expected.breakEven15R),
      mustIncludeAnyText: ["break", "win rate", "40"]
    }
  },
  {
    id: "math_expectancy_positive",
    category: "math",
    prompt: "If my win rate is 40% and winners are 2R while losers are 1R, is expectancy positive?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAnyText: ["positive", "0.2", "0.20", "expectancy"]
    }
  },
  {
    id: "math_risk_reward",
    category: "math",
    prompt: "What is the risk reward from entry 2917 stop 2913 target 2925?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAnyText: ["2:1", "2r", "2.0", "risk reward"]
    }
  },
  {
    id: "math_account_risk",
    category: "math",
    prompt: "How many dollars is 0.5% of a $10,000 account?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: currencyTokens(expected.accountRisk50)
    }
  },
  {
    id: "math_percent_move",
    category: "math",
    prompt: "If gold moves from 2910 to 2922.5, what percentage move is that?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: percentTokens(expected.percentMove, 2)
    }
  },
  {
    id: "math_target_from_2r",
    category: "math",
    prompt: "If I buy 2917 with a stop at 2913 and want 2R, where is target?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAny: numberTokens(expected.long2RTarget),
      mustIncludeAnyText: ["target", "2925"]
    }
  },
  {
    id: "math_recovery_factor",
    category: "math",
    prompt: "If max drawdown is $80 and net PnL is $230, is recovery factor above 2?",
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAnyText: ["yes", "above 2", "2.8", "2.9", "recovery"]
    }
  },
  {
    id: "strategy_sweep_reclaim",
    category: "strategy",
    prompt:
      "Turn this into a model: buy gold after a sweep low and reclaim, confirm with bullish close, invalidate on loss of reclaim, take profit at 2R.",
    checks: { minDrawings: 1, mustIncludeAnyText: ["model", "draft", "2r", "reclaim"] }
  },
  {
    id: "strategy_asian_high",
    category: "strategy",
    prompt:
      "Create a model: buy the break of the Asian high after a retest, stop below the retest low, take profit at 2R.",
    checks: { minDrawings: 1, mustIncludeAnyText: ["model", "asian", "retest", "2r"] }
  },
  {
    id: "strategy_daily_resistance",
    category: "strategy",
    prompt:
      "Convert this to a model: fade the first touch of daily resistance, confirm with a bearish wick, stop above the wick high, target the previous intraday low.",
    checks: { minDrawings: 1, mustIncludeAnyText: ["model", "resistance", "wick", "target"] }
  },
  {
    id: "strategy_rsi_mean_reversion",
    category: "strategy",
    prompt:
      "Create a gold M15 RSI mean reversion model: buy when RSI is oversold and price reclaims EMA 20, invalidate below the reclaim low, take profit at 1.5R.",
    checks: { minDrawings: 1, mustIncludeAnyText: ["model", "rsi", "ema", "1.5r"] }
  },
  {
    id: "strategy_fair_value_gap_package",
    category: "strategy",
    prompt: "Make a fair value gap strategy for gold.",
    checks: {
      minCharts: 4,
      minDrawings: 4,
      mustIncludeAnyText: ["fair value gap", "win rate", "profit factor", "entry", "adjust"],
      mustAvoidAny: ["support / resistance", "support-resistance"]
    }
  },
  {
    id: "strategy_ict_fvg_examples",
    category: "strategy",
    prompt:
      "Create an ICT fair value gap model for XAUUSD and show me examples with entries plus the backtest win rate.",
    checks: {
      minCharts: 4,
      minDrawings: 4,
      mustIncludeAnyText: ["ict", "fvg", "win rate", "profit factor", "entry"],
      mustAvoidAny: ["support / resistance", "support-resistance"]
    }
  },
  {
    id: "internet_macro_news",
    category: "internet",
    prompt: "Any major macro news today that matters for gold?",
    checks: { minBullets: 1, maxCharts: 0, maxDrawings: 0, toolsIncludeAny: ["internet search"] }
  },
  {
    id: "internet_fed_yields",
    category: "internet",
    prompt: "Any Fed or yield headlines today that could move XAUUSD?",
    checks: { minBullets: 1, maxCharts: 0, maxDrawings: 0, toolsIncludeAny: ["internet search"] }
  },
  {
    id: "internet_dollar_driver",
    category: "internet",
    prompt: "Is dollar strength or yields the bigger macro driver today for gold?",
    checks: { minBullets: 1, maxCharts: 0, maxDrawings: 0, toolsIncludeAny: ["internet search"] }
  },
  {
    id: "internet_geopolitical",
    category: "internet",
    prompt: "Any geopolitical headlines today that could matter for gold?",
    checks: { minBullets: 1, maxCharts: 0, maxDrawings: 0, toolsIncludeAny: ["internet search"] }
  },
  {
    id: "followup_profit_factor",
    category: "follow_up",
    messages: [
      { role: "user", content: "What is the backtest win rate?" },
      { role: "assistant", content: `Backtest win rate is ${expected.summary.winRatePct.toFixed(2)}%.` },
      { role: "user", content: "And profit factor?" }
    ],
    checks: {
      maxCharts: 0,
      mustIncludeAll: ["profit factor"],
      mustIncludeAny: numberTokens(expected.summary.profitFactor || 0, 3)
    }
  },
  {
    id: "followup_macd",
    category: "follow_up",
    messages: [
      { role: "user", content: "Is RSI overbought on XAUUSD M15 right now?" },
      { role: "assistant", content: "RSI is not overbought." },
      { role: "user", content: "What about MACD?" }
    ],
    checks: {
      maxCharts: 0,
      maxDrawings: 0,
      mustIncludeAll: ["macd"],
      mustIncludeAnyText: ["bullish", "bearish", "histogram", "cross"]
    }
  },
  {
    id: "followup_distribution",
    category: "follow_up",
    messages: [
      { role: "user", content: "Show the equity curve." },
      { role: "assistant", content: "Here is the equity curve." },
      { role: "user", content: "Now show the PnL distribution instead." }
    ],
    checks: { minCharts: 1, mustIncludeAnyText: ["distribution", "pnl", "chart"] }
  },
  {
    id: "followup_long_position",
    category: "follow_up",
    messages: [
      { role: "user", content: "Draw the nearest support and resistance." },
      { role: "assistant", content: "Done." },
      { role: "user", content: "Now add a long position from 2917 with stop 2913 and target 2925." }
    ],
    checks: { minDrawings: 1, mustIncludeAnyText: ["draw", "long", "position"] }
  }
];

const selectedCases = questionBank
  .filter((item) => CATEGORY_FILTER.size === 0 || CATEGORY_FILTER.has(item.category))
  .slice(0, CASE_LIMIT > 0 ? CASE_LIMIT : questionBank.length);

const normalizeText = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const summarize = (payload) => {
  const response = payload?.response ?? {};
  return {
    cannotAnswer: Boolean(response.cannotAnswer),
    shortAnswer: String(response.shortAnswer ?? ""),
    bullets: Array.isArray(response.bullets) ? response.bullets.map((row) => String(row.text || "")) : [],
    charts: Array.isArray(response.charts) ? response.charts.length : 0,
    drawings: Array.isArray(response.chartActions) ? response.chartActions.length : 0,
    animations: Array.isArray(response.chartAnimations) ? response.chartAnimations.length : 0,
    toolsUsed: Array.isArray(response.toolsUsed) ? response.toolsUsed.map((value) => String(value)) : [],
    status: String(payload?.status ?? "")
  };
};

const buildMessages = (practiceCase) => {
  if (Array.isArray(practiceCase.messages) && practiceCase.messages.length > 0) {
    return practiceCase.messages;
  }
  return [{ role: "user", content: practiceCase.prompt }];
};

const runCase = async (practiceCase) => {
  const res = await fetch(`${BASE_URL}/api/assistant/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      messages: buildMessages(practiceCase),
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

const evaluateCase = (practiceCase, result) => {
  const issues = [];
  const checks = practiceCase.checks || {};
  const summary = result.summary;
  const shortAnswer = normalizeText(summary.shortAnswer);
  const promptText = normalizeText(practiceCase.prompt || buildMessages(practiceCase).at(-1)?.content || "");
  const combinedText = normalizeText([summary.shortAnswer, ...summary.bullets].join(" "));
  const toolsUsed = summary.toolsUsed.map((value) => normalizeText(value));

  if (result.httpStatus !== 200) {
    issues.push(`http ${result.httpStatus}`);
  }
  if (summary.status !== "ok") {
    issues.push(`status ${summary.status}`);
  }
  if (!checks.allowCannotAnswer && summary.cannotAnswer) {
    issues.push("cannotAnswer=true");
  }
  if (!shortAnswer) {
    issues.push("empty shortAnswer");
  }
  if (shortAnswer.includes("<think>") || combinedText.includes("<think>")) {
    issues.push("private reasoning leaked");
  }
  if (promptText && shortAnswer === promptText) {
    issues.push("prompt echo");
  }
  if (checks.minShortAnswerLength && summary.shortAnswer.length < checks.minShortAnswerLength) {
    issues.push(`shortAnswer shorter than ${checks.minShortAnswerLength}`);
  }
  if (checks.maxShortAnswerWords) {
    const words = summary.shortAnswer.trim().split(/\s+/).filter(Boolean).length;
    if (words > checks.maxShortAnswerWords) {
      issues.push(`shortAnswer longer than ${checks.maxShortAnswerWords} words`);
    }
  }
  if (checks.minCharts !== undefined && summary.charts < checks.minCharts) {
    issues.push(`charts < ${checks.minCharts}`);
  }
  if (checks.maxCharts !== undefined && summary.charts > checks.maxCharts) {
    issues.push(`charts > ${checks.maxCharts}`);
  }
  if (checks.minDrawings !== undefined && summary.drawings < checks.minDrawings) {
    issues.push(`drawings < ${checks.minDrawings}`);
  }
  if (checks.maxDrawings !== undefined && summary.drawings > checks.maxDrawings) {
    issues.push(`drawings > ${checks.maxDrawings}`);
  }
  if (checks.minAnimations !== undefined && summary.animations < checks.minAnimations) {
    issues.push(`animations < ${checks.minAnimations}`);
  }
  if (checks.maxAnimations !== undefined && summary.animations > checks.maxAnimations) {
    issues.push(`animations > ${checks.maxAnimations}`);
  }
  if (checks.minBullets !== undefined && summary.bullets.length < checks.minBullets) {
    issues.push(`bullets < ${checks.minBullets}`);
  }
  if (checks.maxBullets !== undefined && summary.bullets.length > checks.maxBullets) {
    issues.push(`bullets > ${checks.maxBullets}`);
  }
  if (checks.requireNumber && !/\d/.test(combinedText)) {
    issues.push("missing numeric detail");
  }
  if (Array.isArray(checks.mustIncludeAll)) {
    for (const token of checks.mustIncludeAll) {
      if (!combinedText.includes(lower(token))) {
        issues.push(`missing token "${token}"`);
      }
    }
  }
  const anyTokens = [...(checks.mustIncludeAny || []), ...(checks.mustIncludeAnyText || [])].map((token) => lower(token));
  if (anyTokens.length > 0 && !anyTokens.some((token) => combinedText.includes(token))) {
    issues.push(`missing any of ${JSON.stringify(anyTokens.slice(0, 6))}`);
  }
  if (Array.isArray(checks.mustAvoidAny)) {
    for (const token of checks.mustAvoidAny) {
      if (combinedText.includes(lower(token))) {
        issues.push(`unexpected token "${token}"`);
      }
    }
  }
  if (Array.isArray(checks.toolsIncludeAny) && checks.toolsIncludeAny.length > 0) {
    const normalized = checks.toolsIncludeAny.map((token) => normalizeText(token));
    if (!normalized.some((token) => toolsUsed.includes(token))) {
      issues.push(`missing tool ${JSON.stringify(normalized)}`);
    }
  }

  return {
    passed: issues.length === 0,
    issues
  };
};

const categoryOrder = ["social", "price", "indicator", "stats", "graph", "draw", "math", "strategy", "internet", "follow_up"];

console.log(`Running ${selectedCases.length} cases against ${BASE_URL}`);
if (CATEGORY_FILTER.size > 0) {
  console.log(`Categories: ${Array.from(CATEGORY_FILTER).join(", ")}`);
}
console.log(`Backtest summary: ${JSON.stringify({
  totalTrades: expected.summary.totalTrades,
  winRatePct: Number(expected.summary.winRatePct.toFixed(2)),
  totalPnlUsd: Number(expected.summary.totalPnlUsd.toFixed(2)),
  profitFactor: expected.summary.profitFactor === null ? null : Number(expected.summary.profitFactor.toFixed(3)),
  expectancyUsd: Number(expected.summary.expectancyUsd.toFixed(2)),
  maxDrawdownUsd: Number(expected.summary.maxDrawdownUsd.toFixed(2))
})}`);

const results = [];
for (const practiceCase of selectedCases) {
  const prompt = buildMessages(practiceCase).at(-1)?.content || "";
  console.log(`\n[${practiceCase.category}] ${practiceCase.id}`);
  console.log(`Prompt: ${prompt}`);
  try {
    const result = await runCase(practiceCase);
    const evaluation = evaluateCase(practiceCase, result);
    results.push({
      ...result,
      practiceCase,
      evaluation
    });
    console.log(evaluation.passed ? "Result: PASS" : `Result: FAIL (${evaluation.issues.join("; ")})`);
    console.log(
      JSON.stringify(
        {
          shortAnswer: result.summary.shortAnswer,
          bullets: result.summary.bullets.slice(0, 3),
          charts: result.summary.charts,
          drawings: result.summary.drawings,
          animations: result.summary.animations,
          toolsUsed: result.summary.toolsUsed
        },
        null,
        2
      )
    );
  } catch (error) {
    results.push({
      httpStatus: 0,
      payload: null,
      summary: {
        cannotAnswer: true,
        shortAnswer: "",
        bullets: [],
        charts: 0,
        drawings: 0,
        animations: 0,
        toolsUsed: [],
        status: "error"
      },
      practiceCase,
      evaluation: {
        passed: false,
        issues: [error instanceof Error ? error.message : String(error)]
      }
    });
    console.log(`Result: FAIL (${error instanceof Error ? error.message : String(error)})`);
  }
}

const passedCount = results.filter((row) => row.evaluation.passed).length;
const failed = results.filter((row) => !row.evaluation.passed);

console.log(`\n=== Summary ===`);
console.log(`Passed ${passedCount}/${results.length} cases (${((passedCount / Math.max(1, results.length)) * 100).toFixed(1)}%)`);

for (const category of categoryOrder) {
  const categoryRows = results.filter((row) => row.practiceCase.category === category);
  if (categoryRows.length === 0) {
    continue;
  }
  const categoryPasses = categoryRows.filter((row) => row.evaluation.passed).length;
  console.log(`- ${category}: ${categoryPasses}/${categoryRows.length}`);
}

if (failed.length > 0) {
  console.log(`\n=== Failures ===`);
  for (const row of failed) {
    const prompt = buildMessages(row.practiceCase).at(-1)?.content || "";
    console.log(`- [${row.practiceCase.category}] ${row.practiceCase.id}: ${row.evaluation.issues.join("; ")}`);
    console.log(`  Prompt: ${prompt}`);
    console.log(`  Short: ${row.summary.shortAnswer}`);
    console.log(`  Tools: ${JSON.stringify(row.summary.toolsUsed)}`);
  }
}
