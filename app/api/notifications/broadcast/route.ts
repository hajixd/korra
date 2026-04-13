import { NextResponse } from "next/server";
import { getBearerToken, verifyFirebaseIdToken } from "../../../../lib/firebaseRequestAuth";
import { sendPushNotification } from "../../../../lib/firebaseServerNotifications";
import {
  getFirebaseUserDocument,
  listFirebaseUserDocuments
} from "../../../../lib/firebaseUserDocuments";
import { googleServiceAccountReady } from "../../../../lib/googleServiceAccount";
import { isNotificationBroadcastAdmin } from "../../../../lib/notificationBroadcastAccess";
import { normalizeNotificationDevices } from "../../../../lib/notificationDevices";
import type { StrategyNotificationSettings } from "../../../../lib/strategyNotificationEngine";
import {
  DEFAULT_STRATEGY_NOTIFICATION_SETTINGS,
  MARKET_TIMEFRAME_BY_UI,
  buildTradeNotificationBody,
  formatTradeNotificationPrice,
  normalizeStrategyNotificationMarketCandles,
  normalizeStrategyNotificationPair,
  normalizeStrategyNotificationSettings
} from "../../../../lib/strategyNotificationHelpers";
import { fetchTwelveDataCandles } from "../../../../lib/twelveDataMarketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BroadcastRequestBody = {
  side?: unknown;
  settings?: unknown;
  timeZone?: unknown;
};

const normalizeSide = (value: unknown): "buy" | "sell" | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "buy" || normalized === "sell") {
    return normalized;
  }
  return null;
};

const getEnabledDeviceCount = async () => {
  const userDocs = await listFirebaseUserDocuments();
  return userDocs.reduce((count, userDoc) => {
    return (
      count +
      normalizeNotificationDevices(userDoc.data.notificationDevices).filter((device) => device.enabled)
        .length
    );
  }, 0);
};

const buildSimulatedTrade = (args: {
  settings: StrategyNotificationSettings;
  side: "buy" | "sell";
  entryPrice: number;
  triggerTimeMs: number;
}) => {
  const { settings, side, entryPrice, triggerTimeMs } = args;
  const units = Math.max(0.000001, Math.abs(Number(settings.dollarsPerMove)) || 25);
  const takeProfitDistance = Math.max(0.000001, (Number(settings.tpDollars) || 1000) / units);
  const stopLossDistance = Math.max(0.000001, (Number(settings.slDollars) || 1000) / units);
  const isBuy = side === "buy";

  return {
    symbol: settings.symbol,
    sideLabel: isBuy ? "Buy" : "Sell",
    entryPrice,
    takeProfit: isBuy ? entryPrice + takeProfitDistance : Math.max(0.000001, entryPrice - takeProfitDistance),
    stopLoss: isBuy ? Math.max(0.000001, entryPrice - stopLossDistance) : entryPrice + stopLossDistance,
    triggerTimeMs
  };
};

export async function POST(request: Request) {
  if (!googleServiceAccountReady) {
    return NextResponse.json(
      { ok: false, error: "Firebase Admin notifications are not configured." },
      { status: 503 }
    );
  }

  const idToken = getBearerToken(request);
  const authUser = await verifyFirebaseIdToken(idToken);
  if (!authUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const userDocument = await getFirebaseUserDocument(authUser.uid);
  if (
    !isNotificationBroadcastAdmin({
      displayName: userDocument?.data.displayName,
      email: authUser.email
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Only the haji account can send notifications to everyone." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as BroadcastRequestBody | null;
  const side = normalizeSide(body?.side);
  if (!side) {
    return NextResponse.json(
      { ok: false, error: "Choose either buy or sell." },
      { status: 400 }
    );
  }

  const settings =
    normalizeStrategyNotificationSettings(body?.settings) ??
    normalizeStrategyNotificationSettings(userDocument?.data.strategyNotificationSettings) ??
    DEFAULT_STRATEGY_NOTIFICATION_SETTINGS;
  const enabledDeviceCount = await getEnabledDeviceCount();
  if (enabledDeviceCount === 0) {
    return NextResponse.json(
      { ok: false, error: "No enabled notification devices are registered yet." },
      { status: 400 }
    );
  }

  const candlePayload = await fetchTwelveDataCandles({
    pair: normalizeStrategyNotificationPair(settings.symbol),
    timeframe: MARKET_TIMEFRAME_BY_UI[settings.timeframe],
    count: 10
  });
  const candles = normalizeStrategyNotificationMarketCandles(candlePayload.candles);
  const latestCandle = candles[candles.length - 1] ?? null;

  if (!latestCandle) {
    return NextResponse.json(
      { ok: false, error: "Could not load the latest candle for the notification." },
      { status: 503 }
    );
  }

  const simulatedTrade = buildSimulatedTrade({
    settings,
    side,
    entryPrice: latestCandle.close,
    triggerTimeMs: latestCandle.time
  });
  const timeZone = String(body?.timeZone ?? "").trim() || undefined;

  await sendPushNotification({
    title: `${simulatedTrade.symbol} ${simulatedTrade.sideLabel} entry`,
    body: buildTradeNotificationBody({
      symbol: simulatedTrade.symbol,
      side: simulatedTrade.sideLabel,
      label: "entry",
      entryPrice: simulatedTrade.entryPrice,
      takeProfit: simulatedTrade.takeProfit,
      stopLoss: simulatedTrade.stopLoss,
      triggerTimeMs: simulatedTrade.triggerTimeMs,
      timeZone
    }),
    link: "/",
    data: {
      eventType: "strategy_trade_opened",
      symbol: simulatedTrade.symbol,
      side: simulatedTrade.sideLabel,
      entryPrice: formatTradeNotificationPrice(simulatedTrade.entryPrice),
      takeProfit: formatTradeNotificationPrice(simulatedTrade.takeProfit),
      stopLoss: formatTradeNotificationPrice(simulatedTrade.stopLoss),
      triggerTime: String(simulatedTrade.triggerTimeMs)
    }
  });

  return NextResponse.json({
    ok: true,
    deviceCount: enabledDeviceCount,
    symbol: simulatedTrade.symbol,
    side: simulatedTrade.sideLabel,
    entryPrice: formatTradeNotificationPrice(simulatedTrade.entryPrice),
    takeProfit: formatTradeNotificationPrice(simulatedTrade.takeProfit),
    stopLoss: formatTradeNotificationPrice(simulatedTrade.stopLoss),
    triggerTime: simulatedTrade.triggerTimeMs
  });
}
