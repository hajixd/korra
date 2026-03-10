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
  | "pingpong"
  | "tv"
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
  targetFurnitureId?: string;
  targetOffsetX?: number;
  targetOffsetY?: number;
};

type DecorationType = "poster" | "flower" | "coffee" | "serverroom" | "cat";

type PixelDecoration = {
  id: string;
  type: DecorationType;
  x: number;
  y: number;
  w: number;
  h: number;
  frame?: number;
  animated?: boolean;
  zIndex?: number;
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
  decorations?: PixelDecoration[];
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
const DEFAULT_MAP_SCALE = 2.24;
const MIN_MAP_SCALE = 1.48;
const MAX_MAP_SCALE = 3.36;
const MAP_SCALE_STEP = 0.24;
const SIDEBAR_WIDTH = 640;
const CORRIDOR_WIDTH = 42;
const AGENT_TICK_MS = 90;
const AGENT_SPEED_BY_STATE: Record<RoomState, number> = {
  active: 10,
  warm: 8,
  idle: 6
};

type WorldPoint = {
  x: number;
  y: number;
};

type RoomDoorSide = "top" | "right" | "bottom" | "left";

type RoomDoor = {
  id: string;
  roomId: string;
  x: number;
  y: number;
  side: RoomDoorSide;
};

type PathNode = {
  id: string;
  x: number;
  y: number;
};

type AgentStation = {
  id: string;
  roomId: string | null;
  x: number;
  y: number;
  direction: PixelDirection;
  activity: string;
  targetFurnitureId?: string;
  targetOffsetX?: number;
  targetOffsetY?: number;
  holdMin?: number;
  holdMax?: number;
  groupId?: string;
};

type SimAgent = {
  agentId: string;
  x: number;
  y: number;
  direction: PixelDirection;
  state: RoomState;
  targetId: string;
  targetRoomId: string | null;
  targetFurnitureId?: string;
  targetOffsetX?: number;
  targetOffsetY?: number;
  route: WorldPoint[];
  holdTicks: number;
  stationCycle: number;
  activity: string;
  groupId?: string;
};

const STAR_OFFICE_ASSETS = {
  desk: "/gideon-pixel/star-office/desk-v3.webp",
  sofa: "/gideon-pixel/star-office/sofa-idle-v3.png",
  sofaShadow: "/gideon-pixel/star-office/sofa-shadow-v1.png",
  plants: "/gideon-pixel/star-office/plants-spritesheet.webp",
  posters: "/gideon-pixel/star-office/posters-spritesheet.webp",
  coffee: "/gideon-pixel/star-office/coffee-machine-v3-grid.webp",
  coffeeShadow: "/gideon-pixel/star-office/coffee-machine-shadow-v1.png",
  serverroom: "/gideon-pixel/star-office/serverroom-spritesheet.webp",
  cats: "/gideon-pixel/star-office/cats-spritesheet.webp",
  flowers: "/gideon-pixel/star-office/flowers-bloom-v2.webp"
} as const;

const SPRITE_SHEETS = [
  "/gideon-pixel/char_0.png",
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
    agents: [
      {
        agentId: "research",
        x: 316,
        y: 232,
        direction: "right",
        activity: "READ",
        targetFurnitureId: "research-mid-west-shelf-1",
        targetOffsetX: 18
      }
    ]
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
      {
        agentId: "supervisor",
        x: 150,
        y: 184,
        direction: "up",
        activity: "ROUTE",
        targetFurnitureId: "routing-board"
      },
      {
        agentId: "depth",
        x: 236,
        y: 184,
        direction: "up",
        activity: "DEPTH",
        targetFurnitureId: "routing-terminal"
      }
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
    decorations: [
      { id: "briefing-poster", type: "poster", x: 360, y: 18, w: 56, h: 56, frame: 6 },
      { id: "briefing-flower", type: "flower", x: 224, y: 150, w: 34, h: 34, frame: 7 }
    ],
    agents: [
      {
        agentId: "intake",
        x: 182,
        y: 184,
        direction: "right",
        activity: "BRIEF",
        targetFurnitureId: "briefing-table"
      },
      {
        agentId: "clarifier",
        x: 312,
        y: 184,
        direction: "left",
        activity: "ASK",
        targetFurnitureId: "briefing-board"
      }
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
    decorations: [
      { id: "market-poster-a", type: "poster", x: 72, y: 18, w: 58, h: 58, frame: 11 },
      { id: "market-poster-b", type: "poster", x: 448, y: 18, w: 58, h: 58, frame: 18 },
      { id: "market-serverroom", type: "serverroom", x: 512, y: 350, w: 128, h: 178, animated: true, zIndex: 2 }
    ],
    agents: [
      {
        agentId: "market",
        x: 122,
        y: 180,
        direction: "down",
        activity: "PRICE",
        targetFurnitureId: "market-a-terminal"
      },
      {
        agentId: "signal",
        x: 498,
        y: 342,
        direction: "down",
        activity: "SCAN",
        targetFurnitureId: "market-f-terminal"
      }
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
    decorations: [
      { id: "code-poster", type: "poster", x: 76, y: 20, w: 58, h: 58, frame: 2 },
      { id: "code-serverroom", type: "serverroom", x: 356, y: 84, w: 118, h: 164, animated: true, zIndex: 2 }
    ],
    agents: [
      {
        agentId: "coder",
        x: 286,
        y: 210,
        direction: "up",
        activity: "CODE",
        targetFurnitureId: "code-b-terminal"
      }
    ]
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
    decorations: [
      { id: "tool-coffee", type: "coffee", x: 348, y: 170, w: 70, h: 70, frame: 15, zIndex: 2 },
      { id: "tool-serverroom", type: "serverroom", x: 42, y: 150, w: 112, h: 156, animated: true, zIndex: 2 }
    ],
    agents: [
      {
        agentId: "toolsmith",
        x: 290,
        y: 176,
        direction: "right",
        activity: "RUN",
        targetFurnitureId: "tool-console-terminal"
      }
    ]
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
    decorations: [
      { id: "strategy-poster", type: "poster", x: 404, y: 40, w: 60, h: 60, frame: 24 },
      { id: "strategy-flower", type: "flower", x: 276, y: 174, w: 34, h: 34, frame: 11 }
    ],
    agents: [
      {
        agentId: "strategist",
        x: 216,
        y: 232,
        direction: "right",
        activity: "PLAN",
        targetFurnitureId: "strategy-board"
      },
      {
        agentId: "modeler",
        x: 328,
        y: 232,
        direction: "left",
        activity: "JSON",
        targetFurnitureId: "strategy-table"
      }
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
      {
        agentId: "charter",
        x: 154,
        y: 270,
        direction: "up",
        activity: "DRAW",
        targetFurnitureId: "chart-board-a"
      },
      {
        agentId: "animator",
        x: 470,
        y: 270,
        direction: "up",
        activity: "MOVE",
        targetFurnitureId: "chart-projector",
        targetOffsetY: 36
      }
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
      { id: "hearth-pingpong", type: "pingpong", x: 218, y: 132, w: 204, h: 92 },
      { id: "hearth-tv", type: "tv", x: 252, y: 34, w: 136, h: 60 },
      { id: "hearth-cooler", type: "cooler", x: 568, y: 44, w: 34, h: 52 },
      { id: "hearth-plant-a", type: "plant", x: 68, y: 282, w: 28, h: 40 },
      { id: "hearth-plant-b", type: "plant", x: 546, y: 282, w: 28, h: 40 }
    ],
    decorations: [
      { id: "hearth-cat", type: "cat", x: 280, y: 248, w: 44, h: 44, frame: 5, zIndex: 3 },
      { id: "hearth-coffee", type: "coffee", x: 510, y: 42, w: 78, h: 78, frame: 24, zIndex: 2 },
      { id: "hearth-flower", type: "flower", x: 322, y: 136, w: 36, h: 36, frame: 10, zIndex: 4 },
      { id: "hearth-poster", type: "poster", x: 286, y: 26, w: 60, h: 60, frame: 28 }
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
    decorations: [{ id: "memory-serverroom", type: "serverroom", x: 44, y: 164, w: 116, h: 162, animated: true, zIndex: 2 }],
    agents: [
      {
        agentId: "memory",
        x: 248,
        y: 218,
        direction: "up",
        activity: "CACHE",
        targetFurnitureId: "memory-archive-a"
      }
    ]
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
      {
        agentId: "stats",
        x: 136,
        y: 210,
        direction: "up",
        activity: "STATS",
        targetFurnitureId: "stats-board"
      },
      {
        agentId: "indicator",
        x: 374,
        y: 210,
        direction: "up",
        activity: "MATH",
        targetFurnitureId: "stats-b-terminal"
      }
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
    agents: [
      {
        agentId: "templater",
        x: 320,
        y: 198,
        direction: "up",
        activity: "FRAME",
        targetFurnitureId: "template-archive"
      }
    ]
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
      { id: "cinema-tv", type: "tv", x: 146, y: 86, w: 140, h: 62 },
      { id: "cinema-sofa-a", type: "sofa", x: 72, y: 170, w: 100, h: 58 },
      { id: "cinema-sofa-b", type: "sofa", x: 258, y: 170, w: 100, h: 58 },
      { id: "cinema-table", type: "table", x: 160, y: 186, w: 102, h: 58 }
    ],
    decorations: [{ id: "cinema-poster", type: "poster", x: 180, y: 78, w: 64, h: 64, frame: 9 }],
    agents: [
      {
        agentId: "cinema",
        x: 216,
        y: 206,
        direction: "up",
        activity: "CUE",
        targetFurnitureId: "cinema-projector",
        targetOffsetY: 28
      }
    ]
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
    decorations: [
      { id: "narrative-poster", type: "poster", x: 34, y: 108, w: 56, h: 56, frame: 15 },
      { id: "narrative-flower", type: "flower", x: 206, y: 142, w: 30, h: 30, frame: 4 }
    ],
    agents: [
      {
        agentId: "writer",
        x: 166,
        y: 210,
        direction: "up",
        activity: "WRITE",
        targetFurnitureId: "narrative-terminal"
      }
    ]
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
    decorations: [{ id: "audit-serverroom", type: "serverroom", x: 222, y: 74, w: 92, h: 128, animated: true, zIndex: 2 }],
    agents: [
      {
        agentId: "auditor",
        x: 136,
        y: 224,
        direction: "up",
        activity: "AUDIT",
        targetFurnitureId: "audit-board"
      },
      {
        agentId: "sentinel",
        x: 216,
        y: 224,
        direction: "up",
        activity: "GUARD",
        targetFurnitureId: "audit-table"
      }
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

const clampNumber = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const distanceBetweenPoints = (left: WorldPoint, right: WorldPoint): number =>
  Math.hypot(right.x - left.x, right.y - left.y);

const roomPoint = (roomId: string, x: number, y: number): WorldPoint => {
  const room = ROOM_BY_ID.get(roomId);
  return room ? { x: room.x + x, y: room.y + y } : { x, y };
};

const WORLD_FURNITURE = OFFICE_ROOMS.flatMap((room) =>
  room.furniture.map((piece) => ({
    ...piece,
    roomId: room.id,
    absX: room.x + piece.x,
    absY: room.y + piece.y
  }))
);

const WORLD_DECORATIONS = OFFICE_ROOMS.flatMap((room) =>
  (room.decorations ?? []).map((decoration) => ({
    ...decoration,
    roomId: room.id,
    absX: room.x + decoration.x,
    absY: room.y + decoration.y
  }))
);

type WorldTarget = (typeof WORLD_FURNITURE)[number] | (typeof WORLD_DECORATIONS)[number];

const WORLD_TARGET_BY_ID = new Map(
  [...WORLD_FURNITURE, ...WORLD_DECORATIONS].map((piece) => [piece.id, piece])
);

const ROOM_DOORS: RoomDoor[] = [
  { id: "door-research", roomId: "research", x: 720, y: 286, side: "right" },
  { id: "door-routing", roomId: "routing", x: 1015, y: 360, side: "bottom" },
  { id: "door-briefing", roomId: "briefing", x: 1525, y: 390, side: "bottom" },
  { id: "door-market", roomId: "market", x: 1840, y: 320, side: "left" },
  { id: "door-code", roomId: "code", x: 630, y: 768, side: "right" },
  { id: "door-tools", roomId: "tools", x: 700, y: 640, side: "left" },
  { id: "door-strategy", roomId: "strategy", x: 1240, y: 644, side: "left" },
  { id: "door-charts", roomId: "charts", x: 1840, y: 900, side: "left" },
  { id: "door-hearth", roomId: "hearth", x: 720, y: 1210, side: "right" },
  { id: "door-memory", roomId: "memory", x: 780, y: 1126, side: "left" },
  { id: "door-stats", roomId: "stats", x: 1240, y: 1095, side: "left" },
  { id: "door-templates", roomId: "templates", x: 1455, y: 1320, side: "top" },
  { id: "door-cinema", roomId: "cinema", x: 760, y: 1490, side: "left" },
  { id: "door-narrative", roomId: "narrative", x: 2100, y: 1395, side: "right" },
  { id: "door-audit", roomId: "audit", x: 2160, y: 1385, side: "left" }
];

const ROOM_DOOR_BY_ROOM = new Map(ROOM_DOORS.map((door) => [door.roomId, door]));

const PATH_NODES: PathNode[] = [
  { id: "hub-west-top", x: 680, y: 286 },
  { id: "hub-mid-top", x: 1015, y: 390 },
  { id: "hub-east-top", x: 1525, y: 390 },
  { id: "hub-market", x: 1790, y: 320 },
  { id: "hub-west-mid", x: 680, y: 640 },
  { id: "hub-center-mid", x: 1210, y: 640 },
  { id: "hub-east-mid", x: 1790, y: 900 },
  { id: "hub-west-low", x: 680, y: 1126 },
  { id: "hub-center-low", x: 1210, y: 1095 },
  { id: "hub-lounge", x: 680, y: 1210 },
  { id: "hub-bottom-west", x: 680, y: 1490 },
  { id: "hub-bottom-center", x: 1455, y: 1290 },
  { id: "hub-bottom-east", x: 1790, y: 1395 },
  { id: "hub-audit", x: 2140, y: 1385 },
  ...ROOM_DOORS.map((door) => ({
    id: door.id,
    x: door.x,
    y: door.y
  }))
];

const PATH_NODE_BY_ID = new Map(PATH_NODES.map((node) => [node.id, node]));

const PATH_EDGES: Array<[string, string]> = [
  ["door-research", "hub-west-top"],
  ["door-routing", "hub-mid-top"],
  ["door-briefing", "hub-east-top"],
  ["door-market", "hub-market"],
  ["door-code", "hub-west-mid"],
  ["door-tools", "hub-west-mid"],
  ["door-strategy", "hub-center-mid"],
  ["door-charts", "hub-east-mid"],
  ["door-hearth", "hub-lounge"],
  ["door-memory", "hub-west-low"],
  ["door-stats", "hub-center-low"],
  ["door-templates", "hub-bottom-center"],
  ["door-cinema", "hub-bottom-west"],
  ["door-narrative", "hub-bottom-east"],
  ["door-audit", "hub-audit"],
  ["hub-west-top", "hub-mid-top"],
  ["hub-mid-top", "hub-east-top"],
  ["hub-east-top", "hub-market"],
  ["hub-west-top", "hub-west-mid"],
  ["hub-west-mid", "hub-west-low"],
  ["hub-west-low", "hub-lounge"],
  ["hub-lounge", "hub-bottom-west"],
  ["hub-west-mid", "hub-center-mid"],
  ["hub-center-mid", "hub-east-mid"],
  ["hub-center-mid", "hub-center-low"],
  ["hub-center-low", "hub-bottom-center"],
  ["hub-market", "hub-east-mid"],
  ["hub-east-mid", "hub-bottom-east"],
  ["hub-bottom-west", "hub-bottom-center"],
  ["hub-bottom-center", "hub-bottom-east"],
  ["hub-bottom-east", "hub-audit"],
  ["hub-west-low", "hub-center-low"]
];

const PATH_LINKS = PATH_EDGES.reduce<Map<string, string[]>>((graph, [from, to]) => {
  graph.set(from, [...(graph.get(from) ?? []), to]);
  graph.set(to, [...(graph.get(to) ?? []), from]);
  return graph;
}, new Map());

const PATH_SEGMENTS = PATH_EDGES.map(([fromId, toId], index) => {
  const from = PATH_NODE_BY_ID.get(fromId);
  const to = PATH_NODE_BY_ID.get(toId);
  if (!from || !to) {
    return {
      id: `segment-${index}`,
      x: 0,
      y: 0,
      w: 0,
      h: 0
    };
  }

  if (from.x === to.x) {
    return {
      id: `segment-${index}`,
      x: from.x - CORRIDOR_WIDTH / 2,
      y: Math.min(from.y, to.y) - CORRIDOR_WIDTH / 2,
      w: CORRIDOR_WIDTH,
      h: Math.abs(from.y - to.y) + CORRIDOR_WIDTH
    };
  }

  return {
    id: `segment-${index}`,
    x: Math.min(from.x, to.x) - CORRIDOR_WIDTH / 2,
    y: from.y - CORRIDOR_WIDTH / 2,
    w: Math.abs(from.x - to.x) + CORRIDOR_WIDTH,
    h: CORRIDOR_WIDTH
  };
});

const HOME_STATIONS: AgentStation[] = OFFICE_ROOMS.flatMap((room) =>
  room.agents.map((spot) => ({
    id: `home-${spot.agentId}`,
    roomId: room.id,
    x: room.x + spot.x,
    y: room.y + spot.y,
    direction: spot.direction,
    activity: spot.activity,
    targetFurnitureId: spot.targetFurnitureId,
    targetOffsetX: spot.targetOffsetX,
    targetOffsetY: spot.targetOffsetY,
    holdMin: 18,
    holdMax: 28
  }))
);

const HOME_STATION_BY_AGENT = new Map(
  HOME_STATIONS.map((station) => [station.id.replace("home-", ""), station])
);

const WARM_STATIONS: AgentStation[] = [
  {
    id: "warm-briefing-a",
    roomId: "briefing",
    ...roomPoint("briefing", 202, 214),
    direction: "right",
    activity: "SYNC",
    targetFurnitureId: "briefing-table",
    holdMin: 20,
    holdMax: 34,
    groupId: "briefing-huddle"
  },
  {
    id: "warm-briefing-b",
    roomId: "briefing",
    ...roomPoint("briefing", 290, 214),
    direction: "left",
    activity: "SYNC",
    targetFurnitureId: "briefing-table",
    holdMin: 20,
    holdMax: 34,
    groupId: "briefing-huddle"
  },
  {
    id: "warm-routing-a",
    roomId: "routing",
    ...roomPoint("routing", 154, 212),
    direction: "up",
    activity: "QUEUE",
    targetFurnitureId: "routing-board",
    holdMin: 18,
    holdMax: 30,
    groupId: "routing-huddle"
  },
  {
    id: "warm-routing-b",
    roomId: "routing",
    ...roomPoint("routing", 234, 212),
    direction: "up",
    activity: "QUEUE",
    targetFurnitureId: "routing-terminal",
    holdMin: 18,
    holdMax: 30,
    groupId: "routing-huddle"
  },
  {
    id: "warm-strategy-a",
    roomId: "strategy",
    ...roomPoint("strategy", 216, 248),
    direction: "right",
    activity: "PLAN",
    targetFurnitureId: "strategy-table",
    holdMin: 22,
    holdMax: 34,
    groupId: "strategy-huddle"
  },
  {
    id: "warm-strategy-b",
    roomId: "strategy",
    ...roomPoint("strategy", 330, 248),
    direction: "left",
    activity: "PLAN",
    targetFurnitureId: "strategy-table",
    holdMin: 22,
    holdMax: 34,
    groupId: "strategy-huddle"
  },
  {
    id: "warm-charts-a",
    roomId: "charts",
    ...roomPoint("charts", 180, 310),
    direction: "up",
    activity: "DRAW",
    targetFurnitureId: "chart-board-a",
    holdMin: 18,
    holdMax: 28,
    groupId: "chart-sync"
  },
  {
    id: "warm-charts-b",
    roomId: "charts",
    ...roomPoint("charts", 454, 310),
    direction: "up",
    activity: "REVIEW",
    targetFurnitureId: "chart-board-b",
    holdMin: 18,
    holdMax: 28,
    groupId: "chart-sync"
  }
];

const IDLE_STATIONS: AgentStation[] = [
  {
    id: "idle-pingpong-a",
    roomId: "hearth",
    ...roomPoint("hearth", 246, 244),
    direction: "right",
    activity: "PONG",
    targetFurnitureId: "hearth-pingpong",
    holdMin: 28,
    holdMax: 44,
    groupId: "pingpong"
  },
  {
    id: "idle-pingpong-b",
    roomId: "hearth",
    ...roomPoint("hearth", 390, 244),
    direction: "left",
    activity: "PONG",
    targetFurnitureId: "hearth-pingpong",
    holdMin: 28,
    holdMax: 44,
    groupId: "pingpong"
  },
  {
    id: "idle-tv-hearth-a",
    roomId: "hearth",
    ...roomPoint("hearth", 126, 212),
    direction: "right",
    activity: "TV",
    targetFurnitureId: "hearth-tv",
    holdMin: 26,
    holdMax: 42,
    groupId: "tv-hearth"
  },
  {
    id: "idle-tv-hearth-b",
    roomId: "hearth",
    ...roomPoint("hearth", 516, 212),
    direction: "left",
    activity: "TV",
    targetFurnitureId: "hearth-tv",
    holdMin: 26,
    holdMax: 42,
    groupId: "tv-hearth"
  },
  {
    id: "idle-tv-cinema-a",
    roomId: "cinema",
    ...roomPoint("cinema", 134, 228),
    direction: "right",
    activity: "WATCH",
    targetFurnitureId: "cinema-tv",
    holdMin: 26,
    holdMax: 42,
    groupId: "tv-cinema"
  },
  {
    id: "idle-tv-cinema-b",
    roomId: "cinema",
    ...roomPoint("cinema", 300, 228),
    direction: "left",
    activity: "WATCH",
    targetFurnitureId: "cinema-tv",
    holdMin: 26,
    holdMax: 42,
    groupId: "tv-cinema"
  },
  {
    id: "idle-coffee-tools",
    roomId: "tools",
    ...roomPoint("tools", 326, 242),
    direction: "right",
    activity: "COFFEE",
    targetFurnitureId: "tool-coffee",
    holdMin: 18,
    holdMax: 30,
    groupId: "coffee-tools"
  },
  {
    id: "idle-wander-west",
    roomId: null,
    x: 680,
    y: 885,
    direction: "down",
    activity: "WANDER",
    holdMin: 10,
    holdMax: 18,
    groupId: "hall-west"
  },
  {
    id: "idle-wander-center",
    roomId: null,
    x: 1210,
    y: 920,
    direction: "down",
    activity: "WANDER",
    holdMin: 10,
    holdMax: 18,
    groupId: "hall-center"
  },
  {
    id: "idle-wander-east",
    roomId: null,
    x: 1790,
    y: 1180,
    direction: "down",
    activity: "CHAT",
    holdMin: 10,
    holdMax: 18,
    groupId: "hall-east"
  }
];

const ALL_STATIONS_BY_ID = new Map(
  [...HOME_STATIONS, ...WARM_STATIONS, ...IDLE_STATIONS].map((station) => [station.id, station])
);

const pickSpriteSheet = (seed: string): string =>
  SPRITE_SHEETS[hashString(seed) % SPRITE_SHEETS.length] ?? SPRITE_SHEETS[0];

const pickVariant = (seed: string, total: number): number => {
  if (total <= 0) {
    return 0;
  }

  return hashString(seed) % total;
};

const buildGridSpriteStyle = (assetUrl: string, cols: number, rows: number, frame: number): CSSProperties => {
  const boundedFrame = Math.max(0, frame) % Math.max(cols * rows, 1);
  const col = boundedFrame % cols;
  const row = Math.floor(boundedFrame / cols);

  return {
    backgroundImage: `url("${assetUrl}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols === 1 ? 0 : (col / (cols - 1)) * 100}% ${
      rows === 1 ? 0 : (row / (rows - 1)) * 100
    }%`
  };
};

const buildStripSpriteStyle = (assetUrl: string, frames: number, frame = 0): CSSProperties => ({
  backgroundImage: `url("${assetUrl}")`,
  backgroundRepeat: "no-repeat",
  backgroundSize: `${frames * 100}% 100%`,
  backgroundPosition: `${frames === 1 ? 0 : (Math.max(0, frame % frames) / (frames - 1)) * 100}% 0%`
});

const pointInsideRoom = (point: WorldPoint, room: OfficeRoom): boolean =>
  point.x >= room.x && point.x <= room.x + room.w && point.y >= room.y && point.y <= room.y + room.h;

const findRoomIdForPoint = (point: WorldPoint): string | null =>
  OFFICE_ROOMS.find((room) => pointInsideRoom(point, room))?.id ?? null;

const getNearestPathNodeId = (point: WorldPoint): string | null => {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of PATH_NODES) {
    const distance = distanceBetweenPoints(point, node);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = node.id;
    }
  }

  return bestId;
};

const buildShortestNodePath = (startId: string, endId: string): string[] => {
  if (startId === endId) {
    return [startId];
  }

  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const remaining = new Set(PATH_NODES.map((node) => node.id));

  while (remaining.size > 0) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const nodeId of remaining) {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        currentDistance = distance;
        currentId = nodeId;
      }
    }

    if (!currentId || currentDistance === Number.POSITIVE_INFINITY) {
      break;
    }

    if (currentId === endId) {
      break;
    }

    remaining.delete(currentId);

    for (const neighborId of PATH_LINKS.get(currentId) ?? []) {
      if (!remaining.has(neighborId)) {
        continue;
      }

      const current = PATH_NODE_BY_ID.get(currentId);
      const neighbor = PATH_NODE_BY_ID.get(neighborId);
      if (!current || !neighbor) {
        continue;
      }

      const nextDistance = currentDistance + distanceBetweenPoints(current, neighbor);
      if (nextDistance < (distances.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighborId, nextDistance);
        previous.set(neighborId, currentId);
      }
    }
  }

  const path: string[] = [];
  let cursor: string | undefined = endId;

  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(cursor);
  }

  return path[0] === startId ? path : [startId];
};

