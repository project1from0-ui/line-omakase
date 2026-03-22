import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function getApp_() {
  return !getApps().length ? initializeApp(firebaseConfig) : getApp();
}

export function getDb() {
  return getFirestore(getApp_());
}

export function getAuth_() {
  return getAuth(getApp_());
}

export function getFunctions_() {
  return getFunctions(getApp_(), "asia-northeast1");
}

// Eager init only in browser (not during SSR/build)
const isClient = typeof window !== "undefined";

export const db = isClient ? getDb() : (null as unknown as ReturnType<typeof getDb>);
export const auth = isClient ? getAuth_() : (null as unknown as ReturnType<typeof getAuth_>);
export const functions = isClient ? getFunctions_() : (null as unknown as ReturnType<typeof getFunctions_>);
