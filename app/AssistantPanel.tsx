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
  template:
    | "equity_curve"
    | "pnl_distribution"
    | "session_performance"
    | "trade_outcomes"
    | "price_action"
    | "action_timeline";
  title: string;
  subtitle?: string;
  data: Array<Record<string, string | number>>;
  config?: Record<string, string | number | boolean>;
};

type AssistantBullet = {
  tone: "green" | "red" | "gold" | "black";
  text: string;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  bullets?: AssistantBullet[];
  charts?: AssistantChart[];
  chartActions?: Array<Record<string, unknown>>;
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

const normalizeToolPill = (value: string): string => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text;
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

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, isPending]);

  const historySummary = useMemo(() => summarizeTrades(historyRows), [historyRows]);
  const backtestSummary = useMemo(() => summarizeTrades(backtestTrades), [backtestTrades]);

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
      setThinkingStage("Planning");

      const stageTimers = [
        window.setTimeout(() => setThinkingStage("Reasoning"), 350),
        window.setTimeout(() => setThinkingStage("Building Charts"), 900)
      ];

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

        const assistantContent =
          payload.response.shortAnswer ||
          (payload.response.cannotAnswer
            ? payload.response.cannotAnswerReason
            : payload.response.bullets[0]?.text || "Done.");

        const assistantMessage: AssistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          bullets: payload.response.bullets,
          charts: payload.response.charts,
          chartActions: payload.response.chartActions,
          toolsUsed: Array.isArray(payload.response.toolsUsed)
            ? payload.response.toolsUsed.map(normalizeToolPill).filter((tool) => tool.length > 0)
            : [],
          cannotAnswer: payload.response.cannotAnswer
        };

        if (
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
    if (chart.template === "equity_curve") {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="x" tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 18} />
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

    if (chart.template === "pnl_distribution") {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="bucket" tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 10} />
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

    if (chart.template === "session_performance") {
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

    if (chart.template === "trade_outcomes") {
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

    if (chart.template === "price_action") {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chart.data}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="x" tick={{ fill: "#8b94a8", fontSize: 10 }} hide={chart.data.length > 20} />
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

    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart.data}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="label" tick={{ fill: "#8b94a8", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8b94a8", fontSize: 10 }} width={42} />
          <Tooltip
            contentStyle={{
              background: "#0e1521",
              border: "1px solid #1f2a40",
              color: "#d4dae5"
            }}
          />
          <Bar dataKey="count" fill="#8797ba" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="ai-tab-shell">
      <div className="watchlist-head ai-head">
        <div>
          <h2>AI Assistant</h2>
          <p>
            {symbol} · {timeframe} · Live candles {selectedCandles.length.toLocaleString("en-US")} · History {historySummary.totalTrades.toLocaleString("en-US")}
          </p>
        </div>
      </div>

      <div className="ai-thread" ref={messageListRef} aria-live="polite">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`ai-msg ${message.role === "assistant" ? "assistant" : "user"}`}
          >
            <header className="ai-msg-head">
              <span>{message.role === "assistant" ? "Korra AI" : "You"}</span>
              {message.cannotAnswer ? <small className="ai-cannot">Insufficient Data</small> : null}
            </header>

            <p className="ai-msg-content">{boldText(message.content)}</p>

            {message.toolsUsed && message.toolsUsed.length > 0 ? (
              <div className="ai-tool-pills" aria-label="tools used">
                {message.toolsUsed.map((tool, index) => (
                  <span className="ai-tool-pill" key={`${message.id}-tool-${index}`}>
                    {tool}
                  </span>
                ))}
              </div>
            ) : null}

            {message.bullets && message.bullets.length > 0 ? (
              <ul className="ai-bullets">
                {message.bullets.map((bullet, index) => (
                  <li key={`${message.id}-bullet-${index}`} className={`tone-${bullet.tone}`}>
                    <span className="ai-bullet-dot" aria-hidden>
                      •
                    </span>
                    <span>{boldText(bullet.text)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {message.charts && message.charts.length > 0 ? (
              <div className="ai-chart-grid">
                {message.charts.map((chart) => (
                  <section key={chart.id} className="ai-chart-card">
                    <div className="ai-chart-head">
                      <strong>{chart.title}</strong>
                      {chart.subtitle ? <small>{chart.subtitle}</small> : null}
                    </div>
                    <div className="ai-chart-body">{renderChart(chart)}</div>
                  </section>
                ))}
              </div>
            ) : null}

          </article>
        ))}

        {isPending ? (
          <article className="ai-msg assistant pending">
            <header className="ai-msg-head">
              <span>Korra AI</span>
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
    </div>
  );
}
