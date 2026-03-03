export type AssistantChartActionType =
  | "clear_annotations"
  | "move_to_date"
  | "adjust_previous_drawings"
  | "toggle_dynamic_support_resistance"
  | "draw_horizontal_line"
  | "draw_vertical_line"
  | "draw_trend_line"
  | "draw_box"
  | "draw_fvg"
  | "draw_support_resistance"
  | "draw_arrow"
  | "draw_long_position"
  | "draw_short_position"
  | "draw_ruler"
  | "mark_candlestick";

export type AssistantChartAction = {
  type: AssistantChartActionType;
  label?: string;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
  time?: number;
  timeStart?: number;
  timeEnd?: number;
  price?: number;
  priceStart?: number;
  priceEnd?: number;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  side?: "long" | "short";
  markerShape?: "arrowUp" | "arrowDown" | "circle" | "square";
  note?: string;
  priceDelta?: number;
  timeDeltaMs?: number;
  targetLabel?: string;
  enabled?: boolean;
  levels?: number;
  lookback?: number;
  dynamic?: boolean;
  dynamicLookback?: number;
};

const ACTION_TYPES: AssistantChartActionType[] = [
  "clear_annotations",
  "move_to_date",
  "adjust_previous_drawings",
  "toggle_dynamic_support_resistance",
  "draw_horizontal_line",
  "draw_vertical_line",
  "draw_trend_line",
  "draw_box",
  "draw_fvg",
  "draw_support_resistance",
  "draw_arrow",
  "draw_long_position",
  "draw_short_position",
  "draw_ruler",
  "mark_candlestick"
];

const normalizeActionTypeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const ACTION_TYPE_SET = new Set(ACTION_TYPES);
const DYNAMIC_CAPABLE_ACTION_SET = new Set<AssistantChartActionType>([
  "draw_horizontal_line",
  "draw_vertical_line",
  "draw_trend_line",
  "draw_box",
  "draw_fvg",
  "draw_support_resistance",
  "draw_arrow",
  "draw_long_position",
  "draw_short_position",
  "draw_ruler",
  "mark_candlestick"
]);

