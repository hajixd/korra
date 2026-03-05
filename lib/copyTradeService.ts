import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CopyTradeTimeframe } from "./copyTradeSignalEngine";

export type CopyTradeAccountStatus = "Connected" | "Disconnected" | "Error";
export type CopyTradeSignalSide = "Long" | "Short";

export type CopyTradeRuntimePosition = {
  positionTicket: number;
  signalId: string;
  side: CopyTradeSignalSide;
  symbol: string;
  openedAt: number;
  entryPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
};

type CopyTradeAccountRecord = {
  id: string;
  login: string;
  server: string;
  encryptedPassword: string;
  status: CopyTradeAccountStatus;
  paused: boolean;
  symbol: string;
  timeframe: CopyTradeTimeframe;
  lot: number;
  aggressive: boolean;
  chunkBars: number;
  dollarsPerMove: number;
  tpDollars: number;
  slDollars: number;
  maxConcurrentTrades: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
  lastError: string | null;
  lastHeartbeatAt: number | null;
  lastSignalId: string | null;
  lastSignalSide: CopyTradeSignalSide | null;
  lastActionAt: number | null;
  openPosition: CopyTradeRuntimePosition | null;
  createdAt: number;
  updatedAt: number;
};

type CopyTradeState = {
  version: number;
  accounts: CopyTradeAccountRecord[];
};

export type CopyTradeAccountPublic = Omit<CopyTradeAccountRecord, "encryptedPassword"> & {
  running: boolean;
};

export type CopyTradeAccountWorkerRecord = Omit<CopyTradeAccountRecord, "encryptedPassword"> & {
  password: string;
};

export type CopyTradeAccountCreateInput = {
  login: string;
  password: string;
  server: string;
  symbol?: string;
  timeframe?: CopyTradeTimeframe;
  lot?: number;
  aggressive?: boolean;
  chunkBars?: number;
  dollarsPerMove?: number;
  tpDollars?: number;
  slDollars?: number;
  maxConcurrentTrades?: number;
  stopMode?: number;
  breakEvenTriggerPct?: number;
  trailingStartPct?: number;
  trailingDistPct?: number;
};

export type CopyTradeAccountUpdateInput = Partial<CopyTradeAccountCreateInput> & {
  paused?: boolean;
  status?: CopyTradeAccountStatus;
  lastError?: string | null;
};

const DEFAULT_STATE: CopyTradeState = {
  version: 1,
  accounts: []
};

export const COPYTRADE_MAX_ACCOUNTS = 3;

const DATA_DIR_PATH = path.join(process.cwd(), "data");
const STATE_FILE_PATH = path.join(DATA_DIR_PATH, "copytrade-state.json");

const timeframeSet = new Set<CopyTradeTimeframe>(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);

const copyTradingSecret =
  process.env.COPY_TRADING_ENCRYPTION_KEY ||
  process.env.COPYTRADING_SECRET ||
  "copy-trading-dev-secret";

const encryptionKey = createHash("sha256").update(copyTradingSecret).digest();

let stateCache: CopyTradeState | null = null;
let stateQueue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = stateQueue.then(task, task);
  stateQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

const ensureDataDir = async (): Promise<void> => {
  await mkdir(DATA_DIR_PATH, { recursive: true });
};

const readStateFromDisk = async (): Promise<CopyTradeState> => {
  try {
    const raw = await readFile(STATE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CopyTradeState;

    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.accounts)) {
      return { ...DEFAULT_STATE };
    }

    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      accounts: parsed.accounts.filter((account) => account && typeof account === "object")
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
};