const normalizeRoutePoints = (points: WorldPoint[]): WorldPoint[] => {
  const output: WorldPoint[] = [];

  for (const point of points) {
    const lastPoint = output[output.length - 1];
    if (lastPoint && distanceBetweenPoints(lastPoint, point) < 2) {
      continue;
    }
    output.push(point);
  }

  return output;
};

const stationHoldTicks = (agentId: string, station: AgentStation, cycle: number): number => {
  const min = station.holdMin ?? 18;
  const max = station.holdMax ?? min;
  const spread = Math.max(max - min, 0);
  return min + (spread > 0 ? hashString(`${agentId}:${station.id}:${cycle}`) % (spread + 1) : 0);
};

const selectAgentStation = (agentId: string, state: RoomState, cycle: number): AgentStation => {
  if (state === "active") {
    return (
      HOME_STATION_BY_AGENT.get(agentId) ??
      HOME_STATIONS[0] ?? {
        id: `fallback-${agentId}`,
        roomId: null,
        x: MAP_WIDTH / 2,
        y: MAP_HEIGHT / 2,
        direction: "down",
        activity: "WAIT"
      }
    );
  }

  const source = state === "warm" ? WARM_STATIONS : IDLE_STATIONS;
  const startIndex = hashString(agentId) % source.length;
  return source[(startIndex + cycle) % source.length] ?? source[0];
};

