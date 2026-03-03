export type AssistantGraphFamily =
  | "equity_curve"
  | "pnl_distribution"
  | "session_performance"
  | "trade_outcomes"
  | "price_action"
  | "action_timeline";

export type AssistantGraphMode = "static" | "dynamic";

export type AssistantGraphTemplateDef = {
  id: string;
  title: string;
  family: AssistantGraphFamily;
  mode: AssistantGraphMode;
  description: string;
};

type TemplateSeed = Omit<AssistantGraphTemplateDef, "mode"> & { mode?: AssistantGraphMode };

const makeSeed = (
  id: string,
  title: string,
  family: AssistantGraphFamily,
  description: string,
  mode: AssistantGraphMode = "static"
): TemplateSeed => ({ id, title, family, description, mode });

const CORE_TEMPLATE_DEFS: TemplateSeed[] = [
  makeSeed("equity_curve", "Equity Curve", "equity_curve", "Cumulative PnL over trade sequence."),
  makeSeed("net_pnl_curve", "Net PnL Curve", "equity_curve", "Net cumulative PnL."),
  makeSeed("gross_pnl_curve", "Gross PnL Curve", "equity_curve", "Gross PnL progression."),
  makeSeed("drawdown_curve", "Drawdown Curve", "equity_curve", "Peak-to-trough drawdown trend."),
  makeSeed("rolling_drawdown", "Rolling Drawdown", "equity_curve", "Windowed drawdown profile."),
  makeSeed("underwater_curve", "Underwater Curve", "equity_curve", "Distance below equity highs."),
  makeSeed("rolling_win_rate", "Rolling Win Rate", "equity_curve", "Win-rate over rolling trades."),
  makeSeed("rolling_expectancy", "Rolling Expectancy", "equity_curve", "Expected value over rolling trades."),

  makeSeed("trade_outcomes", "Trade Outcomes", "trade_outcomes", "Wins vs losses split."),
  makeSeed("win_loss_ratio", "Win Loss Ratio", "trade_outcomes", "Win and loss proportion."),
  makeSeed("long_short_split", "Long Short Split", "trade_outcomes", "Long vs short trade count."),
  makeSeed("long_short_pnl", "Long Short PnL", "trade_outcomes", "PnL by side."),
  makeSeed("entry_source_mix", "Entry Source Mix", "trade_outcomes", "Source distribution by count."),
  makeSeed("entry_source_pnl", "Entry Source PnL", "trade_outcomes", "Source distribution by profitability."),
  makeSeed("model_performance", "Model Performance", "trade_outcomes", "Performance by model/source."),

  makeSeed("pnl_distribution", "PnL Distribution", "pnl_distribution", "Histogram of trade PnL."),
  makeSeed("pnl_boxplot_proxy", "PnL Boxplot Proxy", "pnl_distribution", "Approximate quartile spread."),
  makeSeed("risk_reward_scatter", "Risk Reward Scatter", "pnl_distribution", "Risk/reward relationship."),
  makeSeed("pnl_vs_duration", "PnL vs Duration", "pnl_distribution", "PnL against hold time."),
  makeSeed("hold_time_distribution", "Hold Time Distribution", "pnl_distribution", "Distribution of trade duration."),
  makeSeed("confidence_distribution", "Confidence Distribution", "pnl_distribution", "Confidence score frequency."),
  makeSeed("confidence_vs_pnl", "Confidence vs PnL", "pnl_distribution", "Confidence/PnL relationship."),

  makeSeed("session_performance", "Session Performance", "session_performance", "PnL and hit-rate by session."),
  makeSeed("session_win_rate", "Session Win Rate", "session_performance", "Win-rate by session."),
  makeSeed("session_avg_pnl", "Session Average PnL", "session_performance", "Average PnL by session."),
  makeSeed("weekday_performance", "Weekday Performance", "session_performance", "PnL by weekday."),
  makeSeed("weekday_win_rate", "Weekday Win Rate", "session_performance", "Win-rate by weekday."),
  makeSeed("hourly_performance", "Hourly Performance", "session_performance", "PnL by hour of day."),
  makeSeed("hourly_win_rate", "Hourly Win Rate", "session_performance", "Win-rate by hour."),
  makeSeed("monthly_pnl_bar", "Monthly PnL", "session_performance", "PnL by month."),
  makeSeed("monthly_avg_close", "Monthly Average Close", "session_performance", "Average close price per month."),
  makeSeed("monthly_avg_range", "Monthly Average Range", "session_performance", "Average range per month."),

  makeSeed("price_action", "Price Action", "price_action", "Close/high/low structure."),
  makeSeed("close_with_range", "Close With Range", "price_action", "Close with volatility envelope."),
  makeSeed("volatility_curve", "Volatility Curve", "price_action", "Volatility over time."),
  makeSeed("atr_proxy", "ATR Proxy", "price_action", "Range-based ATR proxy."),
  makeSeed("cumulative_volume", "Cumulative Volume", "price_action", "Running volume progression."),
  makeSeed("price_vs_volume", "Price vs Volume", "price_action", "Price and volume relation."),
  makeSeed("equity_vs_price", "Equity vs Price", "price_action", "Strategy equity against market price."),
  makeSeed("monthly_volume", "Monthly Volume", "price_action", "Volume aggregated by month."),
  makeSeed("range_expansion", "Range Expansion", "price_action", "High-low expansion over time."),
  makeSeed("close_change_curve", "Close Change Curve", "price_action", "Close-to-close change trend."),

  makeSeed("action_timeline", "Action Timeline", "action_timeline", "Action frequency timeline."),
  makeSeed("action_type_frequency", "Action Type Frequency", "action_timeline", "Count by action label."),
  makeSeed("order_lifecycle", "Order Lifecycle", "action_timeline", "Lifecycle event counts."),
  makeSeed("execution_activity", "Execution Activity", "action_timeline", "Execution activity profile."),
  makeSeed("alerts_activity", "Alerts Activity", "action_timeline", "Alert/action activity profile."),
  makeSeed("event_density", "Event Density", "action_timeline", "Event density over action categories.")
];

