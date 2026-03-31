"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import liff from "@line/liff";
import { useAuth } from "../../src/contexts/AuthContext";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "";

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"initializing" | "ready">("initializing");

  // Firebase Auth済みならダッシュボードへ
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  // LIFF初期化 → 自動ログイン
  useEffect(() => {
    if (loading || user) return;

    async function initAndLogin() {
      try {
        if (!LIFF_ID) {
          setError("LIFF IDが設定されていません。管理者に連絡してください。");
          setStatus("ready");
          return;
        }

        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          // LINE未ログイン → LINEログイン画面へリダイレクト
          liff.login();
          return;
        }

        // LINEアクセストークン取得
        const accessToken = liff.getAccessToken();
        if (!accessToken) {
          setError("LINEトークンの取得に失敗しました。再度お試しください。");
          setStatus("ready");
          return;
        }

        // Firebase Custom Tokenでサインイン
        await signIn(accessToken);
        // onAuthStateChanged が user をセットし、上のuseEffectがリダイレクト
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("ready");
        console.error("Login error:", e);
      }
    }

    initAndLogin();
  }, [loading, user, signIn]);

  // ローディング中（初期化 or Firebase認証確認中）
  if (loading || status === "initializing") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-green-400 rounded-full animate-spin" />
        <p className="text-xs text-slate-500">LINEログイン中...</p>
      </div>
    );
  }

  // エラー時のみ表示（通常はリダイレクトで見えない）
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-green-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20 mb-4">
              <span className="text-white text-2xl font-bold tracking-tight">た</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">たべコーチ</h1>
            <p className="text-sm text-slate-400 mt-1">トレーナー向け栄養管理ダッシュボード</p>
          </div>

          {error && (
            <div className="mb-5 p-3 bg-red-950/50 border border-red-800/50 rounded-xl text-xs text-red-400 text-left break-all">
              {error}
            </div>
          )}

          <button
            onClick={() => {
              setError(null);
              setStatus("initializing");
            }}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#06C755] hover:bg-[#05b34c] rounded-xl text-sm font-medium text-white transition-all shadow-sm"
          >
            {/* LINE公式アイコン */}
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            LINEでログイン
          </button>

          <p className="text-center text-[11px] text-slate-600 mt-5">
            登録済みトレーナーのみご利用いただけます
          </p>
        </div>
      </div>
    </div>
  );
}
