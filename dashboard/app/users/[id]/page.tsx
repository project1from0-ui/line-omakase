"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, use } from "react";
import { collection, query, orderBy, onSnapshot, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../../src/lib/firebase";
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
  const [pushText, setPushText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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
    }, (error) => {
      console.error("User snapshot error:", error);
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
    }, (error) => {
      console.error("Messages snapshot error:", error);
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

  const handleSendPush = async () => {
    if (!pushText.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fn = httpsCallable(functions, "sendPushMessage");
      await fn({ lineUserId: userId, message: pushText.trim() });
      setPushText("");
    } catch (err: any) {
      setSendError(err?.message || "送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

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
      <header className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {user.pictureUrl ? (
              <img src={user.pictureUrl} alt={user.displayName} className="w-9 h-9 rounded-full ring-2 ring-slate-700" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {user.displayName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white truncate">{user.displayName}</h1>
              {goal && (
                <p className="text-[11px] text-slate-400">
                  目標 {goal.targetCalories}kcal · P{goal.protein} F{goal.fat} C{goal.carbs}
                </p>
              )}
            </div>
          </div>
          <Link
            href={`/users/${userId}/goal`}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap transition-colors"
          >
            {goal ? "目標編集" : "目標設定"}
          </Link>
        </div>
      </header>

      {/* Today's summary */}
      {goal && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-600">今日の達成率</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                todayNutrition
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-400"
              }`}>
                {todayNutrition ? `${todayNutrition.mealCount}食報告済み` : "まだ報告なし"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2">
              {[
                { label: "カロリー", unit: "kcal", value: todayNutrition?.totalCalories || 0, max: goal.targetCalories, baseColor: "text-slate-700", bgColor: "bg-slate-500" },
                { label: "タンパク質", unit: "P", value: todayNutrition?.totalProtein || 0, max: goal.protein, baseColor: "text-blue-600", bgColor: "bg-blue-500" },
                { label: "脂質", unit: "F", value: todayNutrition?.totalFat || 0, max: goal.fat, baseColor: "text-amber-600", bgColor: "bg-amber-500" },
                { label: "炭水化物", unit: "C", value: todayNutrition?.totalCarbs || 0, max: goal.carbs, baseColor: "text-emerald-600", bgColor: "bg-emerald-500" },
              ].map((item) => {
                const pct = item.max > 0 ? Math.min((item.value / item.max) * 100, 100) : 0;
                const pctDisplay = item.max > 0 ? Math.round((item.value / item.max) * 100) : 0;
                const isOver = pctDisplay > 100;
                return (
                  <div key={item.unit} className="flex flex-col items-center gap-1.5">
                    <div className="relative w-16 h-16 sm:w-14 sm:h-14">
                      <svg className="w-16 h-16 sm:w-14 sm:h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                        <circle
                          cx="28" cy="28" r="22"
                          fill="none"
                          stroke={isOver ? "#ef4444" : (item.unit === "kcal" ? "#64748b" : item.unit === "P" ? "#3b82f6" : item.unit === "F" ? "#f59e0b" : "#10b981")}
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 22}`}
                          strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                          className="transition-all duration-500"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xs font-bold tabular-nums leading-none ${isOver ? "text-red-600" : item.baseColor}`}>
                          {pctDisplay}
                        </span>
                        <span className="text-[8px] text-slate-400 leading-none mt-0.5">%</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-medium text-slate-500">{item.unit}</p>
                      <p className="text-[9px] text-slate-400 tabular-nums">{Math.round(item.value)}/{item.max}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 pt-3">
        <div className="flex gap-0 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab("nutrition")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "nutrition"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            栄養トラッキング
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "chat"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            チャット履歴
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-3">
        {activeTab === "nutrition" ? (
          <NutritionTab dailyNutrition={dailyNutrition} goal={goal} displayName={user.displayName} />
        ) : (
          <>
            <ChatTab messages={messages} />
            {/* Push message input */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
              <div className="max-w-2xl mx-auto flex gap-2 items-end">
                <div className="flex-1 flex flex-col gap-0.5">
                  <textarea
                    value={pushText}
                    onChange={(e) => setPushText(e.target.value.slice(0, 5000))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendPush();
                      }
                    }}
                    placeholder="トレーナーからメッセージを送信..."
                    rows={1}
                    className={`resize-none rounded-xl border px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent bg-slate-50 ${
                      pushText.length > 4800
                        ? "border-red-300 focus:ring-red-400"
                        : "border-slate-200 focus:ring-blue-500 focus:bg-white"
                    }`}
                  />
                  {pushText.length > 4000 && (
                    <p className={`text-[10px] text-right tabular-nums ${pushText.length >= 5000 ? "text-red-500" : "text-slate-400"}`}>
                      {pushText.length} / 5000
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSendPush}
                  disabled={!pushText.trim() || sending || pushText.length >= 5000}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
              {sendError && (
                <p className="max-w-2xl mx-auto mt-1 text-xs text-red-500">{sendError}</p>
              )}
            </div>
            {/* Spacer to avoid content hidden behind fixed input */}
            <div className="h-16" />
          </>
        )}
      </div>
    </div>
  );
}

function WeeklyTrend({ dailyNutrition, goal }: { dailyNutrition: DailyNutrition[]; goal?: AppUser["nutritionalGoal"] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return startOfDay(d);
  });

  const maxCal = goal?.targetCalories
    ? goal.targetCalories * 1.2
    : Math.max(...dailyNutrition.map((d) => d.totalCalories), 1);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-slate-600">過去7日間</h3>
        {goal && (
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <span className="inline-block w-3 h-px border-t-2 border-dashed border-slate-300" />
            目標 {goal.targetCalories} kcal
          </span>
        )}
      </div>
      <div className="flex items-end gap-1.5" style={{ height: "80px" }}>
        {days.map((day) => {
          const data = dailyNutrition.find((d) => isSameDay(d.date, day));
          const cal = data?.totalCalories || 0;
          const heightPct = maxCal > 0 ? Math.min((cal / maxCal) * 100, 100) : 0;
          const isOver = goal && cal > goal.targetCalories;
          const isToday = isSameDay(day, today);

          return (
            <div key={day.toISOString()} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[9px] text-slate-400 tabular-nums h-3 flex items-end">
                {cal > 0 ? (cal >= 1000 ? `${(cal / 1000).toFixed(1)}k` : Math.round(cal)) : ""}
              </span>
              <div className="w-full flex items-end rounded-sm overflow-hidden" style={{ height: "48px" }}>
                <div
                  className={`w-full rounded-md transition-all duration-300 ${
                    isOver
                      ? "bg-gradient-to-t from-red-500 to-red-400"
                      : cal > 0
                      ? isToday
                        ? "bg-gradient-to-t from-blue-600 to-blue-400"
                        : "bg-gradient-to-t from-blue-400 to-blue-300"
                      : "bg-slate-100"
                  }`}
                  style={{ height: `${Math.max(heightPct, cal > 0 ? 6 : 3)}%` }}
                />
              </div>
              <span className={`text-[10px] leading-none ${isToday ? "font-bold text-slate-800" : "text-slate-400"}`}>
                {format(day, "E", { locale: ja })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function exportNutritionCSV(dailyNutrition: DailyNutrition[], displayName: string) {
  const header = "日付,カロリー(kcal),タンパク質(g),脂質(g),炭水化物(g),食事回数";
  const rows = dailyNutrition.map((d) =>
    [
      format(d.date, "yyyy-MM-dd"),
      Math.round(d.totalCalories),
      Math.round(d.totalProtein),
      Math.round(d.totalFat),
      Math.round(d.totalCarbs),
      d.mealCount,
    ].join(",")
  );
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${displayName}_nutrition_${format(new Date(), "yyyyMMdd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function NutritionTab({ dailyNutrition, goal, displayName }: { dailyNutrition: DailyNutrition[]; goal?: AppUser["nutritionalGoal"]; displayName: string }) {
  if (dailyNutrition.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5A2.25 2.25 0 0012.75 4.5h-1.5A2.25 2.25 0 009 6.75v1.5M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm font-medium">まだ食事報告がありません</p>
        <p className="text-slate-400 text-xs mt-1">クライアントが食事の写真を送ると記録されます</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          onClick={() => exportNutritionCSV(dailyNutrition, displayName)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          CSVダウンロード
        </button>
      </div>
      <WeeklyTrend dailyNutrition={dailyNutrition} goal={goal} />
      {dailyNutrition.map((day) => {
        const isToday = isSameDay(day.date, new Date());
        return (
          <div key={day.date.toISOString()} className={`bg-white rounded-xl shadow-sm border p-4 ${isToday ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-100"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${isToday ? "text-blue-600" : "text-slate-700"}`}>
                  {isToday ? "今日" : format(day.date, "M/d (E)", { locale: ja })}
                </span>
                {isToday && (
                  <span className="text-[10px] font-semibold bg-blue-600 text-white px-1.5 py-px rounded-full">TODAY</span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{day.mealCount}食</span>
            </div>

            <div className="space-y-2.5">
              {[
                { label: "カロリー", unit: "kcal", value: day.totalCalories, max: goal?.targetCalories, color: "bg-slate-500", textColor: "text-slate-500" },
                { label: "P タンパク質", unit: "g", value: day.totalProtein, max: goal?.protein, color: "bg-blue-400", textColor: "text-blue-500" },
                { label: "F 脂質", unit: "g", value: day.totalFat, max: goal?.fat, color: "bg-amber-400", textColor: "text-amber-500" },
                { label: "C 炭水化物", unit: "g", value: day.totalCarbs, max: goal?.carbs, color: "bg-emerald-400", textColor: "text-emerald-500" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className={item.textColor}>{item.label}</span>
                    <span className="text-slate-700 font-semibold tabular-nums">
                      {Math.round(item.value)} {item.unit}
                    </span>
                  </div>
                  {item.max && <ProgressBar value={item.value} max={item.max} color={item.color} />}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChatTab({ messages }: { messages: AppMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm font-medium">まだメッセージがありません</p>
      </div>
    );
  }

  const chronological = [...messages].reverse();

  return (
    <div className="flex flex-col gap-2">
      {chronological.map((msg) => {
        const isUser = msg.sender === "user";
        const isTrainer = msg.sender === "trainer";
        return (
          <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className="flex flex-col gap-0.5 max-w-[85%] sm:max-w-[80%]">
              {isTrainer && (
                <span className="text-[10px] text-emerald-600 font-semibold px-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  トレーナー
                </span>
              )}
              <div className={`rounded-2xl px-3.5 py-2.5 ${
                isUser
                  ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-200"
                  : isTrainer
                  ? "bg-emerald-50 border border-emerald-200 text-slate-700"
                  : "bg-white border border-slate-200 text-slate-700 shadow-sm"
              }`}>
                {msg.type === "image" ? (
                  <span className="text-xs opacity-70 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    画像
                  </span>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                )}
                <div className={`flex items-center gap-2 mt-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
                  <span className={`text-[10px] tabular-nums ${isUser ? "text-blue-200" : isTrainer ? "text-emerald-400" : "text-slate-400"}`}>
                    {format(msg.createdAt, "HH:mm")}
                  </span>
                  {msg.nutrition && msg.nutrition.calories > 0 && (
                    <span className={`text-[10px] font-medium tabular-nums px-1.5 py-px rounded-full ${
                      isUser ? "bg-blue-500/30 text-blue-100" : "bg-slate-100 text-slate-500"
                    }`}>
                      {msg.nutrition.calories} kcal
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
