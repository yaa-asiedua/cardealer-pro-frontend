import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeCheck, Clock, Handshake, Plus, RotateCcw, TrendingUp, Trophy } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { SaleDetailModal } from "../components/sales/SaleDetailModal";
import { SaleStatusBadge } from "../components/sales/SaleStatusBadge";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { paymentMethodLabel } from "../lib/revenue-helpers";
import { PAYMENT_METHOD_OPTIONS } from "../lib/sale-helpers";
import { customerDisplayName } from "../types/customer";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { SaleListResult, SaleStatus, SalesReport } from "../types/sale";

interface SalespersonOption {
  id: string;
  fullName: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

async function fetchSalesCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<SaleListResult>(`/sales?${query}`);
  return res.meta.total;
}

export function SalesPage() {
  const navigate = useNavigate();
  const { gridStroke, tickFill } = useChartTheme();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SaleStatus | "">("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<SaleListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalSales, setTotalSales] = useState<number | null>(null);
  const [pendingSales, setPendingSales] = useState<number | null>(null);
  const [allTimeRevenue, setAllTimeRevenue] = useState<number | null>(null);
  const [thisMonth, setThisMonth] = useState<SalesReport["totals"] | null>(null);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<SalesReport["bySalesperson"]>([]);
  const [chartData, setChartData] = useState<{ day: string; revenue: number }[]>([]);

  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, salespersonFilter, paymentMethodFilter]);

  useEffect(() => {
    api
      .get<{ data: SalespersonOption[] }>("/admin/users?roleCode=SALES_SALESPERSON&status=ACTIVE&pageSize=100")
      .then((res) => setSalespeople(res.data))
      .catch(() => setSalespeople([]));
  }, []);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (salespersonFilter) params.set("salespersonId", salespersonFilter);
    if (paymentMethodFilter) params.set("paymentMethod", paymentMethodFilter);

    api
      .get<SaleListResult>(`/sales?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load sales"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, salespersonFilter, paymentMethodFilter]);

  const loadKpisAndChart = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

    Promise.all([
      fetchSalesCount({}),
      fetchSalesCount({ status: "PENDING_FINANCE" }),
      api.get<{ report: SalesReport }>("/reports/sales"),
      api.get<{ report: SalesReport }>(`/reports/sales?dateFrom=${isoDate(monthStart)}`),
      api.get<{ report: SalesReport }>(
        `/reports/sales?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}`
      ),
    ])
      .then(([total, pending, allTime, monthReport, lastMonth]) => {
        setTotalSales(total);
        setPendingSales(pending);
        setAllTimeRevenue(allTime.report.totals.revenue);
        setThisMonth(monthReport.report.totals);
        setLastMonthRevenue(lastMonth.report.totals.revenue);
        setLeaderboard(monthReport.report.bySalesperson.slice(0, 5));
      })
      .catch(() => undefined);

    // Day-by-day revenue for the chart — a single fetch of this month's
    // completed sales, bucketed client-side. Accurate up to ~100 sales this
    // month (the list endpoint's pageSize cap), same tradeoff as the
    // Inventory aging check.
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
  }, []);

  useEffect(loadList, [loadList]);
  useEffect(loadKpisAndChart, [loadKpisAndChart]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setSalespersonFilter("");
    setPaymentMethodFilter("");
  }

  const revenueChangePercent = useMemo(() => {
    if (thisMonth === null || lastMonthRevenue === null || lastMonthRevenue === 0) return null;
    return Math.round(((thisMonth.revenue - lastMonthRevenue) / lastMonthRevenue) * 1000) / 10;
  }, [thisMonth, lastMonthRevenue]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total sales" value={totalSales !== null ? String(totalSales) : "—"} sublabel="All time" icon={Handshake} />
        <KpiCard
          label="Total revenue"
          value={allTimeRevenue !== null ? formatCurrencyCompact(allTimeRevenue) : "—"}
          sublabel="All time, completed"
          icon={TrendingUp}
        />
        <KpiCard
          label="Completed sales"
          value={thisMonth ? String(thisMonth.count) : "—"}
          sublabel="This month"
          icon={BadgeCheck}
          tone="success"
        />
        <KpiCard
          label="Pending sales"
          value={pendingSales !== null ? String(pendingSales) : "—"}
          sublabel="Awaiting financing decision"
          icon={Clock}
          tone="warning"
        />
        <KpiCard
          label="This month (revenue)"
          value={thisMonth ? formatCurrencyCompact(thisMonth.revenue) : "—"}
          sublabel={revenueChangePercent !== null ? `${revenueChangePercent >= 0 ? "↑" : "↓"} ${Math.abs(revenueChangePercent)}% from last month` : undefined}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Sales performance — this month">
            {chartData.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted">
                No completed sales yet this month.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: tickFill }} />
                  <YAxis tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="revenue" stroke="#2F6690" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Top salespersons — this month">
          {leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No completed sales yet this month.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {leaderboard.map((row, i) => (
                <li key={row.salespersonId} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10 text-xs font-bold text-warning">
                    {i === 0 ? <Trophy size={13} /> : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{row.fullName}</p>
                    <p className="text-xs text-muted">{row.count} sale{row.count === 1 ? "" : "s"}</p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold text-ink">{formatCurrencyCompact(row.revenue)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search invoice, customer, or vehicle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-60 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SaleStatus | "")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING_FINANCE">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="DRAFT">Draft</option>
          </select>
          <select
            value={salespersonFilter}
            onChange={(e) => setSalespersonFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Salespersons</option>
            {salespeople.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.fullName}
              </option>
            ))}
          </select>
          <select
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Payment Methods</option>
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {paymentMethodLabel(m)}
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

        <button
          type="button"
          onClick={() => navigate("/sales/new")}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={16} />
          New Sale
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Salesperson</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No sales match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => setDetailSaleId(sale.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-action">{sale.saleNumber}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(sale.saleDate)}</td>
                    <td className="px-4 py-3 text-ink">{customerDisplayName(sale.customer)}</td>
                    <td className="px-4 py-3 text-ink">{vehicleDisplayName(sale.vehicle)}</td>
                    <td className="px-4 py-3 text-ink">{sale.salesperson.fullName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(sale.finalPrice)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{sale.paymentMethod ?? "—"}</td>
                    <td className="px-4 py-3">
                      <SaleStatusBadge status={sale.saleStatus} />
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
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} sales
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

      {detailSaleId && <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />}
    </div>
  );
}