const STATIC_TEMPLATE_DEFS: TemplateSeed[] = [
  makeSeed("waterfall_pnl", "Waterfall PnL", "equity_curve", "Cumulative gains/losses by sequence."),
  makeSeed("capital_allocation_mix", "Capital Allocation Mix", "trade_outcomes", "Capital usage by signal type."),
  makeSeed("correlation_matrix_proxy", "Correlation Matrix Proxy", "pnl_distribution", "Feature relationship matrix summary."),
  makeSeed("return_heatmap_weekday_hour", "Weekday Hour Heatmap", "session_performance", "Return intensity by weekday and hour."),
  makeSeed("rolling_profit_factor", "Rolling Profit Factor", "equity_curve", "Profit factor over rolling windows."),
  makeSeed("rolling_payoff_ratio", "Rolling Payoff Ratio", "equity_curve", "Average win/loss ratio over rolling windows."),
  makeSeed("win_rate_heatmap_month_weekday", "Month Weekday Win-Rate Heatmap", "session_performance", "Win-rate by month and weekday."),
  makeSeed("trade_duration_violin_proxy", "Trade Duration Violin Proxy", "pnl_distribution", "Hold-time distribution shape."),
  makeSeed("exposure_over_time", "Exposure Over Time", "equity_curve", "Net position exposure timeline."),
  makeSeed("max_adverse_excursion", "MAE Profile", "pnl_distribution", "Max adverse excursion distribution."),
  makeSeed("max_favorable_excursion", "MFE Profile", "pnl_distribution", "Max favorable excursion distribution."),
  makeSeed("expectancy_by_setup", "Expectancy by Setup", "trade_outcomes", "Expected return by setup label."),
  makeSeed("pnl_by_setup", "PnL by Setup", "trade_outcomes", "Realized PnL by setup label."),
  makeSeed("slippage_profile", "Slippage Profile", "pnl_distribution", "Entry/exit slippage distribution."),
  makeSeed("execution_latency_profile", "Execution Latency", "action_timeline", "Action-to-fill latency profile."),
  makeSeed("signal_density_timeline", "Signal Density", "action_timeline", "Signal clustering over time."),
  makeSeed("order_state_transitions", "Order State Transitions", "action_timeline", "Order state transition counts."),
  makeSeed("session_range_profile", "Session Range Profile", "session_performance", "Range expansion by session."),
  makeSeed("volume_profile_intraday", "Intraday Volume Profile", "session_performance", "Volume by intraday bucket."),
  makeSeed("returns_quantile_bands", "Returns Quantile Bands", "pnl_distribution", "Return quantile distribution."),
  makeSeed("tail_risk_profile", "Tail Risk Profile", "pnl_distribution", "Extreme loss and gain tails."),
  makeSeed("recovery_factor_curve", "Recovery Factor Curve", "equity_curve", "Recovery factor evolution."),
  makeSeed("drawdown_recovery_cycles", "Drawdown Recovery Cycles", "equity_curve", "Cycle depth and recovery duration."),
  makeSeed("trade_clustering_map", "Trade Clustering Map", "trade_outcomes", "Clustered trade behavior map."),
  makeSeed("signal_conflict_frequency", "Signal Conflict Frequency", "action_timeline", "Overlapping signal conflict count."),
  makeSeed("risk_budget_consumption", "Risk Budget Consumption", "equity_curve", "Risk budget usage over time."),
  makeSeed("position_size_distribution", "Position Size Distribution", "pnl_distribution", "Position unit-size frequency."),
  makeSeed("fee_impact_curve", "Fee Impact Curve", "equity_curve", "Net returns after fee drag."),
  makeSeed("spread_impact_curve", "Spread Impact Curve", "equity_curve", "Estimated spread impact over time."),
  makeSeed("entry_price_deviation", "Entry Price Deviation", "pnl_distribution", "Entry deviation from signal price."),
  makeSeed("exit_price_deviation", "Exit Price Deviation", "pnl_distribution", "Exit deviation from plan."),
  makeSeed("trade_count_cadence", "Trade Count Cadence", "action_timeline", "Trade frequency by interval."),
  makeSeed("stop_hit_vs_target_hit", "Stop Hit vs Target Hit", "trade_outcomes", "Outcome reason split."),
  makeSeed("liquidity_zone_touches", "Liquidity Zone Touches", "action_timeline", "Touches by liquidity zone class."),
  makeSeed("gap_open_profile", "Gap Open Profile", "price_action", "Gap-open size profile by interval."),
  makeSeed("close_location_value", "Close Location Value", "price_action", "Close position in bar range."),
  makeSeed("trend_state_frequency", "Trend State Frequency", "trade_outcomes", "Trend regime frequency counts."),
  makeSeed("regime_performance_mix", "Regime Performance Mix", "trade_outcomes", "PnL by market regime."),
  makeSeed("volatility_regime_mix", "Volatility Regime Mix", "session_performance", "Regime counts by volatility class."),
  makeSeed("signal_to_noise_proxy", "Signal-to-Noise Proxy", "price_action", "Trend move versus realized noise."),
  makeSeed("cross_asset_sensitivity", "Cross Asset Sensitivity", "pnl_distribution", "Sensitivity to benchmark moves."),
  makeSeed("equity_momentum_profile", "Equity Momentum Profile", "equity_curve", "Momentum in equity growth."),
  makeSeed("equity_velocity_profile", "Equity Velocity Profile", "equity_curve", "First derivative of equity curve."),
  makeSeed("equity_acceleration_profile", "Equity Acceleration Profile", "equity_curve", "Second derivative of equity curve."),
  makeSeed("trade_return_lorenz", "Trade Return Lorenz", "pnl_distribution", "Concentration of returns."),
  makeSeed("pnl_contribution_pareto", "PnL Contribution Pareto", "trade_outcomes", "Top contributors to total PnL."),
  makeSeed("time_in_market_ratio", "Time In Market Ratio", "equity_curve", "Market exposure ratio over time."),
  makeSeed("session_drawdown_profile", "Session Drawdown Profile", "session_performance", "Drawdown by trading session."),
  makeSeed("news_event_impact_proxy", "News Event Impact Proxy", "action_timeline", "Price impact around marked events."),
  makeSeed("volume_spike_distribution", "Volume Spike Distribution", "price_action", "Frequency of volume spikes."),
  makeSeed("range_spike_distribution", "Range Spike Distribution", "price_action", "Frequency of range spikes."),
  makeSeed("open_drive_profile", "Open Drive Profile", "session_performance", "Open-drive magnitude and direction."),
  makeSeed("close_drive_profile", "Close Drive Profile", "session_performance", "Close-drive magnitude and direction."),
  makeSeed("buy_sell_imbalance_proxy", "Buy Sell Imbalance Proxy", "trade_outcomes", "Directional imbalance estimate."),
  makeSeed("entry_efficiency_score", "Entry Efficiency Score", "trade_outcomes", "Entry quality over benchmarks."),
  makeSeed("exit_efficiency_score", "Exit Efficiency Score", "trade_outcomes", "Exit quality over benchmarks."),
  makeSeed("risk_of_ruin_proxy", "Risk of Ruin Proxy", "equity_curve", "Estimated ruin risk trend."),
  makeSeed("capital_curve_with_bands", "Capital Curve with Bands", "equity_curve", "Capital progression with confidence envelope."),
  makeSeed("pnl_calendar_monthly", "PnL Calendar Monthly", "session_performance", "Calendar-style monthly PnL summary."),
  makeSeed("pnl_calendar_weekly", "PnL Calendar Weekly", "session_performance", "Calendar-style weekly PnL summary."),
  makeSeed("trade_outcome_sankey_proxy", "Trade Outcome Flow", "trade_outcomes", "Setup-to-outcome flow projection."),
  makeSeed("strategy_component_breakdown", "Strategy Component Breakdown", "trade_outcomes", "PnL by strategy component."),
  makeSeed("signal_quality_distribution", "Signal Quality Distribution", "pnl_distribution", "Distribution of signal quality scores."),
  makeSeed("holding_cost_profile", "Holding Cost Profile", "equity_curve", "Carrying cost profile over holds."),
  makeSeed("execution_requote_rate", "Execution Requote Rate", "action_timeline", "Requote frequency over time."),
  makeSeed("session_liquidity_heatmap", "Session Liquidity Heatmap", "session_performance", "Liquidity intensity by session window."),
  makeSeed("breakout_followthrough_profile", "Breakout Followthrough", "price_action", "Distance traveled after breakout."),
  makeSeed("mean_reversion_profile", "Mean Reversion Profile", "price_action", "Reversion strength after stretch."),
  makeSeed("distribution_shape_profile", "Distribution Shape Profile", "pnl_distribution", "Skew and kurtosis trend proxy."),
  makeSeed("trade_dependency_profile", "Trade Dependency Profile", "pnl_distribution", "Autocorrelation of returns."),
  makeSeed("session_edge_decay", "Session Edge Decay", "session_performance", "Edge retention over session progression."),
  makeSeed("signal_queue_pressure", "Signal Queue Pressure", "action_timeline", "Pending-signal pressure trend."),
  makeSeed("liquidity_sweep_frequency", "Liquidity Sweep Frequency", "action_timeline", "Sweep events by interval."),
  makeSeed("break_of_structure_frequency", "Break of Structure Frequency", "action_timeline", "BOS event count by interval."),
  makeSeed("fair_value_gap_frequency", "Fair Value Gap Frequency", "action_timeline", "FVG event count by interval."),
  makeSeed("support_resistance_touch_count", "Support Resistance Touches", "action_timeline", "Touch count on marked levels."),
  makeSeed("price_action_compression", "Price Compression", "price_action", "Compression-expansion cycle intensity."),
  makeSeed("price_action_expansion", "Price Expansion", "price_action", "Expansion move intensity over time."),
  makeSeed("intrabar_range_rank", "Intrabar Range Rank", "price_action", "Range percentile rank per candle."),
  makeSeed("close_to_vwap_distance", "Close to VWAP Distance", "price_action", "Distance from VWAP proxy."),
  makeSeed("high_low_channel_width", "High Low Channel Width", "price_action", "Channel width through time."),
  makeSeed("time_of_day_edge_map", "Time Of Day Edge Map", "session_performance", "Edge by hour bucket."),
  makeSeed("day_of_week_edge_map", "Day Of Week Edge Map", "session_performance", "Edge by weekday bucket."),
  makeSeed("week_of_month_edge_map", "Week Of Month Edge Map", "session_performance", "Edge by week-of-month bucket.")
];

