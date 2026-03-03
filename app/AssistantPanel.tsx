"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import AssistantChartAnimationModal from "./AssistantChartAnimationModal";
import {
  type AssistantChartAnimation,
  resolveGraphTemplate
} from "../lib/assistant-tools";

export type AssistantPanelCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type AssistantPanelTrade = {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  result: "Win" | "Loss";
  entrySource: string;
  pnlPct: number;
  pnlUsd: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
  entryAt: string;
  exitAt: string;
};

export type AssistantPanelAction = {
  id: string;
  tradeId: string;
  symbol: string;
  label: string;
  details: string;
  time: string;
  timestamp: number;
};

export type AssistantPanelActiveTrade = {
  symbol: string;
  side: "Long" | "Short";
  units: number;
  entryPrice: number;
  markPrice: number;
  targetPrice: number;
  stopPrice: number;
  openedAt: number;
  openedAtLabel: string;
  elapsed: string;
  pnlPct: number;
  pnlValue: number;
  progressPct: number;
  rr: number;
};

type AssistantChart = {
  id: string;
  template: string;
  title: string;
  subtitle?: string;
  mode?: "static" | "dynamic";
  data: Array<Record<string, string | number>>;
  config?: Record<string, string | number | boolean>;
};

type AssistantBullet = {
  tone: "green" | "red" | "gold" | "black";
  text: string;
};

type AssistantChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  satisfied: boolean;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  bullets?: AssistantBullet[];
  charts?: AssistantChart[];
  chartActions?: Array<Record<string, unknown>>;
  chartAnimations?: AssistantChartAnimation[];
  requestChecklist?: AssistantChecklistItem[];
  toolsUsed?: string[];
  cannotAnswer?: boolean;
};

type AssistantApiResponse = {
  status: "ok" | "needs_backtest_data";
  reason?: string;
  response?: {
    cannotAnswer: boolean;
    cannotAnswerReason: string;
    shortAnswer: string;
    bullets: AssistantBullet[];
    charts: AssistantChart[];
    chartActions?: Array<Record<string, unknown>>;
    chartAnimations?: AssistantChartAnimation[];
    requestChecklist?: AssistantChecklistItem[];
    toolsUsed?: string[];
  };
  modelTrace?: {
    instruction: string;
    reasoning: string;
    coding: string;
    writer: string;
  } | null;
};

export type AssistantPanelProps = {
  symbol: string;
  timeframe: string;
  selectedCandles: AssistantPanelCandle[];
  activeTrade: AssistantPanelActiveTrade | null;
  historyRows: AssistantPanelTrade[];
  actionRows: AssistantPanelAction[];
  backtestHasRun: boolean;
  backtestTimeframe: string;
  backtestTrades: AssistantPanelTrade[];
  onRunChartActions?: (actions: Array<Record<string, unknown>>) => void;
};

const MAX_CONTEXT_CANDLES = 500;
const MAX_CONTEXT_HISTORY = 380;
const MAX_CONTEXT_ACTIONS = 360;
const MAX_CONTEXT_BACKTEST_WHEN_REQUESTED = 2200;

const PIE_COLORS = ["#13c98f", "#f0455a", "#bfc6d8", "#f0b84f"];
const DRAW_STAGE_RE =
  /\b(draw|mark|annotate|support|resistance|trendline|trend line|line|box|fvg|fair value gap|arrow|ruler)\b/i;
const GRAPH_STAGE_RE =
  /\b(graph|chart|plot|visual|visualize|indicator|rsi|macd|ema|sma|atr|volatility|trend|average|mean)\b/i;
const ANIMATION_STAGE_RE =
  /\b(animate|animation|video|replay|playback|walkthrough|demo)\b/i;
const DATA_STAGE_RE =
  /\b(history|backtest|clickhouse|monthly|weekly|daily|recent|window|from|between|since)\b/i;
const SOCIAL_STAGE_RE =
  /^(hi|hello|hey|yo|sup|what'?s up|how are you|gm|gn|good morning|good afternoon|good evening)[!.?\s]*$/i;

const normalizeToolPill = (value: string): string => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text;
};

const formatAnimationDuration = (durationMs: number): string => {
  const safe = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const seconds = safe / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
};

const boldText = (text: string): ReactNode[] => {
  const output: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      output.push(text.slice(lastIndex, match.index));
    }

    output.push(
      <strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>
    );

    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    output.push(text.slice(lastIndex));
  }

  return output;
};

