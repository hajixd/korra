# Gideon Multi-Agent Architecture Plan

## Purpose

Build a top-down replacement for Gideon's current monolithic chat route so it can answer:

- simple trading questions directly
- current XAUUSD questions with fresh price grounding
- current-events questions with web research
- statistics and graph requests
- strategy design and strategy coding requests
- chart-drawing and animation requests
- mixed, multi-part requests without drifting off scope

The target system is not "always use many agents". It is:

- use the minimum number of agents needed
- run independent agents in parallel
- enforce typed communication between agents
- keep latency low for simple prompts
- escalate cleanly for complex prompts

## Research Summary

### Nebius capabilities relevant to this design

1. Nebius Token Factory supports OpenAI-compatible function calling, with the backend responsible for executing the tools and feeding results back into the model loop.
2. Nebius supports structured output through `response_format` with both `json_object` and `json_schema`. For internal agent-to-agent traffic, `json_schema` should be the default.
3. Nebius exposes `Base` and `Fast` model flavors. The docs say the `Fast` flavor keeps the same model outputs but lowers latency through smaller batch sizes, more compute allocation, and speculative decoding. That makes fast variants the right fit for lightweight routing, intake, and clarification.
4. Nebius rate limits are dynamic. The platform can scale up when traffic stays near the limit, and the docs expose remaining request/token headroom through response headers. The orchestration layer should read and react to those headers.
5. Nebius Batch API is asynchronous, has higher limits, and is better for offline evals, nightly scoring, and benchmark sweeps, not user-facing chat.
6. Nebius officially documents integrations with agent frameworks including Google ADK, CrewAI, Agno, and Pydantic AI. That validates the multi-agent direction, but this repo should use a native TypeScript orchestrator first because Gideon is already a Next.js app with existing chart/stat/backtest tools.
7. Nebius official coding guidance currently recommends `Qwen/Qwen3-Coder-480B-A35B-Instruct`, `Qwen/Qwen3-Coder-30B-A3B-Instruct`, and `zai-org/GLM-4.5` for coding workloads.
8. Nebius’s own multi-agent guidance emphasizes a smaller intake agent, a stronger resolution agent, standardized agent-to-agent communication, capability discovery, evaluation, and observability.

### What this means for Gideon

- All internal agents should communicate with strict JSON schemas, not free-form text.
- The orchestrator should use fast models for cheap/high-frequency classification and escalate only when necessary.
- The system should be model-agnostic and resolve the live model catalog at runtime because Nebius deprecates models over time.
- We should not adopt a Python agent framework inside the main app path. We should keep orchestration inside the existing TypeScript server route and reuse current chart/stat tool code.

## Design Principles

1. Deterministic first. If a question can be answered by existing typed tools or cached data, do that before invoking more reasoning agents.
2. One source of truth for intent. The first structured intent packet becomes the contract for downstream agents.
3. Parallelize only independent work. Market data, internet research, and stats extraction can fan out in parallel. Writer and auditor must run after facts settle.
4. No free-form agent chatter. Agents write to a shared work ledger with typed packets.
5. Depth-based escalation. Do not activate 10-20 agents for a two-sentence question.
6. Scope lock. Every agent receives the requested artifacts list so it cannot add extras unless escalation explicitly allows it.
7. Clarify early, not late. If required details are missing, stop before launching expensive downstream work.
8. Final answer is a synthesis product, not a raw model dump.

## Top-Level Request Lifecycle

### Stage 0: Normalize input

The API route converts the raw request into a `UserRequestEnvelope`:

```ts
type UserRequestEnvelope = {
  requestId: string;
  timestampIso: string;
  latestUserPrompt: string;
  conversation: ChatTurn[];
  uiContext: AssistantContext;
  threadState: StrategyThreadState;
};
```

### Stage 1: Goal extraction

The first agent produces an `IntentPacket` with explicit bullet goals.

```ts
type IntentPacket = {
  requestKind: "social" | "question" | "analysis" | "stats" | "strategy" | "coding" | "mixed";
  goalBullets: string[];
  requestedArtifacts: Array<"text" | "bullets" | "panel_chart" | "chart_draw" | "animation" | "strategy_json" | "code_patch">;
  symbol: string | null;
  timeframe: string | null;
  freshness: "cached_ok" | "recent_market" | "live_market" | "web_current";
  ambiguityFlags: string[];
  riskFlags: string[];
  strictScope: boolean;
};
```

Rules:

- `goalBullets` must be 1-5 bullets.
- every downstream agent gets the same `goalBullets`
- if the user asked multiple questions, split them here
- if the user implicitly wants a graph, record it here

### Stage 2: Depth estimation

The second agent assigns a depth score and an agent budget.

