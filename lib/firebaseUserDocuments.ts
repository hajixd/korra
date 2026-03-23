import { getGoogleAccessToken, getGoogleServiceAccountProjectId, googleServiceAccountReady } from "./googleServiceAccount";

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/datastore"
];

const parseFirestoreValue = (value: FirestoreValue | undefined): unknown => {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return Array.isArray(value.arrayValue.values)
      ? value.arrayValue.values.map((entry) => parseFirestoreValue(entry))
      : [];
  }
  if ("mapValue" in value) {
    const fields = value.mapValue.fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, fieldValue]) => [key, parseFirestoreValue(fieldValue)])
    );
  }

  return null;
};

const serializeFirestoreValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(Math.trunc(value)) }
      : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => serializeFirestoreValue(entry))
      }
    };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, serializeFirestoreValue(entry)])
        )
      }
    };
  }

  return { stringValue: String(value) };
};

const getAuthHeader = async () => {
  const token = await getGoogleAccessToken(GOOGLE_SCOPES);
  if (!token) {
    return null;
  }

  return {
    Authorization: `Bearer ${token.accessToken}`
  };
};

const getProjectId = () => getGoogleServiceAccountProjectId();

export const listFirebaseUserDocuments = async (): Promise<
  Array<{ uid: string; data: Record<string, unknown> }>
> => {
  if (!googleServiceAccountReady) {
    return [];
  }

  const authHeader = await getAuthHeader();
  const projectId = getProjectId();
  if (!authHeader || !projectId) {
    return [];
  }

  const output: Array<{ uid: string; data: Record<string, unknown> }> = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users`
    );
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        ...authHeader
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Failed to list user docs (${response.status}).`);
    }

    const payload = (await response.json()) as {
      documents?: FirestoreDocument[];
      nextPageToken?: string;
    };
    output.push(
      ...(payload.documents ?? []).map((document) => {
        const name = String(document.name ?? "");
        const uid = name.split("/").pop() ?? "";
        return {
          uid,
          data: parseFirestoreValue({ mapValue: { fields: document.fields ?? {} } }) as Record<
            string,
            unknown
          >
        };
      })
    );
    pageToken = String(payload.nextPageToken ?? "").trim();
  } while (pageToken);

  return output;
};

export const getFirebaseUserDocument = async (
  uid: string
): Promise<{ uid: string; data: Record<string, unknown> } | null> => {
  if (!googleServiceAccountReady || !uid) {
    return null;
  }

  const authHeader = await getAuthHeader();
  const projectId = getProjectId();
  if (!authHeader || !projectId) {
    return null;
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    {
      headers: {
        ...authHeader
      },
      cache: "no-store"
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch user doc (${response.status}).`);
  }

  const document = (await response.json()) as FirestoreDocument;
  return {
    uid,
    data: parseFirestoreValue({ mapValue: { fields: document.fields ?? {} } }) as Record<
      string,
      unknown
    >
  };
};

export const patchFirebaseUserDocument = async (
  uid: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const authHeader = await getAuthHeader();
  const projectId = getProjectId();
  if (!authHeader || !projectId || !uid || Object.keys(fields).length === 0) {
    return;
  }

  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");

  await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}?${updateMask}`,
    {
      method: "PATCH",
      headers: {
        ...authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, serializeFirestoreValue(value)])
        )
      })
    }
  );
};
