import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, ClipboardList, Hourglass, PackagePlus, RotateCcw, Wrench } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { CompleteServiceJobModal } from "../components/service/CompleteServiceJobModal";
import { RequestPartsModal } from "../components/service/RequestPartsModal";
import { ServiceJobStatusBadge } from "../components/service/ServiceBadges";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { formatCurrency, formatDate, formatDateTime } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { ServiceJob, ServiceJobListResult, ServiceType } from "../types/service";

type Tab = "" | "PENDING" | "IN_PROGRESS" | "COMPLETED";
const TABS: { key: Tab; label: string }[] = [
  { key: "", label: "All Jobs" },
  { key: "PENDING", label: "Pending" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED", label: "Completed" },
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

function percentChange(current: number, previous: number): string | undefined {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change vs last month";
  return `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}% vs last month`;
}

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<ServiceJobListResult>(`/service/jobs?${query}`);
  return res.meta.total;
}

const STATUS_COLORS: Record<string, string> = { Completed: "#16a34a", "In Progress": "#2563eb", Pending: "#d97706" };
const TYPE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8"];

// Reconciled against mechanic_pages/service jobs.jpeg. Real and newly
// added this round: /service/jobs' search/serviceTypeId/dateFrom/dateTo
// now apply to a Mechanic's own list too (previously Admin-only in
// effect — see service-job.service.ts), so this page's filter bar is
// fully functional, not decorative.
//
// Dropped/changed, same reconciliation as the Dashboard round:
// - No "Customer" column — ServiceJob has no customer relation anywhere
//   in the schema (jobs are against the dealership's own inventory).
//   Admin's own Service Center table has the same gap.
// - No "Due Date" column — nothing stores an expected-completion date
//   for a job (nextServiceDate is for the NEXT job after this one, only
//   set at completion). Dropped rather than inventing one.
// - "+ Create Service Job" dropped entirely — job assignment is
//   Admin-only by an explicit PRD rule enforced server-side.
// - The Job Details panel's "Service Items" checklist (multiple
//   sub-tasks, each with its own status) doesn't exist — a ServiceJob
//   has exactly one status for the whole job, not a checklist. Replaced
//   with the job's real fields (issue description, and once completed,
//   service type/parts/costs/notes).
// - "Recent Activity" is real, but built from the job's own
//   createdAt/startedAt/completedAt timestamps rather than a full audit
//   trail — GET /admin/audit-logs (which does record every job
//   transition) is Admin-only, and opening that up to Mechanics for one
//   detail-panel timeline was a disproportionate RBAC change for what
//   three real timestamps already cover honestly.
// - "Odometer" uses the vehicle's current `mileage` — the schema has no
//   historical odometer-at-time-of-service snapshot, so this is flagged
//   as the vehicle's current reading, not what it was when the job ran.
// - Quick Actions: only "Request Parts" is real (now genuinely
//   actionable here, since a job is already in context via the Job
//   Details panel) — "Create Service Job"/"Vehicle Inspection"/
//   "Schedule Maintenance" dropped, same reasoning as the Dashboard.
export function ServiceJobsPage() {
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<ServiceJobListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tabCounts, setTabCounts] = useState<Record<Tab, number | null>>({
    "": null,
    PENDING: null,
    IN_PROGRESS: null,
    COMPLETED: null,
  });
  const [monthJobs, setMonthJobs] = useState<ServiceJob[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);

  const [selected, setSelected] = useState<ServiceJob | null>(null);
  const [startingJob, setStartingJob] = useState<ServiceJob | null>(null);
  const [completingJob, setCompletingJob] = useState<ServiceJob | null>(null);
  const [requestingPartsJob, setRequestingPartsJob] = useState<ServiceJob | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab, serviceTypeFilter, dateFrom, dateTo]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (tab) params.set("status", tab);
    if (serviceTypeFilter) params.set("serviceTypeId", serviceTypeFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    api
      .get<ServiceJobListResult>(`/service/jobs?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load service jobs"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, tab, serviceTypeFilter, dateFrom, dateTo]);

  useEffect(loadList, [loadList]);

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  const loadSummary = useCallback(() => {
    Promise.all([
      fetchCount({}),
      fetchCount({ status: "PENDING" }),
      fetchCount({ status: "IN_PROGRESS" }),
      fetchCount({ status: "COMPLETED" }),
    ]).then(([all, pending, inProgress, completed]) =>
      setTabCounts({ "": all, PENDING: pending, IN_PROGRESS: inProgress, COMPLETED: completed })
    );

    // Covers this month AND last month in one fetch (bucketed client-side
    // below) — same approach as MechanicDashboard's own cohort.
    api
      .get<ServiceJobListResult>(`/service/jobs?dateFrom=${isoDate(lastMonthStart)}&pageSize=100`)
      .then((res) => setMonthJobs(res.data))
      .catch(() => setMonthJobs([]));

    api
      .get<{ data: ServiceType[] }>("/service-types")
      .then((res) => setServiceTypes(res.data.filter((t) => t.isActive)))
      .catch(() => setServiceTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(loadSummary, [loadSummary]);

  function refreshAll() {
    loadList();
    loadSummary();
  }

  const cohort = useMemo(() => {
    const bucket = (from: Date, to: Date) => {
      const rows = monthJobs.filter((j) => {
        const d = new Date(j.createdAt);
        return d >= from && d <= to;
      });
      return {
        total: rows.length,
        completed: rows.filter((j) => j.status === "COMPLETED").length,
        inProgress: rows.filter((j) => j.status === "IN_PROGRESS").length,
        pending: rows.filter((j) => j.status === "PENDING").length,
      };
    };
    return { thisMonth: bucket(monthStart, new Date()), lastMonth: bucket(lastMonthStart, lastMonthEnd) };
  }, [monthJobs, monthStart, lastMonthStart, lastMonthEnd]);

  const statusBreakdown = useMemo(() => {
    const c = cohort.thisMonth;
    return [
      { key: "Completed", value: c.completed, color: STATUS_COLORS.Completed },
      { key: "In Progress", value: c.inProgress, color: STATUS_COLORS["In Progress"] },
      { key: "Pending", value: c.pending, color: STATUS_COLORS.Pending },
    ].filter((d) => d.value > 0);
  }, [cohort]);

  const serviceTypeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of monthJobs) {
      if (new Date(j.createdAt) < monthStart) continue;
      const name = j.serviceType?.name ?? "Unspecified";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [monthJobs, monthStart]);

  const { gridStroke, tickFill } = useChartTheme();

  function resetFilters() {
    setSearch("");
    setServiceTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setTab("");
  }

  async function handleStart() {
    if (!startingJob) return;
    try {
      await api.post(`/service/jobs/${startingJob.id}/start`);
      showToast("Service job started");
      setStartingJob(null);
      refreshAll();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to start job");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <Wrench size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">Service Jobs</h1>
          <p className="text-sm text-muted">Manage, track, and update your assigned service jobs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Jobs"
          value={String(cohort.thisMonth.total)}
          sublabel={percentChange(cohort.thisMonth.total, cohort.lastMonth.total) ?? "This month"}
          icon={ClipboardList}
        />
        <KpiCard
          label="Completed"
          value={String(cohort.thisMonth.completed)}
          sublabel={percentChange(cohort.thisMonth.completed, cohort.lastMonth.completed) ?? "This month"}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="In Progress"
          value={String(cohort.thisMonth.inProgress)}
          sublabel={percentChange(cohort.thisMonth.inProgress, cohort.lastMonth.inProgress) ?? "This month"}
          icon={Wrench}
        />
        <KpiCard
          label="Pending"
          value={String(cohort.thisMonth.pending)}
          sublabel={percentChange(cohort.thisMonth.pending, cohort.lastMonth.pending) ?? "This month"}
          icon={Hourglass}
          tone={cohort.thisMonth.pending > 0 ? "warning" : "default"}
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
                    <th className="px-4 py-3 font-semibold">Date In</th>
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
                        No service jobs match these filters.
                      </td>
                    </tr>
                  ) : (
                    result.data.map((job) => (
                      <tr
                        key={job.id}
                        onClick={() => setSelected(job)}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selected?.id === job.id ? "bg-action/5" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-action">{job.jobNumber}</td>
                        <td className="px-4 py-3 text-ink">{vehicleDisplayName(job.vehicle)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{job.serviceType?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(job.createdAt)}</td>
                        <td className="px-4 py-3">
                          <ServiceJobStatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {job.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStartingJob(job);
                              }}
                              className="text-xs font-medium text-action hover:underline"
                            >
                              Start
                            </button>
                          )}
                          {job.status === "IN_PROGRESS" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCompletingJob(job);
                              }}
                              className="text-xs font-medium text-success hover:underline"
                            >
                              Complete
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
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Job Details">
            {!selected ? (
              <p className="py-6 text-center text-sm text-muted">Select a job to view its details.</p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <div className="font-medium text-ink">{selected.jobNumber}</div>
                  <div className="text-xs text-muted">{vehicleDisplayName(selected.vehicle)}</div>
                </div>
                <dl className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted">Service Type</dt>
                    <dd className="text-ink">{selected.serviceType?.name ?? "Not yet set"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Date In</dt>
                    <dd className="text-ink">{formatDate(selected.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Status</dt>
                    <dd><ServiceJobStatusBadge status={selected.status} /></dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Odometer</dt>
                    <dd className="text-ink">
                      {selected.vehicle.mileage != null ? `${selected.vehicle.mileage.toLocaleString()} km (current)` : "—"}
                    </dd>
                  </div>
                </dl>

                {selected.issueDescription && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-ink">Issue Description</div>
                    <p className="text-xs text-muted">{selected.issueDescription}</p>
                  </div>
                )}

                {selected.status === "COMPLETED" && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-ink">Costs</div>
                    <dl className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between"><dt className="text-muted">Service</dt><dd className="text-ink">{formatCurrency(selected.serviceCost ?? 0)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Parts</dt><dd className="text-ink">{formatCurrency(selected.partsCost ?? 0)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Labour</dt><dd className="text-ink">{formatCurrency(selected.labourCost ?? 0)}</dd></div>
                    </dl>
                    {selected.notes && <p className="mt-2 text-xs text-muted">{selected.notes}</p>}
                  </div>
                )}

                <div>
                  <div className="mb-1 text-xs font-medium text-ink">Recent Activity</div>
                  <ul className="flex flex-col gap-1 text-xs text-muted">
                    <li>Job created — {formatDateTime(selected.createdAt)}</li>
                    {selected.startedAt && <li>Job started — {formatDateTime(selected.startedAt)}</li>}
                    {selected.completedAt && <li>Job completed — {formatDateTime(selected.completedAt)}</li>}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  {selected.status === "PENDING" && (
                    <button type="button" onClick={() => setStartingJob(selected)} className="rounded-lg bg-action px-3 py-2 text-xs font-semibold text-white hover:bg-primary">
                      Start Job
                    </button>
                  )}
                  {selected.status === "IN_PROGRESS" && (
                    <button type="button" onClick={() => setCompletingJob(selected)} className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
                      Complete Job
                    </button>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Quick Actions">
            <button
              type="button"
              disabled={!selected || (selected.status !== "PENDING" && selected.status !== "IN_PROGRESS")}
              onClick={() => selected && setRequestingPartsJob(selected)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PackagePlus size={16} className="text-action" />
              Request Parts
            </button>
            <p className="mt-2 text-xs text-muted">Select a Pending or In Progress job above first.</p>
          </SectionCard>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Service Job Status">
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No jobs yet this month.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="key" innerRadius={44} outerRadius={70} paddingAngle={2}>
                    {statusBreakdown.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <div className="text-2xl font-semibold tabular-nums text-ink">{cohort.thisMonth.total}</div>
                <p className="mb-2 text-xs text-muted">Jobs this month</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {statusBreakdown.map((d) => (
                    <li key={d.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.key}
                      </span>
                      <span className="font-medium text-ink">
                        {d.value} ({Math.round((d.value / cohort.thisMonth.total) * 100)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Service Types">
          {serviceTypeBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No jobs yet this month.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={serviceTypeBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={{ fill: tickFill, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {serviceTypeBreakdown.map((_, i) => (
                    <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {startingJob && (
        <ConfirmDialog
          title="Start this service job?"
          description={`${startingJob.jobNumber} (${vehicleDisplayName(startingJob.vehicle)}) will move to In Progress, and the vehicle will be marked Under Maintenance.`}
          confirmLabel="Start Job"
          onConfirm={handleStart}
          onCancel={() => setStartingJob(null)}
        />
      )}

      {completingJob && (
        <CompleteServiceJobModal
          job={completingJob}
          onClose={() => setCompletingJob(null)}
          onCompleted={() => {
            showToast("Service job completed");
            setCompletingJob(null);
            setSelected(null);
            refreshAll();
          }}
        />
      )}

      {requestingPartsJob && (
        <RequestPartsModal
          job={requestingPartsJob}
          onClose={() => setRequestingPartsJob(null)}
          onRequested={() => setRequestingPartsJob(null)}
        />
      )}
    </div>
  );
}
