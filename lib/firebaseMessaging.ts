import { deleteToken, getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { getFirebaseClientApp } from "./firebase";

const webPushVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || "";

let supportPromise: Promise<boolean> | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;

export const isFirebaseMessagingSupported = async (): Promise<boolean> => {
  if (typeof window === "undefined") {
    return false;
  }

  if (!supportPromise) {
    supportPromise = isSupported().catch(() => false);
  }

  return supportPromise;
};

export const getFirebaseMessagingClient = async (): Promise<Messaging | null> => {
  if (messagingPromise) {
    return messagingPromise;
  }

  messagingPromise = (async () => {
    const supported = await isFirebaseMessagingSupported();
    if (!supported) {
      return null;
    }

    const app = getFirebaseClientApp();
    if (!app) {
      return null;
    }

    return getMessaging(app);
  })();

  return messagingPromise;
};

export const registerNotificationServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/"
  });
};

export const requestFirebaseMessagingToken = async (): Promise<string | null> => {
  if (typeof window === "undefined" || !webPushVapidKey) {
    return null;
  }

  const messaging = await getFirebaseMessagingClient();
  if (!messaging) {
    return null;
  }

  const registration = await registerNotificationServiceWorker();
  if (!registration) {
    return null;
  }

  const token = await getToken(messaging, {
    vapidKey: webPushVapidKey,
    serviceWorkerRegistration: registration
  });

  return token || null;
};

export const deleteFirebaseMessagingToken = async (): Promise<void> => {
  const messaging = await getFirebaseMessagingClient();
  if (!messaging) {
    return;
  }

  await deleteToken(messaging);
};

export const subscribeToForegroundMessages = async (
  listener: Parameters<typeof onMessage>[1]
): Promise<(() => void) | null> => {
  const messaging = await getFirebaseMessagingClient();
  if (!messaging) {
    return null;
  }

  return onMessage(messaging, listener);
};
