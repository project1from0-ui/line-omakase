"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../src/lib/firebase";
import { AppUser } from "../src/types";
import { differenceInHours, differenceInMinutes, formatDistanceToNow } from "date-fns";
import { useRequireAuth } from "../src/hooks/useRequireAuth";
import { ja } from "date-fns/locale";
import Link from "next/link";
import { NotificationBell } from "../src/components/NotificationBell";

const ALERT_THRESHOLD_HOURS = 12;

function isUnreported(user: AppUser): boolean {
  if (!user.lastMealReportAt) return true;
  return differenceInHours(new Date(), user.lastMealReportAt) >= ALERT_THRESHOLD_HOURS;
}

function hasNoGoal(user: AppUser): boolean {
  return !user.nutritionalGoal;
}

type UserStatus = "no_goal" | "unreported" | "ok";

function getUserStatus(user: AppUser): UserStatus {
  if (hasNoGoal(user)) return "no_goal";
  if (isUnreported(user)) return "unreported";
  return "ok";
}

function getUnreportedLabel(user: AppUser): string {
  if (!user.lastMealReportAt) return "報告なし";
  const hours = differenceInHours(new Date(), user.lastMealReportAt);
  if (hours >= 48) return `${Math.floor(hours / 24)}日未報告`;
  return `${hours}h未報告`;
}

