import { spawn } from "node:child_process";
import path from "node:path";

export type Mt5Credentials = {
  login: string;
  password: string;
  server: string;
};

export type Mt5OrderSide = "BUY" | "SELL";

type Mt5BridgeResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
};

const BRIDGE_SCRIPT_PATH = path.join(process.cwd(), "scripts", "mt5_bridge.py");
const DEFAULT_TIMEOUT_MS = 30_000;

const resolvePythonCommand = (): string[] => {
  const envPython = process.env.COPY_TRADING_PYTHON_BIN?.trim();
  if (envPython) {
    return [envPython];
  }

  // Keep fallback order explicit for local setups.
  return ["python3", "python"];
};

const parseBridgeJson = (stdout: string): Mt5BridgeResponse => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index]!;
    try {
      const parsed = JSON.parse(candidate) as Mt5BridgeResponse;
      return parsed;
    } catch {
      continue;
    }
  }

  throw new Error("MT5 bridge returned non-JSON output.");
};

const runBridgeWithPython = async (pythonCommand: string, args: string[]): Promise<Mt5BridgeResponse> => {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`MT5 bridge timed out after ${DEFAULT_TIMEOUT_MS}ms.`));
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      try {
        const parsed = parseBridgeJson(stdout);
        if (code !== 0 && parsed.ok !== true) {
          const message = parsed.error || parsed.message || stderr.trim() || `Bridge exited with ${code}.`;
          reject(new Error(message));
          return;
        }

        resolve(parsed);
      } catch (error) {
        const fallback = stderr.trim() || stdout.trim() || `Bridge exited with ${code}.`;
        reject(new Error((error as Error).message + (fallback ? ` ${fallback}` : "")));
      }
    });
  });
};

const runBridge = async (args: string[]): Promise<Mt5BridgeResponse> => {
  const pythonCandidates = resolvePythonCommand();
  let lastError: Error | null = null;

  for (const pythonCommand of pythonCandidates) {
    try {
      return await runBridgeWithPython(pythonCommand, args);
    } catch (error) {
      lastError = error as Error;
      continue;
    }
  }

  throw new Error(lastError?.message || "No Python interpreter available for MT5 bridge.");
};

const buildCredentialArgs = (credentials: Mt5Credentials): string[] => {
  return [
    "--login",
    String(credentials.login),
    "--password",
    String(credentials.password),
    "--server",
    String(credentials.server)
  ];
};

const pickErrorMessage = (response: Mt5BridgeResponse): string => {
  return response.error || response.message || "Unknown MT5 bridge error.";
};

export const verifyMt5Credentials = async (credentials: Mt5Credentials): Promise<{ ok: true } | { ok: false; message: string }> => {
  try {
    const response = await runBridge([
      BRIDGE_SCRIPT_PATH,
      "health",
      ...buildCredentialArgs(credentials)
    ]);

    if (response.ok !== true) {
      return {
        ok: false,
        message: pickErrorMessage(response)
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).message || "Failed to validate MT5 credentials."
    };
  }
};

export const openMt5Position = async (params: {
  credentials: Mt5Credentials;
  symbol: string;
  side: Mt5OrderSide;
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string;
}): Promise<{ positionTicket: number; filledPrice?: number | null }> => {
  const { credentials, symbol, side, volume, stopLoss, takeProfit, comment } = params;

  const args = [
    BRIDGE_SCRIPT_PATH,
    "open",
    ...buildCredentialArgs(credentials),
    "--symbol",
    symbol,
    "--side",
    side,
    "--volume",
    String(volume)
  ];

  if (typeof stopLoss === "number" && Number.isFinite(stopLoss) && stopLoss > 0) {
    args.push("--sl", String(stopLoss));
  }

  if (typeof takeProfit === "number" && Number.isFinite(takeProfit) && takeProfit > 0) {
    args.push("--tp", String(takeProfit));
  }

  if (comment && comment.trim()) {
    args.push("--comment", comment.trim().slice(0, 30));
  }

  const response = await runBridge(args);

  if (response.ok !== true) {
    throw new Error(pickErrorMessage(response));
  }

  const rawTicket = Number(response.data?.position_ticket ?? response.data?.ticket ?? 0);
  if (!Number.isFinite(rawTicket) || rawTicket <= 0) {
    throw new Error("MT5 bridge did not return a valid position ticket.");
  }

  const filledPriceRaw = Number(response.data?.price ?? response.data?.filled_price ?? Number.NaN);

  return {
    positionTicket: Math.trunc(rawTicket),
    filledPrice: Number.isFinite(filledPriceRaw) ? filledPriceRaw : null
  };
};

export const closeMt5Position = async (params: {
  credentials: Mt5Credentials;
  symbol: string;
  positionTicket: number;
  comment?: string;
}): Promise<void> => {
  const { credentials, symbol, positionTicket, comment } = params;

  const args = [
    BRIDGE_SCRIPT_PATH,
    "close",
    ...buildCredentialArgs(credentials),
    "--symbol",
    symbol,
    "--position-ticket",
    String(positionTicket)
  ];

  if (comment && comment.trim()) {
    args.push("--comment", comment.trim().slice(0, 30));
  }

  const response = await runBridge(args);

  if (response.ok !== true) {
    throw new Error(pickErrorMessage(response));
  }
};
