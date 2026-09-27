import { Link } from "react-router-dom";
import { Car, Handshake, Trophy, Users, Wallet } from "lucide-react";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency, formatCurrencyCompact } from "../../lib/format";
import type { SalesDashboard as SalesDashboardData } from "../../types/dashboard";

// Design Brief §6 "Salesperson": personal performance is the visual focus;
// the leaderboard is supportive, not the headline.
export function SalesDashboard({ data }: { data: SalesDashboardData }) {
  const { user } = useAuth();

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="My sales this month"
          value={formatCurrencyCompact(data.mySalesThisMonth.revenue)}
          sublabel={`${data.mySalesThisMonth.count} sale${data.mySalesThisMonth.count === 1 ? "" : "s"}`}
          icon={Handshake}
        />
        <KpiCard label="Commission (this month)" value={formatCurrency(data.myCommission.thisMonth)} icon={Wallet} />
        <KpiCard label="Commission (YTD)" value={formatCurrency(data.myCommission.yearToDate)} icon={Wallet} tone="success" />
        <KpiCard label="My rank" value={data.rank ? `#${data.rank}` : "—"} icon={Trophy} tone="warning" />
        <KpiCard label="Active customers" value={String(data.activeCustomers)} icon={Users} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SectionCard title="Available vehicles">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
                <Car size={18} />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums text-ink">{data.availableVehicles}</div>
                <p className="text-xs text-muted">ready to sell</p>
              </div>
            </div>
            <Link to="/vehicles" className="mt-4 block text-sm font-medium text-action hover:underline">
              Browse Available Vehicles →
            </Link>
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard title="Commission leaderboard — this month">
            {data.leaderboard.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No completed sales yet this month.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-semibold">Rank</th>
                    <th className="pb-2 font-semibold">Salesperson</th>
                    <th className="pb-2 text-right font-semibold">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((row) => (
                    <tr
                      key={row.salespersonId}
                      className={`border-t border-border ${row.salespersonId === user?.id ? "bg-action/5" : ""}`}
                    >
                      <td className="py-2 font-medium text-ink">#{row.rank}</td>
                      <td className="py-2 text-ink">
                        {row.fullName}
                        {row.salespersonId === user?.id && <span className="ml-2 text-xs text-action">(you)</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink">{formatCurrency(row.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
