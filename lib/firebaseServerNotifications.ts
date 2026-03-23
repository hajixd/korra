import {
  getGoogleAccessToken,
  getGoogleServiceAccountProjectId,
  googleServiceAccountReady
} from "./googleServiceAccount";
import {
  getFirebaseUserDocument,
  listFirebaseUserDocuments,
  patchFirebaseUserDocument
} from "./firebaseUserDocuments";
import { normalizeNotificationDevices, removeNotificationDevice } from "./notificationDevices";

type PushNotificationPayload = {
  ownerUid?: string | null;
  targetTokens?: string[];
  title: string;
  body: string;
  link?: string;
  data?: Record<string, string>;
};

const fetchUserDocuments = async (ownerUid?: string | null): Promise<Array<{ uid: string; data: Record<string, unknown> }>> => {
  if (!googleServiceAccountReady) {
    return [];
  }

  if (ownerUid) {
    const document = await getFirebaseUserDocument(ownerUid);
    if (!document) {
      return [];
    }
    return [
      document
    ];
  }

  return listFirebaseUserDocuments();
};

const patchUserNotificationDevices = async (uid: string, notificationDevices: unknown) => {
  await patchFirebaseUserDocument(uid, {
    notificationDevices
  });
};

const sendToToken = async (token: string, payload: PushNotificationPayload) => {
  const [projectId, googleAccessToken] = await Promise.all([
    getGoogleServiceAccountProjectId(),
    getGoogleAccessToken([
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/firebase.messaging"
    ])
  ]);
  const authHeader = googleAccessToken
    ? { Authorization: `Bearer ${googleAccessToken.accessToken}` }
    : null;
  if (!authHeader || !projectId) {
    return { ok: false, unregistered: false };
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body
          },
          data: {
            ...(payload.data ?? {}),
            link: payload.link ?? "/settings/account"
          },
          webpush: {
            fcmOptions: {
              link: payload.link ?? "/settings/account"
            },
            notification: {
              title: payload.title,
              body: payload.body,
              icon: "/favicon.ico",
              badge: "/favicon.ico"
            }
          }
        }
      })
    }
  );

  if (response.ok) {
    return { ok: true, unregistered: false };
  }

  const bodyText = await response.text();
  const normalized = bodyText.toUpperCase();
  return {
    ok: false,
    unregistered: normalized.includes("UNREGISTERED") || normalized.includes("NOT_FOUND")
  };
};

export const sendPushNotification = async (payload: PushNotificationPayload): Promise<void> => {
  if (!googleServiceAccountReady) {
    return;
  }

  const userDocs = await fetchUserDocuments(payload.ownerUid);
  for (const userDoc of userDocs) {
    const devices = normalizeNotificationDevices(userDoc.data.notificationDevices);
    if (devices.length === 0) {
      continue;
    }

    const targetTokenSet =
      Array.isArray(payload.targetTokens) && payload.targetTokens.length > 0
        ? new Set(
            payload.targetTokens
              .map((token) => String(token).trim())
              .filter((token) => token.length > 0)
          )
        : null;

    const staleTokens: string[] = [];
    for (const device of devices) {
      if (!device.enabled) {
        continue;
      }
      if (targetTokenSet && !targetTokenSet.has(device.token)) {
        continue;
      }

      const result = await sendToToken(device.token, payload);
      if (!result.ok && result.unregistered) {
        staleTokens.push(device.token);
      }
    }

    if (staleTokens.length > 0) {
      let nextDevices = devices;
      for (const staleToken of staleTokens) {
        nextDevices = removeNotificationDevice(nextDevices, staleToken);
      }
      await patchUserNotificationDevices(userDoc.uid, nextDevices);
    }
  }
};