const MA_PERIODS = [5, 8, 9, 10, 12, 14, 20, 21, 34, 50, 55, 89, 100, 144, 200];
const MA_BASES: Array<{ idPrefix: string; titlePrefix: string; description: string }> = [
  { idPrefix: "sma", titlePrefix: "SMA", description: "Simple moving average" },
  { idPrefix: "ema", titlePrefix: "EMA", description: "Exponential moving average" },
  { idPrefix: "wma", titlePrefix: "WMA", description: "Weighted moving average" },
  { idPrefix: "hma", titlePrefix: "HMA", description: "Hull moving average" },
  { idPrefix: "vwma", titlePrefix: "VWMA", description: "Volume weighted moving average" },
  { idPrefix: "rma", titlePrefix: "RMA", description: "Running moving average" },
  { idPrefix: "kama", titlePrefix: "KAMA", description: "Kaufman adaptive moving average" },
  { idPrefix: "zlema", titlePrefix: "ZLEMA", description: "Zero-lag EMA" }
];

const OSCILLATOR_SPECS: Array<{ id: string; title: string; description: string }> = [
  { id: "rsi_14", title: "RSI 14", description: "Relative strength index (14)." },
  { id: "rsi_21", title: "RSI 21", description: "Relative strength index (21)." },
  { id: "stoch_k_14", title: "Stochastic K 14", description: "Stochastic oscillator K line." },
  { id: "stoch_d_14", title: "Stochastic D 14", description: "Stochastic oscillator D line." },
  { id: "macd_line_12_26_9", title: "MACD Line", description: "MACD fast/slow difference." },
  { id: "macd_signal_12_26_9", title: "MACD Signal", description: "MACD signal line." },
  { id: "macd_hist_12_26_9", title: "MACD Histogram", description: "MACD histogram." },
  { id: "cci_20", title: "CCI 20", description: "Commodity channel index (20)." },
  { id: "mfi_14", title: "MFI 14", description: "Money flow index (14)." },
  { id: "roc_12", title: "ROC 12", description: "Rate of change (12)." },
  { id: "roc_24", title: "ROC 24", description: "Rate of change (24)." },
  { id: "mom_10", title: "Momentum 10", description: "Momentum with period 10." },
  { id: "mom_20", title: "Momentum 20", description: "Momentum with period 20." },
  { id: "awesome_oscillator", title: "Awesome Oscillator", description: "Median-price momentum oscillator." },
  { id: "ppo_12_26", title: "PPO 12 26", description: "Percentage price oscillator." },
  { id: "trix_15", title: "TRIX 15", description: "Triple smoothed ROC." },
  { id: "uo_7_14_28", title: "Ultimate Oscillator", description: "Weighted multi-period oscillator." },
  { id: "williams_r_14", title: "Williams %R 14", description: "Williams percent range." },
  { id: "dpo_20", title: "DPO 20", description: "Detrended price oscillator." },
  { id: "chande_momentum_14", title: "CMO 14", description: "Chande momentum oscillator." },
  { id: "fisher_transform_10", title: "Fisher Transform 10", description: "Fisher transformed oscillator." },
  { id: "qqe_fast", title: "QQE Fast", description: "Quantitative qualitative estimation (fast)." },
  { id: "qqe_slow", title: "QQE Slow", description: "Quantitative qualitative estimation (slow)." },
  { id: "relative_vigor_10", title: "Relative Vigor 10", description: "Relative vigor index (10)." },
  { id: "detrended_oscillator_20", title: "Detrended Oscillator 20", description: "Detrended oscillation curve." },
  { id: "price_percentile_lookback_100", title: "Price Percentile 100", description: "Percentile position over lookback." },
  { id: "volatility_percentile_lookback_100", title: "Volatility Percentile 100", description: "Volatility percentile over lookback." },
  { id: "range_percentile_lookback_100", title: "Range Percentile 100", description: "Range percentile over lookback." },
  { id: "volume_percentile_lookback_100", title: "Volume Percentile 100", description: "Volume percentile over lookback." }
];

