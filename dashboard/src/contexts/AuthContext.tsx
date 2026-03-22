"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

interface AuthContextType {
  user: User | null;
  tenantId: string | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshTenant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

const TENANT_CACHE_KEY = "omakase_tenantId";
const UID_CACHE_KEY = "omakase_uid";

async function fetchTenantId(uid: string): Promise<string | null> {
  try {
    const tenantsRef = collection(db, "tenants");
    const q = query(tenantsRef, where("ownerId", "==", uid));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const tid = snapshot.docs[0].id;
    try {
      localStorage.setItem(TENANT_CACHE_KEY, tid);
      localStorage.setItem(UID_CACHE_KEY, uid);
    } catch {}
    return tid;
  } catch (error) {
    console.error("fetchTenantId error:", error);
    return null;
  }
}

function getCachedTenantId(uid: string): string | null {
  try {
    if (localStorage.getItem(UID_CACHE_KEY) === uid) {
      return localStorage.getItem(TENANT_CACHE_KEY);
    }
  } catch {}
  return null;
}

function clearCache() {
  try {
    localStorage.removeItem(TENANT_CACHE_KEY);
    localStorage.removeItem(UID_CACHE_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTenant = useCallback(async () => {
    if (!user) return;
    const tid = await fetchTenantId(user.uid);
    setTenantId(tid);
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Use cache for instant render, then verify in background
        const cached = getCachedTenantId(firebaseUser.uid);
        if (cached) {
          setTenantId(cached);
          setLoading(false);
          // Verify cache in background
          fetchTenantId(firebaseUser.uid).then((tid) => {
            if (tid !== cached) setTenantId(tid);
          });
        } else {
          const tid = await fetchTenantId(firebaseUser.uid);
          setTenantId(tid);
          setLoading(false);
        }
      } else {
        setTenantId(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setTenantId(null);
    clearCache();
  };

  return (
    <AuthContext.Provider value={{ user, tenantId, loading, signIn, signOut, refreshTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
