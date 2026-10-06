import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Banknote, CheckCircle2, ClipboardList, Download, History, Package, Wrench } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ServiceJobStatusBadge } from "../components/service/ServiceBadges";
import { api } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { PartRequest, PartRequestListResult, ServiceJob, ServiceJobListResult } from "../types/service";

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

const TYPE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8"];

const REPORT_SECTIONS: { id: string; label: string; hint: string }[] = [
  { id: "summary", label: "Service Summary Report", hint: "Jobs, revenue, and costs this month" },
  { id: "maintenance", label: "Maintenance Report", hint: "Scheduled and completed maintenance" },
  { id: "maintenance", label: "Overdue Maintenance Report", hint: "Vehicles with pending maintenance" },
  { id: "parts", label: "Parts Usage Report", hint: "Parts consumption and cost analysis" },
  { id: "detailed-report", label: "Vehicle Service History", hint: "Complete service history (below)" },
  { id: "summary", label: "Revenue Report", hint: "Workshop revenue and income analysis" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Reconciled against mechanic_pages/reportd.jpeg — sixth and final page
// for this role. The single biggest reconciliation point: the mockup's
// table and KPIs are shop-wide/cross-mechanic (the Mechanic column shows
// Kwame Asare, Daniel Amponsah, Ibrahim Sule, Mabel Animadu — several
// different people), which directly contradicts the PRD's own rule
// ("Mechanics cannot view or edit other mechanics' jobs") already
// enforced server-side on every /service/jobs call this role makes.
// Rescoped everything to the logged-in mechanic's own jobs, same as
// every other page this role has gotten — no backend changes needed,
// since that scoping is already the default for a non-Admin actor.
//
// "Mechanic Performance Report" (jobs completed by each mechanic)
// dropped from Report Shortcuts entirely for the same reason — there's
// no "each mechanic" view available to a Mechanic, by design.
//
// "Scheduled Reports" (Weekly Service Summary/Monthly Maintenance
// Report with Frequency/Next Run columns) dropped — no job scheduler
// exists anywhere in this codebase, same call made on Finance's Reports
// page. The mockup's 6 "Report Shortcuts" are real, though — rather
// than building 6 unbuilt sub-pages, they're scroll-to-section anchors
// on this one consolidated page, same pattern as Finance's Reports.
// "Generate Report"/"Export" produce a real CSV of the current filtered
// table (no PDF export exists anywhere in this app — same "no fake
// affordances" treatment as every other Generate Report button).
//
// Two real metrics derived from existing fields, not invented: "Service
// Revenue" (serviceCost + partsCost + labourCost across this month's
// completed jobs) and "Maintenance Cost" (partsCost alone) — distinct,
// non-redundant numbers from the same data, not two labels on one
// figure.
export function MechanicReportsPage() {
  const navigate = useNavigate();
  const { gridStroke, tickFill } = useChartTheme();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(isoDate(monthBounds(0).start));
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<ServiceJobListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [sixMonthJobs, setSixMonthJobs] = useState<ServiceJob[]>([]);
  const [partRequests, setPartRequests] = useState<PartRequest[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, serviceTypeFilter, vehicleFilter, dateFrom, dateTo]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (serviceTypeFilter) params.set("serviceTypeId", serviceTypeFilter);
    if (vehicleFilter) params.set("vehicleId", vehicleFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    api
      .get<ServiceJobListResult>(`/service/jobs?${params.toString()}`)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, serviceTypeFilter, vehicleFilter, dateFrom, dateTo]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    api
      .get<ServiceJobListResult>(`/service/jobs?dateFrom=${isoDate(monthBounds(5).start)}&pageSize=100`)
      .then((res) => setSixMonthJobs(res.data))
      .catch(() => setSixMonthJobs([]));

    api
      .get<PartRequestListResult>("/service/parts-requests?pageSize=100")
      .then((res) => setPartRequests(res.data))
      .catch(() => setPartRequests([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(loadSummary, [loadSummary]);

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  const cohort = useMemo(() => {
    const bucket = (from: Date, to: Date) => {
      const rows = sixMonthJobs.filter((j) => {
        const d = new Date(j.createdAt);
        return d >= from && d <= to;
      });
      const completed = rows.filter((j) => j.status === "COMPLETED");
      const revenue = completed.reduce((sum, j) => sum + Number(j.serviceCost ?? 0) + Number(j.partsCost ?? 0) + Number(j.labourCost ?? 0), 0);
      const maintenanceCost = completed.reduce((sum, j) => sum + Number(j.partsCost ?? 0), 0);
      return { total: rows.length, completed: completed.length, revenue, maintenanceCost };
    };
    return { thisMonth: bucket(monthStart, new Date()), lastMonth: bucket(lastMonthStart, lastMonthEnd) };
  }, [sixMonthJobs, monthStart, lastMonthStart, lastMonthEnd]);

  const vehicleOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const j of sixMonthJobs) byId.set(j.vehicleId, vehicleDisplayName(j.vehicle));
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sixMonthJobs]);

  const serviceTypeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const j of sixMonthJobs) if (j.serviceType) byId.set(j.serviceType.id, j.serviceType.name);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sixMonthJobs]);

  const monthlyJobsTrend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of sixMonthJobs) {
      const key = monthKey(j.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort().map(([key, count]) => ({ month: monthLabel(key), count }));
  }, [sixMonthJobs]);

  const revenueTrend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const j of sixMonthJobs) {
      if (j.status !== "COMPLETED" || !j.completedAt) continue;
      const key = monthKey(j.completedAt);
      const amount = Number(j.serviceCost ?? 0) + Number(j.partsCost ?? 0) + Number(j.labourCost ?? 0);
      totals.set(key, (totals.get(key) ?? 0) + amount);
    }
    return [...totals.entries()].sort().map(([key, revenue]) => ({ month: monthLabel(key), revenue: Math.round(revenue) }));
  }, [sixMonthJobs]);

  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of sixMonthJobs) {
      const name = j.serviceType?.name ?? "Unspecified";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [sixMonthJobs]);

  const vehiclePerformance = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of sixMonthJobs) counts.set(j.vehicle.make, (counts.get(j.vehicle.make) ?? 0) + 1);
    return [...counts.entries()].map(([make, count]) => ({ make, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [sixMonthJobs]);

  // Same suppressed-once-a-later-job-exists heuristic as Maintenance
  // Schedule — see that page's file-level comment for why.
  const maintenanceCounts = useMemo(() => {
    const now = new Date();
    const reminders = sixMonthJobs
      .filter((j) => j.nextServiceDate)
      .filter((j) => {
        const dueDate = new Date(j.nextServiceDate!);
        return !sixMonthJobs.some((other) => other.vehicleId === j.vehicleId && other.id !== j.id && new Date(other.createdAt) > dueDate);
      });
    const overdue = reminders.filter((j) => new Date(j.nextServiceDate!) < now).length;
    return { upcoming: reminders.length - overdue, overdue };
  }, [sixMonthJobs]);

  const partsSummary = useMemo(() => {
    const totalCost = partRequests.reduce((sum, r) => sum + Number(r.estimatedCost ?? 0), 0);
    const counts = new Map<string, number>();
    for (const r of partRequests) counts.set(r.partName, (counts.get(r.partName) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { total: partRequests.length, totalCost, topPart: top?.[0] ?? null };
  }, [partRequests]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setServiceTypeFilter("");
    setVehicleFilter("");
    setDateFrom("");
    setDateTo("");
  }

  function handleGenerateReport() {
    if (!result || result.data.length === 0) return;
    const headers = ["Job No.", "Vehicle", "Service Type", "Date", "Status", "Cost (GHS)"];
    const rows = result.data.map((j) => [
      j.jobNumber,
      vehicleDisplayName(j.vehicle),
      j.serviceType?.name ?? "",
      j.completedAt ? formatDate(j.completedAt) : formatDate(j.createdAt),
      j.status,
      (Number(j.serviceCost ?? 0) + Number(j.partsCost ?? 0) + Number(j.labourCost ?? 0)).toFixed(2),
    ]);
    downloadCsv(`service-report-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Reports</h1>
            <p className="text-sm text-muted">View and generate reports for your jobs, costs, and maintenance activity.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={!result || result.data.length === 0}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={16} />
          Generate Report
        </button>
      </div>

      <div id="summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Service Jobs"
          value={String(cohort.thisMonth.total)}
          sublabel={percentChange(cohort.thisMonth.total, cohort.lastMonth.total) ?? "This month"}
          icon={ClipboardList}
        />
        <KpiCard
          label="Service Revenue"
          value={formatCurrencyCompact(cohort.thisMonth.revenue)}
          sublabel={percentChange(cohort.thisMonth.revenue, cohort.lastMonth.revenue) ?? "This month"}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Completed Jobs"
          value={String(cohort.thisMonth.completed)}
          sublabel={percentChange(cohort.thisMonth.completed, cohort.lastMonth.completed) ?? "This month"}
          icon={CheckCircle2}
        />
        <KpiCard
          label="Maintenance Cost"
          value={formatCurrencyCompact(cohort.thisMonth.maintenanceCost)}
          sublabel={percentChange(cohort.thisMonth.maintenanceCost, cohort.lastMonth.maintenanceCost) ?? "This month"}
          icon={Wrench}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job no. or vehicle…"
          className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={serviceTypeFilter} onChange={(e) => setServiceTypeFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action">
          <option value="">All Service Types</option>
          {serviceTypeOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action">
          <option value="">All Vehicles</option>
          {vehicleOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action" />
        <button type="button" onClick={resetFilters} className="rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface">
          Reset
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SectionCard title="Monthly Service Jobs Trend">
          {monthlyJobsTrend.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No jobs in the last 6 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart accessibilityLayer data={monthlyJobsTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Service Revenue Trend">
          {revenueTrend.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No completed jobs in the last 6 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart accessibilityLayer data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 11 }} />
                <YAxis tick={{ fill: tickFill, fontSize: 11 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Service Type Breakdown">
          {typeBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No jobs in the last 6 months.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={typeBreakdown} dataKey="count" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={2}>
                    {typeBreakdown.map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {typeBreakdown.slice(0, 4).map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                      {d.name}
                    </span>
                    <span className="font-medium text-ink">{d.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard title="Vehicle Maintenance Performance">
          {vehiclePerformance.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No jobs in the last 6 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart accessibilityLayer data={vehiclePerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="make" tick={{ fill: tickFill, fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {vehiclePerformance.map((_, i) => (
                    <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div id="maintenance" className="lg:col-span-2">
          <SectionCard title="Maintenance Report">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface px-3 py-3 text-center">
                <div className="text-xl font-semibold tabular-nums text-ink">{maintenanceCounts.upcoming}</div>
                <div className="text-xs text-muted">Upcoming</div>
              </div>
              <div className="rounded-lg bg-danger/5 px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xl font-semibold tabular-nums text-danger">
                  <AlertTriangle size={16} />
                  {maintenanceCounts.overdue}
                </div>
                <div className="text-xs text-muted">Overdue</div>
              </div>
            </div>
            <button type="button" onClick={() => navigate("/maintenance-schedule")} className="mt-3 block text-sm font-medium text-action hover:underline">
              View Maintenance Schedule →
            </button>
          </SectionCard>
        </div>

        <div id="parts" className="lg:col-span-2">
          <SectionCard title="Parts Usage Report">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xl font-semibold tabular-nums text-ink">{partsSummary.total}</div>
                <div className="text-xs text-muted">Requests (all-time)</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular-nums text-ink">{formatCurrencyCompact(partsSummary.totalCost)}</div>
                <div className="text-xs text-muted">Estimated cost</div>
              </div>
            </div>
            {partsSummary.topPart && <p className="mt-2 text-xs text-muted">Most requested: {partsSummary.topPart}</p>}
            <button type="button" onClick={() => navigate("/parts-requests")} className="mt-3 block text-sm font-medium text-action hover:underline">
              View Parts Requests →
            </button>
          </SectionCard>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div id="detailed-report" className="lg:col-span-3">
          <SectionCard title={`Service Report (${dateFrom ? formatDate(dateFrom) : "All time"}${dateTo ? ` - ${formatDate(dateTo)}` : ""})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-2 py-2 font-semibold">Job No.</th>
                    <th className="px-2 py-2 font-semibold">Vehicle</th>
                    <th className="px-2 py-2 font-semibold">Service Type</th>
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 text-right font-semibold">Cost</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-10 text-center text-muted">Loading…</td>
                    </tr>
                  ) : !result || result.data.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-10 text-center text-muted">No service records match these filters.</td>
                    </tr>
                  ) : (
                    result.data.map((j) => (
                      <tr key={j.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-2.5 font-mono text-xs text-action">{j.jobNumber}</td>
                        <td className="px-2 py-2.5 text-ink">{vehicleDisplayName(j.vehicle)}</td>
                        <td className="px-2 py-2.5 text-xs text-muted">{j.serviceType?.name ?? "—"}</td>
                        <td className="px-2 py-2.5 text-xs text-muted">{j.completedAt ? formatDate(j.completedAt) : formatDate(j.createdAt)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-ink">
                          {formatCurrency(Number(j.serviceCost ?? 0) + Number(j.partsCost ?? 0) + Number(j.labourCost ?? 0))}
                        </td>
                        <td className="px-2 py-2.5"><ServiceJobStatusBadge status={j.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {result && result.meta.pageCount > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">
                  Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–{Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={page >= result.meta.pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Report Shortcuts">
          <ul className="flex flex-col divide-y divide-border">
            {REPORT_SECTIONS.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className="flex w-full items-start gap-2 py-2.5 text-left hover:bg-surface"
                >
                  <History size={14} className="mt-0.5 shrink-0 text-action" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{s.label}</div>
                    <div className="truncate text-xs text-muted">{s.hint}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={!result || result.data.length === 0}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={18} className="text-action" />
              Generate Report
            </button>
            <button
              type="button"
              onClick={() => navigate("/service-history")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <History size={18} className="text-action" />
              Service History
            </button>
            <button
              type="button"
              onClick={() => navigate("/parts-requests")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Package size={18} className="text-action" />
              Parts Requests
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