function getLastActiveLabel(user: AppUser): string {
  const mins = differenceInMinutes(new Date(), user.lastMessageAt);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

// PFC bar component
function PFCBar({ goal }: { goal: AppUser["nutritionalGoal"] }) {
  if (!goal) return null;
  const total = goal.protein + goal.fat + goal.carbs;
  if (total === 0) return null;
  const pPct = (goal.protein / total) * 100;
  const fPct = (goal.fat / total) * 100;
  const cPct = (goal.carbs / total) * 100;

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-blue-400" style={{ width: `${pPct}%` }} />
        <div className="bg-amber-400" style={{ width: `${fPct}%` }} />
        <div className="bg-emerald-400" style={{ width: `${cPct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
        P{goal.protein} F{goal.fat} C{goal.carbs}
      </span>
    </div>
  );
}

// Avatar component
function Avatar({ name, pictureUrl, status }: { name: string; pictureUrl?: string; status: UserStatus }) {
  const ringColor = status === "ok" ? "ring-emerald-400" : status === "unreported" ? "ring-red-400" : "ring-gray-300";
  const bgColor = status === "ok" ? "bg-emerald-50 text-emerald-700" : status === "unreported" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500";

  if (pictureUrl) {
    return (
      <div className={`w-10 h-10 rounded-full ring-2 ${ringColor} overflow-hidden flex-shrink-0`}>
        <img src={pictureUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }

  const initial = name.charAt(0).toUpperCase();
  return (
    <div className={`w-10 h-10 rounded-full ring-2 ${ringColor} ${bgColor} flex items-center justify-center flex-shrink-0 text-sm font-bold`}>
      {initial}
    </div>
  );
}

export default function DashboardOverview() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId, ready } = useRequireAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "no_goal" | "unreported" | "ok">("all");

  useEffect(() => {
    if (!ready || !tenantId) return;
    const usersRef = collection(db, `tenants/${tenantId}/users`);
    const q = query(usersRef, orderBy("lastMessageAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedUsers = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          lineUserId: doc.id,
          lastMessageAt: data.lastMessageAt?.toDate() || new Date(),
          lastMealReportAt: data.lastMealReportAt?.toDate() || undefined,
        } as AppUser;
      });
      setUsers(fetchedUsers);
      setLoading(false);
    }, (error) => {
      console.error("Users snapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ready, tenantId]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aNoGoal = hasNoGoal(a);
      const bNoGoal = hasNoGoal(b);
      const aUnreported = isUnreported(a);
      const bUnreported = isUnreported(b);

      if (aNoGoal && !bNoGoal) return -1;
      if (!aNoGoal && bNoGoal) return 1;
      if (aNoGoal && bNoGoal) return 0;

      if (aUnreported && !bUnreported) return -1;
      if (!aUnreported && bUnreported) return 1;
      if (aUnreported && bUnreported) {
        const aTime = a.lastMealReportAt?.getTime() || 0;
        const bTime = b.lastMealReportAt?.getTime() || 0;
        return aTime - bTime;
      }

      const aTime = a.lastMealReportAt?.getTime() || 0;
      const bTime = b.lastMealReportAt?.getTime() || 0;
      return bTime - aTime;
    });
  }, [users]);

  const filteredUsers = useMemo(() => {
    return sortedUsers.filter((user) => {
      if (searchQuery && !user.displayName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter !== "all" && getUserStatus(user) !== statusFilter) return false;
      return true;
    });
  }, [sortedUsers, searchQuery, statusFilter]);

  const alertCount = useMemo(() => users.filter((u) => hasNoGoal(u) || isUnreported(u)).length, [users]);
  const okCount = useMemo(() => users.filter((u) => !hasNoGoal(u) && !isUnreported(u)).length, [users]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <div className="h-5 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-slate-100 rounded animate-pulse mt-1" />
            </div>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl px-3 py-2.5 border border-slate-100">
                <div className="h-2.5 w-8 bg-slate-100 rounded animate-pulse" />
                <div className="h-6 w-10 bg-slate-200 rounded animate-pulse mt-2" />
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                  <div className="h-3 w-40 bg-slate-100 rounded animate-pulse mt-1.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-800 tracking-tight">Omakase</h1>
            <p className="text-[11px] text-slate-400">クライアント管理</p>
          </div>
          <div className="flex items-center gap-3">
            {alertCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {alertCount}
              </span>
            )}
            <span className="text-xs text-slate-400 tabular-nums">
              {users.length}名
            </span>
            {tenantId && <NotificationBell tenantId={tenantId} />}
            <Link
              href="/settings"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Summary */}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl px-3 py-2.5 border border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">全体</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{users.length}</p>
          </div>
          <div className={`rounded-xl px-3 py-2.5 border ${alertCount > 0 ? "bg-red-50 border-red-100" : "bg-white border-slate-100"}`}>
            <p className="text-[10px] text-red-400 uppercase tracking-wider">要対応</p>
            <p className={`text-xl font-bold tabular-nums ${alertCount > 0 ? "text-red-600" : "text-slate-300"}`}>{alertCount}</p>
          </div>
          <div className="bg-white rounded-xl px-3 py-2.5 border border-slate-100">
            <p className="text-[10px] text-emerald-500 uppercase tracking-wider">正常</p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">{okCount}</p>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      {users.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 pt-2 flex flex-col gap-2">
          <input
            type="text"
            placeholder="名前で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex gap-1.5">
            {(["all", "no_goal", "unreported", "ok"] as const).map((f) => {
              const labels = { all: "すべて", no_goal: "未設定", unreported: "未報告", ok: "正常" };
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === f
                      ? "bg-slate-800 text-white"
                      : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* User list */}
      <div className="max-w-2xl mx-auto px-4 py-3 flex flex-col gap-2">
        {users.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <p className="text-slate-400 text-sm">まだ登録ユーザーがいません</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
            <p className="text-slate-400 text-sm">該当するユーザーがいません</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const status = getUserStatus(user);
            return (
              <Link
                href={`/users/${user.lineUserId}`}
                key={user.lineUserId}
                className={`block bg-white rounded-xl border p-4 transition-all hover:shadow-md ${
                  status === "ok"
                    ? "border-slate-100"
                    : status === "unreported"
                    ? "border-red-200 shadow-[0_0_0_1px_rgba(239,68,68,0.1)]"
                    : "border-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.1)]"
                }`}
              >
                {/* Top row: avatar + name + status */}
                <div className="flex items-center gap-3">
                  <Avatar name={user.displayName} pictureUrl={user.pictureUrl} status={status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800 truncate">{user.displayName}</span>
                      {status === "no_goal" && (
                        <span className="flex-shrink-0 px-1.5 py-px rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                          未設定
                        </span>
                      )}
                      {status === "unreported" && (
                        <span className="flex-shrink-0 px-1.5 py-px rounded text-[10px] font-semibold bg-red-100 text-red-600">
                          {getUnreportedLabel(user)}
                        </span>
                      )}
                      {status === "ok" && (
                        <span className="flex-shrink-0 px-1.5 py-px rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600">
                          OK
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      最終アクティブ {getLastActiveLabel(user)}
                      {user.lastMealReportAt && (
                        <> / 食事報告 {formatDistanceToNow(user.lastMealReportAt, { addSuffix: true, locale: ja })}</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Bottom row: goal info or CTA */}
                <div className="mt-3 ml-[52px]">
                  {user.nutritionalGoal ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline gap-2">
                        {(() => {
                          const isToday = user.todayDate === new Date().toISOString().slice(0, 10);
                          const todayCal = isToday ? (user.todayCalories || 0) : 0;
                          const pct = Math.round((todayCal / user.nutritionalGoal!.targetCalories) * 100);
                          return (
                            <>
                              <span className={`text-xs font-bold tabular-nums ${pct > 100 ? "text-red-600" : "text-slate-700"}`}>
                                {todayCal}
                                <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                                  / {user.nutritionalGoal!.targetCalories} kcal
                                </span>
                              </span>
                              <span className={`text-[10px] font-semibold tabular-nums ${pct > 100 ? "text-red-500" : pct > 0 ? "text-emerald-500" : "text-slate-400"}`}>
                                {pct}%
                              </span>
                            </>
                          );
                        })()}
                        {user.personalInfo?.purpose && (
                          <span className="text-[10px] text-slate-400">
                            {user.personalInfo.purpose === "lose_weight" ? "減量" : user.personalInfo.purpose === "bulk_up" ? "増量" : "維持"}
                          </span>
                        )}
                      </div>
                      <PFCBar goal={user.nutritionalGoal} />
                    </div>
                  ) : (
                    <Link
                      href={`/users/${user.lineUserId}/goal`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      目標を設定する
                    </Link>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
