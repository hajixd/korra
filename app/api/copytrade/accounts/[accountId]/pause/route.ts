import { NextResponse } from "next/server";
import {
  COPYTRADE_MAX_ACCOUNTS,
  setCopyTradeAccountPaused
} from "../../../../../../lib/copyTradeService";
import {
  ensureCopyTradeWorker,
  getCopyTradeWorkerStatus
} from "../../../../../../lib/copyTradeWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getWorkerStatus = () => {
  ensureCopyTradeWorker();
  return getCopyTradeWorkerStatus();
};

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { accountId } = await context.params;
  let paused = true;

  try {
    const body = (await request.json()) as { paused?: unknown };
    paused = body.paused !== false;
  } catch {
    paused = true;
  }

  try {
    const account = await setCopyTradeAccountPaused(accountId, paused);
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
        error: (error as Error).message || "Failed to update pause state."
      },
      { status: 400 }
    );
  }
}
