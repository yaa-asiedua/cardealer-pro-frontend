import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Car, Clock, History, Printer, RotateCcw } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { formatCurrency, formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { ServiceJob, ServiceJobListResult, ServiceType } from "../types/service";

type Tab = "" | "MONTH" | "3M" | "6M" | "YEAR";
const TABS: { key: Tab; label: string; monthsBack: number | null }[] = [
  { key: "", label: "All Records", monthsBack: null },
  { key: "MONTH", label: "This Month", monthsBack: 0 },
  { key: "3M", label: "Last 3 Months", monthsBack: 2 },
  { key: "6M", label: "Last 6 Months", monthsBack: 5 },
  { key: "YEAR", label: "Last Year", monthsBack: 11 },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function monthKey(d: Date | string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short" });
}

function percentChange(current: number, previous: number): string | undefined {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change vs last month";
  return `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}% vs last month`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} min`;
}

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, status: "COMPLETED", pageSize: "1" }).toString();
  const res = await api.get<ServiceJobListResult>(`/service/jobs?${query}`);
  return res.meta.total;
}

const TYPE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8"];

// Reconciled against mechanic_pages/service history.jpeg. Fifth and
// final real page for this role — Work Orders folded into Service Jobs
// and Vehicle Inspections dropped entirely (see earlier rounds), so the
// nav this page completes is: Dashboard, Service Jobs, Maintenance
// Schedule, Parts Requests, Service History, Reports, Notifications.
//
// This one needed the least reconciliation of any Mechanic page so far
// — it's a completed-jobs view, and ServiceJob already carries
// everything the mockup wants. Two real backend additions: `vehicleId`
// now filters GET /service/jobs (powers "View Vehicle History" — Admin
// and Mechanic both scoped the same way as every other filter there),
// and this page is the first caller of it.
//
// Two things changed:
// - No "Customer" column/field — same schema gap as every other Service
//   page this role has gotten.
// - The mockup's "Service Items" breakdown (Engine Oil, Oil Filter,
//   Labour) only shows parts + labour, quietly leaving out the job's
//   own `serviceCost` (auto-filled from the service menu) even though
//   it's real money that's part of the total. Added it back as its own
//   line rather than reproducing an undercount — the three lines now
//   genuinely sum to Total Cost.
// - "Service Type Breakdown" uses the real, exact ServiceType names
//   (same as every other Service Types chart this role has gotten),
//   not the mockup's invented "General Service/Repairs/Parts
//   Replacement/Others" taxonomy, which doesn't map cleanly onto the
//   real service menu.
//
// Quick Actions: "Create Service Job" dropped (Admin-only, same as
// every other round). "Schedule Maintenance" dropped (no standalone
// scheduling mechanism, same as every other round). "View Vehicle
// History" and "Print Service Record" are both real — kept, but moved
// into the Service Record Details panel since both need a selected job
// to act on, same treatment as Request Parts on the Service Jobs page.
export function ServiceHistoryPage() {
  const [tab, setTab] = useState<Tab>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<ServiceJobListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tabCounts, setTabCounts] = useState<Record<Tab, number | null>>({ "": null, MONTH: null, "3M": null, "6M": null, YEAR: null });
  const [completedJobs, setCompletedJobs] = useState<ServiceJob[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);

  const [selected, setSelected] = useState<ServiceJob | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab, vehicleFilter, serviceTypeFilter, dateFrom, dateTo]);

  const effectiveDateFrom = useMemo(() => {
    if (dateFrom) return dateFrom;
    const preset = TABS.find((t) => t.key === tab);
    return preset?.monthsBack != null ? isoDate(monthBounds(preset.monthsBack).start) : "";
  }, [dateFrom, tab]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10", status: "COMPLETED" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (vehicleFilter) params.set("vehicleId", vehicleFilter);
    if (serviceTypeFilter) params.set("serviceTypeId", serviceTypeFilter);
    if (effectiveDateFrom) params.set("dateFrom", effectiveDateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    api
      .get<ServiceJobListResult>(`/service/jobs?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load service history"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, vehicleFilter, serviceTypeFilter, effectiveDateFrom, dateTo]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    Promise.all(TABS.map((t) => fetchCount(t.monthsBack != null ? { dateFrom: isoDate(monthBounds(t.monthsBack).start) } : {}))).then(
      (counts) => setTabCounts(Object.fromEntries(TABS.map((t, i) => [t.key, counts[i]])) as Record<Tab, number>)
    );

    // Covers "this month" + "last month" for the flow KPI, plus feeds
    // every chart below — same bulk-fetch-then-derive approach used
    // throughout this role's pages. Accurate up to the 100 most recent
    // completed jobs, same documented tradeoff as elsewhere in this app.
    api
      .get<ServiceJobListResult>(`/service/jobs?status=COMPLETED&dateFrom=${isoDate(monthBounds(5).start)}&pageSize=100`)
      .then((res) => setCompletedJobs(res.data))
      .catch(() => setCompletedJobs([]));

    api
      .get<{ data: ServiceType[] }>("/service-types")
      .then((res) => setServiceTypes(res.data.filter((t) => t.isActive)))
      .catch(() => setServiceTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(loadSummary, [loadSummary]);

  const { gridStroke, tickFill } = useChartTheme();

  const vehicleOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const j of completedJobs) byId.set(j.vehicleId, vehicleDisplayName(j.vehicle));
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [completedJobs]);

  const vehiclesServiced = useMemo(() => new Set(completedJobs.map((j) => j.vehicleId)).size, [completedJobs]);

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  const thisMonthCohort = useMemo(() => {
    const count = (from: Date, to: Date) =>
      completedJobs.filter((j) => j.completedAt && new Date(j.completedAt) >= from && new Date(j.completedAt) <= to).length;
    return { thisMonth: count(monthStart, new Date()), lastMonth: count(lastMonthStart, lastMonthEnd) };
  }, [completedJobs, monthStart, lastMonthStart, lastMonthEnd]);

  const averageServiceMinutes = useMemo(() => {
    const durations = completedJobs
      .filter((j) => j.startedAt && j.completedAt)
      .map((j) => (new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime()) / 60000);
    if (durations.length === 0) return null;
    return durations.reduce((sum, m) => sum + m, 0) / durations.length;
  }, [completedJobs]);

  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of completedJobs) {
      const name = j.serviceType?.name ?? "Unspecified";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [completedJobs]);

  const monthlyTrend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of completedJobs) {
      if (!j.completedAt) continue;
      const key = monthKey(j.completedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort().map(([key, count]) => ({ month: monthLabel(key), count }));
  }, [completedJobs]);

  function resetFilters() {
    setSearch("");
    setVehicleFilter("");
    setServiceTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setTab("");
  }

  const selectedDurationMinutes =
    selected?.startedAt && selected?.completedAt
      ? (new Date(selected.completedAt).getTime() - new Date(selected.startedAt).getTime()) / 60000
      : null;

  const serviceItemRows = useMemo(() => {
    if (!selected) return [];
    const rows: { item: string; qty: string; unitCost: number; total: number }[] = [];
    if (selected.serviceCost && Number(selected.serviceCost) > 0) {
      rows.push({ item: selected.serviceType?.name ?? "Service", qty: "1", unitCost: Number(selected.serviceCost), total: Number(selected.serviceCost) });
    }
    for (const p of selected.parts ?? []) {
      rows.push({ item: p.partName, qty: String(p.quantity), unitCost: Number(p.unitCost), total: Number(p.totalCost) });
    }
    if (selected.labourCost && Number(selected.labourCost) > 0) {
      rows.push({ item: "Labour", qty: "1", unitCost: Number(selected.labourCost), total: Number(selected.labourCost) });
    }
    return rows;
  }, [selected]);

  const selectedTotal = selected
    ? Number(selected.serviceCost ?? 0) + Number(selected.partsCost ?? 0) + Number(selected.labourCost ?? 0)
    : 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <History size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">Service History</h1>
          <p className="text-sm text-muted">Your complete service record, maintenance history, and service timelines.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Service Records" value={String(tabCounts[""] ?? "—")} sublabel="All-time" icon={History} />
        <KpiCard label="Vehicles Serviced" value={String(vehiclesServiced)} sublabel="Among recent records" icon={Car} />
        <KpiCard
          label="This Month"
          value={String(thisMonthCohort.thisMonth)}
          sublabel={percentChange(thisMonthCohort.thisMonth, thisMonthCohort.lastMonth) ?? "This month"}
          icon={History}
        />
        <KpiCard
          label="Average Service Time"
          value={averageServiceMinutes != null ? formatDuration(averageServiceMinutes) : "—"}
          sublabel="Avg across completed jobs"
          icon={Clock}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key || "ALL"}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t.key ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {t.label} ({tabCounts[t.key] ?? "—"})
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by job no. or vehicle…"
              className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            >
              <option value="">All Vehicles</option>
              {vehicleOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={serviceTypeFilter}
              onChange={(e) => setServiceTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            >
              <option value="">All Service Types</option>
              {serviceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action" />
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Job No.</th>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Service Type</th>
                    <th className="px-4 py-3 font-semibold">Service Date</th>
                    <th className="px-4 py-3 font-semibold">Mileage (km)</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-danger">
                        {error}
                      </td>
                    </tr>
                  ) : !result || result.data.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted">
                        No service records match these filters.
                      </td>
                    </tr>
                  ) : (
                    result.data.map((job) => {
                      const total = Number(job.serviceCost ?? 0) + Number(job.partsCost ?? 0) + Number(job.labourCost ?? 0);
                      return (
                        <tr
                          key={job.id}
                          onClick={() => setSelected(job)}
                          className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selected?.id === job.id ? "bg-action/5" : ""}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-action">{job.jobNumber}</td>
                          <td className="px-4 py-3 text-ink">{vehicleDisplayName(job.vehicle)}</td>
                          <td className="px-4 py-3 text-xs text-muted">{job.serviceType?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted">{job.completedAt ? formatDate(job.completedAt) : "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted">{job.vehicle.mileage != null ? job.vehicle.mileage.toLocaleString() : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(total)}</td>
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
                  {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} records
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
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

        <SectionCard title="Service Record Details">
          {!selected ? (
            <p className="py-6 text-center text-sm text-muted">Select a record to view its details.</p>
          ) : (
            <div id="service-record-print" className="flex flex-col gap-3 text-sm">
              <div>
                <div className="font-medium text-ink">{selected.jobNumber}</div>
                <div className="text-xs text-muted">{vehicleDisplayName(selected.vehicle)}</div>
              </div>
              <dl className="flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between"><dt className="text-muted">Service Date</dt><dd className="text-ink">{selected.completedAt ? formatDate(selected.completedAt) : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Mileage</dt><dd className="text-ink">{selected.vehicle.mileage != null ? `${selected.vehicle.mileage.toLocaleString()} km (current)` : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Service Type</dt><dd className="text-ink">{selected.serviceType?.name ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Mechanic</dt><dd className="text-ink">{selected.assignedMechanic.fullName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Duration</dt><dd className="text-ink">{selectedDurationMinutes != null ? formatDuration(selectedDurationMinutes) : "—"}</dd></div>
              </dl>

              {serviceItemRows.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-ink">Service Items</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-1 font-medium">Item</th>
                        <th className="py-1 text-right font-medium">Qty</th>
                        <th className="py-1 text-right font-medium">Unit</th>
                        <th className="py-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceItemRows.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1 text-ink">{r.item}</td>
                          <td className="py-1 text-right text-ink">{r.qty}</td>
                          <td className="py-1 text-right text-ink">{formatCurrency(r.unitCost)}</td>
                          <td className="py-1 text-right text-ink">{formatCurrency(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                <span className="text-xs font-medium text-ink">Total Cost</span>
                <span className="text-sm font-semibold text-ink">{formatCurrency(selectedTotal)}</span>
              </div>

              {selected.notes && (
                <div>
                  <div className="mb-1 text-xs font-medium text-ink">Notes</div>
                  <p className="text-xs text-muted">{selected.notes}</p>
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-3 print:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setVehicleFilter(selected.vehicleId);
                    setTab("");
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
                >
                  <Car size={14} />
                  View Vehicle History
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
                >
                  <Printer size={14} />
                  Print Service Record
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Service Type Breakdown">
          {typeBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No completed jobs in the last 6 months.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={typeBreakdown} dataKey="count" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2}>
                    {typeBreakdown.map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <div className="text-2xl font-semibold tabular-nums text-ink">{completedJobs.length}</div>
                <p className="mb-2 text-xs text-muted">Records (last 6 months, up to 100)</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {typeBreakdown.slice(0, 6).map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                        {d.name}
                      </span>
                      <span className="font-medium text-ink">
                        {d.count} ({Math.round((d.count / completedJobs.length) * 100)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Monthly Service Trend">
          {monthlyTrend.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No completed jobs in the last 6 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart accessibilityLayer data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Completed Jobs" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