```ts
type DepthPlan = {
  depth: 0 | 1 | 2 | 3 | 4 | 5;
  complexityReasons: string[];
  maxConcurrentAgents: number;
  maxTotalAgents: number;
  requiresClarification: boolean;
};
```

Depth rules:

- `0`: greeting or trivial reply. 1-2 agents.
- `1`: direct trading question with current local context. 2-4 agents.
- `2`: one fresh data dependency, one answer artifact. 4-6 agents.
- `3`: graph/stat/indicator request or single strategy draft. 6-9 agents.
- `4`: multi-source answer, multiple artifacts, or strategy plus preview. 9-12 agents.
- `5`: broad composite request, coding plus strategy plus stats, or multi-question workflow. 12-16 agents.

Depth score formula:

- `+1` if fresh market or web data is required
- `+1` if stats/graphs are required
- `+1` if strategy or code generation is required
- `+1` if more than one deliverable is requested
- `+1` if ambiguity blocks execution or the request is high-risk

### Stage 3: Clarification gate

Before any heavy work starts, Gideon checks:

- are there missing required parameters?
- is the symbol/timeframe missing for a chart-specific request?
- is the requested statistic undefined?
- is the user asking for strategy coding without rules?

If yes, return one concise clarifying question and stop.

Examples:

- "Which timeframe should I use for this XAUUSD view?"
- "Do you want stats from trade history, backtest trades, or recent candles?"
- "Should I turn this into a model draft, Pine script logic, or Korra model JSON?"

### Stage 4: Fan-out task graph

Once the request is clear, the scheduler activates only the needed workers.

Possible parallel fan-out:

- Market data agent
- Backtest/stats agent
- Internet research agent
- Indicator compute agent
- Strategy architect agent

### Stage 5: Evidence merge

All worker outputs are merged into a single `EvidenceBundle`.

```ts
type EvidenceBundle = {
  marketData?: MarketDataPacket;
  stats?: StatsPacket;
  internet?: InternetPacket;
  indicators?: IndicatorPacket;
  strategy?: StrategyPacket;
  chartSpec?: ChartSpecPacket;
  chartActions?: ChartActionPacket;
  codePlan?: CodePlanPacket;
  gaps: string[];
  confidence: number;
};
```

### Stage 6: Synthesis

The synthesis agent produces:

- final short answer
- optional bullets only if requested or necessary
- graph specs
- chart actions / animation
- strategy JSON
- code plan or patch plan

### Stage 7: Audit

The final audit agent verifies:

- answered the actual question
- no unrequested extras
- prices are fresh enough
- graphs align with requested metrics
- missing-data claims are real
- clarification should have been asked if needed

## Agent Roster

This system uses up to 16 agents, but most requests will use 3-8.

### Control plane agents

1. `A01 Intake Agent`
   - converts prompt into `IntentPacket`
   - extracts goal bullets, artifacts, freshness, scope

2. `A02 Depth Estimator`
   - scores complexity
   - sets max concurrency and total agent budget

3. `A03 Clarification Gate`
   - decides whether missing info blocks execution
   - asks one concise question if blocked

4. `A04 Task Scheduler`
   - converts intent + depth into a DAG of agent jobs
   - launches independent jobs in parallel

5. `A05 Evidence Merger`
   - merges outputs
   - resolves conflicts and confidence

6. `A06 Final Synthesizer`
   - produces the final answer package

7. `A07 Response Auditor`
   - enforces scope, freshness, and artifact correctness

8. `A08 Cost/Latency Governor`
   - watches rate-limit headers, latency, retries
   - downgrades model or reduces concurrency when needed

### Data and reasoning agents

9. `A09 Market Data Agent`
   - fetches live stream candles, recent historical candles, and price anchors
   - owns XAUUSD current price questions

10. `A10 Stats Agent`
    - computes trade/backtest metrics
    - maps requests to existing graph families and derived metrics

11. `A11 Internet Research Agent`
    - handles current-events and macro/news prompts
    - fetches web results and extracts dated facts only

12. `A12 Indicator/Quant Agent`
    - computes RSI, MACD, EMA, ATR, stochastic, derived time series
    - produces structured indicator evidence

13. `A13 Strategy Architect Agent`
    - turns user strategy language into Korra strategy JSON
    - identifies missing rules and readiness state

14. `A14 Chart Planner Agent`
    - decides which assistant-panel graphs are needed
    - emits a typed graph plan, not raw prose

15. `A15 Chart Execution Agent`
    - emits main-chart drawing actions and optional animation steps

16. `A16 Code Agent`
    - only activates for code-generation or strategy-implementation requests
    - produces a patch plan or code artifact plan

## Which agents run for which request

### Simple direct question

Example: "What does liquidity sweep mean?"

- A01 Intake
- A02 Depth
- A03 Clarification if needed
- A06 Synthesizer
- A07 Auditor

