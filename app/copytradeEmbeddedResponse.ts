import {
  COPYTRADE_BACKTEST_STATE_KEY,
  DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE
} from "./copytradeDashboardSeed";

const authHeaders = {
  "access-token": "copytrade-local-access-token",
  "token-type": "Bearer",
  client: "copytrade-local-client",
  expiry: "4102444800",
  uid: "copytrade@local.test"
};

const mockUser = {
  first_name: "Copy",
  last_name: "Trade",
  username: "copytrade",
  email: "copytrade@local.test",
  role: "admin",
  is_suspended: false,
  public_uid: "copytrade-local-user",
  stripe_subscription_status: "active",
  stripe_subscription_original_status: "active",
  stripe_subscription_paused: false,
  stripe_subscription_paused_till: null,
  limits_overused: false,
  beta_level: "beta",
  features: [],
  display_currency: "USD",
  time_zone: "America/New_York",
  created_at: "2026-03-07T00:00:00.000Z",
  subscription_valid_until: "2099-12-31",
  profile_picture: null,
  plan: "pro",
  limits: {
    accounts: 999,
    replay: true,
    playbooks: 999,
    mentee: 999
  },
  onboarding_answers: {},
  is_admin_access: true,
  trialing: false,
  trial_start_at: null,
  intercom_user_jwt: "",
  black_friday_discount_redeemed: false,
  tour_progress: {}
};

const injectedCss = String.raw`
html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  overflow: hidden;
  background: #ffffff;
}
`;

