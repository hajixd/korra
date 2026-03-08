export const COPYTRADE_BACKTEST_STATE_KEY = "korra-copytrade-dashboard-state";
export const DEFAULT_COPYTRADE_DASHBOARD_TEMPLATE = {
  top_widgets: ["net_pl", "win_percentage_by_trades", "profit_factor"],
  bottom_widgets: ["zella_score", "daily_net_cumulative_graph", "net_daily_pl_graph", "calendar_widget"]
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
  page_count?: number;
  from?: number;
  to?: number;
};

export type CopytradeTradePerformancePoint = {
  trade_public_uid: string;
  realized: string;
  time_zone: string;
  symbol: string;
  net_profits: number;
  roi: number;
  total_pl?: number;
};

export type CopytradeTradeExecution = {
  id: string;
  execution_id: string;
  action: string;
  side: string;
  symbol: string;
  quantity: number;
  adjusted: number;
  price: number;
  commission: number;
  fee: number;
  profits: number;
  current_position: number;
  strike: number;
  realized: string;
  created_at: string;
};

export type CopytradeTradeDetail = CopytradeTradeRow & {
  public_uid: string;
  trade_public_uid: string;
  account_id: string;
  account_name: string;
  side: string;
  avg_buy_price: number;
  avg_sell_price: number;
  adjusted_cost: number;
  adjusted_proceeds: number;
  calculated_fees: number;
  commission: number;
  entry_price: number;
  entry_price_in_currency: number;
  exit_price: number;
  exit_price_in_currency: number;
  fee: number;
  fees: number;
  hold_time: number;
  in_trade_price_range: number;
  initial_target: number;
  highest_price: number;
  lowest_price: number;
  maximum_profits: number | null;
  minimum_profits: number | null;
  price_mae: number;
  price_mfe: number;
  profit_target: number;
  profits: number;
  rating: number;
  reward_ratio: number;
  stop_loss: number;
  strike: number;
  trade_risk: number;
  zella_score: number;
  reviewed: boolean;
  tags: string[];
  playbooks: unknown[];
  category_tags: Record<string, string[]>;
  tags_categories_list: Record<string, unknown>;
  transactions: CopytradeTradeExecution[];
  performance: CopytradeTradePerformancePoint[];
  notebook_folder_id: string | null;
  has_note: boolean;
};

export type CopytradeAllTradesPayload = {
  trades: CopytradeTradeDetail[];
  item_count: number;
  page_count: number;
  from: number;
  to: number;
};

export type CopytradeDayStatsPayload = {
  trades_count: number;
  winners: number;
  losers: number;
  break_evens: number;
  volume: number;
  profits: number;
  net_profits: number;
  fees: number;
  roi_positive: number;
  roi_negative: number;
  profit_factor: number;
};

export type CopytradeDayPayload = {
  id: string;
  day: string;
  realized: string;
  show_day: boolean;
  closed: boolean;
  trades_loaded: boolean;
  time_zone: string;
  daily_note: null;
  stats: CopytradeDayStatsPayload;
  performance: CopytradeTradePerformancePoint[];
  trades: CopytradeTradeDetail[];
};

export type CopytradeDaysPayload = {
  days: CopytradeDayPayload[];
  page_count: number;
};

export type CopytradeTradeStatsPayload = {
  gain: number;
  loss: number;
  total_net_profits: number;
  total_volume: number;
  profit_factor: number;
  average_winning_trade: number;
  average_losing_trade: number;
  total_trades: number;
};

export type CopytradeAccountPayload = {
  id: string;
  name: string;
  account_type: string;
  archived: boolean;
  active: boolean;
  backtesting: boolean;
  trades_editable: boolean;
  read_only: boolean;
  count: number;
  running_balance: number;
  import_type: string;
  broker: string | null;
  external_account_id: string | null;
  external_account_failed: boolean;
  clear_in_progress: boolean;
  sync_disconnected: boolean;
  disabled: boolean;
  failed: boolean;
  can_resync: boolean;
  next_manual_resync_time: string | null;
  next_sync_time: string | null;
  last_sync_time: string | null;
  has_trades: boolean;
  has_performance_report: boolean;
  profit_calculation_method: string;
  shared: boolean;
  primary: boolean;
  color: string;
  [key: string]: unknown;
};

export type CopytradeLastImportPayload = {
  is_sync: boolean;
  updated_at: string;
  last_sync_time: string;
  [key: string]: unknown;
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
  allTrades: CopytradeAllTradesPayload;
  tradeStats: CopytradeTradeStatsPayload;
  days: CopytradeDaysPayload;
  tradeDetails: Record<string, CopytradeTradeDetail>;
  accounts: CopytradeAccountPayload[];
  lastImport: CopytradeLastImportPayload | null;
};
