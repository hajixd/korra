# Gideon Tooling And Template Research

## Main conclusion

The best agent system is not the one with the most tools.

The best agent system gives the model:

- a small, context-specific tool menu
- strongly typed arguments
- narrow tool responsibilities
- deterministic pre-built templates for common outputs
- good defaults so the model does not ask unnecessary setup questions

For Gideon, that means:

- pre-code the trading, stats, chart, and strategy tools
- expose only the subset relevant to the request
- avoid generic "do anything" tools in the main request path
- make strategy creation default to Korra `Models` JSON, not platform code

## Functions vs tools vs templates

These are different layers and should stay separate in code.

### Functions

Functions are internal deterministic code units.

Examples:

- intent classification helpers
- depth scoring
- graph-template resolution
- animation-template picking
- validation helpers

Functions are not directly exposed to the model.

### Tools

Tools are callable capabilities that fetch, compute, or act.

Examples:

- fetch candles
- summarize backtest stats
- compute RSI
- build chart actions
- search current sources
- build strategy JSON

Tools are what the orchestrator exposes to agents.

### Templates

Templates are reusable output blueprints.

Examples:

- graph templates
- animation templates
- clarification templates
- answer templates
- strategy JSON skeletons

Templates reduce variance and should be selected by functions or agents, then filled using tool outputs.

## What the research says

### Official docs and engineering guidance

Common themes across Nebius, Anthropic, OpenAI, and MCP:

- structured outputs and function calling are foundational
- tool interfaces matter more than prompt cleverness
- the model should call deterministic tools for data, calculation, and execution
- supervisor + specialist-worker patterns are more stable than large peer meshes
- tool menus should be pruned per task

### Academic papers

The papers consistently point to the same pattern:

- reasoning plus acting works better when tools are externalized
- models improve when tool use is explicit and schema-driven
- API misuse is common without constrained schemas and examples
- benchmark results degrade when tool selection becomes noisy or too broad

Practical implication:

- Gideon should rely on pre-coded tools for every repeated operation
- Gideon should not ask the model to "invent" indicator math, chart specs, or strategy file structure every time

### Blogs and practitioner discussions

The most consistent practitioner advice:

- fewer tools with clearer descriptions beat larger toolboxes
- large agent graphs are slower and harder to debug
- caching, idempotency, and observability matter more than adding more agents
- templates eliminate a lot of model variance

### Reddit and community discussions

The repeated community pattern:

- overloaded tools confuse the model
- too many nearly-overlapping tools reduce reliability
- developers end up deleting generic tools and replacing them with very narrow ones

This is useful signal even though it is lower-trust than official docs and papers.

## Best structure for tools in Gideon

Use a three-layer tool system.

### Layer 1: Core deterministic tools

These are always safe and should do one thing only.

- symbol/timeframe normalization
- market data fetch
- clickhouse history fetch
- trade-history summary
- backtest summary
- indicator compute
- chart plan build
- chart action build
- strategy JSON compile
- strategy JSON validate
- internet search and fact extract

### Layer 2: Domain templates

These are pre-built output patterns the model can request instead of building from scratch.

- graph templates
- chart-action macros
- strategy model templates
- clarification templates
- synthesis templates
- evaluation templates

### Layer 3: Optional advanced tools

These should only be exposed for the right request class.

- code patch planner
- strategy-to-code transpiler
- animation builder
- TP/SL sweep runner
- comparison runner across strategy variants

## Tool design rules

Every tool should follow these rules:

1. One clear job.
2. Typed schema for input and output.
3. Short name and short description.
4. Idempotent when possible.
5. Cacheable when possible.
6. Return provenance and confidence.
7. Include examples in the tool spec if the arguments are non-obvious.
8. Avoid optional arguments unless they are truly useful.

Bad tool example:

- `analyze_market_and_generate_strategy_and_chart`

Good tools:

- `get_recent_candles`
- `compute_indicators`
- `build_strategy_model_json`
- `build_chart_actions`

## Tools Gideon should have pre-coded

### 1. Request normalization tools

These reduce ambiguity before the LLM starts reasoning.

