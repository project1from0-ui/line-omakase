"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export function useRequireAuth() {
  const { user, tenantId, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!tenantId) {
      router.replace("/setup");
    }
  }, [user, tenantId, loading, router]);

  return {
    user,
    tenantId,
    ready: !loading && !!user && !!tenantId,
  };
}
