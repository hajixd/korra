# Korra Space

Korra Space is a full-stack AI-assisted trading terminal for XAU/USD. It combines live and historical market data, strategy replay/backtesting, AI Zip clustering, a chart-aware assistant named Gideon, Firebase authentication, push notifications, social strategy presets, copy trading, and MetaTrader 5 automation.

The app is built with Next.js, React, TypeScript, Firebase, Twelve Data, MetaApi, lightweight-charts, Recharts, Three.js, and deck.gl.

> This project is trading software, not financial advice. Backtests, generated signals, AI analysis, and copy-trading automation can be wrong. Use paper trading and proper risk controls before connecting real capital.

## What This Repo Contains

Korra is not just a chart. It is a trading workspace with these major systems:

- A Firebase-authenticated web terminal for XAU/USD.
- Live and historical candle loading from Twelve Data.
- Interactive candlestick charting with drawings, model overlays, trade history, and mobile layouts.
- Seven built-in strategy models stored as JSON and replayed through a local backtest engine.
- Backtest analytics for equity curves, temporal stats, clusters, entry/exit behavior, dimensions, and prop-firm-style views.
- AI Zip, a feature extraction, compression, KNN, and HDBSCAN-style clustering system for comparing trades against online, ghost, synthetic, and model libraries.
- Gideon, a chat assistant that can reason about candles, backtests, strategy JSON, chart actions, and trading stats.
- Social presets for publishing and importing strategy configurations.
- Push notifications for strategy entries/exits through Firebase Cloud Messaging.
- Copy trading through MetaApi Cloud or a local MT5 bridge.
- MT5 Expert Advisors for polling Korra's signal endpoints.
- Scripts for market-data backfills, Databento experiments, Gideon practice runs, and MT5 bridge operations.

## Tech Stack

- Framework: Next.js 15 with React 19 and TypeScript.
- Charting: lightweight-charts.
- Analytics UI: Recharts.
- 3D/cluster visuals: Three.js, deck.gl.
- Auth and persistence: Firebase Auth, Firestore, Firebase Storage, Firebase Cloud Messaging.
- Market data: Twelve Data for XAU/USD candles and quotes.
- Legacy/optional market data: Databento gold futures scripts and ClickHouse analytics route.
- Copy trading: MetaApi Cloud SDK and MT5 Expert Advisors.
- AI provider: Nebius/OpenAI-compatible chat completions.
- Tests: Node's built-in test runner with tsx.

## Important Files And Folders

```text
app/
  page.tsx                         App entry point.
  layout.tsx                       App metadata and root layout.
  TradingTerminal.tsx              Main authenticated trading workspace.
  AssistantPanel.tsx               Gideon assistant client UI.
  AIZipClusterModule.tsx           AI Zip cluster UI and visualization layer.
  aizipRuntime.ts                  AI Zip runtime library definitions.
  backtestHistoryShared.ts         Shared backtest history computation.
  api/                             Next.js API routes.

data/models/
  fair-value-gap.json              Strategy model definitions.
  fibonacci.json
  mean-reversion.json
  momentum.json
  seasons.json
  support-resistance.json
  time-of-day.json

lib/
  twelveDataMarketData.ts          Twelve Data candle and quote client.
  strategyCatalog.ts               Strategy catalog and runtime defaults.
  strategyModelBacktest.ts         Strategy replay and trade blueprint engine.
  aizipComputeWorkerCode.ts        AI Zip compute worker source.
  gideon/                          Gideon request contracts and runtime.
  copyTradeService.ts              Copy-trade account persistence and settings.
  copyTradeSignalEngine.ts         Signal generation for copy trading.
  copyTradeWorker.ts               Copy-trade execution worker.
  metaApiCloud.ts                  MetaApi integration.
  firebase*.ts                     Firebase client/server helpers.

public/
  copytrade/                       Embedded copy-trade dashboard assets.
  mt5/                             Public MT5 EA file.

mt5/
  KorraCopyTradeBridgeEA.mq5       MT5 EA for Vercel/API polling mode.
  SETUP.md                         MT5 bridge setup notes.

scripts/
  backfill-xauusd-1m.mjs           Twelve Data 1m CSV backfill.
  databento_gold.py                Databento gold futures helper.
  gideon-practice.mjs              Gideon practice/evaluation harness.
  mt5_bridge.py                    Python MT5 bridge helper.

tests/
  *.test.ts                        Strategy, AI Zip, market-data, and helper tests.
```

