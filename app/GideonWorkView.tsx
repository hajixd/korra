"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";

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
type FloorTheme = "wood" | "tile" | "blue" | "slate" | "dark";
type FurnitureType =
  | "bookshelf"
  | "desk"
  | "terminal"
  | "table"
  | "whiteboard"
  | "cooler"
  | "plant"
  | "server"
  | "sofa"
  | "projector"
  | "archive";

type PixelFurniture = {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  w: number;
  h: number;
  orientation?: "h" | "v";
};

type PixelAgentSpot = {
  agentId: string;
  x: number;
  y: number;
  direction: PixelDirection;
  activity: string;
};

type OfficeRoom = {
  id: string;
  name: string;
  purpose: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: FloorTheme;
  furniture: PixelFurniture[];
  agents: PixelAgentSpot[];
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

const MAP_WIDTH = 2600;
const MAP_HEIGHT = 1800;

const SPRITE_SHEETS = [
  "/gideon-pixel/char_0.png",
  "/gideon-pixel/char_1.png",
  "/gideon-pixel/char_2.png",
  "/gideon-pixel/char_3.png",
  "/gideon-pixel/char_4.png",
  "/gideon-pixel/char_5.png"
];

const shelfRow = (prefix: string, startX: number, y: number, count: number, gap = 18): PixelFurniture[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-shelf-${index}`,
    type: "bookshelf",
    x: startX + index * (110 + gap),
    y,
    w: 110,
    h: 44
  }));

const deskPod = (prefix: string, x: number, y: number): PixelFurniture[] => [
  { id: `${prefix}-desk`, type: "desk", x, y, w: 120, h: 68 },
  { id: `${prefix}-terminal`, type: "terminal", x: x + 34, y: y + 8, w: 52, h: 28 }
];

const OFFICE_ROOMS: OfficeRoom[] = [
  {
    id: "research",
    name: "Research Library",
    purpose: "A dedicated book room for browsing, source-checking, and current-context work.",
    x: 80,
    y: 70,
    w: 640,
    h: 430,
    floor: "wood",
    furniture: [
      ...shelfRow("research-n", 40, 40, 5),
      ...shelfRow("research-s", 40, 330, 5),
      ...shelfRow("research-mid-west", 80, 180, 2),
      ...shelfRow("research-mid-east", 360, 180, 2)
    ],
    agents: [{ agentId: "research", x: 316, y: 232, direction: "right", activity: "READ" }]
  },
  {
    id: "routing",
    name: "Routing Deck",
    purpose: "Depth scoring, scheduling, and agent fanout live here.",
    x: 820,
    y: 90,
    w: 390,
    h: 270,
    floor: "tile",
    furniture: [
      { id: "routing-board", type: "whiteboard", x: 122, y: 22, w: 140, h: 40 },
      { id: "routing-table", type: "table", x: 110, y: 138, w: 170, h: 88 },
      { id: "routing-terminal", type: "terminal", x: 285, y: 118, w: 58, h: 30 },
      { id: "routing-plant", type: "plant", x: 24, y: 190, w: 26, h: 38 }
    ],
    agents: [
      { agentId: "supervisor", x: 150, y: 184, direction: "up", activity: "ROUTE" },
      { agentId: "depth", x: 236, y: 184, direction: "up", activity: "DEPTH" }
    ]
  },
  {
    id: "briefing",
    name: "Briefing Lobby",
    purpose: "Prompt parsing and clarification entrypoint.",
    x: 1280,
    y: 90,
    w: 490,
    h: 300,
    floor: "tile",
    furniture: [
      { id: "briefing-sofa-a", type: "sofa", x: 44, y: 148, w: 120, h: 68, orientation: "h" },
      { id: "briefing-sofa-b", type: "sofa", x: 324, y: 148, w: 120, h: 68, orientation: "h" },
      { id: "briefing-table", type: "table", x: 174, y: 148, w: 134, h: 76 },
      { id: "briefing-board", type: "whiteboard", x: 162, y: 24, w: 150, h: 40 },
      { id: "briefing-plant", type: "plant", x: 26, y: 34, w: 26, h: 38 },
      { id: "briefing-plant-b", type: "plant", x: 438, y: 34, w: 26, h: 38 }
    ],
    agents: [
      { agentId: "intake", x: 182, y: 184, direction: "right", activity: "BRIEF" },
      { agentId: "clarifier", x: 312, y: 184, direction: "left", activity: "ASK" }
    ]
  },
  {
    id: "market",
    name: "Market Bay",
    purpose: "Live symbol work, XAUUSD monitoring, and structure reads.",
    x: 1840,
    y: 70,
    w: 690,
    h: 520,
    floor: "wood",
    furniture: [
      ...deskPod("market-a", 56, 78),
      ...deskPod("market-b", 246, 78),
      ...deskPod("market-c", 436, 78),
      ...deskPod("market-d", 56, 240),
      ...deskPod("market-e", 246, 240),
      ...deskPod("market-f", 436, 240),
      { id: "market-board", type: "whiteboard", x: 520, y: 410, w: 128, h: 38 },
      { id: "market-cooler", type: "cooler", x: 608, y: 72, w: 34, h: 52 },
      { id: "market-plant", type: "plant", x: 610, y: 448, w: 30, h: 42 }
    ],
    agents: [
      { agentId: "market", x: 122, y: 180, direction: "down", activity: "PRICE" },
      { agentId: "signal", x: 498, y: 342, direction: "down", activity: "SCAN" }
    ]
  },
  {
    id: "code",
    name: "Code Forge",
    purpose: "Strategy coding, indicator math, and implementation work.",
    x: 80,
    y: 590,
    w: 550,
    h: 350,
    floor: "slate",
    furniture: [
      ...deskPod("code-a", 60, 86),
      ...deskPod("code-b", 240, 86),
      { id: "code-board", type: "whiteboard", x: 300, y: 24, w: 170, h: 42 },
      { id: "code-server-a", type: "server", x: 446, y: 116, w: 44, h: 100 },
      { id: "code-server-b", type: "server", x: 446, y: 226, w: 44, h: 100 },
      { id: "code-plant", type: "plant", x: 40, y: 280, w: 28, h: 40 }
    ],
    agents: [{ agentId: "coder", x: 286, y: 210, direction: "up", activity: "CODE" }]
  },
  {
    id: "tools",
    name: "Tool Dock",
    purpose: "Deterministic executors, tool calls, and runtime control.",
    x: 700,
    y: 430,
    w: 460,
    h: 410,
    floor: "dark",
    furniture: [
      { id: "tool-server-a", type: "server", x: 62, y: 62, w: 44, h: 108 },
      { id: "tool-server-b", type: "server", x: 122, y: 62, w: 44, h: 108 },
      ...deskPod("tool-console", 228, 96),
      { id: "tool-cooler", type: "cooler", x: 374, y: 70, w: 34, h: 52 },
      { id: "tool-archive", type: "archive", x: 54, y: 250, w: 96, h: 62 },
      { id: "tool-table", type: "table", x: 228, y: 232, w: 134, h: 76 }
    ],
    agents: [{ agentId: "toolsmith", x: 290, y: 176, direction: "right", activity: "RUN" }]
  },
  {
    id: "strategy",
    name: "Strategy Atelier",
    purpose: "Model-tab strategy drafting and JSON shaping.",
    x: 1240,
    y: 430,
    w: 540,
    h: 430,
    floor: "blue",
    furniture: [
      { id: "strategy-table", type: "table", x: 170, y: 152, w: 180, h: 96 },
      { id: "strategy-board", type: "whiteboard", x: 160, y: 38, w: 186, h: 44 },
      { id: "strategy-sofa-a", type: "sofa", x: 36, y: 168, w: 108, h: 64 },
      { id: "strategy-sofa-b", type: "sofa", x: 390, y: 168, w: 108, h: 64 },
      { id: "strategy-archive", type: "archive", x: 382, y: 318, w: 110, h: 66 },
      { id: "strategy-plant", type: "plant", x: 54, y: 320, w: 28, h: 40 }
    ],
    agents: [
      { agentId: "strategist", x: 216, y: 232, direction: "right", activity: "PLAN" },
      { agentId: "modeler", x: 328, y: 232, direction: "left", activity: "JSON" }
    ]
  },
  {
    id: "charts",
    name: "Chart Studio",
    purpose: "Chart plans, visual overlays, animations, and draw actions.",
    x: 1840,
    y: 660,
    w: 630,
    h: 470,
    floor: "slate",
    furniture: [
      { id: "chart-board-a", type: "whiteboard", x: 70, y: 34, w: 180, h: 44 },
      { id: "chart-board-b", type: "whiteboard", x: 382, y: 34, w: 180, h: 44 },
      { id: "chart-projector", type: "projector", x: 272, y: 56, w: 66, h: 26 },
      ...deskPod("chart-a", 88, 188),
      ...deskPod("chart-b", 402, 188),
      { id: "chart-table", type: "table", x: 230, y: 288, w: 162, h: 92 }
    ],
    agents: [
      { agentId: "charter", x: 154, y: 270, direction: "up", activity: "DRAW" },
      { agentId: "animator", x: 470, y: 270, direction: "up", activity: "MOVE" }
    ]
  },
  {
    id: "hearth",
    name: "Hearth Lounge",
    purpose: "A large quiet lounge for standby and cooldown.",
    x: 80,
    y: 1030,
    w: 640,
    h: 360,
    floor: "blue",
    furniture: [
      { id: "hearth-sofa-a", type: "sofa", x: 60, y: 120, w: 132, h: 72 },
      { id: "hearth-sofa-b", type: "sofa", x: 448, y: 120, w: 132, h: 72 },
      { id: "hearth-table", type: "table", x: 240, y: 128, w: 156, h: 84 },
      { id: "hearth-cooler", type: "cooler", x: 568, y: 44, w: 34, h: 52 },
      { id: "hearth-plant-a", type: "plant", x: 68, y: 282, w: 28, h: 40 },
      { id: "hearth-plant-b", type: "plant", x: 546, y: 282, w: 28, h: 40 }
    ],
    agents: []
  },
  {
    id: "memory",
    name: "Memory Vault",
    purpose: "Context packing, thread state, and long-lived request memory.",
    x: 780,
    y: 960,
    w: 400,
    h: 330,
    floor: "dark",
    furniture: [
      { id: "memory-server-a", type: "server", x: 56, y: 68, w: 46, h: 110 },
      { id: "memory-server-b", type: "server", x: 118, y: 68, w: 46, h: 110 },
      { id: "memory-archive-a", type: "archive", x: 216, y: 72, w: 100, h: 64 },
      { id: "memory-archive-b", type: "archive", x: 216, y: 162, w: 100, h: 64 },
      { id: "memory-terminal", type: "terminal", x: 242, y: 248, w: 54, h: 30 }
    ],
    agents: [{ agentId: "memory", x: 248, y: 218, direction: "up", activity: "CACHE" }]
  },
  {
    id: "stats",
    name: "Stats Lab",
    purpose: "Win rate, expectancy, drawdown, and metric synthesis.",
    x: 1240,
    y: 930,
    w: 500,
    h: 330,
    floor: "tile",
    furniture: [
      ...deskPod("stats-a", 70, 128),
      ...deskPod("stats-b", 308, 128),
      { id: "stats-board", type: "whiteboard", x: 154, y: 28, w: 176, h: 42 },
      { id: "stats-plant", type: "plant", x: 428, y: 244, w: 28, h: 40 }
    ],
    agents: [
      { agentId: "stats", x: 136, y: 210, direction: "up", activity: "STATS" },
      { agentId: "indicator", x: 374, y: 210, direction: "up", activity: "MATH" }
    ]
  },
  {
    id: "templates",
    name: "Template Loft",
    purpose: "Reusable graph templates, answer shells, and format frames.",
    x: 1240,
    y: 1320,
    w: 430,
    h: 250,
    floor: "tile",
    furniture: [
      ...shelfRow("template-row", 42, 36, 3),
      { id: "template-archive", type: "archive", x: 146, y: 146, w: 120, h: 66 },
      { id: "template-table", type: "table", x: 286, y: 132, w: 104, h: 68 }
    ],
    agents: [{ agentId: "templater", x: 320, y: 198, direction: "up", activity: "FRAME" }]
  },
  {
    id: "cinema",
    name: "Replay Cinema",
    purpose: "Playback steps, replay timing, and animation sequencing.",
    x: 760,
    y: 1330,
    w: 430,
    h: 320,
    floor: "dark",
    furniture: [
      { id: "cinema-projector", type: "projector", x: 182, y: 42, w: 70, h: 28 },
      { id: "cinema-sofa-a", type: "sofa", x: 72, y: 170, w: 100, h: 58 },
      { id: "cinema-sofa-b", type: "sofa", x: 258, y: 170, w: 100, h: 58 },
      { id: "cinema-table", type: "table", x: 160, y: 186, w: 102, h: 58 }
    ],
    agents: [{ agentId: "cinema", x: 216, y: 206, direction: "up", activity: "CUE" }]
  },
  {
    id: "narrative",
    name: "Narrative Lounge",
    purpose: "Direct answer drafting and trimming.",
    x: 1760,
    y: 1260,
    w: 340,
    h: 270,
    floor: "blue",
    furniture: [
      { id: "narrative-desk", type: "desk", x: 106, y: 126, w: 120, h: 68 },
      { id: "narrative-terminal", type: "terminal", x: 140, y: 134, w: 52, h: 28 },
      { id: "narrative-sofa", type: "sofa", x: 56, y: 40, w: 220, h: 64 },
      { id: "narrative-plant", type: "plant", x: 274, y: 190, w: 26, h: 38 }
    ],
    agents: [{ agentId: "writer", x: 166, y: 210, direction: "up", activity: "WRITE" }]
  },
  {
    id: "audit",
    name: "Audit Terrace",
    purpose: "Scope checks, quality gates, and drift removal.",
    x: 2160,
    y: 1240,
    w: 340,
    h: 290,
    floor: "tile",
    furniture: [
      { id: "audit-table", type: "table", x: 92, y: 142, w: 154, h: 86 },
      { id: "audit-board", type: "whiteboard", x: 88, y: 34, w: 160, h: 40 },
      { id: "audit-archive", type: "archive", x: 238, y: 196, w: 72, h: 52 }
    ],
    agents: [
      { agentId: "auditor", x: 136, y: 224, direction: "up", activity: "AUDIT" },
      { agentId: "sentinel", x: 216, y: 224, direction: "up", activity: "GUARD" }
    ]
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
    idleCopy: "quietly sorting prompts in the lobby"
  },
  {
    id: "clarifier",
    badge: "CQ",
    name: "Clarifier",
    title: "Ambiguity Guard",
    roomId: "briefing",
    activeCopy: "checking whether anything is underspecified",
    readyCopy: "watching for hidden assumptions",
    idleCopy: "reviewing follow-up prompts by the sofa"
  },
  {
    id: "supervisor",
    badge: "SV",
    name: "Supervisor",
    title: "Flow Lead",
    roomId: "routing",
    activeCopy: "routing work across the office",
    readyCopy: "keeping agent lanes warm",
    idleCopy: "studying the routing board"
  },
  {
    id: "depth",
    badge: "DP",
    name: "Depth",
    title: "Complexity Scout",
    roomId: "routing",
    activeCopy: "estimating answer depth and fanout",
    readyCopy: "warming deeper branches",
    idleCopy: "benchmarking heavy paths at the table"
  },
  {
    id: "memory",
    badge: "MV",
    name: "Memory",
    title: "Context Keeper",
    roomId: "memory",
    activeCopy: "packing thread memory and local context",
    readyCopy: "pinning the latest state snapshot",
    idleCopy: "checking the archive drawers"
  },
  {
    id: "market",
    badge: "MK",
    name: "Market",
    title: "Price Reader",
    roomId: "market",
    activeCopy: "tracking live market context",
    readyCopy: "watching the symbol board",
    idleCopy: "keeping an eye on the terminals"
  },
  {
    id: "signal",
    badge: "SG",
    name: "Signal",
    title: "Structure Scout",
    roomId: "market",
    activeCopy: "reading swings, structure, and price behavior",
    readyCopy: "lining up directional cues",
    idleCopy: "checking another desk cluster"
  },
  {
    id: "research",
    badge: "RS",
    name: "Research",
    title: "Source Runner",
    roomId: "research",
    activeCopy: "checking live sources and citations",
    readyCopy: "keeping freshness gates armed",
    idleCopy: "pulling books from the stacks"
  },
  {
    id: "stats",
    badge: "ST",
    name: "Stats",
    title: "Quant Lead",
    roomId: "stats",
    activeCopy: "building distributions and answer metrics",
    readyCopy: "staging recent performance summaries",
    idleCopy: "marking up the board in the lab"
  },
  {
    id: "indicator",
    badge: "ID",
    name: "Indicator",
    title: "Signal Math",
    roomId: "stats",
    activeCopy: "deriving indicator and stat layers",
    readyCopy: "lining up derived series",
    idleCopy: "tuning formulas at the desk"
  },
  {
    id: "toolsmith",
    badge: "TL",
    name: "Toolsmith",
    title: "Runtime Operator",
    roomId: "tools",
    activeCopy: "running deterministic tools and fetches",
    readyCopy: "keeping executor lanes hot",
    idleCopy: "watching tool output in the dock"
  },
  {
    id: "templater",
    badge: "TP",
    name: "Templater",
    title: "Blueprint Curator",
    roomId: "templates",
    activeCopy: "matching templates to the request",
    readyCopy: "staging chart and answer shells",
    idleCopy: "sorting reusable layouts in the loft"
  },
  {
    id: "strategist",
    badge: "SA",
    name: "Strategist",
    title: "Model Architect",
    roomId: "strategy",
    activeCopy: "designing a model-tab strategy",
    readyCopy: "assembling the strategy skeleton",
    idleCopy: "pinning setup notes to the board"
  },
  {
    id: "modeler",
    badge: "MJ",
    name: "Modeler",
    title: "JSON Builder",
    roomId: "strategy",
    activeCopy: "shaping importable strategy JSON",
    readyCopy: "checking schema fit for the Models tab",
    idleCopy: "reviewing draft fields at the table"
  },
  {
    id: "charter",
    badge: "CH",
    name: "Charter",
    title: "Visual Planner",
    roomId: "charts",
    activeCopy: "laying out chart plans and overlays",
    readyCopy: "queuing graph surfaces and panels",
    idleCopy: "marking lines on the studio wall"
  },
  {
    id: "animator",
    badge: "AN",
    name: "Animator",
    title: "Motion Lead",
    roomId: "charts",
    activeCopy: "animating live steps and chart actions",
    readyCopy: "testing motion beats and timing",
    idleCopy: "watching the projector rail"
  },
  {
    id: "cinema",
    badge: "RC",
    name: "Cinema",
    title: "Replay Host",
    roomId: "cinema",
    activeCopy: "composing replay sequences for the user",
    readyCopy: "curating the playback queue",
    idleCopy: "checking seats and timing cards"
  },
  {
    id: "coder",
    badge: "CD",
    name: "Coder",
    title: "Implementation Bench",
    roomId: "code",
    activeCopy: "building code and strategy logic",
    readyCopy: "holding a local tool scaffold",
    idleCopy: "watching a quiet compile"
  },
  {
    id: "writer",
    badge: "WR",
    name: "Writer",
    title: "Answer Surface",
    roomId: "narrative",
    activeCopy: "turning evidence into a direct answer",
    readyCopy: "paring back unnecessary detail",
    idleCopy: "editing phrasing in the lounge"
  },
  {
    id: "auditor",
    badge: "AU",
    name: "Auditor",
    title: "Scope Filter",
    roomId: "audit",
    activeCopy: "removing unsupported or extra material",
    readyCopy: "checking for overreach and drift",
    idleCopy: "walking the final checklist"
  },
  {
    id: "sentinel",
    badge: "SN",
    name: "Sentinel",
    title: "Quality Watch",
    roomId: "audit",
    activeCopy: "holding quality and fallback guards",
    readyCopy: "watching the response edges",
    idleCopy: "standing watch over the terrace"
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

const STAGE_ROOM_MAP: Record<string, string> = {
  "Intent Parsing": "briefing",
  "Conversation Drafting": "narrative",
  "Data Retrieval": "research",
  "Quantitative Reasoning": "stats",
  "Statistical Reasoning": "stats",
  "Graph Construction": "charts",
  "Chart Rendering": "charts",
  "Action Sequencing": "strategy",
  "Animation Rendering": "cinema",
  "Indicator Coding": "code",
  "Response Drafting": "narrative",
  "Market Structure Reasoning": "market",
  "Annotation Planning": "charts"
};

const AGENT_BY_ID = new Map(OFFICE_AGENTS.map((agent) => [agent.id, agent]));
const ROOM_BY_ID = new Map(OFFICE_ROOMS.map((room) => [room.id, room]));

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

const spriteRowY = (direction: PixelDirection): string => {
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mapScrollRef = useRef<HTMLDivElement | null>(null);

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
        const agentSnapshots = room.agents
          .map((spot) => {
            const agent = AGENT_BY_ID.get(spot.agentId);
            if (!agent) {
              return null;
            }

            const state: RoomState = activeAgentIds.has(agent.id)
              ? "active"
              : warmAgentIds.has(agent.id)
                ? "warm"
                : "idle";

            return {
              spot,
              agent,
              state
            };
          })
          .filter(
            (
              item
            ): item is {
              spot: PixelAgentSpot;
              agent: OfficeAgent;
              state: RoomState;
            } => Boolean(item)
          );

        const state: RoomState = agentSnapshots.some((item) => item.state === "active")
          ? "active"
          : agentSnapshots.some((item) => item.state === "warm")
            ? "warm"
            : "idle";

        return {
          room,
          state,
          agentSnapshots
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
      OFFICE_AGENTS.filter((agent) => !activeAgentIds.has(agent.id) && !warmAgentIds.has(agent.id)).slice(
        0,
        8
      ),
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

  const focusRoomId = useMemo(() => {
    const mapped = STAGE_ROOM_MAP[thinkingStage];
    if (mapped) {
      return mapped;
    }

    const activeRoom = roomSnapshots.find((snapshot) => snapshot.state === "active")?.room.id;
    return activeRoom ?? "market";
  }, [roomSnapshots, thinkingStage]);

  useEffect(() => {
    if (!open || !mapScrollRef.current) {
      return;
    }

    const scrollNode = mapScrollRef.current;
    const room = ROOM_BY_ID.get(focusRoomId);

    if (!room) {
      return;
    }

    const nextLeft = Math.max(0, room.x + room.w / 2 - scrollNode.clientWidth / 2);
    const nextTop = Math.max(0, room.y + room.h / 2 - scrollNode.clientHeight / 2);

    scrollNode.scrollTo({
      left: nextLeft,
      top: nextTop,
      behavior: "smooth"
    });
  }, [focusRoomId, open]);

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
                : "The office is quiet but warm. Scroll around the map to inspect rooms and stations."}
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
            <button
              type="button"
              className="gpx-sidebar-btn"
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? "OPEN PANEL" : "COLLAPSE"}
            </button>
            <button type="button" className="gpx-close" onClick={onClose}>
              CLOSE
            </button>
          </div>
        </header>

        <div className={`gpx-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
          <section className="gpx-map-window">
            <div className="gpx-window-head">
              <span>PIXEL FLOORPLAN</span>
              <strong>{isPending ? "WORKING" : "STANDBY"}</strong>
            </div>

            <div className="gpx-map-shell" ref={mapScrollRef}>
              <div className="gpx-map">
                <div className="gpx-grid-layer" aria-hidden />
                {roomSnapshots.map((snapshot) => (
                  <section
                    key={snapshot.room.id}
                    className={`gpx-room floor-${snapshot.room.floor} state-${snapshot.state}`}
                    style={
                      {
                        left: snapshot.room.x,
                        top: snapshot.room.y,
                        width: snapshot.room.w,
                        height: snapshot.room.h
                      } as CSSProperties
                    }
                  >
                    <span className={`gpx-room-lamp state-${snapshot.state}`} aria-hidden />

                    {snapshot.room.furniture.map((piece) => (
                      <div
                        key={piece.id}
                        className={`gpx-furniture type-${piece.type}${snapshot.state !== "idle" ? " live" : ""}${
                          piece.orientation === "v" ? " orient-v" : ""
                        }`}
                        style={
                          {
                            left: piece.x,
                            top: piece.y,
                            width: piece.w,
                            height: piece.h
                          } as CSSProperties
                        }
                      />
                    ))}

                    {snapshot.agentSnapshots.map(({ spot, agent, state }) => (
                      <div
                        key={agent.id}
                        className={`gpx-actor-slot state-${state}`}
                        style={
                          {
                            left: spot.x,
                            top: spot.y
                          } as CSSProperties
                        }
                      >
                        {(state === "active" || state === "warm") ? (
                          <div className={`gpx-agent-bubble state-${state}`}>
                            {state === "active" ? spot.activity : "READY"}
                          </div>
                        ) : null}
                        <div
                          className={`gpx-actor dir-${spot.direction} state-${state}`}
                          style={
                            {
                              backgroundImage: `url("${pickSpriteSheet(agent.id)}")`,
                              "--row-y": spriteRowY(spot.direction)
                            } as CSSProperties
                          }
                          aria-hidden
                        />
                        <span className="gpx-actor-badge">{agent.badge}</span>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </section>

          <div className={`gpx-side-rail${sidebarCollapsed ? " collapsed" : ""}`}>
            <button
              type="button"
              className="gpx-side-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? "OPEN PANEL" : "HIDE PANEL"}
            </button>

            {!sidebarCollapsed ? (
              <aside className="gpx-sidebar">
                <section className="gpx-panel">
                  <div className="gpx-window-head">
                    <span>MISSION</span>
                    <strong>{isPending ? "IN FLIGHT" : "LAST BRIEF"}</strong>
                  </div>
                  <p className="gpx-copy">
                    {latestPrompt.trim().length > 0
                      ? latestPrompt
                      : "No live brief yet. Send a prompt and Gideon will light up the office."}
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
                    <span>ROOMS</span>
                    <strong>{roomSnapshots.length}</strong>
                  </div>
                  <div className="gpx-room-list">
                    {roomSnapshots.map((snapshot) => (
                      <div key={snapshot.room.id} className={`gpx-room-row state-${snapshot.state}`}>
                        <div>
                          <strong>{snapshot.room.name}</strong>
                          <small>{snapshot.room.purpose}</small>
                        </div>
                        <span>{snapshot.state.toUpperCase()}</span>
                      </div>
                    ))}
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
                      <span>TOOLS</span>
                      <strong>{latestTools.length}</strong>
                    </div>
                  </div>
                </section>
              </aside>
            ) : null}
          </div>
        </div>
      </section>

      <style jsx>{`
        .gpx-overlay {
          position: absolute;
          inset: 0;
          z-index: 8;
          font-family: "Gideon Pixel", "IBM Plex Mono", monospace;
        }

        .gpx-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: rgba(5, 7, 13, 0.92);
          backdrop-filter: blur(2px);
        }

        .gpx-shell {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 0.46rem;
          padding: 0.46rem;
          background:
            radial-gradient(circle at 50% 0%, rgba(54, 71, 109, 0.42), transparent 42%),
            linear-gradient(180deg, #0c101a 0%, #05070d 100%);
          overflow: hidden;
          color: #f2f4ff;
        }

        .gpx-header,
        .gpx-map-window,
        .gpx-panel,
        .gpx-side-toggle {
          border: 3px solid #14192b;
          background: #282d48;
          box-shadow:
            0 0 0 3px #4b547b,
            6px 6px 0 rgba(3, 4, 10, 0.72);
        }

        .gpx-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.56rem;
          padding: 0.58rem 0.66rem;
        }

        .gpx-header-copy {
          display: grid;
          gap: 0.22rem;
          min-width: 0;
        }

        .gpx-status {
          justify-self: flex-start;
          padding: 0.18rem 0.4rem;
          border: 2px solid #0e1222;
          background: #3f486d;
          color: #f6f7ff;
          font-size: 0.62rem;
        }

        .gpx-status.live {
          background: #337c54;
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-header-copy h3 {
          margin: 0;
          color: #fff8de;
          font-size: 0.92rem;
          text-transform: uppercase;
        }

        .gpx-header-copy p {
          margin: 0;
          color: #d5daf6;
          font-size: 0.62rem;
          line-height: 1.46;
          max-width: 78ch;
        }

        .gpx-toolbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.38rem;
          align-items: flex-start;
        }

        .gpx-stat {
          min-width: 102px;
          padding: 0.28rem 0.4rem;
          border: 2px solid #0f1324;
          background: #353b5b;
          display: grid;
          gap: 0.12rem;
        }

        .gpx-stat span {
          color: #bac3eb;
          font-size: 0.46rem;
        }

        .gpx-stat strong {
          color: #fff7d4;
          font-size: 0.56rem;
        }

        .gpx-sidebar-btn,
        .gpx-close {
          border: 2px solid #101425;
          font: inherit;
          color: #fff7de;
          padding: 0.34rem 0.54rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 rgba(7, 8, 15, 0.58);
        }

        .gpx-sidebar-btn {
          background: #385b77;
        }

        .gpx-close {
          background: #87435a;
        }

        .gpx-sidebar-btn:hover {
          background: #467191;
        }

        .gpx-close:hover {
          background: #a24f69;
        }

        .gpx-layout {
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 382px;
          gap: 0.46rem;
        }

        .gpx-layout.sidebar-collapsed {
          grid-template-columns: minmax(0, 1fr) 56px;
        }

        .gpx-map-window {
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          overflow: hidden;
        }

        .gpx-window-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.36rem;
          padding: 0.28rem 0.42rem;
          border-bottom: 3px solid #14192b;
          background: #39405f;
          color: #fff8de;
          font-size: 0.52rem;
        }

        .gpx-window-head strong {
          color: #c7ffd4;
          font-size: 0.48rem;
        }

        .gpx-map-shell {
          min-height: 0;
          overflow: auto;
          padding: 0.45rem;
          background:
            linear-gradient(180deg, rgba(14, 18, 31, 0.98), rgba(7, 9, 16, 1));
        }

        .gpx-map {
          position: relative;
          width: ${MAP_WIDTH}px;
          height: ${MAP_HEIGHT}px;
          background:
            linear-gradient(180deg, #20243a, #171a2a),
            repeating-linear-gradient(
              0deg,
              rgba(255, 255, 255, 0.03) 0,
              rgba(255, 255, 255, 0.03) 2px,
              transparent 2px,
              transparent 32px
            ),
            repeating-linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.03) 0,
              rgba(255, 255, 255, 0.03) 2px,
              transparent 2px,
              transparent 32px
            );
          border: 4px solid #0e1222;
          box-shadow:
            inset 0 0 0 4px rgba(255, 255, 255, 0.04),
            8px 8px 0 rgba(0, 0, 0, 0.38);
        }

        .gpx-grid-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at center, transparent 58%, rgba(0, 0, 0, 0.22) 100%);
        }

        .gpx-room {
          position: absolute;
          overflow: hidden;
          border: 6px solid #0d1121;
          box-shadow:
            inset 0 0 0 4px rgba(255, 255, 255, 0.06),
            8px 8px 0 rgba(0, 0, 0, 0.34);
        }

        .gpx-room.floor-wood {
          background:
            repeating-linear-gradient(90deg, #a26b2d 0, #a26b2d 48px, #935e24 48px, #935e24 52px),
            repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.08) 0, rgba(0, 0, 0, 0.08) 2px, transparent 2px, transparent 48px);
        }

        .gpx-room.floor-tile {
          background:
            repeating-linear-gradient(90deg, #e8dfd9 0, #e8dfd9 44px, #d2c7c0 44px, #d2c7c0 48px),
            repeating-linear-gradient(0deg, transparent 0, transparent 44px, #d2c7c0 44px, #d2c7c0 48px);
        }

        .gpx-room.floor-blue {
          background:
            repeating-linear-gradient(90deg, #5178a1 0, #5178a1 42px, #44678b 42px, #44678b 48px),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0, rgba(255, 255, 255, 0.03) 2px, transparent 2px, transparent 48px);
        }

        .gpx-room.floor-slate {
          background:
            repeating-linear-gradient(90deg, #4f5467 0, #4f5467 42px, #43485a 42px, #43485a 48px),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.02) 2px, transparent 2px, transparent 48px);
        }

        .gpx-room.floor-dark {
          background:
            repeating-linear-gradient(90deg, #2b3141 0, #2b3141 42px, #242938 42px, #242938 48px),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.02) 2px, transparent 2px, transparent 48px);
        }

        .gpx-room.state-active {
          box-shadow:
            inset 0 0 0 4px rgba(255, 255, 255, 0.06),
            8px 8px 0 rgba(0, 0, 0, 0.34),
            0 0 0 4px rgba(95, 255, 155, 0.08);
        }

        .gpx-room.state-warm {
          box-shadow:
            inset 0 0 0 4px rgba(255, 255, 255, 0.06),
            8px 8px 0 rgba(0, 0, 0, 0.34),
            0 0 0 4px rgba(126, 157, 255, 0.06);
        }

        .gpx-room-lamp {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 18px;
          height: 18px;
          border: 2px solid #0c1020;
          background: #5a627f;
          z-index: 3;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
        }

        .gpx-room-lamp.state-active {
          background: #55d38d;
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-room-lamp.state-warm {
          background: #84a7ff;
        }

        .gpx-furniture {
          position: absolute;
          border: 2px solid #0b0f1d;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.42);
        }

        .gpx-furniture::before,
        .gpx-furniture::after {
          content: "";
          position: absolute;
        }

        .gpx-furniture.type-bookshelf {
          background:
            linear-gradient(180deg, #c8a05d 0 18%, #6a431e 18% 26%, #c8a05d 26% 46%, #6a431e 46% 54%, #c8a05d 54% 74%, #6a431e 74% 82%, #c8a05d 82% 100%);
        }

        .gpx-furniture.type-bookshelf::before {
          inset: 5px 6px;
          background:
            repeating-linear-gradient(
              90deg,
              #b73c49 0 8px,
              #567bd2 8px 15px,
              #57a76b 15px 22px,
              #d4b247 22px 29px,
              #814fb7 29px 36px,
              transparent 36px 42px
            );
        }

        .gpx-furniture.type-bookshelf.live::after {
          width: 8px;
          height: 8px;
          top: 6px;
          right: 8px;
          background: #fff3a8;
          animation: gpxBlink 1.2s steps(2, end) infinite;
        }

        .gpx-furniture.type-desk {
          background:
            linear-gradient(180deg, #b57d2d 0 18%, #8f6120 18% 72%, #5c3814 72% 100%);
        }

        .gpx-furniture.type-desk::before {
          left: 34px;
          top: 8px;
          width: 52px;
          height: 28px;
          border: 2px solid #101425;
          background: #465b7f;
        }

        .gpx-furniture.type-desk::after {
          left: 22px;
          right: 22px;
          bottom: 10px;
          height: 6px;
          background: rgba(0, 0, 0, 0.3);
        }

        .gpx-furniture.type-desk.live::before,
        .gpx-furniture.type-terminal.live::before,
        .gpx-furniture.type-projector.live::after {
          animation: gpxScreenPulse 1.1s steps(2, end) infinite;
        }

        .gpx-furniture.type-terminal {
          background: #22283a;
        }

        .gpx-furniture.type-terminal::before {
          inset: 4px;
          border: 2px solid #101425;
          background:
            linear-gradient(180deg, #9bd9ff, #4b7ecf);
        }

        .gpx-furniture.type-table {
          background:
            linear-gradient(180deg, #d0b07b 0 24%, #b2864d 24% 100%);
        }

        .gpx-furniture.type-table::before {
          width: 16px;
          height: 16px;
          top: 10px;
          right: 14px;
          border: 2px solid #101425;
          background: #fff6de;
        }

        .gpx-furniture.type-whiteboard {
          background: #cfd6e8;
        }

        .gpx-furniture.type-whiteboard::before {
          inset: 5px 7px;
          background:
            linear-gradient(90deg, transparent 0 18%, #d95767 18% 28%, transparent 28% 48%, #5b84d1 48% 60%, transparent 60% 100%);
        }

        .gpx-furniture.type-whiteboard.live::after {
          left: 10px;
          right: 10px;
          bottom: 7px;
          height: 4px;
          background: #fff4a9;
          animation: gpxBlink 1.2s steps(2, end) infinite;
        }

        .gpx-furniture.type-cooler {
          background:
            linear-gradient(180deg, #91c7ec 0 34%, #e8eef5 34% 82%, #6a7281 82% 100%);
        }

        .gpx-furniture.type-cooler::before {
          width: 14px;
          height: 14px;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          border: 2px solid #101425;
          background: #b9dcff;
        }

        .gpx-furniture.type-cooler.live::after {
          width: 6px;
          height: 6px;
          bottom: 6px;
          left: 50%;
          transform: translateX(-50%);
          background: #9fe3ff;
          animation: gpxBlink 1s steps(2, end) infinite;
        }

        .gpx-furniture.type-plant {
          background: #9a5f3c;
        }

        .gpx-furniture.type-plant::before {
          left: 4px;
          right: 4px;
          bottom: 14px;
          height: calc(100% - 14px);
          background:
            linear-gradient(90deg, transparent 0 8%, #3d8a3f 8% 26%, transparent 26% 38%, #57a55a 38% 62%, transparent 62% 74%, #2f6c38 74% 92%, transparent 92% 100%);
        }

        .gpx-furniture.type-server {
          background:
            linear-gradient(180deg, #596071 0 12%, #252a37 12% 100%);
        }

        .gpx-furniture.type-server::before {
          inset: 8px;
          background:
            repeating-linear-gradient(
              180deg,
              #363d50 0 8px,
              #212635 8px 16px
            );
        }

        .gpx-furniture.type-server.live::after {
          width: 8px;
          height: 8px;
          right: 8px;
          bottom: 8px;
          background: #57d46c;
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-furniture.type-sofa {
          background:
            linear-gradient(180deg, #dba2b3 0 18%, #8c4961 18% 100%);
        }

        .gpx-furniture.type-sofa::before {
          inset: 12px 18px 14px;
          background: #f0dbe4;
        }

        .gpx-furniture.type-projector {
          background: #2a3043;
        }

        .gpx-furniture.type-projector::before {
          inset: 4px 12px;
          background: #66739a;
        }

        .gpx-furniture.type-projector::after {
          top: 100%;
          left: 50%;
          width: 120px;
          height: 80px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, rgba(155, 213, 255, 0.3), transparent);
          clip-path: polygon(45% 0, 55% 0, 100% 100%, 0 100%);
        }

        .gpx-furniture.type-archive {
          background:
            linear-gradient(180deg, #9aa5bc 0 14%, #717a92 14% 100%);
        }

        .gpx-furniture.type-archive::before {
          inset: 8px;
          background:
            repeating-linear-gradient(
              180deg,
              #b9c2d8 0 22px,
              #6c7591 22px 26px,
              #b9c2d8 26px 48px,
              #6c7591 48px 52px
            );
        }

        .gpx-actor-slot {
          position: absolute;
          z-index: 5;
          width: 32px;
          height: 48px;
          transform: translate(-50%, -100%);
          pointer-events: none;
        }

        .gpx-actor-slot.state-active {
          animation: gpxActorHop 0.9s steps(2, end) infinite;
        }

        .gpx-actor-slot.state-warm {
          animation: gpxActorBob 1.6s steps(2, end) infinite;
        }

        .gpx-agent-bubble {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 10px);
          transform: translateX(-50%);
          border: 2px solid #101425;
          padding: 1px 4px;
          background: #f6f1dc;
          color: #171c2a;
          font-size: 0.38rem;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.48);
          white-space: nowrap;
        }

        .gpx-agent-bubble::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 100%;
          width: 6px;
          height: 6px;
          background: #f6f1dc;
          border-right: 2px solid #101425;
          border-bottom: 2px solid #101425;
          transform: translate(-50%, -3px) rotate(45deg);
        }

        .gpx-agent-bubble.state-active {
          background: #e9ffd7;
        }

        .gpx-agent-bubble.state-warm {
          background: #dfe6ff;
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
          animation: gpxSpriteWalk 0.85s steps(6) infinite;
        }

        .gpx-actor.state-warm {
          animation: gpxSpriteGlow 1.25s steps(2, end) infinite;
        }

        .gpx-actor-badge {
          position: absolute;
          left: 50%;
          top: calc(100% + 3px);
          transform: translateX(-50%);
          padding: 1px 4px;
          border: 2px solid #101425;
          background: #f6f1dc;
          color: #181c2a;
          font-size: 0.36rem;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.48);
        }

        .gpx-side-rail {
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 0.46rem;
        }

        .gpx-side-rail.collapsed {
          grid-template-rows: minmax(0, 1fr);
        }

        .gpx-side-toggle {
          padding: 0.42rem 0.2rem;
          color: #fff7de;
          background: #365268;
          cursor: pointer;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          letter-spacing: 0.05em;
          min-height: 132px;
        }

        .gpx-side-toggle:hover {
          background: #43677f;
        }

        .gpx-sidebar {
          min-height: 0;
          overflow: auto;
          display: grid;
          gap: 0.46rem;
          align-content: start;
          padding-right: 0.1rem;
        }

        .gpx-panel {
          overflow: hidden;
          padding-bottom: 0.34rem;
        }

        .gpx-copy {
          margin: 0;
          padding: 0.38rem 0.44rem 0;
          color: #edf0ff;
          font-size: 0.52rem;
          line-height: 1.46;
        }

        .gpx-stage-list,
        .gpx-roster,
        .gpx-room-list,
        .gpx-artifacts {
          padding: 0.36rem 0.44rem 0;
        }

        .gpx-stage-list {
          display: grid;
          gap: 0.22rem;
        }

        .gpx-stage-pill {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.3rem;
          padding: 0.18rem 0.22rem;
          border: 2px solid #0f1324;
          background: #2f3552;
        }

        .gpx-stage-pill span {
          min-width: 24px;
          color: #fff7d4;
          font-size: 0.42rem;
        }

        .gpx-stage-pill strong {
          color: #edf0ff;
          font-size: 0.46rem;
        }

        .gpx-stage-pill.state-done {
          background: #315244;
        }

        .gpx-stage-pill.state-active {
          background: #6a542e;
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-room-list,
        .gpx-roster {
          display: grid;
          gap: 0.22rem;
        }

        .gpx-room-row,
        .gpx-roster-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.3rem;
          padding: 0.2rem 0.24rem;
          border: 2px solid #0f1324;
          background: #2f3552;
        }

        .gpx-room-row strong,
        .gpx-roster-row strong,
        .gpx-room-row small,
        .gpx-roster-row small {
          display: block;
        }

        .gpx-room-row strong,
        .gpx-roster-row strong {
          color: #fff7de;
          font-size: 0.47rem;
        }

        .gpx-room-row small,
        .gpx-roster-row small {
          margin-top: 0.08rem;
          color: #ced4fa;
          font-size: 0.39rem;
          line-height: 1.35;
        }

        .gpx-room-row > span {
          align-self: start;
          border: 2px solid #101425;
          padding: 0.08rem 0.22rem;
          color: #f6f7ff;
          font-size: 0.38rem;
          background: #40476b;
        }

        .gpx-room-row.state-active {
          background: #315043;
        }

        .gpx-room-row.state-active > span {
          background: #3d9664;
        }

        .gpx-room-row.state-warm {
          background: #3a3f60;
        }

        .gpx-room-row.state-warm > span {
          background: #4d6fb8;
        }

        .gpx-subsection {
          padding: 0.34rem 0.44rem 0;
          display: grid;
          gap: 0.18rem;
        }

        .gpx-subsection > span {
          color: #fff7d4;
          font-size: 0.45rem;
        }

        .gpx-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.18rem;
        }

        .gpx-tag {
          padding: 0.12rem 0.26rem;
          border: 2px solid #101425;
          background: #2d314a;
          color: #edf0ff;
          font-size: 0.38rem;
        }

        .gpx-tag.type-function {
          background: #2d4f3f;
        }

        .gpx-tag.type-tool {
          background: #5a492a;
        }

        .gpx-tag.type-template {
          background: #4f3660;
        }

        .gpx-roster-row {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .gpx-roster-row span {
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #101425;
          background: #f6f1dc;
          color: #181c2a;
          font-size: 0.4rem;
        }

        .gpx-roster-row.active {
          background: #315043;
        }

        .gpx-roster-row.idle {
          background: #38355a;
        }

        .gpx-empty {
          color: #dde2ff;
          font-size: 0.48rem;
          line-height: 1.4;
        }

        .gpx-artifacts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.2rem;
        }

        .gpx-artifact {
          padding: 0.18rem 0.22rem;
          border: 2px solid #101425;
          background: #2f3552;
          display: grid;
          gap: 0.08rem;
        }

        .gpx-artifact span {
          color: #cad2f7;
          font-size: 0.36rem;
        }

        .gpx-artifact strong {
          color: #fff7d4;
          font-size: 0.48rem;
        }

        @keyframes gpxBlink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0.76;
          }
        }

        @keyframes gpxActorHop {
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

        @keyframes gpxSpriteGlow {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.08);
          }
        }

        @keyframes gpxScreenPulse {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.3);
          }
        }

        @media (max-width: 1200px) {
          .gpx-layout {
            grid-template-columns: minmax(0, 1fr) 340px;
          }
        }

        @media (max-width: 920px) {
          .gpx-header {
            grid-template-columns: minmax(0, 1fr);
          }

          .gpx-toolbar {
            justify-content: flex-start;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .gpx-status.live,
          .gpx-room-lamp.state-active,
          .gpx-stage-pill.state-active,
          .gpx-furniture.live::after,
          .gpx-furniture.live::before,
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
