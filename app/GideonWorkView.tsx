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

type RoomState = "active" | "warm" | "idle";
type PixelDirection = "down" | "right" | "left" | "up";

type OfficeRoom = {
  id: string;
  name: string;
  purpose: string;
  agentIds: string[];
  labelX: number;
  labelY: number;
  agentX?: number;
  agentY?: number;
  direction?: PixelDirection;
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

const SPRITE_SHEETS = [
  "/gideon-pixel/char_0.png",
  "/gideon-pixel/char_1.png",
  "/gideon-pixel/char_2.png",
  "/gideon-pixel/char_3.png",
  "/gideon-pixel/char_4.png",
  "/gideon-pixel/char_5.png"
];

const OFFICE_ROOMS: OfficeRoom[] = [
  {
    id: "research",
    name: "Research Library",
    purpose: "Live browsing, freshness checks, and source verification.",
    agentIds: ["research"],
    labelX: 8,
    labelY: 8,
    agentX: 9,
    agentY: 22,
    direction: "right"
  },
  {
    id: "routing",
    name: "Routing Deck",
    purpose: "Depth scoring, fanout, and agent scheduling.",
    agentIds: ["supervisor", "depth"],
    labelX: 43,
    labelY: 5,
    agentX: 49,
    agentY: 15,
    direction: "left"
  },
  {
    id: "briefing",
    name: "Briefing Lobby",
    purpose: "Goal parsing and clarification checks.",
    agentIds: ["intake", "clarifier"],
    labelX: 62,
    labelY: 7,
    agentX: 63,
    agentY: 25,
    direction: "down"
  },
  {
    id: "market",
    name: "Market Bay",
    purpose: "Symbol context, XAUUSD reads, and price structure.",
    agentIds: ["market", "signal"],
    labelX: 86,
    labelY: 8,
    agentX: 91,
    agentY: 23,
    direction: "left"
  },
  {
    id: "code",
    name: "Code Forge",
    purpose: "Indicator math, strategy code, and implementation work.",
    agentIds: ["coder"],
    labelX: 16,
    labelY: 30,
    agentX: 15,
    agentY: 37,
    direction: "down"
  },
  {
    id: "tools",
    name: "Tool Dock",
    purpose: "Deterministic tool execution and runtime actions.",
    agentIds: ["toolsmith"],
    labelX: 34,
    labelY: 30,
    agentX: 39,
    agentY: 37,
    direction: "down"
  },
  {
    id: "memory",
    name: "Memory Vault",
    purpose: "Thread memory and local context packing.",
    agentIds: ["memory"],
    labelX: 26,
    labelY: 48,
    agentX: 30,
    agentY: 58,
    direction: "down"
  },
  {
    id: "stats",
    name: "Stats Lab",
    purpose: "Metric extraction, win-rate math, and distributions.",
    agentIds: ["stats", "indicator"],
    labelX: 8,
    labelY: 67,
    agentX: 15,
    agentY: 80,
    direction: "down"
  },
  {
    id: "templates",
    name: "Template Loft",
    purpose: "Chart shells, answer frames, and reusable layouts.",
    agentIds: ["templater"],
    labelX: 34,
    labelY: 67,
    agentX: 39,
    agentY: 80,
    direction: "down"
  },
  {
    id: "strategy",
    name: "Strategy Atelier",
    purpose: "Model-tab strategy drafting and JSON shaping.",
    agentIds: ["strategist", "modeler"],
    labelX: 62,
    labelY: 60,
    agentX: 67,
    agentY: 76,
    direction: "right"
  },
  {
    id: "charts",
    name: "Chart Studio",
    purpose: "Chart plans, visuals, overlays, and annotations.",
    agentIds: ["charter", "animator"],
    labelX: 79,
    labelY: 60,
    agentX: 80,
    agentY: 76,
    direction: "left"
  },
  {
    id: "narrative",
    name: "Narrative Lounge",
    purpose: "Direct answer drafting and trimming.",
    agentIds: ["writer"],
    labelX: 58,
    labelY: 86,
    agentX: 58,
    agentY: 71,
    direction: "right"
  },
  {
    id: "audit",
    name: "Audit Terrace",
    purpose: "Scope control, quality checks, and extra-stuff removal.",
    agentIds: ["auditor", "sentinel"],
    labelX: 89,
    labelY: 86,
    agentX: 86,
    agentY: 76,
    direction: "left"
  },
  {
    id: "cinema",
    name: "Replay Cinema",
    purpose: "Playback sequencing and motion timing.",
    agentIds: ["cinema"],
    labelX: 92,
    labelY: 26,
    agentX: 80,
    agentY: 23,
    direction: "up"
  },
  {
    id: "hearth",
    name: "Hearth Lounge",
    purpose: "Idle agents cool off here between runs.",
    agentIds: [],
    labelX: 12,
    labelY: 90
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

const AGENT_BY_ID = new Map(OFFICE_AGENTS.map((agent) => [agent.id, agent]));

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

const hashString = (value: string): number => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const pickSpriteSheet = (seed: string): string =>
  SPRITE_SHEETS[hashString(seed) % SPRITE_SHEETS.length] ?? SPRITE_SHEETS[0];

const spriteRowY = (direction: PixelDirection | undefined): string => {
  switch (direction) {
    case "right":
      return "-48px";
    case "left":
      return "-96px";
    case "up":
      return "-144px";
    case "down":
    default:
      return "0px";
  }
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
      for (const agentId of STAGE_AGENT_MAP[stage] ?? []) {
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

  const roomSnapshots = useMemo(
    () =>
      OFFICE_ROOMS.map((room) => {
        const roomAgents = room.agentIds
          .map((agentId) => AGENT_BY_ID.get(agentId))
          .filter((agent): agent is OfficeAgent => Boolean(agent));
        const activeAgents = roomAgents.filter((agent) => activeAgentIds.has(agent.id));
        const warmAgents = roomAgents.filter((agent) => warmAgentIds.has(agent.id));
        const state: RoomState =
          activeAgents.length > 0 ? "active" : warmAgents.length > 0 ? "warm" : "idle";
        const leadAgent =
          activeAgents[0] ?? warmAgents[0] ?? roomAgents[0] ?? null;

        return {
          room,
          roomAgents,
          activeAgents,
          warmAgents,
          state,
          leadAgent
        };
      }),
    [activeAgentIds, warmAgentIds]
  );

  const activeAgents = useMemo(
    () => OFFICE_AGENTS.filter((agent) => activeAgentIds.has(agent.id)),
    [activeAgentIds]
  );
  const chillAgents = useMemo(
    () =>
      OFFICE_AGENTS.filter((agent) => !activeAgentIds.has(agent.id) && !warmAgentIds.has(agent.id)).slice(0, 8),
    [activeAgentIds, warmAgentIds]
  );

  const activeRoomCount = roomSnapshots.filter((snapshot) => snapshot.state === "active").length;
  const currentStageIndex = isPending
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

  const engagedTemplates = useMemo(
    () =>
      uniqueStrings([
        latestHasStrategyDraft || wantsStrategy ? "models_json_template" : "",
        latestChartCount > 0 || wantsCharting ? "panel_chart_template" : "",
        latestAnimationCount > 0 || wantsAnimation ? "chart_replay_template" : "",
        wantsCurrent ? "market_brief_template" : "",
        wantsStats ? "stats_story_template" : "",
        latestCannotAnswer ? "clarification_template" : "",
        "direct_answer_template"
      ]).slice(0, 6),
    [
      latestAnimationCount,
      latestCannotAnswer,
      latestChartCount,
      latestHasStrategyDraft,
      wantsAnimation,
      wantsCharting,
      wantsCurrent,
      wantsStats,
      wantsStrategy
    ]
  );

  const stageTicker = useMemo(() => {
    const activeRooms = roomSnapshots
      .filter((snapshot) => snapshot.state === "active")
      .slice(0, 4)
      .map((snapshot) => `${snapshot.room.name}: ${snapshot.leadAgent?.name ?? "Lead"}`);

    if (activeRooms.length > 0) {
      return activeRooms.join("  //  ");
    }

    const warmRooms = roomSnapshots
      .filter((snapshot) => snapshot.state === "warm")
      .slice(0, 3)
      .map((snapshot) => `${snapshot.room.name}: ready`);

    return warmRooms.length > 0
      ? warmRooms.join("  //  ")
      : "Office standby. Waiting for the next prompt.";
  }, [roomSnapshots]);

  if (!open) {
    return null;
  }

  return (
    <div className="gpx-overlay" aria-hidden={!open}>
      <button
        type="button"
        className="gpx-backdrop"
        aria-label="Close Gideon work view"
        onClick={onClose}
      />

      <section
        className="gpx-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Gideon pixel work view"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gpx-header">
          <div className="gpx-header-copy">
            <span className={`gpx-status${isPending ? " live" : ""}`}>
              {isPending ? "LIVE RUN" : "OFFICE IDLE"}
            </span>
            <h3>Gideon Office</h3>
            <p>
              {isPending
                ? `${activeAgents.length || 1} agents active across ${activeRoomCount || 1} rooms while ${thinkingStage.toLowerCase()}.`
                : "The office is quiet but warm. Agents stay seated and ready for the next question."}
            </p>
          </div>

          <div className="gpx-toolbar">
            <div className="gpx-stat">
              <span>FOCUS</span>
              <strong>
                {symbol} / {timeframe}
              </strong>
            </div>
            <div className="gpx-stat">
              <span>CONTEXT</span>
              <strong>
                {candleCount}C / {historyCount}T
              </strong>
            </div>
            <div className="gpx-stat">
              <span>SURFACE</span>
              <strong>
                {latestChartCount}G / {actionCount}A
              </strong>
            </div>
            <button type="button" className="gpx-close" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </header>

        <div className="gpx-layout">
          <section className="gpx-scene-window">
            <div className="gpx-window-head">
              <span>PIXEL OFFICE</span>
              <strong>{isPending ? "WORKING" : "CHILLING"}</strong>
            </div>

            <div className="gpx-scene-shell">
              <div className="gpx-scene">
                {roomSnapshots.map((snapshot) => {
                  const { room, state, leadAgent } = snapshot;

                  return (
                    <div
                      key={`${room.id}-label`}
                      className={`gpx-room-tag state-${state}`}
                      style={
                        {
                          left: `${room.labelX}%`,
                          top: `${room.labelY}%`
                        } as CSSProperties
                      }
                    >
                      <strong>{room.name}</strong>
                      <span>{state === "active" ? "WORKING" : state === "warm" ? "READY" : "CHILL"}</span>
                      <small>{leadAgent ? leadAgent.name : "Quiet room"}</small>
                    </div>
                  );
                })}

                {roomSnapshots.map((snapshot) => {
                  const { room, state, leadAgent } = snapshot;
                  if (!leadAgent || typeof room.agentX !== "number" || typeof room.agentY !== "number") {
                    return null;
                  }

                  return (
                    <div
                      key={`${room.id}-actor`}
                      className={`gpx-actor-slot state-${state}`}
                      style={
                        {
                          left: `${room.agentX}%`,
                          top: `${room.agentY}%`
                        } as CSSProperties
                      }
                    >
                      <div
                        className={`gpx-actor dir-${room.direction ?? "down"} state-${state}`}
                        style={
                          {
                            backgroundImage: `url("${pickSpriteSheet(leadAgent.id)}")`,
                            "--row-y": spriteRowY(room.direction)
                          } as CSSProperties
                        }
                        aria-hidden
                      />
                      <div className="gpx-actor-chip">
                        <span>{leadAgent.badge}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="gpx-stage-readout">
                  <span>ROOMS {activeRoomCount.toString().padStart(2, "0")}</span>
                  <strong>{stageTicker}</strong>
                </div>
              </div>
            </div>
          </section>

          <aside className="gpx-sidebar">
            <section className="gpx-panel">
              <div className="gpx-window-head">
                <span>MISSION</span>
                <strong>{isPending ? "IN FLIGHT" : "LAST BRIEF"}</strong>
              </div>
              <p className="gpx-copy">
                {latestPrompt.trim().length > 0
                  ? latestPrompt
                  : "No live brief yet. Send a prompt and the office will start moving."}
              </p>
            </section>

            <section className="gpx-panel">
              <div className="gpx-window-head">
                <span>PIPELINE</span>
                <strong>{thinkingStage}</strong>
              </div>
              <div className="gpx-stage-list">
                {stagePlan.map((stage, index) => {
                  const state =
                    index < currentStageIndex
                      ? "done"
                      : index === currentStageIndex
                        ? "active"
                        : "todo";
                  return (
                    <div key={stage} className={`gpx-stage-pill state-${state}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{stage}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="gpx-panel">
              <div className="gpx-window-head">
                <span>SYSTEM</span>
                <strong>FUNCTION / TOOL / TEMPLATE</strong>
              </div>

              <div className="gpx-subsection">
                <span>FUNCTIONS</span>
                <div className="gpx-tag-list">
                  {engagedFunctions.map((item) => (
                    <span key={item} className="gpx-tag type-function">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="gpx-subsection">
                <span>TOOLS</span>
                <div className="gpx-tag-list">
                  {engagedTools.map((item) => (
                    <span key={item} className="gpx-tag type-tool">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="gpx-subsection">
                <span>TEMPLATES</span>
                <div className="gpx-tag-list">
                  {engagedTemplates.map((item) => (
                    <span key={item} className="gpx-tag type-template">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="gpx-panel">
              <div className="gpx-window-head">
                <span>WORKING NOW</span>
                <strong>{activeAgents.length}</strong>
              </div>
              <div className="gpx-roster">
                {activeAgents.length > 0 ? (
                  activeAgents.map((agent) => (
                    <div key={agent.id} className="gpx-roster-row active">
                      <span>{agent.badge}</span>
                      <div>
                        <strong>{agent.name}</strong>
                        <small>{agent.activeCopy}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="gpx-empty">No heavy branch is running right now.</div>
                )}
              </div>
            </section>

            <section className="gpx-panel">
              <div className="gpx-window-head">
                <span>CHILL ZONE</span>
                <strong>{chillAgents.length}</strong>
              </div>
              <div className="gpx-roster">
                {chillAgents.map((agent) => (
                  <div key={agent.id} className="gpx-roster-row idle">
                    <span>{agent.badge}</span>
                    <div>
                      <strong>{agent.name}</strong>
                      <small>{agent.idleCopy}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="gpx-panel">
              <div className="gpx-window-head">
                <span>ARTIFACTS</span>
                <strong>LIVE SURFACE</strong>
              </div>
              <div className="gpx-artifacts">
                <div className="gpx-artifact">
                  <span>CHARTS</span>
                  <strong>{latestChartCount}</strong>
                </div>
                <div className="gpx-artifact">
                  <span>ANIMS</span>
                  <strong>{latestAnimationCount}</strong>
                </div>
                <div className="gpx-artifact">
                  <span>CHECKS</span>
                  <strong>{latestChecklistCount}</strong>
                </div>
                <div className="gpx-artifact">
                  <span>MODEL</span>
                  <strong>{latestHasStrategyDraft ? "READY" : "NONE"}</strong>
                </div>
                <div className="gpx-artifact">
                  <span>ANSWER</span>
                  <strong>{latestCannotAnswer ? "GAP" : "OK"}</strong>
                </div>
                <div className="gpx-artifact">
                  <span>SYMB</span>
                  <strong>{symbol}</strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <style jsx>{`
        .gpx-overlay {
          position: absolute;
          inset: 0;
          z-index: 8;
          font-family: "Gideon Pixel", "IBM Plex Mono", monospace;
          letter-spacing: 0.02em;
        }

        .gpx-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: rgba(6, 8, 14, 0.92);
          backdrop-filter: blur(2px);
        }

        .gpx-shell {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 0.5rem;
          padding: 0.5rem;
          background:
            radial-gradient(circle at 50% 0%, rgba(43, 57, 90, 0.45), transparent 45%),
            linear-gradient(180deg, #0d1019 0%, #060811 100%);
          color: #f3f2ff;
          overflow: hidden;
        }

        .gpx-header,
        .gpx-panel,
        .gpx-scene-window {
          border: 3px solid #161b2f;
          border-radius: 0;
          background: #272b45;
          box-shadow:
            0 0 0 3px #4e567d,
            6px 6px 0 rgba(3, 4, 10, 0.72);
        }

        .gpx-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.6rem;
          padding: 0.6rem 0.7rem;
        }

        .gpx-header-copy {
          display: grid;
          gap: 0.22rem;
          min-width: 0;
        }

        .gpx-status {
          justify-self: flex-start;
          padding: 0.18rem 0.4rem;
          border: 2px solid #101427;
          background: #40476a;
          color: #f5f7ff;
          font-size: 0.62rem;
        }

        .gpx-status.live {
          background: #348e5c;
          color: #f4fff8;
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-header-copy h3 {
          margin: 0;
          font-size: 0.92rem;
          color: #fff8de;
          text-transform: uppercase;
        }

        .gpx-header-copy p {
          margin: 0;
          color: #d6d8f2;
          font-size: 0.62rem;
          line-height: 1.45;
          max-width: 74ch;
        }

        .gpx-toolbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.42rem;
          align-items: flex-start;
        }

        .gpx-stat {
          min-width: 98px;
          padding: 0.3rem 0.42rem;
          border: 2px solid #12162b;
          background: #353b5c;
          display: grid;
          gap: 0.14rem;
        }

        .gpx-stat span {
          color: #bfc5ea;
          font-size: 0.48rem;
        }

        .gpx-stat strong {
          color: #fff8de;
          font-size: 0.58rem;
        }

        .gpx-close {
          min-width: 92px;
          border: 2px solid #12162b;
          background: #894156;
          color: #fff2f4;
          font: inherit;
          padding: 0.34rem 0.52rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 rgba(8, 9, 15, 0.58);
        }

        .gpx-close:hover {
          background: #a24c64;
        }

        .gpx-layout {
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 352px;
          gap: 0.5rem;
        }

        .gpx-scene-window {
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          overflow: hidden;
        }

        .gpx-window-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.4rem;
          padding: 0.28rem 0.45rem;
          border-bottom: 3px solid #15192a;
          background: #39405f;
          color: #fff8de;
          font-size: 0.54rem;
        }

        .gpx-window-head strong {
          color: #f5ffd6;
          font-size: 0.5rem;
        }

        .gpx-scene-shell {
          min-height: 0;
          padding: 0.45rem;
          background:
            linear-gradient(180deg, rgba(19, 23, 38, 0.98), rgba(10, 12, 20, 0.99));
        }

        .gpx-scene {
          position: relative;
          width: 100%;
          aspect-ratio: 1308 / 521;
          overflow: hidden;
          border: 4px solid #0c1020;
          background:
            linear-gradient(180deg, rgba(11, 14, 24, 0.18), rgba(11, 14, 24, 0.18)),
            url("/gideon-pixel/office-stage.jpg") center / cover no-repeat;
          image-rendering: pixelated;
          box-shadow:
            inset 0 0 0 3px rgba(255, 255, 255, 0.05),
            inset 0 0 0 7px rgba(0, 0, 0, 0.3);
        }

        .gpx-scene::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at center, transparent 48%, rgba(6, 8, 14, 0.38) 100%);
          pointer-events: none;
        }

        .gpx-room-tag {
          position: absolute;
          z-index: 3;
          min-width: 92px;
          padding: 0.18rem 0.28rem 0.2rem;
          border: 2px solid #0e1222;
          background: #23273f;
          box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.54);
          transform: translate(-50%, -50%);
        }

        .gpx-room-tag strong,
        .gpx-room-tag span,
        .gpx-room-tag small {
          display: block;
        }

        .gpx-room-tag strong {
          color: #fff8de;
          font-size: 0.48rem;
        }

        .gpx-room-tag span {
          margin-top: 0.08rem;
          font-size: 0.42rem;
          color: #d8ddff;
        }

        .gpx-room-tag small {
          margin-top: 0.06rem;
          color: #aeb6df;
          font-size: 0.39rem;
        }

        .gpx-room-tag.state-active {
          background: #2b4634;
          animation: gpxBlink 0.95s steps(2, end) infinite;
        }

        .gpx-room-tag.state-warm {
          background: #3c3752;
        }

        .gpx-room-tag.state-idle {
          background: rgba(35, 39, 63, 0.88);
          opacity: 0.88;
        }

        .gpx-actor-slot {
          position: absolute;
          z-index: 4;
          width: 32px;
          height: 48px;
          transform: translate(-50%, -100%);
          pointer-events: none;
        }

        .gpx-actor-slot.state-active {
          animation: gpxActorDrift 0.95s steps(2, end) infinite;
        }

        .gpx-actor-slot.state-warm {
          animation: gpxActorBob 1.8s steps(2, end) infinite;
        }

        .gpx-actor {
          width: 32px;
          height: 48px;
          background-repeat: no-repeat;
          background-size: 224px 192px;
          background-position: 0 var(--row-y);
          image-rendering: pixelated;
        }

        .gpx-actor.state-active {
          animation: gpxSpriteWalk 0.8s steps(6) infinite;
        }

        .gpx-actor.state-warm {
          animation: gpxSpriteBreathe 1.1s steps(2, end) infinite;
        }

        .gpx-actor-chip {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 3px);
          transform: translateX(-50%);
          padding: 1px 4px;
          border: 2px solid #0d1020;
          background: #f5f1d8;
          color: #181b28;
          font-size: 0.38rem;
          line-height: 1.2;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.54);
        }

        .gpx-stage-readout {
          position: absolute;
          left: 0.55rem;
          right: 0.55rem;
          bottom: 0.55rem;
          z-index: 5;
          padding: 0.22rem 0.34rem;
          border: 2px solid #0d1020;
          background: rgba(20, 24, 38, 0.92);
          box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.54);
          display: grid;
          gap: 0.1rem;
        }

        .gpx-stage-readout span {
          color: #9ef0b7;
          font-size: 0.42rem;
        }

        .gpx-stage-readout strong {
          color: #f4f5ff;
          font-size: 0.46rem;
          line-height: 1.35;
        }

        .gpx-sidebar {
          min-height: 0;
          overflow: auto;
          display: grid;
          gap: 0.5rem;
          align-content: start;
          padding: 0 0.12rem 0.18rem 0;
        }

        .gpx-panel {
          padding-bottom: 0.34rem;
          overflow: hidden;
        }

        .gpx-copy {
          margin: 0;
          padding: 0.4rem 0.48rem 0;
          color: #edf0ff;
          font-size: 0.53rem;
          line-height: 1.5;
        }

        .gpx-stage-list,
        .gpx-roster,
        .gpx-artifacts {
          padding: 0.38rem 0.45rem 0;
        }

        .gpx-stage-list {
          display: grid;
          gap: 0.24rem;
        }

        .gpx-stage-pill {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 0.32rem;
          padding: 0.2rem 0.24rem;
          border: 2px solid #0f1324;
          background: #303553;
        }

        .gpx-stage-pill span {
          min-width: 24px;
          color: #fff6d2;
          font-size: 0.42rem;
        }

        .gpx-stage-pill strong {
          color: #edf0ff;
          font-size: 0.48rem;
        }

        .gpx-stage-pill.state-done {
          background: #325142;
        }

        .gpx-stage-pill.state-active {
          background: #6d5530;
          animation: gpxBlink 0.8s steps(2, end) infinite;
        }

        .gpx-subsection {
          padding: 0.34rem 0.45rem 0;
          display: grid;
          gap: 0.18rem;
        }

        .gpx-subsection > span {
          color: #fff7d4;
          font-size: 0.46rem;
        }

        .gpx-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.18rem;
        }

        .gpx-tag {
          padding: 0.12rem 0.28rem;
          border: 2px solid #0e1120;
          background: #2d314a;
          color: #edf0ff;
          font-size: 0.4rem;
        }

        .gpx-tag.type-function {
          background: #2e4e3f;
        }

        .gpx-tag.type-tool {
          background: #5a492c;
        }

        .gpx-tag.type-template {
          background: #4f365e;
        }

        .gpx-roster {
          display: grid;
          gap: 0.22rem;
        }

        .gpx-roster-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.28rem;
          padding: 0.2rem 0.24rem;
          border: 2px solid #0e1120;
          background: #2e334f;
        }

        .gpx-roster-row span {
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #0e1120;
          background: #f4f0d8;
          color: #171b29;
          font-size: 0.42rem;
        }

        .gpx-roster-row strong,
        .gpx-roster-row small {
          display: block;
        }

        .gpx-roster-row strong {
          color: #fff8de;
          font-size: 0.48rem;
        }

        .gpx-roster-row small {
          margin-top: 0.08rem;
          color: #ced4fa;
          font-size: 0.4rem;
          line-height: 1.35;
        }

        .gpx-roster-row.active {
          background: #315043;
        }

        .gpx-roster-row.idle {
          background: #393657;
          opacity: 0.9;
        }

        .gpx-empty {
          color: #d9defb;
          font-size: 0.48rem;
          line-height: 1.4;
        }

        .gpx-artifacts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.22rem;
        }

        .gpx-artifact {
          padding: 0.22rem 0.24rem;
          border: 2px solid #0f1324;
          background: #303553;
          display: grid;
          gap: 0.08rem;
        }

        .gpx-artifact span {
          color: #cbd2f8;
          font-size: 0.38rem;
        }

        .gpx-artifact strong {
          color: #fff8de;
          font-size: 0.5rem;
        }

        @keyframes gpxBlink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0.78;
          }
        }

        @keyframes gpxActorDrift {
          0%,
          100% {
            transform: translate(-50%, -100%);
          }
          50% {
            transform: translate(calc(-50% + 1px), calc(-100% - 2px));
          }
        }

        @keyframes gpxActorBob {
          0%,
          100% {
            transform: translate(-50%, -100%);
          }
          50% {
            transform: translate(-50%, calc(-100% - 1px));
          }
        }

        @keyframes gpxSpriteWalk {
          from {
            background-position: 0 var(--row-y);
          }
          to {
            background-position: -192px var(--row-y);
          }
        }

        @keyframes gpxSpriteBreathe {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.08);
          }
        }

        @media (max-width: 1220px) {
          .gpx-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .gpx-sidebar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .gpx-shell {
            padding: 0.35rem;
            gap: 0.35rem;
          }

          .gpx-header {
            grid-template-columns: minmax(0, 1fr);
          }

          .gpx-toolbar {
            justify-content: flex-start;
          }

          .gpx-sidebar {
            grid-template-columns: minmax(0, 1fr);
          }

          .gpx-room-tag {
            min-width: 78px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .gpx-status.live,
          .gpx-room-tag.state-active,
          .gpx-stage-pill.state-active,
          .gpx-actor-slot.state-active,
          .gpx-actor-slot.state-warm,
          .gpx-actor.state-active,
          .gpx-actor.state-warm {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
