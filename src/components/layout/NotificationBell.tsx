import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api-client";
import { formatDateTime } from "../../lib/format";
import type { AppNotification, NotificationListResult } from "../../types";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api
      .get<NotificationListResult>("/notifications?pageSize=8")
      .then((res) => {
        setNotifications(res.data);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleMarkRead(id: string) {
    await api.post(`/notifications/${id}/read`).catch(() => undefined);
    refresh();
  }

  async function handleMarkAllRead() {
    await api.post("/notifications/read-all").catch(() => undefined);
    refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs font-medium text-action hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No notifications yet</p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => !n.isRead && handleMarkRead(n.id)}
                      className={`block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-surface ${
                        n.isRead ? "" : "bg-action/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{n.title}</span>
                        {!n.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-action" />}
                      </div>
                      {n.message && <p className="mt-0.5 text-muted">{n.message}</p>}
                      <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setIsOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-action hover:bg-surface"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