const BAND_CHANNEL_SPECS: Array<{ id: string; title: string; description: string }> = [
  { id: "bollinger_upper_20_2", title: "Bollinger Upper", description: "Upper Bollinger band." },
  { id: "bollinger_mid_20_2", title: "Bollinger Mid", description: "Middle Bollinger band." },
  { id: "bollinger_lower_20_2", title: "Bollinger Lower", description: "Lower Bollinger band." },
  { id: "keltner_upper_20", title: "Keltner Upper", description: "Upper Keltner channel." },
  { id: "keltner_mid_20", title: "Keltner Mid", description: "Middle Keltner channel." },
  { id: "keltner_lower_20", title: "Keltner Lower", description: "Lower Keltner channel." },
  { id: "donchian_upper_20", title: "Donchian Upper", description: "Upper Donchian channel." },
  { id: "donchian_mid_20", title: "Donchian Mid", description: "Middle Donchian channel." },
  { id: "donchian_lower_20", title: "Donchian Lower", description: "Lower Donchian channel." },
  { id: "supertrend_line_10_3", title: "Supertrend", description: "Supertrend primary line." },
  { id: "vwap_session", title: "Session VWAP", description: "Session anchored VWAP." },
  { id: "vwap_weekly", title: "Weekly VWAP", description: "Weekly anchored VWAP." },
  { id: "vwap_monthly", title: "Monthly VWAP", description: "Monthly anchored VWAP." },
  { id: "anchored_vwap_swing_low", title: "Anchored VWAP Swing Low", description: "VWAP anchored at last swing low." },
  { id: "anchored_vwap_swing_high", title: "Anchored VWAP Swing High", description: "VWAP anchored at last swing high." },
  { id: "regression_channel_mid", title: "Regression Channel Mid", description: "Linear regression center line." },
  { id: "regression_channel_upper", title: "Regression Channel Upper", description: "Linear regression upper channel." },
  { id: "regression_channel_lower", title: "Regression Channel Lower", description: "Linear regression lower channel." },
  { id: "stddev_band_plus_1", title: "StdDev Band +1", description: "Standard deviation +1 band." },
  { id: "stddev_band_minus_1", title: "StdDev Band -1", description: "Standard deviation -1 band." },
  { id: "stddev_band_plus_2", title: "StdDev Band +2", description: "Standard deviation +2 band." },
  { id: "stddev_band_minus_2", title: "StdDev Band -2", description: "Standard deviation -2 band." }
];

