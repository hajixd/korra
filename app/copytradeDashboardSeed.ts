export const COPYTRADE_BACKTEST_STATE_KEY = "korra-copytrade-dashboard-state";
export const DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE = {
  top_widgets: ["net_pl", "win_percentage_by_trades", "profit_factor"],
  bottom_widgets: [
    "zella_score",
    "daily_net_cumulative_graph",
    "net_daily_pl_graph",
    "open_position"
  ]
} satisfies CopytradeDashboardTemplate;

export type CopytradeDashboardTemplate = {
  top_widgets: string[];
  bottom_widgets: string[];
};

export type CopytradeDashboardStatsPayload = {
  data: unknown[];
  items: unknown[];
  results: unknown[];
  templates: unknown[];
  selected_template: CopytradeDashboardTemplate;
  top_widgets: string[];
  bottom_widgets: string[];
  count: number;
  page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
  winners: number;
  losers: number;
  break_evens: number;
  total_gain_loss: number;
  trade_count: number;
  trade_expectancy: number;
  profit_factor: number;
  winning_trades_sum: number;
  losing_trades_sum: number;
  average_daily_volume: number;
  average_winning_trade: number;
  average_losing_trade: number;
  total_commissions: number;
  max_wins: number;
  max_losses: number;
  winning_days: number;
  losing_days: number;
  breakeven_days: number;
  winning_trades_count: number;
  losing_trades_count: number;
  breakeven_trades_count: number;
  day_streaks: {
    current_winning: number;
    current_losing: number;
    winning: number;
    losing: number;
  };
  trade_streaks: {
    current_winning_streak: number;
    current_losing_streak: number;
    max_wins: number;
    max_losses: number;
  };
  max_drawdown: {
    drawdown: number;
    percent: number;
  };
  average_drawdown: {
    drawdown: number;
    percent: number;
  };
  current_drawdown: {
    drawdown: number;
    percent: number;
  };
};

export type CopytradeStatsPayload = {
  winners: number;
  losers: number;
  break_evens: number;
  volume: number;
  gross_pl: number;
  net_pl: number;
  profit_factor: number;
  total_commissions: number;
  trade_count: number;
};

export type CopytradeZellaScorePayload = {
  win_rate: number;
  win_rate_value: number;
  profit_factor: number;
  profit_factor_value: number;
  avg_win_to_loss: number;
  avg_win_to_loss_value: number;
  recovery_factor: number;
  recovery_factor_value: number;
  max_drawdown: number;
  max_drawdown_value: number;
  consistency: number;
  consistency_value: number;
  zella_score: number;
};

export type CopytradePerformanceRow = {
  date: string;
  profits: number;
};

export type CopytradeSeriesPoint = Record<string, number>;

export type CopytradeCumulativePayload = {
  cumulative: CopytradeSeriesPoint[];
  drawdown: CopytradeSeriesPoint[];
};

export type CopytradeAccountBalanceDatumPayload = {
  result: CopytradeSeriesPoint[];
  balances: CopytradeSeriesPoint[];
  labels: string[];
};

export type CopytradeTradeRow = {
  id: string;
  open_date: string;
  created_at: string;
  realized: string;
  status: string;
  symbol: string;
  quantity: number;
  net_profits: number;
  net_roi: number;
  ticks_value: number;
  pips: number;
  points: number;
  realized_rr: number;
};

export type CopytradeTradeCollectionPayload = {
  trades: CopytradeTradeRow[];
  item_count: number;
};

export type CopytradeDashboardSeed = {
  updatedAt: string;
  dashboardStats: CopytradeDashboardStatsPayload;
  stats: CopytradeStatsPayload;
  zellaScore: CopytradeZellaScorePayload;
  performance: CopytradePerformanceRow[];
  cumulative: CopytradeCumulativePayload;
  accountBalanceDatum: CopytradeAccountBalanceDatumPayload;
  recentTrades: CopytradeTradeCollectionPayload;
  openPositions: CopytradeTradeCollectionPayload;
};
