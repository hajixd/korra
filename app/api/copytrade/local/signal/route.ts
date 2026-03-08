import { NextResponse } from "next/server";
import {
  getCopyTradeAccountByLoginServer,
  patchCopyTradeAccountRuntime
} from "../../../../../lib/copyTradeService";
import {
  resolveCopyTradeLocalSignal,
  resolveLocalBridgePosition,
  toNoStoreHeaders,
  toPlainLocalErrorResponse,
  toPlainLocalSignalResponse
} from "../../../../../lib/copyTradeLocalBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buildErrorResponse = (message: string, status: number, format: string) => {
  if (format === "json") {
    return NextResponse.json(
      {
        error: message
      },
      {
        status,
        headers: toNoStoreHeaders()
      }
    );
  }

  return new NextResponse(toPlainLocalErrorResponse(message), {
    status,
    headers: toNoStoreHeaders("text/plain; charset=utf-8")
  });
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "plain").trim().toLowerCase();
  const login = (url.searchParams.get("login") || "").trim();
  const server = (url.searchParams.get("server") || "").trim();

  if (!login || !server) {
    return buildErrorResponse("Missing MT5 login/server.", 400, format);
  }

  const account = await getCopyTradeAccountByLoginServer(login, server, "local_bridge");

  if (!account) {
    return buildErrorResponse("Copy-trader account not found.", 404, format);
  }

  const now = Date.now();
  const openPosition = resolveLocalBridgePosition(url.searchParams, account.symbol);
  const connectedPatch = {
    lastHeartbeatAt: now,
    providerState: "LOCAL_CONNECTED" as const,
    providerConnectionStatus: "CONNECTED" as const,
    ...(openPosition !== undefined ? { openPosition } : {}),
    ...(openPosition !== undefined ? { lastActionAt: now } : {})
  };

  if (account.paused) {
    await patchCopyTradeAccountRuntime(account.id, {
      ...connectedPatch,
      status: "Connected",
      lastError: null,
      lastSignalId: null,
      lastSignalSide: null
    });

    const pausedPayload = {
      ok: true,
      paused: true,
      accountId: account.id,
      signal: {
        desiredPosition: "FLAT" as const,
        signalId: "",
        symbol: account.symbol,
        timeframe: account.timeframe,
        lot: account.lot,
        entryPrice: null,
        stopLoss: null,
        takeProfit: null,
        signalEntryTime: null,
        signalExitTime: null,
        generatedAt: now
      }
    };

    if (format === "json") {
      return NextResponse.json(pausedPayload, {
        headers: toNoStoreHeaders()
      });
    }

    return new NextResponse(
      toPlainLocalSignalResponse(pausedPayload.signal, {
        paused: 1,
        accountId: account.id
      }),
      {
        status: 200,
        headers: toNoStoreHeaders("text/plain; charset=utf-8")
      }
    );
  }

  try {
    const signal = await resolveCopyTradeLocalSignal(account);
    await patchCopyTradeAccountRuntime(account.id, {
      ...connectedPatch,
      status: "Connected",
      lastError: null,
      lastSignalId: signal.signalId || null,
      lastSignalSide:
        signal.desiredPosition === "BUY"
          ? "Long"
          : signal.desiredPosition === "SELL"
            ? "Short"
            : null
    });

    if (format === "json") {
      return NextResponse.json(
        {
          ok: true,
          paused: false,
          accountId: account.id,
          signal
        },
        {
          headers: toNoStoreHeaders()
        }
      );
    }

    return new NextResponse(
      toPlainLocalSignalResponse(signal, {
        paused: 0,
        accountId: account.id
      }),
      {
        status: 200,
        headers: toNoStoreHeaders("text/plain; charset=utf-8")
      }
    );
  } catch (error) {
    const message = (error as Error).message || "Signal generation failed.";

    await patchCopyTradeAccountRuntime(account.id, {
      ...connectedPatch,
      status: "Error",
      lastError: message
    });

    return buildErrorResponse(message, 500, format);
  }
}
