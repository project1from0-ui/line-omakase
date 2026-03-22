"use client";

import { useEffect, useState, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

interface Notification {
  id: string;
  type: string;
  message: string;
  createdAt: Date;
  read: boolean;
}

export function NotificationBell({ tenantId }: { tenantId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const notifsRef = collection(db, `tenants/${tenantId}/notifications`);
    const q = query(notifsRef, orderBy("createdAt", "desc"), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          message: data.message,
          createdAt: data.createdAt?.toDate() || new Date(),
          read: data.read || false,
        } as Notification;
      });
      setNotifications(items);
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, `tenants/${tenantId}/notifications`, id), { read: true });
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markAsRead(n.id)));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-700">通知</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                すべて既読にする
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-400">通知はありません</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && markAsRead(n.id)}
                  className={`px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${
                    !n.read ? "bg-blue-50/50" : ""
                  }`}
                >
                  <p className="text-xs text-slate-700 leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ja })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
