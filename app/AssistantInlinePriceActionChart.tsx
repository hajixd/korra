"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ColorType,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  Time,
  UTCTimestamp
} from "lightweight-charts";

export type AssistantInlinePriceRow = {
  x: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type AssistantInlineZone = {
  xStart: string;
  xEnd: string;
  yStart: number;
  yEnd: number;
  direction: "bullish" | "bearish";
  label?: string;
};

export type AssistantInlineMarker = {
  x: string;
  y: number;
  direction: "bullish" | "bearish";
  label: string;
};

type AssistantInlinePriceActionChartProps = {
  chartId: string;
  rows: AssistantInlinePriceRow[];
  zones: AssistantInlineZone[];
  markers: AssistantInlineMarker[];
};

type ZoneOverlay = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  midY: number;
  direction: "bullish" | "bearish";
  label: string | undefined;
};

type OverlayState = {
  width: number;
  height: number;
  zones: ZoneOverlay[];
};

const LIGHTWEIGHT_CHART_SOLID_BACKGROUND: ColorType = "solid" as ColorType;
const toChartTime = (timestampMs: number): UTCTimestamp =>
  Math.trunc(timestampMs / 1000) as UTCTimestamp;

export default function AssistantInlinePriceActionChart(
  props: AssistantInlinePriceActionChartProps
) {
  const { chartId, rows, zones, markers } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayFrameRef = useRef<number>(0);
  const [overlay, setOverlay] = useState<OverlayState>({
    width: 0,
    height: 0,
    zones: []
  });

  const sortedRows = useMemo(() => {
    return [...rows]
      .filter((row) =>
        Number.isFinite(row.time) &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
      )
      .sort((left, right) => left.time - right.time);
  }, [rows]);

  const labelToTime = useMemo(() => {
    return new Map(sortedRows.map((row) => [row.x, row.time]));
  }, [sortedRows]);

  const seriesMarkers = useMemo<SeriesMarker<Time>[]>(() => {
    return markers.reduce<SeriesMarker<Time>[]>((output, marker) => {
      const time = labelToTime.get(marker.x);
      if (!Number.isFinite(time)) {
        return output;
      }

      output.push({
        time: toChartTime(Number(time)),
        position: marker.direction === "bullish" ? "belowBar" : "aboveBar",
        color: marker.direction === "bullish" ? "#19d39a" : "#f25f73",
        shape: marker.direction === "bullish" ? "arrowUp" : "arrowDown",
        text: marker.label
      });
      return output;
    }, []);
  }, [labelToTime, markers]);

  const syncOverlay = useMemo(() => {
    return () => {
      const host = hostRef.current;
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      if (!host || !chart || !candleSeries) {
        return;
      }

      const nextWidth = Math.max(1, Math.floor(host.clientWidth));
      const nextHeight = Math.max(1, Math.floor(host.clientHeight));
      const nextZones = zones
        .map((zone, index) => {
          const startTime = labelToTime.get(zone.xStart);
          const endTime = labelToTime.get(zone.xEnd);
          if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
            return null;
          }

          const x1 = chart.timeScale().timeToCoordinate(toChartTime(Number(startTime)));
          const x2 = chart.timeScale().timeToCoordinate(toChartTime(Number(endTime)));
          const y1 = candleSeries.priceToCoordinate(Math.max(zone.yStart, zone.yEnd));
          const y2 = candleSeries.priceToCoordinate(Math.min(zone.yStart, zone.yEnd));
          const midPrice = (zone.yStart + zone.yEnd) / 2;
          const midY = candleSeries.priceToCoordinate(midPrice);

          if (
            !Number.isFinite(x1 ?? Number.NaN) ||
            !Number.isFinite(x2 ?? Number.NaN) ||
            !Number.isFinite(y1 ?? Number.NaN) ||
            !Number.isFinite(y2 ?? Number.NaN) ||
            !Number.isFinite(midY ?? Number.NaN)
          ) {
            return null;
          }

          return {
            id: `${chartId}-zone-${index}`,
            x: Math.min(x1!, x2!),
            y: Math.min(y1!, y2!),
            width: Math.max(Math.abs(x2! - x1!), 6),
            height: Math.max(Math.abs(y2! - y1!), 6),
            midY: Number(midY!),
            direction: zone.direction,
            label: zone.label
          } satisfies ZoneOverlay;
        })
        .filter((zone): zone is ZoneOverlay => zone !== null);

      setOverlay((current) => {
        const unchanged =
          current.width === nextWidth &&
          current.height === nextHeight &&
          current.zones.length === nextZones.length &&
          current.zones.every((zone, index) => {
            const nextZone = nextZones[index];
            return (
              nextZone &&
              zone.id === nextZone.id &&
              zone.x === nextZone.x &&
              zone.y === nextZone.y &&
              zone.width === nextZone.width &&
              zone.height === nextZone.height &&
              zone.midY === nextZone.midY &&
              zone.direction === nextZone.direction &&
              zone.label === nextZone.label
            );
          });

        return unchanged
          ? current
          : {
              width: nextWidth,
              height: nextHeight,
              zones: nextZones
            };
      });
    };
  }, [chartId, labelToTime, zones]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || sortedRows.length === 0) {
      return;
    }

    let disposed = false;
    let cleanupChart: (() => void) | null = null;

    const scheduleOverlaySync = () => {
      if (overlayFrameRef.current) {
        window.cancelAnimationFrame(overlayFrameRef.current);
      }
      overlayFrameRef.current = window.requestAnimationFrame(() => {
        overlayFrameRef.current = 0;
        syncOverlay();
      });
    };

    const mount = async () => {
      const { createChart } = await import("lightweight-charts");
      if (disposed || !hostRef.current) {
        return;
      }

      const chart = createChart(hostRef.current, {
        width: Math.max(1, hostRef.current.clientWidth),
        height: Math.max(1, hostRef.current.clientHeight),
        layout: {
          background: {
            type: LIGHTWEIGHT_CHART_SOLID_BACKGROUND,
            color: "#09111a"
          },
          textColor: "#b9c5d8",
          fontFamily: "\"IBM Plex Mono\", \"SFMono-Regular\", Menlo, Monaco, monospace",
          fontSize: 11
        },
        grid: {
          vertLines: {
            color: "rgba(143, 157, 184, 0.08)"
          },
          horzLines: {
            color: "rgba(143, 157, 184, 0.11)"
          }
        },
        rightPriceScale: {
          borderColor: "rgba(143, 157, 184, 0.2)"
        },
        timeScale: {
          borderColor: "rgba(143, 157, 184, 0.2)",
          rightOffset: 8,
          barSpacing: 12,
          timeVisible: true,
          secondsVisible: false
        },
        crosshair: {
          vertLine: {
            color: "rgba(191, 198, 216, 0.22)",
            width: 1,
            style: 2
          },
          horzLine: {
            color: "rgba(191, 198, 216, 0.18)",
            width: 1,
            style: 2
          }
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true
        }
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#19d39a",
        downColor: "#f25f73",
        wickUpColor: "#19d39a",
        wickDownColor: "#f25f73",
        borderUpColor: "#19d39a",
        borderDownColor: "#f25f73",
        priceLineVisible: false,
        lastValueVisible: false
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      candleSeries.setData(
        sortedRows.map((row) => ({
          time: toChartTime(row.time),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close
        }))
      );
      candleSeries.setMarkers(seriesMarkers);

      chart.timeScale().fitContent();

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !chartRef.current) {
          return;
        }
        chartRef.current.applyOptions({
          width: Math.max(1, Math.floor(entry.contentRect.width)),
          height: Math.max(1, Math.floor(entry.contentRect.height))
        });
        scheduleOverlaySync();
      });
      resizeObserver.observe(hostRef.current);

      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlaySync);
      scheduleOverlaySync();

      const unmount = () => {
        resizeObserver.disconnect();
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleOverlaySync);
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        if (overlayFrameRef.current) {
          window.cancelAnimationFrame(overlayFrameRef.current);
          overlayFrameRef.current = 0;
        }
      };

      if (disposed) {
        unmount();
        return;
      }

      cleanupChart = unmount;
    };

    void mount();

    return () => {
      disposed = true;
      if (cleanupChart) {
        cleanupChart();
      }
    };
  }, [seriesMarkers, sortedRows, syncOverlay]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !chart) {
      return;
    }

    candleSeries.setData(
      sortedRows.map((row) => ({
        time: toChartTime(row.time),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close
      }))
    );
    candleSeries.setMarkers(seriesMarkers);
    chart.timeScale().fitContent();
    syncOverlay();
  }, [seriesMarkers, sortedRows, syncOverlay]);

  return (
    <div className="ai-lightweight-chart-shell">
      <div ref={hostRef} className="ai-lightweight-chart-host" />
      {overlay.width > 0 && overlay.height > 0 ? (
        <svg
          className="ai-lightweight-chart-overlay"
          viewBox={`0 0 ${overlay.width} ${overlay.height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {overlay.zones.map((zone) => (
            <g key={zone.id}>
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx={6}
                fill={
                  zone.direction === "bullish"
                    ? "rgba(25, 211, 154, 0.18)"
                    : "rgba(242, 95, 115, 0.18)"
                }
                stroke={
                  zone.direction === "bullish"
                    ? "rgba(25, 211, 154, 0.82)"
                    : "rgba(242, 95, 115, 0.82)"
                }
                strokeWidth={1.3}
              />
              <line
                x1={zone.x}
                x2={zone.x + zone.width}
                y1={zone.midY}
                y2={zone.midY}
                stroke={
                  zone.direction === "bullish"
                    ? "rgba(179, 252, 223, 0.9)"
                    : "rgba(255, 206, 213, 0.9)"
                }
                strokeWidth={1}
                strokeDasharray="5 4"
              />
              {zone.label ? (
                <text
                  x={zone.x + 8}
                  y={Math.max(zone.y + 14, 14)}
                  className="ai-candle-zone-label"
                >
                  {zone.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