## How The App Works

### 1. Login And Workspace

The main page renders the trading terminal. Users sign in or create an account through Firebase Auth. The UI maps usernames to managed Firebase email addresses under the app domain, then loads a per-user workspace.

The primary workspace tabs are:

- Chart: live/historical XAU/USD chart, drawing tools, model overlays, side panels, active trades, assets, history, and actions.
- Models: built-in and imported strategy model definitions.
- Settings: account, terminal, notification, and workspace preferences.
- Backtest: replay settings, analytics, history, calendar, clusters, dimensions, and prop-firm views.
- Gideon AI: assistant chat and chart-aware analysis.
- Social: shared/community strategy presets.
- Copytrade: embedded copy-trading dashboard and MT5/MetaApi account controls.

### 2. Market Data Flow

The active candle system is based on Twelve Data:

- `/api/market/candles` returns recent XAU/USD candles.
- `/api/market/stream` provides a server-sent event stream by polling latest quotes.
- `/api/clickhouse/candles` is legacy-named but currently uses Twelve Data for historical ranges and can cache exact ranges in Firebase Storage.
- `/api/history/candles` re-exports the historical candle route.

Only `XAU_USD` is supported by the Twelve Data client at the moment. Supported timeframes are:

```text
1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W, 1M
```

Databento and ClickHouse files still exist. Databento is mainly used by scripts/legacy paths, while the ClickHouse analytics route can query monthly aggregates if configured.

### 3. Strategy Replay And Backtesting

Strategy models are stored as JSON files in `data/models`. The catalog loads them, attaches runtime defaults, and sends them into the replay engine.

The backtest engine:

- Builds technical features such as EMA trend, ATR expansion, oscillator state, season buckets, time buckets, fair value gaps, support/resistance range position, and reversal candles.
- Checks each strategy's long/short entry rules.
- Creates trade blueprints.
- Resolves exits by model exit, take profit, stop loss, break-even stop, trailing stop, max bars in trade, or end of data.
- Converts blueprints into trade history rows.
- Supports browser-worker computation and server-side API computation.

Backtest analytics routes generate higher-level summaries for the UI, including stats, charts, clusters, entry/exit behavior, time analysis, dimensions, and prop-firm-style reporting.

### 4. AI Zip

AI Zip is Korra's trade-comparison and clustering engine. It builds feature vectors from candles and trades, then compares entries against different libraries.

The main library types are:

- Online: live/current workspace-derived comparison pool.
- Ghost: synthetic or shadow comparison pool.
- Base: deterministic baseline library.
- Tokyo, Sydney, London, New York: session-style base libraries.
- Model libraries: similarity pools generated from selected strategy models.

AI Zip can run KNN-style nearest-neighbor comparisons, HDBSCAN-style density clustering, feature/dimension scoring, cluster maps, 2D/3D visualizations, and entry confidence analysis.

### 5. Gideon Assistant

Gideon is the app's assistant. It can answer trading questions, inspect recent candles, use provided backtest history, generate structured strategy JSON, create chart actions, and return visual/analytic artifacts.

The client sends bounded context to the assistant route, including recent candles, history rows, action history, and backtest trades when needed. The server runtime decides whether a request is simple, analytical, strategy-related, chart-related, coding-related, or mixed. Deterministic paths are used where possible before calling the configured AI provider.

### 6. Notifications

Firebase Cloud Messaging is used for push notifications. A Vercel cron job calls the strategy notification endpoint every five minutes.

The notification worker:

- Loads user notification settings from Firestore.
- Groups users by strategy settings.
- Fetches current XAU/USD candles.
- Replays selected strategies.
- Sends entry, exit, or error notifications.
- Stores notification/trade state.
- Runs the copy-trade sweep as part of the scheduled background cycle.

### 7. Copy Trading

Copy trading can work through MetaApi Cloud or a local MT5 bridge.

The copy-trade service stores account settings, encrypts passwords, tracks connection state, syncs MetaApi account state, and exposes public account data to the dashboard. The worker computes the current active signal from recent candles and selected strategy settings, then opens/closes MT5 positions through MetaApi or responds to the local bridge.