#### `resolve_symbol`

Input:

- raw symbol text
- UI context symbol

Output:

- normalized symbol
- confidence

#### `resolve_timeframe`

Input:

- raw timeframe text
- UI context timeframe

Output:

- normalized timeframe
- confidence

#### `extract_request_artifacts`

Input:

- latest user prompt

Output:

- wants text / graph / draw / animation / strategy json / code

This can remain model-assisted but should still output a strict schema.

### 2. Market data tools

These are high-value and should be deterministic.

#### `get_latest_price_anchor`

Returns:

- latest price
- latest candle time
- staleness
- recent range

#### `get_recent_candles`

Returns:

- OHLCV window
- source used
- freshness

#### `get_multi_timeframe_context`

Returns:

- local timeframe candles
- higher-timeframe bias window
- session state

#### `merge_live_and_historical_candles`

Returns:

- deduped candle window with provenance

### 3. Stats and backtest tools

These should be pre-coded because stats requests are repetitive and deterministic.

#### `summarize_trade_history`

Returns:

- total trades
- win rate
- pnl
- long/short split
- duration stats

#### `summarize_backtest_results`

Returns:

- full backtest metrics
- session and timeframe breakdowns

#### `compute_metric`

Input:

- metric id
- source dataset

Supported metric ids should be explicit:

- `win_rate`
- `expectancy`
- `profit_factor`
- `drawdown`
- `avg_win`
- `avg_loss`
- `hold_time`
- `monthly_pnl`
- `monthly_volume`
- `hourly_edge`
- `weekday_edge`

#### `compare_segments`

Input:

- source dataset
- segment type

Examples:

- compare sessions
- compare weekdays
- compare long vs short

### 4. Indicator and quant tools

These must be deterministic. Do not ask the model to derive these each time.

#### `compute_indicator_snapshot`

Supported indicators:

- RSI
- MACD
- EMA
- SMA
- ATR
- stochastic

#### `compute_indicator_series`

Returns time series for charting.

#### `detect_market_structure`

Returns:

- swing highs/lows
- trend bias
- break of structure
- change of character

#### `detect_levels`

Returns:

- support/resistance zones
- fib leg candidates
- opening range
- session highs/lows

### 5. Graph tools

These should be almost entirely template-driven.

#### `resolve_graph_template`

Maps user wording to a known chart template.

#### `build_panel_chart`

Input:

- template id
- source data
- title override

Output:

- assistant panel chart payload

#### `build_multi_chart_bundle`

For overview requests only.

Example:

- equity curve + drawdown + win/loss

### 6. Chart drawing and animation tools

These should be pre-coded because chart interactions are strongly typed.

#### `build_chart_actions`

Supported actions:

- support/resistance zone
- fib range
- trend line
- horizontal/vertical line
- box
- long/short position preview
- marker
- ruler

#### `sanitize_chart_actions`

Ensures:

- valid timestamps
- valid price ranges
- no impossible coordinates

#### `build_chart_animation`

Creates replay sequences only when explicitly requested.

### 7. Strategy tools

This is the most important section for Gideon.

### Default strategy rule

If the user says "make a strategy", Gideon should default to:

- generating Korra `Models` JSON
- matching the exact import format of the Models tab
- returning a downloadable `.json`
- not asking for preferred programming language or platform
- not forcing a separate risk-management intake unless the strategy is impossible to represent without one

Reason:

- the Models tab already supports TP/SL experimentation and parameter tuning
- the user is asking for a Korra model artifact, not code for Pine, MT5, or another platform

#### `match_strategy_template`

Maps strategy wording to a base model:

- momentum
- mean reversion
- fibonacci
- support/resistance
- time-of-day
- seasons

#### `build_strategy_model_json`

Returns:

- `draftJson`
- readiness
- missing details
- clarifying questions

#### `validate_strategy_model_json`

Checks:

- import shape is valid
- required fields exist
- backtest condition shapes are valid

#### `export_strategy_json`

Returns:

- download-ready JSON blob
- filename

#### `build_strategy_preview`

Returns:

