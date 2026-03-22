"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "../../src/lib/firebase";
import { functions } from "../../src/lib/firebase";
import { useRequireAuth } from "../../src/hooks/useRequireAuth";
import { useAuth } from "../../src/contexts/AuthContext";
import { useToast } from "../../src/components/Toast";
import Link from "next/link";

export default function SettingsPage() {
  const { tenantId, ready } = useRequireAuth();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();

  const [systemPrompt, setSystemPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const webhookUrl = `https://asia-northeast1-line-omakase.cloudfunctions.net/lineWebhook`;

  useEffect(() => {
    if (!ready || !tenantId) return;
    const fetchTenant = async () => {
      const tenantRef = doc(db, "tenants", tenantId);
      const snap = await getDoc(tenantRef);
      if (snap.exists()) {
        const prompt = snap.data().systemPrompt || "";
        setSystemPrompt(prompt);
        setOriginalPrompt(prompt);
      }
      setLoading(false);
    };
    fetchTenant();
  }, [ready, tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "tenants", tenantId), { systemPrompt });
      setOriginalPrompt(systemPrompt);
      showToast("システムプロンプトを保存しました");
    } catch (error) {
      console.error("保存エラー:", error);
      showToast("保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshProfiles = async () => {
    setRefreshing(true);
    try {
      const refreshFn = httpsCallable<Record<string, never>, { updated: number; total: number }>(functions, "refreshUserProfiles");
      const result = await refreshFn({});
      showToast(`${result.data.updated}/${result.data.total} 件のプロフィールを更新しました`);
    } catch (error) {
      console.error("プロフィール更新エラー:", error);
      showToast("プロフィール更新に失敗しました", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const hasChanges = systemPrompt !== originalPrompt;

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-sm font-bold text-slate-800">設定</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Account info */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">アカウント</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">{user?.email}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Bot ID: {tenantId}</p>
            </div>
            <button
              onClick={signOut}
              className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Webhook URL</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            LINE Developers コンソールの Messaging API 設定で、以下の URL を Webhook URL に設定してください。
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 break-all">
              {webhookUrl}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(webhookUrl); showToast("コピーしました"); }}
              className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-2"
            >
              コピー
            </button>
          </div>
        </div>

        {/* User profiles */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">ユーザー管理</h2>
          <p className="text-[11px] text-slate-400 mb-3">
            LINE からユーザーのアイコンと表示名を再取得します。
          </p>
          <button
            onClick={handleRefreshProfiles}
            disabled={refreshing}
            className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 disabled:bg-slate-300 transition-colors"
          >
            {refreshing ? "更新中..." : "プロフィールを一括更新"}
          </button>
        </div>

        {/* System Prompt */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">AI システムプロンプト</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            AI アシスタントの振る舞いをカスタマイズできます。ユーザーへの返答トーンや指導方針を指定してください。
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="例: あなたは経験豊富な栄養士です。ユーザーに対して優しく励ましながら、具体的な栄養指導を行ってください。"
            rows={6}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
          <div className="flex items-center justify-end gap-3 mt-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