const ACTION_ALIAS_GROUPS: Record<AssistantChartActionType, string[]> = {
  clear_annotations: [
    "clear",
    "clear_chart",
    "clear_drawings",
    "wipe_annotations",
    "reset_annotations",
    "remove_drawings",
    "clear_overlays",
    "erase_all",
    "clean_chart",
    "reset_chart_markup",
    "clear_marks",
    "clear_levels",
    "clear_tools",
    "remove_annotations",
    "delete_annotations",
    "clear_chart_tools",
    "reset_drawings",
    "reset_overlays",
    "chart_reset",
    "erase_annotations",
    "clear_all_shapes",
    "remove_all_shapes",
    "nuke_annotations",
    "clear_ai_drawings",
    "wipe_chart",
    "reset_chart_annotations",
    "delete_drawings",
    "delete_overlays",
    "remove_markups",
    "clear_everything"
  ],
  move_to_date: [
    "scroll_to_date",
    "go_to_date",
    "jump_to_date",
    "focus_date",
    "move_chart_to_date",
    "pan_to_date",
    "goto_date",
    "seek_date",
    "center_on_date",
    "scroll_to_time",
    "move_to_time",
    "jump_to_time",
    "focus_time",
    "center_on_time",
    "move_chart_to_time",
    "goto_time",
    "seek_time",
    "move_to_candle",
    "jump_to_candle",
    "focus_candle",
    "show_time",
    "navigate_to_date",
    "navigate_to_time"
  ],
  adjust_previous_drawings: [
    "adjust_previous",
    "adjust_previous_drawing",
    "adjust_last_draw",
    "adjust_last_drawing",
    "shift_previous_drawings",
    "move_previous_drawings",
    "offset_previous_drawings",
    "nudge_previous_drawings",
    "edit_previous_drawings",
    "update_previous_drawings",
    "reposition_previous_drawings",
    "align_previous_drawings"
  ],
  toggle_dynamic_support_resistance: [
    "dynamic_support_resistance",
    "toggle_dynamic_sr",
    "enable_dynamic_sr",
    "disable_dynamic_sr",
    "start_dynamic_support_resistance",
    "stop_dynamic_support_resistance",
    "auto_support_resistance_indicator",
    "dynamic_sr_indicator",
    "live_support_resistance_indicator",
    "toggle_auto_sr",
    "enable_auto_sr",
    "disable_auto_sr"
  ],
  draw_horizontal_line: [
    "draw_support_line",
    "draw_resistance_line",
    "draw_level",
    "draw_price_level",
    "draw_key_level",
    "draw_pivot_line",
    "draw_vwap_line",
    "draw_daily_open_line",
    "draw_daily_high_line",
    "draw_daily_low_line",
    "draw_weekly_high_line",
    "draw_weekly_low_line",
    "draw_monthly_high_line",
    "draw_monthly_low_line",
    "draw_round_number_line",
    "draw_liquidity_line",
    "draw_trigger_line",
    "draw_stop_line",
    "draw_target_line",
    "draw_break_even_line",
    "draw_open_line",
    "draw_close_line",
    "draw_mid_line",
    "draw_reference_line",
    "mark_price_level",
    "annotate_level",
    "plot_horizontal",
    "horizontal_line",
    "add_horizontal_line",
    "add_level_line",
    "draw_range_midline",
    "draw_supply_line",
    "draw_demand_line",
    "draw_previous_high_line",
    "draw_previous_low_line",
    "draw_equilibrium_line",
    "draw_value_area_high",
    "draw_value_area_low",
    "draw_poc_line",
    "draw_fib_level",
    "draw_session_open_line"
  ],
  draw_vertical_line: [
    "draw_session_line",
    "draw_event_line",
    "draw_news_line",
    "draw_open_marker",
    "draw_close_marker",
    "draw_time_marker",
    "draw_cutoff_line",
    "draw_deadline_line",
    "draw_nfp_line",
    "draw_fomc_line",
    "draw_cpi_line",
    "draw_london_open",
    "draw_newyork_open",
    "draw_tokyo_open",
    "draw_midnight_line",
    "draw_noon_line",
    "mark_event_time",
    "mark_session_start",
    "mark_session_end",
    "mark_rollover_time",
    "plot_vertical",
    "vertical_line",
    "add_vertical_line",
    "add_time_line",
    "add_event_marker",
    "annotate_time",
    "annotate_event",
    "draw_rebalance_line",
    "draw_expiry_line",
    "draw_fixing_line",
    "draw_data_release_line",
    "draw_macro_event_line",
    "draw_high_impact_event",
    "draw_trade_open_time",
    "draw_trade_close_time",
    "draw_period_boundary",
    "draw_day_separator",
    "draw_week_separator",
    "draw_month_separator"
  ],
  draw_trend_line: [
    "draw_trendline",
    "draw_diagonal_line",
    "draw_slope_line",
    "draw_channel_midline",
    "draw_breakout_line",
    "draw_retest_line",
    "draw_impulse_line",
    "draw_correction_line",
    "draw_projection_line",
    "draw_regression_line",
    "draw_angle_line",
    "draw_bias_line",
    "draw_directional_line",
    "draw_structure_line",
    "plot_trendline",
    "add_trendline",
    "add_diagonal",
    "draw_line_segment",
    "connect_swings",
    "draw_swing_line",
    "draw_highs_line",
    "draw_lows_line",
    "draw_support_trendline",
    "draw_resistance_trendline",
    "draw_dynamic_trendline",
    "draw_ray",
    "draw_halfline",
    "draw_polyline_segment",
    "draw_path_line",
    "draw_trend_projection"
  ],
  draw_box: [
    "draw_rectangle",
    "draw_range_box",
    "draw_zone_box",
    "draw_supply_zone",
    "draw_demand_zone",
    "draw_consolidation_box",
    "draw_session_box",
    "draw_killzone_box",
    "draw_imbalance_box",
    "draw_liquidity_box",
    "draw_value_area_box",
    "draw_news_window_box",
    "draw_trade_window_box",
    "draw_pullback_box",
    "draw_retracement_box",
    "draw_breakout_box",
    "draw_retest_box",
    "draw_accumulation_box",
    "draw_distribution_box",
    "draw_reaction_box",
    "plot_box",
    "add_box",
    "add_rectangle",
    "mark_zone",
    "mark_range",
    "draw_channel_box",
    "draw_stop_zone",
    "draw_target_zone",
    "draw_entry_zone",
    "draw_order_block_box",
    "draw_breaker_box",
    "draw_discount_premium_box"
  ],
  draw_fvg: [
    "draw_fair_value_gap",
    "draw_imbalance_zone",
    "draw_gap_zone",
    "mark_fvg",
    "mark_imbalance",
    "plot_fvg",
    "add_fvg",
    "add_gap_zone",
    "draw_bullish_fvg",
    "draw_bearish_fvg",
    "draw_single_print_zone",
    "draw_displacement_gap",
    "draw_inefficiency_zone",
    "draw_three_candle_gap",
    "draw_fvg_box",
    "draw_gap_box",
    "draw_liquidity_void",
    "mark_liquidity_void",
    "draw_value_gap",
    "draw_price_imbalance"
  ],
  draw_support_resistance: [
    "draw_sr",
    "draw_support_and_resistance",
    "draw_support_resistance_levels",
    "auto_support_resistance",
    "mark_support_resistance",
    "find_support_resistance",
    "plot_support_resistance",
    "add_support_resistance",
    "draw_key_levels",
    "draw_sr_levels",
    "draw_structural_levels",
    "draw_floor_ceiling",
    "draw_supply_demand_levels",
    "draw_liquidity_levels",
    "draw_major_levels",
    "draw_minor_levels",
    "draw_static_levels",
    "draw_level_cluster",
    "draw_snr",
    "draw_support_resistance_zone",
    "draw_pivot_levels",
    "draw_intraday_levels",
    "draw_session_levels",
    "draw_weekly_levels",
    "draw_monthly_levels",
    "draw_auto_levels",
    "draw_level_map",
    "draw_swing_levels",
    "draw_reaction_levels",
    "draw_balance_levels"
  ],
  draw_arrow: [
    "draw_up_arrow",
    "draw_down_arrow",
    "draw_signal_arrow",
    "draw_entry_arrow",
    "draw_exit_arrow",
    "draw_buy_arrow",
    "draw_sell_arrow",
    "draw_reversal_arrow",
    "draw_breakout_arrow",
    "draw_retest_arrow",
    "draw_confirmation_arrow",
    "draw_warning_arrow",
    "draw_note_arrow",
    "mark_arrow",
    "plot_arrow",
    "add_arrow",
    "add_signal_arrow",
    "annotate_arrow",
    "draw_liquidity_sweep_arrow",
    "draw_stop_hunt_arrow",
    "draw_bos_arrow",
    "draw_choch_arrow",
    "draw_trend_arrow",
    "draw_pullback_arrow",
    "draw_impulse_arrow",
    "draw_tp_arrow",
    "draw_sl_arrow",
    "draw_direction_arrow",
    "draw_event_arrow",
    "draw_pointer"
  ],
  draw_long_position: [
    "draw_long",
    "draw_long_trade",
    "draw_buy_position",
    "draw_long_setup",
    "draw_long_idea",
    "mark_long",
    "plot_long",
    "add_long_position",
    "draw_long_risk_box",
    "draw_long_rr",
    "draw_long_plan",
    "draw_bullish_position",
    "draw_bid_position",
    "draw_long_entry",
    "draw_long_trade_box",
    "draw_long_target_stop",
    "show_long_position",
    "annotate_long",
    "draw_long_template",
    "draw_long_leg"
  ],
  draw_short_position: [
    "draw_short",
    "draw_short_trade",
    "draw_sell_position",
    "draw_short_setup",
    "draw_short_idea",
    "mark_short",
    "plot_short",
    "add_short_position",
    "draw_short_risk_box",
    "draw_short_rr",
    "draw_short_plan",
    "draw_bearish_position",
    "draw_ask_position",
    "draw_short_entry",
    "draw_short_trade_box",
    "draw_short_target_stop",
    "show_short_position",
    "annotate_short",
    "draw_short_template",
    "draw_short_leg"
  ],
  draw_ruler: [
    "draw_measure",
    "draw_measurement",
    "draw_distance",
    "draw_range_measure",
    "draw_price_distance",
    "draw_time_distance",
    "draw_move_measure",
    "draw_magnitude",
    "plot_ruler",
    "add_ruler",
    "add_measurement",
    "measure_move",
    "measure_leg",
    "measure_swing",
    "measure_rr",
    "measure_pullback",
    "measure_extension",
    "measure_wave",
    "measure_box_distance",
    "measure_duration",
    "measure_pips",
    "measure_points",
    "measure_percent_move",
    "measure_candle_span"
  ],
  mark_candlestick: [
    "mark_candle",
    "highlight_candle",
    "annotate_candle",
    "tag_candle",
    "flag_candle",
    "label_candle",
    "mark_bar",
    "highlight_bar",
    "annotate_bar",
    "tag_bar",
    "mark_pinbar",
    "mark_engulfing",
    "mark_inside_bar",
    "mark_outside_bar",
    "mark_doji",
    "mark_hammer",
    "mark_shooting_star",
    "mark_sweep_candle",
    "mark_breakout_candle",
    "mark_reversal_candle",
    "mark_signal_candle",
    "mark_entry_candle",
    "mark_exit_candle",
    "mark_key_candle",
    "mark_reference_candle"
  ]
};

