"use client";

import { useEffect, useMemo, type CSSProperties } from "react";

type GideonWorkViewProps = {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  thinkingStage: string;
  stagePlan: string[];
  latestPrompt: string;
  latestResponse: string;
  latestTools: string[];
  latestChartCount: number;
  latestAnimationCount: number;
  latestChecklistCount: number;
  latestHasStrategyDraft: boolean;
  latestCannotAnswer: boolean;
  symbol: string;
  timeframe: string;
  candleCount: number;
  historyCount: number;
  actionCount: number;
};

type OfficeRoom = {
  id: string;
  name: string;
  purpose: string;
  accent: string;
  gridColumn: string;
  gridRow: string;
  agentIds: string[];
};

type OfficeAgent = {
  id: string;
  badge: string;
  name: string;
  title: string;
  roomId: string;
  activeCopy: string;
  readyCopy: string;
  idleCopy: string;
};

const OFFICE_ROOMS: OfficeRoom[] = [
  {
    id: "briefing",
    name: "Briefing Lobby",
    purpose: "Prompt intake, ambiguity scan, and first-pass scope control.",
    accent: "#7ca8ff",
    gridColumn: "1 / span 4",
    gridRow: "1 / span 1",
    agentIds: ["intake", "clarifier"]
  },
  {
    id: "routing",
    name: "Routing Deck",
    purpose: "Depth estimate, agent fanout, and concurrency limits.",
    accent: "#9a8cff",
    gridColumn: "5 / span 3",
    gridRow: "1 / span 1",
    agentIds: ["supervisor", "depth"]
  },
  {
    id: "memory",
    name: "Memory Vault",
    purpose: "Thread memory, recent context, and draft continuity.",
    accent: "#66d7c4",
    gridColumn: "8 / span 3",
    gridRow: "1 / span 1",
    agentIds: ["memory"]
  },
  {
    id: "market",
    name: "Market Bay",
    purpose: "Live market context, XAUUSD reads, and symbol focus.",
    accent: "#5aca8c",
    gridColumn: "11 / span 2",
    gridRow: "1 / span 1",
    agentIds: ["market", "signal"]
  },
  {
    id: "research",
    name: "Research Library",
    purpose: "Current-events browsing, source checks, and freshness gates.",
    accent: "#57c5ff",
    gridColumn: "1 / span 3",
    gridRow: "2 / span 1",
    agentIds: ["research"]
  },
  {
    id: "stats",
    name: "Stats Lab",
    purpose: "Metric extraction, distributions, and backtest summaries.",
    accent: "#86d873",
    gridColumn: "4 / span 3",
    gridRow: "2 / span 1",
    agentIds: ["stats", "indicator"]
  },
  {
    id: "tools",
    name: "Tool Dock",
    purpose: "Deterministic executors, data fetches, and runtime handoffs.",
    accent: "#f2b56d",
    gridColumn: "7 / span 3",
    gridRow: "2 / span 1",
    agentIds: ["toolsmith"]
  },
  {
    id: "templates",
    name: "Template Loft",
    purpose: "Graph blueprints, answer frames, and reusable render layouts.",
    accent: "#d78dff",
    gridColumn: "10 / span 3",
    gridRow: "2 / span 1",
    agentIds: ["templater"]
  },
  {
    id: "strategy",
    name: "Strategy Atelier",
    purpose: "Model-tab strategy drafting and JSON assembly.",
    accent: "#ff9378",
    gridColumn: "1 / span 4",
    gridRow: "3 / span 2",
    agentIds: ["strategist", "modeler"]
  },
  {
    id: "charts",
    name: "Chart Studio",
    purpose: "Chart previews, overlays, graph plans, and visual reasoning.",
    accent: "#6cb8ff",
    gridColumn: "5 / span 4",
    gridRow: "3 / span 2",
    agentIds: ["charter", "animator"]
  },
  {
    id: "cinema",
    name: "Replay Cinema",
    purpose: "Animated walkthroughs, step timing, and playback polish.",
    accent: "#f0c75b",
    gridColumn: "9 / span 4",
    gridRow: "3 / span 1",
    agentIds: ["cinema"]
  },
  {
    id: "code",
    name: "Code Forge",
    purpose: "Strategy code, indicator math, and tool scaffolding.",
    accent: "#5ee0bd",
    gridColumn: "9 / span 2",
    gridRow: "4 / span 1",
    agentIds: ["coder"]
  },
  {
    id: "narrative",
    name: "Narrative Lounge",
    purpose: "Answer drafting, trimming, and user-facing clarity.",
    accent: "#9cb0ff",
    gridColumn: "11 / span 2",
    gridRow: "4 / span 1",
    agentIds: ["writer"]
  },
  {
    id: "audit",
    name: "Audit Terrace",
    purpose: "Scope checks, unsupported-claim filters, and extra-stuff removal.",
    accent: "#f09a9a",
    gridColumn: "1 / span 6",
    gridRow: "5 / span 1",
    agentIds: ["auditor", "sentinel"]
  },
  {
    id: "hearth",
    name: "Hearth Lounge",
    purpose: "Idle agents cool off here between runs and keep a soft watch.",
    accent: "#d8a76c",
    gridColumn: "7 / span 6",
    gridRow: "5 / span 1",
    agentIds: []
  }
];

