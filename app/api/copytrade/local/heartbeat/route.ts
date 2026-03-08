import { NextResponse } from "next/server";
import {
  getCopyTradeAccountByLoginServer,
  patchCopyTradeAccountRuntime
} from "../../../../../lib/copyTradeService";
import {
  resolveLocalBridgePosition,
  toNoStoreHeaders,
  toPlainLocalErrorResponse
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
  const status = account.lastError ? "Error" : "Connected";

  const patchedAccount = await patchCopyTradeAccountRuntime(account.id, {
    status,
    lastHeartbeatAt: now,
    providerState: "LOCAL_CONNECTED",
    providerConnectionStatus: "CONNECTED",
    ...(openPosition !== undefined ? { openPosition } : {}),
    ...(openPosition !== undefined ? { lastActionAt: now } : {})
  });

  if (format === "json") {
    return NextResponse.json(
      {
        ok: true,
        status,
        account: patchedAccount,
        provider: "local_bridge"
      },
      {
        headers: toNoStoreHeaders()
      }
    );
  }

  return new NextResponse(
    ["ok=1", `status=${status}`, `accountId=${account.id}`, `paused=${account.paused ? 1 : 0}`].join(
      "\n"
    ),
    {
      status: 200,
      headers: toNoStoreHeaders("text/plain; charset=utf-8")
    }
  );
}
