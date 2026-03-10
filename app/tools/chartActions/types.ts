import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  Time,
  UTCTimestamp
} from "lightweight-charts";

export type ChartActionStyle = "solid" | "dashed" | "dotted";

export type AssistantChartAction = {
  type:
    | "clear_annotations"
    | "move_to_date"
    | "adjust_previous_drawings"
    | "toggle_dynamic_support_resistance"
    | "draw_horizontal_line"
    | "draw_vertical_line"
    | "draw_trend_line"
    | "draw_box"
    | "draw_fvg"
    | "draw_fibonacci"
    | "draw_support_resistance"
    | "draw_arrow"
    | "draw_long_position"
    | "draw_short_position"
    | "draw_ruler"
    | "mark_candlestick";
  label?: string;
  color?: string;
  style?: ChartActionStyle;
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

export type ChartCandleLike = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartActionRuntimeContext = {
  chart: IChartApi;
  candleSeries: ISeriesApi<"Candlestick">;
  candles: ChartCandleLike[];
  overlaySeries: Array<ISeriesApi<"Line">>;
  priceLines: IPriceLine[];
  markers: SeriesMarker<Time>[];
  chartTimeFromMs: (timestampMs: number) => UTCTimestamp;
  setCombinedMarkers: () => void;
  clearOverlays: () => void;
  styleToLineStyle: (style?: ChartActionStyle) => LineStyle;
};
