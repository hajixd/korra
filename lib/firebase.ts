import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const firebaseClientConfigReady = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim().length > 0
);

export const firebaseClientMissingEnvVars = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== "string" || value.trim().length === 0)
  .map(([key]) => key);

let firebaseAppSingleton: FirebaseApp | null = null;
let firebaseAuthSingleton: Auth | null = null;
let firebaseDbSingleton: Firestore | null = null;

export const getFirebaseClientApp = (): FirebaseApp | null => {
  if (!firebaseClientConfigReady) {
    return null;
  }

  if (firebaseAppSingleton) {
    return firebaseAppSingleton;
  }

  firebaseAppSingleton = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return firebaseAppSingleton;
};

export const getFirebaseClientAuth = (): Auth | null => {
  if (firebaseAuthSingleton) {
    return firebaseAuthSingleton;
  }

  const app = getFirebaseClientApp();
  if (!app) {
    return null;
  }

  firebaseAuthSingleton = getAuth(app);
  return firebaseAuthSingleton;
};

export const getFirebaseClientDb = (): Firestore | null => {
  if (firebaseDbSingleton) {
    return firebaseDbSingleton;
  }

  const app = getFirebaseClientApp();
  if (!app) {
    return null;
  }

  firebaseDbSingleton = getFirestore(app);
  return firebaseDbSingleton;
};
