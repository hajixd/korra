import { createSign } from "node:crypto";

type GoogleAccessTokenResult = {
  accessToken: string;
  expiresAt: number;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const serviceAccountProjectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
  process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
  "";
const serviceAccountClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || "";
const serviceAccountPrivateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

export const googleServiceAccountReady =
  serviceAccountProjectId.length > 0 &&
  serviceAccountClientEmail.length > 0 &&
  serviceAccountPrivateKey.length > 0;

export const googleServiceAccountMissingEnvVars = [
  serviceAccountProjectId ? null : "FIREBASE_ADMIN_PROJECT_ID",
  serviceAccountClientEmail ? null : "FIREBASE_ADMIN_CLIENT_EMAIL",
  serviceAccountPrivateKey ? null : "FIREBASE_ADMIN_PRIVATE_KEY"
].filter(Boolean) as string[];

const tokenCache = new Map<string, GoogleAccessTokenResult>();

const toBase64Url = (value: string) => Buffer.from(value).toString("base64url");

const signJwt = (header: Record<string, unknown>, payload: Record<string, unknown>) => {
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(serviceAccountPrivateKey).toString("base64url");
  return `${unsignedToken}.${signature}`;
};

export const getGoogleServiceAccountProjectId = () => serviceAccountProjectId;

export const getGoogleAccessToken = async (scopes: string[]): Promise<GoogleAccessTokenResult | null> => {
  if (!googleServiceAccountReady) {
    return null;
  }

  const scopeKey = scopes.slice().sort().join(" ");
  const cached = tokenCache.get(scopeKey);
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) {
    return cached;
  }

  const issuedAt = Math.floor(now / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccountClientEmail,
      scope: scopeKey,
      aud: GOOGLE_TOKEN_URL,
      exp: issuedAt + 3600,
      iat: issuedAt
    }
  );

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    throw new Error(`Google access token request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  const accessToken = String(payload.access_token ?? "").trim();
  const expiresIn = Math.max(300, Math.trunc(Number(payload.expires_in ?? 3600)));

  if (!accessToken) {
    throw new Error("Google access token response did not include an access token.");
  }

  const result = {
    accessToken,
    expiresAt: now + expiresIn * 1000
  };
  tokenCache.set(scopeKey, result);
  return result;
};