Copy-trade settings include:

- Provider: `metaapi` or `local_bridge`.
- Symbol, usually `XAUUSD`.
- Timeframe.
- Lot size.
- Chunk bars.
- Dollars per move.
- Take profit in dollars.
- Stop loss in dollars.
- Max concurrent trades.
- Stop mode: fixed, break-even, or trailing.
- Break-even trigger percent.
- Trailing start percent.
- Trailing distance percent.

The MT5 Expert Advisor can poll `/api/copytrade/signal` with a bearer token and execute the returned `BUY`, `SELL`, or `FLAT` action.

## Built-In Strategies

The built-in models are defined in `data/models`. Each model has aliases, user-facing descriptions, entry rules, exit notes, and machine-readable backtest conditions.

| Strategy | Core Idea | Long Setup | Short Setup | Exit Logic |
| --- | --- | --- | --- | --- |
| Momentum | Continuation after a counter-spike in the direction of the 30 EMA over 200 EMA trend. | 30 EMA above 200 EMA, fresh downside 2 ATR spike, no recent downside repeat spike. | 30 EMA below 200 EMA, fresh upside 2 ATR spike, no recent upside repeat spike. | Exit after the trend remains intact and price prints the impulse that completes the move. |
| Mean Reversion | Fade a fresh extreme against the prevailing EMA bias. | 30 EMA below 200 EMA, fresh upside 2 ATR spike, no recent upside repeat spike. | 30 EMA above 200 EMA, fresh downside 2 ATR spike, no recent downside repeat spike. | Exit when the 30 EMA crosses back through the 200 EMA in the recovery direction. |
| Seasons | Trade summer/winter cycle changes only when EMA bias confirms. | Market enters summer, 30 EMA above 200 EMA, oscillator not overbought. | Market enters winter, 30 EMA below 200 EMA, oscillator not oversold. | Exit when the market leaves the active season bucket. |
| Time of Day | Trade day/night session bucket flips with EMA confirmation. | Time bucket flips to day and 30 EMA is above 200 EMA. | Time bucket flips to night and 30 EMA is below 200 EMA. | Exit when the time bucket is no longer day/night. |
| Fibonacci | Trend pullback model using oscillator zones. | 30 EMA above 200 EMA, normalized oscillator below 40, no recent downside spike. | 30 EMA below 200 EMA, normalized oscillator above 60, no recent upside spike. | Exit when price prints the impulse that ends the pullback trade. |
| Fair Value Gap | Displacement-and-retest model for fresh three-candle imbalances. | Uptrend, recent bullish FVG, retest respects the gap, range is wide enough. | Downtrend, recent bearish FVG, retest respects the gap, range is wide enough. | Exit into the next impulse or if price accepts through the gap. |
| Support / Resistance | Local range edge reversal model. | Price in the bottom 8% of local range, bullish reversal candle, sufficient range. | Price in the top 8% of local range, bearish reversal candle, sufficient range. | Uses the shared TP/SL and replay engine unless additional exit rules are added. |

There is also an internal `AI Model` profile. It is a synthetic/every-signal model used by parts of the AI Zip and replay systems rather than a normal user-facing strategy JSON file.

## Settings Reference

### Market And Chart Settings

- Symbol: the app is currently centered on XAU/USD.
- Pair key: `XAU_USD` in API routes.
- Chart timeframes: `1m`, `5m`, `15m`, `1H`, `4H`, `1D`, `1W`, with some data routes also supporting `30m` and `1M`.
- History depth: historical loading can request large ranges, with app-side safeguards and optional Firebase Storage cache.
- Drawings/actions: horizontal lines, vertical lines, trend lines, boxes, FVGs, fibs, support/resistance, arrows, long/short markers, rulers, and candle marks.

### Backtest Settings

- Model selection: choose one or more strategy models.
- Timeframe: controls candle aggregation and replay period.
- Chunk bars: controls lookback window size used for feature generation.
- TP dollars: fixed take-profit size, converted through units/dollars-per-move.
- SL dollars: fixed stop-loss size.
- Stop mode:
  - `0`: fixed stop.
  - `1`: move stop to break-even after configured progress.
  - `2`: trailing stop after configured progress.