const ACTION_ALIAS_LOOKUP = new Map<string, AssistantChartActionType>();
for (const [canonicalType, aliases] of Object.entries(ACTION_ALIAS_GROUPS) as Array<
  [AssistantChartActionType, string[]]
>) {
  for (const alias of aliases) {
    const normalized = normalizeActionTypeToken(alias);
    if (!normalized) {
      continue;
    }
    ACTION_ALIAS_LOOKUP.set(normalized, canonicalType);
  }
}

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
};

const resolveCanonicalActionType = (
  token: string
): AssistantChartActionType | null => {
  if (ACTION_TYPE_SET.has(token as AssistantChartActionType)) {
    return token as AssistantChartActionType;
  }

  return ACTION_ALIAS_LOOKUP.get(token) ?? null;
};

const toCanonicalActionType = (
  value: unknown
): { type: AssistantChartActionType; dynamicFromType: boolean } | null => {
  const normalized = normalizeActionTypeToken(String(value ?? ""));
  if (!normalized) {
    return null;
  }

  const direct = resolveCanonicalActionType(normalized);
  if (direct) {
    return { type: direct, dynamicFromType: false };
  }

  for (const prefix of ["dynamic_", "auto_"]) {
    if (!normalized.startsWith(prefix)) {
      continue;
    }

    const stripped = normalized.slice(prefix.length);
    const resolved = resolveCanonicalActionType(stripped);
    if (resolved) {
      return { type: resolved, dynamicFromType: true };
    }
  }

  return null;
};