const STRUCTURE_DYNAMIC_SPECS: Array<{ id: string; title: string; description: string }> = [
  { id: "swing_highs_dynamic", title: "Swing Highs Dynamic", description: "Dynamic swing-high points." },
  { id: "swing_lows_dynamic", title: "Swing Lows Dynamic", description: "Dynamic swing-low points." },
  { id: "market_structure_bos", title: "BOS Map", description: "Break of structure events." },
  { id: "market_structure_choch", title: "CHoCH Map", description: "Change of character events." },
  { id: "liquidity_pools_dynamic", title: "Liquidity Pools Dynamic", description: "Detected liquidity pool levels." },
  { id: "fair_value_gaps_dynamic", title: "FVG Zones Dynamic", description: "Detected fair-value gap zones." },
  { id: "order_blocks_dynamic", title: "Order Blocks Dynamic", description: "Detected order block regions." },
  { id: "breaker_blocks_dynamic", title: "Breaker Blocks Dynamic", description: "Detected breaker block regions." },
  { id: "imbalance_zones_dynamic", title: "Imbalance Zones Dynamic", description: "Detected imbalance regions." },
  { id: "premium_discount_zones", title: "Premium Discount Zones", description: "Premium/discount split over swings." },
  { id: "support_grid_dynamic", title: "Support Grid Dynamic", description: "Adaptive support ladder." },
  { id: "resistance_grid_dynamic", title: "Resistance Grid Dynamic", description: "Adaptive resistance ladder." },
  { id: "pivot_points_classic", title: "Pivot Points Classic", description: "Classic pivot points set." },
  { id: "pivot_points_fibonacci", title: "Pivot Points Fibonacci", description: "Fibonacci pivot points set." },
  { id: "session_high_low_dynamic", title: "Session High Low Dynamic", description: "Session high/low tracker." },
  { id: "opening_range_dynamic", title: "Opening Range Dynamic", description: "Opening range high/low tracker." },
  { id: "value_area_dynamic", title: "Value Area Dynamic", description: "Value area high/low proxy." },
  { id: "volume_profile_poc_proxy", title: "Volume Profile POC Proxy", description: "Point of control proxy line." },
  { id: "intraday_bias_meter", title: "Intraday Bias Meter", description: "Dynamic intraday bias score." },
  { id: "trend_strength_index", title: "Trend Strength Index", description: "Normalized trend strength score." },
  { id: "volatility_regime_detector", title: "Volatility Regime Detector", description: "Dynamic regime classifier." },
  { id: "mean_reversion_detector", title: "Mean Reversion Detector", description: "Reversion pressure index." },
  { id: "breakout_probability_curve", title: "Breakout Probability Curve", description: "Dynamic breakout probability score." },
  { id: "pullback_depth_curve", title: "Pullback Depth Curve", description: "Dynamic pullback depth measurement." },
  { id: "trend_exhaustion_curve", title: "Trend Exhaustion Curve", description: "Trend exhaustion signal." },
  { id: "microstructure_noise_curve", title: "Microstructure Noise Curve", description: "Estimated microstructure noise." },
  { id: "liquidity_sweep_detector", title: "Liquidity Sweep Detector", description: "Liquidity sweep event score." },
  { id: "stop_hunt_detector", title: "Stop Hunt Detector", description: "Stop hunt event score." },
  { id: "risk_on_off_meter", title: "Risk On Off Meter", description: "Risk regime meter." },
  { id: "session_rotation_meter", title: "Session Rotation Meter", description: "Session rotation signal." }
];

