"use client";

import { useState, useEffect, use } from "react";
import liff from "@line/liff";

interface DailySummary {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  mealCount: number;
  summary: string;
  goalSnapshot: {
    targetCalories: number;
    protein: number;
    fat: number;
    carbs: number;
  } | null;
  createdAt: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://asia-northeast1-line-omakase.cloudfunctions.net";
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "";

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function DiaryPage({ params }: { params: Promise<{ tenantId: string; userId: string }> }) {
  const { tenantId, userId } = use(params);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        if (!LIFF_ID) {
          setError("LIFF IDが設定されていません");
          setLoading(false);
          return;
        }

        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const accessToken = liff.getAccessToken();
        if (!accessToken) {
          setError("アクセストークンを取得できませんでした");
          setLoading(false);
          return;
        }

        const res = await fetch(
          `${API_BASE}/getDailySummaries?tenantId=${encodeURIComponent(tenantId)}&userId=${encodeURIComponent(userId)}&limit=30`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setSummaries(data.summaries || []);
      } catch (err) {
        console.error("Diary load error:", err);
        setError(err instanceof Error ? err.message : "データの読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [tenantId, userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 mt-3">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-slate-900 sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-3">
            <h1 className="text-sm font-bold text-white">食事日記</h1>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-slate-400">まだ記録がありません</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <h1 className="text-sm font-bold text-white">食事日記</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3">
        {summaries.map((s) => {
          const goal = s.goalSnapshot;
          const calPct = goal ? Math.round((s.totalCalories / goal.targetCalories) * 100) : null;
          return (
            <div key={s.date} className="bg-white rounded-xl border border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800 mb-3">
                {s.date.replace(/-/g, "/")}
              </h2>

              {/* Calories */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>カロリー</span>
                  <span>
                    {s.totalCalories.toLocaleString()} {goal ? `/ ${goal.targetCalories.toLocaleString()} kcal` : "kcal"}
                    {calPct !== null && <span className="ml-1 text-slate-400">({calPct}%)</span>}
                  </span>
                </div>
                {goal && <ProgressBar value={s.totalCalories} max={goal.targetCalories} color="bg-orange-400" />}
              </div>

              {/* PFC */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>P</span>
                    <span>{Math.round(s.totalProtein)}{goal ? `/${goal.protein}g` : "g"}</span>
                  </div>
                  {goal && <ProgressBar value={s.totalProtein} max={goal.protein} color="bg-red-400" />}
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>F</span>
                    <span>{Math.round(s.totalFat)}{goal ? `/${goal.fat}g` : "g"}</span>
                  </div>
                  {goal && <ProgressBar value={s.totalFat} max={goal.fat} color="bg-yellow-400" />}
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>C</span>
                    <span>{Math.round(s.totalCarbs)}{goal ? `/${goal.carbs}g` : "g"}</span>
                  </div>
                  {goal && <ProgressBar value={s.totalCarbs} max={goal.carbs} color="bg-blue-400" />}
                </div>
              </div>

              {/* AI Summary */}
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 font-medium mb-1">AI総評</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{s.summary}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
