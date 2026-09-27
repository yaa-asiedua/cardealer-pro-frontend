import { CircleDollarSign, ClipboardCheck, ShieldAlert, TrendingUp, Wallet } from "lucide-react";
import { AlertBanner } from "../../components/dashboard/AlertBanner";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { formatCurrencyCompact } from "../../lib/format";
import type { FinanceDashboard as FinanceDashboardData } from "../../types/dashboard";

// Design Brief §6 "Finance": prioritize money — outstanding loans, overdue
// payments, today's collections, collection rate and approvals.
export function FinanceDashboard({ data }: { data: FinanceDashboardData }) {
  const alerts = [
    data.overduePayments > 0 && {
      label: `${data.overduePayments} account${data.overduePayments === 1 ? "" : "s"} overdue`,
      path: "/overdue",
    },
    data.pendingApprovals > 0 && {
      label: `${data.pendingApprovals} loan approval${data.pendingApprovals === 1 ? "" : "s"} pending`,
      path: "/financing",
    },
  ].filter((a): a is { label: string; path: string } => !!a);

  return (
    <div>
      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Outstanding loans" value={formatCurrencyCompact(data.outstandingLoans)} icon={CircleDollarSign} />
        <KpiCard
          label="Overdue accounts"
          value={String(data.overduePayments)}
          icon={ShieldAlert}
          tone={data.overduePayments > 0 ? "danger" : "success"}
        />
        <KpiCard label="Collections today" value={formatCurrencyCompact(data.collectionsToday)} icon={Wallet} tone="success" />
        <KpiCard label="Collection rate" value={`${data.collectionRatePercent}%`} icon={TrendingUp} />
        <KpiCard
          label="Pending approvals"
          value={String(data.pendingApprovals)}
          icon={ClipboardCheck}
          tone={data.pendingApprovals > 0 ? "warning" : "default"}
        />
      </div>
    </div>
  );
}
