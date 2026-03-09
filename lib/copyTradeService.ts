import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CopyTradeTimeframe } from "./copyTradeSignalEngine";
import {
  deleteMetaApiAccountById,
  ensureMetaApiAccount,
  getMetaApiAccountSnapshotById,
  listMetaApiAccountSnapshots
} from "./metaApiCloud";

export type CopyTradeAccountStatus = "Connected" | "Disconnected" | "Error";
export type CopyTradeSignalSide = "Long" | "Short";
export type CopyTradeAccountProvider = "metaapi" | "local_bridge";

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
  provider?: CopyTradeAccountProvider;
  providerAccountId?: string | null;
  providerState?: string | null;
  providerConnectionStatus?: string | null;
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
  provider?: CopyTradeAccountProvider;
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
  forceProvision?: boolean;
};

const DEFAULT_STATE: CopyTradeState = {
  version: 1,
  accounts: []
};

const configuredMaxAccounts = Math.trunc(
  Number(process.env.COPYTRADE_MAX_ACCOUNTS ?? process.env.METAAPI_MAX_ACCOUNTS ?? "100")
);
export const COPYTRADE_MAX_ACCOUNTS =
  Number.isFinite(configuredMaxAccounts) && configuredMaxAccounts > 0 ? configuredMaxAccounts : 100;

const configuredDataDir = process.env.COPYTRADE_DATA_DIR?.trim();
const isReadOnlyServerlessFs =
  process.cwd().startsWith("/var/task") ||
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT);
const DATA_DIR_PATH =
  configuredDataDir && configuredDataDir.length > 0
    ? configuredDataDir
    : isReadOnlyServerlessFs
      ? path.join("/tmp", "korra-copytrade")
      : path.join(process.cwd(), "data");
const STATE_FILE_PATH = path.join(DATA_DIR_PATH, "copytrade-state.json");

const timeframeSet = new Set<CopyTradeTimeframe>(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);

const copyTradingSecret =
  process.env.COPY_TRADING_ENCRYPTION_KEY ||
  process.env.COPYTRADING_SECRET ||
  "copy-trading-dev-secret";

const encryptionKey = createHash("sha256").update(copyTradingSecret).digest();
const LOCAL_BRIDGE_STALE_MS = 30_000;
const METAAPI_STATUS_SYNC_TTL_MS = 60_000;

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

const normalizeProvider = (value: unknown): CopyTradeAccountProvider => {
  return value === "local_bridge" ? "local_bridge" : "metaapi";
};

const mapProviderStatusToCopyStatus = (
  providerState: string | null | undefined,
  providerConnectionStatus: string | null | undefined
): CopyTradeAccountStatus => {
  const state = String(providerState || "").toUpperCase();
  const connection = String(providerConnectionStatus || "").toUpperCase();

  if (
    state.includes("FAILED") ||
    state === "DELETE_FAILED" ||
    state === "UNDEPLOY_FAILED" ||
    state === "REDEPLOY_FAILED"
  ) {
    return "Error";
  }

  if (state === "DEPLOYED" && connection === "CONNECTED") {
    return "Connected";
  }

  if (state === "CREATED" || state === "DEPLOYING" || state === "UNDEPLOYING") {
    return "Disconnected";
  }

  if (state === "DEPLOYED" && connection && connection !== "CONNECTED") {
    return "Disconnected";
  }

  return "Disconnected";
};

const syncLocalBridgeRuntime = (
  account: CopyTradeAccountRecord
): { changed: boolean; errorMessage: string | null } => {
  let changed = false;
  const now = Date.now();
  const lastHeartbeatAt = Number(account.lastHeartbeatAt ?? Number.NaN);
  const heartbeatFresh =
    Number.isFinite(lastHeartbeatAt) &&
    lastHeartbeatAt > 0 &&
    now - lastHeartbeatAt <= LOCAL_BRIDGE_STALE_MS;
  const nextConnectionStatus = heartbeatFresh ? "CONNECTED" : "DISCONNECTED";
  const nextProviderState = heartbeatFresh ? "LOCAL_CONNECTED" : "LOCAL_WAITING";
  const nextStatus: CopyTradeAccountStatus = account.lastError
    ? "Error"
    : heartbeatFresh
      ? "Connected"
      : "Disconnected";

  if (account.providerConnectionStatus !== nextConnectionStatus) {
    account.providerConnectionStatus = nextConnectionStatus;
    changed = true;
  }

  if (account.providerState !== nextProviderState) {
    account.providerState = nextProviderState;
    changed = true;
  }

  if (account.status !== nextStatus) {
    account.status = nextStatus;
    changed = true;
  }

  return { changed, errorMessage: null };
};

