import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { getFunctions, Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let _app: FirebaseApp | undefined;
let _db: Firestore | undefined;
let _auth: Auth | undefined;
let _functions: Functions | undefined;

function getFirebaseApp() {
  if (!_app) {
    _app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

export const db: Firestore = new Proxy({} as Firestore, {
  get(_, prop) { if (!_db) _db = getFirestore(getFirebaseApp()); return (_db as unknown as Record<string, unknown>)[prop as string]; },
});

export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) { if (!_auth) _auth = getAuth(getFirebaseApp()); return (_auth as unknown as Record<string, unknown>)[prop as string]; },
});

export const functions: Functions = new Proxy({} as Functions, {
  get(_, prop) { if (!_functions) _functions = getFunctions(getFirebaseApp(), "asia-northeast1"); return (_functions as unknown as Record<string, unknown>)[prop as string]; },
});
