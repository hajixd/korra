import MetaApi, { SynchronizationListener } from "metaapi.cloud-sdk/dist/index";

type MetaApiTradeSide = "BUY" | "SELL";

type MetaApiAccountLike = {
  id: string;
  login: string;
  server: string;
  name: string;
  state: string;
  connectionStatus: string;
  createdAt?: Date;
  deploy: () => Promise<unknown>;
  waitDeployed: (timeoutInSeconds?: number, intervalInMilliseconds?: number) => Promise<unknown>;
  waitConnected: (timeoutInSeconds?: number, intervalInMilliseconds?: number) => Promise<unknown>;
  reload: () => Promise<void>;
  update: (payload: Record<string, unknown>) => Promise<unknown>;
  remove: () => Promise<unknown>;
  undeploy: () => Promise<unknown>;
  getRPCConnection: () => MetaApiRpcConnectionLike;
  getStreamingConnection: () => MetaApiStreamingConnectionLike;
};

type MetaApiRpcConnectionLike = {
  connect: () => Promise<void>;
  waitSynchronized: (timeoutInSeconds?: number) => Promise<unknown>;
  close: () => Promise<void>;
  getAccountInformation: (options?: { refreshTerminalState?: boolean }) => Promise<{
    broker?: string;
    currency?: string;
    balance?: number;
    equity?: number;
    margin?: number;
    freeMargin?: number;
    marginLevel?: number;
    leverage?: number;
    tradeAllowed?: boolean;
  }>;
  getPositions: (options?: { refreshTerminalState?: boolean }) => Promise<
    Array<{
      id?: number | string;
      type?: string;
      symbol?: string;
      volume?: number;
      openPrice?: number;
      currentPrice?: number;
      profit?: number;
      time?: Date | string | number;
      comment?: string;
      stopLoss?: number;
      takeProfit?: number;
    }>
  >;
  getDealsByTimeRange: (
    startTime: Date,
    endTime: Date,
    offset?: number,
    limit?: number
  ) => Promise<{
    deals?: Array<{
      id?: string;
      type?: string;
      entryType?: string;
      positionId?: string;
      symbol?: string;
      time?: Date | string | number;
      price?: number;
      profit?: number;
      volume?: number;
      comment?: string;
    }>;
    synchronizing?: boolean;
  }>;
  createMarketBuyOrder: (
    symbol: string,
    volume: number,
    stopLoss?: number | null,
    takeProfit?: number | null,
    options?: { comment?: string }
  ) => Promise<{ numericCode?: number; stringCode?: string; message?: string; positionId?: string }>;
  createMarketSellOrder: (
    symbol: string,
    volume: number,
    stopLoss?: number | null,
    takeProfit?: number | null,
    options?: { comment?: string }
  ) => Promise<{ numericCode?: number; stringCode?: string; message?: string; positionId?: string }>;
  getPosition: (positionId: string) => Promise<{ openPrice?: number }>;
  closePosition: (positionId: string, options?: { comment?: string }) => Promise<{
    numericCode?: number;
    stringCode?: string;
    message?: string;
  }>;
};

type MetaApiStreamingConnectionLike = {
  connect: () => Promise<void>;
  waitSynchronized: (options?: {
    timeoutInSeconds?: number;
    intervalInMilliseconds?: number;
  }) => Promise<unknown>;
  close: () => Promise<void>;
  addSynchronizationListener: (listener: SynchronizationListener) => void;
  removeSynchronizationListener: (listener: SynchronizationListener) => void;
  terminalState: {
    accountInformation?: {
      broker?: string;
      currency?: string;
      balance?: number;
      equity?: number;
      tradeAllowed?: boolean;
    };
    positions?: Array<{
      profit?: number;
    }>;
  };
};

export type MetaApiAccountSnapshot = {
  id: string;
  login: string;
  server: string;
  name: string;
  state: string;
  connectionStatus: string;
  createdAt: number | null;
};