const hasFreshMetaApiRuntime = (
  account: CopyTradeAccountRecord,
  now = Date.now()
): boolean => {
  const lastHeartbeatAt = Number(account.lastHeartbeatAt ?? Number.NaN);
  return (
    Number.isFinite(lastHeartbeatAt) &&
    lastHeartbeatAt > 0 &&
    now - lastHeartbeatAt <= METAAPI_STATUS_SYNC_TTL_MS
  );
};

const syncAccountProviderRuntime = async (
  account: CopyTradeAccountRecord,
  options: { force?: boolean } = {}
): Promise<{ changed: boolean; errorMessage: string | null }> => {
  let changed = false;
  const provider = normalizeProvider(account.provider);
  const now = Date.now();

  if (account.provider !== provider) {
    account.provider = provider;
    changed = true;
  }

  if (provider === "local_bridge") {
    const sync = syncLocalBridgeRuntime(account);
    return {
      changed: changed || sync.changed,
      errorMessage: sync.errorMessage
    };
  }

  if (!account.providerAccountId) {
    return { changed, errorMessage: null };
  }

  if (!options.force && hasFreshMetaApiRuntime(account, now)) {
    return { changed, errorMessage: null };
  }

  const snapshot = await getMetaApiAccountSnapshotById(account.providerAccountId);

  if (!snapshot) {
    if (account.status !== "Error") {
      account.status = "Error";
      changed = true;
    }
    if (account.lastError !== "MetaApi account not found.") {
      account.lastError = "MetaApi account not found.";
      changed = true;
    }
    if (account.lastHeartbeatAt !== now) {
      account.lastHeartbeatAt = now;
      changed = true;
    }
    if (account.providerState !== "MISSING") {
      account.providerState = "MISSING";
      changed = true;
    }
    if (account.providerConnectionStatus !== null) {
      account.providerConnectionStatus = null;
      changed = true;
    }
    return { changed, errorMessage: "MetaApi account not found." };
  }
  const nextStatus = mapProviderStatusToCopyStatus(snapshot.state, snapshot.connectionStatus);

  if (account.providerAccountId !== snapshot.id) {
    account.providerAccountId = snapshot.id;
    changed = true;
  }
  if (account.providerState !== snapshot.state) {
    account.providerState = snapshot.state;
    changed = true;
  }
  if (account.providerConnectionStatus !== snapshot.connectionStatus) {
    account.providerConnectionStatus = snapshot.connectionStatus;
    changed = true;
  }
  if (account.status !== nextStatus) {
    account.status = nextStatus;
    changed = true;
  }
  if (account.lastHeartbeatAt !== now) {
    account.lastHeartbeatAt = now;
    changed = true;
  }
  if (snapshot.login && account.login !== snapshot.login) {
    account.login = snapshot.login;
    changed = true;
  }
  if (snapshot.server && account.server !== snapshot.server) {
    account.server = snapshot.server;
    changed = true;
  }

  if (nextStatus === "Connected" && account.lastError !== null) {
    account.lastError = null;
    changed = true;
  }

  if (nextStatus === "Error" && !account.lastError) {
    const fallbackError = `MetaApi account state ${snapshot.state} (${snapshot.connectionStatus})`;
    account.lastError = fallbackError;
    changed = true;
    return { changed, errorMessage: fallbackError };
  }

  return { changed, errorMessage: null };
};

