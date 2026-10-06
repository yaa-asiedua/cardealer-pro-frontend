import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, CheckSquare, Clock, Mail, MessageCircle, Phone, RotateCcw, Users } from "lucide-react";
import { AddFollowupModal } from "../components/followups/AddFollowupModal";
import { SectionCard } from "../components/dashboard/SectionCard";
import { KpiCard } from "../components/dashboard/KpiCard";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api-client";
import { FOLLOWUP_STATUS_LABELS, FOLLOWUP_STATUS_STYLES, FOLLOWUP_TYPE_LABELS, followupStatus } from "../lib/followup-helpers";
import { formatDateTime } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { customerDisplayName } from "../types/customer";
import type { Followup, FollowupListResult, FollowupStatus, FollowupType } from "../types/followup";

const TYPE_ICONS: Record<FollowupType, typeof Phone> = {
  CALL: Phone,
  MEETING: Users,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
};

const inputCls = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink";

export function FollowupsPage() {
  const { user } = useAuth();
  const isRental = user?.role === "RENTAL_SALESPERSON";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FollowupStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<FollowupType | "">("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<FollowupListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [allForCounts, setAllForCounts] = useState<Followup[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "8" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);

    api
      .get<FollowupListResult>(`/followups?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load follow-ups"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, typeFilter]);

  const loadCounts = useCallback(() => {
    api
      .get<FollowupListResult>("/followups?pageSize=100")
      .then((res) => setAllForCounts(res.data))
      .catch(() => setAllForCounts(null));
  }, []);

  useEffect(loadList, [loadList]);
  useEffect(loadCounts, [loadCounts]);

  function refreshAll() {
    loadList();
    loadCounts();
  }

  const counts = useMemo(() => {
    const c = { total: 0, dueToday: 0, completed: 0, overdue: 0, upcoming: 0 };
    for (const f of allForCounts ?? []) {
      c.total++;
      const s = followupStatus(f);
      if (s === "DUE_TODAY") c.dueToday++;
      else if (s === "COMPLETED") c.completed++;
      else if (s === "OVERDUE") c.overdue++;
      else c.upcoming++;
    }
    return c;
  }, [allForCounts]);

  const typeCounts = useMemo(() => {
    const c: Record<FollowupType, number> = { CALL: 0, MEETING: 0, WHATSAPP: 0, EMAIL: 0 };
    for (const f of allForCounts ?? []) c[f.type]++;
    return c;
  }, [allForCounts]);

  const upcoming = useMemo(() => {
    return (allForCounts ?? [])
      .filter((f) => !f.completed)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 4);
  }, [allForCounts]);

  async function toggleComplete(f: Followup) {
    try {
      await api.patch(`/followups/${f.id}`, { completed: !f.completed });
      refreshAll();
    } catch {
      // Inline list refresh will simply show the unchanged state — the
      // action button itself doesn't need a separate error toast here.
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <CheckSquare size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Follow-ups</h1>
            <p className="text-sm text-muted">
              {isRental
                ? "Track and manage customer follow-ups for rentals."
                : "Manage your customer follow-ups and stay on top of your sales opportunities."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="shrink-0 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          + Add Follow-up
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Follow-ups" value={String(counts.total)} icon={Users} />
        <KpiCard label="Due Today" value={String(counts.dueToday)} icon={Clock} tone={counts.dueToday > 0 ? "warning" : "default"} />
        <KpiCard label="Completed" value={String(counts.completed)} icon={CheckSquare} tone="success" />
        <KpiCard label="Overdue" value={String(counts.overdue)} icon={Calendar} tone={counts.overdue > 0 ? "danger" : "default"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["", "DUE_TODAY", "OVERDUE", "UPCOMING", "COMPLETED"] as const).map((s) => (
              <button
                key={s || "ALL"}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  statusFilter === s ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {s === "" ? `All (${counts.total})` : `${FOLLOWUP_STATUS_LABELS[s]} (${
                  s === "DUE_TODAY" ? counts.dueToday : s === "OVERDUE" ? counts.overdue : s === "UPCOMING" ? counts.upcoming : counts.completed
                })`}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, phone, or vehicle…"
              className={`${inputCls} w-64`}
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as FollowupType | "")} className={inputCls}>
              <option value="">All Types</option>
              {(Object.keys(FOLLOWUP_TYPE_LABELS) as FollowupType[]).map((t) => (
                <option key={t} value={t}>
                  {FOLLOWUP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="sticky-actions w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    {isRental && <th className="px-4 py-3 font-semibold">Rental Ref</th>}
                    <th className="px-4 py-3 font-semibold">{isRental ? "Vehicle" : "Vehicle of Interest"}</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Due</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={isRental ? 7 : 6} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : !result || result.data.length === 0 ? (
                    <tr>
                      <td colSpan={isRental ? 7 : 6} className="px-4 py-10 text-center text-muted">
                        No follow-ups match these filters.
                      </td>
                    </tr>
                  ) : (
                    result.data.map((f) => {
                      const Icon = TYPE_ICONS[f.type];
                      const status = followupStatus(f);
                      return (
                        <tr key={f.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">{customerDisplayName(f.customer)}</div>
                            <div className="text-xs text-muted">{f.customer.phone ?? "—"}</div>
                          </td>
                          {isRental && <td className="px-4 py-3 text-xs text-muted">{f.rental?.rentalNumber ?? "—"}</td>}
                          <td className="px-4 py-3 text-ink">{f.vehicle ? vehicleDisplayName(f.vehicle) : "—"}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 text-ink">
                              <Icon size={14} className="text-action" />
                              {FOLLOWUP_TYPE_LABELS[f.type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">{formatDateTime(f.dueAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${FOLLOWUP_STATUS_STYLES[status]}`}>
                              {FOLLOWUP_STATUS_LABELS[status]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => toggleComplete(f)} className="text-xs font-medium text-action hover:underline">
                              {f.completed ? "Reopen" : "Mark done"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {result && result.meta.pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                <span className="text-muted">
                  Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
                  {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} follow-ups
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= result.meta.pageCount}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Upcoming Reminders">
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Nothing upcoming.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcoming.map((f) => {
                  const Icon = TYPE_ICONS[f.type];
                  return (
                    <li key={f.id} className="flex items-start gap-2">
                      <Icon size={16} className="mt-0.5 shrink-0 text-action" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{customerDisplayName(f.customer)}</p>
                        <p className="text-xs text-muted">{formatDateTime(f.dueAt)}</p>
                        {f.notes && <p className="truncate text-xs text-muted">{f.notes}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Follow-up Types">
            <ul className="flex flex-col gap-2">
              {(Object.keys(FOLLOWUP_TYPE_LABELS) as FollowupType[]).map((t) => {
                const Icon = TYPE_ICONS[t];
                return (
                  <li key={t} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-ink">
                      <Icon size={14} className="text-action" />
                      {FOLLOWUP_TYPE_LABELS[t]}
                    </span>
                    <span className="font-medium text-ink">{typeCounts[t]}</span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </div>
      </div>

      {showAddModal && (
        <AddFollowupModal
          onClose={() => setShowAddModal(false)}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}
