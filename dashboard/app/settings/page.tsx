"use client";

export const dynamic = "force-dynamic";

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
  const [reminderMessage, setReminderMessage] = useState("");
  const [originalReminder, setOriginalReminder] = useState("");
  const [basicId, setBasicId] = useState<string | null>(null);
  const [summaryTime, setSummaryTime] = useState("00:00");
  const [originalSummaryTime, setOriginalSummaryTime] = useState("00:00");
  const [saving, setSaving] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [savingSummaryTime, setSavingSummaryTime] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkInEnabled, setCheckInEnabled] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);

  const webhookUrl = `https://asia-northeast1-line-omakase.cloudfunctions.net/lineWebhook`;

  useEffect(() => {
    if (!ready || !tenantId) return;
    const fetchTenant = async () => {
      const tenantRef = doc(db, "tenants", tenantId);
      const snap = await getDoc(tenantRef);
      if (snap.exists()) {
        const data = snap.data();
        const prompt = data.systemPrompt || "";
        setSystemPrompt(prompt);
        setOriginalPrompt(prompt);
        const reminder = data.reminderMessage || "";
        setReminderMessage(reminder);
        setOriginalReminder(reminder);
        setBasicId(data.basicId || null);
        const st = data.summaryTime || "00:00";
        setSummaryTime(st);
        setOriginalSummaryTime(st);
        setCheckInEnabled(data.proactiveCheckInEnabled ?? false);
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

  const handleSaveReminder = async () => {
    if (!tenantId) return;
    setSavingReminder(true);
    try {
      await updateDoc(doc(db, "tenants", tenantId), { reminderMessage });
      setOriginalReminder(reminderMessage);
      showToast("リマインドメッセージを保存しました");
    } catch (error) {
      console.error("保存エラー:", error);
      showToast("保存に失敗しました", "error");
    } finally {
      setSavingReminder(false);
    }
  };

  const handleSaveSummaryTime = async () => {
    if (!tenantId) return;
    setSavingSummaryTime(true);
    try {
      await updateDoc(doc(db, "tenants", tenantId), { summaryTime });
      setOriginalSummaryTime(summaryTime);
      showToast("日次レポート送信時刻を保存しました");
    } catch (error) {
      console.error("保存エラー:", error);
      showToast("保存に失敗しました", "error");
    } finally {
      setSavingSummaryTime(false);
    }
  };

  const handleToggleCheckIn = async (enabled: boolean) => {
    if (!tenantId) return;
    setSavingCheckIn(true);
    try {
      await updateDoc(doc(db, "tenants", tenantId), { proactiveCheckInEnabled: enabled });
      setCheckInEnabled(enabled);
      showToast(enabled ? "昼食チェックインを有効にしました" : "昼食チェックインを無効にしました");
    } catch (error) {
      console.error("保存エラー:", error);
      showToast("保存に失敗しました", "error");
    } finally {
      setSavingCheckIn(false);
    }
  };

  const hasChanges = systemPrompt !== originalPrompt;
  const hasReminderChanges = reminderMessage !== originalReminder;
  const hasSummaryTimeChanges = summaryTime !== originalSummaryTime;

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-sm font-bold text-white">設定</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Account info */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">アカウント</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? ""}
                  className="w-9 h-9 rounded-full flex-shrink-0"
                />
              )}
              <div>
                <p className="text-sm text-slate-700">{user?.displayName ?? "トレーナー"}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Bot ID: {tenantId}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* Invite link */}
        {basicId && (
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">クライアント招待リンク</h2>
            <p className="text-[11px] text-slate-400 mb-2">
              このリンクをクライアントに送ると、LINEでBotを友達追加できます。
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 break-all">
                https://line.me/R/ti/p/{basicId}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(`https://line.me/R/ti/p/${basicId}`); showToast("コピーしました"); }}
                className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-2.5"
              >
                コピー
              </button>
            </div>
          </div>
        )}

        {/* Webhook URL */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Webhook URL</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            LINE Developers コンソールの Messaging API 設定で、以下の URL を Webhook URL に設定してください。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 break-all">
              {webhookUrl}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(webhookUrl); showToast("コピーしました"); }}
              className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-2.5"
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
            className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 disabled:bg-slate-300 transition-colors"
          >
            {refreshing ? "更新中..." : "プロフィールを一括更新"}
          </button>
        </div>

        {/* Reminder notification */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">リマインド通知</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            毎日21:00に12時間以上未報告のクライアントへ自動送信されます。空欄の場合はデフォルトメッセージが使われます。
          </p>
          <input
            type="text"
            value={reminderMessage}
            onChange={(e) => setReminderMessage(e.target.value)}
            placeholder="今日の食事はまだ報告されていません🍽 写真やテキストで教えてくださいね！"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex items-center justify-end gap-3 mt-3">
            <button
              onClick={handleSaveReminder}
              disabled={savingReminder || !hasReminderChanges}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {savingReminder ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {/* Daily report time */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">日次レポート</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            毎日指定時刻に、食事報告済みのクライアントへAI総評を自動送信します。
          </p>
          <div className="flex items-center gap-3">
            <select
              value={summaryTime}
              onChange={(e) => setSummaryTime(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Array.from({length: 24}, (_, i) => {
                const hour = String(i).padStart(2, "0") + ":00";
                return <option key={hour} value={hour}>{hour}</option>;
              })}
            </select>
            <span className="text-xs text-slate-400">JST</span>
          </div>
          <div className="flex items-center justify-end gap-3 mt-3">
            <button
              onClick={handleSaveSummaryTime}
              disabled={savingSummaryTime || !hasSummaryTimeChanges}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {savingSummaryTime ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {/* Proactive Check-in */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">昼食チェックイン</h2>
          <p className="text-[11px] text-slate-400 mb-3">
            毎日14:00に未報告のクライアントへ昼食確認メッセージを自動送信します。目標カロリーの残量も通知されます。
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700">{checkInEnabled ? "有効" : "無効"}</span>
            <button
              onClick={() => handleToggleCheckIn(!checkInEnabled)}
              disabled={savingCheckIn}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                checkInEnabled ? "bg-blue-600" : "bg-slate-200"
              } ${savingCheckIn ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  checkInEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* System Prompt */}
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">AI システムプロンプト（追加指示）</h2>
          <p className="text-[11px] text-slate-400 mb-2">
            プラットフォーム基本プロンプトに追加されます。トレーナー独自の指導方針やトーンをカスタマイズできます。
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="例: 筋トレ中のクライアントが多いので、タンパク質摂取を特に重視して指導してください。糖質制限は推奨しない方針です。"
            rows={6}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
          <div className="flex items-center justify-end gap-3 mt-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