### Current XAUUSD question

Example: "Where is gold trading right now?"

- A01 Intake
- A02 Depth
- A09 Market Data
- A06 Synthesizer
- A07 Auditor

### Current-events question

Example: "What is moving gold today?"

- A01 Intake
- A02 Depth
- A09 Market Data
- A11 Internet Research
- A05 Evidence Merger
- A06 Synthesizer
- A07 Auditor

### Stats and graphs

Example: "Show monthly volume and drawdown stats."

- A01 Intake
- A02 Depth
- A09 Market Data if candle-derived
- A10 Stats
- A14 Chart Planner
- A06 Synthesizer
- A07 Auditor

### Strategy design

Example: "Turn this into a strategy and show it on chart."

- A01 Intake
- A02 Depth
- A03 Clarification if rules incomplete
- A13 Strategy Architect
- A14 Chart Planner
- A15 Chart Execution
- A06 Synthesizer
- A07 Auditor

### Strategy coding

Example: "Code this strategy and show the logic visually."

- A01 Intake
- A02 Depth
- A03 Clarification
- A13 Strategy Architect
- A16 Code Agent
- A14 Chart Planner
- A15 Chart Execution
- A06 Synthesizer
- A07 Auditor

## Typed communication between agents

Agents do not pass plain paragraphs. They publish packets into a shared `WorkLedger`.

```ts
type WorkLedgerEntry<T> = {
  taskId: string;
  agentId: string;
  status: "queued" | "running" | "done" | "failed" | "skipped";
  startedAtMs: number;
  finishedAtMs?: number;
  confidence?: number;
  cacheKey?: string;
  inputSummary: Record<string, unknown>;
  output?: T;
  error?: string;
};
```

Rules:

- every agent writes `confidence`
- every agent writes a small `inputSummary`
- every packet is JSON-schema validated
- downstream agents only consume validated packets

## Parallel execution rules

Safe parallel groups:

- `Market Data + Internet Research`
- `Market Data + Stats`
- `Market Data + Indicator Compute`
- `Strategy Architect + Market Data`
- `Chart Planner + Code Agent` only after core strategy facts are stable

Do not parallelize:

- final writing before all evidence lands
- audit before synthesis
- chart action generation before the chart target is known

Concurrency caps by depth:

- `depth 0-1`: max 2 concurrent jobs
- `depth 2`: max 3 concurrent jobs
- `depth 3`: max 4 concurrent jobs
- `depth 4-5`: max 5 concurrent jobs

## Clarification policy

Ask a clarifying question when:

- the user wants a graph/stat but did not identify the dataset
- the user wants strategy coding but did not specify the target format
- the user asks for current price analysis but the symbol is ambiguous
- the request includes conflicting deliverables

Do not ask when:

- the repo context already determines symbol/timeframe
- the request can be answered with a sensible default and low risk
- the missing detail is optional rather than blocking

## Model policy for Nebius

Do not hardcode one model per agent forever. Build a runtime model policy:

1. At server boot, fetch `/models?verbose=true`.
2. Filter by capability tags and cost/latency needs.
3. Use repo fallbacks if the catalog fetch fails.
4. Keep all agent roles model-agnostic.

### Recommended model classes by role

#### Low-latency router / intake / clarification

Prefer fast variants if present in the live catalog:

- `Qwen/Qwen3-32B-fast`
- `Qwen/Qwen3-30B-A3B-fast`
- `meta-llama/Meta-Llama-3.1-8B-Instruct-fast`

Reason:

- these are the right place to exploit Nebius `-fast` flavor for low-latency structured routing

#### Coordinator / decomposer

- `Qwen/Qwen3-235B-A22B-Instruct-2507`
- `zai-org/GLM-4.5`
- `moonshotai/Kimi-K2-Instruct`

Reason:

- strong instruction following
- good JSON control
- suitable for intent decomposition and planning

#### Heavy reasoner

- `deepseek-ai/DeepSeek-R1-0528`
- `Qwen/Qwen3-235B-A22B-Thinking-2507`
- `zai-org/GLM-4.5`

Reason:

- use only when the request genuinely needs deeper reasoning

#### Analyst

- `deepseek-ai/DeepSeek-V3.2`
- `moonshotai/Kimi-K2.5`
- `zai-org/GLM-4.7-FP8`

Reason:

- suited for evidence-heavy synthesis and analysis packets

#### Coding / tool-schema / patch planning

- `Qwen/Qwen3-Coder-480B-A35B-Instruct`
- `Qwen/Qwen3-Coder-30B-A3B-Instruct`
- `zai-org/GLM-4.5`

Reason:

- Nebius officially recommends these for coding workflows

#### Writer / surface response

