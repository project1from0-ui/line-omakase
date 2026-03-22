"use client";

import { useEffect, useState, useMemo, use } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../../../src/lib/firebase";
import { AppUser, AppMessage, NutritionData } from "../../../src/types";
import { useRequireAuth } from "../../../src/hooks/useRequireAuth";
import { format, startOfDay, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import Link from "next/link";

interface DailyNutrition {
  date: Date;
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  mealCount: number;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isOver = value > max;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOver ? "bg-red-400" : color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums w-20 text-right ${isOver ? "text-red-600 font-semibold" : "text-gray-500"}`}>
        {Math.round(value)} / {max}
      </span>
    </div>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  const { tenantId, ready } = useRequireAuth();

  const [user, setUser] = useState<AppUser | null>(null);
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"nutrition" | "chat">("nutrition");

  // Fetch user data
  useEffect(() => {
    if (!ready || !tenantId) return;
    const userRef = doc(db, `tenants/${tenantId}/users`, userId);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUser({
          ...data,
          lineUserId: snap.id,
          lastMessageAt: data.lastMessageAt?.toDate() || new Date(),
          lastMealReportAt: data.lastMealReportAt?.toDate() || undefined,
        } as AppUser);
      }
    });
    return () => unsubscribe();
  }, [ready, tenantId, userId]);

  // Fetch messages
  useEffect(() => {
    if (!ready || !tenantId) return;
    const msgsRef = collection(db, `tenants/${tenantId}/users/${userId}/messages`);
    const q = query(msgsRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as AppMessage;
      });
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [ready, tenantId, userId]);

  // Aggregate daily nutrition from messages with nutrition data
  const dailyNutrition = useMemo(() => {
    const dayMap = new Map<string, DailyNutrition>();

    messages.forEach((msg) => {
      if (!msg.nutrition || msg.nutrition.calories === 0) return;
      const dayKey = format(msg.createdAt, "yyyy-MM-dd");
      const existing = dayMap.get(dayKey);
      if (existing) {
        existing.totalCalories += msg.nutrition.calories;
        existing.totalProtein += msg.nutrition.protein;
        existing.totalFat += msg.nutrition.fat;
        existing.totalCarbs += msg.nutrition.carbs;
        existing.mealCount += 1;
      } else {
        dayMap.set(dayKey, {
          date: startOfDay(msg.createdAt),
          totalCalories: msg.nutrition.calories,
          totalProtein: msg.nutrition.protein,
          totalFat: msg.nutrition.fat,
          totalCarbs: msg.nutrition.carbs,
          mealCount: 1,
        });
      }
    });

    return Array.from(dayMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [messages]);

  const todayNutrition = useMemo(() => {
    return dailyNutrition.find((d) => isSameDay(d.date, new Date())) || null;
  }, [dailyNutrition]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">読み込み中...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">ユーザーが見つかりません</p>
      </div>
    );
  }

  const goal = user.nutritionalGoal;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {user.pictureUrl ? (
              <img src={user.pictureUrl} alt={user.displayName} className="w-9 h-9 rounded-full" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500">
                {user.displayName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 truncate">{user.displayName}</h1>
              {goal && (
                <p className="text-[11px] text-slate-400">
                  目標 {goal.targetCalories}kcal / P{goal.protein} F{goal.fat} C{goal.carbs}
                </p>
              )}
            </div>
          </div>
          <Link
            href={`/users/${userId}/goal`}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
          >
            {goal ? "目標編集" : "目標設定"}
          </Link>
        </div>
      </header>

      {/* Today's summary */}
      {goal && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">今日の達成率</span>
              <span className="text-[11px] text-slate-400">
                {todayNutrition ? `${todayNutrition.mealCount}食` : "報告なし"}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "kcal", value: todayNutrition?.totalCalories || 0, max: goal.targetCalories, color: "text-slate-700" },
                { label: "P", value: todayNutrition?.totalProtein || 0, max: goal.protein, color: "text-blue-600" },
                { label: "F", value: todayNutrition?.totalFat || 0, max: goal.fat, color: "text-amber-600" },
                { label: "C", value: todayNutrition?.totalCarbs || 0, max: goal.carbs, color: "text-emerald-600" },
              ].map((item) => {
                const pct = item.max > 0 ? Math.round((item.value / item.max) * 100) : 0;
                const isOver = pct > 100;
                return (
                  <div key={item.label} className="text-center">
                    <p className={`text-2xl font-bold tabular-nums ${isOver ? "text-red-600" : item.color}`}>
                      {pct}<span className="text-xs font-normal">%</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.label}</p>
                    <p className="text-[10px] text-slate-400 tabular-nums">
                      {Math.round(item.value)}/{item.max}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 pt-3">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("nutrition")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "nutrition" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
            }`}
          >
            栄養トラッキング
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "chat" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
            }`}
          >
            チャット履歴
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-3">
        {activeTab === "nutrition" ? (
          <NutritionTab dailyNutrition={dailyNutrition} goal={goal} />
        ) : (
          <ChatTab messages={messages} />
        )}
      </div>
    </div>
  );
}

function NutritionTab({ dailyNutrition, goal }: { dailyNutrition: DailyNutrition[]; goal?: AppUser["nutritionalGoal"] }) {
  if (dailyNutrition.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
        <p className="text-slate-400 text-sm">まだ食事報告がありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {dailyNutrition.map((day) => (
        <div key={day.date.toISOString()} className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-700">
              {isSameDay(day.date, new Date())
                ? "今日"
                : format(day.date, "M/d (E)", { locale: ja })}
            </span>
            <span className="text-[11px] text-slate-400">{day.mealCount}食</span>
          </div>

          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500">カロリー</span>
                <span className="text-slate-700 font-medium">{Math.round(day.totalCalories)} kcal</span>
              </div>
              {goal && <ProgressBar value={day.totalCalories} max={goal.targetCalories} color="bg-slate-500" />}
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-blue-500">P (タンパク質)</span>
                <span className="text-slate-700 font-medium">{Math.round(day.totalProtein)}g</span>
              </div>
              {goal && <ProgressBar value={day.totalProtein} max={goal.protein} color="bg-blue-400" />}
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-amber-500">F (脂質)</span>
                <span className="text-slate-700 font-medium">{Math.round(day.totalFat)}g</span>
              </div>
              {goal && <ProgressBar value={day.totalFat} max={goal.fat} color="bg-amber-400" />}
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-emerald-500">C (炭水化物)</span>
                <span className="text-slate-700 font-medium">{Math.round(day.totalCarbs)}g</span>
              </div>
              {goal && <ProgressBar value={day.totalCarbs} max={goal.carbs} color="bg-emerald-400" />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatTab({ messages }: { messages: AppMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
        <p className="text-slate-400 text-sm">まだメッセージがありません</p>
      </div>
    );
  }

  // Display in chronological order (oldest first)
  const chronological = [...messages].reverse();

  return (
    <div className="flex flex-col gap-2">
      {chronological.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
              msg.sender === "user"
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {msg.type === "image" ? (
              <span className="text-xs opacity-70">[画像]</span>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
            )}
            <div className={`flex items-center gap-2 mt-1 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
              <span className={`text-[10px] ${msg.sender === "user" ? "text-blue-200" : "text-slate-400"}`}>
                {format(msg.createdAt, "HH:mm")}
              </span>
              {msg.nutrition && msg.nutrition.calories > 0 && (
                <span className={`text-[10px] ${msg.sender === "user" ? "text-blue-200" : "text-slate-400"}`}>
                  {msg.nutrition.calories}kcal
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