const injectedScript = `
(() => {
  const AUTH_HEADERS = ${JSON.stringify(authHeaders)};
  const COPYTRADE_BACKTEST_STORAGE_KEY = ${JSON.stringify(COPYTRADE_BACKTEST_STATE_KEY)};
  const DEFAULT_DASHBOARD_TEMPLATE = ${JSON.stringify(DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE)};
  const DEFAULT_DASHBOARD_RESPONSE = {
    data: [],
    items: [],
    results: [],
    templates: [],
    selected_template: DEFAULT_DASHBOARD_TEMPLATE,
    top_widgets: DEFAULT_DASHBOARD_TEMPLATE.top_widgets,
    bottom_widgets: DEFAULT_DASHBOARD_TEMPLATE.bottom_widgets,
    count: 0,
    page: 1,
    per_page: 0,
    total_pages: 1,
    total_count: 0,
    winners: 0,
    losers: 0,
    break_evens: 0,
    total_gain_loss: 0,
    trade_count: 0,
    trade_expectancy: 0,
    profit_factor: 0,
    winning_trades_sum: 0,
    losing_trades_sum: 0,
    average_daily_volume: 0,
    average_winning_trade: 0,
    average_losing_trade: 0,
    total_commissions: 0,
    max_wins: 0,
    max_losses: 0,
    winning_days: 0,
    losing_days: 0,
    breakeven_days: 0,
    winning_trades_count: 0,
    losing_trades_count: 0,
    breakeven_trades_count: 0,
    day_streaks: {
      current_winning: 0,
      current_losing: 0,
      winning: 0,
      losing: 0
    },
    trade_streaks: {
      current_winning_streak: 0,
      current_losing_streak: 0,
      max_wins: 0,
      max_losses: 0
    },
    max_drawdown: {
      drawdown: 0,
      percent: 0
    },
    average_drawdown: {
      drawdown: 0,
      percent: 0
    },
    current_drawdown: {
      drawdown: 0,
      percent: 0
    }
  };
  const MOCK_USER = ${JSON.stringify(mockUser)};
  const API_HOST = "api.tradezella.com";
  const MARKET_DATA_PROXY_HOST = "market-data-proxy.herokuapp.com";
  const API_PATH_PREFIX = "/api";
  const LISTENER_EVENTS = [
    "readystatechange",
    "load",
    "loadend",
    "error",
    "abort",
    "timeout",
    "progress"
  ];
  const NativeXHR = window.XMLHttpRequest;
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);
  let lastEmbeddedPath = window.location.pathname + window.location.search + window.location.hash;

  const safeUrl = (input) => {
    try {
      return new URL(String(input), window.location.origin);
    } catch {
      return null;
    }
  };

  const isAuthRoute = (input) => {
    const parsed = safeUrl(input);
    return Boolean(parsed && parsed.pathname.startsWith("/auth/"));
  };

  const isTradezellaApiRequest = (input) => {
    const parsed = safeUrl(input);
    return Boolean(
        parsed &&
        parsed.hostname === API_HOST &&
        parsed.pathname.startsWith(API_PATH_PREFIX)
    );
  };

  const isMarketDataProxyRequest = (input) => {
    const parsed = safeUrl(input);
    return Boolean(parsed && parsed.hostname === MARKET_DATA_PROXY_HOST);
  };

  const normalizeEmbeddedPath = (input) => {
    const parsed = safeUrl(input);
    if (!parsed || parsed.origin !== window.location.origin || parsed.pathname.startsWith("/auth/")) {
      return null;
    }

    if (parsed.pathname === "/settings" || parsed.pathname === "/settings/") {
      parsed.pathname = "/settings/account";
      parsed.search = "";
    }

    if (parsed.pathname === "/settings/account-management") {
      parsed.pathname = "/settings/account";
      parsed.search = "";
    }

    return parsed.pathname + parsed.search + parsed.hash;
  };

  const rememberEmbeddedPath = (input) => {
    const normalized = normalizeEmbeddedPath(input);
    if (!normalized) {
      return;
    }

    lastEmbeddedPath = normalized;
  };

  const persistAuthHeaders = () => {
    Object.entries(AUTH_HEADERS).forEach(([key, value]) => {
      localStorage.setItem(key, String(value));
    });
    localStorage.setItem("drawerPosition", "true");
    localStorage.setItem("openSidebar", "true");
  };

  const cloneDefaultDashboardResponse = () =>
    JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_RESPONSE));

  const cloneJson = (value, fallback) => {
    const target = value == null ? fallback : value;

    try {
      return JSON.parse(JSON.stringify(target));
    } catch {
      return JSON.parse(JSON.stringify(fallback));
    }
  };

  const readBacktestSeed = () => {
    try {
      const raw = localStorage.getItem(COPYTRADE_BACKTEST_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const DEFAULT_DAY_VIEW_COLUMNS = [
    "open_time",
    "symbol",
    "side",
    "instrument",
    "net_profits",
    "net_roi",
    "realized_rr",
    "tags",
    "playbook"
  ];

  const DEFAULT_TRADE_VIEW_COLUMNS = [
    "open_date",
    "symbol",
    "status",
    "close_date",
    "entry_price",
    "exit_price",
    "net_profits",
    "net_roi",
    "insights",
    "zella_score"
  ];

  const DEFAULT_TRADE_DETAIL_FIELDS = [
    "account",
    "adjusted_cost",
    "avg_buy_price",
    "avg_sell_price",
    "bestExitPrice",
    "bestExitTime",
    "commissions",
    "exit_levels",
    "grossPL",
    "initialTarget",
    "mae_mfe",
    "open_time",
    "close_time",
    "pips",
    "points",
    "profitTarget",
    "quantity",
    "rewardRatio",
    "roi",
    "running_pl",
    "side",
    "stopLoss",
    "strategy",
    "tags",
    "ticks",
    "ticks_per_contract",
    "trade_rating",
    "tradeRisk",
    "zella_scale"
  ];

  const DEFAULT_TRADE_DETAILS_SETTINGS = {
    checked: DEFAULT_TRADE_DETAIL_FIELDS
  };

  const DEFAULT_SESSION_CUSTOM_SETTINGS = {};
  const DEFAULT_BACKTESTING_VIEW_SETTINGS = {};
  const DEFAULT_AVAILABLE_REPORT_DIMENSIONS = [
    {
      name: "month",
      pretty_name: "Month",
      group: "Date"
    },
    {
      name: "year",
      pretty_name: "Year",
      group: "Date"
    }
  ];

  const DEFAULT_LOCAL_ACCOUNT = {
    id: "local",
    name: "Local",
    account_type: "manual",
    archived: false,
    active: true,
    backtesting: false,
    trades_editable: true,
    read_only: true,
    count: 0,
    running_balance: 0,
    import_type: "manual",
    broker: null,
    external_account_id: null,
    external_account_failed: false,
    clear_in_progress: false,
    sync_disconnected: false,
    disabled: false,
    failed: false,
    can_resync: false,
    next_manual_resync_time: null,
    next_sync_time: null,
    last_sync_time: null,
    has_trades: false,
    has_performance_report: false,
    profit_calculation_method: "fifo",
    shared: false,
    primary: true,
    color: "#2563eb",
    trades_count: 0,
    account_size: 0,
    last_import: null,
    last_imported_at: null,
    imports: [],
    broker_name: "Local",
    display_broker_name: "Local",
    created_at: MOCK_USER.created_at,
    updated_at: MOCK_USER.created_at,
    display_currency: MOCK_USER.display_currency,
    time_zone: MOCK_USER.time_zone,
    user_public_uid: MOCK_USER.public_uid
  };

  const compareValues = (left, right) => {
    if (typeof left === "string" || typeof right === "string") {
      return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    }

    return Number(left ?? 0) - Number(right ?? 0);
  };

  const getTradeDateKey = (value) => {
    if (!value) {
      return "";
    }

    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return String(value).slice(0, 10);
    }
  };

  const getSeedAccounts = (seed) => {
    const accounts = cloneJson(seed && seed.accounts, []);
    return accounts.length > 0
      ? accounts.map((account) => ({
          ...cloneJson(DEFAULT_LOCAL_ACCOUNT, {}),
          ...account,
          imports: Array.isArray(account && account.imports) ? account.imports : []
        }))
      : [cloneJson(DEFAULT_LOCAL_ACCOUNT, {})];
  };

  const getSeedTrades = (seed) =>
    cloneJson(seed && seed.allTrades && seed.allTrades.trades, []);

  const escapeRegExp = (value) =>
    String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\\\$&");

  const getParamValues = (searchParams, key) => {
    const results = [];
    const patterns = [
      key,
      key + "[]"
    ];

    searchParams.forEach((value, currentKey) => {
      if (
        patterns.includes(currentKey) ||
        new RegExp("^" + escapeRegExp(key) + "\\\\[\\\\d+\\\\]$").test(currentKey)
      ) {
        results.push(value);
      }
    });

    return results.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  };

  const getNestedParamValues = (searchParams, root, key) => {
    const escapedRoot = escapeRegExp(root);
    const escapedKey = escapeRegExp(key);
    const matcher = new RegExp(
      "^" + escapedRoot + "\\\\[" + escapedKey + "\\\\](?:\\\\[\\\\d+\\\\]|\\\\[\\\\])?$"
    );
    const results = [];

    searchParams.forEach((value, currentKey) => {
      if (matcher.test(currentKey)) {
        results.push(value);
      }
    });

    return results.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  };

  const getFilterValues = (searchParams, key) => [
    ...getParamValues(searchParams, key),
    ...getNestedParamValues(searchParams, "filters", key)
  ];

  const getFilterValue = (searchParams, key) => getFilterValues(searchParams, key)[0] || null;

  const normalizeDateValue = (value) => {
    if (!value) {
      return "";
    }

    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return String(value).slice(0, 10);
    }
  };

  const buildSeedDailyRows = (seed, searchParams) => {
    const filteredTrades = sortTrades(filterTrades(seed, searchParams), searchParams)
      .sort((left, right) => getTradeDateKey(left.realized).localeCompare(getTradeDateKey(right.realized)));
    const dailyMap = new Map();

    filteredTrades.forEach((trade) => {
      const dayKey = getTradeDateKey(trade.realized);
      const current = dailyMap.get(dayKey) || {
        day: dayKey,
        date: dayKey,
        net: 0,
        grossWins: 0,
        grossLosses: 0,
        totalTrades: 0,
        winners: 0,
        losers: 0,
        breakEvens: 0,
        longs: 0,
        shorts: 0
      };
      const pnl = Number(trade.net_profits || 0);
      const normalizedSide = String(trade.side || "").toLowerCase();

      current.net += pnl;
      current.totalTrades += 1;
      if (normalizedSide.includes("long") || normalizedSide.includes("buy")) {
        current.longs += 1;
      } else if (normalizedSide.includes("short") || normalizedSide.includes("sell")) {
        current.shorts += 1;
      }
      if (pnl > 0) {
        current.grossWins += pnl;
        current.winners += 1;
      } else if (pnl < 0) {
        current.grossLosses += Math.abs(pnl);
        current.losers += 1;
      } else {
        current.breakEvens += 1;
      }

      dailyMap.set(dayKey, current);
    });

    let cumulativePl = 0;
    let cumulativeWins = 0;
    let cumulativeLossMagnitude = 0;
    let cumulativeTrades = 0;
    let cumulativeLongs = 0;
    let cumulativeShorts = 0;
    let peak = 0;
    let drawdownSum = 0;

    return Array.from(dailyMap.values())
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((row) => {
        cumulativePl += row.net;
        cumulativeWins += row.grossWins;
        cumulativeLossMagnitude += row.grossLosses;
        cumulativeTrades += row.totalTrades;
        cumulativeLongs += row.longs;
        cumulativeShorts += row.shorts;
        peak = Math.max(peak, cumulativePl);
        const drawdown = Math.min(0, cumulativePl - peak);
        drawdownSum += Math.abs(drawdown);

        return {
          ...row,
          cumulativePl,
          cumulativeTrades,
          cumulativeLongs,
          cumulativeShorts,
          cumulativeWinPercentage: 0,
          cumulativeProfitFactor:
            cumulativeLossMagnitude > 0
              ? cumulativeWins / cumulativeLossMagnitude
              : cumulativeWins > 0
                ? cumulativeWins
                : 0,
          cumulativeTradeExpectancy: cumulativeTrades > 0 ? cumulativePl / cumulativeTrades : 0,
          drawdown,
          maxDrawdown: drawdown,
          averageDrawdown: cumulativeTrades > 0 ? -(drawdownSum / cumulativeTrades) : 0
        };
      })
      .map((row, index, rows) => {
        const cumulativeWinsCount = rows
          .slice(0, index + 1)
          .reduce((total, current) => total + current.winners, 0);

        return {
          ...row,
          cumulativeWinPercentage:
            row.cumulativeTrades > 0 ? (cumulativeWinsCount / row.cumulativeTrades) * 100 : 0
        };
      });
  };

  const normalizeAccountSelection = (searchParams) =>
    getFilterValues(searchParams, "accounts")
      .filter(Boolean)
      .filter((value) => value !== "all");

  const filterTrades = (seed, searchParams) => {
    let trades = getSeedTrades(seed);
    const selectedAccounts = normalizeAccountSelection(searchParams);
    if (
      selectedAccounts.length > 0 &&
      !selectedAccounts.includes(DEFAULT_LOCAL_ACCOUNT.id)
    ) {
      return [];
    }

    const startDate = normalizeDateValue(getFilterValue(searchParams, "start_date") || getFilterValue(searchParams, "startDate"));
    const endDate = normalizeDateValue(getFilterValue(searchParams, "end_date") || getFilterValue(searchParams, "endDate"));
    if (startDate) {
      trades = trades.filter((trade) => getTradeDateKey(trade.realized) >= startDate);
    }
    if (endDate) {
      trades = trades.filter((trade) => getTradeDateKey(trade.realized) <= endDate);
    }

    const symbol = getFilterValue(searchParams, "symbol");
    if (symbol) {
      const needle = symbol.trim().toLowerCase();
      trades = trades.filter((trade) =>
        String(trade.symbol || "").toLowerCase().includes(needle)
      );
    }

    return trades;
  };

  const sortTrades = (trades, searchParams) => {
    const sortBy = getFilterValue(searchParams, "sort_by") || getFilterValue(searchParams, "sortBy") || "realized";
    const direction = (getFilterValue(searchParams, "direction") || "desc").toLowerCase();
    const factor = direction === "asc" ? 1 : -1;

    return [...trades].sort((left, right) => {
      const comparison = compareValues(left[sortBy], right[sortBy]);
      if (comparison !== 0) {
        return comparison * factor;
      }

      return compareValues(left.realized, right.realized) * -1;
    });
  };

  const paginateItems = (items, searchParams) => {
    const totalCount = items.length;
    const requestedPerPage = Number(getFilterValue(searchParams, "per_page") || getFilterValue(searchParams, "perPage"));
    const perPage =
      Number.isFinite(requestedPerPage) && requestedPerPage > 0
        ? Math.floor(requestedPerPage)
        : totalCount > 0
          ? totalCount
          : 25;
    const requestedPage = Number(getFilterValue(searchParams, "page"));
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0
        ? Math.floor(requestedPage)
        : 1;
    const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
    const safePage = Math.min(page, pageCount);
    const startIndex = (safePage - 1) * perPage;
    const pagedItems = items.slice(startIndex, startIndex + perPage);

    return {
      items: pagedItems,
      pageCount,
      from: totalCount === 0 ? 0 : startIndex + 1,
      to: totalCount === 0 ? 0 : startIndex + pagedItems.length
    };
  };

  const filterDays = (seed, searchParams) => {
    const days = cloneJson(seed && seed.days && seed.days.days, []);
    const selectedAccounts = normalizeAccountSelection(searchParams);
    if (
      selectedAccounts.length > 0 &&
      !selectedAccounts.includes(DEFAULT_LOCAL_ACCOUNT.id)
    ) {
      return [];
    }

    const startDate = normalizeDateValue(getFilterValue(searchParams, "start_date") || getFilterValue(searchParams, "startDate"));
    const endDate = normalizeDateValue(getFilterValue(searchParams, "end_date") || getFilterValue(searchParams, "endDate"));
    return days.filter((day) => {
      const dayKey = normalizeDateValue(day.realized || day.day || "");
      if (startDate && dayKey < startDate) {
        return false;
      }
      if (endDate && dayKey > endDate) {
        return false;
      }
      return true;
    });
  };

  const createDashboardStatsPayload = (seed) => ({
    ...cloneDefaultDashboardResponse(),
    ...cloneJson(seed && seed.dashboardStats, {}),
    data: [],
    items: [],
    results: []
  });

  const createStatsPayload = (seed) => ({
    winners: 0,
    losers: 0,
    break_evens: 0,
    volume: 0,
    gross_pl: 0,
    net_pl: 0,
    profit_factor: 0,
    total_commissions: 0,
    trade_count: 0,
    ...cloneJson(seed && seed.stats, {})
  });

  const createZellaScorePayload = (seed) => ({
    win_rate: 0,
    win_rate_value: 0,
    profit_factor: 0,
    profit_factor_value: 0,
    avg_win_to_loss: 0,
    avg_win_to_loss_value: 0,
    recovery_factor: 0,
    recovery_factor_value: 0,
    max_drawdown: 0,
    max_drawdown_value: 0,
    consistency: 0,
    consistency_value: 0,
    zella_score: 0,
    ...cloneJson(seed && seed.zellaScore, {})
  });

  const createOnboardingPayload = () => ({
    answers: {},
    onboarded: true,
    preferences_saved: true,
    state: "onboarding",
    step: 0,
    video_watched: true
  });

  const createPerformancePayload = (seed) =>
    cloneJson(seed && seed.performance, []);

  const createCumulativePayload = (seed) => ({
    cumulative: [],
    drawdown: [],
    ...cloneJson(seed && seed.cumulative, {})
  });

  const createAccountBalanceDatumPayload = (seed) => ({
    result: [],
    balances: [],
    labels: [],
    ...cloneJson(seed && seed.accountBalanceDatum, {})
  });

  const createTradeCollectionPayload = (seed, key) => ({
    trades: [],
    item_count: 0,
    ...cloneJson(seed && seed[key], {})
  });

  const createTradesPresentPayload = (seed, searchParams) => ({
    trades_present: filterTrades(seed, searchParams).length > 0
  });

  const createAllTradesPayload = (seed, searchParams) => {
    const filteredTrades = sortTrades(filterTrades(seed, searchParams), searchParams);
    const page = paginateItems(filteredTrades, searchParams);

    return {
      trades: page.items,
      item_count: filteredTrades.length,
      page_count: page.pageCount,
      from: page.from,
      to: page.to
    };
  };

  const createTradeStatsPayload = (seed, searchParams) => {
    const filteredTrades = filterTrades(seed, searchParams);
    let gains = 0;
    let losses = 0;
    let volume = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    filteredTrades.forEach((trade) => {
      const pnl = Number(trade.net_profits || 0);
      volume += Math.abs(Number(trade.quantity || 0));
      if (pnl > 0) {
        gains += pnl;
        winningTrades += 1;
      } else if (pnl < 0) {
        losses += Math.abs(pnl);
        losingTrades += 1;
      }
    });

    return {
      gain: gains,
      loss: losses,
      total_net_profits: gains - losses,
      total_volume: volume,
      profit_factor: losses > 0 ? gains / losses : gains > 0 ? gains : 0,
      average_winning_trade: winningTrades > 0 ? gains / winningTrades : 0,
      average_losing_trade: losingTrades > 0 ? -losses / losingTrades : 0,
      total_trades: filteredTrades.length
    };
  };

  const createDayViewPayload = (seed, searchParams) => ({
    days: filterDays(seed, searchParams),
    page_count: 1
  });

  const createWeekTradesPayload = (seed, searchParams) => {
    const filteredTrades = sortTrades(filterTrades(seed, searchParams), searchParams);
    const page = paginateItems(filteredTrades, searchParams);

    return {
      trades: page.items,
      page_count: page.pageCount
    };
  };

  const createTradeDetailPayload = (seed, tradeId) => {
    const tradeDetails = cloneJson(seed && seed.tradeDetails, {});
    if (tradeDetails && tradeDetails[tradeId]) {
      return tradeDetails[tradeId];
    }

    const trade = getSeedTrades(seed).find((entry) => String(entry.id) === String(tradeId));
    return trade ? cloneJson(trade, {}) : cloneJson(getSeedTrades(seed)[0], {});
  };

  const createTradeRunningPlPayload = (seed, searchParams) => {
    const tradeId = getFilterValue(searchParams, "id") || getFilterValue(searchParams, "trade_id");
    const trade = createTradeDetailPayload(seed, tradeId);
    const performance = Array.isArray(trade && trade.performance) ? trade.performance : [];

    if (performance.length === 0) {
      return [];
    }

    return performance.map((point) => ({
      time: Math.floor(new Date(point.realized).getTime() / 1000),
      pl: Number(point.total_pl ?? point.net_profits ?? 0)
    }));
  };

  const createBalanceTransactionsPayload = (seed, searchParams) => {
    const accountId = getFilterValue(searchParams, "account_id") || DEFAULT_LOCAL_ACCOUNT.id;
    const account = getSeedAccounts(seed).find((entry) => entry.id === accountId)
      || getSeedAccounts(seed)[0]
      || DEFAULT_LOCAL_ACCOUNT;

    return {
      account_id: account.id,
      account_balance: Number(account.running_balance || 0),
      transactions: []
    };
  };

  const createInitialBalancePayload = (seed) => {
    const account = getSeedAccounts(seed)[0] || DEFAULT_LOCAL_ACCOUNT;
    return {
      initial_balance: Number(account.account_size || account.running_balance || 0)
    };
  };

  const createLastImportPayload = (seed) =>
    cloneJson(seed && seed.lastImport, null);

  const createAccountImportsPayload = (seed) => ({
    imports: [],
    meta: {
      pages: 1
    }
  });

  const createDailyNotePayload = (searchParams) => {
    const noteDate =
      normalizeDateValue(getFilterValue(searchParams, "note_date") || getFilterValue(searchParams, "noteDate"))
      || normalizeDateValue(getFilterValue(searchParams, "day"))
      || normalizeDateValue(new Date().toISOString());
    const timestamp = new Date().toISOString();

    return {
      id: "daily-note-" + noteDate,
      notebook_folder_id: "local-daily-notes",
      note_date: noteDate,
      title: noteDate,
      content: "",
      lexical_content: "",
      created_at: timestamp,
      updated_at: timestamp,
      folder_category: "daily_note"
    };
  };

  const createStartYourDayPayload = (searchParams) => ({
    day:
      normalizeDateValue(getFilterValue(searchParams, "day"))
      || normalizeDateValue(new Date().toISOString()),
    can_finish: false,
    can_show_assist: false,
    assist: {
      manually_closed: true,
      data: []
    }
  });

  const REPORT_METRIC_DEFINITIONS = {
    cumulative_pl: {
      pretty_name: "P&L - cumulative",
      data_type: "currency",
      group: "Performance"
    },
    cumulative_win_percentage: {
      pretty_name: "Win rate - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_total_closed_count: {
      pretty_name: "Total trades - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_profit_factor: {
      pretty_name: "Profit factor - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_trade_expectancy: {
      pretty_name: "Trade expectancy - cumulative",
      data_type: "currency",
      group: "Performance"
    },
    cumulative_bucketed_max_drawdown: {
      pretty_name: "Max drawdown - cumulative",
      data_type: "currency",
      group: "Risk"
    },
    cumulative_bucketed_avg_drawdown: {
      pretty_name: "Avg drawdown - cumulative",
      data_type: "currency",
      group: "Risk"
    },
    cumulative_longs_total_count: {
      pretty_name: "Long trades - cumulative",
      data_type: "number",
      group: "Performance"
    },
    cumulative_shorts_total_count: {
      pretty_name: "Short trades - cumulative",
      data_type: "number",
      group: "Performance"
    },
    total_pl: {
      pretty_name: "P&L",
      data_type: "currency",
      group: "Performance"
    },
    net_pnl: {
      pretty_name: "Net P&L",
      data_type: "currency",
      group: "Performance"
    },
    win_percentage: {
      pretty_name: "Win rate",
      data_type: "number",
      group: "Performance"
    },
    total_closed_count: {
      pretty_name: "Total trades",
      data_type: "number",
      group: "Performance"
    },
    profit_factor: {
      pretty_name: "Profit factor",
      data_type: "number",
      group: "Performance"
    },
    trade_expectancy: {
      pretty_name: "Trade expectancy",
      data_type: "currency",
      group: "Performance"
    },
    drawdown: {
      pretty_name: "Drawdown",
      data_type: "currency",
      group: "Risk"
    },
    max_drawdown: {
      pretty_name: "Max drawdown",
      data_type: "currency",
      group: "Risk"
    },
    average_win: {
      pretty_name: "Average win",
      data_type: "currency",
      group: "Performance"
    },
    average_loss: {
      pretty_name: "Average loss",
      data_type: "currency",
      group: "Performance"
    }
  };

  const getReportMetricDefinition = (metricKey) =>
    REPORT_METRIC_DEFINITIONS[metricKey] || {
      pretty_name: String(metricKey || "Metric")
        .replace(/^cumulative_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase()),
      data_type: "number",
      group: "Custom"
    };

  const getReportMetricValue = (row, metricKey) => {
    switch (metricKey) {
      case "cumulative_pl":
        return row.cumulativePl;
      case "cumulative_win_percentage":
        return row.cumulativeWinPercentage;
      case "cumulative_total_closed_count":
        return row.cumulativeTrades;
      case "cumulative_profit_factor":
        return row.cumulativeProfitFactor;
      case "cumulative_trade_expectancy":
        return row.cumulativeTradeExpectancy;
      case "cumulative_bucketed_max_drawdown":
        return row.maxDrawdown;
      case "cumulative_bucketed_avg_drawdown":
        return row.averageDrawdown;
      case "cumulative_longs_total_count":
        return row.cumulativeLongs;
      case "cumulative_shorts_total_count":
        return row.cumulativeShorts;
      case "total_pl":
      case "net_pnl":
        return row.net;
      case "win_percentage":
        return row.totalTrades > 0 ? (row.winners / row.totalTrades) * 100 : 0;
      case "total_closed_count":
        return row.totalTrades;
      case "profit_factor":
        return row.grossLosses > 0
          ? row.grossWins / row.grossLosses
          : row.grossWins > 0
            ? row.grossWins
            : 0;
      case "trade_expectancy":
        return row.totalTrades > 0 ? row.net / row.totalTrades : 0;
      case "drawdown":
      case "max_drawdown":
        return row.drawdown;
      case "average_win":
        return row.winners > 0 ? row.grossWins / row.winners : 0;
      case "average_loss":
        return row.losers > 0 ? -(row.grossLosses / row.losers) : 0;
      default:
        return row.net;
    }
  };

  const createNewReportsAvailablePayload = () =>
    Object.entries(REPORT_METRIC_DEFINITIONS).map(([name, definition]) => ({
      key: name,
      name,
      pretty_name: definition.pretty_name,
      data_type: definition.data_type,
      group: definition.group
    }));

  const createMonthlyReportRows = (seed, searchParams) => {
    const filteredTrades = filterTrades(seed, searchParams);
    const monthlyMap = new Map();

    filteredTrades.forEach((trade) => {
      const realizedDate = new Date(trade.realized || trade.created_at || Date.now());
      if (Number.isNaN(realizedDate.getTime())) {
        return;
      }

      const monthIndex = realizedDate.getUTCMonth();
      const year = realizedDate.getUTCFullYear();
      const key = year + "-" + String(monthIndex + 1).padStart(2, "0");
      const current = monthlyMap.get(key) || {
        key,
        year,
        monthIndex,
        monthValue: String(monthIndex + 1),
        monthTitle: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex],
        startDate: year + "-" + String(monthIndex + 1).padStart(2, "0") + "-01",
        net: 0,
        grossWins: 0,
        grossLosses: 0,
        totalTrades: 0,
        winners: 0,
        losers: 0,
        longs: 0,
        shorts: 0
      };
      const pnl = Number(trade.net_profits || 0);
      const normalizedSide = String(trade.side || "").toLowerCase();

      current.net += pnl;
      current.totalTrades += 1;
      if (normalizedSide.includes("long") || normalizedSide.includes("buy")) {
        current.longs += 1;
      } else if (normalizedSide.includes("short") || normalizedSide.includes("sell")) {
        current.shorts += 1;
      }
      if (pnl > 0) {
        current.grossWins += pnl;
        current.winners += 1;
      } else if (pnl < 0) {
        current.grossLosses += Math.abs(pnl);
        current.losers += 1;
      }

      monthlyMap.set(key, current);
    });

    return Array.from(monthlyMap.values()).sort((left, right) => left.key.localeCompare(right.key));
  };

  const createNewReportsPayload = (seed, searchParams) => {
    const metrics = getParamValues(searchParams, "metrics");
    const dimensions = getParamValues(searchParams, "dimensions");
    const timeBucket = getFilterValue(searchParams, "time_bucket") || "day";

    if (metrics.length === 0) {
      return {
        data: []
      };
    }

    if (dimensions.includes("month") && dimensions.includes("year")) {
      const rows = createMonthlyReportRows(seed, searchParams);
      return {
        data: metrics.flatMap((metricKey) => {
          const definition = getReportMetricDefinition(metricKey);
          return rows.map((row) => ({
            metadata: {
              metric_key: metricKey,
              metric_name: definition.pretty_name,
              pretty_name: definition.pretty_name,
              data_type: definition.data_type,
              dimensions_keys: ["month", "year"],
              dimensions: [row.monthValue, String(row.year)],
              dimensions_metadata: [
                {
                  title: row.monthTitle,
                  dimension: row.monthValue
                },
                {
                  title: String(row.year),
                  dimension: String(row.year)
                }
              ],
              supporting_data: []
            },
            data: [
              {
                date: row.startDate,
                metric: getReportMetricValue(
                  {
                    ...row,
                    cumulativePl: row.net,
                    cumulativeTrades: row.totalTrades,
                    cumulativeLongs: row.longs,
                    cumulativeShorts: row.shorts,
                    cumulativeWinPercentage: row.totalTrades > 0 ? (row.winners / row.totalTrades) * 100 : 0,
                    cumulativeProfitFactor:
                      row.grossLosses > 0
                        ? row.grossWins / row.grossLosses
                        : row.grossWins > 0
                          ? row.grossWins
                          : 0,
                    cumulativeTradeExpectancy: row.totalTrades > 0 ? row.net / row.totalTrades : 0,
                    drawdown: Math.min(0, row.net),
                    maxDrawdown: Math.min(0, row.net),
                    averageDrawdown: Math.min(0, row.net)
                  },
                  metricKey
                )
              }
            ]
          }));
        })
      };
    }

    const rows = buildSeedDailyRows(seed, searchParams);
    const groupedRows = timeBucket === "month"
      ? createMonthlyReportRows(seed, searchParams).map((row) => ({
          ...row,
          date: row.startDate,
          cumulativePl: row.net,
          cumulativeTrades: row.totalTrades,
          cumulativeLongs: row.longs,
          cumulativeShorts: row.shorts,
          cumulativeWinPercentage: row.totalTrades > 0 ? (row.winners / row.totalTrades) * 100 : 0,
          cumulativeProfitFactor:
            row.grossLosses > 0
              ? row.grossWins / row.grossLosses
              : row.grossWins > 0
                ? row.grossWins
                : 0,
          cumulativeTradeExpectancy: row.totalTrades > 0 ? row.net / row.totalTrades : 0,
          drawdown: Math.min(0, row.net),
          maxDrawdown: Math.min(0, row.net),
          averageDrawdown: Math.min(0, row.net)
        }))
      : rows;

    return {
      data: metrics.map((metricKey) => {
        const definition = getReportMetricDefinition(metricKey);
        return {
          metadata: {
            metric_key: metricKey,
            metric_name: definition.pretty_name,
            pretty_name: definition.pretty_name,
            data_type: definition.data_type,
            supporting_data: []
          },
          data: groupedRows.map((row) => ({
            date: row.date,
            metric: getReportMetricValue(row, metricKey)
          }))
        };
      })
    };
  };

  const createCalendarEventsPayload = (seed, searchParams) =>
    filterDays(seed, searchParams).map((day) => ({
      id: day.id,
      day: day.day,
      date: day.day,
      realized: day.realized,
      start: day.day,
      end: day.day,
      profits: Number(day && day.stats && day.stats.net_profits || 0),
      trades_count: Number(day && day.stats && day.stats.trades_count || 0),
      title: String(Number(day && day.stats && day.stats.net_profits || 0))
    }));

  const createMaxCalendarEventDatePayload = (seed, searchParams) => {
    const days = filterDays(seed, searchParams)
      .map((day) => normalizeDateValue(day.day || day.realized))
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));

    return days[0] || null;
  };

  const createMockResult = (input, method) => {
    const parsed = safeUrl(input);
    const path = parsed ? parsed.pathname : "";
    const normalizedPath = path.startsWith("/api/") ? path.slice(5) : path;
    const normalizedSegments = normalizedPath.split("/").filter(Boolean);
    const searchParams = parsed ? parsed.searchParams : new URLSearchParams();
    const seed = readBacktestSeed();
    const logType = getFilterValue(searchParams, "log_type");

    if (path.endsWith("/validate_token")) {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          data: MOCK_USER
        }
      };
    }

    if (normalizedPath === "account/current_timezone") {
      return {
        status: 200,
        statusText: "OK",
        payload: MOCK_USER.time_zone
      };
    }

    if (normalizedPath === "account/index" || normalizedPath === "trading_accounts") {
      return {
        status: 200,
        statusText: "OK",
        payload: getSeedAccounts(seed)
      };
    }

    if (normalizedPath === "trading_charts/indicators") {
      return {
        status: 200,
        statusText: "OK",
        payload: null
      };
    }

    if (normalizedPath === "trading_charts/layouts") {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (
      normalizedSegments[0] === "trading_charts" &&
      normalizedSegments[1] === "layouts" &&
      normalizedSegments.length === 3
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: null
      };
    }

    if (normalizedPath === "chart_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: {}
      };
    }

    if (normalizedPath === "account/imports") {
      return {
        status: 200,
        statusText: "OK",
        payload: createAccountImportsPayload(seed)
      };
    }

    if (normalizedPath === "account/max_calendar_event_date") {
      return {
        status: 200,
        statusText: "OK",
        payload: createMaxCalendarEventDatePayload(seed, searchParams)
      };
    }

    if (normalizedPath === "days/calendar_events") {
      return {
        status: 200,
        statusText: "OK",
        payload: createCalendarEventsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "new_reports/available") {
      return {
        status: 200,
        statusText: "OK",
        payload: createNewReportsAvailablePayload()
      };
    }

    if (normalizedPath === "new_reports/available_dimensions") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_AVAILABLE_REPORT_DIMENSIONS
      };
    }

    if (normalizedPath === "new_reports/differences") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          data: []
        }
      };
    }

    if (normalizedPath === "new_reports") {
      return {
        status: 200,
        statusText: "OK",
        payload: createNewReportsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "start_your_day") {
      return {
        status: 200,
        statusText: "OK",
        payload: createStartYourDayPayload(searchParams)
      };
    }

    if (
      normalizedPath === "notebook/folder_templates" ||
      normalizedPath.startsWith("notebook/folder_templates/")
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (normalizedPath === "notebook/daily_notes") {
      return {
        status: 200,
        statusText: "OK",
        payload: createDailyNotePayload(searchParams)
      };
    }

    if (normalizedPath === "trades/all_symbols") {
      return {
        status: 200,
        statusText: "OK",
        payload: Array.from(
          new Set(getSeedTrades(seed).map((trade) => String(trade.symbol || "")))
        ).filter(Boolean)
      };
    }

    if (normalizedPath === "trades/running_pl") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeRunningPlPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "trades/recent_trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeCollectionPayload(seed, "recentTrades")
      };
    }

    if (normalizedPath === "trades/present") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradesPresentPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "trades/all_trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createAllTradesPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "trades/last_import") {
      return {
        status: 200,
        statusText: "OK",
        payload: createLastImportPayload(seed)
      };
    }

    if (normalizedPath === "trades/" || normalizedPath === "trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createDayViewPayload(seed, searchParams)
      };
    }

    if (
      normalizedSegments[0] === "trades" &&
      normalizedSegments.length === 2 &&
      normalizedSegments[1] !== "all_trades" &&
      normalizedSegments[1] !== "recent_trades" &&
      normalizedSegments[1] !== "present" &&
      normalizedSegments[1] !== "last_import"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeDetailPayload(seed, normalizedSegments[1])
      };
    }

    if (normalizedPath === "journal_stats/trades") {
      return {
        status: 200,
        statusText: "OK",
        payload: createWeekTradesPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "filters/account_balance_datum") {
      return {
        status: 200,
        statusText: "OK",
        payload: createAccountBalanceDatumPayload(seed)
      };
    }

    if (normalizedPath === "filters/cumulative") {
      return {
        status: 200,
        statusText: "OK",
        payload: createCumulativePayload(seed)
      };
    }

    if (
      normalizedPath === "filters/dashboard_stats" ||
      normalizedPath === "filters/winrate"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: createDashboardStatsPayload(seed)
      };
    }

    if (normalizedPath === "filters/stats") {
      return {
        status: 200,
        statusText: "OK",
        payload: createStatsPayload(seed)
      };
    }

    if (normalizedPath === "filters/performance") {
      return {
        status: 200,
        statusText: "OK",
        payload: createPerformancePayload(seed)
      };
    }

    if (normalizedPath === "filters/trade_stats") {
      return {
        status: 200,
        statusText: "OK",
        payload: createTradeStatsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "zella_scores/current") {
      return {
        status: 200,
        statusText: "OK",
        payload: createZellaScorePayload(seed)
      };
    }

    if (normalizedPath === "user/get_onboarding") {
      return {
        status: 200,
        statusText: "OK",
        payload: createOnboardingPayload()
      };
    }

    if (normalizedPath === "user/profile") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          ...MOCK_USER,
          updateProfile: false
        }
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "daily_journal_log_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "backtesting_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "backtesting_grid_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "backtesting_view_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_BACKTESTING_VIEW_SETTINGS
      };
    }

    if (
      normalizedPath === "user/get_logs_setting" &&
      logType === "session_custom_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_SESSION_CUSTOM_SETTINGS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "daily_journal_log_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "backtesting_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_DAY_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "backtesting_grid_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (
      normalizedPath === "user/set_logs_setting" &&
      logType === "backtesting_view_settings"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_BACKTESTING_VIEW_SETTINGS
      };
    }

    if (normalizedPath === "user/get_trade_log_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (normalizedPath === "user/set_trade_log_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_VIEW_COLUMNS
      };
    }

    if (normalizedPath === "user/get_trade_details_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_DETAILS_SETTINGS
      };
    }

    if (normalizedPath === "user/set_trade_details_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_TRADE_DETAILS_SETTINGS
      };
    }

    if (normalizedPath === "user/set_session_custom_settings") {
      return {
        status: 200,
        statusText: "OK",
        payload: DEFAULT_SESSION_CUSTOM_SETTINGS
      };
    }

    if (normalizedPath === "assist/day_start") {
      return {
        status: 200,
        statusText: "OK",
        payload: Boolean(seed && seed.days && seed.days.days && seed.days.days.length)
      };
    }

    if (normalizedPath === "balance_transactions") {
      return {
        status: 200,
        statusText: "OK",
        payload: createBalanceTransactionsPayload(seed, searchParams)
      };
    }

    if (normalizedPath === "balance_transactions/delete_all") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          success: true
        }
      };
    }

    if (
      normalizedPath === "account/check_initial_balance" ||
      normalizedPath === "/account/check_initial_balance"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: createInitialBalancePayload(seed)
      };
    }

    if (
      normalizedPath === "tag_categories" ||
      normalizedPath === "loading_states" ||
      normalizedPath === "insights" ||
      normalizedPath === "account/all_tags" ||
      normalizedPath === "import_progresses"
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (normalizedPath === "account/delete") {
      return {
        status: 403,
        statusText: "Forbidden",
        payload: {
          message: "Local account cannot be deleted"
        }
      };
    }

    if (
      normalizedPath === "dashboard_templates" ||
      path.includes("/dashboard-layout") ||
      path.includes("/dashboard_layout") ||
      normalizedPath.includes("template")
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          templates: [],
          selected_template: DEFAULT_DASHBOARD_TEMPLATE,
          top_widgets: DEFAULT_DASHBOARD_TEMPLATE.top_widgets,
          bottom_widgets: DEFAULT_DASHBOARD_TEMPLATE.bottom_widgets
        }
      };
    }

    if (path.includes("/notification")) {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          count: 0,
          data: []
        }
      };
    }

    if (
      path.includes("/sessions") ||
      path.includes("/accounts") ||
      path.includes("/playbooks") ||
      path.includes("/strategy") ||
      path.includes("/tags") ||
      path.includes("/brokers") ||
      path.includes("/folders")
    ) {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (method !== "GET") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          id: "copytrade-local-record",
          success: true
        }
      };
    }

    return {
      status: 200,
      statusText: "OK",
      payload: cloneDefaultDashboardResponse()
    };
  };

  const createMarketDataMockResult = (input, method) => {
    const parsed = safeUrl(input);
    const normalizedPath = parsed ? parsed.pathname.replace(/^\\/+/, "") : "";

    if (normalizedPath === "finhub/calendar/economic") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          economicCalendar: []
        }
      };
    }

    if (normalizedPath === "finhub/country") {
      return {
        status: 200,
        statusText: "OK",
        payload: []
      };
    }

    if (method !== "GET") {
      return {
        status: 200,
        statusText: "OK",
        payload: {
          success: true
        }
      };
    }

    return {
      status: 200,
      statusText: "OK",
      payload: {}
    };
  };

  const createMockResponse = (input, method) => {
    const mockResult = isMarketDataProxyRequest(input)
      ? createMarketDataMockResult(input, method)
      : createMockResult(input, method);
    const headers = {
      "content-type": "application/json; charset=utf-8",
      ...AUTH_HEADERS
    };

    return {
      status: mockResult.status,
      statusText: mockResult.statusText,
      headers,
      responseText: JSON.stringify(mockResult.payload)
    };
  };

  const applyLocalAccountUiGuards = () => {
    document
      .querySelectorAll("button, a, li, [role='menuitem']")
      .forEach((node) => {
        const text = String(node.textContent || "").replace(/\\s+/g, " ").trim();
        if (text === "Delete account") {
          node.setAttribute("aria-disabled", "true");
          node.setAttribute("disabled", "true");
          if (node.style) {
            node.style.display = "none";
            node.style.pointerEvents = "none";
          }
        }
      });

    const bodyText = String((document.body && document.body.textContent) || "");
    if (bodyText.includes("Delete account?")) {
      document.querySelectorAll("button").forEach((button) => {
        const text = String(button.textContent || "").replace(/\\s+/g, " ").trim();
        if (text === "Delete") {
          button.setAttribute("disabled", "true");
          button.style.pointerEvents = "none";
          button.style.opacity = "0.5";
        }
      });
    }
  };

  const enforceEmbeddedRoute = () => {
    if (window.location.pathname.startsWith("/auth/")) {
      nativeReplaceState(history.state, "", lastEmbeddedPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    const normalized = normalizeEmbeddedPath(window.location.href);
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (normalized && normalized !== current) {
      nativeReplaceState(history.state, "", normalized);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  lastEmbeddedPath = normalizeEmbeddedPath(window.location.href) || lastEmbeddedPath;
  persistAuthHeaders();
  enforceEmbeddedRoute();
  applyLocalAccountUiGuards();

  if (
    window.CanvasRenderingContext2D &&
    CanvasRenderingContext2D.prototype &&
    !CanvasRenderingContext2D.prototype.__copytradeDrawImageGuard
  ) {
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;

    CanvasRenderingContext2D.prototype.drawImage = function guardedDrawImage(...args) {
      const image = args[0];
      const isBrokenHtmlImage =
        typeof HTMLImageElement !== "undefined" &&
        image instanceof HTMLImageElement &&
        image.complete &&
        image.naturalWidth === 0;
      const isBrokenBitmap =
        typeof ImageBitmap !== "undefined" &&
        image instanceof ImageBitmap &&
        (image.width === 0 || image.height === 0);

      if (isBrokenHtmlImage || isBrokenBitmap) {
        return;
      }

      try {
        return nativeDrawImage.apply(this, args);
      } catch (error) {
        const message = String((error && error.message) || error || "");
        if (message.includes("broken state")) {
          return;
        }
        throw error;
      }
    };

    CanvasRenderingContext2D.prototype.__copytradeDrawImageGuard = true;
  }

  history.pushState = function pushState(state, unused, url) {
    if (url && isAuthRoute(url)) {
      return nativePushState(state, unused, lastEmbeddedPath);
    }
    if (url) {
      rememberEmbeddedPath(url);
    }
    return nativePushState(state, unused, normalizeEmbeddedPath(url) || url);
  };

  history.replaceState = function replaceState(state, unused, url) {
    if (url && isAuthRoute(url)) {
      return nativeReplaceState(state, unused, lastEmbeddedPath);
    }
    if (url) {
      rememberEmbeddedPath(url);
    }
    return nativeReplaceState(state, unused, normalizeEmbeddedPath(url) || url);
  };

  if (nativeFetch) {
    window.fetch = (input, init) => {
      const requestUrl =
        typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const method = (init && init.method) || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET";

      if (isTradezellaApiRequest(requestUrl) || isMarketDataProxyRequest(requestUrl)) {
        persistAuthHeaders();
        const mockResponse = createMockResponse(requestUrl, method.toUpperCase());
        return Promise.resolve(
          new Response(mockResponse.responseText, {
            status: mockResponse.status,
            statusText: mockResponse.statusText,
            headers: mockResponse.headers
          })
        );
      }

      return nativeFetch(input, init);
    };
  }

  class EmbeddedCopytradeXHR {
    constructor() {
      this._xhr = new NativeXHR();
      this._listeners = new Map();
      this._requestHeaders = {};
      this._method = "GET";
      this._url = "";
      this._mockResponse = null;
      this._shortCircuit = false;
      this._readyState = 0;
      this.onreadystatechange = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
      this.onabort = null;
      this.ontimeout = null;
      this.onprogress = null;
      this.upload = this._xhr.upload;

      LISTENER_EVENTS.forEach((type) => {
        this._xhr.addEventListener(type, (event) => {
          this._emit(type, event);
        });
      });
    }

    _emit(type, event) {
      const handler = this["on" + type];
      if (typeof handler === "function") {
        handler.call(this, event);
      }

      const listeners = this._listeners.get(type);
      if (!listeners) {
        return;
      }

      listeners.forEach((listener) => {
        listener.call(this, event);
      });
    }

    _setMockResponse(mockResponse) {
      this._mockResponse = {
        ...mockResponse,
        headerLookup: Object.fromEntries(
          Object.entries(mockResponse.headers).map(([key, value]) => [
            key.toLowerCase(),
            String(value)
          ])
        )
      };
      this._readyState = 4;
    }

    addEventListener(type, listener) {
      const listeners = this._listeners.get(type) || new Set();
      listeners.add(listener);
      this._listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      const listeners = this._listeners.get(type);
      if (!listeners) {
        return;
      }

      listeners.delete(listener);
    }

    open(method, url, async, user, password) {
      persistAuthHeaders();
      this._method = String(method || "GET").toUpperCase();
      this._url = String(url);
      this._mockResponse = null;
      this._shortCircuit =
        isTradezellaApiRequest(this._url) || isMarketDataProxyRequest(this._url);

      if (this._shortCircuit) {
        this._readyState = 1;
        this._emit("readystatechange", new Event("readystatechange"));
        return;
      }

      this._xhr.open(method, url, async, user, password);
    }

    send(body) {
      if (this._shortCircuit) {
        this._setMockResponse(createMockResponse(this._url, this._method));
        window.setTimeout(() => {
          this._emit("readystatechange", new Event("readystatechange"));
          this._emit("load", new Event("load"));
          this._emit("loadend", new Event("loadend"));
        }, 0);
        return;
      }

      this._xhr.send(body);
    }

    abort() {
      if (this._shortCircuit) {
        this._emit("abort", new Event("abort"));
        this._emit("loadend", new Event("loadend"));
        return;
      }

      this._xhr.abort();
    }

    setRequestHeader(name, value) {
      if (this._shortCircuit) {
        this._requestHeaders[String(name).toLowerCase()] = String(value);
        return;
      }

      this._xhr.setRequestHeader(name, value);
    }

    getAllResponseHeaders() {
      if (this._mockResponse) {
        return Object.entries(this._mockResponse.headers)
          .map(([key, value]) => key + ": " + value)
          .join("\\r\\n");
      }

      return this._xhr.getAllResponseHeaders();
    }

    getResponseHeader(name) {
      if (this._mockResponse) {
        return this._mockResponse.headerLookup[String(name).toLowerCase()] || null;
      }

      return this._xhr.getResponseHeader(name);
    }

    overrideMimeType(value) {
      if (this._shortCircuit) {
        this._overrideMimeType = value;
        return;
      }

      this._xhr.overrideMimeType(value);
    }

    get readyState() {
      return this._mockResponse ? this._readyState : this._xhr.readyState;
    }

    get status() {
      return this._mockResponse ? this._mockResponse.status : this._xhr.status;
    }

    get statusText() {
      return this._mockResponse ? this._mockResponse.statusText : this._xhr.statusText;
    }

    get responseText() {
      return this._mockResponse ? this._mockResponse.responseText : this._xhr.responseText;
    }

    get response() {
      return this._mockResponse ? this._mockResponse.responseText : this._xhr.response;
    }

    get responseURL() {
      return this._mockResponse ? this._url : this._xhr.responseURL;
    }

    get responseXML() {
      return this._mockResponse ? null : this._xhr.responseXML;
    }

    get responseType() {
      return this._xhr.responseType;
    }

    set responseType(value) {
      this._xhr.responseType = value;
    }

    get timeout() {
      return this._xhr.timeout;
    }

    set timeout(value) {
      this._xhr.timeout = value;
    }

    get withCredentials() {
      return this._xhr.withCredentials;
    }

    set withCredentials(value) {
      this._xhr.withCredentials = value;
    }
  }

  EmbeddedCopytradeXHR.UNSENT = 0;
  EmbeddedCopytradeXHR.OPENED = 1;
  EmbeddedCopytradeXHR.HEADERS_RECEIVED = 2;
  EmbeddedCopytradeXHR.LOADING = 3;
  EmbeddedCopytradeXHR.DONE = 4;

  window.XMLHttpRequest = EmbeddedCopytradeXHR;

  new MutationObserver(() => {
    persistAuthHeaders();
    enforceEmbeddedRoute();
    applyLocalAccountUiGuards();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
`;

export function createCopytradeDashboardResponse() {
  const html = `<!DOCTYPE html>
<html lang="en" style="height:100%">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Copy Trade Dashboard</title>
    <link rel="stylesheet" href="/copytrade/dashboard.css" />
    <style>${injectedCss}</style>
  </head>
  <body>
    <div id="root" style="height:100%"></div>
    <script>${injectedScript}</script>
    <script src="/copytrade/dashboard.js" defer></script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}
