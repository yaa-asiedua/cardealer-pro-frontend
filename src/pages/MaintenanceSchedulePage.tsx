import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, Clock, RotateCcw } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { api } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { ServiceJob, ServiceJobListResult } from "../types/service";

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

interface Reminder {
  job: ServiceJob;
  dueDate: Date;
  overdue: boolean;
}

const STATUS_COLORS: Record<string, string> = { Upcoming: "#2563eb", Overdue: "#dc2626" };
const TYPE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8"];

// Reconciled against mechanic_pages/maintence schedule.jpeg. Unlike
// Vehicle Inspections (dropped — zero mentions anywhere in the design
// docs), this one IS real: PRD §4.6 explicitly calls for "Track
// next-service recommendations," and the Backend Schema doc defines
// exactly the field for it — ServiceJob.nextServiceDate. But there's no
// dedicated MaintenanceSchedule entity behind the mockup's richer
// picture — it's one date field set once, at completion of the PRIOR
// job, as a reminder for the next one. That caps what's honestly
// buildable:
// - A "reminder" is just a completed job with nextServiceDate set. It
//   has no stored lifecycle of its own, so there's no real "Completed"
//   status for a *reminder* (as opposed to the job that created it) —
//   nothing links "the next job this vehicle gets" back to "the
//   reminder that predicted it". Dropped the Completed bucket/KPI/tab/
//   donut-slice/calendar-dot entirely rather than guessing with a
//   same-vehicle-later-job heuristic (see below for the one heuristic
//   kept, which only suppresses stale reminders, never claims
//   "Completed").
// - "+ Schedule Maintenance" (standalone creation, not tied to
//   completing a job) isn't real — nextServiceDate is only ever set via
//   completeServiceJob(). Dropped, same as the Dashboard/Service Jobs
//   Quick Actions.
// - No "Customer" column — same schema gap documented on every other
//   Service page this role has gotten.
// - "Mileage" is the vehicle's CURRENT odometer reading, not what it
//   was when the reminder was set (no historical snapshot exists).
// - Subtitle changed from "for all vehicles" to this mechanic's own —
//   PRD's own business rules: "Mechanics cannot view or edit other
//   mechanics' jobs."
//
// One real heuristic: a reminder is suppressed (not shown as Upcoming
// or Overdue) if a LATER job already exists for the same vehicle —
// without this, a reminder would sit in "Overdue" forever even after
// the vehicle came back in for unrelated work. Flagged here since it's
// an approximation, not a stored "resolved" flag — there isn't one.
export function MaintenanceSchedulePage() {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"" | "UPCOMING" | "OVERDUE">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [selected, setSelected] = useState<Reminder | null>(null);

  useEffect(() => {
    setIsLoading(true);
    api
      .get<ServiceJobListResult>("/service/jobs?pageSize=100")
      .then((res) => setJobs(res.data))
      .catch(() => setJobs([]))
      .finally(() => setIsLoading(false));
  }, []);

  const { gridStroke, tickFill } = useChartTheme();

  const reminders = useMemo<Reminder[]>(() => {
    const now = new Date();
    return jobs
      .filter((j) => j.nextServiceDate)
      .filter((j) => {
        // Suppress a reminder once a later job exists for the same
        // vehicle — see the file-level comment for why this is an
        // approximation, not a real "resolved" flag.
        const dueDate = new Date(j.nextServiceDate!);
        return !jobs.some((other) => other.vehicleId === j.vehicleId && other.id !== j.id && new Date(other.createdAt) > dueDate);
      })
      .map((j) => {
        const dueDate = new Date(j.nextServiceDate!);
        return { job: j, dueDate, overdue: dueDate < now };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [jobs]);

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  // "New reminders set" is a real flow metric — jobs COMPLETED this
  // month that set a nextServiceDate — distinct from the Upcoming/
  // Overdue snapshot counts below, same "flow vs snapshot" split used
  // throughout this role's pages.
  const newRemindersCohort = useMemo(() => {
    const count = (from: Date, to: Date) =>
      jobs.filter((j) => j.nextServiceDate && j.completedAt && new Date(j.completedAt) >= from && new Date(j.completedAt) <= to).length;
    return { thisMonth: count(monthStart, new Date()), lastMonth: count(lastMonthStart, lastMonthEnd) };
  }, [jobs, monthStart, lastMonthStart, lastMonthEnd]);

  const upcomingCount = useMemo(() => reminders.filter((r) => !r.overdue).length, [reminders]);
  const overdueCount = useMemo(() => reminders.filter((r) => r.overdue).length, [reminders]);

  const filtered = useMemo(() => {
    return reminders.filter((r) => {
      if (tab === "UPCOMING" && r.overdue) return false;
      if (tab === "OVERDUE" && !r.overdue) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchesVehicle = vehicleDisplayName(r.job.vehicle).toLowerCase().includes(q);
        const matchesType = (r.job.serviceType?.name ?? "").toLowerCase().includes(q);
        if (!matchesVehicle && !matchesType) return false;
      }
      return true;
    });
  }, [reminders, tab, search]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  const statusBreakdown = useMemo(
    () =>
      [
        { key: "Upcoming", value: upcomingCount, color: STATUS_COLORS.Upcoming },
        { key: "Overdue", value: overdueCount, color: STATUS_COLORS.Overdue },
      ].filter((d) => d.value > 0),
    [upcomingCount, overdueCount]
  );

  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reminders) {
      const name = r.job.serviceType?.name ?? "Unspecified";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [reminders]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getUTCFullYear();
    const month = calendarMonth.getUTCMonth();
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const startWeekday = firstOfMonth.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const remindersByDay = new Map<number, { upcoming: boolean; overdue: boolean }>();
    for (const r of reminders) {
      if (r.dueDate.getUTCFullYear() !== year || r.dueDate.getUTCMonth() !== month) continue;
      const day = r.dueDate.getUTCDate();
      const entry = remindersByDay.get(day) ?? { upcoming: false, overdue: false };
      if (r.overdue) entry.overdue = true;
      else entry.upcoming = true;
      remindersByDay.set(day, entry);
    }

    const cells: ({ day: number; marks: { upcoming: boolean; overdue: boolean } } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, marks: remindersByDay.get(d) ?? { upcoming: false, overdue: false } });
    return cells;
  }, [calendarMonth, reminders]);

  const today = useMemo(() => new Date(), []);
  const isCurrentMonth = calendarMonth.getUTCFullYear() === today.getUTCFullYear() && calendarMonth.getUTCMonth() === today.getUTCMonth();

  const next7Days = useMemo(() => {
    const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return reminders.filter((r) => !r.overdue && r.dueDate <= in7).slice(0, 5);
  }, [reminders, today]);

  function resetFilters() {
    setSearch("");
    setTab("");
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <Calendar size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">Maintenance Schedule</h1>
          <p className="text-sm text-muted">Upcoming and overdue maintenance for vehicles you've serviced.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <KpiCard
          label="New Reminders Set"
          value={String(newRemindersCohort.thisMonth)}
          sublabel={percentChange(newRemindersCohort.thisMonth, newRemindersCohort.lastMonth) ?? "This month"}
          icon={Calendar}
        />
        <KpiCard label="Upcoming" value={String(upcomingCount)} sublabel="Not yet due" icon={Clock} />
        <KpiCard
          label="Overdue"
          value={String(overdueCount)}
          sublabel="Past due date"
          icon={AlertTriangle}
          tone={overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["", "UPCOMING", "OVERDUE"] as const).map((t) => (
              <button
                key={t || "ALL"}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {t === "" ? "All" : t === "UPCOMING" ? "Upcoming" : "Overdue"} (
                {t === "" ? reminders.length : t === "UPCOMING" ? upcomingCount : overdueCount})
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by vehicle or maintenance type…"
              className="w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
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
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Maintenance Type</th>
                    <th className="px-4 py-3 font-semibold">Scheduled Date</th>
                    <th className="px-4 py-3 font-semibold">Mileage (km)</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted">
                        No reminders match these filters.
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((r) => (
                      <tr
                        key={r.job.id}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selected?.job.id === r.job.id ? "bg-action/5" : ""}`}
                      >
                        <td className="px-4 py-3 text-ink">{vehicleDisplayName(r.job.vehicle)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{r.job.serviceType?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(r.dueDate)}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {r.job.vehicle.mileage != null ? r.job.vehicle.mileage.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                              r.overdue ? "bg-danger/10 text-danger" : "bg-action/10 text-action"
                            }`}
                          >
                            {r.overdue ? "Overdue" : "Upcoming"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                <span className="text-muted">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} reminders
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
                    Previous
                  </button>
                  <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Maintenance Calendar">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCalendarMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)))}
                className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-semibold text-ink">
                {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
              </span>
              <button
                type="button"
                onClick={() => setCalendarMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)))}
                className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d}>{d}</div>
              ))}
              {calendarDays.map((cell, i) =>
                cell === null ? (
                  <div key={i} />
                ) : (
                  <div
                    key={i}
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${
                      isCurrentMonth && cell.day === today.getUTCDate() ? "bg-action/10 font-semibold text-action" : "text-ink"
                    }`}
                  >
                    <span>{cell.day}</span>
                    {(cell.marks.upcoming || cell.marks.overdue) && (
                      <span className={`h-1 w-1 rounded-full ${cell.marks.overdue ? "bg-danger" : "bg-action"}`} />
                    )}
                  </div>
                )
              )}
            </div>
          </SectionCard>

          <SectionCard title="Upcoming (Next 7 Days)">
            {next7Days.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Nothing due in the next 7 days.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {next7Days.map((r) => (
                  <li key={r.job.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{vehicleDisplayName(r.job.vehicle)}</div>
                      <div className="truncate text-xs text-muted">{r.job.serviceType?.name ?? "Service due"}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{formatDate(r.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Maintenance Status">
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No reminders outstanding.</p>
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
                <div className="text-2xl font-semibold tabular-nums text-ink">{reminders.length}</div>
                <p className="mb-2 text-xs text-muted">Reminders outstanding</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {statusBreakdown.map((d) => (
                    <li key={d.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.key}
                      </span>
                      <span className="font-medium text-ink">
                        {d.value} ({Math.round((d.value / reminders.length) * 100)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Maintenance Types">
          {typeBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No reminders outstanding.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart accessibilityLayer data={typeBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={{ fill: tickFill, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {typeBreakdown.map((_, i) => (
                    <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