const summarizeTrades = (rows: AssistantPanelTrade[]) => {
  let wins = 0;
  let losses = 0;
  let totalPnlUsd = 0;

  for (const row of rows) {
    if (row.result === "Win") {
      wins += 1;
    } else {
      losses += 1;
    }
    totalPnlUsd += row.pnlUsd;
  }

  const totalTrades = wins + losses;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return {
    totalTrades,
    wins,
    losses,
    winRatePct: Number(winRatePct.toFixed(2)),
    totalPnlUsd: Number(totalPnlUsd.toFixed(2))
  };
};

const takeTail = <T,>(rows: T[], count: number): T[] => {
  if (rows.length <= count) {
    return rows;
  }
  return rows.slice(rows.length - count);
};

const inferThinkingStages = (prompt: string): string[] => {
  const text = prompt.trim().toLowerCase();
  if (!text) {
    return ["Planning", "Reasoning"];
  }

  const isSocialOnly =
    SOCIAL_STAGE_RE.test(text) &&
    !DRAW_STAGE_RE.test(text) &&
    !GRAPH_STAGE_RE.test(text) &&
    !ANIMATION_STAGE_RE.test(text);

  if (isSocialOnly) {
    return ["Understanding Request", "Composing Reply"];
  }

  if (ANIMATION_STAGE_RE.test(text)) {
    return ["Planning Animation", "Preparing Chart Data", "Rendering Animation"];
  }

  if (DRAW_STAGE_RE.test(text)) {
    return ["Planning Drawings", "Preparing Chart Data", "Drawing on Chart"];
  }

  if (GRAPH_STAGE_RE.test(text)) {
    return ["Planning Graph", "Preparing Data", "Building Graph"];
  }

  if (DATA_STAGE_RE.test(text)) {
    return ["Planning", "Fetching Data", "Reasoning"];
  }

  return ["Planning", "Reasoning"];
};