const generatedMovingAverages = MA_BASES.flatMap((base) =>
  MA_PERIODS.map((period) =>
    makeSeed(
      `${base.idPrefix}_${period}`,
      `${base.titlePrefix} ${period}`,
      "price_action",
      `${base.description} (${period}).`,
      "dynamic"
    )
  )
);

const generatedOscillators = OSCILLATOR_SPECS.map((entry) =>
  makeSeed(entry.id, entry.title, "price_action", entry.description, "dynamic")
);

const generatedBands = BAND_CHANNEL_SPECS.map((entry) =>
  makeSeed(entry.id, entry.title, "price_action", entry.description, "dynamic")
);

const generatedStructure = STRUCTURE_DYNAMIC_SPECS.map((entry) =>
  makeSeed(entry.id, entry.title, "price_action", entry.description, "dynamic")
);

const generatedActionDynamics: TemplateSeed[] = [
  makeSeed("event_queue_depth_dynamic", "Event Queue Depth", "action_timeline", "Dynamic pending event queue depth.", "dynamic"),
  makeSeed("execution_burst_detector", "Execution Burst Detector", "action_timeline", "Execution burst intensity over time.", "dynamic"),
  makeSeed("action_latency_dynamic", "Action Latency Dynamic", "action_timeline", "Dynamic action latency estimate.", "dynamic"),
  makeSeed("trigger_fire_rate_dynamic", "Trigger Fire Rate Dynamic", "action_timeline", "Signal trigger rate through time.", "dynamic"),
  makeSeed("signal_stability_dynamic", "Signal Stability Dynamic", "action_timeline", "Signal state persistence curve.", "dynamic"),
  makeSeed("order_queue_pressure_dynamic", "Order Queue Pressure Dynamic", "action_timeline", "Order queue pressure estimate.", "dynamic"),
  makeSeed("execution_quality_dynamic", "Execution Quality Dynamic", "action_timeline", "Dynamic execution-quality score.", "dynamic"),
  makeSeed("risk_alert_density_dynamic", "Risk Alert Density Dynamic", "action_timeline", "Risk alert density curve.", "dynamic"),
  makeSeed("action_conflict_dynamic", "Action Conflict Dynamic", "action_timeline", "Action conflict intensity.", "dynamic"),
  makeSeed("trade_lifecycle_progress_dynamic", "Trade Lifecycle Progress Dynamic", "action_timeline", "Lifecycle progress tracker.", "dynamic")
];

