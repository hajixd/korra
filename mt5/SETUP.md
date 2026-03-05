# Korra Copy-Trade Bridge (No Custom VPS)

This setup keeps your app on Vercel and runs 24/7 execution inside MetaTrader's built-in cloud hosting.

## 1) Deploy the API endpoint on Vercel

1. In Vercel project settings, add env vars:
   - `COPYTRADE_SIGNAL_TOKEN` = a long random secret string.
   - `MARKET_API_KEY` = your market candle API key.
   - Optional: `COPYTRADE_MARKET_API_BASE` if you want a custom candle endpoint.
2. Redeploy.
3. Confirm endpoint works (replace values):

```bash
curl -sS "https://YOUR-PROJECT.vercel.app/api/copytrade/signal?format=plain&symbol=XAUUSD&timeframe=15m" \
  -H "Authorization: Bearer YOUR_COPYTRADE_SIGNAL_TOKEN"
```

Expected response contains:
- `ok=1`
- `action=BUY` or `SELL` or `FLAT`

## 2) Install the MT5 EA bridge

1. Open MT5 desktop.
2. Go to `File -> Open Data Folder`.
3. Open `MQL5/Experts/`.
4. Copy [KorraCopyTradeBridgeEA.mq5](/Users/haji./Desktop/projects/korra/mt5/KorraCopyTradeBridgeEA.mq5) into that folder.
5. Open MetaEditor, compile `KorraCopyTradeBridgeEA.mq5` (F7).

## 3) Configure MT5 terminal permissions

1. In MT5: `Tools -> Options -> Expert Advisors`.
2. Enable:
   - `Allow algorithmic trading`
   - `Allow WebRequest for listed URL`
3. Add your app origin only, for example:
   - `https://YOUR-PROJECT.vercel.app`

## 4) Attach EA to your chart

1. Open chart for your trading symbol (example: `XAUUSD`).
2. Drag `KorraCopyTradeBridgeEA` from Navigator -> Expert Advisors onto chart.
3. Set inputs:
   - `InpSignalEndpoint`: `https://YOUR-PROJECT.vercel.app/api/copytrade/signal`
   - `InpApiToken`: same value as `COPYTRADE_SIGNAL_TOKEN`
   - `InpTradeSymbol`: exact broker symbol to trade (can include suffix)
   - `InpSignalSymbol`: normalized symbol used by signal engine (example `XAUUSD`)
   - `InpTimeframe`: `15m` (or your choice)
   - `InpLots`: your lot size
   - Risk/settings inputs as needed (`InpTpDollars`, `InpSlDollars`, etc.)
4. Turn on `Algo Trading` in MT5 toolbar.

## 5) Move execution to cloud (MetaTrader built-in hosting)

1. In MT5 Navigator, right-click your account.
2. Choose virtual hosting registration (MetaTrader/MQL5 hosting).
3. Pick server location and complete subscription.
4. Right-click hosted server entry and run synchronization/migration of EAs.
5. Confirm logs show the EA migrated and running.

After migration, trades continue even when your website browser and your computer are off.

## 6) Verify live

1. Watch `Experts` and `Journal` tabs for:
   - successful `WebRequest` calls
   - `action=` updates
   - position open/close messages
2. If requests fail:
   - re-check allowed WebRequest URL
   - re-check token
   - re-check endpoint path and env vars

## Notes

- This EA manages one symbol stream per chart instance.
- Use a dedicated account/symbol for this EA to avoid conflicts with manual positions.
- Keep the token private; rotate it if leaked.
