import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../lib/api-client";
import { formatDateTime } from "../lib/format";
import type { AppNotification, NotificationListResult } from "../types";

export function NotificationsPage() {
  const [result, setResult] = useState<NotificationListResult | null>(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(() => {
    api
      .get<NotificationListResult>(`/notifications?page=${page}&pageSize=20&unreadOnly=${unreadOnly}`)
      .then(setResult)
      .catch(() => undefined);
  }, [page, unreadOnly]);

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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => {
              setPage(1);
              setUnreadOnly(e.target.checked);
            }}
            className="rounded border-border"
          />
          Unread only
        </label>
        {!!result?.unreadCount && (
          <button type="button" onClick={handleMarkAllRead} className="text-sm font-medium text-action hover:underline">
            Mark all read ({result.unreadCount})
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {!result || result.data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Bell size={24} className="text-muted" />
            <p className="text-sm text-muted">No notifications to show.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {result.data.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleMarkRead(n)}
                  className={`block w-full px-5 py-4 text-left transition-colors hover:bg-surface ${
                    n.isRead ? "" : "bg-action/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{n.title}</span>
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

      {result && result.meta.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted">
            Page {result.meta.page} of {result.meta.pageCount}
          </span>
          <button
            type="button"
            disabled={page >= result.meta.pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
