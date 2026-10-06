import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calendar, CheckCircle2, ClipboardList, History, Hourglass, PlayCircle, Wrench } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { ServiceJobStatusBadge } from "../../components/service/ServiceBadges";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { useChartTheme } from "../../lib/chart-theme";
import { formatCurrency, formatDate } from "../../lib/format";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { ServiceJob, ServiceJobListResult } from "../../types/service";
import type { MechanicDashboard as MechanicDashboardData } from "../../types/dashboard";

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

const STATUS_COLORS: Record<string, string> = { Completed: "#16a34a", "In Progress": "#2563eb", Pending: "#d97706" };
const TYPE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8"];

// Reconciled against mechanic_pages/dashboard.jpeg — first real page for
// this role, so nav-config.ts was also updated to match this mockup's
// sidebar, with two items dropped: "Vehicle Inspections" (no distinct
// entity anywhere in the schema — an inspection is just a ServiceJob
// whose serviceType happens to be "Engine Check"/"Suspension Check", not
// a separate workflow) and "Work Orders" (same ServiceJob entity as
// "Service Jobs" — nothing distinguishes the two in this data model).
// "Settings" dropped too, same call already made for every other role
// (self-service lives in Profile).
//
// The mockup's job table has a "Customer" column — ServiceJob has no
// customer relationship at all in this schema (jobs are against the
// dealership's own vehicle inventory, the same Vehicle model used for
// sales/rentals, not a customer-owned vehicle brought in for service).
// Admin's own existing Service Center table already reflects this same
// gap (no Customer column there either) — dropped here too rather than
// fabricating a join that doesn't exist.
//
// "Today's Schedule" implies specific appointment times (8:00 AM, 10:00
// AM...) — nothing in ServiceJob stores a time-of-day, only
// createdAt/startedAt/completedAt timestamps and a date-only
// nextServiceDate. Replaced with "My Active Jobs" (Pending + In
// Progress, in-progress first), a real queue without invented times.
// "Upcoming Maintenance Reminders" IS real, though — derived from
// nextServiceDate the same way Admin's Service Center already does it
// (ServicePage.tsx's loadInsights()), just scoped to this mechanic's own
// jobs (server-side scoping already applied to every /service/jobs call
// a Mechanic makes).
//
// Quick Actions: "Create Service Job" dropped — job assignment is
// Admin-only (PRD: "Mechanics cannot assign jobs"), enforced server-side.
// "Vehicle Inspection"/"Schedule Maintenance" as standalone actions
// aren't real either (no inspection entity; nextServiceDate is only set
// as part of completing a job, not a standalone scheduling action).
// Substituted with "Start Next Job" (a real action — starts the oldest
// Pending job assigned to this mechanic) plus navigation to the
// Service Jobs/Maintenance Schedule/Service History pages (built in
// later rounds, same incremental approach used for every other role).
export function MechanicDashboard({ data }: { data: MechanicDashboardData }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gridStroke, tickFill } = useChartTheme();

  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [startingJob, setStartingJob] = useState<ServiceJob | null>(null);

  const load = useCallback(() => {
    api
      .get<ServiceJobListResult>("/service/jobs?pageSize=100")
      .then((res) => setJobs(res.data))
      .catch(() => setJobs([]));
  }, []);

  useEffect(load, [load]);

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  // Same cohort pattern as FinanceDashboard's Applications KPIs: bucket by
  // creation month, sub-bucket by CURRENT status, so the three status
  // counts always sum to the total (matches the mockup's donut exactly:
  // 18 + 6 + 4 = 28).
  const cohort = useMemo(() => {
    const bucket = (from: Date, to: Date) => {
      const rows = jobs.filter((j) => {
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
  }, [jobs, monthStart, lastMonthStart, lastMonthEnd]);

  const activeJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.status === "PENDING" || j.status === "IN_PROGRESS")
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "IN_PROGRESS" ? -1 : 1;
          return a.createdAt.localeCompare(b.createdAt);
        })
        .slice(0, 6),
    [jobs]
  );

  const nextPendingJob = useMemo(
    () =>
      jobs
        .filter((j) => j.status === "PENDING")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null,
    [jobs]
  );

  const upcomingMaintenance = useMemo(
    () =>
      jobs
        .filter((j) => j.nextServiceDate && new Date(j.nextServiceDate).getTime() >= Date.now())
        .sort((a, b) => new Date(a.nextServiceDate!).getTime() - new Date(b.nextServiceDate!).getTime())
        .slice(0, 5),
    [jobs]
  );

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
    for (const j of jobs) {
      if (new Date(j.createdAt) < monthStart) continue;
      const name = j.serviceType?.name ?? "Unspecified";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [jobs, monthStart]);

  async function handleStart() {
    if (!startingJob) return;
    try {
      await api.post(`/service/jobs/${startingJob.id}/start`);
      showToast("Service job started");
      setStartingJob(null);
      load();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to start job");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-muted">Overview of service jobs, vehicle maintenance, and workshop activities.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Service Jobs"
          value={String(cohort.thisMonth.total)}
          sublabel={percentChange(cohort.thisMonth.total, cohort.lastMonth.total) ?? "This month"}
          icon={ClipboardList}
        />
        <KpiCard
          label="Completed Jobs"
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

      {/* Not in the mockup, but real and worth surfacing: the base /dashboard
          endpoint's all-time + this-month-by-completedAt figures, distinct
          scoping from the by-createdAt cohort above (flagged so the two
          "this month" numbers aren't mistaken for the same thing). */}
      <p className="mt-3 text-xs text-muted">
        {data.completedJobsTotal} job{data.completedJobsTotal === 1 ? "" : "s"} completed all-time ·{" "}
        {formatCurrency(data.monthlyPerformance.revenue)} earned this month ({data.monthlyPerformance.jobCount} job
        {data.monthlyPerformance.jobCount === 1 ? "" : "s"} billed, by completion date)
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="My Active Jobs">
            {activeJobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No pending or in-progress jobs right now.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {activeJobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">
                        {j.jobNumber} · {vehicleDisplayName(j.vehicle)}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {j.serviceType?.name ?? j.issueDescription ?? "No service type set"}
                      </div>
                    </div>
                    <ServiceJobStatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => navigate("/jobs")} className="mt-3 block text-sm font-medium text-action hover:underline">
              View all →
            </button>
          </SectionCard>
        </div>

        <SectionCard title="Upcoming Maintenance Reminders">
          {upcomingMaintenance.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {upcomingMaintenance.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{vehicleDisplayName(j.vehicle)}</div>
                    <div className="truncate text-xs text-muted">{j.serviceType?.name ?? "Service due"}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDate(j.nextServiceDate!)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
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
              <BarChart accessibilityLayer data={serviceTypeBreakdown}>
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

      <div className="mt-6">
        <SectionCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              disabled={!nextPendingJob}
              onClick={() => nextPendingJob && setStartingJob(nextPendingJob)}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlayCircle size={18} className="text-action" />
              Start Next Job
            </button>
            <button
              type="button"
              onClick={() => navigate("/jobs")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <ClipboardList size={18} className="text-action" />
              Service Jobs
            </button>
            <button
              type="button"
              onClick={() => navigate("/maintenance-schedule")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Calendar size={18} className="text-action" />
              Maintenance Schedule
            </button>
            <button
              type="button"
              onClick={() => navigate("/service-history")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <History size={18} className="text-action" />
              Service History
            </button>
          </div>
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
    </div>
  );
}
