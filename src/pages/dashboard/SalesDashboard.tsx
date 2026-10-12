import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Car, Handshake, Plus, ShoppingCart, Trophy, UserPlus, Wallet } from "lucide-react";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { SaleStatusBadge } from "../../components/sales/SaleStatusBadge";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api-client";
import { useChartTheme } from "../../lib/chart-theme";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../../lib/format";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { customerDisplayName } from "../../types/customer";
import type { Customer, CustomerListResult } from "../../types/customer";
import type { SaleListResult } from "../../types/sale";
import type { SalesDashboard as SalesDashboardData } from "../../types/dashboard";
import type { Vehicle, VehicleListResult } from "../../types/vehicle";

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

// Design Brief §6 "Salesperson": personal performance is the visual focus.
// The KPI/commission figures come from the shared /dashboard payload (data
// prop); everything else here is fetched directly, the same way SalesPage
// already does its own reporting fetches — all of it automatically scoped
// to this salesperson's own records server-side (sale.service.ts /
// customer.service.ts), no client-side filtering needed.
export function SalesDashboard({ data }: { data: SalesDashboardData }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { gridStroke, tickFill } = useChartTheme();

  const [pendingSales, setPendingSales] = useState<number | null>(null);
  const [lastMonth, setLastMonth] = useState<{ count: number; revenue: number; commission: number } | null>(null);
  const [chartData, setChartData] = useState<{ day: string; revenue: number }[]>([]);
  const [recentSales, setRecentSales] = useState<SaleListResult | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);

  const load = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

    api
      .get<SaleListResult>("/sales?status=PENDING_FINANCE&pageSize=1")
      .then((res) => setPendingSales(res.meta.total))
      .catch(() => setPendingSales(null));

    api
      .get<SaleListResult>(
        `/sales?status=COMPLETED&dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      )
      .then((res) =>
        setLastMonth({
          count: res.data.length,
          revenue: res.data.reduce((sum, s) => sum + Number(s.finalPrice), 0),
          commission: res.data.reduce((sum, s) => sum + Number(s.commissionAmount), 0),
        })
      )
      .catch(() => setLastMonth(null));

    api
      .get<SaleListResult>(`/sales?status=COMPLETED&dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) => {
        const byDay = new Map<string, number>();
        for (const sale of res.data) {
          const day = sale.saleDate.slice(0, 10);
          byDay.set(day, (byDay.get(day) ?? 0) + Number(sale.finalPrice));
        }
        setChartData(
          [...byDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, revenue]) => ({ day: formatDate(day), revenue }))
        );
      })
      .catch(() => setChartData([]));

    api
      .get<SaleListResult>("/sales?pageSize=5")
      .then(setRecentSales)
      .catch(() => setRecentSales(null));

    api
      .get<VehicleListResult>("/vehicles?status=AVAILABLE&forSale=true&pageSize=5")
      .then((res) => setAvailableVehicles(res.data))
      .catch(() => setAvailableVehicles([]));

    api
      .get<CustomerListResult>("/customers?pageSize=5")
      .then((res) => setRecentCustomers(res.data))
      .catch(() => setRecentCustomers([]));
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Welcome back, {user?.fullName?.split(" ")[0] ?? "there"}!</h1>
        <p className="text-sm text-muted">Here's an overview of your sales activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Vehicles sold (this month)"
          value={String(data.mySalesThisMonth.count)}
          sublabel={lastMonth ? percentChange(data.mySalesThisMonth.count, lastMonth.count) : undefined}
          icon={Car}
        />
        <KpiCard
          label="Sales revenue (this month)"
          value={formatCurrencyCompact(data.mySalesThisMonth.revenue)}
          sublabel={lastMonth ? percentChange(data.mySalesThisMonth.revenue, lastMonth.revenue) : undefined}
          icon={Handshake}
        />
        <KpiCard
          label="Commission earned (this month)"
          value={formatCurrency(data.myCommission.thisMonth)}
          sublabel={lastMonth ? percentChange(data.myCommission.thisMonth, lastMonth.commission) : undefined}
          icon={Wallet}
          tone="success"
        />
        <KpiCard
          label="Pending sales"
          value={pendingSales !== null ? String(pendingSales) : "—"}
          sublabel="Awaiting financing"
          icon={Trophy}
          tone={pendingSales && pendingSales > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Sales performance (this month)">
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No completed sales yet this month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart accessibilityLayer data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="day" tick={{ fill: tickFill, fontSize: 12 }} />
                  <YAxis tick={{ fill: tickFill, fontSize: 12 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="revenue" name="Actual sales" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Quick actions">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigate("/sales/new")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Plus size={18} className="text-action" />
              New Sale
            </button>
            <button
              type="button"
              onClick={() => navigate("/customers/new")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <UserPlus size={18} className="text-action" />
              Add Customer
            </button>
            <button
              type="button"
              onClick={() => navigate("/vehicles")}
              className="col-span-2 flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <ShoppingCart size={18} className="text-action" />
              View Vehicles
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Available vehicles">
          {availableVehicles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No available vehicles right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {availableVehicles.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{vehicleDisplayName(v)}</span>
                  <span className="tabular-nums text-muted">
                    {v.sellingPrice ? formatCurrency(Number(v.sellingPrice)) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/vehicles" className="touch-target mt-3 block text-sm font-medium text-action hover:underline">
            View all →
          </Link>
        </SectionCard>

        <SectionCard title="My customers">
          {recentCustomers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No customers yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentCustomers.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{customerDisplayName(c)}</span>
                  <span className="text-muted">{c.phone ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/customers" className="touch-target mt-3 block text-sm font-medium text-action hover:underline">
            View all →
          </Link>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Recent sales">
          {!recentSales || recentSales.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-semibold">Vehicle</th>
                    <th className="pb-2 font-semibold">Customer</th>
                    <th className="pb-2 font-semibold">Sale Date</th>
                    <th className="pb-2 text-right font-semibold">Amount</th>
                    <th className="pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.data.map((sale) => (
                    <tr key={sale.id} className="border-t border-border">
                      <td className="py-2 text-ink">{vehicleDisplayName(sale.vehicle)}</td>
                      <td className="py-2 text-ink">{customerDisplayName(sale.customer)}</td>
                      <td className="py-2 text-ink">{formatDate(sale.saleDate)}</td>
                      <td className="py-2 text-right tabular-nums text-ink">{formatCurrency(Number(sale.finalPrice))}</td>
                      <td className="py-2">
                        <SaleStatusBadge status={sale.saleStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link to="/sales" className="touch-target mt-3 block text-sm font-medium text-action hover:underline">
            View all →
          </Link>
        </SectionCard>
      </div>

      {data.leaderboard.length > 0 && (
        <div className="mt-6">
          <SectionCard title="Commission leaderboard — this month">
            <div className="overflow-x-auto">
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
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