const dedupeTemplates = (rows: TemplateSeed[]): AssistantGraphTemplateDef[] => {
  const map = new Map<string, AssistantGraphTemplateDef>();
  for (const row of rows) {
    const id = row.id.trim().toLowerCase();
    if (!id) {
      continue;
    }
    if (map.has(id)) {
      continue;
    }
    map.set(id, {
      id,
      title: row.title,
      family: row.family,
      mode: row.mode ?? "static",
      description: row.description
    });
  }
  return Array.from(map.values());
};

export const GRAPH_TEMPLATE_DEFS: AssistantGraphTemplateDef[] = dedupeTemplates([
  ...CORE_TEMPLATE_DEFS,
  ...STATIC_TEMPLATE_DEFS,
  ...generatedMovingAverages,
  ...generatedOscillators,
  ...generatedBands,
  ...generatedStructure,
  ...generatedActionDynamics
]);

export const GRAPH_TEMPLATE_ID_SET = new Set(GRAPH_TEMPLATE_DEFS.map((template) => template.id));
const GRAPH_TEMPLATE_BY_ID = new Map(
  GRAPH_TEMPLATE_DEFS.map((template) => [template.id, template] as const)
);

export const listGraphTemplatesForPrompt = (): string =>
  GRAPH_TEMPLATE_DEFS
    .map((template) => `${template.id} [${template.family}/${template.mode}]: ${template.description}`)
    .join("\n");

export const resolveGraphTemplate = (rawId: string | null | undefined): AssistantGraphTemplateDef => {
  const normalized = String(rawId ?? "").trim().toLowerCase();
  const found = GRAPH_TEMPLATE_BY_ID.get(normalized);
  if (found) {
    return found;
  }

  return GRAPH_TEMPLATE_DEFS[0]!;
};