- panel charts
- chart actions
- optional animation

#### `clone_strategy_variant`

Useful for generating multiple tuned versions of the same base model.

Examples:

- conservative TP
- aggressive TP
- tighter invalidation

### 8. Internet research tools

These should be explicit and date-aware.

#### `search_current_sources`

Returns:

- dated source candidates
- source type
- recency

#### `extract_dated_facts`

Returns:

- fact bullets
- source URLs
- publication dates

#### `rank_sources`

Bias toward:

- official releases
- reputable financial press
- high-recency for current-events prompts

### 9. Code tools

Only expose these if the user explicitly asks for code.

#### `build_code_plan`

Returns:

- target language
- files to edit
- dependencies

#### `generate_platform_code`

Targets only when explicitly requested:

- Pine Script
- MT5
- other platform-specific code

#### `validate_generated_code`

Checks:

- syntax shape
- required inputs
- obvious compile blockers

## Templates Gideon should keep pre-built

### Graph templates

Keep a fixed template registry for:

- equity curve
- drawdown
- pnl distribution
- long/short split
- session performance
- hourly performance
- weekday performance
- monthly pnl
- monthly volume
- price action
- RSI
- MACD
- EMA/SMA

### Clarification templates

Pre-build short templates for:

- missing timeframe
- missing dataset
- missing strategy trigger detail
- missing invalidation rule
- missing target output type

### Strategy templates

Pre-build JSON skeletons for each base model in `lib/strategyCatalog.ts`.

Each template should already include:

- name/id scaffold
- entry sections
- exit sections
- backtest sections
- supported condition shapes

### Answer templates

Pre-build synthesis shapes for:

- direct answer
- direct answer + graph
- current-events answer
- stats answer
- strategy draft answer
- strategy draft + preview answer

## What not to expose as tools

Do not expose these in the default trading path:

- generic SQL editor
- unrestricted shell/code execution
- browser automation
- giant multi-purpose analysis tools
- duplicate tools that do almost the same thing

Reason:

- they increase tool confusion
- they widen the failure surface
- they make auditing harder

## Tool exposure policy

The supervisor should expose different tool menus by request type.

### Direct trading question

Expose:

- symbol/timeframe resolution
- market data
- indicator snapshot if needed

### XAUUSD current question

Expose:

- market data
- multi-timeframe context
- internet research if prompt is current-events driven

### Stats / graphs

Expose:

- stats tools
- graph resolver
- panel chart builder

### Strategy request

Expose:

- strategy template matcher
- strategy JSON builder
- strategy JSON validator
- strategy preview builder
- strategy export

Do not expose code-generation tools by default.

### Code request

Expose:

- strategy tools
- code plan
- platform code generator
- validator

## Recommended implementation for this repo

Add a new tool layer under:

```text
lib/gideon/tools/
  request.ts
  market.ts
  stats.ts
  indicators.ts
  charts.ts
  internet.ts
  strategy.ts
  code.ts
  validators.ts
```

Then make each agent use only the relevant tool subset.

## Minimum viable toolset

If we want the smallest reliable first version, the MVP toolset is:

1. `resolve_symbol`
2. `resolve_timeframe`
3. `get_latest_price_anchor`
4. `get_recent_candles`
5. `summarize_trade_history`
6. `summarize_backtest_results`
7. `compute_indicator_snapshot`
8. `resolve_graph_template`
9. `build_panel_chart`
10. `build_chart_actions`
11. `search_current_sources`
12. `extract_dated_facts`
13. `match_strategy_template`
14. `build_strategy_model_json`
15. `validate_strategy_model_json`
16. `export_strategy_json`

That is enough to cover most Gideon requests without overbuilding.

## Deep-research conclusion

The best tool/function strategy for Gideon is:

- few tools
- narrow tools
- typed tools
- templated outputs
- request-specific tool menus
- deterministic chart/stat/strategy generation

For strategy generation specifically:

- default to Korra `Models` JSON
- give the user a `.json` download
- let the Models tab handle TP/SL experimentation
- only escalate into platform code if the user explicitly asks for code
