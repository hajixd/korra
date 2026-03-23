import { NextResponse } from "next/server";
import { sendPushNotification } from "../../../../lib/firebaseServerNotifications";
import { getFirebaseUserDocument } from "../../../../lib/firebaseUserDocuments";
import { googleServiceAccountReady } from "../../../../lib/googleServiceAccount";
import { normalizeNotificationDevices } from "../../../../lib/notificationDevices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FirebaseLookupResponse = {
  users?: Array<{
    localId?: unknown;
    email?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ", 2);
  if (scheme !== "Bearer") {
    return "";
  }
  return String(token ?? "").trim();
};

const verifyFirebaseIdToken = async (idToken: string) => {
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

export async function POST(request: Request) {
  if (!googleServiceAccountReady) {
    return NextResponse.json(
      { ok: false, error: "Firebase Admin notifications are not configured." },
      { status: 503 }
    );
  }

  const idToken = getBearerToken(request);
  const authUser = await verifyFirebaseIdToken(idToken);
  if (!authUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const userDocument = await getFirebaseUserDocument(authUser.uid);
  const enabledDevices = normalizeNotificationDevices(userDocument?.data.notificationDevices).filter(
    (device) => device.enabled
  );

  if (enabledDevices.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No enabled notification devices are registered for this account." },
      { status: 400 }
    );
  }

  const displayName = String(userDocument?.data.displayName ?? "").trim();
  const label = displayName || authUser.email || "your account";
  const sentAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());

  await sendPushNotification({
    ownerUid: authUser.uid,
    title: "Korra test notification",
    body: `Sent from ${label} on desktop at ${sentAt}.`,
    link: "/",
    data: {
      eventType: "test_notification",
      sentAt
    }
  });

  return NextResponse.json({
    ok: true,
    deviceCount: enabledDevices.length
  });
}
