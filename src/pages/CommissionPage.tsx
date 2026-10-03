import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, Car, Clock, Loader2, RotateCcw, ShoppingBag, Wallet } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { SalePaymentStatusBadge } from "../components/sales/SalePaymentStatusBadge";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { customerDisplayName } from "../types/customer";
import type { Sale, SaleListResult, SalePaymentStatus } from "../types/sale";

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

const BREAKDOWN_COLORS: Record<SalePaymentStatus, string> = {
  RECEIVED: "#16a34a",
  PENDING: "#d97706",
  REVERSED: "#dc2626",
};

const BREAKDOWN_LABELS: Record<SalePaymentStatus, string> = {
  RECEIVED: "Paid",
  PENDING: "Pending",
  REVERSED: "Cancelled/Adjusted",
};

const inputCls = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink";

// "Paid" vs "Pending" commission here means the real Sale.paymentStatus —
// whether the customer's own payment has come in — not a separate
// dealership payroll/payout system, which doesn't exist anywhere in the
// schema. Confirmed with the user before building it this way.
export function CommissionPage() {
  const { gridStroke, tickFill } = useChartTheme();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<SalePaymentStatus | "">("");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<SaleListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [thisMonth, setThisMonth] = useState<Sale[] | null>(null);
  const [lastMonthTotals, setLastMonthTotals] = useState<{ commission: number; sales: number } | null>(null);
  const [trend, setTrend] = useState<{ month: string; commission: number }[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, paymentStatusFilter, vehicleTypeFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "8" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
    if (vehicleTypeFilter) params.set("vehicleType", vehicleTypeFilter);

    api
      .get<SaleListResult>(`/sales?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load commission records"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, paymentStatusFilter, vehicleTypeFilter]);

  useEffect(loadList, [loadList]);

  const loadStats = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    const { start: trendStart } = monthBounds(9); // last 10 months, matching the mockup's Jan-Oct span

    api
      .get<SaleListResult>(`/sales?status=COMPLETED&dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) => setThisMonth(res.data))
      .catch(() => setThisMonth(null));

    api
      .get<SaleListResult>(
        `/sales?status=COMPLETED&dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      )
      .then((res) =>
        setLastMonthTotals({
          commission: res.data.reduce((sum, s) => sum + Number(s.commissionAmount), 0),
          sales: res.data.reduce((sum, s) => sum + Number(s.finalPrice), 0),
        })
      )
      .catch(() => setLastMonthTotals(null));

    api
      .get<SaleListResult>(`/sales?status=COMPLETED&dateFrom=${isoDate(trendStart)}&pageSize=100`)
      .then((res) => {
        const byMonth = new Map<string, number>();
        for (const s of res.data) {
          const key = s.saleDate.slice(0, 7);
          byMonth.set(key, (byMonth.get(key) ?? 0) + Number(s.commissionAmount));
        }
        setTrend(
          [...byMonth.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, commission]) => ({
              month: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
              commission,
            }))
        );
      })
      .catch(() => setTrend([]));

    // Vehicle Type filter options, drawn from this salesperson's own sales
    // rather than the full inventory — matches what this page is scoped to.
    api
      .get<SaleListResult>("/sales?pageSize=100")
      .then((res) => {
        const types = new Set(res.data.map((s) => s.vehicle.vehicleType).filter((t): t is string => Boolean(t)));
        setVehicleTypes([...types]);
      })
      .catch(() => setVehicleTypes([]));
  }, []);

  useEffect(loadStats, [loadStats]);

  const totals = useMemo(() => {
    if (!thisMonth) return null;
    const totalCommission = thisMonth.reduce((sum, s) => sum + Number(s.commissionAmount), 0);
    const totalSalesValue = thisMonth.reduce((sum, s) => sum + Number(s.finalPrice), 0);
    const byStatus: Record<SalePaymentStatus, number> = { RECEIVED: 0, PENDING: 0, REVERSED: 0 };
    for (const s of thisMonth) byStatus[s.paymentStatus] += Number(s.commissionAmount);
    return { totalCommission, totalSalesValue, byStatus };
  }, [thisMonth]);

  const breakdownData = useMemo(() => {
    if (!totals) return [];
    return (Object.keys(totals.byStatus) as SalePaymentStatus[])
      .map((status) => ({ status, value: totals.byStatus[status] }))
      .filter((d) => d.value > 0);
  }, [totals]);

  function resetFilters() {
    setSearch("");
    setPaymentStatusFilter("");
    setVehicleTypeFilter("");
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <Wallet size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">My Commission</h1>
          <p className="text-sm text-muted">Track your earnings and payouts.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Commission Earned"
          value={formatCurrency(totals?.totalCommission ?? 0)}
          sublabel={lastMonthTotals ? percentChange(totals?.totalCommission ?? 0, lastMonthTotals.commission) : "This month"}
          icon={Wallet}
        />
        <KpiCard
          label="Pending Commission"
          value={formatCurrency(totals?.byStatus.PENDING ?? 0)}
          sublabel="Awaiting payment"
          icon={Clock}
          tone={totals && totals.byStatus.PENDING > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Paid Commission"
          value={formatCurrency(totals?.byStatus.RECEIVED ?? 0)}
          sublabel="Payment received"
          icon={ShoppingBag}
          tone="success"
        />
        <KpiCard
          label="Total Sales Value"
          value={formatCurrencyCompact(totals?.totalSalesValue ?? 0)}
          sublabel={lastMonthTotals ? percentChange(totals?.totalSalesValue ?? 0, lastMonthTotals.sales) : "This month"}
          icon={Car}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Commission Trend">
            {trend.length === 0 ? (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted">No commission history yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickFill }} />
                  <YAxis tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="commission" fill="#2F6690" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Commission Breakdown">
          {breakdownData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted">No commission this month.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={breakdownData} dataKey="value" nameKey="status" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {breakdownData.map((d) => (
                    <Cell key={d.status} fill={BREAKDOWN_COLORS[d.status]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, _name, item) => [formatCurrency(v), BREAKDOWN_LABELS[item.payload.status as SalePaymentStatus]]} />
                <Legend
                  formatter={(_value, entry) => BREAKDOWN_LABELS[(entry.payload as unknown as { status: SalePaymentStatus }).status]}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-ink">Commission Records</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, vehicle, or sale reference…"
            className={`${inputCls} w-64`}
          />
          <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value as SalePaymentStatus | "")} className={inputCls}>
            <option value="">All Payment Statuses</option>
            <option value="RECEIVED">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="REVERSED">Refunded</option>
          </select>
          <select value={vehicleTypeFilter} onChange={(e) => setVehicleTypeFilter(e.target.value)} className={inputCls}>
            <option value="">All Vehicle Types</option>
            {vehicleTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Sale Reference</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-right font-semibold">Sale Amount</th>
                <th className="px-4 py-3 text-right font-semibold">Commission</th>
                <th className="px-4 py-3 font-semibold">Sale Date</th>
                <th className="px-4 py-3 font-semibold">Payment Status</th>
                <th className="px-4 py-3 font-semibold">Payment Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    <Loader2 size={18} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No commission records match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((sale) => (
                  <tr key={sale.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-action">{sale.saleNumber}</td>
                    <td className="px-4 py-3 text-ink">{customerDisplayName(sale.customer)}</td>
                    <td className="px-4 py-3 text-ink">{vehicleDisplayName(sale.vehicle)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(Number(sale.finalPrice))}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(Number(sale.commissionAmount))}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(sale.saleDate)}</td>
                    <td className="px-4 py-3">
                      <SalePaymentStatusBadge status={sale.paymentStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {sale.receipts && sale.receipts.length > 0 ? formatDate(sale.receipts[0].issuedAt) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {result && result.meta.pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <span className="text-muted">
                Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
                {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} records
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                >
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
    </div>
  );
}
