import { NextResponse } from "next/server";
import {
  COPYTRADE_MAX_ACCOUNTS,
  deleteCopyTradeAccount,
  getCopyTradeAccountById,
  updateCopyTradeAccount
} from "../../../../../lib/copyTradeService";
import type { CopyTradeTimeframe } from "../../../../../lib/copyTradeSignalEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cloudServiceWorkerStatus = {
  running: false,
  startedAt: null,
  tickInFlight: false,
  loopMs: 15_000
};

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseNumeric = (value: unknown): number | undefined => {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number.isFinite(value) ? value : undefined;
};

const timeframeSet = new Set<CopyTradeTimeframe>(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);

const parseTimeframe = (value: unknown): CopyTradeTimeframe | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const candidate = value.trim() as CopyTradeTimeframe;
  return timeframeSet.has(candidate) ? candidate : undefined;
};

export async function GET(_request: Request, context: RouteContext) {
  const { accountId } = await context.params;
  const account = await getCopyTradeAccountById(accountId);

  if (!account) {
    return NextResponse.json({ error: "Copy-trade account not found." }, { status: 404 });
  }

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
}

export async function PATCH(request: Request, context: RouteContext) {
  const { accountId } = await context.params;

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

  const passwordProvided = typeof payload.password === "string" && payload.password.length > 0;

  try {
    const account = await updateCopyTradeAccount(accountId, {
      ...(payload.login !== undefined ? { login: String(payload.login) } : {}),
      ...(payload.server !== undefined ? { server: String(payload.server) } : {}),
      ...(passwordProvided ? { password: String(payload.password) } : {}),
      ...(payload.symbol !== undefined ? { symbol: String(payload.symbol) } : {}),
      ...(payload.timeframe !== undefined ? { timeframe: parseTimeframe(payload.timeframe) } : {}),
      ...(payload.lot !== undefined ? { lot: parseNumeric(payload.lot) } : {}),
      ...(payload.aggressive !== undefined ? { aggressive: payload.aggressive === true } : {}),
      ...(payload.chunkBars !== undefined
        ? { chunkBars: parseNumeric(payload.chunkBars) }
        : {}),
      ...(payload.dollarsPerMove !== undefined
        ? { dollarsPerMove: parseNumeric(payload.dollarsPerMove) }
        : {}),
      ...(payload.tpDollars !== undefined ? { tpDollars: parseNumeric(payload.tpDollars) } : {}),
      ...(payload.slDollars !== undefined ? { slDollars: parseNumeric(payload.slDollars) } : {}),
      ...(payload.maxConcurrentTrades !== undefined
        ? { maxConcurrentTrades: parseNumeric(payload.maxConcurrentTrades) }
        : {}),
      ...(payload.stopMode !== undefined ? { stopMode: parseNumeric(payload.stopMode) } : {}),
      ...(payload.breakEvenTriggerPct !== undefined
        ? { breakEvenTriggerPct: parseNumeric(payload.breakEvenTriggerPct) }
        : {}),
      ...(payload.trailingStartPct !== undefined
        ? { trailingStartPct: parseNumeric(payload.trailingStartPct) }
        : {}),
      ...(payload.trailingDistPct !== undefined
        ? { trailingDistPct: parseNumeric(payload.trailingDistPct) }
        : {}),
      ...(payload.paused !== undefined ? { paused: payload.paused === true } : {}),
      ...(payload.login !== undefined || payload.server !== undefined || passwordProvided
        ? { status: "Connected" as const, lastError: null }
        : {})
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
        error: (error as Error).message || "Failed to update copy-trade account."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { accountId } = await context.params;

  const removed = await deleteCopyTradeAccount(accountId);

  if (!removed) {
    return NextResponse.json({ error: "Copy-trade account not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
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