export default function AssistantPanel(props: AssistantPanelProps) {
  const {
    symbol,
    timeframe,
    selectedCandles,
    activeTrade,
    historyRows,
    actionRows,
    backtestHasRun,
    backtestTimeframe,
    backtestTrades,
    onRunChartActions
  } = props;

  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: "How can I help you?"
    }
  ]);
  const [turns, setTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [thinkingStage, setThinkingStage] = useState("Analyzing");
  const [activeAnimation, setActiveAnimation] = useState<AssistantChartAnimation | null>(null);
  const [detailsExpandedByMessageId, setDetailsExpandedByMessageId] = useState<
    Record<string, boolean>
  >({});

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, isPending]);

  const backtestSummary = useMemo(() => summarizeTrades(backtestTrades), [backtestTrades]);

  const resetAssistantThread = useCallback(() => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: "How can I help you?"
      }
    ]);
    setTurns([]);
    setInput("");
    setThinkingStage("Analyzing");
    setIsPending(false);
    setActiveAnimation(null);
    setDetailsExpandedByMessageId({});

    if (typeof onRunChartActions === "function") {
      onRunChartActions([{ type: "clear_annotations" }]);
    }

    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [onRunChartActions]);

  const toggleMessageDetails = useCallback((messageId: string) => {
    setDetailsExpandedByMessageId((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }));
  }, []);

  const buildPayloadContext = useCallback(
    (includeBacktestData: boolean) => {
      const liveCandles = takeTail(selectedCandles, MAX_CONTEXT_CANDLES).map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0
      }));

      return {
        symbol,
        timeframe,
        liveCandles,
        activeTrade,
        historyRows: takeTail(historyRows, MAX_CONTEXT_HISTORY),
        actionRows: takeTail(actionRows, MAX_CONTEXT_ACTIONS),
        backtest: {
          hasRun: backtestHasRun,
          dataIncluded: includeBacktestData,
          timeframe: backtestTimeframe,
          summary: backtestHasRun ? backtestSummary : null,
          trades: includeBacktestData
            ? takeTail(backtestTrades, MAX_CONTEXT_BACKTEST_WHEN_REQUESTED)
            : []
        }
      };
    },
    [
      activeTrade,
      actionRows,
      backtestHasRun,
      backtestSummary,
      backtestTimeframe,
      backtestTrades,
      historyRows,
      selectedCandles,
      symbol,
      timeframe
    ]
  );

  const runAssistantRequest = useCallback(
    async (chatTurns: Array<{ role: "user" | "assistant"; content: string }>, includeBacktestData: boolean): Promise<AssistantApiResponse> => {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: chatTurns,
          context: buildPayloadContext(includeBacktestData)
        })
      });

      const payload = (await response.json()) as AssistantApiResponse;

      if (
        payload.status === "needs_backtest_data" &&
        backtestHasRun &&
        !includeBacktestData
      ) {
        return runAssistantRequest(chatTurns, true);
      }

      return payload;
    },
    [backtestHasRun, buildPayloadContext]
  );

  const submit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const prompt = input.trim();
      if (!prompt || isPending) {
        return;
      }

      const userMessage: AssistantMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt
      };

      const nextTurns = [...turns, { role: "user" as const, content: prompt }];

      setInput("");
      setMessages((current) => [...current, userMessage]);
      setTurns(nextTurns);
      setIsPending(true);
      const stagePlan = inferThinkingStages(prompt);
      setThinkingStage(stagePlan[0] ?? "Planning");

      const stageTimers = stagePlan.slice(1).map((stage, index) =>
        window.setTimeout(() => setThinkingStage(stage), 320 + index * 520)
      );

      try {
        const payload = await runAssistantRequest(nextTurns, false);

        if (payload.status !== "ok" || !payload.response) {
          const errorMessage: AssistantMessage = {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            content: payload.reason || "I cannot answer this request right now.",
            bullets: [
              {
                tone: "gold",
                text: payload.reason || "I cannot answer this request right now."
              }
            ],
            cannotAnswer: true
          };

          setMessages((current) => [...current, errorMessage]);
          setTurns((current) => [
            ...current,
            { role: "assistant", content: errorMessage.content }
          ]);
          return;
        }

        const assistantContentCandidates = [
          payload.response.shortAnswer,
          payload.response.bullets[0]?.text,
          payload.response.cannotAnswerReason
        ];
        const assistantContent =
          assistantContentCandidates.find(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          ) ?? "";

        const assistantMessage: AssistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          bullets: payload.response.bullets,
          charts: payload.response.charts,
          chartActions: payload.response.chartActions,
          chartAnimations: Array.isArray(payload.response.chartAnimations)
            ? payload.response.chartAnimations
            : [],
          requestChecklist: Array.isArray(payload.response.requestChecklist)
            ? payload.response.requestChecklist
            : [],
          toolsUsed: Array.isArray(payload.response.toolsUsed)
            ? payload.response.toolsUsed.map(normalizeToolPill).filter((tool) => tool.length > 0)
            : [],
          cannotAnswer: payload.response.cannotAnswer
        };

        const hasAnimationResponse =
          Array.isArray(payload.response.chartAnimations) &&
          payload.response.chartAnimations.length > 0;

        if (
          !hasAnimationResponse &&
          Array.isArray(payload.response.chartActions) &&
          payload.response.chartActions.length > 0 &&
          typeof onRunChartActions === "function"
        ) {
          onRunChartActions(payload.response.chartActions);
        }

        setMessages((current) => [...current, assistantMessage]);
        setTurns((current) => [
          ...current,
          { role: "assistant", content: assistantContent }
        ]);
      } catch (error) {
        const fallback =
          error instanceof Error
            ? `I cannot answer due to an assistant request error: ${error.message}`
            : "I cannot answer due to an assistant request error.";

        const assistantMessage: AssistantMessage = {
          id: `assistant-catch-${Date.now()}`,
          role: "assistant",
          content: fallback,
          bullets: [{ tone: "gold", text: fallback }],
          cannotAnswer: true
        };

        setMessages((current) => [...current, assistantMessage]);
        setTurns((current) => [
          ...current,
          { role: "assistant", content: fallback }
        ]);
      } finally {
        stageTimers.forEach((timerId) => window.clearTimeout(timerId));
        setIsPending(false);
        setThinkingStage("Analyzing");
      }
    },
    [input, isPending, onRunChartActions, runAssistantRequest, turns]
  );

  const renderChart = (chart: AssistantChart) => {
    const family = resolveGraphTemplate(chart.template).family;
    const sampleRow = chart.data[0] ?? {};
    const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(sampleRow, key);
    const xKey = hasKey("x")
      ? "x"
      : hasKey("month")
        ? "month"
        : hasKey("bucket")
          ? "bucket"
          : hasKey("session")
            ? "session"
            : hasKey("label")
              ? "label"
              : "x";

    if (family === "equity_curve" && hasKey("equity")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 18} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={48} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Line type="monotone" dataKey="equity" stroke="#13c98f" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (family === "pnl_distribution" && hasKey("count")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 10} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={42} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Bar dataKey="count" fill="#2d6cff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (family === "session_performance" && hasKey("session") && hasKey("pnl")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="session" tick={{ fill: "#8b94a8", fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fill: "#8b94a8", fontSize: 10 }} width={48} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#8b94a8", fontSize: 10 }} width={44} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#b8c1d5" }} />
            <Bar yAxisId="left" dataKey="pnl" fill="#2d6cff" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="#f0b84f" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (family === "trade_outcomes" && hasKey("value") && hasKey("label")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Pie
              data={chart.data}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={3}
            >
              {chart.data.map((_, index) => (
                <Cell key={`${chart.id}-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11, color: "#b8c1d5" }} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (family === "price_action" && hasKey("high") && hasKey("low") && hasKey("close")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 20} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={52} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Area type="monotone" dataKey="high" stroke="rgba(45,108,255,0.25)" fill="rgba(45,108,255,0.12)" />
            <Area type="monotone" dataKey="low" stroke="rgba(240,69,90,0.25)" fill="rgba(240,69,90,0.10)" />
            <Line type="monotone" dataKey="close" stroke="#13c98f" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (family === "price_action" && hasKey("value")) {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 16} />
            <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={52} />
            <Tooltip
              contentStyle={{
                background: "#0e1521",
                border: "1px solid #1f2a40",
                color: "#d4dae5"
              }}
            />
            <Line type="monotone" dataKey="value" stroke="#13c98f" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    const fallbackYKey = hasKey("count") ? "count" : hasKey("value") ? "value" : "count";

    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart.data}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey={xKey} tick={{ fill: "#8b94a8", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={42} />
          <Tooltip
            contentStyle={{
              background: "#0e1521",
              border: "1px solid #1f2a40",
              color: "#d4dae5"
            }}
          />
          <Bar dataKey={fallbackYKey} fill="#8797ba" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderChartCards = (charts: AssistantChart[]) => (
    <div className="ai-chart-grid">
      {charts.map((chart) => {
        const templateMeta = resolveGraphTemplate(chart.template);
        const mode = chart.mode ?? templateMeta.mode;
        return (
          <section key={chart.id} className="ai-chart-card">
            <div className="ai-chart-head">
              <strong>{chart.title}</strong>
              <div className="ai-chart-head-meta">
                <span className={`ai-chart-mode-pill mode-${mode}`}>
                  {mode === "dynamic" ? "Dynamic" : "Static"}
                </span>
                {chart.subtitle ? <small>{chart.subtitle}</small> : null}
              </div>
            </div>
            <div className="ai-chart-body">{renderChart(chart)}</div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="ai-tab-shell">
      <div className="watchlist-head ai-head">
        <div>
          <h2>Gideon</h2>
        </div>
        <button
          type="button"
          className="panel-action-btn ai-reset-btn"
          onClick={resetAssistantThread}
          disabled={isPending}
        >
          Reset
        </button>
      </div>

      <div className="ai-thread" ref={messageListRef} aria-live="polite">
        {messages.map((message) => {
          const hasTools = Boolean(message.toolsUsed && message.toolsUsed.length > 0);
          const hasBullets = Boolean(message.bullets && message.bullets.length > 0);
          const hasChecklist = Boolean(message.requestChecklist && message.requestChecklist.length > 0);
          const hasDetails = message.role === "assistant" && (hasTools || hasBullets || hasChecklist);
          const detailsExpanded = hasDetails && Boolean(detailsExpandedByMessageId[message.id]);

          return (
          <article
            key={message.id}
            className={`ai-msg ${message.role === "assistant" ? "assistant" : "user"}`}
          >
            <header className="ai-msg-head">
              <span>{message.role === "assistant" ? "Gideon" : "You"}</span>
              {message.cannotAnswer ? <small className="ai-cannot">Insufficient Data</small> : null}
            </header>

            <p className="ai-msg-content">{boldText(message.content)}</p>

            {hasDetails ? (
              <button
                type="button"
                className="ai-details-toggle"
                onClick={() => toggleMessageDetails(message.id)}
                aria-expanded={detailsExpanded}
              >
                {detailsExpanded ? "Hide Details" : "Details"}
              </button>
            ) : null}

            {detailsExpanded ? (
              <section className="ai-details-panel">
                {hasTools ? (
                  <div className="ai-tool-pills" aria-label="tools used">
                    {message.toolsUsed!.map((tool, index) => (
                      <span className="ai-tool-pill" key={`${message.id}-tool-${index}`}>
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : null}

                {hasBullets ? (
                  <ul className="ai-bullets">
                    {message.bullets!.map((bullet, index) => (
                      <li key={`${message.id}-bullet-${index}`} className={`tone-${bullet.tone}`}>
                        <span className="ai-bullet-dot" aria-hidden>
                          •
                        </span>
                        <span>{boldText(bullet.text)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {hasChecklist ? (
                  <ul className="ai-checklist">
                    {message.requestChecklist!.map((item) => (
                      <li
                        key={`${message.id}-check-${item.id}`}
                        className={item.satisfied ? "done" : "todo"}
                      >
                        <span className="ai-check-status" aria-hidden>
                          {item.satisfied ? "✓" : "○"}
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {message.charts && message.charts.length > 0 ? (
              <>
                {message.charts.some((chart) => resolveGraphTemplate(chart.template).mode === "static") ? (
                  <section className="ai-chart-group">
                    <header className="ai-chart-group-head">
                      <span>Static Charts</span>
                    </header>
                    {renderChartCards(
                      message.charts.filter(
                        (chart) => resolveGraphTemplate(chart.template).mode === "static"
                      )
                    )}
                  </section>
                ) : null}

                {message.charts.some((chart) => resolveGraphTemplate(chart.template).mode === "dynamic") ? (
                  <section className="ai-chart-group">
                    <header className="ai-chart-group-head">
                      <span>Dynamic Indicators</span>
                    </header>
                    {renderChartCards(
                      message.charts.filter(
                        (chart) => resolveGraphTemplate(chart.template).mode === "dynamic"
                      )
                    )}
                  </section>
                ) : null}
              </>
            ) : null}

            {message.chartAnimations && message.chartAnimations.length > 0 ? (
              <section className="ai-animation-grid">
                {message.chartAnimations.map((animation) => (
                  <button
                    key={animation.id}
                    type="button"
                    className={`ai-animation-thumb theme-${animation.theme}`}
                    onClick={() => setActiveAnimation(animation)}
                  >
                    <span className="ai-animation-thumb-play" aria-hidden>
                      ▶
                    </span>
                    <div className="ai-animation-thumb-copy">
                      <strong>{animation.thumbnailTitle || animation.title}</strong>
                      <span>{animation.thumbnailSubtitle || animation.summary}</span>
                    </div>
                    <div className="ai-animation-thumb-meta">
                      <span>{animation.steps.length} steps</span>
                      <span>{formatAnimationDuration(animation.durationMs)}</span>
                    </div>
                  </button>
                ))}
              </section>
            ) : null}

          </article>
        )})}

        {isPending ? (
          <article className="ai-msg assistant pending">
            <header className="ai-msg-head">
              <span>Gideon</span>
              <small className="ai-stage">{thinkingStage}</small>
            </header>
            <div className="ai-thinking" aria-label="assistant thinking">
              <span />
              <span />
              <span />
            </div>
          </article>
        ) : null}
      </div>

      <form className="ai-compose" onSubmit={submit}>
        <label htmlFor="ai-input" className="ai-compose-label">
          Prompt
        </label>
        <textarea
          id="ai-input"
          ref={inputRef}
          className="ai-compose-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="How can I help you?"
          disabled={isPending}
        />
        <div className="ai-compose-meta">
          <span>
            Backtest {backtestHasRun ? `${backtestSummary.totalTrades.toLocaleString("en-US")} rows available` : "not run"}
          </span>
          <button type="submit" className="panel-action-btn ai-send-btn" disabled={isPending || input.trim().length === 0}>
            {isPending ? "Thinking..." : "Send"}
          </button>
        </div>
      </form>

      <AssistantChartAnimationModal
        open={activeAnimation !== null}
        animation={activeAnimation}
        candles={selectedCandles}
        onClose={() => setActiveAnimation(null)}
      />
    </div>
  );
}
