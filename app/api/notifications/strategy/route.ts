import { NextResponse } from "next/server";
import { runStrategyNotificationSweep } from "../../../../lib/strategyNotificationWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isAuthorizedCronRequest = (request: Request): boolean => {
  const configuredSecret = process.env.CRON_SECRET?.trim() || "";

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${configuredSecret}`;
};

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const result = await runStrategyNotificationSweep();
  return NextResponse.json({
    ok: true,
    ...result
  });
}