const buildRouteToStation = (start: WorldPoint, station: AgentStation): WorldPoint[] => {
  const stationPoint = { x: station.x, y: station.y };
  const startRoomId = findRoomIdForPoint(start);

  if (startRoomId && station.roomId && startRoomId === station.roomId) {
    return normalizeRoutePoints([stationPoint]);
  }

  const startDoorId = startRoomId ? ROOM_DOOR_BY_ROOM.get(startRoomId)?.id ?? null : getNearestPathNodeId(start);
  const endDoorId = station.roomId ? ROOM_DOOR_BY_ROOM.get(station.roomId)?.id ?? null : getNearestPathNodeId(stationPoint);

  if (!startDoorId || !endDoorId) {
    return normalizeRoutePoints([stationPoint]);
  }

  const nodePath = buildShortestNodePath(startDoorId, endDoorId)
    .map((nodeId) => PATH_NODE_BY_ID.get(nodeId))
    .filter((node): node is PathNode => Boolean(node));

  const points: WorldPoint[] = [];

  if (startRoomId) {
    const startDoor = PATH_NODE_BY_ID.get(startDoorId);
    if (startDoor) {
      points.push(startDoor);
    }
  }

  points.push(...nodePath);

  if (station.roomId || distanceBetweenPoints(nodePath[nodePath.length - 1] ?? start, stationPoint) > 4) {
    points.push(stationPoint);
  }

  return normalizeRoutePoints(points);
};