const saveStateToDisk = async (state: CopyTradeState): Promise<void> => {
  await ensureDataDir();
  const tmpPath = `${STATE_FILE_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await rename(tmpPath, STATE_FILE_PATH);
};

const loadState = async (): Promise<CopyTradeState> => {
  if (stateCache) {
    return stateCache;
  }

  const loaded = await readStateFromDisk();
  stateCache = loaded;
  return loaded;
};

const encryptPassword = (plainTextPassword: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainTextPassword, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
};

const decryptPassword = (cipherText: string): string => {
  const [version, ivEncoded, tagEncoded, payloadEncoded] = cipherText.split(":");

  if (version !== "v1" || !ivEncoded || !tagEncoded || !payloadEncoded) {
    throw new Error("Unsupported encrypted password format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivEncoded, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
};

const normalizeTimeframe = (value: unknown): CopyTradeTimeframe => {
  const candidate = typeof value === "string" ? (value.trim() as CopyTradeTimeframe) : "15m";
  return timeframeSet.has(candidate) ? candidate : "15m";
};

const normalizeSymbol = (value: unknown): string => {
  const fallback = "XAUUSD";
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  return normalized || fallback;
};

const normalizeLogin = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeServer = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizePassword = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value;
};

const normalizeLot = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.01;
  }
  return Math.min(100, Math.max(0.01, Math.round(numeric * 100) / 100));
};

const normalizeChunkBars = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 24;
  }
  return Math.min(180, Math.max(8, Math.round(numeric)));
};

const normalizeDollarsPerMove = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 25;
  }
  return Math.min(5000, Math.max(1, numeric));
};

const normalizeUsdTarget = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(100_000, Math.max(1, numeric));
};

const normalizeStopMode = (value: unknown): number => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(2, Math.max(0, numeric));
};

const normalizePct = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, numeric));
};

const normalizeMaxConcurrentTrades = (value: unknown): number => {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(50, Math.max(1, numeric));
};

const buildRuntimeId = (): string => {
  return `cta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const toPublicAccount = (account: CopyTradeAccountRecord): CopyTradeAccountPublic => {
  const { encryptedPassword: _encryptedPassword, ...rest } = account;
  return {
    ...rest,
    running: account.status === "Connected" && !account.paused
  };
};

export const listCopyTradeAccounts = async (): Promise<CopyTradeAccountPublic[]> => {
  return enqueue(async () => {
    const state = await loadState();
    return state.accounts.map(toPublicAccount);
  });
};

export const listCopyTradeWorkerAccounts = async (): Promise<CopyTradeAccountWorkerRecord[]> => {
  return enqueue(async () => {
    const state = await loadState();

    return state.accounts.map((account) => {
      const { encryptedPassword, ...rest } = account;
      let password = "";
      try {
        password = decryptPassword(encryptedPassword);
      } catch {
        password = "";
      }

      return {
        ...rest,
        password
      };
    });
  });
};

export const createCopyTradeAccount = async (
  input: CopyTradeAccountCreateInput
): Promise<CopyTradeAccountPublic> => {
  return enqueue(async () => {
    const state = await loadState();
    if (state.accounts.length >= COPYTRADE_MAX_ACCOUNTS) {
      throw new Error(
        `TradeCopier account limit reached (${COPYTRADE_MAX_ACCOUNTS}). Remove an account before adding another.`
      );
    }

    const now = Date.now();

    const login = normalizeLogin(input.login);
    const server = normalizeServer(input.server);
    const password = normalizePassword(input.password);

    if (!login || !server || !password) {
      throw new Error("MT5 login, password, and server are required.");
    }

    const account: CopyTradeAccountRecord = {
      id: buildRuntimeId(),
      login,
      server,
      encryptedPassword: encryptPassword(password),
      status: "Connected",
      paused: false,
      symbol: normalizeSymbol(input.symbol),
      timeframe: normalizeTimeframe(input.timeframe),
      lot: normalizeLot(input.lot),
      aggressive: input.aggressive ?? true,
      chunkBars: normalizeChunkBars(input.chunkBars),
      dollarsPerMove: normalizeDollarsPerMove(input.dollarsPerMove),
      tpDollars: normalizeUsdTarget(input.tpDollars, 1000),
      slDollars: normalizeUsdTarget(input.slDollars, 1000),
      maxConcurrentTrades: normalizeMaxConcurrentTrades(input.maxConcurrentTrades),
      stopMode: normalizeStopMode(input.stopMode),
      breakEvenTriggerPct: normalizePct(input.breakEvenTriggerPct, 50),
      trailingStartPct: normalizePct(input.trailingStartPct, 50),
      trailingDistPct: normalizePct(input.trailingDistPct, 30),
      lastError: null,
      lastHeartbeatAt: null,
      lastSignalId: null,
      lastSignalSide: null,
      lastActionAt: null,
      openPosition: null,
      createdAt: now,
      updatedAt: now
    };

    state.accounts.unshift(account);
    await saveStateToDisk(state);

    return toPublicAccount(account);
  });
};

export const updateCopyTradeAccount = async (
  accountId: string,
  input: CopyTradeAccountUpdateInput
): Promise<CopyTradeAccountPublic> => {
  return enqueue(async () => {
    const state = await loadState();
    const account = state.accounts.find((candidate) => candidate.id === accountId);

    if (!account) {
      throw new Error("Copy-trade account not found.");
    }

    const now = Date.now();

    if (input.login !== undefined) {
      const nextLogin = normalizeLogin(input.login);
      if (!nextLogin) {
        throw new Error("MT5 login cannot be empty.");
      }
      account.login = nextLogin;
    }

    if (input.server !== undefined) {
      const nextServer = normalizeServer(input.server);
      if (!nextServer) {
        throw new Error("MT5 server cannot be empty.");
      }
      account.server = nextServer;
    }

    if (input.password !== undefined) {
      const nextPassword = normalizePassword(input.password);
      if (!nextPassword) {
        throw new Error("MT5 password cannot be empty.");
      }
      account.encryptedPassword = encryptPassword(nextPassword);
    }

    if (input.symbol !== undefined) {
      account.symbol = normalizeSymbol(input.symbol);
    }

    if (input.timeframe !== undefined) {
      account.timeframe = normalizeTimeframe(input.timeframe);
    }

    if (input.lot !== undefined) {
      account.lot = normalizeLot(input.lot);
    }

    if (input.aggressive !== undefined) {
      account.aggressive = input.aggressive === true;
    }

    if (input.chunkBars !== undefined) {
      account.chunkBars = normalizeChunkBars(input.chunkBars);
    }

    if (input.dollarsPerMove !== undefined) {
      account.dollarsPerMove = normalizeDollarsPerMove(input.dollarsPerMove);
    }

    if (input.tpDollars !== undefined) {
      account.tpDollars = normalizeUsdTarget(input.tpDollars, account.tpDollars);
    }

    if (input.slDollars !== undefined) {
      account.slDollars = normalizeUsdTarget(input.slDollars, account.slDollars);
    }

    if (input.maxConcurrentTrades !== undefined) {
      account.maxConcurrentTrades = normalizeMaxConcurrentTrades(input.maxConcurrentTrades);
    }

    if (input.stopMode !== undefined) {
      account.stopMode = normalizeStopMode(input.stopMode);
    }

    if (input.breakEvenTriggerPct !== undefined) {
      account.breakEvenTriggerPct = normalizePct(input.breakEvenTriggerPct, account.breakEvenTriggerPct);
    }

    if (input.trailingStartPct !== undefined) {
      account.trailingStartPct = normalizePct(input.trailingStartPct, account.trailingStartPct);
    }

    if (input.trailingDistPct !== undefined) {
      account.trailingDistPct = normalizePct(input.trailingDistPct, account.trailingDistPct);
    }

    if (input.paused !== undefined) {
      account.paused = input.paused === true;
    }

    if (input.status !== undefined) {
      account.status = input.status;
    }

    if (input.lastError !== undefined) {
      account.lastError = input.lastError;
    }

    account.updatedAt = now;

    await saveStateToDisk(state);
    return toPublicAccount(account);
  });
};

export const setCopyTradeAccountPaused = async (
  accountId: string,
  paused: boolean
): Promise<CopyTradeAccountPublic> => {
  return updateCopyTradeAccount(accountId, { paused });
};

export const deleteCopyTradeAccount = async (accountId: string): Promise<boolean> => {
  return enqueue(async () => {
    const state = await loadState();
    const nextAccounts = state.accounts.filter((account) => account.id !== accountId);

    if (nextAccounts.length === state.accounts.length) {
      return false;
    }

    state.accounts = nextAccounts;
    await saveStateToDisk(state);
    return true;
  });
};

export type CopyTradeAccountRuntimePatch = {
  status?: CopyTradeAccountStatus;
  lastError?: string | null;
  lastHeartbeatAt?: number | null;
  lastSignalId?: string | null;
  lastSignalSide?: CopyTradeSignalSide | null;
  lastActionAt?: number | null;
  openPosition?: CopyTradeRuntimePosition | null;
  paused?: boolean;
};

export const patchCopyTradeAccountRuntime = async (
  accountId: string,
  patch: CopyTradeAccountRuntimePatch
): Promise<CopyTradeAccountPublic | null> => {
  return enqueue(async () => {
    const state = await loadState();
    const account = state.accounts.find((candidate) => candidate.id === accountId);

    if (!account) {
      return null;
    }

    let changed = false;

    const assign = <K extends keyof CopyTradeAccountRecord>(key: K, value: CopyTradeAccountRecord[K]) => {
      if (account[key] !== value) {
        account[key] = value;
        changed = true;
      }
    };

    if (patch.status !== undefined) assign("status", patch.status);
    if (patch.lastError !== undefined) assign("lastError", patch.lastError);
    if (patch.lastHeartbeatAt !== undefined) assign("lastHeartbeatAt", patch.lastHeartbeatAt);
    if (patch.lastSignalId !== undefined) assign("lastSignalId", patch.lastSignalId);
    if (patch.lastSignalSide !== undefined) assign("lastSignalSide", patch.lastSignalSide);
    if (patch.lastActionAt !== undefined) assign("lastActionAt", patch.lastActionAt);
    if (patch.openPosition !== undefined) assign("openPosition", patch.openPosition);
    if (patch.paused !== undefined) assign("paused", patch.paused);

    if (changed) {
      account.updatedAt = Date.now();
      await saveStateToDisk(state);
    }

    return toPublicAccount(account);
  });
};

export const getCopyTradeAccountById = async (
  accountId: string
): Promise<CopyTradeAccountPublic | null> => {
  return enqueue(async () => {
    const state = await loadState();
    const account = state.accounts.find((candidate) => candidate.id === accountId);
    return account ? toPublicAccount(account) : null;
  });
};