const sanitizeStyle = (value: unknown): "solid" | "dashed" | "dotted" => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "dashed" || raw === "dotted") {
    return raw;
  }
  return "solid";
};

const sanitizeMarkerShape = (
  value: unknown
): "arrowUp" | "arrowDown" | "circle" | "square" => {
  const raw = String(value || "").trim();
  if (raw === "arrowUp" || raw === "arrowDown" || raw === "circle" || raw === "square") {
    return raw;
  }
  return "arrowUp";
};

const sanitizeSide = (value: unknown): "long" | "short" | undefined => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "long" || raw === "short") {
    return raw;
  }
  return undefined;
};

export const normalizeChartActions = (input: unknown): AssistantChartAction[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const actions: AssistantChartAction[] = [];

  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const raw = row as Record<string, unknown>;
    const actionTypeMeta = toCanonicalActionType(raw.type);
    if (!actionTypeMeta) {
      continue;
    }
    const actionType = actionTypeMeta.type;
    const dynamicHintFromToken = normalizeActionTypeToken(String(raw.type ?? "")).includes(
      "dynamic"
    );
    const dynamicRaw =
      toBoolean(raw.dynamic) ??
      (DYNAMIC_CAPABLE_ACTION_SET.has(actionType)
        ? actionTypeMeta.dynamicFromType || dynamicHintFromToken
        : undefined);

    const action: AssistantChartAction = {
      type: actionType,
      label: toText(raw.label, ""),
      color: toText(raw.color, ""),
      style: sanitizeStyle(raw.style),
      time: toNumber(raw.time) ?? undefined,
      timeStart: toNumber(raw.timeStart) ?? undefined,
      timeEnd: toNumber(raw.timeEnd) ?? undefined,
      price: toNumber(raw.price) ?? undefined,
      priceStart: toNumber(raw.priceStart) ?? undefined,
      priceEnd: toNumber(raw.priceEnd) ?? undefined,
      entryPrice: toNumber(raw.entryPrice) ?? undefined,
      stopPrice: toNumber(raw.stopPrice) ?? undefined,
      targetPrice: toNumber(raw.targetPrice) ?? undefined,
      side: sanitizeSide(raw.side),
      markerShape: sanitizeMarkerShape(raw.markerShape),
      note: toText(raw.note, ""),
      priceDelta: toNumber(raw.priceDelta) ?? undefined,
      timeDeltaMs: toNumber(raw.timeDeltaMs) ?? undefined,
      targetLabel: toText(raw.targetLabel, ""),
      enabled: toBoolean(raw.enabled),
      levels: toNumber(raw.levels) ?? undefined,
      lookback: toNumber(raw.lookback) ?? undefined,
      dynamic: dynamicRaw,
      dynamicLookback:
        toNumber(raw.dynamicLookback) ??
        toNumber(raw.lookbackBars) ??
        toNumber(raw.windowBars) ??
        undefined
    };

    if (action.type === "draw_long_position" && !action.side) {
      action.side = "long";
    }

    if (action.type === "draw_short_position" && !action.side) {
      action.side = "short";
    }

    actions.push(action);
  }

  return actions.slice(0, 24);
};

