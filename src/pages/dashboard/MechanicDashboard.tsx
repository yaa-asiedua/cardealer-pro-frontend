import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, Hammer, Wrench } from "lucide-react";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { formatCurrency } from "../../lib/format";
import type { MechanicDashboard as MechanicDashboardData } from "../../types/dashboard";

// Design Brief §6 "Mechanic": prioritize the work queue — pending, current
// and completed jobs — never another mechanic's work (already enforced by
// the backend scoping this to the logged-in mechanic).
export function MechanicDashboard({ data }: { data: MechanicDashboardData }) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Pending jobs"
          value={String(data.pendingJobs)}
          icon={ClipboardList}
          tone={data.pendingJobs > 0 ? "warning" : "default"}
        />
        <KpiCard label="In progress" value={String(data.inProgressJobs)} icon={Hammer} tone="default" />
        <KpiCard label="Completed (all time)" value={String(data.completedJobsTotal)} icon={CheckCircle2} tone="success" />
        <KpiCard label="Completed this month" value={String(data.monthlyPerformance.jobCount)} icon={Wrench} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2">
        <SectionCard title="This month's performance">
          <div className="text-2xl font-semibold tabular-nums text-ink">
            {formatCurrency(data.monthlyPerformance.revenue)}
          </div>
          <p className="mt-1 text-xs text-muted">
            across {data.monthlyPerformance.jobCount} completed job{data.monthlyPerformance.jobCount === 1 ? "" : "s"}
          </p>
          <Link to="/jobs" className="mt-4 block text-sm font-medium text-action hover:underline">
            View My Jobs →
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}
