import { listCopyTradeAccounts } from "../../../../../lib/copyTradeService";
import { openMetaApiAccountSummaryStream } from "../../../../../lib/metaApiCloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

const toSseChunk = (event: string, payload: unknown) => {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
};

export async function GET(request: Request) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const closers: Array<() => Promise<void>> = [];
      const heartbeatId = setInterval(() => {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 15_000);

      const sendEvent = (event: string, payload: unknown) => {
        if (closed) {
          return;
        }

        controller.enqueue(toSseChunk(event, payload));
      };

      const closeAll = async () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeatId);
        await Promise.allSettled(closers.map((close) => close()));
        controller.close();
      };

      request.signal.addEventListener(
        "abort",
        () => {
          void closeAll();
        },
        { once: true }
      );

      void (async () => {
        try {
          const accounts = await listCopyTradeAccounts();
          const liveAccounts = accounts.filter(
            (account) => account.provider === "metaapi" && account.providerAccountId
          );

          sendEvent("ready", {
            count: liveAccounts.length,
            at: Date.now()
          });

          for (const account of liveAccounts) {
            const handle = await openMetaApiAccountSummaryStream(
              {
                providerAccountId: account.providerAccountId || undefined
              },
              (summary) => {
                sendEvent("summary", {
                  accountId: account.id,
                  providerAccountId: account.providerAccountId,
                  summary
                });
              }
            );

            closers.push(handle.close);
          }

          if (liveAccounts.length === 0) {
            sendEvent("idle", {
              at: Date.now()
            });
          }
        } catch (error) {
          sendEvent("error", {
            message: (error as Error).message || "Failed to start copy-trade live stream."
          });
          await closeAll();
        }
      })();
    },
    cancel() {
      // Request abort handler performs cleanup.
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