export const chartActionsPromptSpec = (): string => {
  const aliasLines = ACTION_TYPES.map((type) => {
    const aliases = ACTION_ALIAS_GROUPS[type] ?? [];
    const preview = aliases.slice(0, 12);
    const suffix = aliases.length > preview.length ? ", ..." : "";
    return `aliases ${type} (${aliases.length}): ${preview.join(", ")}${suffix}`;
  });

  const totalAliases = Object.values(ACTION_ALIAS_GROUPS).reduce(
    (sum, aliases) => sum + aliases.length,
    0
  );

  return [
    "Supported chart actions (JSON array).",
    `Canonical actions: ${ACTION_TYPES.join(", ")}.`,
    `Total alias actions available: ${totalAliases}.`,
    '{"type":"clear_annotations"}',
    '{"type":"move_to_date","time":1709251200000}',
    '{"type":"adjust_previous_drawings","priceDelta":2.5,"targetLabel":"support"}',
    '{"type":"toggle_dynamic_support_resistance","enabled":true,"levels":3,"lookback":1200}',
    '{"type":"draw_support_resistance","dynamic":true,"dynamicLookback":1200,"levels":4,"label":"Dynamic S/R"}',
    '{"type":"dynamic_draw_trend_line","dynamicLookback":300,"label":"Dynamic Trend"}',
    '{"type":"draw_horizontal_line","price":3365.2,"label":"Resistance","color":"#f0455a"}',
    '{"type":"draw_vertical_line","time":1709251200000,"label":"Event"}',
    '{"type":"draw_trend_line","timeStart":1709200000000,"priceStart":3340,"timeEnd":1709300000000,"priceEnd":3360}',
    '{"type":"draw_box","timeStart":1709200000000,"priceStart":3338,"timeEnd":1709300000000,"priceEnd":3352,"label":"Range"}',
    '{"type":"draw_fvg","timeStart":1709200000000,"timeEnd":1709300000000,"priceStart":3346,"priceEnd":3351}',
    '{"type":"draw_support_resistance","priceStart":3330,"priceEnd":3360}',
    '{"type":"draw_arrow","time":1709251200000,"price":3355,"markerShape":"arrowDown","label":"Rejection"}',
    '{"type":"draw_long_position","entryPrice":3348,"stopPrice":3339,"targetPrice":3368}',
    '{"type":"draw_short_position","entryPrice":3358,"stopPrice":3367,"targetPrice":3340}',
    '{"type":"draw_ruler","timeStart":1709200000000,"priceStart":3340,"timeEnd":1709300000000,"priceEnd":3360}',
    '{"type":"mark_candlestick","time":1709251200000,"markerShape":"circle","note":"Liquidity sweep"}',
    ...aliasLines
  ].join("\n");
};
