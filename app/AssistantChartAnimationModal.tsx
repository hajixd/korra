"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  ColorType,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  SeriesMarker,
  Time,
  UTCTimestamp
} from "lightweight-charts";
import type { AssistantChartAnimation } from "../lib/assistant-tools";
import {
  executeAssistantChartActions,
  styleToLineStyle,
  type AssistantChartAction
} from "./tools/chartActions";

type AnimationCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type AssistantChartAnimationModalProps = {
  open: boolean;
  animation: AssistantChartAnimation | null;
  candles: AnimationCandle[];
  onClose: () => void;
};

type AnimationBurst = {
  id: number;
  x: number;
  y: number;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
};

const toChartTime = (timestampMs: number): UTCTimestamp =>
  Math.trunc(timestampMs / 1000) as UTCTimestamp;
const LIGHTWEIGHT_CHART_SOLID_BACKGROUND: ColorType = "solid" as ColorType;

export default function AssistantChartAnimationModal(props: AssistantChartAnimationModalProps) {
  const { open, animation, candles, onClose } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<Array<ISeriesApi<"Line">>>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markersRef = useRef<SeriesMarker<Time>[]>([]);
  const playbackTimeoutsRef = useRef<number[]>([]);
  const progressTimerRef = useRef<number>(0);
  const burstSeedRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [bursts, setBursts] = useState<AnimationBurst[]>([]);

  const sortedCandles = useMemo(() => {
    if (!Array.isArray(candles) || candles.length === 0) {
      return [];
    }
    const rows = candles
      .filter((row) =>
        Number.isFinite(row.time) &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
      )
      .map((row) => ({
        time: toChartTime(row.time),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close
      }))
      .sort((left, right) => Number(left.time) - Number(right.time));
    return rows;
  }, [candles]);

  const clearTimers = useCallback(() => {
    for (const timer of playbackTimeoutsRef.current) {
      window.clearTimeout(timer);
    }
    playbackTimeoutsRef.current = [];

    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = 0;
    }
  }, []);

  const clearOverlays = useCallback(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) {
      return;
    }

    for (const series of overlaySeriesRef.current) {
      chart.removeSeries(series);
    }
    overlaySeriesRef.current = [];

    for (const priceLine of priceLinesRef.current) {
      candleSeries.removePriceLine(priceLine);
    }
    priceLinesRef.current = [];

    markersRef.current = [];
    candleSeries.setMarkers([]);
  }, []);

  const setCombinedMarkers = useCallback(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) {
      return;
    }
    candleSeries.setMarkers([...markersRef.current]);
  }, []);

  const emitBurst = useCallback((stepIndex: number) => {
    burstSeedRef.current += 1;
    const seed = burstSeedRef.current + stepIndex * 13;
    const x = 18 + ((seed * 37) % 64);
    const y = 24 + ((seed * 23) % 52);
    const id = Date.now() + stepIndex;
    setBursts((current) => [...current, { id, x, y }].slice(-22));

    const timeoutId = window.setTimeout(() => {
      setBursts((current) => current.filter((entry) => entry.id !== id));
    }, 920);
    playbackTimeoutsRef.current.push(timeoutId);
  }, []);

  const runStepActions = useCallback(
    (actions: AssistantChartAction[]) => {
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      if (!chart || !candleSeries || actions.length === 0) {
        return;
      }

      executeAssistantChartActions(actions, {
        chart,
        candleSeries,
        candles: sortedCandles.map((row) => ({
          time: Number(row.time) * 1000,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close
        })),
        overlaySeries: overlaySeriesRef.current,
        priceLines: priceLinesRef.current,
        markers: markersRef.current,
        chartTimeFromMs: toChartTime,
        setCombinedMarkers,
        clearOverlays,
        styleToLineStyle
      });
    },
    [clearOverlays, setCombinedMarkers, sortedCandles]
  );

  const replay = useCallback(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!animation || !chart || !candleSeries || sortedCandles.length === 0) {
      return;
    }

    clearTimers();
    clearOverlays();
    setBursts([]);
    setProgress(0);
    setActiveStepIndex(-1);
    setIsPlaying(true);

    const rightIndex = sortedCandles.length - 1;
    const leftIndex = Math.max(0, rightIndex - 220);
    const from = sortedCandles[leftIndex]?.time ?? sortedCandles[0]!.time;
    const to = sortedCandles[rightIndex]!.time;
    chart.timeScale().setVisibleRange({ from, to });

    const totalDuration = Math.max(
      1000,
      animation.durationMs,
      ...animation.steps.map((step) => step.atMs + step.holdMs)
    );

    const startedAt = performance.now();
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const ratio = clamp(elapsed / totalDuration, 0, 1);
      setProgress(ratio);
    }, 40);

    animation.steps.forEach((step, index) => {
      const timerId = window.setTimeout(() => {
        setActiveStepIndex(index);
        runStepActions(step.actions);
        emitBurst(index);
      }, step.atMs);
      playbackTimeoutsRef.current.push(timerId);
    });

    const endTimer = window.setTimeout(() => {
      clearTimers();
      setProgress(1);
      setIsPlaying(false);
      setActiveStepIndex(animation.steps.length - 1);
    }, totalDuration + 40);
    playbackTimeoutsRef.current.push(endTimer);
  }, [animation, clearOverlays, clearTimers, emitBurst, runStepActions, sortedCandles]);

  useEffect(() => {
    if (!open || !containerRef.current || chartRef.current) {
      return;
    }

    let disposed = false;
    let cleanupChart: (() => void) | null = null;

    const mount = async () => {
      const { createChart } = await import("lightweight-charts");
      if (disposed || !containerRef.current || chartRef.current) {
        return;
      }

      const host = containerRef.current;
      const chart = createChart(host, {
        width: Math.max(1, Math.floor(host.clientWidth)),
        height: Math.max(1, Math.floor(host.clientHeight)),
        layout: {
          background: { type: LIGHTWEIGHT_CHART_SOLID_BACKGROUND, color: "#070d16" },
          textColor: "#8ea0bf"
        },
        grid: {
          vertLines: { color: "rgba(78, 99, 138, 0.16)" },
          horzLines: { color: "rgba(78, 99, 138, 0.16)" }
        },
        rightPriceScale: {
          borderVisible: true,
          borderColor: "#1a2539"
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderVisible: true,
          borderColor: "#1a2539",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 4
        },
        crosshair: {
          mode: 0,
          vertLine: {
            color: "rgba(213, 223, 243, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#111a29"
          },
          horzLine: {
            color: "rgba(213, 223, 243, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#111a29"
          }
        }
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#1bae8a",
        downColor: "#f0455a",
        wickUpColor: "#1bae8a",
        wickDownColor: "#f0455a",
        borderUpColor: "#1bae8a",
        borderDownColor: "#f0455a",
        priceLineVisible: false,
        lastValueVisible: false
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !chartRef.current) {
          return;
        }
        chartRef.current.applyOptions({
          width: Math.max(1, Math.floor(entry.contentRect.width)),
          height: Math.max(1, Math.floor(entry.contentRect.height))
        });
      });
      resizeObserver.observe(host);

      if (sortedCandles.length > 0) {
        candleSeries.setData(sortedCandles);
        const rightIndex = sortedCandles.length - 1;
        const leftIndex = Math.max(0, rightIndex - 220);
        chart.timeScale().setVisibleRange({
          from: sortedCandles[leftIndex]!.time,
          to: sortedCandles[rightIndex]!.time
        });
      }

      const unmount = () => {
        resizeObserver.disconnect();
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        overlaySeriesRef.current = [];
        priceLinesRef.current = [];
        markersRef.current = [];
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
      clearTimers();
    };
  }, [clearTimers, open, sortedCandles]);

  useEffect(() => {
    if (!open || !candleSeriesRef.current) {
      return;
    }
    if (sortedCandles.length === 0) {
      return;
    }

    candleSeriesRef.current.setData(sortedCandles);
  }, [open, sortedCandles]);

  useEffect(() => {
    if (!open || !animation) {
      clearTimers();
      setIsPlaying(false);
      setProgress(0);
      setActiveStepIndex(-1);
      setBursts([]);
      return;
    }

    const timerId = window.setTimeout(() => {
      replay();
    }, 180);
    playbackTimeoutsRef.current.push(timerId);

    return () => {
      clearTimers();
    };
  }, [animation, clearTimers, open, replay]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !animation) {
    return null;
  }

  return (
    <div className="ai-animation-overlay" role="dialog" aria-modal="true" aria-label="Chart animation">
      <div className="ai-animation-backdrop" onClick={onClose} />
      <section className="ai-animation-modal">
        <header className="ai-animation-head">
          <div className="ai-animation-head-copy">
            <h3>{animation.title}</h3>
            <p>{animation.summary}</p>
          </div>
          <div className="ai-animation-head-actions">
            <button
              type="button"
              className="panel-action-btn ai-animation-btn"
              onClick={replay}
            >
              {isPlaying ? "Replay" : "Play"}
            </button>
            <button
              type="button"
              className="panel-action-btn ai-animation-btn"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>

        <div className="ai-animation-stage">
          <div ref={containerRef} className="ai-animation-chart" />

          <div className="ai-animation-hud">
            <div className="ai-animation-progress-track">
              <span
                className="ai-animation-progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="ai-animation-step-pill">
              {activeStepIndex >= 0
                ? animation.steps[activeStepIndex]?.label ?? "Playing"
                : "Preparing animation"}
            </div>
          </div>

          {bursts.map((burst) => (
            <span
              key={burst.id}
              className="ai-animation-burst"
              style={{
                left: `${burst.x}%`,
                top: `${burst.y}%`
              }}
              aria-hidden
            />
          ))}
        </div>

        <div className="ai-animation-timeline">
          {animation.steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`ai-animation-step${index === activeStepIndex ? " active" : ""}`}
              onClick={() => {
                const chart = chartRef.current;
                if (!chart) {
                  return;
                }
                clearTimers();
                clearOverlays();
                setActiveStepIndex(index);
                runStepActions(step.actions);
                emitBurst(index);
                setIsPlaying(false);
              }}
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