- Break-even trigger percent: percent of target distance needed before moving stop to entry.
- Trailing start percent: percent of target distance needed before trailing begins.
- Trailing distance percent: trailing stop distance as a percent of target distance.
- Max bars in trade: optional time-based exit.
- Precision candles: lower-timeframe candles can be used to resolve entries/exits more accurately where available.

### AI Zip Settings

- AI mode: off, KNN, or HDBSCAN-style clustering.
- Libraries: online, ghost, base/session libraries, and model-derived libraries.
- Features: core price features, model features, and trade-history features.
- Dimensions: sortable feature/dimension summaries used to understand which inputs separate winners and losers.
- Validation modes: runtime checks designed to reduce future leakage and make neighbor comparisons more honest.

### Copy-Trade Settings

- Provider: MetaApi cloud or local bridge.
- Login/server/password: broker account credentials.
- Preset name: label for strategy/account settings.
- Symbol and timeframe: signal symbol and candle interval.
- Lot: MT5 lot size.
- Dollars per move: conversion factor for XAU/USD movement into account dollars.
- TP/SL dollars: risk target distances.
- Max concurrent trades: cap active trades per account.
- Stop behavior: fixed, break-even, or trailing.
- Pause/status: accounts can be paused or marked disconnected/error.

## API Routes

| Route | Purpose |
| --- | --- |
| `/api/market/candles` | Recent Twelve Data candles for XAU/USD. |
| `/api/market/stream` | SSE quote stream for XAU/USD. |
| `/api/clickhouse/candles` | Legacy-named historical candle endpoint, currently backed by Twelve Data and optional Firebase Storage cache. |
| `/api/history/candles` | Re-export of the historical candle endpoint. |
| `/api/clickhouse/analytics` | Optional ClickHouse aggregate analytics. |
| `/api/backtest/history` | Server-side backtest history row generation. |
| `/api/backtest/analytics` | Backtest analytics summaries. |
| `/api/backtest/panel-analytics` | Larger panel analytics and AI snapshot data. |
| `/api/aizip/compute` | Runs AI Zip compute worker server-side. |
| `/api/assistant/chat` | Gideon assistant request endpoint. |
| `/api/copytrade/accounts` | List/create copy-trade accounts. |
| `/api/copytrade/accounts/[accountId]` | Read/update/delete one account. |
| `/api/copytrade/accounts/[accountId]/pause` | Pause or resume an account. |
| `/api/copytrade/accounts/[accountId]/dashboard` | Account dashboard summary. |
| `/api/copytrade/accounts/stream` | SSE account status stream. |
| `/api/copytrade/signal` | Token-protected signal endpoint for MT5 EA polling. |
| `/api/copytrade/local/heartbeat` | Local bridge heartbeat endpoint. |
| `/api/copytrade/local/signal` | Local bridge signal endpoint. |
| `/api/notifications/service-worker` | Firebase messaging service worker script. |
| `/api/notifications/strategy` | Cron endpoint for strategy notifications and copy-trade sweep. |
| `/api/notifications/test` | Test notification endpoint. |
| `/api/notifications/broadcast` | Admin broadcast notification endpoint. |

## Environment Variables

Create `.env.local` from `.env.example`, then add the values needed for the systems you plan to use.

```bash
cp .env.example .env.local
```

### Required For Core App Login

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### Required For Market Data

```text
TWELVE_DATA_API_KEY=
```

The code also supports:

```text
TWELVE_DATA_API_KEYS=
TWELVEDATA_API_KEY=
```

### Required For Gideon AI

At least one AI provider token must be configured, depending on the deployment:

```text
NEBIUS_API_KEY=
TOKENFACTORY_API_KEY=
AI_API_KEY=
NEBIUS_BASE_URL=
```

`NEBIUS_BASE_URL` defaults to an OpenAI-compatible Nebius endpoint if omitted.

### Required For Push Notifications And Cron

```text
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
CRON_SECRET=
```

### Required For Copy Trading

```text
METAAPI_API_TOKEN=
COPY_TRADING_ENCRYPTION_KEY=
COPYTRADE_SIGNAL_TOKEN=
COPYTRADE_MAX_ACCOUNTS=
COPY_TRADING_LOOP_MS=
```