const getDirectionFromDelta = (
  dx: number,
  dy: number,
  fallback: PixelDirection = "down"
): PixelDirection => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  if (Math.abs(dy) > 0) {
    return dy >= 0 ? "down" : "up";
  }
  return fallback;
};

const spriteRowY = (direction: PixelDirection): string => {
  switch (direction) {
    case "up":
      return "-48px";
    case "right":
    case "left":
      return "-96px";
    case "down":
    default:
      return "0px";
  }
};

const spriteFlip = (direction: PixelDirection): string => (direction === "left" ? "-1" : "1");

const assignStationToAgent = (
  agent: SimAgent,
  state: RoomState,
  station: AgentStation,
  cycle: number
): SimAgent => {
  const route = buildRouteToStation({ x: agent.x, y: agent.y }, station);
  const nextDirection =
    route.length > 0
      ? getDirectionFromDelta(route[0].x - agent.x, route[0].y - agent.y, agent.direction)
      : station.direction;

  return {
    ...agent,
    state,
    direction: nextDirection,
    targetId: station.id,
    targetRoomId: station.roomId,
    targetFurnitureId: station.targetFurnitureId,
    targetOffsetX: station.targetOffsetX,
    targetOffsetY: station.targetOffsetY,
    route,
    holdTicks: route.length === 0 ? stationHoldTicks(agent.agentId, station, cycle) : 0,
    stationCycle: cycle,
    activity: station.activity,
    groupId: station.groupId
  };
};

const stepSimAgent = (agent: SimAgent): SimAgent => {
  if (agent.route.length === 0) {
    return agent;
  }

  const [nextPoint, ...remainingRoute] = agent.route;
  const speed = AGENT_SPEED_BY_STATE[agent.state];
  const dx = nextPoint.x - agent.x;
  const dy = nextPoint.y - agent.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= speed) {
    const lastHop = remainingRoute.length === 0;
    const targetStation = ALL_STATIONS_BY_ID.get(agent.targetId);
    return {
      ...agent,
      x: nextPoint.x,
      y: nextPoint.y,
      direction: lastHop && targetStation ? targetStation.direction : getDirectionFromDelta(dx, dy, agent.direction),
      route: remainingRoute,
      holdTicks: lastHop && targetStation ? stationHoldTicks(agent.agentId, targetStation, agent.stationCycle) : 0
    };
  }

  return {
    ...agent,
    x: agent.x + (dx / distance) * speed,
    y: agent.y + (dy / distance) * speed,
    direction: getDirectionFromDelta(dx, dy, agent.direction)
  };
};