export type MetaApiDashboardPosition = {
  id: number;
  side: string;
  symbol: string;
  volume: number;
  openPrice: number | null;
  currentPrice: number | null;
  profit: number;
  time: number | null;
  comment: string | null;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type MetaApiDashboardDeal = {
  id: string;
  positionId: string | null;
  side: string;
  entryType: string;
  symbol: string;
  time: number | null;
  price: number | null;
  volume: number | null;
  profit: number;
  comment: string | null;
};

export type MetaApiAccountDashboardSnapshot = {
  providerAccountId: string;
  login: string;
  server: string;
  broker: string | null;
  currency: string;
  balance: number | null;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  leverage: number | null;
  tradeAllowed: boolean | null;
  openPositions: MetaApiDashboardPosition[];
  recentDeals: MetaApiDashboardDeal[];
  netOpenProfit: number;
  dayClosedPnl: number;
  lastSyncedAt: number;
};

export type MetaApiAccountSummarySnapshot = {
  providerAccountId: string;
  login: string;
  server: string;
  broker: string | null;
  currency: string;
  balance: number | null;
  equity: number | null;
  tradeAllowed: boolean | null;
  openPositionsCount: number;
  netOpenProfit: number;
  lastSyncedAt: number;
};

export type MetaApiAccountSummaryStreamHandle = {
  close: () => Promise<void>;
};

type EnsureMetaApiAccountInput = {
  existingAccountId?: string;
  login: string;
  password?: string;
  server: string;
  name?: string;
};

type MetaApiOrderInput = {
  providerAccountId?: string;
  credentials?: {
    login: string;
    password: string;
    server: string;
  };
  symbol: string;
  side: MetaApiTradeSide;
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string;
};

type MetaApiClosePositionInput = {
  providerAccountId?: string;
  credentials?: {
    login: string;
    password: string;
    server: string;
  };
  positionTicket: number;
  comment?: string;
};

let metaApiClientCache: MetaApi | null = null;
let metaApiTokenCache = "";
const METAAPI_ACCOUNT_LIST_CACHE_TTL_MS = 60_000;
const METAAPI_SUMMARY_CACHE_TTL_MS = 60_000;
const METAAPI_DASHBOARD_CACHE_TTL_MS = 60_000;

type TimedCacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const metaApiAccountListCache = new Map<string, TimedCacheEntry<MetaApiAccountSnapshot[]>>();
const metaApiSummaryCache = new Map<string, TimedCacheEntry<MetaApiAccountSummarySnapshot>>();
const metaApiDashboardCache = new Map<string, TimedCacheEntry<MetaApiAccountDashboardSnapshot>>();

const resolveMetaApiToken = (): string => {
  return (
    process.env.METAAPI_API_TOKEN ||
    process.env.METAAPI_TOKEN ||
    process.env.COPYTRADE_METAAPI_TOKEN ||
    ""
  ).trim();
};

const getMetaApiClient = (): MetaApi => {
  const token = resolveMetaApiToken();

  if (!token) {
    throw new Error("Missing METAAPI_API_TOKEN server env var.");
  }

  if (!metaApiClientCache || metaApiTokenCache !== token) {
    if (metaApiClientCache) {
      metaApiClientCache.close();
    }

    metaApiTokenCache = token;
    metaApiClientCache = new MetaApi(token, {
      application: "korra-copytrade"
    });
  }

  return metaApiClientCache;
};

const normalizeLogin = (value: string): string => value.trim();
const normalizeServer = (value: string): string => value.trim().toLowerCase();

const buildMetaApiCacheKey = (input: {
  providerAccountId?: string;
  credentials?: {
    login: string;
    server: string;
  };
}): string => {
  if (input.providerAccountId) {
    return `provider:${String(input.providerAccountId).trim()}`;
  }

  if (input.credentials) {
    return `credentials:${normalizeLogin(input.credentials.login)}@${normalizeServer(
      input.credentials.server
    )}`;
  }

  return "unknown";
};

const withTimedCache = async <T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  const existing = cache.get(key);

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value
      });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    expiresAt: now + ttlMs,
    promise
  });

  return promise;
};

const normalizeSymbol = (value: string): string => {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
  return normalized || "XAUUSD";
};

const toFiniteOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toTimestampMsOrNull = (value: unknown): number | null => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }

  return null;
};

const toAccountSnapshot = (account: MetaApiAccountLike): MetaApiAccountSnapshot => ({
  id: String(account.id),
  login: String(account.login),
  server: String(account.server),
  name: String(account.name || ""),
  state: String(account.state || "UNKNOWN"),
  connectionStatus: String(account.connectionStatus || "UNKNOWN"),
  createdAt: account.createdAt instanceof Date ? account.createdAt.getTime() : null
});

