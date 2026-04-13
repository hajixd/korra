export type FirebaseRequestAuthUser = {
  uid: string;
  email: string;
};

type FirebaseLookupResponse = {
  users?: Array<{
    localId?: unknown;
    email?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

export const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ", 2);
  if (scheme !== "Bearer") {
    return "";
  }
  return String(token ?? "").trim();
};

export const verifyFirebaseIdToken = async (
  idToken: string
): Promise<FirebaseRequestAuthUser | null> => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "";
  if (!apiKey || !idToken) {
    return null;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        idToken
      })
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as FirebaseLookupResponse;
  const user = payload.users?.[0];
  const uid = String(user?.localId ?? "").trim();
  if (!uid) {
    return null;
  }

  return {
    uid,
    email: String(user?.email ?? "").trim()
  };
};