- `NousResearch/Hermes-4-70B`
- `meta-llama/Llama-3.3-70B-Instruct`
- `zai-org/GLM-4.5-Air`

Reason:

- final answer should be concise and natural, but only after the facts are settled

## Why this is better than the current route

Current problem areas:

- too many loosely-coupled LLM stages
- no single typed intent contract
- scope drift between analysis, charting, and final writing
- "graph/draw/animation" mode is mixed with reasoning stages
- strategy and stats logic are not isolated as first-class capabilities

This design fixes that by:

- moving from prompt chain to agent DAG
- using JSON-schema packets everywhere
- separating routing from evidence collection from synthesis
- making clarification a blocking gate
- making stats, charts, strategy, and code separate workers

## Concrete repo plan

### New folders

```text
lib/gideon/
  contracts.ts
  orchestrator.ts
  scheduler.ts
  model-policy.ts
  telemetry.ts
  cache.ts
  validators.ts
  agents/
    intake.ts
    depth.ts
    clarification.ts
    market-data.ts
    stats.ts
    internet.ts
    indicators.ts
    strategy.ts
    chart-planner.ts
    chart-actions.ts
    code.ts
    merge.ts
    synthesize.ts
    audit.ts
  tools/
    market.ts
    clickhouse.ts
    internet.ts
    backtest.ts
    charts.ts
    indicators.ts
```

### Existing files to reuse

- `app/api/assistant/chat/route.ts`
  - reduce to request adapter + orchestrator call
- `lib/assistant-tools/*`
  - keep graph templates, chart actions, animations
- `lib/strategyCatalog.ts`
  - reuse as the base for the strategy architect agent
- existing backtest/clickhouse/history routes
  - treat as tool backends for worker agents

### Response contract

The API should return one `AssistantExecutionResult`:

```ts
type AssistantExecutionResult = {
  shortAnswer: string;
  bullets: Array<{ tone: "green" | "red" | "gold" | "black"; text: string }>;
  charts: AssistantChart[];
  chartActions: Array<Record<string, unknown>>;
  chartAnimations: AssistantChartAnimation[];
  strategyDraft?: StrategyDraft;
  codePlan?: Record<string, unknown>;
  clarifyingQuestion?: string;
  dataTrace: {
    intent: IntentPacket;
    depth: DepthPlan;
    activatedAgents: string[];
    skippedAgents: string[];
    latencyMs: number;
  };
};
```

## Phased implementation plan

### Phase 1: Infrastructure

- add typed contracts
- add model policy layer
- add orchestrator and scheduler
- add work ledger and validator layer

### Phase 2: Replace current routing

- move request classification out of `route.ts`
- implement `A01 Intake`, `A02 Depth`, `A03 Clarification`
- keep existing data/chart code behind new agent wrappers

### Phase 3: Data workers

- implement `Market Data`, `Stats`, `Internet`, `Indicator`
- parallelize them via `Promise.allSettled`
- add cache keys and rate-limit-aware retries

### Phase 4: Strategy and chart workers

- implement `Strategy Architect`, `Chart Planner`, `Chart Execution`
- ensure strategy requests can return:
  - direct answer only
  - strategy JSON
  - panel graphs
  - chart drawings
  - animation

### Phase 5: Code agent

- activate only for real coding requests
- output patch plans first, code only when requested

### Phase 6: Evaluation and observability

- log every agent packet with latency and confidence
- add Helicone or Keywords AI integration
- create an eval dataset:
  - direct trading questions
  - XAUUSD live questions
  - current-events questions
  - stats graph questions
  - strategy design questions
  - strategy coding questions

## Success criteria

Gideon is ready when:

- simple questions answer in one clean pass without extra sections
- stats questions consistently return the right graph family
- current-events answers cite only fetched web facts
- strategy requests ask clarifying questions early when needed
- strategy coding requests can return both structured logic and chart preview
- the final answer never mentions internal agents, models, or routing
- the system can explain what agents ran and why through internal telemetry

## Implementation decision

Use a native TypeScript multi-agent orchestrator inside this repo.

Do not adopt ADK, CrewAI, Agno, or Pydantic as the primary runtime inside the request path yet.

Reason:

- the app is already a TypeScript/Next.js system
- most value comes from typed orchestration, not a framework migration
- Nebius’s OpenAI-compatible function calling and JSON-schema outputs are enough to implement the architecture directly
- framework adoption can remain an optional later step if Gideon expands into remote agents or distributed runtimes

## Open items before coding

1. Decide whether code-generation requests should produce Korra model JSON only, code patches only, or both.
2. Decide whether "graphs if needed" means assistant-panel graphs by default or chart overlays first.
3. Decide whether we want to expose internal execution traces in the UI or keep them server-only.
4. Confirm the production Nebius model catalog at runtime and update the model policy from live availability.