const buildSummarySnapshot = (
  account: MetaApiAccountLike,
  accountInformation: {
    broker?: string;
    currency?: string;
    balance?: number;
    equity?: number;
    tradeAllowed?: boolean;
  } | null | undefined,
  positionsResponse:
    | Array<{
        profit?: number;
      }>
    | null
    | undefined
): MetaApiAccountSummarySnapshot => {
  const positions = Array.isArray(positionsResponse) ? positionsResponse : [];
  const netOpenProfit = positions.reduce((sum, position) => {
    const profit = Number(position?.profit);
    return sum + (Number.isFinite(profit) ? profit : 0);
  }, 0);

  return {
    providerAccountId: String(account.id),
    login: String(account.login || ""),
    server: String(account.server || ""),
    broker:
      typeof accountInformation?.broker === "string" && accountInformation.broker.trim()
        ? accountInformation.broker
        : null,
    currency:
      typeof accountInformation?.currency === "string" && accountInformation.currency.trim()
        ? accountInformation.currency
        : "USD",
    balance: toFiniteOrNull(accountInformation?.balance),
    equity: toFiniteOrNull(accountInformation?.equity),
    tradeAllowed:
      typeof accountInformation?.tradeAllowed === "boolean"
        ? accountInformation.tradeAllowed
        : null,
    openPositionsCount: positions.length,
    netOpenProfit,
    lastSyncedAt: Date.now()
  };
};

const isNotFoundError = (error: unknown): boolean => {
  const message = String((error as Error)?.message || "").toLowerCase();
  const status = Number(
    (error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } })?.status ??
      (error as { statusCode?: unknown })?.statusCode ??
      (error as { response?: { status?: unknown } })?.response?.status
  );

  return status === 404 || message.includes("not found");
};

const hasTradeSuccessCode = (numericCode: number, stringCode: string): boolean => {
  if (numericCode === 0 || numericCode === 10025) {
    return true;
  }

  if (numericCode >= 10008 && numericCode <= 10010) {
    return true;
  }

  return (
    stringCode === "ERR_NO_ERROR" ||
    stringCode === "TRADE_RETCODE_PLACED" ||
    stringCode === "TRADE_RETCODE_DONE" ||
    stringCode === "TRADE_RETCODE_DONE_PARTIAL" ||
    stringCode === "TRADE_RETCODE_NO_CHANGES"
  );
};

const listMetaApiAccounts = async (): Promise<MetaApiAccountLike[]> => {
  const api = getMetaApiClient();
  const accounts = await api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
  return accounts as unknown as MetaApiAccountLike[];
};

