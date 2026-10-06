import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, RotateCcw, Tag, UserPlus, Wallet } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { SaleDetailModal } from "../components/sales/SaleDetailModal";
import { SalePaymentStatusBadge } from "../components/sales/SalePaymentStatusBadge";
import { SaleStatusBadge } from "../components/sales/SaleStatusBadge";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { customerDisplayName } from "../types/customer";
import type { Sale, SaleListResult, SaleStatus } from "../types/sale";

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

const inputCls = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink";

// The Sales Salesperson's own "My Sales" — a dedicated page rather than a
// reuse of Admin's SalesPage.tsx, since the mockup's layout genuinely
// differs (no chart/leaderboard; a Recent Sale + Quick Actions sidebar
// instead). The underlying /sales endpoint is already scoped to this
// salesperson's own sales server-side (sale.service.ts), same as before.
export function MySalesPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SaleStatus | "">("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<SaleListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>([]);

  const [thisMonth, setThisMonth] = useState<{ count: number; revenue: number; commission: number } | null>(null);
  const [lastMonth, setLastMonth] = useState<{ count: number; revenue: number; commission: number } | null>(null);
  const [pendingSales, setPendingSales] = useState<number | null>(null);
  const [mostRecent, setMostRecent] = useState<Sale | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, vehicleFilter, dateFrom, dateTo]);

  // Vehicle filter options — reuses the same vehicles this salesperson has
  // actually sold, not the full inventory (a "Vehicles I've sold" filter,
  // matching what this page is actually scoped to).
  useEffect(() => {
    api
      .get<SaleListResult>("/sales?pageSize=100")
      .then((res) => {
        const seen = new Map<string, string>();
        for (const s of res.data) seen.set(s.vehicle.id, vehicleDisplayName(s.vehicle));
        setVehicles([...seen.entries()].map(([id, label]) => ({ id, label })));
      })
      .catch(() => setVehicles([]));
  }, []);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "8" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (vehicleFilter) params.set("vehicleId", vehicleFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    api
      .get<SaleListResult>(`/sales?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load sales"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, vehicleFilter, dateFrom, dateTo]);

  useEffect(loadList, [loadList]);

  const loadKpis = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

    api
      .get<SaleListResult>(`/sales?status=COMPLETED&dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) =>
        setThisMonth({
          count: res.data.length,
          revenue: res.data.reduce((sum, s) => sum + Number(s.finalPrice), 0),
          commission: res.data.reduce((sum, s) => sum + Number(s.commissionAmount), 0),
        })
      )
      .catch(() => setThisMonth(null));

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
      .get<SaleListResult>("/sales?status=PENDING_FINANCE&pageSize=1")
      .then((res) => setPendingSales(res.meta.total))
      .catch(() => setPendingSales(null));

    api
      .get<SaleListResult>("/sales?pageSize=1")
      .then((res) => setMostRecent(res.data[0] ?? null))
      .catch(() => setMostRecent(null));
  }, []);

  useEffect(loadKpis, [loadKpis]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setVehicleFilter("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Tag size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">My Sales</h1>
            <p className="text-sm text-muted">View and manage all your sales transactions.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/sales/new")}
          className="shrink-0 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          + New Sale
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total sales"
          value={thisMonth ? String(thisMonth.count) : "—"}
          sublabel={lastMonth ? percentChange(thisMonth?.count ?? 0, lastMonth.count) : "This month"}
          icon={Tag}
        />
        <KpiCard
          label="Total sales revenue"
          value={formatCurrencyCompact(thisMonth?.revenue ?? 0)}
          sublabel={lastMonth ? percentChange(thisMonth?.revenue ?? 0, lastMonth.revenue) : "This month"}
          icon={Wallet}
        />
        <KpiCard
          label="Commission earned"
          value={formatCurrency(thisMonth?.commission ?? 0)}
          sublabel={lastMonth ? percentChange(thisMonth?.commission ?? 0, lastMonth.commission) : "This month"}
          icon={Wallet}
          tone="success"
        />
        <KpiCard
          label="Pending sales"
          value={pendingSales !== null ? String(pendingSales) : "—"}
          sublabel="Awaiting financing"
          icon={Car}
          tone={pendingSales && pendingSales > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, vehicle, or reference number…"
              className={`${inputCls} w-64`}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SaleStatus | "")} className={inputCls}>
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING_FINANCE">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="DRAFT">Draft</option>
            </select>
            <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className={inputCls}>
              <option value="">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
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
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Sale Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
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
                        <td className="px-4 py-3 text-ink">{customerDisplayName(sale.customer)}</td>
                        <td className="px-4 py-3 text-ink">{vehicleDisplayName(sale.vehicle)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(sale.saleDate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(Number(sale.finalPrice))}</td>
                        <td className="px-4 py-3">
                          <SaleStatusBadge status={sale.saleStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <SalePaymentStatusBadge status={sale.paymentStatus} />
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
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Recent sale">
            {mostRecent ? (
              <div>
                <p className="font-semibold text-ink">{vehicleDisplayName(mostRecent.vehicle)}</p>
                <p className="mb-2 text-xs text-muted">{mostRecent.vehicle.registrationNo ?? "—"}</p>
                <SaleStatusBadge status={mostRecent.saleStatus} />
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Customer</dt>
                    <dd className="text-ink">{customerDisplayName(mostRecent.customer)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Sale Date</dt>
                    <dd className="text-ink">{formatDate(mostRecent.saleDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Amount</dt>
                    <dd className="text-ink">{formatCurrency(Number(mostRecent.finalPrice))}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Payment Status</dt>
                    <dd>
                      <SalePaymentStatusBadge status={mostRecent.paymentStatus} />
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => setDetailSaleId(mostRecent.id)}
                  className="mt-3 w-full rounded-lg bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-primary"
                >
                  View Details
                </button>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">No sales yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate("/vehicles")}
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
              >
                <Car size={18} className="text-action" />
                View Vehicles
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
                onClick={() => navigate("/commission")}
                className="col-span-2 flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
              >
                <Wallet size={18} className="text-action" />
                My Commission
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      {detailSaleId && <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />}
    </div>
  );
}