const buildInitialSimAgents = (): SimAgent[] =>
  OFFICE_AGENTS.map((agent) => {
    const homeStation = HOME_STATION_BY_AGENT.get(agent.id) ?? HOME_STATIONS[0];
    return {
      agentId: agent.id,
      x: homeStation?.x ?? MAP_WIDTH / 2,
      y: homeStation?.y ?? MAP_HEIGHT / 2,
      direction: homeStation?.direction ?? "down",
      state: "idle",
      targetId: homeStation?.id ?? `home-${agent.id}`,
      targetRoomId: homeStation?.roomId ?? null,
      targetFurnitureId: homeStation?.targetFurnitureId,
      targetOffsetX: homeStation?.targetOffsetX,
      targetOffsetY: homeStation?.targetOffsetY,
      route: [],
      holdTicks: homeStation ? stationHoldTicks(agent.id, homeStation, 0) : 16,
      stationCycle: 0,
      activity: homeStation?.activity ?? "WAIT",
      groupId: homeStation?.groupId
    };
  });

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
  const [mapScale, setMapScale] = useState(DEFAULT_MAP_SCALE);
  const mapScrollRef = useRef<HTMLDivElement | null>(null);
  const mapScaleRef = useRef(DEFAULT_MAP_SCALE);

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

  useEffect(() => {
    mapScaleRef.current = mapScale;
  }, [mapScale]);

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

  const [simAgents, setSimAgents] = useState<SimAgent[]>(() => buildInitialSimAgents());

  useEffect(() => {
    if (!open) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSimAgents((currentAgents) =>
        currentAgents.map((currentAgent) => {
          const desiredState: RoomState = activeAgentIds.has(currentAgent.agentId)
            ? "active"
            : warmAgentIds.has(currentAgent.agentId)
              ? "warm"
              : "idle";

          let nextAgent = currentAgent;
          const forcedStation = desiredState === "active" ? selectAgentStation(currentAgent.agentId, desiredState, 0) : null;
          const stateChanged = currentAgent.state !== desiredState;
          const forcedTargetChanged = forcedStation ? currentAgent.targetId !== forcedStation.id : false;

          if (stateChanged || forcedTargetChanged) {
            nextAgent = assignStationToAgent(
              currentAgent,
              desiredState,
              forcedStation ?? selectAgentStation(currentAgent.agentId, desiredState, currentAgent.stationCycle),
              desiredState === "active" ? 0 : currentAgent.stationCycle
            );
          }

          if (nextAgent.route.length > 0) {
            return stepSimAgent(nextAgent);
          }

          if (nextAgent.holdTicks > 0) {
            return {
              ...nextAgent,
              state: desiredState,
              holdTicks: nextAgent.holdTicks - 1
            };
          }

          if (desiredState === "active") {
            const activeStation = forcedStation ?? selectAgentStation(nextAgent.agentId, desiredState, 0);
            return {
              ...nextAgent,
              state: desiredState,
              direction: activeStation.direction,
              activity: activeStation.activity,
              holdTicks: stationHoldTicks(nextAgent.agentId, activeStation, 0)
            };
          }

          const nextCycle = nextAgent.stationCycle + 1;
          return assignStationToAgent(
            nextAgent,
            desiredState,
            selectAgentStation(nextAgent.agentId, desiredState, nextCycle),
            nextCycle
          );
        })
      );
    }, AGENT_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [activeAgentIds, open, warmAgentIds]);

  const roomSnapshots = useMemo(
    () =>
      OFFICE_ROOMS.map((room) => {
        const occupants = simAgents.filter((agent) => pointInsideRoom(agent, room));

        const state: RoomState = occupants.some((item) => item.state === "active")
          ? "active"
          : occupants.some((item) => item.state === "warm")
            ? "warm"
            : "idle";

        return {
          room,
          state,
          occupants
        };
      }),
    [simAgents]
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

  const renderAgents = useMemo(
    () =>
      simAgents
        .map((simAgent) => {
          const agent = AGENT_BY_ID.get(simAgent.agentId);
          if (!agent) {
            return null;
          }

          const station = ALL_STATIONS_BY_ID.get(simAgent.targetId) ?? null;
          const targetFurniture = simAgent.targetFurnitureId
            ? WORLD_TARGET_BY_ID.get(simAgent.targetFurnitureId) ?? null
            : null;

          return {
            agent,
            simAgent,
            station,
            targetFurniture,
            isMoving: simAgent.route.length > 0
          };
        })
        .filter(
          (
            item
          ): item is {
            agent: OfficeAgent;
            simAgent: SimAgent;
            station: AgentStation | null;
            targetFurniture: WorldTarget | null;
            isMoving: boolean;
          } => Boolean(item)
        ),
    [simAgents]
  );

  const agentLinks = useMemo(() => {
    const links: Array<{
      id: string;
      left: (typeof renderAgents)[number];
      right: (typeof renderAgents)[number];
      state: RoomState;
      label: string;
    }> = [];
    const usedAgentIds = new Set<string>();

    for (let leftIndex = 0; leftIndex < renderAgents.length; leftIndex += 1) {
      const left = renderAgents[leftIndex];
      if (usedAgentIds.has(left.agent.id) || left.isMoving) {
        continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < renderAgents.length; rightIndex += 1) {
        const right = renderAgents[rightIndex];
        if (usedAgentIds.has(right.agent.id) || right.isMoving) {
          continue;
        }

        const sameGroup =
          left.simAgent.groupId &&
          right.simAgent.groupId &&
          left.simAgent.groupId === right.simAgent.groupId;
        const sameRoom =
          findRoomIdForPoint(left.simAgent) &&
          findRoomIdForPoint(left.simAgent) === findRoomIdForPoint(right.simAgent);
        const distance = distanceBetweenPoints(left.simAgent, right.simAgent);

        if (!sameGroup && !(sameRoom && distance < 92)) {
          continue;
        }

        usedAgentIds.add(left.agent.id);
        usedAgentIds.add(right.agent.id);
        links.push({
          id: `${left.agent.id}-${right.agent.id}`,
          left,
          right,
          state:
            left.simAgent.state === "active" || right.simAgent.state === "active"
              ? "active"
              : left.simAgent.state === "warm" || right.simAgent.state === "warm"
                ? "warm"
                : "idle",
          label:
            left.simAgent.state === "idle" && right.simAgent.state === "idle" ? "CHAT" : "SYNC"
        });
        break;
      }
    }

    return links;
  }, [renderAgents]);

  const focusRoomId = useMemo(() => {
    const mapped = STAGE_ROOM_MAP[thinkingStage];
    if (mapped) {
      return mapped;
    }

    const activeRoom = roomSnapshots.find((snapshot) => snapshot.state === "active")?.room.id;
    return activeRoom ?? "market";
  }, [roomSnapshots, thinkingStage]);

  const focusRoom = ROOM_BY_ID.get(focusRoomId) ?? OFFICE_ROOMS[0];
  const mapScalePercent = Math.round(mapScale * 100);

  const scrollToRoom = (roomId: string, behavior: ScrollBehavior = "smooth") => {
    const scrollNode = mapScrollRef.current;
    const room = ROOM_BY_ID.get(roomId);

    if (!scrollNode || !room) {
      return;
    }

    const nextLeft = Math.max(0, (room.x + room.w / 2) * mapScaleRef.current - scrollNode.clientWidth / 2);
    const nextTop = Math.max(0, (room.y + room.h / 2) * mapScaleRef.current - scrollNode.clientHeight / 2);

    scrollNode.scrollTo({
      left: nextLeft,
      top: nextTop,
      behavior
    });
  };

  const zoomMap = (nextScale: number) => {
    const scrollNode = mapScrollRef.current;
    const boundedScale = clampNumber(Number(nextScale.toFixed(2)), MIN_MAP_SCALE, MAX_MAP_SCALE);

    if (!scrollNode) {
      setMapScale(boundedScale);
      return;
    }

    const centerX = (scrollNode.scrollLeft + scrollNode.clientWidth / 2) / mapScale;
    const centerY = (scrollNode.scrollTop + scrollNode.clientHeight / 2) / mapScale;

    setMapScale(boundedScale);

    requestAnimationFrame(() => {
      scrollNode.scrollTo({
        left: Math.max(0, centerX * boundedScale - scrollNode.clientWidth / 2),
        top: Math.max(0, centerY * boundedScale - scrollNode.clientHeight / 2),
        behavior: "auto"
      });
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const scrollNode = mapScrollRef.current;
    const room = ROOM_BY_ID.get(focusRoomId);

    if (!scrollNode || !room) {
      return;
    }

    const nextLeft = Math.max(0, (room.x + room.w / 2) * mapScaleRef.current - scrollNode.clientWidth / 2);
    const nextTop = Math.max(0, (room.y + room.h / 2) * mapScaleRef.current - scrollNode.clientHeight / 2);

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
              <strong>{focusRoom?.name ?? (isPending ? "WORKING" : "STANDBY")}</strong>
            </div>

            <div className="gpx-map-toolbar">
              <div className="gpx-map-toolbar-copy">
                <span>ZOOM {mapScalePercent}%</span>
                <strong>Scroll, zoom, or jump straight to a room.</strong>
              </div>

              <div className="gpx-map-actions">
                <button
                  type="button"
                  className="gpx-map-action"
                  onClick={() => zoomMap(mapScale - MAP_SCALE_STEP)}
                >
                  ZOOM OUT
                </button>
                <button
                  type="button"
                  className="gpx-map-action"
                  onClick={() => zoomMap(mapScale + MAP_SCALE_STEP)}
                >
                  ZOOM IN
                </button>
                <button
                  type="button"
                  className="gpx-map-action"
                  onClick={() => zoomMap(DEFAULT_MAP_SCALE)}
                >
                  RESET
                </button>
                <button
                  type="button"
                  className="gpx-map-action emphasis"
                  onClick={() => scrollToRoom(focusRoomId)}
                >
                  FOCUS ROOM
                </button>
              </div>
            </div>

            <div className="gpx-room-jumps" aria-label="Jump to room">
              {roomSnapshots.map((snapshot) => (
                <button
                  key={snapshot.room.id}
                  type="button"
                  className={`gpx-room-chip state-${snapshot.state}${
                    snapshot.room.id === focusRoomId ? " focus" : ""
                  }`}
                  onClick={() => scrollToRoom(snapshot.room.id)}
                >
                  {snapshot.room.name}
                </button>
              ))}
            </div>

            <div className="gpx-map-shell" ref={mapScrollRef}>
              <div className="gpx-map-scale">
                <div className="gpx-map">
                  <div className="gpx-grid-layer" aria-hidden />
                  <div className="gpx-corridor-layer" aria-hidden>
                    {PATH_SEGMENTS.map((segment) => (
                      <div
                        key={segment.id}
                        className="gpx-corridor"
                        style={
                          {
                            left: segment.x,
                            top: segment.y,
                            width: segment.w,
                            height: segment.h
                          } as CSSProperties
                        }
                      />
                    ))}
                    {PATH_NODES.filter((node) => node.id.startsWith("hub-")).map((node) => (
                      <div
                        key={node.id}
                        className="gpx-corridor-node"
                        style={
                          {
                            left: node.x - CORRIDOR_WIDTH / 2,
                            top: node.y - CORRIDOR_WIDTH / 2,
                            width: CORRIDOR_WIDTH,
                            height: CORRIDOR_WIDTH
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
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
                      <div className={`gpx-room-label state-${snapshot.state}`}>
                        <strong>{snapshot.room.name}</strong>
                        <span>{snapshot.occupants.length} INSIDE</span>
                      </div>

                      {snapshot.room.furniture.map((piece) => {
                        const furnitureStyle = {
                          left: piece.x,
                          top: piece.y,
                          width: piece.w,
                          height: piece.h,
                          ...(piece.type === "plant"
                            ? buildGridSpriteStyle(
                                STAR_OFFICE_ASSETS.plants,
                                4,
                                4,
                                pickVariant(piece.id, 16)
                              )
                            : {})
                        } as CSSProperties;

                        return (
                          <div
                            key={piece.id}
                            className={`gpx-furniture type-${piece.type}${snapshot.state !== "idle" ? " live" : ""}${
                              piece.orientation === "v" ? " orient-v" : ""
                            }`}
                            style={furnitureStyle}
                          />
                        );
                      })}

                      {snapshot.room.decorations?.map((decoration) => {
                        let spriteStyle: CSSProperties = {};

                        switch (decoration.type) {
                          case "poster":
                            spriteStyle = buildGridSpriteStyle(
                              STAR_OFFICE_ASSETS.posters,
                              4,
                              8,
                              decoration.frame ?? pickVariant(decoration.id, 32)
                            );
                            break;
                          case "flower":
                            spriteStyle = buildGridSpriteStyle(
                              STAR_OFFICE_ASSETS.flowers,
                              4,
                              4,
                              decoration.frame ?? pickVariant(decoration.id, 16)
                            );
                            break;
                          case "coffee":
                            spriteStyle = buildGridSpriteStyle(
                              STAR_OFFICE_ASSETS.coffee,
                              12,
                              8,
                              decoration.frame ?? pickVariant(decoration.id, 96)
                            );
                            break;
                          case "serverroom":
                            spriteStyle = buildStripSpriteStyle(STAR_OFFICE_ASSETS.serverroom, 40);
                            break;
                          case "cat":
                            spriteStyle = buildGridSpriteStyle(
                              STAR_OFFICE_ASSETS.cats,
                              4,
                              4,
                              decoration.frame ?? pickVariant(decoration.id, 16)
                            );
                            break;
                          default:
                            break;
                        }

                        return (
                          <div
                            key={decoration.id}
                            className={`gpx-decoration type-${decoration.type}${
                              decoration.animated ? " animated" : ""
                            }${snapshot.state !== "idle" ? " live" : ""}`}
                            style={
                              {
                                left: decoration.x,
                                top: decoration.y,
                                width: decoration.w,
                                height: decoration.h,
                                zIndex: decoration.zIndex ?? 2,
                                ...spriteStyle
                              } as CSSProperties
                            }
                            aria-hidden
                          />
                        );
                      })}
                    </section>
                  ))}

                  {ROOM_DOORS.map((door) => (
                    <div
                      key={door.id}
                      className={`gpx-room-door side-${door.side}`}
                      style={
                        {
                          left: door.x,
                          top: door.y
                        } as CSSProperties
                      }
                    />
                  ))}

                  {renderAgents.map(({ agent, simAgent, targetFurniture, isMoving }) => {
                    if (!targetFurniture || isMoving) {
                      return null;
                    }

                    const targetCenterX =
                      targetFurniture.absX +
                      targetFurniture.w / 2 +
                      (simAgent.targetOffsetX ?? 0);
                    const targetCenterY =
                      targetFurniture.absY +
                      targetFurniture.h / 2 +
                      (simAgent.targetOffsetY ?? 0);
                    const dx = targetCenterX - simAgent.x;
                    const dy = targetCenterY - simAgent.y;
                    const distance = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                    return (
                      <div key={`${agent.id}-target`}>
                        <div
                          className={`gpx-interaction-line state-${simAgent.state}`}
                          style={
                            {
                              left: simAgent.x,
                              top: simAgent.y - 26,
                              width: distance,
                              transform: `rotate(${angle}deg)`
                            } as CSSProperties
                          }
                        />
                        <div
                          className={`gpx-interaction-target state-${simAgent.state}`}
                          style={
                            {
                              left: targetFurniture.absX - 6,
                              top: targetFurniture.absY - 6,
                              width: targetFurniture.w + 12,
                              height: targetFurniture.h + 12
                            } as CSSProperties
                          }
                        />
                      </div>
                    );
                  })}

                  {agentLinks.map((link) => {
                    const dx = link.right.simAgent.x - link.left.simAgent.x;
                    const dy = link.right.simAgent.y - link.left.simAgent.y;
                    const distance = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    const midpointX = (link.left.simAgent.x + link.right.simAgent.x) / 2;
                    const midpointY = (link.left.simAgent.y + link.right.simAgent.y) / 2;

                    return (
                      <div key={link.id}>
                        <div
                          className={`gpx-agent-link state-${link.state}`}
                          style={
                            {
                              left: link.left.simAgent.x,
                              top: link.left.simAgent.y - 24,
                              width: distance,
                              transform: `rotate(${angle}deg)`
                            } as CSSProperties
                          }
                        />
                        <div
                          className={`gpx-agent-link-label state-${link.state}`}
                          style={
                            {
                              left: midpointX,
                              top: midpointY - 42
                            } as CSSProperties
                          }
                        >
                          {link.label}
                        </div>
                      </div>
                    );
                  })}

                  {renderAgents.map(({ agent, simAgent, isMoving }) => (
                    <div
                      key={agent.id}
                      className={`gpx-actor-slot state-${simAgent.state}${isMoving ? " moving" : ""}`}
                      style={
                        {
                          left: simAgent.x,
                          top: simAgent.y
                        } as CSSProperties
                      }
                    >
                      {!isMoving ? (
                        <div className={`gpx-agent-bubble state-${simAgent.state}`}>
                          {simAgent.activity}
                        </div>
                      ) : null}
                      <div
                        className={`gpx-actor state-${simAgent.state}${isMoving ? " moving" : ""}`}
                        style={
                          {
                            backgroundImage: `url("${pickSpriteSheet(agent.id)}")`,
                            "--row-y": spriteRowY(simAgent.direction),
                            "--flip-x": spriteFlip(simAgent.direction)
                          } as CSSProperties
                        }
                        aria-hidden
                      />
                      <span className="gpx-actor-badge">{agent.badge}</span>
                    </div>
                  ))}
                </div>
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
                      <button
                        key={snapshot.room.id}
                        type="button"
                        className={`gpx-room-row state-${snapshot.state}${
                          snapshot.room.id === focusRoomId ? " focus" : ""
                        }`}
                        onClick={() => scrollToRoom(snapshot.room.id)}
                      >
                        <div>
                          <strong>{snapshot.room.name}</strong>
                          <small>{snapshot.room.purpose}</small>
                        </div>
                        <span>{snapshot.state.toUpperCase()}</span>
                      </button>
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
          gap: 0.62rem;
          padding: 0.62rem;
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
          gap: 1rem;
          padding: 0.96rem 1.1rem;
        }

        .gpx-header-copy {
          display: grid;
          gap: 0.22rem;
          min-width: 0;
        }

        .gpx-status {
          justify-self: flex-start;
          padding: 0.28rem 0.62rem;
          border: 2px solid #0e1222;
          background: #3f486d;
          color: #f6f7ff;
          font-size: 0.94rem;
        }

        .gpx-status.live {
          background: #337c54;
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-header-copy h3 {
          margin: 0;
          color: #fff8de;
          font-size: 1.72rem;
          text-transform: uppercase;
        }

        .gpx-header-copy p {
          margin: 0;
          color: #d5daf6;
          font-size: 1rem;
          line-height: 1.5;
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
          min-width: 156px;
          padding: 0.5rem 0.66rem;
          border: 2px solid #0f1324;
          background: #353b5b;
          display: grid;
          gap: 0.2rem;
        }

        .gpx-stat span {
          color: #bac3eb;
          font-size: 0.76rem;
        }

        .gpx-stat strong {
          color: #fff7d4;
          font-size: 0.98rem;
        }

        .gpx-sidebar-btn,
        .gpx-close {
          border: 2px solid #101425;
          font: inherit;
          color: #fff7de;
          padding: 0.58rem 0.88rem;
          font-size: 0.86rem;
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
          grid-template-columns: minmax(0, 1fr) ${SIDEBAR_WIDTH}px;
          gap: 0.62rem;
        }

        .gpx-layout.sidebar-collapsed {
          grid-template-columns: minmax(0, 1fr) 84px;
        }

        .gpx-map-window {
          min-height: 0;
          display: grid;
          grid-template-rows: auto auto auto minmax(0, 1fr);
          overflow: hidden;
        }

        .gpx-window-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.46rem;
          padding: 0.56rem 0.76rem;
          border-bottom: 3px solid #14192b;
          background: #39405f;
          color: #fff8de;
          font-size: 0.84rem;
        }

        .gpx-window-head strong {
          color: #c7ffd4;
          font-size: 0.8rem;
        }

        .gpx-map-toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.64rem;
          align-items: center;
          padding: 0.66rem 0.82rem;
          border-bottom: 3px solid #14192b;
          background: #303652;
        }

        .gpx-map-toolbar-copy {
          display: grid;
          gap: 0.16rem;
        }

        .gpx-map-toolbar-copy span {
          color: #fff7d4;
          font-size: 0.78rem;
        }

        .gpx-map-toolbar-copy strong {
          color: #dce4ff;
          font-size: 0.96rem;
          line-height: 1.45;
        }

        .gpx-map-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.38rem;
        }

        .gpx-map-action {
          border: 2px solid #101425;
          padding: 0.5rem 0.78rem;
          background: #3b476a;
          color: #fff7de;
          font: inherit;
          font-size: 0.84rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 rgba(7, 8, 15, 0.5);
        }

        .gpx-map-action:hover {
          background: #4b5d87;
        }

        .gpx-map-action.emphasis {
          background: #3d7b58;
        }

        .gpx-map-action.emphasis:hover {
          background: #4a946a;
        }

        .gpx-room-jumps {
          display: flex;
          gap: 0.34rem;
          flex-wrap: wrap;
          padding: 0.72rem 0.82rem;
          border-bottom: 3px solid #14192b;
          background: #262c43;
        }

        .gpx-room-chip {
          border: 2px solid #101425;
          padding: 0.4rem 0.6rem;
          background: #38405f;
          color: #f3f6ff;
          font: inherit;
          font-size: 0.8rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 rgba(7, 8, 15, 0.42);
        }

        .gpx-room-chip.state-active {
          background: #326048;
        }

        .gpx-room-chip.state-warm {
          background: #46568b;
        }

        .gpx-room-chip.focus {
          outline: 2px solid #ffe69f;
          outline-offset: 1px;
        }

        .gpx-map-shell {
          min-height: 0;
          overflow: auto;
          padding: 1rem;
          background:
            linear-gradient(180deg, rgba(14, 18, 31, 0.98), rgba(7, 9, 16, 1));
          overscroll-behavior: contain;
        }

        .gpx-map-shell::-webkit-scrollbar,
        .gpx-sidebar::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }

        .gpx-map-shell::-webkit-scrollbar-track,
        .gpx-sidebar::-webkit-scrollbar-track {
          background: #151a28;
          border: 2px solid #0e1222;
        }

        .gpx-map-shell::-webkit-scrollbar-thumb,
        .gpx-sidebar::-webkit-scrollbar-thumb {
          background: #49547a;
          border: 2px solid #0e1222;
        }

        .gpx-map-scale {
          position: relative;
          width: ${Math.round(MAP_WIDTH * mapScale)}px;
          height: ${Math.round(MAP_HEIGHT * mapScale)}px;
        }

        .gpx-map {
          position: relative;
          width: ${MAP_WIDTH}px;
          height: ${MAP_HEIGHT}px;
          transform: scale(${mapScale});
          transform-origin: top left;
          background:
            radial-gradient(circle at 50% 8%, rgba(120, 145, 212, 0.08), transparent 20%),
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

        .gpx-corridor-layer {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }

        .gpx-corridor,
        .gpx-corridor-node {
          position: absolute;
          background:
            linear-gradient(180deg, rgba(222, 214, 199, 0.96), rgba(195, 186, 171, 0.96)),
            repeating-linear-gradient(
              90deg,
              rgba(120, 108, 96, 0.08) 0 10px,
              transparent 10px 18px
            );
          border: 3px solid #0d1121;
          box-shadow:
            inset 0 0 0 2px rgba(255, 255, 255, 0.18),
            0 0 0 2px rgba(32, 37, 56, 0.25);
        }

        .gpx-room {
          position: absolute;
          overflow: hidden;
          z-index: 2;
          border: 6px solid #0d1121;
          box-shadow:
            inset 0 0 0 4px rgba(255, 255, 255, 0.06),
            8px 8px 0 rgba(0, 0, 0, 0.34);
        }

        .gpx-room::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 18px;
          background: rgba(9, 12, 22, 0.24);
          pointer-events: none;
        }

        .gpx-room::after {
          content: "";
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 10px;
          height: 8px;
          background: rgba(0, 0, 0, 0.12);
          pointer-events: none;
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

        .gpx-room-label {
          position: absolute;
          left: 18px;
          top: 20px;
          z-index: 4;
          display: grid;
          gap: 0.14rem;
          padding: 0.32rem 0.46rem;
          border: 2px solid #101425;
          background: rgba(17, 22, 36, 0.82);
          box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.3);
        }

        .gpx-room-label strong,
        .gpx-room-label span {
          display: block;
        }

        .gpx-room-label strong {
          color: #fff8de;
          font-size: 0.72rem;
          line-height: 1.1;
        }

        .gpx-room-label span {
          color: #d7e0ff;
          font-size: 0.52rem;
        }

        .gpx-room-label.state-active {
          background: rgba(34, 63, 50, 0.88);
        }

        .gpx-room-label.state-warm {
          background: rgba(43, 55, 92, 0.88);
        }

        .gpx-room-door {
          position: absolute;
          z-index: 6;
          width: 42px;
          height: 18px;
          transform: translate(-50%, -50%);
          border: 3px solid #101425;
          background:
            linear-gradient(180deg, #f4ddb2, #c28a4d),
            repeating-linear-gradient(
              90deg,
              rgba(89, 53, 27, 0.4) 0 8px,
              transparent 8px 12px
            );
          box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.34);
        }

        .gpx-room-door.side-left,
        .gpx-room-door.side-right {
          width: 18px;
          height: 42px;
        }

        .gpx-furniture {
          position: absolute;
          border: 2px solid #0b0f1d;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.42);
          image-rendering: pixelated;
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

        .gpx-furniture.type-bookshelf.live {
          box-shadow:
            2px 2px 0 rgba(0, 0, 0, 0.42),
            0 0 0 2px rgba(255, 243, 168, 0.12);
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
          border: 0;
          background: center bottom / contain no-repeat url("${STAR_OFFICE_ASSETS.desk}");
          box-shadow: none;
          filter: drop-shadow(3px 5px 0 rgba(0, 0, 0, 0.4));
        }

        .gpx-furniture.type-desk::before {
          display: none;
        }

        .gpx-furniture.type-desk::after {
          display: none;
        }

        .gpx-furniture.type-desk.live::before,
        .gpx-furniture.type-terminal.live::before,
        .gpx-furniture.type-projector.live::after,
        .gpx-furniture.type-tv.live::before {
          animation: gpxScreenPulse 1.1s steps(2, end) infinite;
        }

        .gpx-furniture.type-desk.live {
          filter: drop-shadow(3px 5px 0 rgba(0, 0, 0, 0.4)) saturate(1.06);
        }

        .gpx-furniture.type-terminal {
          border-color: #0d2130;
          background: rgba(60, 161, 209, 0.42);
          box-shadow:
            inset 0 0 0 2px rgba(169, 245, 255, 0.18),
            2px 2px 0 rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(1px);
        }

        .gpx-furniture.type-terminal::before {
          inset: 2px;
          border: 1px solid rgba(169, 245, 255, 0.34);
          background:
            linear-gradient(180deg, rgba(167, 235, 255, 0.9), rgba(62, 142, 198, 0.9)),
            repeating-linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.16) 0 2px,
              transparent 2px 4px
            );
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

        .gpx-furniture.type-table::after {
          left: 14px;
          bottom: 10px;
          width: 30px;
          height: 10px;
          background: rgba(0, 0, 0, 0.16);
        }

        .gpx-furniture.type-pingpong {
          background:
            linear-gradient(180deg, #225e77 0 18%, #1d4f64 18% 82%, #1a2730 82% 100%);
        }

        .gpx-furniture.type-pingpong::before {
          left: 50%;
          top: 10px;
          bottom: 10px;
          width: 4px;
          transform: translateX(-50%);
          background: rgba(244, 246, 250, 0.94);
        }

        .gpx-furniture.type-pingpong::after {
          width: 16px;
          height: 16px;
          right: 18px;
          top: 18px;
          border-radius: 50%;
          background: #fff3d9;
          box-shadow:
            -72px 18px 0 #ff8e6f,
            -48px 26px 0 rgba(20, 25, 43, 0.28);
        }

        .gpx-furniture.type-tv {
          background:
            linear-gradient(180deg, #2d354c 0 18%, #10172a 18% 100%);
        }

        .gpx-furniture.type-tv::before {
          inset: 8px;
          background:
            linear-gradient(180deg, rgba(138, 244, 255, 0.92), rgba(47, 97, 142, 0.92)),
            repeating-linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.12) 0 4px,
              transparent 4px 8px
            );
        }

        .gpx-furniture.type-tv::after {
          left: 50%;
          bottom: -12px;
          width: 34px;
          height: 12px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, #6d7384, #343948);
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
          border: 0;
          background-color: transparent;
          background-position: center bottom;
          background-repeat: no-repeat;
          box-shadow: none;
          filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.38));
        }

        .gpx-furniture.type-plant::before {
          display: none;
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
          border: 0;
          background: center bottom / contain no-repeat url("${STAR_OFFICE_ASSETS.sofa}");
          box-shadow: none;
          filter: drop-shadow(4px 6px 0 rgba(0, 0, 0, 0.38));
        }

        .gpx-furniture.type-sofa::before {
          display: none;
        }

        .gpx-furniture.type-sofa::after {
          display: none;
        }

        .gpx-furniture.type-sofa.live {
          filter: drop-shadow(4px 6px 0 rgba(0, 0, 0, 0.38)) saturate(1.04);
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
          z-index: 7;
          width: 40px;
          height: 60px;
          transform: translate(-50%, -100%);
          pointer-events: none;
        }

        .gpx-actor-slot.moving {
          animation: gpxActorHop 0.9s steps(2, end) infinite;
        }

        .gpx-actor-slot.state-warm:not(.moving),
        .gpx-actor-slot.state-idle:not(.moving) {
          animation: gpxActorBob 1.6s steps(2, end) infinite;
        }

        .gpx-agent-bubble {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 10px);
          transform: translateX(-50%);
          border: 2px solid #101425;
          padding: 3px 6px;
          background: #f6f1dc;
          color: #171c2a;
          font-size: 0.56rem;
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
          width: 40px;
          height: 60px;
          background-repeat: no-repeat;
          background-size: 280px 240px;
          background-position: -120px var(--row-y);
          transform: scaleX(var(--flip-x));
          transform-origin: center center;
          image-rendering: pixelated;
        }

        .gpx-actor.moving {
          animation: gpxSpriteWalk 0.76s steps(4) infinite;
        }

        .gpx-actor.state-warm:not(.moving),
        .gpx-actor.state-idle:not(.moving) {
          animation: gpxSpriteGlow 1.25s steps(2, end) infinite;
        }

        .gpx-interaction-line {
          position: absolute;
          z-index: 5;
          height: 4px;
          transform-origin: 0 50%;
          pointer-events: none;
          opacity: 0.88;
        }

        .gpx-interaction-line.state-active {
          background:
            repeating-linear-gradient(
              90deg,
              #9effc2 0 10px,
              #59d88a 10px 18px
            );
          animation: gpxFlow 0.9s linear infinite;
        }

        .gpx-interaction-line.state-warm {
          background:
            repeating-linear-gradient(
              90deg,
              #dfe7ff 0 10px,
              #8ea6ff 10px 18px
            );
          opacity: 0.62;
        }

        .gpx-interaction-line.state-idle {
          background:
            repeating-linear-gradient(
              90deg,
              #fff4c3 0 10px,
              #f0b56d 10px 18px
            );
          opacity: 0.56;
        }

        .gpx-interaction-target {
          position: absolute;
          z-index: 5;
          border: 3px solid #0e1222;
          pointer-events: none;
        }

        .gpx-interaction-target.state-active {
          border-color: #9effc2;
          box-shadow: 0 0 0 3px rgba(158, 255, 194, 0.14);
          animation: gpxBlink 0.9s steps(2, end) infinite;
        }

        .gpx-interaction-target.state-warm {
          border-color: #9eb2ff;
          box-shadow: 0 0 0 3px rgba(158, 178, 255, 0.1);
        }

        .gpx-interaction-target.state-idle {
          border-color: #f4cc79;
          box-shadow: 0 0 0 3px rgba(244, 204, 121, 0.1);
        }

        .gpx-agent-link {
          position: absolute;
          z-index: 6;
          height: 3px;
          transform-origin: 0 50%;
          pointer-events: none;
          background:
            repeating-linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.86) 0 8px,
              rgba(126, 157, 255, 0.82) 8px 14px
            );
          opacity: 0.72;
        }

        .gpx-agent-link.state-active {
          background:
            repeating-linear-gradient(
              90deg,
              #c8ffd8 0 8px,
              #57d46c 8px 14px
            );
        }

        .gpx-agent-link.state-idle {
          background:
            repeating-linear-gradient(
              90deg,
              #fff4c8 0 8px,
              #f0a96a 8px 14px
            );
        }

        .gpx-agent-link-label {
          position: absolute;
          z-index: 7;
          transform: translateX(-50%);
          padding: 2px 5px;
          border: 2px solid #101425;
          background: #f6f1dc;
          color: #171c2a;
          font-size: 0.5rem;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.42);
          white-space: nowrap;
        }

        .gpx-agent-link-label.state-active {
          background: #e9ffd7;
        }

        .gpx-agent-link-label.state-warm {
          background: #dfe6ff;
        }

        .gpx-actor-badge {
          position: absolute;
          left: 50%;
          top: calc(100% + 3px);
          transform: translateX(-50%);
          padding: 2px 5px;
          border: 2px solid #101425;
          background: #f6f1dc;
          color: #181c2a;
          font-size: 0.5rem;
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.48);
        }

        .gpx-decoration {
          position: absolute;
          background-repeat: no-repeat;
          background-position: center center;
          image-rendering: pixelated;
          pointer-events: none;
          filter: drop-shadow(3px 4px 0 rgba(0, 0, 0, 0.34));
        }

        .gpx-decoration.type-poster {
          border: 3px solid #131828;
          background-color: rgba(19, 24, 40, 0.32);
        }

        .gpx-decoration.type-flower {
          animation: gpxFlowerSway 1.5s steps(2, end) infinite;
          transform-origin: 50% 100%;
        }

        .gpx-decoration.type-cat {
          animation: gpxCatNap 2.6s steps(2, end) infinite;
          transform-origin: 50% 100%;
        }

        .gpx-decoration.type-coffee::before {
          content: "";
          position: absolute;
          inset: 0;
          background: center bottom / contain no-repeat url("${STAR_OFFICE_ASSETS.coffeeShadow}");
          opacity: 0.84;
          transform: translateY(7px);
          z-index: -1;
        }

        .gpx-decoration.type-coffee.live {
          animation: gpxScreenPulse 1.6s steps(2, end) infinite;
        }

        .gpx-decoration.type-serverroom {
          background-position: 0 0;
        }

        .gpx-decoration.type-serverroom.animated.live {
          animation: gpxServerroom 2.2s steps(40) infinite;
        }

        .gpx-decoration.type-serverroom.animated:not(.live) {
          animation: gpxServerroom 4s steps(40) infinite;
          opacity: 0.8;
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
          padding: 0.7rem 0.3rem;
          color: #fff7de;
          background: #365268;
          cursor: pointer;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          letter-spacing: 0.05em;
          min-height: 196px;
          font-size: 0.92rem;
        }

        .gpx-side-toggle:hover {
          background: #43677f;
        }

        .gpx-sidebar {
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          display: grid;
          gap: 0.9rem;
          align-content: start;
          padding-right: 0.26rem;
          overscroll-behavior: contain;
        }

        .gpx-panel {
          overflow: hidden;
          padding-bottom: 0.62rem;
          min-width: 0;
        }

        .gpx-copy {
          margin: 0;
          padding: 0.74rem 0.88rem 0;
          color: #edf0ff;
          font-size: 0.98rem;
          line-height: 1.62;
        }

        .gpx-stage-list,
        .gpx-roster,
        .gpx-room-list,
        .gpx-artifacts {
          padding: 0.74rem 0.88rem 0;
        }

        .gpx-stage-list {
          display: grid;
          gap: 0.34rem;
        }

        .gpx-stage-pill {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.4rem;
          padding: 0.42rem 0.5rem;
          border: 2px solid #0f1324;
          background: #2f3552;
        }

        .gpx-stage-pill span {
          min-width: 34px;
          color: #fff7d4;
          font-size: 0.74rem;
        }

        .gpx-stage-pill strong {
          color: #edf0ff;
          font-size: 0.9rem;
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
          gap: 0.34rem;
        }

        .gpx-room-row,
        .gpx-roster-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.42rem;
          padding: 0.46rem 0.54rem;
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
          font-size: 0.88rem;
        }

        .gpx-room-row small,
        .gpx-roster-row small {
          margin-top: 0.16rem;
          color: #ced4fa;
          font-size: 0.76rem;
          line-height: 1.45;
        }

        .gpx-room-row > span {
          align-self: start;
          border: 2px solid #101425;
          padding: 0.2rem 0.34rem;
          color: #f6f7ff;
          font-size: 0.66rem;
          background: #40476b;
        }

        .gpx-room-row {
          width: 100%;
          text-align: left;
          cursor: pointer;
          font: inherit;
          appearance: none;
        }

        .gpx-room-row:hover {
          transform: translate(-1px, -1px);
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

        .gpx-room-row.focus {
          outline: 2px solid #ffe69f;
          outline-offset: 1px;
        }

        .gpx-subsection {
          padding: 0.56rem 0.88rem 0;
          display: grid;
          gap: 0.3rem;
        }

        .gpx-subsection > span {
          color: #fff7d4;
          font-size: 0.76rem;
        }

        .gpx-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.24rem;
        }

        .gpx-tag {
          padding: 0.26rem 0.44rem;
          border: 2px solid #101425;
          background: #2d314a;
          color: #edf0ff;
          font-size: 0.68rem;
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
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #101425;
          background: #f6f1dc;
          color: #181c2a;
          font-size: 0.68rem;
        }

        .gpx-roster-row.active {
          background: #315043;
        }

        .gpx-roster-row.idle {
          background: #38355a;
        }

        .gpx-empty {
          color: #dde2ff;
          font-size: 0.88rem;
          line-height: 1.5;
        }

        .gpx-artifacts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.2rem;
        }

        .gpx-artifact {
          padding: 0.4rem 0.46rem;
          border: 2px solid #101425;
          background: #2f3552;
          display: grid;
          gap: 0.18rem;
        }

        .gpx-artifact span {
          color: #cad2f7;
          font-size: 0.66rem;
        }

        .gpx-artifact strong {
          color: #fff7d4;
          font-size: 0.86rem;
        }

        @keyframes gpxFlow {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 24px 0;
          }
        }

        @keyframes gpxServerroom {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 100% 0;
          }
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

        @keyframes gpxFlowerSway {
          0%,
          100% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(2deg);
          }
        }

        @keyframes gpxCatNap {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(2px);
          }
        }

        @keyframes gpxSpriteWalk {
          from {
            background-position: 0 var(--row-y);
          }
          to {
            background-position: -160px var(--row-y);
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

        @media (max-width: 1280px) {
          .gpx-layout {
            grid-template-columns: minmax(0, 1fr) 500px;
          }
        }

        @media (max-width: 1060px) {
          .gpx-layout,
          .gpx-layout.sidebar-collapsed {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr) auto;
          }

          .gpx-side-rail,
          .gpx-side-rail.collapsed {
            grid-template-rows: auto minmax(0, 1fr);
          }

          .gpx-side-toggle {
            writing-mode: horizontal-tb;
            text-orientation: initial;
            min-height: auto;
            padding: 0.72rem 0.92rem;
          }

          .gpx-sidebar {
            max-height: 38vh;
          }

          .gpx-map-toolbar {
            grid-template-columns: minmax(0, 1fr);
          }

          .gpx-map-actions {
            justify-content: flex-start;
          }

          .gpx-room-jumps {
            max-height: 10.8rem;
            overflow: auto;
          }
        }

        @media (max-width: 920px) {
          .gpx-header {
            grid-template-columns: minmax(0, 1fr);
          }

          .gpx-toolbar {
            justify-content: flex-start;
          }

          .gpx-map-actions {
            gap: 0.3rem;
          }

          .gpx-map-action,
          .gpx-room-chip {
            font-size: 0.64rem;
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
          .gpx-actor.state-warm,
          .gpx-decoration.type-flower,
          .gpx-decoration.type-cat,
          .gpx-decoration.type-coffee.live,
          .gpx-decoration.type-serverroom.animated {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
