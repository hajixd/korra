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

type AnimationClickPulse = {
  id: number;
  x: number;
  y: number;
};

type AnimationCursor = {
  visible: boolean;
  x: number;
  y: number;
  clicking: boolean;
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

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [clickPulses, setClickPulses] = useState<AnimationClickPulse[]>([]);
  const [cursor, setCursor] = useState<AnimationCursor>({
    visible: false,
    x: 78,
    y: 58,
    clicking: false
  });
  const [chartReadyVersion, setChartReadyVersion] = useState(0);

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
        timeMs: row.time,
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

  const getNearestCandle = useCallback(
    (targetTimeMs: number | null) => {
      if (sortedCandles.length === 0) {
        return null;
      }
      if (!Number.isFinite(targetTimeMs)) {
        return sortedCandles[sortedCandles.length - 1] ?? null;
      }
      let nearest = sortedCandles[0]!;
      let nearestDistance = Math.abs(nearest.timeMs - Number(targetTimeMs));
      for (let index = 1; index < sortedCandles.length; index += 1) {
        const row = sortedCandles[index]!;
        const distance = Math.abs(row.timeMs - Number(targetTimeMs));
        if (distance < nearestDistance) {
          nearest = row;
          nearestDistance = distance;
        }
      }
      return nearest;
    },
    [sortedCandles]
  );

  const inferActionTimeMs = useCallback((actions: AssistantChartAction[]): number | null => {
    for (const action of actions) {
      const candidates = [action.time, action.timeEnd, action.timeStart];
      for (const candidate of candidates) {
        if (Number.isFinite(candidate)) {
          return Number(candidate);
        }
      }
    }
    return null;
  }, []);

  const inferActionPrice = useCallback((actions: AssistantChartAction[]): number | null => {
    for (const action of actions) {
      if (
        action.type === "draw_support_resistance" &&
        Number.isFinite(action.priceStart) &&
        Number.isFinite(action.priceEnd)
      ) {
        return (Number(action.priceStart) + Number(action.priceEnd)) / 2;
      }

      const candidates = [
        action.entryPrice,
        action.price,
        action.targetPrice,
        action.stopPrice,
        action.priceEnd,
        action.priceStart
      ];
      for (const candidate of candidates) {
        if (Number.isFinite(candidate)) {
          return Number(candidate);
        }
      }
    }
    return null;
  }, []);

  const resolveStepPoint = useCallback(
    (
      actions: AssistantChartAction[],
      overrides?: { timeMs?: number | null; price?: number | null }
    ): { x: number; y: number } => {
      const host = containerRef.current;
      const chart = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const fallback = { x: 78, y: 58 };

      if (!host || !chart || !candleSeries || sortedCandles.length === 0) {
        return fallback;
      }

      const width = Math.max(1, Math.floor(host.clientWidth));
      const height = Math.max(1, Math.floor(host.clientHeight));
      if (width <= 2 || height <= 2) {
        return fallback;
      }

      const targetTimeMs =
        Number.isFinite(overrides?.timeMs) ? Number(overrides?.timeMs) : inferActionTimeMs(actions);
      const nearest = getNearestCandle(targetTimeMs);
      const effectiveTimeMs = Number.isFinite(targetTimeMs) ? Number(targetTimeMs) : nearest?.timeMs;
      const effectivePrice =
        (Number.isFinite(overrides?.price) ? Number(overrides?.price) : null) ??
        inferActionPrice(actions) ??
        nearest?.close ??
        sortedCandles[sortedCandles.length - 1]?.close ??
        0;

      const xCoord = Number.isFinite(effectiveTimeMs)
        ? chart.timeScale().timeToCoordinate(toChartTime(Number(effectiveTimeMs)))
        : null;
      const yCoord = Number.isFinite(effectivePrice)
        ? candleSeries.priceToCoordinate(Number(effectivePrice))
        : null;

      const xPx = Number.isFinite(xCoord) ? Number(xCoord) : width * 0.82;
      const yPx = Number.isFinite(yCoord) ? Number(yCoord) : height * 0.55;

      return {
        x: Number(((clamp(xPx, 8, width - 8) / width) * 100).toFixed(2)),
        y: Number(((clamp(yPx, 8, height - 8) / height) * 100).toFixed(2))
      };
    },
    [getNearestCandle, inferActionPrice, inferActionTimeMs, sortedCandles]
  );

  const resolveSupportResistancePoints = useCallback(
    (actions: AssistantChartAction[]): Array<{ x: number; y: number }> => {
      const srAction = actions.find(
        (action) =>
          action.type === "draw_support_resistance" &&
          Number.isFinite(action.priceStart) &&
          Number.isFinite(action.priceEnd)
      );

      if (!srAction) {
        return [];
      }

      const targetTimeMs =
        Number.isFinite(srAction.time) ? Number(srAction.time) : inferActionTimeMs(actions);
      const supportPoint = resolveStepPoint(actions, {
        timeMs: targetTimeMs,
        price: Number(srAction.priceStart)
      });
      const resistancePoint = resolveStepPoint(actions, {
        timeMs: targetTimeMs,
        price: Number(srAction.priceEnd)
      });

      return [supportPoint, resistancePoint];
    },
    [inferActionTimeMs, resolveStepPoint]
  );

  const moveCursorToPoint = useCallback((point: { x: number; y: number }) => {
    setCursor((current) => ({
      ...current,
      visible: true,
      x: point.x,
      y: point.y,
      clicking: false
    }));
  }, []);

  const emitClickPulse = useCallback((point: { x: number; y: number }) => {
    const id = Date.now() + Math.floor(Math.random() * 1_000_000);
    setClickPulses((current) => [...current, { id, x: point.x, y: point.y }].slice(-24));
    setCursor((current) => ({
      ...current,
      visible: true,
      x: point.x,
      y: point.y,
      clicking: true
    }));

    const releaseId = window.setTimeout(() => {
      setCursor((current) => ({ ...current, clicking: false }));
    }, 120);
    playbackTimeoutsRef.current.push(releaseId);

    const clearId = window.setTimeout(() => {
      setClickPulses((current) => current.filter((entry) => entry.id !== id));
    }, 640);
    playbackTimeoutsRef.current.push(clearId);
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
          time: row.timeMs,
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
    setClickPulses([]);
    setProgress(0);
    setActiveStepIndex(-1);
    setIsPlaying(true);
    setCursor((current) => ({ ...current, visible: true, clicking: false }));

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

    const cursorLeadMs = 230;
    animation.steps.forEach((step, index) => {
      const stepPoint = resolveStepPoint(step.actions);
      const srPoints = resolveSupportResistancePoints(step.actions);
      const moveTimerId = window.setTimeout(() => {
        setActiveStepIndex(index);
        moveCursorToPoint(srPoints[0] ?? stepPoint);
      }, Math.max(0, step.atMs - cursorLeadMs));
      playbackTimeoutsRef.current.push(moveTimerId);

      const timerId = window.setTimeout(() => {
        setActiveStepIndex(index);
        if (srPoints.length === 2) {
          const supportPoint = srPoints[0]!;
          const resistancePoint = srPoints[1]!;
          moveCursorToPoint(supportPoint);
          emitClickPulse(supportPoint);

          const secondTapTimerId = window.setTimeout(() => {
            moveCursorToPoint(resistancePoint);
            emitClickPulse(resistancePoint);
          }, 150);
          playbackTimeoutsRef.current.push(secondTapTimerId);

          const drawTimerId = window.setTimeout(() => {
            runStepActions(step.actions);
          }, 230);
          playbackTimeoutsRef.current.push(drawTimerId);
          return;
        }

        moveCursorToPoint(stepPoint);
        emitClickPulse(stepPoint);
        runStepActions(step.actions);
      }, step.atMs);
      playbackTimeoutsRef.current.push(timerId);
    });

    const endTimer = window.setTimeout(() => {
      clearTimers();
      setProgress(1);
      setIsPlaying(false);
      setActiveStepIndex(animation.steps.length - 1);
      setCursor((current) => ({ ...current, clicking: false }));
    }, totalDuration + 40);
    playbackTimeoutsRef.current.push(endTimer);
  }, [
    animation,
    clearOverlays,
    clearTimers,
    emitClickPulse,
    moveCursorToPoint,
    resolveSupportResistancePoints,
    resolveStepPoint,
    runStepActions,
    sortedCandles
  ]);

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
          background: { type: LIGHTWEIGHT_CHART_SOLID_BACKGROUND, color: "#090d13" },
          textColor: "#7f889d"
        },
        localization: {
          priceFormatter: (price: number) =>
            Number(price).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4
            }),
          timeFormatter: (time: number) => {
            const date = new Date(time * 1000);
            const hh = String(date.getUTCHours()).padStart(2, "0");
            const mm = String(date.getUTCMinutes()).padStart(2, "0");
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");
            return `${date.getUTCFullYear()}-${month}-${day} ${hh}:${mm}`;
          }
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false }
        },
        rightPriceScale: {
          borderVisible: true,
          borderColor: "#182131"
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderVisible: true,
          borderColor: "#182131",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3,
          shiftVisibleRangeOnNewBar: false,
          tickMarkFormatter: (time: number) => {
            const date = new Date(time * 1000);
            const hh = String(date.getUTCHours()).padStart(2, "0");
            const mm = String(date.getUTCMinutes()).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");
            const months = [
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
              "Dec"
            ];
            const month = months[date.getUTCMonth()];
            if (hh === "00" && mm === "00") {
              return `${day} ${month}`;
            }
            return `${hh}:${mm}`;
          }
        },
        crosshair: {
          mode: 0,
          vertLine: {
            color: "rgba(198, 208, 228, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#141c2a"
          },
          horzLine: {
            color: "rgba(198, 208, 228, 0.28)",
            width: 1,
            style: 3,
            labelBackgroundColor: "#141c2a"
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
        upColor: "#1bae8a",
        downColor: "#f0455a",
        wickUpColor: "#1bae8a",
        wickDownColor: "#f0455a",
        borderUpColor: "#1bae8a",
        borderDownColor: "#f0455a",
        priceLineVisible: true,
        priceLineStyle: 3,
        priceLineColor: "rgba(27, 174, 138, 0.72)",
        priceLineWidth: 1,
        lastValueVisible: false
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      setChartReadyVersion((value) => value + 1);

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
      setClickPulses([]);
      setCursor((current) => ({ ...current, visible: false, clicking: false }));
      return;
    }

    const timerId = window.setTimeout(() => {
      replay();
    }, 180);
    playbackTimeoutsRef.current.push(timerId);

    return () => {
      clearTimers();
    };
  }, [animation, chartReadyVersion, clearTimers, open, replay]);

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

          {clickPulses.map((pulse) => (
            <span
              key={pulse.id}
              className="ai-animation-click"
              style={{
                left: `${pulse.x}%`,
                top: `${pulse.y}%`
              }}
              aria-hidden
            />
          ))}

          {cursor.visible ? (
            <span
              className={`ai-animation-cursor${cursor.clicking ? " clicking" : ""}`}
              style={{
                left: `${cursor.x}%`,
                top: `${cursor.y}%`
              }}
              aria-hidden
            />
          ) : null}
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
                const srPoints = resolveSupportResistancePoints(step.actions);
                if (srPoints.length === 2) {
                  const supportPoint = srPoints[0]!;
                  const resistancePoint = srPoints[1]!;
                  moveCursorToPoint(supportPoint);
                  emitClickPulse(supportPoint);
                  const secondTapTimerId = window.setTimeout(() => {
                    moveCursorToPoint(resistancePoint);
                    emitClickPulse(resistancePoint);
                  }, 150);
                  playbackTimeoutsRef.current.push(secondTapTimerId);
                  const drawTimerId = window.setTimeout(() => {
                    runStepActions(step.actions);
                  }, 230);
                  playbackTimeoutsRef.current.push(drawTimerId);
                } else {
                  const stepPoint = resolveStepPoint(step.actions);
                  moveCursorToPoint(stepPoint);
                  emitClickPulse(stepPoint);
                  runStepActions(step.actions);
                }
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
