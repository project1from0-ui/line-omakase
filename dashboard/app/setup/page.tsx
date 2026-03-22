"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../src/lib/firebase";
import { useAuth } from "../../src/contexts/AuthContext";
import { useToast } from "../../src/components/Toast";

export default function SetupPage() {
  const { user, tenantId, loading, refreshTenant, signOut } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [botUserId, setBotUserId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (tenantId) {
      router.replace("/");
    }
  }, [user, tenantId, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    try {
      await setDoc(doc(db, "tenants", botUserId), {
        ownerId: user.uid,
        lineChannelSecret: channelSecret,
        lineAccessToken: accessToken,
        createdAt: new Date(),
      });
      await refreshTenant();
      router.replace("/");
    } catch (error) {
      console.error("セットアップエラー:", error);
      showToast("保存に失敗しました。入力内容を確認してください。", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !user || tenantId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-slate-800">LINE Bot セットアップ</h1>
            <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ログアウト
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bot User ID</label>
            <input
              type="text"
              value={botUserId}
              onChange={(e) => setBotUserId(e.target.value)}
              placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-[11px] text-slate-400 mt-1">LINE Developers コンソール &gt; Bot 基本情報で確認できます</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Channel Secret</label>
            <input
              type="password"
              value={channelSecret}
              onChange={(e) => setChannelSecret(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Channel Access Token</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            {isSubmitting ? "保存中..." : "セットアップを完了"}
          </button>
        </form>
      </div>
    </div>
  );
}