const buildRuntimeId = (): string => {
  return `cta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const buildMetaApiRuntimeId = (providerAccountId: string): string => {
  return `cta-metaapi-${String(providerAccountId || "").trim()}`;
};

const reconcileMetaApiAccounts = async (state: CopyTradeState): Promise<boolean> => {
  let snapshots: Awaited<ReturnType<typeof listMetaApiAccountSnapshots>> = [];

  try {
    snapshots = await listMetaApiAccountSnapshots();
  } catch {
    return false;
  }

  let changed = false;
  const now = Date.now();

  for (const snapshot of snapshots) {
    const providerAccountId = String(snapshot.id || "").trim();
    if (!providerAccountId) {
      continue;
    }

    const normalizedLogin = normalizeLogin(snapshot.login);
    const normalizedServer = normalizeServer(snapshot.server);
    const nextStatus = mapProviderStatusToCopyStatus(snapshot.state, snapshot.connectionStatus);
    const existingAccount =
      state.accounts.find((account) => account.providerAccountId === providerAccountId) ||
      state.accounts.find(
        (account) =>
          normalizeProvider(account.provider) === "metaapi" &&
          account.login === normalizedLogin &&
          account.server === normalizedServer
      ) ||
      null;

    if (!existingAccount) {
      state.accounts.unshift({
        id: buildMetaApiRuntimeId(providerAccountId),
        login: normalizedLogin,
        server: normalizedServer,
        encryptedPassword: encryptPassword(""),
        provider: "metaapi",
        providerAccountId,
        providerState: snapshot.state,
        providerConnectionStatus: snapshot.connectionStatus,
        status: nextStatus,
        paused: true,
        symbol: "XAUUSD",
        timeframe: "15m",
        lot: 0.01,
        aggressive: true,
        chunkBars: 24,
        dollarsPerMove: 25,
        tpDollars: 1000,
        slDollars: 1000,
        maxConcurrentTrades: 1,
        stopMode: 0,
        breakEvenTriggerPct: 50,
        trailingStartPct: 50,
        trailingDistPct: 30,
        lastError: null,
        lastHeartbeatAt: now,
        lastSignalId: null,
        lastSignalSide: null,
        lastActionAt: null,
        openPosition: null,
        createdAt: snapshot.createdAt ?? now,
        updatedAt: now
      });
      changed = true;
      continue;
    }

    if (existingAccount.provider !== "metaapi") {
      existingAccount.provider = "metaapi";
      changed = true;
    }
    if (existingAccount.providerAccountId !== providerAccountId) {
      existingAccount.providerAccountId = providerAccountId;
      changed = true;
    }
    if (existingAccount.login !== normalizedLogin) {
      existingAccount.login = normalizedLogin;
      changed = true;
    }
    if (existingAccount.server !== normalizedServer) {
      existingAccount.server = normalizedServer;
      changed = true;
    }
    if (existingAccount.providerState !== snapshot.state) {
      existingAccount.providerState = snapshot.state;
      changed = true;
    }
    if (existingAccount.providerConnectionStatus !== snapshot.connectionStatus) {
      existingAccount.providerConnectionStatus = snapshot.connectionStatus;
      changed = true;
    }
    if (existingAccount.status !== nextStatus) {
      existingAccount.status = nextStatus;
      changed = true;
    }
    if (existingAccount.lastHeartbeatAt == null) {
      existingAccount.lastHeartbeatAt = now;
      changed = true;
    }
    if (!existingAccount.encryptedPassword) {
      existingAccount.encryptedPassword = encryptPassword("");
      changed = true;
    }
  }

  return changed;
};

const toPublicAccount = (account: CopyTradeAccountRecord): CopyTradeAccountPublic => {
  const { encryptedPassword: _encryptedPassword, ...rest } = account;
  return {
    ...rest,
    provider: normalizeProvider(rest.provider),
    running: account.status === "Connected" && !account.paused
  };
};

export const listCopyTradeAccounts = async (): Promise<CopyTradeAccountPublic[]> => {
  return enqueue(async () => {
    const state = await loadState();
    let changed = await reconcileMetaApiAccounts(state);

    for (const account of state.accounts) {
      try {
        const sync = await syncAccountProviderRuntime(account);
        if (sync.changed) {
          changed = true;
        }
      } catch (error) {
        const message = (error as Error).message || "MetaApi status sync failed.";
        if (account.status !== "Error") {
          account.status = "Error";
          changed = true;
        }
        if (account.lastError !== message) {
          account.lastError = message;
          changed = true;
        }
        const now = Date.now();
        if (account.lastHeartbeatAt !== now) {
          account.lastHeartbeatAt = now;
          changed = true;
        }
      }
    }

    if (changed) {
      await saveStateToDisk(state);
    }

    return state.accounts.map(toPublicAccount);
  });
};

export const listCopyTradeWorkerAccounts = async (): Promise<CopyTradeAccountWorkerRecord[]> => {
  return enqueue(async () => {
    const state = await loadState();
    const changed = await reconcileMetaApiAccounts(state);

    if (changed) {
      await saveStateToDisk(state);
    }

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
        provider: normalizeProvider(rest.provider),
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
    const provider = normalizeProvider(input.provider);

    if (!login || !server || !password) {
      throw new Error("MT5 login, password, and server are required.");
    }
    let providerAccountId: string | null = null;
    let providerState: string | null = null;
    let providerConnectionStatus: string | null = null;
    let providerStatus: CopyTradeAccountStatus = "Disconnected";

    if (provider === "metaapi") {
      const providerSnapshot = await ensureMetaApiAccount({
        login,
        password,
        server,
        name: `Korra ${login}@${server}`
      });
      providerAccountId = providerSnapshot.id;
      providerState = providerSnapshot.state;
      providerConnectionStatus = providerSnapshot.connectionStatus;
      providerStatus = mapProviderStatusToCopyStatus(
        providerSnapshot.state,
        providerSnapshot.connectionStatus
      );
    } else {
      providerState = "LOCAL_WAITING";
      providerConnectionStatus = "DISCONNECTED";
      providerStatus = "Disconnected";
    }

    const account: CopyTradeAccountRecord = {
      id:
        provider === "metaapi" && providerAccountId
          ? buildMetaApiRuntimeId(providerAccountId)
          : buildRuntimeId(),
      login,
      server,
      encryptedPassword: encryptPassword(password),
      provider,
      providerAccountId,
      providerState,
      providerConnectionStatus,
      status: providerStatus,
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
      lastError:
        providerStatus === "Error"
          ? `MetaApi account state ${providerState} (${providerConnectionStatus})`
          : null,
      lastHeartbeatAt: provider === "local_bridge" ? null : Date.now(),
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
    const previousLogin = account.login;
    const previousServer = account.server;
    const previousProvider = normalizeProvider(account.provider);
    const previousProviderAccountId = account.providerAccountId || null;

    if (account.provider !== previousProvider) {
      account.provider = previousProvider;
    }

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

    const nextProvider =
      input.provider !== undefined ? normalizeProvider(input.provider) : previousProvider;
    const providerChanged = nextProvider !== previousProvider;

    if (account.provider !== nextProvider) {
      account.provider = nextProvider;
    }

    const loginChanged = previousLogin !== account.login;
    const serverChanged = previousServer !== account.server;
    const credentialsUpdated = input.password !== undefined;

    let passwordForProvision = "";
    try {
      passwordForProvision = credentialsUpdated
        ? normalizePassword(input.password)
        : decryptPassword(account.encryptedPassword);
    } catch {
      passwordForProvision = credentialsUpdated ? normalizePassword(input.password) : "";
    }

    if (nextProvider === "metaapi") {
      const shouldSyncProvider =
        providerChanged ||
        loginChanged ||
        serverChanged ||
        credentialsUpdated ||
        !account.providerAccountId ||
        input.forceProvision === true;

      if (shouldSyncProvider) {
        const requiresPassword =
          providerChanged || loginChanged || serverChanged || !account.providerAccountId;

        if (requiresPassword && !passwordForProvision) {
          throw new Error("Password is required when changing MT5 login/server.");
        }

        const providerSnapshot = await ensureMetaApiAccount({
          existingAccountId: previousProvider === "metaapi" ? previousProviderAccountId || undefined : undefined,
          login: account.login,
          server: account.server,
          password:
            providerChanged ||
            loginChanged ||
            serverChanged ||
            credentialsUpdated ||
            !account.providerAccountId
              ? passwordForProvision
              : undefined,
          name: `Korra ${account.login}@${account.server}`
        });

        account.provider = "metaapi";
        account.providerAccountId = providerSnapshot.id;
        account.providerState = providerSnapshot.state;
        account.providerConnectionStatus = providerSnapshot.connectionStatus;
        account.status = mapProviderStatusToCopyStatus(
          providerSnapshot.state,
          providerSnapshot.connectionStatus
        );
        account.lastHeartbeatAt = Date.now();
        if (account.status === "Connected") {
          account.lastError = null;
        } else if (account.status === "Error") {
          account.lastError = `MetaApi account state ${providerSnapshot.state} (${providerSnapshot.connectionStatus})`;
        }
      }
    } else {
      const shouldResetLocalRuntime = providerChanged || loginChanged || serverChanged;

      account.provider = "local_bridge";
      account.providerAccountId = null;

      if (shouldResetLocalRuntime) {
        account.providerState = "LOCAL_WAITING";
        account.providerConnectionStatus = "DISCONNECTED";
        account.status = "Disconnected";
        account.lastHeartbeatAt = null;
        account.lastSignalId = null;
        account.lastSignalSide = null;
        account.lastActionAt = null;
        account.openPosition = null;
        account.lastError = null;
      } else {
        if (credentialsUpdated && account.lastError !== null) {
          account.lastError = null;
        }
        syncLocalBridgeRuntime(account);
      }
    }

    account.updatedAt = now;

    await saveStateToDisk(state);

    if (previousProvider === "metaapi" && nextProvider === "local_bridge" && previousProviderAccountId) {
      await deleteMetaApiAccountById(previousProviderAccountId).catch(() => undefined);
    }

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
    const accountToRemove = state.accounts.find((account) => account.id === accountId) || null;
    const nextAccounts = state.accounts.filter((account) => account.id !== accountId);

    if (nextAccounts.length === state.accounts.length) {
      return false;
    }

    state.accounts = nextAccounts;
    await saveStateToDisk(state);

    if (normalizeProvider(accountToRemove?.provider) === "metaapi" && accountToRemove?.providerAccountId) {
      await deleteMetaApiAccountById(accountToRemove.providerAccountId).catch(() => undefined);
    }

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
  providerAccountId?: string | null;
  providerState?: string | null;
  providerConnectionStatus?: string | null;
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
    if (patch.providerAccountId !== undefined) assign("providerAccountId", patch.providerAccountId);
    if (patch.providerState !== undefined) assign("providerState", patch.providerState);
    if (patch.providerConnectionStatus !== undefined) {
      assign("providerConnectionStatus", patch.providerConnectionStatus);
    }
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
    let changed = await reconcileMetaApiAccounts(state);
    const account = state.accounts.find((candidate) => candidate.id === accountId);

    if (!account) {
      if (changed) {
        await saveStateToDisk(state);
      }
      return null;
    }

    const sync = await syncAccountProviderRuntime(account);
    if (sync.changed) {
      changed = true;
    }
    if (changed) {
      await saveStateToDisk(state);
    }

    return toPublicAccount(account);
  });
};

export const getCopyTradeAccountByLoginServer = async (
  login: string,
  server: string,
  provider?: CopyTradeAccountProvider
): Promise<CopyTradeAccountPublic | null> => {
  return enqueue(async () => {
    const state = await loadState();
    let changed = await reconcileMetaApiAccounts(state);
    const normalizedLogin = normalizeLogin(login);
    const normalizedServer = normalizeServer(server).toLowerCase();
    const normalizedProvider = provider ? normalizeProvider(provider) : null;

    const account =
      state.accounts.find((candidate) => {
        const candidateProvider = normalizeProvider(candidate.provider);
        return (
          candidate.login === normalizedLogin &&
          candidate.server.trim().toLowerCase() === normalizedServer &&
          (!normalizedProvider || candidateProvider === normalizedProvider)
        );
      }) || null;

    if (!account) {
      if (changed) {
        await saveStateToDisk(state);
      }
      return null;
    }

    const sync = await syncAccountProviderRuntime(account);
    if (sync.changed) {
      changed = true;
    }
    if (changed) {
      await saveStateToDisk(state);
    }

    return toPublicAccount(account);
  });
};