Optional aliases/settings used by the code:

```text
COPYTRADE_METAAPI_TOKEN=
METAAPI_MAX_ACCOUNTS=
COPYTRADE_DATA_DIR=
COPYTRADING_SECRET=
MARKET_API_KEY=
COPYTRADE_MARKET_API_BASE=
```

### Optional Legacy/Analytics Variables

```text
DATABENTO_API_KEY=
DATABENTO_GOLD_CONTINUOUS_SYMBOL=GC.v.0

CLICKHOUSE_HOST=
CLICKHOUSE_USER=
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=
CLICKHOUSE_TABLE=
CLICKHOUSE_TIMEZONE=
```

Never commit `.env.local` or real API keys. Before publishing publicly, rotate any keys that may have lived in local files or scripts.

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

Start a production build:

```bash
npm run start
```

Run the AI Zip and strategy smoke tests:

```bash
npm run test:aizip-smoke
```

Run the Twelve Data backfill script:

```bash
npm run backfill:xauusd
```

## Deployment Notes

The repo includes `vercel.json` with a cron schedule:

```text
*/5 * * * *
```

That cron calls:

```text
/api/notifications/strategy
```

For production deployment:

1. Configure Firebase public client variables.
2. Configure Firebase Admin service account variables.
3. Configure Twelve Data keys.
4. Configure `CRON_SECRET`.
5. Configure Gideon AI provider keys if using the assistant.
6. Configure MetaApi/copy-trade variables only if enabling copy trading.
7. Configure the Firebase web push certificate/VAPID key if using push notifications.
8. Redeploy after changing server environment variables.

## MT5 Copy-Trade Setup

There are two MT5 paths:

- Vercel/API polling EA: `mt5/KorraCopyTradeBridgeEA.mq5`.
- Local bridge EA: `public/mt5/KorraCopyTraderEA.mq5`.

The usual hosted flow is:

1. Deploy the app.
2. Set `COPYTRADE_SIGNAL_TOKEN`.
3. Confirm `/api/copytrade/signal` returns a plain signal when called with the bearer token.
4. Copy the EA into MT5's `MQL5/Experts/` folder.
5. Compile it in MetaEditor.
6. Allow WebRequest to your deployed app origin.
7. Attach the EA to an XAUUSD chart.
8. Set the endpoint, token, symbol, timeframe, lot, TP/SL, and risk inputs.
9. Use MetaTrader virtual hosting if the EA should keep running while your computer is off.

See `mt5/SETUP.md` for the current walkthrough.

## Tests

The configured test command is:

```bash
npm run test:aizip-smoke
```

It runs:

- `tests/aizip.smoke.test.ts`
- `tests/aizip.runtime.test.ts`
- `tests/aizipHdbscan.test.ts`
- `tests/strategyModelBacktest.test.ts`
- `tests/backtestHistoryShared.test.ts`

Additional tests exist for market data, formatting, notification helpers, exit reasons, neighbor outcomes, and cluster map layout.

## Known Caveats

- The project is large and several files are monolithic. The main terminal, AI Zip module, and assistant route are especially large.
- Some route names are historical. For example, `/api/clickhouse/candles` currently uses Twelve Data, not ClickHouse.
- Some metadata and docs still mention Databento even though the active app path is mostly Twelve Data.
- Copy-trade account limits are clamped in code. Check `lib/copyTradeService.ts` before assuming the `.env.example` limit is the effective runtime limit.
- Copy-trade encryption has a development fallback secret. Production deployments should always set `COPY_TRADING_ENCRYPTION_KEY`.
- Keep credentials out of source before making the repository public.

## Suggested First Run

For a clean local smoke test:

1. Install dependencies with `npm install`.
2. Create `.env.local`.
3. Add Firebase client keys and a Twelve Data key.
4. Start `npm run dev`.
5. Create a user account in the app.
6. Open the Chart tab and confirm XAU/USD candles load.
7. Open Backtest, choose a model, timeframe, TP/SL, and run a replay.
8. Open AI Zip after a backtest to inspect neighbors/clusters.
9. Enable notifications or copy trading only after the base terminal works.

## License

No license file is currently included. Add one before publishing the repository if you want others to know how they may use, modify, or redistribute the code.
