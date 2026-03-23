"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../src/lib/firebase";
import { useAuth } from "../../src/contexts/AuthContext";
import { useToast } from "../../src/components/Toast";

export default function SetupPage() {
  const { user, tenantId, loading, refreshTenant, signOut } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [channelSecret, setChannelSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (tenantId) router.replace("/");
  }, [user, tenantId, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "setupTenant");
      await fn({ channelSecret, channelAccessToken: accessToken });
      await refreshTenant();
      showToast("連携しました");
      router.replace("/");
    } catch (err: any) {
      setError(err?.message || "エラーが発生しました");
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
            <h1 className="text-lg font-bold text-slate-800">LINE Bot 連携</h1>
            <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
          </div>
          <button onClick={signOut} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            ログアウト
          </button>
        </div>

        {/* Guide */}
        <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
          <p className="text-xs font-semibold text-slate-600">LINE Developers コンソールで確認できる2つの値を入力してください</p>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">① <span className="font-medium">Basic settings タブ</span> → Channel secret</p>
            <p className="text-xs text-slate-500">② <span className="font-medium">Messaging API タブ</span> → Channel access token（「発行」で生成）</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Channel Secret</label>
            <input
              type="password"
              value={channelSecret}
              onChange={(e) => setChannelSecret(e.target.value)}
              required
              placeholder="32文字の英数字"
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
              placeholder="長い英数字の文字列"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !channelSecret || !accessToken}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
          >
            {isSubmitting ? "連携中..." : "連携する"}
          </button>
        </form>
      </div>
    </div>
  );
}
