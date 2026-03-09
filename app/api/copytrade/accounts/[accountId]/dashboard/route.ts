import { NextResponse } from "next/server";
import {
  COPYTRADE_MAX_ACCOUNTS,
  getCopyTradeAccountById
} from "../../../../../../lib/copyTradeService";
import { ensureCopyTradeWorker, getCopyTradeWorkerStatus } from "../../../../../../lib/copyTradeWorker";
import { getMetaApiAccountDashboard } from "../../../../../../lib/metaApiCloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

const getWorkerStatus = () => {
  ensureCopyTradeWorker();
  return getCopyTradeWorkerStatus();
};

export async function GET(_request: Request, context: RouteContext) {
  const { accountId } = await context.params;
  const account = await getCopyTradeAccountById(accountId);
  const worker = getWorkerStatus();

  if (!account) {
    return NextResponse.json({ error: "Copy-trade account not found." }, { status: 404 });
  }

  if (account.provider === "local_bridge") {
    return NextResponse.json(
      {
        account,
        dashboard: null,
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

  if (!account.providerAccountId) {
    return NextResponse.json(
      {
        account,
        dashboard: null,
        worker,
        maxAccounts: COPYTRADE_MAX_ACCOUNTS,
        error: "Account is not provisioned on MetaApi yet."
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  try {
    const dashboard = await getMetaApiAccountDashboard({
      providerAccountId: account.providerAccountId,
      dealsLookbackHours: 24 * 365,
      dealsLimit: 500
    });

    return NextResponse.json(
      {
        account,
        dashboard,
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
        account,
        dashboard: null,
        worker,
        maxAccounts: COPYTRADE_MAX_ACCOUNTS,
        error: (error as Error).message || "Failed to load account dashboard."
      },
      { status: 400 }
    );
  }
}
