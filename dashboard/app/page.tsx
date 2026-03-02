// dashboard/src/app/page.tsx
"use client"; // Next.jsでReactのフック(useState等)を使うための宣言

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../src/lib/firebase";
import { AppUser } from "../src/types";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import Link from "next/link";

export default function DashboardOverview() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const BOT_ID = "Uf6b83d5863bf2547760bf6e86bcd658a";
  useEffect(() => {
    if (!BOT_ID) return;

    // 1. Create query: fetch 'users' collection by the descending order of 'lastMessageAt'
    const usersRef = collection(db, `tenants/${BOT_ID}/users`);
    const q = query(usersRef, orderBy("lastMessageAt", "desc"));

    // 2. Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedUsers = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          lineUserId: doc.id,
          // Convert Firestore Timestamp to JavaScript Date
          lastMessageAt: data.lastMessageAt?.toDate() || new Date(),
        } as AppUser;
      });

      setUsers(fetchedUsers);
      setLoading(false);
    });

    // 3. Clean up listener on unmount
    return () => unsubscribe();
  }, [BOT_ID]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-8">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow overflow-hidden">
        <div className="p-6 border-b bg-gray-100 flex justify-between items-center">
          <h1 className="font-bold text-xl">クライアント管理ダッシュボード</h1>
        </div>
        
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center text-gray-500">読み込み中...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">まだ登録ユーザーがいません</div>
          ) : (
            users.map((user) => (
              <div key={user.lineUserId} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                
                {/* ユーザー情報 */}
                <div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="font-bold text-lg">{user.displayName}</span>
                    <span className="text-sm text-gray-400">
                      最終アクセス: {format(user.lastMessageAt, "MM/dd HH:mm", { locale: ja })}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">ID: {user.lineUserId}</div>
                </div>

                {/* 目標ステータス & アクションボタン */}
                <div className="text-right">
                  {user.nutritionalGoal ? (
                    <div className="flex flex-col items-end">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mb-2">
                        目標設定済み
                      </span>
                      <span className="text-sm font-semibold text-gray-700">
                        {user.nutritionalGoal.targetCalories} kcal / P:{user.nutritionalGoal.protein}g F:{user.nutritionalGoal.fat}g C:{user.nutritionalGoal.carbs}g
                      </span>
                    </div>
                  ) : (
                    <Link 
                      href={`/users/${user.lineUserId}/goal`}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      目標を設定する
                    </Link>
                  )}
                </div>
                
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}