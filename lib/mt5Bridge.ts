import {
  closeMetaApiPosition,
  ensureMetaApiAccount,
  openMetaApiMarketPosition
} from "./metaApiCloud";

export type Mt5Credentials = {
  login: string;
  password: string;
  server: string;
};

export type Mt5OrderSide = "BUY" | "SELL";

export const verifyMt5Credentials = async (
  credentials: Mt5Credentials
): Promise<{ ok: true } | { ok: false; message: string }> => {
  try {
    const snapshot = await ensureMetaApiAccount({
      login: credentials.login,
      password: credentials.password,
      server: credentials.server
    });

    if (snapshot.connectionStatus !== "CONNECTED") {
      return {
        ok: false,
        message: `MetaApi account is ${snapshot.connectionStatus}. Check login/password/server and try again.`
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).message || "Failed to validate MT5 credentials via MetaApi."
    };
  }
};

export const openMt5Position = async (params: {
  credentials: Mt5Credentials;
  providerAccountId?: string;
  symbol: string;
  side: Mt5OrderSide;
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string;
}): Promise<{ positionTicket: number; filledPrice?: number | null; providerAccountId: string }> => {
  const result = await openMetaApiMarketPosition({
    providerAccountId: params.providerAccountId,
    credentials: params.credentials,
    symbol: params.symbol,
    side: params.side,
    volume: params.volume,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
    comment: params.comment
  });

  return {
    positionTicket: result.positionTicket,
    filledPrice: result.filledPrice,
    providerAccountId: result.providerAccountId
  };
};

export const closeMt5Position = async (params: {
  credentials: Mt5Credentials;
  providerAccountId?: string;
  symbol: string;
  positionTicket: number;
  comment?: string;
}): Promise<void> => {
  await closeMetaApiPosition({
    providerAccountId: params.providerAccountId,
    credentials: params.credentials,
    positionTicket: params.positionTicket,
    comment: params.comment
  });
};
