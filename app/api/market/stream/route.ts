import { NextResponse } from "next/server";
import {
  DATABENTO_DEFAULT_PAIR,
  probeDatabentoAccess,
  spawnDatabentoStreamProcess
} from "../../../../lib/databentoMarketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAIR_RE = /^[A-Z0-9]{2,20}(?:_[A-Z0-9]{2,20})?(?:,[A-Z0-9]{2,20}(?:_[A-Z0-9]{2,20})?)*$/;
const KEEPALIVE_INTERVAL_MS = 15_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pairs = (searchParams.get("pairs") || DATABENTO_DEFAULT_PAIR).toUpperCase().trim();

  if (!PAIR_RE.test(pairs)) {
    return NextResponse.json({ error: "Unsupported pair format." }, { status: 400 });
  }
  if (pairs !== DATABENTO_DEFAULT_PAIR) {
    return NextResponse.json({ error: "Only XAU_USD is supported by this stream." }, { status: 400 });
  }

  try {
    if (!process.env.DATABENTO_API_KEY) {
      throw new Error("Missing DATABENTO_API_KEY.");
    }
    await probeDatabentoAccess();
  } catch (error) {
    const details = (error as Error).message || "Unknown Databento stream error.";
    const isAuthFailure =
      details.includes("auth_authentication_failed") ||
      details.toLowerCase().includes("authentication failed");

    return NextResponse.json(
      {
        error: isAuthFailure
          ? "Databento authentication failed."
          : "Databento stream unavailable.",
        details,
        pair: pairs,
        source: "databento",
        docs: isAuthFailure ? "https://databento.com/docs/portal/api-keys" : undefined
      },
      { status: isAuthFailure ? 502 : 500 }
    );
  }

  const encoder = new TextEncoder();
  const child = spawnDatabentoStreamProcess();

  const stream = new ReadableStream({
    start(controller) {
      let stdoutBuffer = "";
      let closed = false;
      let keepaliveId = 0 as unknown as ReturnType<typeof setInterval>;

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(keepaliveId);
        request.signal.removeEventListener("abort", abortHandler);
        if (!child.killed) {
          child.kill();
        }
        try {
          controller.close();
        } catch {
          // The consumer may have already closed the stream.
        }
      };

      const abortHandler = () => {
        close();
      };

      request.signal.addEventListener("abort", abortHandler);
      controller.enqueue(encoder.encode(": databento-connected\n\n"));

      keepaliveId = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
      }, KEEPALIVE_INTERVAL_MS);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || closed) {
            continue;
          }
          try {
            const payload = JSON.parse(trimmed) as { pair?: string };
            if ((payload.pair || "").toUpperCase() !== DATABENTO_DEFAULT_PAIR) {
              continue;
            }
            controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
          } catch {
            // Ignore malformed child output and keep the stream alive.
          }
        }
      });

      child.stderr.on("data", (chunk: string) => {
        const message = chunk.trim();
        if (message) {
          console.error(`[databento-stream] ${message}`);
        }
      });

      child.on("error", () => {
        close();
      });

      child.on("close", () => {
        close();
      });
    },
    cancel() {
      if (!child.killed) {
        child.kill();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Korra-Stream-Source": "databento"
    }
  });
}
