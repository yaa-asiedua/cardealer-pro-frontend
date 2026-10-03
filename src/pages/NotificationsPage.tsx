import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "../lib/api-client";
import { formatDateTime } from "../lib/format";
import { NOTIFICATION_CATEGORY_LABELS, notificationCategory } from "../lib/notification-helpers";
import type { NotificationCategory } from "../lib/notification-helpers";
import type { AppNotification, NotificationListResult } from "../types";

const CATEGORIES: (NotificationCategory | "ALL")[] = [
  "ALL",
  "FOLLOWUP",
  "APPLICATIONS",
  "CUSTOMERS",
  "PAYMENTS",
  "SERVICE_JOBS",
  "PARTS",
  "SYSTEM",
];

export function NotificationsPage() {
  const [all, setAll] = useState<AppNotification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [category, setCategory] = useState<NotificationCategory | "ALL">("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Category counts are derived client-side from a single fetch — the
  // backend doesn't bucket by category (type is free-text, not an enum) —
  // same "accurate up to the fetched page" tradeoff used elsewhere in this
  // app (e.g. Inventory's aging check).
  const load = useCallback(() => {
    api
      .get<NotificationListResult>("/notifications?page=1&pageSize=100")
      .then((res) => {
        setAll(res.data);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkRead(n: AppNotification) {
    if (n.isRead) return;
    await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    load();
  }

  async function handleMarkAllRead() {
    await api.post("/notifications/read-all").catch(() => undefined);
    load();
  }

  const counts = useMemo(() => {
    const result: Record<NotificationCategory | "ALL", number> = {
      ALL: all?.length ?? 0,
      FOLLOWUP: 0,
      APPLICATIONS: 0,
      CUSTOMERS: 0,
      PAYMENTS: 0,
      SERVICE_JOBS: 0,
      PARTS: 0,
      SYSTEM: 0,
    };
    for (const n of all ?? []) result[notificationCategory(n.type)]++;
    return result;
  }, [all]);

  const visible = useMemo(() => {
    return (all ?? []).filter((n) => {
      if (unreadOnly && n.isRead) return false;
      if (category !== "ALL" && notificationCategory(n.type) !== category) return false;
      return true;
    });
  }, [all, category, unreadOnly]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <Bell size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">Notifications</h1>
          <p className="text-sm text-muted">Stay updated on important alerts, reminders and activities.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              category === c ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
            }`}
          >
            {c === "ALL" ? "All" : NOTIFICATION_CATEGORY_LABELS[c]} ({counts[c]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            unreadOnly ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
          }`}
        >
          Unread ({unreadCount})
        </button>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="ml-auto flex items-center gap-1.5 text-sm font-medium text-action hover:underline"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {!all || visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Bell size={24} className="text-muted" />
            <p className="text-sm text-muted">No notifications to show.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleMarkRead(n)}
                  className={`block w-full px-5 py-4 text-left transition-colors hover:bg-surface ${
                    n.isRead ? "" : "bg-action/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-ink">{n.title}</span>
                      <span className="ml-2 text-xs text-muted">{NOTIFICATION_CATEGORY_LABELS[notificationCategory(n.type)]}</span>
                    </div>
                    {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-action" />}
                  </div>
                  {n.message && <p className="mt-1 text-sm text-muted">{n.message}</p>}
                  <p className="mt-1.5 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