const OFFICE_AGENTS: OfficeAgent[] = [
  {
    id: "intake",
    badge: "IN",
    name: "Intake",
    title: "Goal Parser",
    roomId: "briefing",
    activeCopy: "breaking the ask into clean goals",
    readyCopy: "holding the brief at the front desk",
    idleCopy: "sorting fresh prompts by the window"
  },
  {
    id: "clarifier",
    badge: "CQ",
    name: "Clarifier",
    title: "Ambiguity Guard",
    roomId: "briefing",
    activeCopy: "checking whether anything is underspecified",
    readyCopy: "watching for hidden assumptions",
    idleCopy: "flipping through edge-case notes"
  },
  {
    id: "supervisor",
    badge: "SV",
    name: "Supervisor",
    title: "Flow Lead",
    roomId: "routing",
    activeCopy: "routing work across the office",
    readyCopy: "keeping agent lanes open",
    idleCopy: "reviewing the board from the mezzanine"
  },
  {
    id: "depth",
    badge: "DP",
    name: "Depth",
    title: "Complexity Scout",
    roomId: "routing",
    activeCopy: "estimating answer depth and fanout",
    readyCopy: "warming up deeper branches",
    idleCopy: "quietly benchmarking response paths"
  },
  {
    id: "memory",
    badge: "MV",
    name: "Memory",
    title: "Context Keeper",
    roomId: "memory",
    activeCopy: "packing thread memory and local context",
    readyCopy: "pinning the latest state snapshot",
    idleCopy: "organizing prior drafts on low shelves"
  },
  {
    id: "market",
    badge: "MK",
    name: "Market",
    title: "Price Reader",
    roomId: "market",
    activeCopy: "tracking live market context",
    readyCopy: "holding symbol and timeframe context",
    idleCopy: "watching the gold board in soft light"
  },
  {
    id: "signal",
    badge: "SG",
    name: "Signal",
    title: "Structure Scout",
    roomId: "market",
    activeCopy: "reading swings, structure, and price behavior",
    readyCopy: "lining up directional cues",
    idleCopy: "sketching levels on tracing paper"
  },
  {
    id: "research",
    badge: "RS",
    name: "Research",
    title: "Source Runner",
    roomId: "research",
    activeCopy: "checking live sources and citations",
    readyCopy: "keeping freshness gates armed",
    idleCopy: "restacking source binders"
  },
  {
    id: "stats",
    badge: "ST",
    name: "Stats",
    title: "Quant Lead",
    roomId: "stats",
    activeCopy: "building distributions and answer metrics",
    readyCopy: "staging recent performance summaries",
    idleCopy: "annotating the whiteboard in green ink"
  },
  {
    id: "indicator",
    badge: "ID",
    name: "Indicator",
    title: "Signal Math",
    roomId: "stats",
    activeCopy: "deriving indicator and stat layers",
    readyCopy: "lining up derived series",
    idleCopy: "tuning formula sheets beside the fern"
  },
  {
    id: "toolsmith",
    badge: "TL",
    name: "Toolsmith",
    title: "Runtime Operator",
    roomId: "tools",
    activeCopy: "running deterministic tools and fetches",
    readyCopy: "keeping executor lanes hot",
    idleCopy: "polishing tool rails in the dock"
  },
  {
    id: "templater",
    badge: "TP",
    name: "Templater",
    title: "Blueprint Curator",
    roomId: "templates",
    activeCopy: "matching templates to the request",
    readyCopy: "staging chart and answer shells",
    idleCopy: "filing render blueprints upstairs"
  },
  {
    id: "strategist",
    badge: "SA",
    name: "Strategist",
    title: "Model Architect",
    roomId: "strategy",
    activeCopy: "designing a model-tab strategy",
    readyCopy: "assembling the strategy skeleton",
    idleCopy: "pinning setups to the cork wall"
  },
  {
    id: "modeler",
    badge: "MJ",
    name: "Modeler",
    title: "JSON Builder",
    roomId: "strategy",
    activeCopy: "shaping importable strategy JSON",
    readyCopy: "checking schema fit for the Models tab",
    idleCopy: "tidying exported model drafts"
  },
  {
    id: "charter",
    badge: "CH",
    name: "Charter",
    title: "Visual Planner",
    roomId: "charts",
    activeCopy: "laying out chart plans and overlays",
    readyCopy: "queuing graph surfaces and panels",
    idleCopy: "rearranging chart pins across the wall"
  },
  {
    id: "animator",
    badge: "AN",
    name: "Animator",
    title: "Motion Lead",
    roomId: "charts",
    activeCopy: "animating live steps and chart actions",
    readyCopy: "testing motion beats and timing",
    idleCopy: "stretching beside the projection rail"
  },
  {
    id: "cinema",
    badge: "RC",
    name: "Cinema",
    title: "Replay Host",
    roomId: "cinema",
    activeCopy: "composing replay sequences for the user",
    readyCopy: "curating the playback queue",
    idleCopy: "checking seats and the projector glow"
  },
  {
    id: "coder",
    badge: "CD",
    name: "Coder",
    title: "Implementation Bench",
    roomId: "code",
    activeCopy: "building code and strategy logic",
    readyCopy: "holding a local tool scaffold",
    idleCopy: "nursing a quiet compile in the forge"
  },
  {
    id: "writer",
    badge: "WR",
    name: "Writer",
    title: "Answer Surface",
    roomId: "narrative",
    activeCopy: "turning evidence into a direct answer",
    readyCopy: "paring back unnecessary detail",
    idleCopy: "editing copy in the soft lounge light"
  },
  {
    id: "auditor",
    badge: "AU",
    name: "Auditor",
    title: "Scope Filter",
    roomId: "audit",
    activeCopy: "removing unsupported or extra material",
    readyCopy: "checking for overreach and drift",
    idleCopy: "walking the terrace with the checklist"
  },
  {
    id: "sentinel",
    badge: "SN",
    name: "Sentinel",
    title: "Quality Watch",
    roomId: "audit",
    activeCopy: "holding quality and fallback guards",
    readyCopy: "watching the response edges",
    idleCopy: "keeping a low-key watch by the fire"
  }
];

