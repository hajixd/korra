export type AssistantGraphFamily =
  | "equity_curve"
  | "pnl_distribution"
  | "session_performance"
  | "trade_outcomes"
  | "price_action"
  | "action_timeline";

export type AssistantGraphTemplateDef = {
  id: string;
  title: string;
  family: AssistantGraphFamily;
  description: string;
};

export const GRAPH_TEMPLATE_DEFS: AssistantGraphTemplateDef[] = [
  { id: "equity_curve", title: "Equity Curve", family: "equity_curve", description: "Cumulative PnL over trade sequence." },
  { id: "net_pnl_curve", title: "Net PnL Curve", family: "equity_curve", description: "Net cumulative PnL." },
  { id: "gross_pnl_curve", title: "Gross PnL Curve", family: "equity_curve", description: "Gross PnL progression." },
  { id: "drawdown_curve", title: "Drawdown Curve", family: "equity_curve", description: "Peak-to-trough drawdown trend." },
  { id: "rolling_drawdown", title: "Rolling Drawdown", family: "equity_curve", description: "Windowed drawdown profile." },
  { id: "underwater_curve", title: "Underwater Curve", family: "equity_curve", description: "Distance below equity highs." },
  { id: "rolling_win_rate", title: "Rolling Win Rate", family: "equity_curve", description: "Win-rate over rolling trades." },
  { id: "rolling_loss_rate", title: "Rolling Loss Rate", family: "equity_curve", description: "Loss-rate over rolling trades." },
  { id: "rolling_expectancy", title: "Rolling Expectancy", family: "equity_curve", description: "Expected value over rolling trades." },
  { id: "rolling_sharpe_proxy", title: "Rolling Sharpe Proxy", family: "equity_curve", description: "Signal/noise proxy by window." },

  { id: "trade_outcomes", title: "Trade Outcomes", family: "trade_outcomes", description: "Wins vs losses split." },
  { id: "win_loss_ratio", title: "Win Loss Ratio", family: "trade_outcomes", description: "Win and loss proportion." },
  { id: "long_short_split", title: "Long Short Split", family: "trade_outcomes", description: "Long vs short trade count." },
  { id: "long_short_pnl", title: "Long Short PnL", family: "trade_outcomes", description: "PnL by side." },
  { id: "entry_source_mix", title: "Entry Source Mix", family: "trade_outcomes", description: "Source distribution by count." },
  { id: "entry_source_pnl", title: "Entry Source PnL", family: "trade_outcomes", description: "Source distribution by profitability." },
  { id: "model_performance", title: "Model Performance", family: "trade_outcomes", description: "Performance by model/source." },
  { id: "model_win_rate", title: "Model Win Rate", family: "trade_outcomes", description: "Win-rate by model/source." },
  { id: "model_trade_count", title: "Model Trade Count", family: "trade_outcomes", description: "Trade count by model/source." },
  { id: "streaks_win_loss", title: "Win Loss Streaks", family: "trade_outcomes", description: "Sequence streak tendency." },

  { id: "pnl_distribution", title: "PnL Distribution", family: "pnl_distribution", description: "Histogram of trade PnL." },
  { id: "pnl_boxplot_proxy", title: "PnL Boxplot Proxy", family: "pnl_distribution", description: "Approximate quartile spread." },
  { id: "risk_reward_scatter", title: "Risk Reward Scatter", family: "pnl_distribution", description: "Risk/reward relationship." },
  { id: "pnl_vs_duration", title: "PnL vs Duration", family: "pnl_distribution", description: "PnL against hold time." },
  { id: "stop_distance_distribution", title: "Stop Distance Distribution", family: "pnl_distribution", description: "Stop distance profile." },
  { id: "target_distance_distribution", title: "Target Distance Distribution", family: "pnl_distribution", description: "Target distance profile." },
  { id: "hold_time_distribution", title: "Hold Time Distribution", family: "pnl_distribution", description: "Distribution of trade duration." },
  { id: "confidence_distribution", title: "Confidence Distribution", family: "pnl_distribution", description: "Confidence score frequency." },
  { id: "confidence_vs_pnl", title: "Confidence vs PnL", family: "pnl_distribution", description: "Confidence/PnL relationship." },
  { id: "candle_body_distribution", title: "Candle Body Distribution", family: "pnl_distribution", description: "Body-size distribution." },

  { id: "session_performance", title: "Session Performance", family: "session_performance", description: "PnL and hit-rate by session." },
  { id: "session_win_rate", title: "Session Win Rate", family: "session_performance", description: "Win-rate by session." },
  { id: "session_avg_pnl", title: "Session Average PnL", family: "session_performance", description: "Average PnL by session." },
  { id: "weekday_performance", title: "Weekday Performance", family: "session_performance", description: "PnL by weekday." },
  { id: "weekday_win_rate", title: "Weekday Win Rate", family: "session_performance", description: "Win-rate by weekday." },
  { id: "hourly_performance", title: "Hourly Performance", family: "session_performance", description: "PnL by hour of day." },
  { id: "hourly_win_rate", title: "Hourly Win Rate", family: "session_performance", description: "Win-rate by hour." },
  { id: "monthly_pnl_bar", title: "Monthly PnL", family: "session_performance", description: "PnL by month." },
  { id: "monthly_avg_close", title: "Monthly Average Close", family: "session_performance", description: "Average close price per month." },
  { id: "monthly_avg_range", title: "Monthly Average Range", family: "session_performance", description: "Average range per month." },

  { id: "price_action", title: "Price Action", family: "price_action", description: "Close/high/low structure." },
  { id: "close_with_range", title: "Close With Range", family: "price_action", description: "Close with volatility envelope." },
  { id: "volatility_curve", title: "Volatility Curve", family: "price_action", description: "Volatility over time." },
  { id: "atr_proxy", title: "ATR Proxy", family: "price_action", description: "Range-based ATR proxy." },
  { id: "cumulative_volume", title: "Cumulative Volume", family: "price_action", description: "Running volume progression." },
  { id: "price_vs_volume", title: "Price vs Volume", family: "price_action", description: "Price and volume relation." },
  { id: "equity_vs_price", title: "Equity vs Price", family: "price_action", description: "Strategy equity against market price." },
  { id: "monthly_volume", title: "Monthly Volume", family: "price_action", description: "Volume aggregated by month." },
  { id: "range_expansion", title: "Range Expansion", family: "price_action", description: "High-low expansion over time." },
  { id: "close_change_curve", title: "Close Change Curve", family: "price_action", description: "Close-to-close change trend." },

  { id: "action_timeline", title: "Action Timeline", family: "action_timeline", description: "Action frequency timeline." },
  { id: "action_type_frequency", title: "Action Type Frequency", family: "action_timeline", description: "Count by action label." },
  { id: "order_lifecycle", title: "Order Lifecycle", family: "action_timeline", description: "Lifecycle event counts." },
  { id: "execution_activity", title: "Execution Activity", family: "action_timeline", description: "Execution activity profile." },
  { id: "alerts_activity", title: "Alerts Activity", family: "action_timeline", description: "Alert/action activity profile." },
  { id: "event_density", title: "Event Density", family: "action_timeline", description: "Event density over action categories." }
];

export const GRAPH_TEMPLATE_ID_SET = new Set(GRAPH_TEMPLATE_DEFS.map((template) => template.id));

export const listGraphTemplatesForPrompt = (): string =>
  GRAPH_TEMPLATE_DEFS.map((template) => `${template.id}: ${template.description}`).join("\n");

export const resolveGraphTemplate = (rawId: string | null | undefined): AssistantGraphTemplateDef => {
  const normalized = String(rawId ?? "").trim().toLowerCase();
  const found = GRAPH_TEMPLATE_DEFS.find((template) => template.id.toLowerCase() === normalized);
  if (found) {
    return found;
  }

  return GRAPH_TEMPLATE_DEFS[0]!;
};
