import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileBarChart,
  Lightbulb,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PartRequestStatusBadge, ServiceJobStatusBadge } from "../components/service/ServiceBadges";
import { ServiceJobFormModal } from "../components/service/ServiceJobFormModal";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { CHART_PALETTE } from "../lib/report-helpers";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type {
  PartRequest,
  PartRequestListResult,
  PartRequestStatus,
  ServiceJob,
  ServiceJobListResult,
  ServiceJobStatus,
  ServiceReport,
  ServiceType,
} from "../types/service";

type Tab = "jobs" | "history" | "parts" | "mechanics";

interface Kpis {
  pending: number;
  inProgress: number;
  completed: number;
  vehiclesInService: number;
  pendingPartsRequests: number;
}

interface MechanicOption {
  id: string;
  fullName: string;
}

async function fetchJobCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<ServiceJobListResult>(`/service/jobs?${query}`);
  return res.meta.total;
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const SERVICE_STATUS_COLORS = {
  pending: "#E67E22",
  inProgress: "#2F6690",
  completed: "#2E7D32",
};

export function ServicePage() {
  const { showToast } = useToast();
  const { gridStroke, tickFill } = useChartTheme();
  const [tab, setTab] = useState<Tab>("jobs");

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [serviceCostThisMonth, setServiceCostThisMonth] = useState<number | null>(null);
  const [serviceCostChangePercent, setServiceCostChangePercent] = useState<number | null>(null);
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);

  const [maintenanceInsight, setMaintenanceInsight] = useState<{ vehicleName: string; count: number } | null>(null);
  const [upcomingServices, setUpcomingServices] = useState<{ vehicleName: string; date: string }[]>([]);

  const [trendData, setTrendData] = useState<{ day: string; count: number }[]>([]);
  const [typeBreakdown, setTypeBreakdown] = useState<{ name: string; count: number }[]>([]);

  const [showCreateJob, setShowCreateJob] = useState(false);

  // Both charts bucket from the same single fetch (last 30 days by
  // creation date, capped at 100 jobs) — same tradeoff as the Inventory
  // aging check and Sales' day-by-day chart: accurate at dealership scale,
  // approximate well beyond it. "Service Types" only counts jobs with a
  // diagnosed type — serviceTypeId is null until a mechanic has actually
  // worked the job (see ServiceJobFormModal's own comment), so a job still
  // pending diagnosis correctly doesn't get counted as any particular type.
  const loadCharts = useCallback(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    api
      .get<ServiceJobListResult>(`/service/jobs?dateFrom=${isoDate(thirtyDaysAgo)}&pageSize=100`)
      .then((res) => {
        const byDay = new Map<string, number>();
        for (const job of res.data) {
          const day = job.createdAt.slice(0, 10);
          byDay.set(day, (byDay.get(day) ?? 0) + 1);
        }
        setTrendData(
          [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day: formatDate(day), count }))
        );

        const byType = new Map<string, number>();
        for (const job of res.data) {
          if (!job.serviceType) continue;
          byType.set(job.serviceType.name, (byType.get(job.serviceType.name) ?? 0) + 1);
        }
        setTypeBreakdown([...byType.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
      })
      .catch(() => {
        setTrendData([]);
        setTypeBreakdown([]);
      });
  }, []);

  const loadKpis = useCallback(() => {
    Promise.all([
      fetchJobCount({ status: "PENDING" }),
      fetchJobCount({ status: "IN_PROGRESS" }),
      fetchJobCount({ status: "COMPLETED" }),
      api.get<{ meta: { total: number } }>("/vehicles?status=UNDER_MAINTENANCE&pageSize=1"),
      api.get<PartRequestListResult>("/service/parts-requests?status=REQUESTED&pageSize=1"),
    ])
      .then(([pending, inProgress, completed, vehiclesRes, partsRes]) => {
        setKpis({
          pending,
          inProgress,
          completed,
          vehiclesInService: vehiclesRes.meta.total,
          pendingPartsRequests: partsRes.meta.total,
        });
      })
      .catch(() => undefined);

    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    Promise.all([
      api.get<{ report: ServiceReport }>(`/reports/service?dateFrom=${isoDate(monthStart)}`),
      api.get<{ report: ServiceReport }>(`/reports/service?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}`),
    ])
      .then(([thisMonth, lastMonth]) => {
        setServiceCostThisMonth(thisMonth.report.totals.revenue);
        if (lastMonth.report.totals.revenue > 0) {
          setServiceCostChangePercent(
            Math.round(((thisMonth.report.totals.revenue - lastMonth.report.totals.revenue) / lastMonth.report.totals.revenue) * 1000) / 10
          );
        } else {
          setServiceCostChangePercent(null);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadInsights = useCallback(() => {
    const { start: sixMonthsAgo } = monthBounds(6);
    api
      .get<ServiceJobListResult>(`/service/jobs?status=COMPLETED&dateFrom=${isoDate(sixMonthsAgo)}&pageSize=100`)
      .then((res) => {
        const byVehicle = new Map<string, { name: string; count: number }>();
        for (const job of res.data) {
          const entry = byVehicle.get(job.vehicleId) ?? { name: vehicleDisplayName(job.vehicle), count: 0 };
          entry.count += 1;
          byVehicle.set(job.vehicleId, entry);
        }
        const top = [...byVehicle.values()].sort((a, b) => b.count - a.count)[0];
        setMaintenanceInsight(top && top.count >= 3 ? { vehicleName: top.name, count: top.count } : null);

        const upcoming = res.data
          .filter((j) => j.nextServiceDate)
          .sort((a, b) => new Date(a.nextServiceDate!).getTime() - new Date(b.nextServiceDate!).getTime())
          .filter((j) => new Date(j.nextServiceDate!).getTime() >= Date.now())
          .slice(0, 3)
          .map((j) => ({ vehicleName: vehicleDisplayName(j.vehicle), date: j.nextServiceDate! }));
        setUpcomingServices(upcoming);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadKpis();
    loadInsights();
    loadCharts();
    api
      .get<{ data: MechanicOption[] }>("/admin/users?roleCode=MECHANIC&status=ACTIVE&pageSize=100")
      .then((res) => setMechanics(res.data))
      .catch(() => setMechanics([]));
  }, [loadKpis, loadInsights, loadCharts]);

  const [refreshKey, setRefreshKey] = useState(0);

  function refreshAll() {
    loadKpis();
    loadCharts();
    loadInsights();
    // JobsTab (and its "history" instance) manage their own list state
    // internally and only re-fetch when their own filter deps change —
    // this tells them "something changed elsewhere" (a job was created,
    // a part request was approved/fulfilled) without lifting their whole
    // filter/pagination state up into this component.
    setRefreshKey((k) => k + 1);
  }

  const costSublabel = useMemo(() => {
    if (serviceCostChangePercent === null) return undefined;
    return `${serviceCostChangePercent >= 0 ? "↑" : "↓"} ${Math.abs(serviceCostChangePercent)}% from last month`;
  }, [serviceCostChangePercent]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Pending Jobs" value={kpis ? String(kpis.pending) : "—"} icon={Clock} tone="warning" />
        <KpiCard label="In Progress" value={kpis ? String(kpis.inProgress) : "—"} icon={Wrench} />
        <KpiCard label="Completed" value={kpis ? String(kpis.completed) : "—"} icon={CheckCircle2} tone="success" />
        <KpiCard label="Vehicles in Service" value={kpis ? String(kpis.vehiclesInService) : "—"} icon={Wrench} />
        <KpiCard label="Parts Requests" value={kpis ? String(kpis.pendingPartsRequests) : "—"} icon={Package} tone="warning" />
        <KpiCard label="Service Cost" value={serviceCostThisMonth !== null ? formatCurrencyCompact(serviceCostThisMonth) : "—"} sublabel={costSublabel} icon={Wallet} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Service Jobs Trend (last 30 days)">
          {trendData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted">No jobs in the last 30 days.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: tickFill }} />
                <YAxis tick={{ fontSize: 11, fill: tickFill }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="Jobs" stroke="#2F6690" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Service Types (diagnosed jobs, last 30 days)">
          {typeBreakdown.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted">
              No jobs have a diagnosed service type yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={typeBreakdown} dataKey="count" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {typeBreakdown.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Service Status">
          {!kpis || kpis.pending + kpis.inProgress + kpis.completed === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted">No service jobs yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Pending", value: kpis.pending, color: SERVICE_STATUS_COLORS.pending },
                    { name: "In Progress", value: kpis.inProgress, color: SERVICE_STATUS_COLORS.inProgress },
                    { name: "Completed", value: kpis.completed, color: SERVICE_STATUS_COLORS.completed },
                  ].filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {[
                    { name: "Pending", value: kpis.pending, color: SERVICE_STATUS_COLORS.pending },
                    { name: "In Progress", value: kpis.inProgress, color: SERVICE_STATUS_COLORS.inProgress },
                    { name: "Completed", value: kpis.completed, color: SERVICE_STATUS_COLORS.completed },
                  ]
                    .filter((d) => d.value > 0)
                    .map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setShowCreateJob(true)}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm hover:bg-surface"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action/10 text-action">
            <Plus size={18} />
          </div>
          <span className="text-sm font-semibold text-ink">Add Service</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("parts")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm hover:bg-surface"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Package size={18} />
          </div>
          <span className="text-sm font-semibold text-ink">Parts Requests</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm hover:bg-surface"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <ClipboardList size={18} />
          </div>
          <span className="text-sm font-semibold text-ink">Service History</span>
        </button>
        <Link
          to="/reports"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm hover:bg-surface"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/10 text-ink">
            <FileBarChart size={18} />
          </div>
          <span className="text-sm font-semibold text-ink">Service Reports</span>
        </Link>
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(
          [
            ["jobs", "Service Jobs"],
            ["history", "Service History"],
            ["parts", "Parts Requests"],
            ["mechanics", "Mechanics"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === key ? "border-action text-action" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "jobs" && (
          <JobsTab mechanics={mechanics} onCreateJob={() => setShowCreateJob(true)} onChanged={refreshAll} refreshKey={refreshKey} />
        )}
        {tab === "history" && (
          <JobsTab mechanics={mechanics} forcedStatus="COMPLETED" onChanged={refreshAll} refreshKey={refreshKey} />
        )}
        {tab === "parts" && <PartsRequestsTab onChanged={refreshAll} />}
        {tab === "mechanics" && <MechanicsTab />}
      </div>

      {tab === "jobs" && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Lightbulb size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Maintenance Insight</p>
              {maintenanceInsight ? (
                <p className="mt-1 text-sm text-muted">
                  <span className="font-medium text-ink">{maintenanceInsight.vehicleName}</span> has completed{" "}
                  {maintenanceInsight.count} services within the last 6 months.{" "}
                  <span className="font-medium text-ink">Recommendation:</span> schedule a comprehensive inspection.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">No vehicle has needed frequent service recently.</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action/10 text-action">
              <Calendar size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Upcoming Services</p>
              {upcomingServices.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No upcoming services scheduled.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-sm text-muted">
                  {upcomingServices.map((u, i) => (
                    <li key={i}>
                      <span className="font-medium text-ink">{u.vehicleName}</span> — Due: {formatDate(u.date)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateJob && (
        <ServiceJobFormModal
          onClose={() => setShowCreateJob(false)}
          onCreated={() => {
            showToast("Service job created");
            setShowCreateJob(false);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function JobsTab({
  mechanics,
  forcedStatus,
  onCreateJob,
  onChanged,
  refreshKey,
}: {
  mechanics: MechanicOption[];
  forcedStatus?: ServiceJobStatus;
  onCreateJob?: () => void;
  onChanged: () => void;
  refreshKey: number;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceJobStatus | "">("");
  const [mechanicFilter, setMechanicFilter] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ServiceJobListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelJob, setCancelJob] = useState<ServiceJob | null>(null);
  const [startJob, setStartJob] = useState<ServiceJob | null>(null);
  const [completeJob, setCompleteJob] = useState<ServiceJob | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, mechanicFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (forcedStatus) {
      params.set("status", forcedStatus);
    } else if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (mechanicFilter) params.set("assignedMechanicId", mechanicFilter);

    api
      .get<ServiceJobListResult>(`/service/jobs?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load service jobs"))
      .finally(() => setIsLoading(false));
    // refreshKey isn't read above — it's a deliberate cache-buster so a job
    // created elsewhere (the Create Service Job modal) triggers a re-fetch
    // here without lifting this tab's own filter/pagination state up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, statusFilter, mechanicFilter, forcedStatus, refreshKey]);

  useEffect(loadList, [loadList]);

  async function handleCancel() {
    if (!cancelJob) return;
    try {
      await api.post(`/service/jobs/${cancelJob.id}/cancel`);
      showToast("Service job cancelled");
      setCancelJob(null);
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to cancel job");
    }
  }

  async function handleStart() {
    if (!startJob) return;
    try {
      await api.post(`/service/jobs/${startJob.id}/start`);
      showToast("Service job started");
      setStartJob(null);
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to start job");
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by job ID, vehicle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          {!forcedStatus && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ServiceJobStatus | "")}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          )}
          <select
            value={mechanicFilter}
            onChange={(e) => setMechanicFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Mechanics</option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setMechanicFilter("");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>

        {onCreateJob && (
          <button
            type="button"
            onClick={onCreateJob}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            <Plus size={16} />
            Add Service
          </button>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Job ID</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Mechanic</th>
                <th className="px-4 py-3 font-semibold">Started</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No service jobs match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((job) => {
                  const totalCost = Number(job.serviceCost ?? 0) + Number(job.partsCost ?? 0) + Number(job.labourCost ?? 0);
                  return (
                    <tr key={job.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 font-mono text-xs text-ink">{job.jobNumber}</td>
                      <td className="px-4 py-3 text-ink">{vehicleDisplayName(job.vehicle)}</td>
                      <td className="px-4 py-3 text-ink">{job.assignedMechanic.fullName}</td>
                      <td className="px-4 py-3 text-xs text-muted">{job.startedAt ? formatDate(job.startedAt) : "—"}</td>
                      <td className="px-4 py-3">
                        <ServiceJobStatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{totalCost > 0 ? formatCurrency(totalCost) : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {job.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                onClick={() => setStartJob(job)}
                                className="text-xs font-medium text-action hover:underline"
                              >
                                Start
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelJob(job)}
                                className="text-xs font-medium text-danger hover:underline"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {job.status === "IN_PROGRESS" && (
                            <button
                              type="button"
                              onClick={() => setCompleteJob(job)}
                              className="text-xs font-medium text-success hover:underline"
                            >
                              Complete
                            </button>
                          )}
                        </div>
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
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} service jobs
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

      {cancelJob && (
        <ConfirmDialog
          title="Cancel this service job?"
          description={`${cancelJob.jobNumber} (${vehicleDisplayName(cancelJob.vehicle)}) will be marked as cancelled.`}
          confirmLabel="Cancel Job"
          danger
          onConfirm={handleCancel}
          onCancel={() => setCancelJob(null)}
        />
      )}

      {startJob && (
        <ConfirmDialog
          title="Start this service job?"
          description={`${startJob.jobNumber} (${vehicleDisplayName(startJob.vehicle)}) will move to In Progress, and the vehicle will be marked Under Maintenance.`}
          confirmLabel="Start Job"
          onConfirm={handleStart}
          onCancel={() => setStartJob(null)}
        />
      )}

      {completeJob && (
        <CompleteJobDialog
          job={completeJob}
          onClose={() => setCompleteJob(null)}
          onCompleted={() => {
            showToast("Service job completed");
            setCompleteJob(null);
            loadList();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

interface CompletePartRow {
  partName: string;
  quantity: string;
  unitCost: string;
}

const EMPTY_PART_ROW: CompletePartRow = { partName: "", quantity: "1", unitCost: "" };

// Service cost isn't collected here — it's auto-filled server-side from the
// chosen Service Type's default price (PRD 4.6: "auto-filled from the
// controlled menu, not mechanic-editable"), matching completeServiceJob's
// own logic exactly. Only parts and labour are direct input.
function CompleteJobDialog({
  job,
  onClose,
  onCompleted,
}: {
  job: ServiceJob;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { showToast } = useToast();
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState(job.serviceTypeId ?? "");
  const [labourCost, setLabourCost] = useState("");
  const [parts, setParts] = useState<CompletePartRow[]>([{ ...EMPTY_PART_ROW }]);
  const [notes, setNotes] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: ServiceType[] }>("/service-types")
      .then((res) => setServiceTypes(res.data.filter((t) => t.isActive)))
      .catch(() => setServiceTypes([]));
  }, []);

  function updatePart(index: number, patch: Partial<CompletePartRow>) {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPartRow() {
    setParts((prev) => [...prev, { ...EMPTY_PART_ROW }]);
  }

  function removePartRow(index: number) {
    setParts((prev) => prev.filter((_, i) => i !== index));
  }

  const validParts = useMemo(
    () => parts.filter((p) => p.partName.trim() && Number(p.quantity) > 0 && p.unitCost !== ""),
    [parts]
  );
  const totalEstimatedCost = useMemo(
    () => validParts.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unitCost), 0) + (Number(labourCost) || 0),
    [validParts, labourCost]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!serviceTypeId) return setError("Select the service type performed");

    setIsSubmitting(true);
    try {
      await api.post(`/service/jobs/${job.id}/complete`, {
        serviceTypeId,
        labourCost: Number(labourCost) || 0,
        parts: validParts.map((p) => ({ partName: p.partName.trim(), quantity: Number(p.quantity), unitCost: Number(p.unitCost) })),
        notes: notes.trim() || undefined,
        nextServiceDate: nextServiceDate || undefined,
      });
      onCompleted();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to complete job";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Complete Service Job</h2>
            <p className="text-xs text-muted">
              {job.jobNumber} · {vehicleDisplayName(job.vehicle)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-ink">
                Service Type <span className="text-danger">*</span>
              </label>
              <select
                required
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              >
                <option value="">Select the service performed…</option>
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.defaultPrice ? ` (${formatCurrency(t.defaultPrice)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ink">Parts Used (optional)</span>
                <button
                  type="button"
                  onClick={addPartRow}
                  className="flex items-center gap-1 text-xs font-medium text-action hover:underline"
                >
                  <Plus size={12} /> Add part
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {parts.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_90px_90px_auto] items-center gap-2">
                    <input
                      placeholder="Part / item name"
                      value={p.partName}
                      onChange={(e) => updatePart(i, { partName: e.target.value })}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={p.quantity}
                      onChange={(e) => updatePart(i, { quantity: e.target.value })}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Unit (GHS)"
                      value={p.unitCost}
                      onChange={(e) => updatePart(i, { unitCost: e.target.value })}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                    />
                    <div className="rounded-lg bg-surface px-2 py-1.5 text-right text-xs text-ink">
                      {formatCurrency((Number(p.quantity) || 0) * (Number(p.unitCost) || 0))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePartRow(i)}
                      disabled={parts.length === 1}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Remove part"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink">Labour Cost (GHS)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={labourCost}
                  onChange={(e) => setLabourCost(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink">Next Service Date (optional)</span>
                <input
                  type="date"
                  value={nextServiceDate}
                  onChange={(e) => setNextServiceDate(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-ink">Notes (optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details about the work done…"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
              <span className="text-muted">Total Estimated Cost (parts + labour)</span>
              <span className="font-semibold text-ink">{formatCurrency(totalEstimatedCost)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Service cost is auto-filled from the selected service type's price.</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Complete Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PartsRequestsTab({ onChanged }: { onChanged: () => void }) {
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<PartRequestStatus | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PartRequestListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PartRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (statusFilter) params.set("status", statusFilter);

    api
      .get<PartRequestListResult>(`/service/parts-requests?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load parts requests"))
      .finally(() => setIsLoading(false));
  }, [page, statusFilter]);

  useEffect(loadList, [loadList]);

  async function handleApprove(id: string) {
    try {
      await api.post(`/service/parts-requests/${id}/approve`);
      showToast("Parts request approved");
      loadList();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to approve request", "error");
    }
  }

  async function handleFulfill(id: string) {
    try {
      await api.post(`/service/parts-requests/${id}/fulfill`);
      showToast("Parts request marked fulfilled");
      loadList();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update request", "error");
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    try {
      await api.post(`/service/parts-requests/${rejectTarget.id}/reject`, { rejectionReason });
      showToast("Parts request rejected");
      setRejectTarget(null);
      setRejectionReason("");
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to reject request");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PartRequestStatus | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
        >
          <option value="">All Statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="FULFILLED">Fulfilled</option>
        </select>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Request ID</th>
                <th className="px-4 py-3 font-semibold">Part</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Requested By</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
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
                    No parts requests match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{r.requestNumber}</td>
                    <td className="px-4 py-3 text-ink">
                      {r.partName} <span className="text-xs text-muted">×{r.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{vehicleDisplayName(r.serviceJob.vehicle)}</td>
                    <td className="px-4 py-3 text-ink">{r.requester.fullName}</td>
                    <td className="px-4 py-3">
                      <PartRequestStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "REQUESTED" && (
                        <div className="flex justify-end gap-3">
                          <button type="button" onClick={() => handleApprove(r.id)} className="text-xs font-medium text-action hover:underline">
                            Approve
                          </button>
                          <button type="button" onClick={() => setRejectTarget(r)} className="text-xs font-medium text-danger hover:underline">
                            Reject
                          </button>
                        </div>
                      )}
                      {r.status === "APPROVED" && (
                        <button type="button" onClick={() => handleFulfill(r.id)} className="text-xs font-medium text-success hover:underline">
                          Mark Fulfilled
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {result && result.meta.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} requests
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

      {rejectTarget && (
        <ConfirmDialog
          title="Reject this parts request?"
          description={`${rejectTarget.requestNumber} (${rejectTarget.partName}) will be rejected.`}
          confirmLabel="Reject Request"
          danger
          extraContent={
            <textarea
              required
              rows={2}
              placeholder="Reason for rejection…"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          }
          onConfirm={handleReject}
          onCancel={() => {
            setRejectTarget(null);
            setRejectionReason("");
          }}
        />
      )}
    </div>
  );
}

function MechanicsTab() {
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ report: ServiceReport }>("/reports/service")
      .then((res) => setReport(res.report))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Mechanic</th>
              <th className="px-4 py-3 text-right font-semibold">Jobs Completed (all-time)</th>
              <th className="px-4 py-3 text-right font-semibold">Revenue Generated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : !report || report.byMechanic.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted">
                  No completed jobs yet.
                </td>
              </tr>
            ) : (
              report.byMechanic.map((m) => (
                <tr key={m.mechanicId} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{m.fullName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{m.jobCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(m.revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
