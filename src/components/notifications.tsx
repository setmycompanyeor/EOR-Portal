"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";

export type NotificationItem = { id: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string };

export function NotificationsBell({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        className="btn relative h-[34px] min-h-0 w-[34px] px-0"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-ink px-1 text-[11px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-20 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" className="text-[13px] text-brand" disabled={pending} onClick={() => start(() => markAllNotificationsRead())}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-ink-muted">Nothing yet.</li>}
            {items.map((n) => {
              const inner = (
                <>
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    <div className="min-w-0">
                      <div className={`text-sm ${n.read_at ? "" : "font-medium"}`}>{n.title}</div>
                      {n.body && <div className="text-[13px] text-ink-muted">{n.body}</div>}
                      <div className="mt-0.5 text-[12px] text-ink-soft">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </>
              );
              const cls = "block px-4 py-3 text-ink hover:bg-canvas border-b border-line-soft last:border-b-0";
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className={cls}
                      onClick={() => {
                        setOpen(false);
                        if (!n.read_at) start(() => markNotificationRead(n.id));
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" className={`${cls} w-full text-left`} onClick={() => !n.read_at && start(() => markNotificationRead(n.id))}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
