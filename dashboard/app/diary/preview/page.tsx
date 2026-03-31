"use client";

import { useState } from "react";

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
}

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

const MOCK_SUMMARIES: DailySummary[] = [
  {
    date: "2026-03-29",
    totalCalories: 1850,
    totalProtein: 120,
    totalFat: 55,
    totalCarbs: 230,
    mealCount: 3,
    summary: "今日は全体的にバランスの取れた食事が摂れていました。カロリーは目標の92%で適切な範囲です。タンパク質もしっかり摂れており、筋肉の維持・増強に十分な量です。脂質もやや控えめで良い傾向ですね。\n\n一点改善するとすれば、昼食の炭水化物がやや多めだったので、夕食で調整できたのは素晴らしい判断です。この調子で明日も続けていきましょう！",
    goalSnapshot: { targetCalories: 2000, protein: 130, fat: 60, carbs: 250 },
  },
  {
    date: "2026-03-28",
    totalCalories: 2250,
    totalProtein: 95,
    totalFat: 80,
    totalCarbs: 280,
    mealCount: 4,
    summary: "今日はカロリーが目標を12%超過しています。特に脂質が目標を大きく上回っており、昼食の揚げ物が主な原因と思われます。減量目的を考慮すると、揚げ物の頻度を週2回程度に抑えることをおすすめします。\n\nタンパク質が目標に対して73%と不足気味です。夕食にサラダチキンや豆腐を追加するなど、低脂質高タンパクな食品で補うと良いでしょう。",
    goalSnapshot: { targetCalories: 2000, protein: 130, fat: 60, carbs: 250 },
  },
  {
    date: "2026-03-27",
    totalCalories: 1620,
    totalProtein: 110,
    totalFat: 45,
    totalCarbs: 190,
    mealCount: 2,
    summary: "食事回数が2回と少なめでした。摂取カロリーが目標の81%で、やや不足しています。無理な食事制限は基礎代謝の低下を招く可能性があるため、3食しっかり食べることを意識してください。\n\nただし、食事の質は非常に良く、タンパク質は目標の85%を確保できています。脂質も控えめで理想的なバランスです。もう1食、おにぎりとゆで卵のような軽食を追加するだけで完璧な1日になりますよ。",
    goalSnapshot: { targetCalories: 2000, protein: 130, fat: 60, carbs: 250 },
  },
  {
    date: "2026-03-26",
    totalCalories: 1980,
    totalProtein: 135,
    totalFat: 58,
    totalCarbs: 245,
    mealCount: 3,
    summary: "素晴らしい1日でした！すべての栄養素が目標の90〜105%の範囲に収まっており、非常にバランスの良い食事が摂れています。特にタンパク質が目標を少し上回っているのは、あなたの運動量を考えるとベストな水準です。\n\nこの食事パターンを「成功テンプレート」として記憶しておくと良いでしょう。似た食事を意識的に繰り返すことで、安定した結果につながります。",
    goalSnapshot: { targetCalories: 2000, protein: 130, fat: 60, carbs: 250 },
  },
];

export default function DiaryPreviewPage() {
  const [summaries] = useState<DailySummary[]>(MOCK_SUMMARIES);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dev banner */}
      <div className="bg-amber-100 border-b border-amber-200 px-4 py-1.5 text-center">
        <p className="text-[11px] text-amber-700 font-medium">PREVIEW MODE - mock data</p>
      </div>

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
