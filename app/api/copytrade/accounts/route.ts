import { NextResponse } from "next/server";
import {
  COPYTRADE_MAX_ACCOUNTS,
  createCopyTradeAccount,
  listCopyTradeAccounts
} from "../../../../lib/copyTradeService";
import type { CopyTradeTimeframe } from "../../../../lib/copyTradeSignalEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cloudServiceWorkerStatus = {
  running: false,
  startedAt: null,
  tickInFlight: false,
  loopMs: 15_000
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const timeframeSet = new Set<CopyTradeTimeframe>(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);

const parseTimeframe = (value: unknown): CopyTradeTimeframe | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const candidate = value.trim() as CopyTradeTimeframe;
  return timeframeSet.has(candidate) ? candidate : undefined;
};

export async function GET() {
  const accounts = await listCopyTradeAccounts();

  return NextResponse.json(
    {
      accounts,
      worker: cloudServiceWorkerStatus,
      maxAccounts: COPYTRADE_MAX_ACCOUNTS
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: Request) {
  let payload: Record<string, unknown> | null = null;
  try {
    const body = await request.json();
    payload = isRecord(body) ? body : null;
  } catch {
    payload = null;
  }

  if (!payload) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const login = String(payload.login ?? "").trim();
  const password = typeof payload.password === "string" ? payload.password : "";
  const server = String(payload.server ?? "").trim();

  if (!login || !password || !server) {
    return NextResponse.json(
      { error: "TradeCopier requires MT5 login, password, and server." },
      { status: 400 }
    );
  }

  try {
    const account = await createCopyTradeAccount({
      login,
      password,
      server,
      symbol: typeof payload.symbol === "string" ? payload.symbol : undefined,
      timeframe: parseTimeframe(payload.timeframe),
      lot: typeof payload.lot === "number" ? payload.lot : undefined,
      aggressive: typeof payload.aggressive === "boolean" ? payload.aggressive : undefined,
      chunkBars: typeof payload.chunkBars === "number" ? payload.chunkBars : undefined,
      dollarsPerMove:
        typeof payload.dollarsPerMove === "number" ? payload.dollarsPerMove : undefined,
      tpDollars: typeof payload.tpDollars === "number" ? payload.tpDollars : undefined,
      slDollars: typeof payload.slDollars === "number" ? payload.slDollars : undefined,
      maxConcurrentTrades:
        typeof payload.maxConcurrentTrades === "number" ? payload.maxConcurrentTrades : undefined,
      stopMode: typeof payload.stopMode === "number" ? payload.stopMode : undefined,
      breakEvenTriggerPct:
        typeof payload.breakEvenTriggerPct === "number" ? payload.breakEvenTriggerPct : undefined,
      trailingStartPct:
        typeof payload.trailingStartPct === "number" ? payload.trailingStartPct : undefined,
      trailingDistPct:
        typeof payload.trailingDistPct === "number" ? payload.trailingDistPct : undefined
    });

    return NextResponse.json(
      {
        account,
        worker: cloudServiceWorkerStatus,
        maxAccounts: COPYTRADE_MAX_ACCOUNTS
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "Failed to create copy-trade account."
      },
      { status: 400 }
    );
  }
}
