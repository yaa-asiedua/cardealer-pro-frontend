import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, RotateCcw, ShieldAlert, Users as UsersIcon } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { api } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { downloadCsv } from "../lib/csv";
import { formatDateTime, formatEnumLabel } from "../lib/format";
import { ROLE_LABELS } from "../lib/nav-config";
import type { AuditLog, AuditLogListResult } from "../types/audit";
import type { Employee, EmployeeListResult } from "../types/employee";
import type { RoleCode } from "../types";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayKey(d: Date | string): string {
  return isoDate(new Date(d));
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<AuditLogListResult>(`/admin/audit-logs?${query}`);
  return res.meta.total;
}

const ENTITY_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8", "#db2777", "#059669", "#ca8a04", "#4f46e5"];

function roleLabel(code: string | null): string {
  if (!code) return "—";
  return ROLE_LABELS[code as RoleCode] ?? code;
}

// No mockup exists for this page — Audit Logs was the one nav item
// (Admin) still falling through to ComingSoon after every mockup-driven
// role was finished. Built directly from the real data shape instead:
// `AuditLog` already carries everything a viewer needs (actor, role at
// the time, action, entity, before/after values, IP, timestamp) — ENG-25's
// read side, written to since Phase 2 by every module in this app.
//
// Two small backend additions: `search` (matches action or entityType)
// and an exact-match `action` filter — `GET /admin/audit-logs` only
// ever supported userId/entityType/entityId/date range before. Both
// vocabularies (35 actions, 11 entity types, grepped directly from
// every `recordAudit()` call site) are small and real, not guessed —
// dropdowns are derived from whatever's in the current filtered load
// rather than hardcoded, so they can't drift out of sync with the code.
//
// "Failed Logins" KPI reuses the exact same `action` filter
// (LOGIN_FAILED) — a real, already-recorded security signal, not a new
// computation. "Distinct Users Active" and the two charts are derived
// from one bulk fetch (up to 200 rows, the endpoint's own pageSize
// cap) — same "accurate up to the fetched page" tradeoff documented
// elsewhere in this app. "Export" produces a real CSV of the current
// filtered table page (`lib/csv.ts`, no PDF export exists anywhere in
// this app), same pattern as every other Generate Report/Export button.
export function AuditLogsPage() {
  const { gridStroke, tickFill } = useChartTheme();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<AuditLogListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [failedLoginCount, setFailedLoginCount] = useState<number | null>(null);
  const [bulkLogs, setBulkLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<Employee[]>([]);

  const [selected, setSelected] = useState<AuditLog | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, userFilter, entityTypeFilter, actionFilter, dateFrom, dateTo]);

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (userFilter) p.userId = userFilter;
    if (entityTypeFilter) p.entityType = entityTypeFilter;
    if (actionFilter) p.action = actionFilter;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [debouncedSearch, userFilter, entityTypeFilter, actionFilter, dateFrom, dateTo]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ ...filterParams, page: String(page), pageSize: "20" });
    api
      .get<AuditLogListResult>(`/admin/audit-logs?${params.toString()}`)
      .then(setResult)
      .catch(() => setError("Failed to load audit logs"))
      .finally(() => setIsLoading(false));
  }, [filterParams, page]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    fetchCount(filterParams).then(setTotalCount).catch(() => setTotalCount(null));
    fetchCount({ ...filterParams, dateFrom: isoDate(new Date()) }).then(setTodayCount).catch(() => setTodayCount(null));
    fetchCount({ ...filterParams, action: "LOGIN_FAILED" }).then(setFailedLoginCount).catch(() => setFailedLoginCount(null));

    const params = new URLSearchParams({ ...filterParams, pageSize: "200" });
    api
      .get<AuditLogListResult>(`/admin/audit-logs?${params.toString()}`)
      .then((res) => setBulkLogs(res.data))
      .catch(() => setBulkLogs([]));
  }, [filterParams]);

  useEffect(loadSummary, [loadSummary]);

  useEffect(() => {
    api
      .get<EmployeeListResult>("/admin/users?pageSize=100")
      .then((res) => setUsers(res.data))
      .catch(() => setUsers([]));
  }, []);

  const distinctUsersActive = useMemo(() => new Set(bulkLogs.map((l) => l.userId)).size, [bulkLogs]);

  const entityTypeOptions = useMemo(() => [...new Set(bulkLogs.map((l) => l.entityType))].sort(), [bulkLogs]);
  const actionOptions = useMemo(() => [...new Set(bulkLogs.map((l) => l.action))].sort(), [bulkLogs]);

  const entityBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of bulkLogs) counts.set(l.entityType, (counts.get(l.entityType) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [bulkLogs]);

  const dailyTrend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of bulkLogs) {
      const key = dayKey(l.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort().slice(-14).map(([key, count]) => ({ day: dayLabel(key), count }));
  }, [bulkLogs]);

  function resetFilters() {
    setSearch("");
    setUserFilter("");
    setEntityTypeFilter("");
    setActionFilter("");
    setDateFrom("");
    setDateTo("");
  }

  function handleExport() {
    if (!result || result.data.length === 0) return;
    const headers = ["Timestamp", "User", "Role", "Action", "Entity Type", "Entity ID", "IP Address"];
    const rows = result.data.map((l) => [
      formatDateTime(l.createdAt),
      l.user.fullName,
      roleLabel(l.roleCode),
      formatEnumLabel(l.action),
      formatEnumLabel(l.entityType),
      l.entityId ?? "",
      l.ipAddress ?? "",
    ]);
    downloadCsv(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Audit Logs</h1>
            <p className="text-sm text-muted">Track every action taken across the system — who did what, and when.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!result || result.data.length === 0}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Events" value={totalCount != null ? String(totalCount) : "—"} sublabel="Matching current filters" icon={ShieldAlert} />
        <KpiCard label="Today's Events" value={todayCount != null ? String(todayCount) : "—"} sublabel="Since midnight" icon={ShieldAlert} />
        <KpiCard
          label="Failed Logins"
          value={failedLoginCount != null ? String(failedLoginCount) : "—"}
          sublabel="Matching current filters"
          icon={ShieldAlert}
          tone={failedLoginCount && failedLoginCount > 0 ? "danger" : "default"}
        />
        <KpiCard label="Distinct Users Active" value={String(distinctUsersActive)} sublabel="Among recent events" icon={UsersIcon} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action or entity type…"
              className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action">
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
            <select value={entityTypeFilter} onChange={(e) => setEntityTypeFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action">
              <option value="">All Entity Types</option>
              {entityTypeOptions.map((t) => (
                <option key={t} value={t}>{formatEnumLabel(t)}</option>
              ))}
            </select>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action">
              <option value="">All Actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>{formatEnumLabel(a)}</option>
              ))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action" />
            <button type="button" onClick={resetFilters} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface">
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
                  ) : error ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-danger">{error}</td></tr>
                  ) : !result || result.data.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No audit events match these filters.</td></tr>
                  ) : (
                    result.data.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelected(log)}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selected?.id === log.id ? "bg-action/5" : ""}`}
                      >
                        <td className="px-4 py-3 text-xs text-muted">{formatDateTime(log.createdAt)}</td>
                        <td className="px-4 py-3 text-ink">
                          {log.user.fullName}
                          <span className="ml-1.5 text-xs text-muted">({roleLabel(log.roleCode)})</span>
                        </td>
                        <td className="px-4 py-3 text-ink">{formatEnumLabel(log.action)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatEnumLabel(log.entityType)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {result && result.meta.pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                <span className="text-muted">
                  Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–{Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} events
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={page >= result.meta.pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <SectionCard title="Event Details">
          {!selected ? (
            <p className="py-6 text-center text-sm text-muted">Select an event to view its details.</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <dl className="flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between"><dt className="text-muted">Timestamp</dt><dd className="text-ink">{formatDateTime(selected.createdAt)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">User</dt><dd className="text-ink">{selected.user.fullName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Role</dt><dd className="text-ink">{roleLabel(selected.roleCode)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Action</dt><dd className="text-ink">{formatEnumLabel(selected.action)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Entity Type</dt><dd className="text-ink">{formatEnumLabel(selected.entityType)}</dd></div>
                {selected.entityId && <div className="flex justify-between gap-2"><dt className="shrink-0 text-muted">Entity ID</dt><dd className="truncate font-mono text-ink">{selected.entityId}</dd></div>}
                {selected.ipAddress && <div className="flex justify-between"><dt className="text-muted">IP Address</dt><dd className="text-ink">{selected.ipAddress}</dd></div>}
              </dl>

              {selected.oldValues && (
                <div>
                  <div className="mb-1 text-xs font-medium text-ink">Before</div>
                  <pre className="overflow-x-auto rounded-lg bg-surface p-2 text-[11px] text-ink">{JSON.stringify(selected.oldValues, null, 2)}</pre>
                </div>
              )}
              {selected.newValues && (
                <div>
                  <div className="mb-1 text-xs font-medium text-ink">After</div>
                  <pre className="overflow-x-auto rounded-lg bg-surface p-2 text-[11px] text-ink">{JSON.stringify(selected.newValues, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Activity by Entity Type">
          {entityBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No events match these filters.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={entityBreakdown} dataKey="count" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2}>
                    {entityBreakdown.map((_, i) => (
                      <Cell key={i} fill={ENTITY_COLORS[i % ENTITY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <div className="text-2xl font-semibold tabular-nums text-ink">{bulkLogs.length}</div>
                <p className="mb-2 text-xs text-muted">Events (up to 200 most recent)</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {entityBreakdown.slice(0, 6).map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] }} />
                        {formatEnumLabel(d.name)}
                      </span>
                      <span className="font-medium text-ink">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Daily Activity (Last 14 Days)">
          {dailyTrend.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No events match these filters.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart accessibilityLayer data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="day" tick={{ fill: tickFill, fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
