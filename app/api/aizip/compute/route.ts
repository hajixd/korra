import { Worker as NodeWorker } from "node:worker_threads";
import { NextResponse } from "next/server";
import { AIZIP_COMPUTE_WORKER_CODE } from "../../../../lib/aizipComputeWorkerCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOLVED_WORKER_SCRIPT = `
const { parentPort } = require("node:worker_threads");
let __onmessage = null;

globalThis.postMessage = (message) => {
  parentPort.postMessage(message);
};

Object.defineProperty(globalThis, "onmessage", {
  configurable: true,
  enumerable: true,
  get() {
    return __onmessage;
  },
  set(handler) {
    __onmessage = handler;
  }
});

parentPort.on("message", (data) => {
  if (typeof __onmessage === "function") {
    __onmessage({ data });
  }
});

${AIZIP_COMPUTE_WORKER_CODE}
`;

const runWorkerCompute = (params: {
  candles: unknown[];
  settings: Record<string, unknown>;
  timeoutMs: number;
}): Promise<Record<string, unknown>> => {
  const { candles, settings, timeoutMs } = params;
  const requestId = 1;

  return new Promise((resolve, reject) => {
    const worker = new NodeWorker(RESOLVED_WORKER_SCRIPT, {
      eval: true
    });

    let settled = false;

    const cleanup = () => {
      worker.removeAllListeners("message");
      worker.removeAllListeners("error");
      worker.removeAllListeners("exit");
      void worker.terminate();
    };

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("AIZip server compute timed out."));
    }, Math.max(1_000, timeoutMs));

    worker.on("message", (message) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const row = message as Record<string, unknown>;
      const type = String(row.type ?? "");
      const id = Number(row.id ?? requestId);

      if (type === "result" && id === requestId) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        cleanup();
        const res =
          row.res && typeof row.res === "object" && !Array.isArray(row.res)
            ? (row.res as Record<string, unknown>)
            : {};
        resolve(res);
        return;
      }

      if (type === "error" && id === requestId) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        cleanup();
        reject(new Error(String(row.message ?? "AIZip worker compute failed.")));
      }
    });

    worker.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      reject(error);
    });

    worker.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error(`AIZip worker exited before result (code ${code}).`));
    });

    worker.postMessage({ type: "set_candles", candles });
    worker.postMessage({
      type: "compute",
      id: requestId,
      settings
    });
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!isRecord(rawBody)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const candles = Array.isArray(rawBody.candles) ? rawBody.candles : [];
  const settings = isRecord(rawBody.settings) ? rawBody.settings : {};
  const timeoutMs = Math.min(
    300_000,
    Math.max(30_000, Math.trunc(Number(rawBody.timeoutMs) || 150_000))
  );

  try {
    const res = await runWorkerCompute({
      candles,
      settings,
      timeoutMs
    });

    return NextResponse.json(
      { res },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "AIZip server compute failed."
      },
      { status: 500 }
    );
  }
}