const getMetaApiAccountById = async (accountId: string): Promise<MetaApiAccountLike | null> => {
  if (!accountId.trim()) {
    return null;
  }

  const api = getMetaApiClient();
  try {
    const account = await api.metatraderAccountApi.getAccount(accountId.trim());
    return account as unknown as MetaApiAccountLike;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

const findMetaApiAccountByLoginServer = async (
  login: string,
  server: string
): Promise<MetaApiAccountLike | null> => {
  const targetLogin = normalizeLogin(login);
  const targetServer = normalizeServer(server);
  const accounts = await listMetaApiAccounts();

  for (const account of accounts) {
    if (
      normalizeLogin(String(account.login || "")) === targetLogin &&
      normalizeServer(String(account.server || "")) === targetServer
    ) {
      return account;
    }
  }

  return null;
};

const ensureAccountDeployed = async (account: MetaApiAccountLike): Promise<void> => {
  if (account.state !== "DEPLOYED" && account.state !== "DEPLOYING") {
    await account.deploy();
  }

  try {
    await account.waitDeployed(120, 1500);
  } catch {
    // deployment can take longer than route/request budgets; status will be polled later.
  }

  await account.reload();
};

const resolveTradeAccount = async (input: {
  providerAccountId?: string;
  credentials?: { login: string; password: string; server: string };
}): Promise<MetaApiAccountLike> => {
  if (input.providerAccountId) {
    const byId = await getMetaApiAccountById(input.providerAccountId);
    if (byId) {
      return byId;
    }
  }

  if (!input.credentials) {
    throw new Error("Missing MetaApi account reference.");
  }

  const { login, server, password } = input.credentials;
  return ensureMetaApiAccount({
    login,
    server,
    password
  }).then(async (snapshot) => {
    const account = await getMetaApiAccountById(snapshot.id);
    if (!account) {
      throw new Error("MetaApi account could not be resolved.");
    }
    return account;
  });
};

const withRpcConnection = async <T>(
  account: MetaApiAccountLike,
  handler: (connection: MetaApiRpcConnectionLike) => Promise<T>
): Promise<T> => {
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized(60);

  try {
    return await handler(rpc);
  } finally {
    await rpc.close().catch(() => undefined);
  }
};

export const ensureMetaApiAccount = async (
  input: EnsureMetaApiAccountInput
): Promise<MetaApiAccountSnapshot> => {
  const login = normalizeLogin(input.login);
  const server = input.server.trim();
  const password = input.password ?? "";
  const name = (input.name || `Korra ${login}@${server}`).trim();

  if (!login || !server) {
    throw new Error("MT5 login and server are required for MetaApi.");
  }

  let account: MetaApiAccountLike | null = null;

  if (input.existingAccountId) {
    account = await getMetaApiAccountById(input.existingAccountId);
  }

  if (
    account &&
    (normalizeLogin(account.login) !== login || normalizeServer(account.server) !== normalizeServer(server))
  ) {
    if (!password) {
      throw new Error("Password is required when changing MT5 login/server.");
    }
    await account.remove().catch(() => undefined);
    account = null;
  }

  if (!account) {
    account = await findMetaApiAccountByLoginServer(login, server);
  }

  if (!account) {
    if (!password) {
      throw new Error("Password is required to provision a new MetaApi account.");
    }

    const api = getMetaApiClient();
    account = (await api.metatraderAccountApi.createAccount({
      name,
      login,
      password,
      server,
      platform: "mt5",
      type: "cloud-g2",
      magic: 20210213,
      reliability: "regular",
      tags: ["korra", "copytrade"],
      metadata: {
        source: "korra-copytrade"
      }
    })) as unknown as MetaApiAccountLike;
  } else if (password || account.name !== name || normalizeServer(account.server) !== normalizeServer(server)) {
    await account.update({
      name,
      server,
      ...(password ? { password } : {})
    });
    await account.reload();
  }

  await ensureAccountDeployed(account);
  return toAccountSnapshot(account);
};

export const getMetaApiAccountSnapshotById = async (
  accountId: string
): Promise<MetaApiAccountSnapshot | null> => {
  const account = await getMetaApiAccountById(accountId);
  return account ? toAccountSnapshot(account) : null;
};

export const listMetaApiAccountSnapshots = async (): Promise<MetaApiAccountSnapshot[]> => {
  return withTimedCache(
    metaApiAccountListCache,
    "all",
    METAAPI_ACCOUNT_LIST_CACHE_TTL_MS,
    async () => {
      const accounts = await listMetaApiAccounts();
      return accounts.map(toAccountSnapshot);
    }
  );
};

export const deleteMetaApiAccountById = async (accountId: string): Promise<void> => {
  const account = await getMetaApiAccountById(accountId);
  if (!account) {
    return;
  }

  await account.remove();
};

export const undeployMetaApiAccountById = async (accountId: string): Promise<void> => {
  const account = await getMetaApiAccountById(accountId);
  if (!account) {
    return;
  }

  await account.undeploy().catch(() => undefined);
};

export const openMetaApiAccountSummaryStream = async (
  input: {
    providerAccountId?: string;
    credentials?: {
      login: string;
      password: string;
      server: string;
    };
  },
  onUpdate: (snapshot: MetaApiAccountSummarySnapshot) => void
): Promise<MetaApiAccountSummaryStreamHandle> => {
  const account = await resolveTradeAccount({
    providerAccountId: input.providerAccountId,
    credentials: input.credentials
  });

  await ensureAccountDeployed(account);

  const connection = account.getStreamingConnection();
  await connection.connect();
  await connection.waitSynchronized({
    timeoutInSeconds: 60,
    intervalInMilliseconds: 1000
  });

  let closed = false;
  let lastAccountInformation:
    | {
        broker?: string;
        currency?: string;
        balance?: number;
        equity?: number;
        tradeAllowed?: boolean;
      }
    | null
    | undefined = connection.terminalState?.accountInformation;
  let lastStreamEquity = toFiniteOrNull(lastAccountInformation?.equity);

  const emitSnapshot = () => {
    if (closed) {
      return;
    }

    const terminalAccountInformation = connection.terminalState?.accountInformation;
    const mergedAccountInformation = {
      ...(lastAccountInformation || {}),
      ...(terminalAccountInformation || {})
    };
    const effectiveEquity =
      lastStreamEquity ??
      toFiniteOrNull(terminalAccountInformation?.equity) ??
      toFiniteOrNull(lastAccountInformation?.equity);

    if (effectiveEquity !== null) {
      mergedAccountInformation.equity = effectiveEquity;
    }

    onUpdate(
      buildSummarySnapshot(
        account,
        mergedAccountInformation,
        connection.terminalState?.positions
      )
    );
  };

  class SummaryStreamListener extends SynchronizationListener {
    async onConnected(_instanceIndex?: string, _replicas?: number): Promise<void> {
      lastAccountInformation = connection.terminalState?.accountInformation ?? lastAccountInformation;
      emitSnapshot();
    }

    async onDisconnected(_instanceIndex?: string): Promise<void> {
      emitSnapshot();
    }

    async onBrokerConnectionStatusChanged(
      _instanceIndex?: string,
      _connected?: boolean
    ): Promise<void> {
      emitSnapshot();
    }

    async onAccountInformationUpdated(
      _instanceIndex?: string,
      accountInformation?: {
        broker?: string;
        currency?: string;
        balance?: number;
        equity?: number;
        tradeAllowed?: boolean;
      }
    ): Promise<void> {
      lastAccountInformation = {
        ...(lastAccountInformation || {}),
        ...(accountInformation || {})
      };
      const nextEquity = toFiniteOrNull(accountInformation?.equity);
      if (nextEquity !== null) {
        lastStreamEquity = nextEquity;
      }
      emitSnapshot();
    }

    async onPositionsReplaced(
      _instanceIndex?: string,
      _positions?: Array<{ profit?: number }>
    ): Promise<void> {
      emitSnapshot();
    }

    async onPositionsUpdated(
      _instanceIndex?: string,
      _positions?: Array<{ profit?: number }>,
      _removedPositionIds?: string[]
    ): Promise<void> {
      emitSnapshot();
    }

    async onPositionUpdated(
      _instanceIndex?: string,
      _position?: { profit?: number }
    ): Promise<void> {
      emitSnapshot();
    }

    async onPositionRemoved(_instanceIndex?: string, _positionId?: string): Promise<void> {
      emitSnapshot();
    }

    async onSymbolPriceUpdated(
      _instanceIndex?: string,
      price?: unknown
    ): Promise<void> {
      const nextEquity = toFiniteOrNull(
        (price as { equity?: number } | null | undefined)?.equity
      );
      if (nextEquity !== null) {
        lastStreamEquity = nextEquity;
      }
      emitSnapshot();
    }

    async onSymbolPricesUpdated(
      _instanceIndex?: string,
      _prices?: Array<unknown>,
      equity?: number
    ): Promise<void> {
      const nextEquity = toFiniteOrNull(equity);
      if (nextEquity !== null) {
        lastStreamEquity = nextEquity;
      }
      emitSnapshot();
    }
  }

  const listener = new SummaryStreamListener();
  connection.addSynchronizationListener(listener);
  emitSnapshot();

  return {
    close: async () => {
      if (closed) {
        return;
      }

      closed = true;
      connection.removeSynchronizationListener(listener);
      await connection.close().catch(() => undefined);
    }
  };
};

export const openMetaApiMarketPosition = async (
  input: MetaApiOrderInput
): Promise<{ positionTicket: number; filledPrice: number | null; providerAccountId: string }> => {
  const account = await resolveTradeAccount({
    providerAccountId: input.providerAccountId,
    credentials: input.credentials
  });

  await ensureAccountDeployed(account);

  return withRpcConnection(account, async (rpc) => {
    const symbol = normalizeSymbol(input.symbol);
    const side = input.side;
    const volume = Math.max(0.01, Number(input.volume) || 0.01);
    const stopLoss =
      typeof input.stopLoss === "number" && Number.isFinite(input.stopLoss) ? input.stopLoss : undefined;
    const takeProfit =
      typeof input.takeProfit === "number" && Number.isFinite(input.takeProfit)
        ? input.takeProfit
        : undefined;
    const comment = input.comment?.trim() ? input.comment.trim().slice(0, 26) : undefined;

    const result =
      side === "BUY"
        ? await rpc.createMarketBuyOrder(symbol, volume, stopLoss, takeProfit, { comment })
        : await rpc.createMarketSellOrder(symbol, volume, stopLoss, takeProfit, { comment });

    const numericCode = Number(result.numericCode ?? Number.NaN);
    const stringCode = String(result.stringCode ?? "");
    if (!hasTradeSuccessCode(numericCode, stringCode)) {
      throw new Error(result.message || `MetaApi rejected trade (${stringCode || numericCode}).`);
    }

    const positionTicket = Math.trunc(Number(result.positionId ?? 0));
    if (!Number.isFinite(positionTicket) || positionTicket <= 0) {
      throw new Error("MetaApi did not return a valid position id.");
    }

    let filledPrice: number | null = null;
    try {
      const position = await rpc.getPosition(String(positionTicket));
      const openPrice = Number(position?.openPrice);
      filledPrice = Number.isFinite(openPrice) ? openPrice : null;
    } catch {
      filledPrice = null;
    }

    return {
      positionTicket,
      filledPrice,
      providerAccountId: account.id
    };
  });
};

export const closeMetaApiPosition = async (input: MetaApiClosePositionInput): Promise<void> => {
  const account = await resolveTradeAccount({
    providerAccountId: input.providerAccountId,
    credentials: input.credentials
  });

  await ensureAccountDeployed(account);

  await withRpcConnection(account, async (rpc) => {
    const response = await rpc.closePosition(String(Math.trunc(input.positionTicket)), {
      ...(input.comment?.trim() ? { comment: input.comment.trim().slice(0, 26) } : {})
    });

    const numericCode = Number(response.numericCode ?? Number.NaN);
    const stringCode = String(response.stringCode ?? "");
    if (!hasTradeSuccessCode(numericCode, stringCode)) {
      throw new Error(response.message || `MetaApi rejected close request (${stringCode || numericCode}).`);
    }
  });
};

export const getMetaApiAccountSummary = async (input: {
  providerAccountId?: string;
  credentials?: {
    login: string;
    password: string;
    server: string;
  };
}): Promise<MetaApiAccountSummarySnapshot> => {
  const cacheKey = `${buildMetaApiCacheKey(input)}:summary`;

  return withTimedCache(metaApiSummaryCache, cacheKey, METAAPI_SUMMARY_CACHE_TTL_MS, async () => {
    const account = await resolveTradeAccount({
      providerAccountId: input.providerAccountId,
      credentials: input.credentials
    });

    await ensureAccountDeployed(account);

    return withRpcConnection(account, async (rpc) => {
      const [accountInformation, positionsResponse] = await Promise.all([
        rpc
          .getAccountInformation({ refreshTerminalState: true })
          .catch((): Awaited<ReturnType<MetaApiRpcConnectionLike["getAccountInformation"]>> => ({})),
        rpc.getPositions({ refreshTerminalState: true }).catch(() => [])
      ]);
      return buildSummarySnapshot(account, accountInformation, positionsResponse);
    });
  });
};

export const getMetaApiAccountDashboard = async (input: {
  providerAccountId?: string;
  credentials?: {
    login: string;
    password: string;
    server: string;
  };
  dealsLookbackHours?: number;
  dealsLimit?: number;
}): Promise<MetaApiAccountDashboardSnapshot> => {
  const lookbackHours = Math.max(1, Math.min(24 * 31, Math.trunc(input.dealsLookbackHours ?? 24)));
  const dealsLimit = Math.max(1, Math.min(500, Math.trunc(input.dealsLimit ?? 60)));
  const cacheKey = `${buildMetaApiCacheKey(input)}:dashboard:${lookbackHours}:${dealsLimit}`;

  return withTimedCache(
    metaApiDashboardCache,
    cacheKey,
    METAAPI_DASHBOARD_CACHE_TTL_MS,
    async () => {
      const account = await resolveTradeAccount({
        providerAccountId: input.providerAccountId,
        credentials: input.credentials
      });

      await ensureAccountDeployed(account);

      return withRpcConnection(account, async (rpc) => {
    const now = Date.now();
    const startTime = new Date(now - lookbackHours * 60 * 60 * 1000);
    const endTime = new Date(now);

    const [accountInformation, positionsResponse, dealsResponse] = await Promise.all([
      rpc
        .getAccountInformation({ refreshTerminalState: true })
        .catch((): Awaited<ReturnType<MetaApiRpcConnectionLike["getAccountInformation"]>> => ({})),
      rpc.getPositions({ refreshTerminalState: true }).catch(() => []),
      rpc.getDealsByTimeRange(startTime, endTime, 0, dealsLimit).catch(() => ({ deals: [] }))
    ]);

    const positions = Array.isArray(positionsResponse) ? positionsResponse : [];
    const deals = Array.isArray(dealsResponse?.deals) ? dealsResponse.deals : [];

    const openPositions: MetaApiDashboardPosition[] = positions
      .map((position) => {
        const idRaw = Number(position?.id);
        const id = Number.isFinite(idRaw) ? Math.trunc(idRaw) : 0;
        const sideRaw = String(position?.type || "").toUpperCase();
        const side =
          sideRaw === "POSITION_TYPE_BUY"
            ? "BUY"
            : sideRaw === "POSITION_TYPE_SELL"
              ? "SELL"
              : sideRaw.replace("POSITION_TYPE_", "") || "N/A";
        const profit = Number(position?.profit);

        return {
          id,
          side,
          symbol: String(position?.symbol || "N/A"),
          volume: Number(position?.volume) || 0,
          openPrice: toFiniteOrNull(position?.openPrice),
          currentPrice: toFiniteOrNull(position?.currentPrice),
          profit: Number.isFinite(profit) ? profit : 0,
          time: toTimestampMsOrNull(position?.time),
          comment: typeof position?.comment === "string" && position.comment.trim() ? position.comment : null,
          stopLoss: toFiniteOrNull(position?.stopLoss),
          takeProfit: toFiniteOrNull(position?.takeProfit)
        } satisfies MetaApiDashboardPosition;
      })
      .filter((position) => position.id > 0)
      .sort((left, right) => (right.time ?? 0) - (left.time ?? 0));

    const recentDeals: MetaApiDashboardDeal[] = deals
      .map((deal) => {
        const rawType = String(deal?.type || "").toUpperCase();
        let side = "N/A";
        if (rawType.includes("BUY")) {
          side = "BUY";
        } else if (rawType.includes("SELL")) {
          side = "SELL";
        }

        const profit = Number(deal?.profit);
        return {
          id: String(deal?.id || ""),
          positionId:
            typeof deal?.positionId === "string" && deal.positionId.trim()
              ? deal.positionId
              : null,
          side,
          entryType: String(deal?.entryType || "N/A"),
          symbol: String(deal?.symbol || "N/A"),
          time: toTimestampMsOrNull(deal?.time),
          price: toFiniteOrNull(deal?.price),
          volume: toFiniteOrNull(deal?.volume),
          profit: Number.isFinite(profit) ? profit : 0,
          comment: typeof deal?.comment === "string" && deal.comment.trim() ? deal.comment : null
        } satisfies MetaApiDashboardDeal;
      })
      .filter((deal) => deal.id.length > 0)
      .sort((left, right) => (right.time ?? 0) - (left.time ?? 0))
      .slice(0, dealsLimit);

    const netOpenProfit = openPositions.reduce((sum, position) => sum + (Number(position.profit) || 0), 0);
    const dayClosedPnl = recentDeals.reduce((sum, deal) => {
      const entry = deal.entryType.toUpperCase();
      return entry.includes("OUT") ? sum + (Number(deal.profit) || 0) : sum;
    }, 0);

    return {
      providerAccountId: String(account.id),
      login: String(account.login || ""),
      server: String(account.server || ""),
      broker:
        typeof accountInformation?.broker === "string" && accountInformation.broker.trim()
          ? accountInformation.broker
          : null,
      currency:
        typeof accountInformation?.currency === "string" && accountInformation.currency.trim()
          ? accountInformation.currency
          : "USD",
      balance: toFiniteOrNull(accountInformation?.balance),
      equity: toFiniteOrNull(accountInformation?.equity),
      margin: toFiniteOrNull(accountInformation?.margin),
      freeMargin: toFiniteOrNull(accountInformation?.freeMargin),
      marginLevel: toFiniteOrNull(accountInformation?.marginLevel),
      leverage: toFiniteOrNull(accountInformation?.leverage),
      tradeAllowed: typeof accountInformation?.tradeAllowed === "boolean" ? accountInformation.tradeAllowed : null,
      openPositions,
      recentDeals,
      netOpenProfit,
      dayClosedPnl,
      lastSyncedAt: Date.now()
    } satisfies MetaApiAccountDashboardSnapshot;
      });
    }
  );
};
