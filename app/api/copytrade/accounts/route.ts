import { NextResponse } from "next/server";
import {
  COPYTRADE_MAX_ACCOUNTS,
  createCopyTradeAccount,
  listCopyTradeAccounts
} from "../../../../lib/copyTradeService";
import type { CopyTradeTimeframe } from "../../../../lib/copyTradeSignalEngine";
import { ensureCopyTradeWorker, getCopyTradeWorkerStatus } from "../../../../lib/copyTradeWorker";
import { getMetaApiAccountSummary } from "../../../../lib/metaApiCloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getWorkerStatus = () => {
  ensureCopyTradeWorker();
  return getCopyTradeWorkerStatus();
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

const parseProvider = (value: unknown): "metaapi" | "local_bridge" | undefined => {
  if (value === "local_bridge") {
    return "local_bridge";
  }

  if (value === "metaapi") {
    return "metaapi";
  }

  return undefined;
};

export async function GET(request: Request) {
  const accounts = await listCopyTradeAccounts();
  const worker = getWorkerStatus();
  const requestUrl = new URL(request.url);
  const includeSummary = requestUrl.searchParams.get("includeSummary") === "1";

  let summaries: Array<{
    accountId: string;
    summary: Awaited<ReturnType<typeof getMetaApiAccountSummary>> | null;
    error?: string;
  }> | undefined;

  if (includeSummary) {
    summaries = await Promise.all(
      accounts.map(async (account) => {
        if (account.provider !== "metaapi" || !account.providerAccountId) {
          return {
            accountId: account.id,
            summary: null
          };
        }

        try {
          const summary = await getMetaApiAccountSummary({
            providerAccountId: account.providerAccountId
          });

          return {
            accountId: account.id,
            summary
          };
        } catch (error) {
          return {
            accountId: account.id,
            summary: null,
            error: (error as Error).message || "Failed to load account summary."
          };
        }
      })
    );
  }

  return NextResponse.json(
    {
      accounts,
      ...(summaries ? { summaries } : {}),
      worker,
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
      ownerUid: typeof payload.ownerUid === "string" ? payload.ownerUid : undefined,
      login,
      password,
      server,
      provider: parseProvider(payload.provider),
      presetName: typeof payload.presetName === "string" ? payload.presetName : undefined,
      symbol: typeof payload.symbol === "string" ? payload.symbol : undefined,
      timeframe: parseTimeframe(payload.timeframe),
      lot: typeof payload.lot === "number" ? payload.lot : undefined,
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
    const worker = getWorkerStatus();

    return NextResponse.json(
      {
        account,
        worker,
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
