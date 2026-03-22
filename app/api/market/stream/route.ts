import { NextResponse } from "next/server";
import {
  TWELVE_DATA_DEFAULT_PAIR,
  fetchTwelveDataLatestQuote
} from "../../../../lib/twelveDataMarketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAIR_RE = /^[A-Z0-9]{2,20}(?:_[A-Z0-9]{2,20})?(?:,[A-Z0-9]{2,20}(?:_[A-Z0-9]{2,20})?)*$/;
const KEEPALIVE_INTERVAL_MS = 15_000;
const QUOTE_POLL_INTERVAL_MS = 30_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pairs = (searchParams.get("pairs") || TWELVE_DATA_DEFAULT_PAIR).toUpperCase().trim();

  if (!PAIR_RE.test(pairs)) {
    return NextResponse.json({ error: "Unsupported pair format." }, { status: 400 });
  }
  if (pairs !== TWELVE_DATA_DEFAULT_PAIR) {
    return NextResponse.json({ error: "Only XAU_USD is supported by this stream." }, { status: 400 });
  }

  if (!process.env.TWELVE_DATA_API_KEY && !process.env.TWELVEDATA_API_KEY) {
    return NextResponse.json(
      {
        error: "Twelve Data stream unavailable.",
        details: "Missing TWELVE_DATA_API_KEY.",
        pair: pairs,
        source: "twelve-data"
      },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let keepaliveId = 0 as unknown as ReturnType<typeof setInterval>;
      let pollId = 0 as unknown as ReturnType<typeof setInterval>;
      let lastQuoteFingerprint = "";

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(keepaliveId);
        clearInterval(pollId);
        request.signal.removeEventListener("abort", abortHandler);
        try {
          controller.close();
        } catch {
          // The consumer may have already closed the stream.
        }
      };

      const abortHandler = () => {
        close();
      };

      const emitLatestQuote = async () => {
        try {
          const payload = await fetchTwelveDataLatestQuote();
          if (!payload || closed) {
            return;
          }
          if ((payload.pair || "").toUpperCase() !== TWELVE_DATA_DEFAULT_PAIR) {
            return;
          }

          const fingerprint = `${payload.time}:${payload.bid ?? ""}:${payload.ask ?? ""}`;
          if (fingerprint === lastQuoteFingerprint) {
            return;
          }
          lastQuoteFingerprint = fingerprint;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message) {
            console.error(`[twelve-data-stream] ${message}`);
          }
        }
      };

      request.signal.addEventListener("abort", abortHandler);
      controller.enqueue(encoder.encode(": twelve-data-connected\n\n"));

      keepaliveId = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
      }, KEEPALIVE_INTERVAL_MS);

      void emitLatestQuote();
      pollId = setInterval(() => {
        void emitLatestQuote();
      }, QUOTE_POLL_INTERVAL_MS);
    },
    cancel() {
      // Interval cleanup is handled by the stream closing path.
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Korra-Stream-Source": "twelve-data"
    }
  });
}