const STAGE_AGENT_MAP: Record<string, string[]> = {
  "Intent Parsing": ["intake", "clarifier", "supervisor", "depth"],
  "Conversation Drafting": ["writer", "auditor"],
  "Data Retrieval": ["memory", "market", "research", "toolsmith"],
  "Quantitative Reasoning": ["stats", "indicator", "market", "memory"],
  "Statistical Reasoning": ["stats", "indicator", "memory"],
  "Graph Construction": ["charter", "templater", "stats"],
  "Chart Rendering": ["charter", "animator", "templater", "cinema"],
  "Action Sequencing": ["charter", "strategist", "animator"],
  "Animation Rendering": ["animator", "cinema", "toolsmith"],
  "Indicator Coding": ["coder", "indicator", "charter"],
  "Response Drafting": ["writer", "auditor", "supervisor"],
  "Market Structure Reasoning": ["market", "signal", "charter", "strategist"],
  "Annotation Planning": ["charter", "templater", "strategist"]
};

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
};

export default function GideonWorkView(props: GideonWorkViewProps) {
  const {
    open,
    onClose,
    isPending,
    thinkingStage,
    stagePlan,
    latestPrompt,
    latestResponse,
    latestTools,
    latestChartCount,
    latestAnimationCount,
    latestChecklistCount,
    latestHasStrategyDraft,
    latestCannotAnswer,
    symbol,
    timeframe,
    candleCount,
    historyCount,
    actionCount
  } = props;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const wantsCurrent = /\b(current|latest|today|news|recent|now|browse)\b/i.test(latestPrompt);
  const wantsStrategy = /\b(strategy|model|playbook|json|entry|exit)\b/i.test(latestPrompt);
  const wantsCharting = /\b(chart|graph|visual|plot|draw|annotate|indicator)\b/i.test(latestPrompt);
  const wantsAnimation = /\b(animation|animate|replay|playback|walkthrough|demo)\b/i.test(latestPrompt);
  const wantsGold = /\b(xau|xauusd|gold)\b/i.test(latestPrompt);
  const wantsStats = /\b(stat|statistics|win rate|expectancy|drawdown|profit factor|backtest)\b/i.test(
    latestPrompt
  );

  const activeAgentIds = useMemo(() => {
    if (!isPending) {
      return new Set<string>();
    }

    const mapped = STAGE_AGENT_MAP[thinkingStage];
    return new Set(mapped && mapped.length > 0 ? mapped : ["supervisor", "memory", "writer"]);
  }, [isPending, thinkingStage]);

  const warmAgentIds = useMemo(() => {
    const set = new Set<string>();

    for (const stage of stagePlan) {
      const stageAgents = STAGE_AGENT_MAP[stage] ?? [];
      for (const agentId of stageAgents) {
        set.add(agentId);
      }
    }

    if (wantsCurrent) {
      set.add("research");
      set.add("market");
      set.add("toolsmith");
    }
    if (wantsGold) {
      set.add("market");
      set.add("signal");
    }
    if (wantsStats) {
      set.add("stats");
      set.add("indicator");
    }
    if (wantsCharting) {
      set.add("charter");
      set.add("templater");
    }
    if (wantsAnimation) {
      set.add("animator");
      set.add("cinema");
    }
    if (wantsStrategy || latestHasStrategyDraft) {
      set.add("strategist");
      set.add("modeler");
      set.add("coder");
    }
    if (latestTools.length > 0) {
      set.add("toolsmith");
    }
    if (latestChartCount > 0) {
      set.add("charter");
      set.add("templater");
    }
    if (latestAnimationCount > 0) {
      set.add("animator");
      set.add("cinema");
    }
    if (latestResponse.trim().length > 0) {
      set.add("writer");
      set.add("auditor");
    }
    if (latestChecklistCount > 0 || latestCannotAnswer) {
      set.add("auditor");
      set.add("clarifier");
      set.add("sentinel");
    }

    return set;
  }, [
    latestAnimationCount,
    latestCannotAnswer,
    latestChartCount,
    latestChecklistCount,
    latestHasStrategyDraft,
    latestResponse,
    latestTools.length,
    stagePlan,
    wantsAnimation,
    wantsCharting,
    wantsCurrent,
    wantsGold,
    wantsStats,
    wantsStrategy
  ]);

  const activeRoomCount = OFFICE_ROOMS.filter((room) =>
    room.agentIds.some((agentId) => activeAgentIds.has(agentId))
  ).length;

  const activeAgents = OFFICE_AGENTS.filter((agent) => activeAgentIds.has(agent.id));
  const chillAgents = OFFICE_AGENTS.filter(
    (agent) => !activeAgentIds.has(agent.id) && !warmAgentIds.has(agent.id)
  ).slice(0, 6);

  const activeStageIndex = isPending
    ? Math.max(stagePlan.indexOf(thinkingStage), 0)
    : stagePlan.length > 0
      ? stagePlan.length - 1
      : 0;

  const engagedFunctions = useMemo(
    () =>
      uniqueStrings([
        "goal_partition",
        "depth_estimate",
        "context_pack",
        wantsCurrent ? "freshness_gate" : "",
        wantsStrategy ? "model_targeting" : "",
        wantsCharting ? "visual_need_scan" : "",
        wantsStats ? "metric_selector" : "",
        latestCannotAnswer ? "gap_detection" : "scope_audit",
        latestResponse.trim().length > 0 ? "writer_trim" : ""
      ]),
    [
      latestCannotAnswer,
      latestResponse,
      wantsCharting,
      wantsCurrent,
      wantsStats,
      wantsStrategy
    ]
  );

  const engagedTools = useMemo(
    () =>
      uniqueStrings([
        ...latestTools,
        wantsCurrent ? "web_research" : "",
        wantsGold || wantsCurrent ? "market_snapshot" : "",
        wantsStats ? "stats_summary" : "",
        wantsCharting || latestChartCount > 0 ? "build_panel_chart" : "",
        wantsAnimation || latestAnimationCount > 0 ? "build_chart_animation" : "",
        wantsStrategy || latestHasStrategyDraft ? "build_strategy_json" : ""
      ]).slice(0, 8),
    [
      latestAnimationCount,
      latestChartCount,
      latestHasStrategyDraft,
      latestTools,
      wantsAnimation,
      wantsCharting,
      wantsCurrent,
      wantsGold,
      wantsStats,
      wantsStrategy
    ]
  );

  const engagedTemplates = useMemo(() => {
    const templates = uniqueStrings([
      latestHasStrategyDraft || wantsStrategy ? "models_json_template" : "",
      latestChartCount > 0 || wantsCharting ? "panel_chart_template" : "",
      latestAnimationCount > 0 || wantsAnimation ? "chart_replay_template" : "",
      wantsCurrent ? "market_brief_template" : "",
      wantsStats ? "stats_story_template" : "",
      latestCannotAnswer ? "clarification_template" : "",
      "direct_answer_template"
    ]);

    return templates.slice(0, 6);
  }, [
    latestAnimationCount,
    latestCannotAnswer,
    latestChartCount,
    latestHasStrategyDraft,
    wantsAnimation,
    wantsCharting,
    wantsCurrent,
    wantsStats,
    wantsStrategy
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="gwo-overlay" aria-hidden={!open}>
      <button
        type="button"
        className="gwo-backdrop"
        aria-label="Close Gideon work view"
        onClick={onClose}
      />

      <section
        className="gwo-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Gideon work view"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gwo-head">
          <div className="gwo-head-copy">
            <span className={`gwo-status-pill${isPending ? " live" : ""}`}>
              {isPending ? "Live Run" : "Office Idle"}
            </span>
            <h3>Gideon Office</h3>
            <p>
              {isPending
                ? `Running ${activeAgents.length || 1} agents across ${activeRoomCount || 1} rooms while ${thinkingStage.toLowerCase()}.`
                : "The office is on standby. Open rooms stay warm so the next answer starts fast."}
            </p>
          </div>

          <div className="gwo-head-meta">
            <div className="gwo-meta-card">
              <span>Focus</span>
              <strong>
                {symbol} · {timeframe}
              </strong>
            </div>
            <div className="gwo-meta-card">
              <span>Context</span>
              <strong>
                {candleCount} candles · {historyCount} trades
              </strong>
            </div>
            <div className="gwo-meta-card">
              <span>Signals</span>
              <strong>
                {latestChartCount} charts · {actionCount} actions
              </strong>
            </div>
            <button type="button" className="gwo-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="gwo-body">
          <div className="gwo-map-shell">
            <div className="gwo-map-halo gwo-map-halo-a" />
            <div className="gwo-map-halo gwo-map-halo-b" />
            <div className="gwo-map-halo gwo-map-halo-c" />

            <div className="gwo-map">
              {OFFICE_ROOMS.map((room, roomIndex) => {
                const roomAgents = OFFICE_AGENTS.filter((agent) => agent.roomId === room.id);
                const hasActiveAgent = roomAgents.some((agent) => activeAgentIds.has(agent.id));
                const hasWarmAgent = roomAgents.some((agent) => warmAgentIds.has(agent.id));
                const roomState = hasActiveAgent ? "active" : hasWarmAgent ? "warm" : "idle";

                return (
                  <section
                    key={room.id}
                    className={`gwo-room state-${roomState}`}
                    style={
                      {
                        gridColumn: room.gridColumn,
                        gridRow: room.gridRow,
                        "--room-accent": room.accent,
                        "--room-delay": `${roomIndex * 90}ms`
                      } as CSSProperties
                    }
                  >
                    <div className="gwo-room-head">
                      <div>
                        <strong>{room.name}</strong>
                        <span>{room.purpose}</span>
                      </div>
                      <small>{roomAgents.length > 0 ? `${roomAgents.length} seats` : "Lounge"}</small>
                    </div>

                    {roomAgents.length > 0 ? (
                      <div className="gwo-agent-grid">
                        {roomAgents.map((agent, agentIndex) => {
                          const isActive = activeAgentIds.has(agent.id);
                          const isWarm = warmAgentIds.has(agent.id);
                          const state = isActive ? "active" : isWarm ? "warm" : "idle";
                          const statusCopy = isActive
                            ? agent.activeCopy
                            : isWarm
                              ? agent.readyCopy
                              : agent.idleCopy;

                          return (
                            <article
                              key={agent.id}
                              className={`gwo-agent state-${state}`}
                              style={
                                {
                                  "--agent-shift": `${0.25 + agentIndex * 0.16}s`
                                } as CSSProperties
                              }
                            >
                              <span className="gwo-agent-badge">{agent.badge}</span>
                              <div className="gwo-agent-copy">
                                <strong>{agent.name}</strong>
                                <span>{agent.title}</span>
                                <p>{statusCopy}</p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="gwo-hearth">
                        <span className="gwo-hearth-fire" aria-hidden>
                          <span />
                          <span />
                          <span />
                        </span>
                        <div>
                          <strong>Quiet Mode</strong>
                          <p>Idle agents drift through here between tasks and keep the office calm.</p>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="gwo-side">
            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Mission</span>
                <strong>{isPending ? "In Flight" : "Last Brief"}</strong>
              </header>
              <p className="gwo-mission-copy">
                {latestPrompt.trim().length > 0
                  ? latestPrompt
                  : "No live brief yet. The office is waiting for the next request."}
              </p>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Stage Rail</span>
                <strong>{thinkingStage}</strong>
              </header>
              <div className="gwo-stage-rail">
                {stagePlan.map((stage, index) => {
                  const state = index < activeStageIndex ? "done" : index === activeStageIndex ? "active" : "todo";
                  return (
                    <div key={stage} className={`gwo-stage state-${state}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{stage}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Functions</span>
                <strong>{engagedFunctions.length}</strong>
              </header>
              <div className="gwo-tag-grid">
                {engagedFunctions.map((entry) => (
                  <span key={entry} className="gwo-tag gwo-tag-function">
                    {entry}
                  </span>
                ))}
              </div>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Tools</span>
                <strong>{engagedTools.length}</strong>
              </header>
              <div className="gwo-tag-grid">
                {engagedTools.map((entry) => (
                  <span key={entry} className="gwo-tag gwo-tag-tool">
                    {entry}
                  </span>
                ))}
              </div>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Templates</span>
                <strong>{engagedTemplates.length}</strong>
              </header>
              <div className="gwo-tag-grid">
                {engagedTemplates.map((entry) => (
                  <span key={entry} className="gwo-tag gwo-tag-template">
                    {entry}
                  </span>
                ))}
              </div>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Working Now</span>
                <strong>{activeAgents.length}</strong>
              </header>
              <div className="gwo-roster">
                {activeAgents.length > 0 ? (
                  activeAgents.map((agent) => (
                    <div key={agent.id} className="gwo-roster-row active">
                      <span>{agent.badge}</span>
                      <div>
                        <strong>{agent.name}</strong>
                        <small>{agent.activeCopy}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="gwo-roster-empty">No heavy branch is running right now.</div>
                )}
              </div>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Chill Zone</span>
                <strong>{chillAgents.length}</strong>
              </header>
              <div className="gwo-roster">
                {chillAgents.map((agent) => (
                  <div key={agent.id} className="gwo-roster-row idle">
                    <span>{agent.badge}</span>
                    <div>
                      <strong>{agent.name}</strong>
                      <small>{agent.idleCopy}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="gwo-panel">
              <header className="gwo-panel-head">
                <span>Artifacts</span>
                <strong>Live Surface</strong>
              </header>
              <div className="gwo-artifact-grid">
                <div className="gwo-artifact-card">
                  <span>Charts</span>
                  <strong>{latestChartCount}</strong>
                </div>
                <div className="gwo-artifact-card">
                  <span>Animations</span>
                  <strong>{latestAnimationCount}</strong>
                </div>
                <div className="gwo-artifact-card">
                  <span>Checklist</span>
                  <strong>{latestChecklistCount}</strong>
                </div>
                <div className="gwo-artifact-card">
                  <span>Strategy</span>
                  <strong>{latestHasStrategyDraft ? "Ready" : "None"}</strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <style jsx>{`
        .gwo-overlay {
          position: absolute;
          inset: 0;
          z-index: 8;
          font-family:
            "IBM Plex Mono",
            "SFMono-Regular",
            Menlo,
            Monaco,
            monospace;
        }

        .gwo-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background:
            radial-gradient(120% 90% at 18% 0%, rgba(90, 140, 255, 0.18), transparent 56%),
            radial-gradient(120% 90% at 100% 0%, rgba(240, 184, 79, 0.16), transparent 52%),
            rgba(4, 8, 14, 0.92);
          backdrop-filter: blur(10px);
          cursor: default;
        }

        .gwo-shell {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          min-height: 0;
          padding: 0.72rem;
          gap: 0.72rem;
          color: #e9eef9;
          background:
            linear-gradient(180deg, rgba(11, 16, 24, 0.92), rgba(8, 11, 18, 0.96)),
            repeating-linear-gradient(
              0deg,
              rgba(255, 255, 255, 0.015) 0,
              rgba(255, 255, 255, 0.015) 1px,
              transparent 1px,
              transparent 26px
            );
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }

        .gwo-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.72rem;
          padding: 0.8rem 0.9rem;
          border: 1px solid rgba(98, 117, 160, 0.34);
          border-radius: 22px;
          background:
            radial-gradient(120% 130% at 0% 0%, rgba(90, 140, 255, 0.18), transparent 52%),
            linear-gradient(135deg, rgba(21, 27, 39, 0.95), rgba(12, 17, 27, 0.98));
          box-shadow:
            0 20px 44px rgba(0, 0, 0, 0.28),
            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        }

        .gwo-head-copy {
          display: grid;
          gap: 0.28rem;
          min-width: 0;
        }

        .gwo-head-copy h3 {
          margin: 0;
          font-size: 1.02rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .gwo-head-copy p {
          margin: 0;
          max-width: 72ch;
          color: #9fb1ce;
          font-size: 0.69rem;
          line-height: 1.55;
        }

        .gwo-status-pill {
          justify-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          border-radius: 999px;
          border: 1px solid rgba(128, 150, 191, 0.32);
          background: rgba(16, 23, 35, 0.8);
          color: #cfdaef;
          padding: 0.16rem 0.5rem;
          font-size: 0.57rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .gwo-status-pill.live {
          border-color: rgba(90, 200, 140, 0.44);
          background:
            linear-gradient(120deg, rgba(11, 45, 31, 0.9), rgba(19, 63, 42, 0.96), rgba(11, 45, 31, 0.9));
          background-size: 220% 100%;
          color: #dff8ea;
          animation: gwoShimmer 1.3s linear infinite;
        }

        .gwo-head-meta {
          display: flex;
          align-items: stretch;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.48rem;
        }

        .gwo-meta-card {
          min-width: 124px;
          display: grid;
          align-content: center;
          gap: 0.16rem;
          padding: 0.52rem 0.66rem;
          border-radius: 16px;
          border: 1px solid rgba(117, 137, 178, 0.28);
          background: rgba(10, 16, 25, 0.72);
        }

        .gwo-meta-card span {
          color: #8fa5c7;
          font-size: 0.56rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .gwo-meta-card strong {
          color: #f0f5ff;
          font-size: 0.66rem;
          line-height: 1.4;
        }

        .gwo-close {
          min-width: 104px;
          border-radius: 16px;
          border: 1px solid rgba(132, 158, 211, 0.36);
          background: rgba(16, 24, 36, 0.8);
          color: #e3ecfb;
          padding: 0.58rem 0.86rem;
          font: inherit;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            background 0.18s ease;
        }

        .gwo-close:hover {
          transform: translateY(-1px);
          border-color: rgba(159, 191, 255, 0.62);
          background: rgba(20, 31, 48, 0.92);
        }

        .gwo-body {
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 348px;
          gap: 0.72rem;
        }

        .gwo-map-shell {
          position: relative;
          min-height: 0;
          overflow: auto;
          border-radius: 24px;
          border: 1px solid rgba(95, 116, 156, 0.28);
          background:
            linear-gradient(180deg, rgba(13, 18, 27, 0.96), rgba(9, 13, 20, 0.98)),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: auto, 44px 44px, 44px 44px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
        }

        .gwo-map-halo {
          position: absolute;
          border-radius: 999px;
          filter: blur(48px);
          opacity: 0.34;
          pointer-events: none;
        }

        .gwo-map-halo-a {
          width: 220px;
          height: 220px;
          top: 8%;
          left: 10%;
          background: rgba(92, 140, 255, 0.24);
        }

        .gwo-map-halo-b {
          width: 260px;
          height: 260px;
          top: 22%;
          right: 10%;
          background: rgba(240, 184, 79, 0.18);
        }

        .gwo-map-halo-c {
          width: 320px;
          height: 320px;
          bottom: -10%;
          left: 34%;
          background: rgba(90, 200, 140, 0.14);
        }

        .gwo-map {
          position: relative;
          min-width: 1040px;
          min-height: 100%;
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          grid-template-rows: repeat(5, minmax(108px, 1fr));
          gap: 0.62rem;
          padding: 0.72rem;
        }

        .gwo-room {
          position: relative;
          display: grid;
          align-content: space-between;
          gap: 0.58rem;
          min-width: 0;
          min-height: 0;
          padding: 0.62rem;
          border-radius: 18px;
          border: 1px solid rgba(122, 141, 180, 0.22);
          background:
            linear-gradient(180deg, rgba(16, 22, 33, 0.96), rgba(10, 15, 23, 0.98)),
            radial-gradient(160% 130% at 0% 0%, color-mix(in srgb, var(--room-accent) 18%, transparent), transparent 54%);
          box-shadow:
            0 18px 34px rgba(0, 0, 0, 0.24),
            inset 0 0 0 1px rgba(255, 255, 255, 0.03);
          overflow: hidden;
        }

        .gwo-room::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.028), transparent 38%),
            linear-gradient(transparent 65%, rgba(255, 255, 255, 0.02));
          pointer-events: none;
        }

        .gwo-room::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          background: color-mix(in srgb, var(--room-accent) 88%, white);
          opacity: 0.44;
          pointer-events: none;
        }

        .gwo-room.state-warm {
          border-color: color-mix(in srgb, var(--room-accent) 36%, rgba(122, 141, 180, 0.22));
        }

        .gwo-room.state-active {
          border-color: color-mix(in srgb, var(--room-accent) 56%, rgba(122, 141, 180, 0.22));
          box-shadow:
            0 18px 34px rgba(0, 0, 0, 0.24),
            0 0 0 1px color-mix(in srgb, var(--room-accent) 34%, transparent) inset,
            0 0 28px color-mix(in srgb, var(--room-accent) 18%, transparent);
        }

        .gwo-room.state-active::before {
          animation: gwoPulse 2.1s ease-in-out infinite;
          animation-delay: var(--room-delay);
        }

        .gwo-room-head {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.46rem;
        }

        .gwo-room-head strong {
          display: block;
          color: #f0f5ff;
          font-size: 0.67rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .gwo-room-head span {
          display: block;
          margin-top: 0.22rem;
          color: #8ca0c0;
          font-size: 0.58rem;
          line-height: 1.45;
        }

        .gwo-room-head small {
          color: color-mix(in srgb, var(--room-accent) 76%, white);
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .gwo-agent-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
          gap: 0.42rem;
          min-width: 0;
        }

        .gwo-agent {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.42rem;
          padding: 0.44rem;
          border-radius: 14px;
          border: 1px solid rgba(109, 130, 170, 0.2);
          background: rgba(7, 12, 19, 0.66);
          min-width: 0;
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            background 0.18s ease;
        }

        .gwo-agent.state-idle {
          opacity: 0.74;
        }

        .gwo-agent.state-warm {
          border-color: rgba(132, 168, 238, 0.32);
          background: rgba(11, 17, 28, 0.8);
          animation: gwoFloat 3s ease-in-out infinite;
          animation-delay: var(--agent-shift);
        }

        .gwo-agent.state-active {
          border-color: color-mix(in srgb, var(--room-accent) 58%, rgba(132, 168, 238, 0.34));
          background:
            linear-gradient(180deg, rgba(15, 23, 35, 0.96), rgba(10, 15, 23, 0.96)),
            radial-gradient(120% 150% at 0% 0%, color-mix(in srgb, var(--room-accent) 18%, transparent), transparent 56%);
          transform: translateY(-1px);
          animation:
            gwoFloat 2.2s ease-in-out infinite,
            gwoBorderPulse 1.6s ease-in-out infinite;
          animation-delay: var(--agent-shift);
        }

        .gwo-agent-badge {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(143, 166, 212, 0.38);
          background:
            linear-gradient(180deg, rgba(23, 35, 55, 0.9), rgba(13, 20, 31, 0.96));
          color: #f2f7ff;
          font-size: 0.61rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .gwo-agent-copy {
          display: grid;
          gap: 0.08rem;
          min-width: 0;
        }

        .gwo-agent-copy strong {
          color: #eef4ff;
          font-size: 0.64rem;
          line-height: 1.2;
        }

        .gwo-agent-copy span {
          color: color-mix(in srgb, var(--room-accent) 72%, white);
          font-size: 0.53rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .gwo-agent-copy p {
          margin: 0.12rem 0 0;
          color: #8fa5c7;
          font-size: 0.56rem;
          line-height: 1.42;
        }

        .gwo-hearth {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 0.72rem;
          min-height: 0;
          padding: 0.24rem 0;
        }

        .gwo-hearth strong {
          display: block;
          color: #f3e6d0;
          font-size: 0.67rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .gwo-hearth p {
          margin: 0.16rem 0 0;
          color: #bda98e;
          font-size: 0.58rem;
          line-height: 1.45;
          max-width: 40ch;
        }

        .gwo-hearth-fire {
          position: relative;
          width: 56px;
          height: 44px;
          display: inline-flex;
          align-items: flex-end;
          justify-content: center;
          gap: 0.18rem;
          flex-shrink: 0;
        }

        .gwo-hearth-fire span {
          display: block;
          width: 11px;
          border-radius: 999px 999px 6px 6px;
          background: linear-gradient(180deg, #ffd06f 0%, #ff9d59 58%, #9f4624 100%);
          animation: gwoFlame 1.4s ease-in-out infinite;
        }

        .gwo-hearth-fire span:nth-child(1) {
          height: 24px;
          animation-delay: 0s;
        }

        .gwo-hearth-fire span:nth-child(2) {
          height: 34px;
          animation-delay: 0.12s;
        }

        .gwo-hearth-fire span:nth-child(3) {
          height: 20px;
          animation-delay: 0.24s;
        }

        .gwo-side {
          min-height: 0;
          overflow: auto;
          display: grid;
          gap: 0.58rem;
          align-content: start;
        }

        .gwo-panel {
          border-radius: 18px;
          border: 1px solid rgba(96, 117, 156, 0.3);
          background:
            linear-gradient(180deg, rgba(14, 20, 31, 0.96), rgba(10, 15, 24, 0.98)),
            radial-gradient(130% 100% at 0% 0%, rgba(90, 140, 255, 0.08), transparent 60%);
          padding: 0.62rem;
          display: grid;
          gap: 0.46rem;
        }

        .gwo-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.42rem;
        }

        .gwo-panel-head span {
          color: #8fa5c7;
          font-size: 0.55rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        .gwo-panel-head strong {
          color: #eef4ff;
          font-size: 0.58rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .gwo-mission-copy {
          margin: 0;
          color: #d8e2f3;
          font-size: 0.62rem;
          line-height: 1.5;
        }

        .gwo-stage-rail {
          display: grid;
          gap: 0.32rem;
        }

        .gwo-stage {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 0.42rem;
          padding: 0.38rem 0.44rem;
          border-radius: 12px;
          border: 1px solid rgba(96, 117, 156, 0.24);
          background: rgba(8, 13, 21, 0.62);
        }

        .gwo-stage span {
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(117, 136, 178, 0.32);
          color: #b7c7df;
          font-size: 0.53rem;
        }

        .gwo-stage strong {
          color: #dce6f7;
          font-size: 0.6rem;
          line-height: 1.35;
        }

        .gwo-stage.state-done {
          border-color: rgba(90, 200, 140, 0.28);
          background: rgba(10, 29, 22, 0.58);
        }

        .gwo-stage.state-done span {
          border-color: rgba(90, 200, 140, 0.34);
          color: #c3f2da;
        }

        .gwo-stage.state-active {
          border-color: rgba(240, 184, 79, 0.44);
          background:
            linear-gradient(120deg, rgba(61, 48, 17, 0.82), rgba(91, 70, 21, 0.92), rgba(61, 48, 17, 0.82));
          background-size: 220% 100%;
          animation: gwoShimmer 1.35s linear infinite;
        }

        .gwo-stage.state-active span {
          border-color: rgba(255, 216, 138, 0.52);
          color: #fff0cb;
        }

        .gwo-tag-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.28rem;
        }

        .gwo-tag {
          display: inline-flex;
          align-items: center;
          padding: 0.18rem 0.44rem;
          border-radius: 999px;
          border: 1px solid rgba(120, 140, 184, 0.28);
          background: rgba(9, 15, 23, 0.76);
          color: #d8e4f8;
          font-size: 0.54rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .gwo-tag-function {
          border-color: rgba(95, 200, 150, 0.34);
          color: #c9f5df;
        }

        .gwo-tag-tool {
          border-color: rgba(240, 184, 79, 0.34);
          color: #ffe5b5;
        }

        .gwo-tag-template {
          border-color: rgba(201, 139, 255, 0.36);
          color: #f1d6ff;
        }

        .gwo-roster {
          display: grid;
          gap: 0.34rem;
        }

        .gwo-roster-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: start;
          gap: 0.42rem;
          padding: 0.34rem 0.38rem;
          border-radius: 12px;
          border: 1px solid rgba(103, 124, 166, 0.22);
          background: rgba(8, 13, 21, 0.66);
        }

        .gwo-roster-row span {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid rgba(133, 156, 202, 0.3);
          background: rgba(16, 24, 38, 0.9);
          color: #eef4ff;
          font-size: 0.54rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .gwo-roster-row strong {
          display: block;
          color: #ecf3ff;
          font-size: 0.59rem;
        }

        .gwo-roster-row small {
          display: block;
          margin-top: 0.12rem;
          color: #90a4c7;
          font-size: 0.55rem;
          line-height: 1.4;
        }

        .gwo-roster-row.active {
          border-color: rgba(90, 200, 140, 0.3);
          background: rgba(10, 28, 22, 0.7);
        }

        .gwo-roster-row.idle {
          opacity: 0.82;
        }

        .gwo-roster-empty {
          color: #91a5c8;
          font-size: 0.58rem;
          line-height: 1.45;
        }

        .gwo-artifact-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.34rem;
        }

        .gwo-artifact-card {
          border-radius: 14px;
          border: 1px solid rgba(103, 124, 166, 0.22);
          background: rgba(8, 13, 21, 0.7);
          padding: 0.42rem 0.46rem;
          display: grid;
          gap: 0.16rem;
        }

        .gwo-artifact-card span {
          color: #8fa5c7;
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .gwo-artifact-card strong {
          color: #edf4ff;
          font-size: 0.68rem;
        }

        @keyframes gwoFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        @keyframes gwoBorderPulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
          }
          50% {
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04);
          }
        }

        @keyframes gwoPulse {
          0%,
          100% {
            opacity: 0.52;
          }
          50% {
            opacity: 0.9;
          }
        }

        @keyframes gwoShimmer {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 220% 0%;
          }
        }

        @keyframes gwoFlame {
          0%,
          100% {
            transform: translateY(0) scaleY(1);
            opacity: 0.9;
          }
          50% {
            transform: translateY(-3px) scaleY(1.08);
            opacity: 1;
          }
        }

        @media (max-width: 1280px) {
          .gwo-body {
            grid-template-columns: minmax(0, 1fr) 312px;
          }
        }

        @media (max-width: 1100px) {
          .gwo-shell {
            padding: 0.54rem;
          }

          .gwo-head {
            grid-template-columns: minmax(0, 1fr);
          }

          .gwo-head-meta {
            justify-content: flex-start;
          }

          .gwo-body {
            grid-template-columns: minmax(0, 1fr);
          }

          .gwo-side {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .gwo-head {
            padding: 0.68rem;
          }

          .gwo-head-copy h3 {
            font-size: 0.88rem;
          }

          .gwo-head-copy p {
            font-size: 0.63rem;
          }

          .gwo-meta-card {
            min-width: 0;
            flex: 1 1 140px;
          }

          .gwo-side {
            grid-template-columns: minmax(0, 1fr);
          }

          .gwo-map {
            min-width: 900px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .gwo-status-pill.live,
          .gwo-room.state-active::before,
          .gwo-agent.state-warm,
          .gwo-agent.state-active,
          .gwo-stage.state-active,
          .gwo-hearth-fire span {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
