import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Calendar, CalendarClock, Plus, RotateCcw, Wallet } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { RentalDetailModal } from "../components/rentals/RentalDetailModal";
import { RentalRowStatusBadge } from "../components/rentals/RentalRowStatusBadge";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { daysOverdue } from "../lib/rental-helpers";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { customerDisplayName } from "../types/customer";
import type { Rental, RentalListResult } from "../types/rental";

type FilterKey = "" | "ACTIVE" | "DUE_TODAY" | "OVERDUE" | "COMPLETED" | "CANCELLED";

const PILLS: { key: FilterKey; label: string }[] = [
  { key: "", label: "All Rentals" },
  { key: "ACTIVE", label: "Active" },
  { key: "DUE_TODAY", label: "Due Today" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
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

function filterParams(key: FilterKey): Record<string, string> {
  switch (key) {
    case "ACTIVE":
      return { status: "ACTIVE" };
    case "DUE_TODAY":
      return { dueToday: "true" };
    case "OVERDUE":
      return { overdue: "true" };
    case "COMPLETED":
      return { status: "COMPLETED" };
    case "CANCELLED":
      return { status: "CANCELLED" };
    default:
      return {};
  }
}

const inputCls = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink";

// The Rental Salesperson's own "My Rentals" — reconciled against
// rentals_pages/my rentals.jpeg, modeled on MySalesPage.tsx's layout
// (KPIs = this month's flow metrics with a real month-over-month %, same
// as Sales; Active/Due Today/Overdue stay snapshot counts with no
// fabricated comparison, same rule the Dashboard already applies). The
// status pills use real query flags (dueToday/overdue aren't stored
// values — see rental.service.ts), each with its own precise count query
// rather than a single capped bulk fetch.
export function MyRentalsPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterKey, setFilterKey] = useState<FilterKey>("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<RentalListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRentalId, setDetailRentalId] = useState<string | null>(null);

  const [pillCounts, setPillCounts] = useState<Record<FilterKey, number | null>>({
    "": null,
    ACTIVE: null,
    DUE_TODAY: null,
    OVERDUE: null,
    COMPLETED: null,
    CANCELLED: null,
  });
  const [thisMonth, setThisMonth] = useState<{ count: number; revenue: number } | null>(null);
  const [lastMonth, setLastMonth] = useState<{ count: number; revenue: number } | null>(null);
  const [vehicleOptions, setVehicleOptions] = useState<{ id: string; label: string }[]>([]);
  const [upcomingReturns, setUpcomingReturns] = useState<Rental[]>([]);
  const [needingAttention, setNeedingAttention] = useState<Rental[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterKey, vehicleFilter, dateFrom, dateTo]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10", ...filterParams(filterKey) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (vehicleFilter) params.set("vehicleId", vehicleFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    api
      .get<RentalListResult>(`/rentals?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load rentals"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, filterKey, vehicleFilter, dateFrom, dateTo]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

    Promise.all(
      PILLS.map(({ key }) =>
        api
          .get<RentalListResult>(`/rentals?pageSize=1&${new URLSearchParams(filterParams(key)).toString()}`)
          .then((res) => [key, res.meta.total] as const)
          .catch(() => [key, null] as const)
      )
    ).then((entries) => setPillCounts(Object.fromEntries(entries) as Record<FilterKey, number | null>));

    api
      .get<RentalListResult>(`/rentals?dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) =>
        setThisMonth({
          count: res.data.length,
          revenue: res.data
            .filter((r) => r.rentalStatus === "ACTIVE" || r.rentalStatus === "COMPLETED")
            .reduce((sum, r) => sum + Number(r.totalCost), 0),
        })
      )
      .catch(() => setThisMonth(null));

    api
      .get<RentalListResult>(`/rentals?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`)
      .then((res) =>
        setLastMonth({
          count: res.data.length,
          revenue: res.data
            .filter((r) => r.rentalStatus === "ACTIVE" || r.rentalStatus === "COMPLETED")
            .reduce((sum, r) => sum + Number(r.totalCost), 0),
        })
      )
      .catch(() => setLastMonth(null));

    api
      .get<RentalListResult>("/rentals?pageSize=100")
      .then((res) => {
        const seen = new Map<string, string>();
        for (const r of res.data) seen.set(r.vehicle.id, vehicleDisplayName(r.vehicle));
        setVehicleOptions([...seen.entries()].map(([id, label]) => ({ id, label })));
      })
      .catch(() => setVehicleOptions([]));

    api
      .get<RentalListResult>("/rentals?status=ACTIVE&pageSize=100")
      .then((res) => {
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        setUpcomingReturns(
          res.data
            .filter((r) => {
              const end = new Date(r.endDate);
              return end.getTime() > now.getTime() && end.getTime() <= in7Days.getTime();
            })
            .sort((a, b) => a.endDate.localeCompare(b.endDate))
            .slice(0, 5)
        );
      })
      .catch(() => setUpcomingReturns([]));

    api
      .get<RentalListResult>("/rentals?overdue=true&pageSize=5")
      .then((res) => setNeedingAttention(res.data))
      .catch(() => setNeedingAttention([]));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  function resetFilters() {
    setSearch("");
    setFilterKey("");
    setVehicleFilter("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Calendar size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">My Rentals</h1>
            <p className="text-sm text-muted">View and manage all rentals you have created.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/rentals/new")}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={14} /> Add New Rental
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Total Rentals"
          value={thisMonth ? String(thisMonth.count) : "—"}
          sublabel={lastMonth ? percentChange(thisMonth?.count ?? 0, lastMonth.count) : "This month"}
          icon={Calendar}
        />
        <KpiCard
          label="Active Rentals"
          value={pillCounts.ACTIVE !== null ? String(pillCounts.ACTIVE) : "—"}
          icon={Calendar}
        />
        <KpiCard
          label="Due for Return Today"
          value={pillCounts.DUE_TODAY !== null ? String(pillCounts.DUE_TODAY) : "—"}
          icon={CalendarClock}
          tone={pillCounts.DUE_TODAY ? "warning" : "default"}
        />
        <KpiCard
          label="Overdue Rentals"
          value={pillCounts.OVERDUE !== null ? String(pillCounts.OVERDUE) : "—"}
          icon={AlertTriangle}
          tone={pillCounts.OVERDUE ? "danger" : "default"}
        />
        <KpiCard
          label="Rental Revenue"
          value={formatCurrencyCompact(thisMonth?.revenue ?? 0)}
          sublabel={lastMonth ? percentChange(thisMonth?.revenue ?? 0, lastMonth.revenue) : "This month"}
          icon={Wallet}
          tone="success"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setFilterKey(p.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filterKey === p.key ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {p.label} ({pillCounts[p.key] ?? "—"})
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, vehicle, or rental reference…"
              className={`${inputCls} w-64`}
            />
            <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} className={inputCls}>
              <option value="">All Vehicles</option>
              {vehicleOptions.map((v) => (
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
                    <th className="px-4 py-3 font-semibold">Rental Ref</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Rental Period</th>
                    <th className="px-4 py-3 text-right font-semibold">Daily Rate</th>
                    <th className="px-4 py-3 text-right font-semibold">Total Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-danger">
                        {error}
                      </td>
                    </tr>
                  ) : !result || result.data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted">
                        No rentals match these filters.
                      </td>
                    </tr>
                  ) : (
                    result.data.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setDetailRentalId(r.id)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-surface"
                      >
                        <td className="px-4 py-3 font-medium text-action">{r.rentalNumber}</td>
                        <td className="px-4 py-3 text-ink">{customerDisplayName(r.customer)}</td>
                        <td className="px-4 py-3 text-ink">{vehicleDisplayName(r.vehicle)}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {formatDate(r.startDate)} – {formatDate(r.endDate)}
                          <div>
                            {r.rentalDays} day{r.rentalDays === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(r.dailyRate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(r.totalCost)}</td>
                        <td className="px-4 py-3">
                          <RentalRowStatusBadge rental={r} />
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
                  {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} rentals
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
          <SectionCard title="Upcoming Returns (Next 7 Days)">
            {upcomingReturns.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No returns due in the next 7 days.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {upcomingReturns.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => setDetailRentalId(r.id)}
                    className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{customerDisplayName(r.customer)}</div>
                      <div className="truncate text-xs text-muted">{vehicleDisplayName(r.vehicle)}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{formatDate(r.endDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Rentals Needing Attention">
            {needingAttention.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Nothing overdue right now.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {needingAttention.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => setDetailRentalId(r.id)}
                    className="flex cursor-pointer items-start gap-2 py-2.5 text-sm hover:bg-surface"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">
                        {r.rentalNumber} · {daysOverdue(r.endDate)} day{daysOverdue(r.endDate) === 1 ? "" : "s"} overdue
                      </div>
                      <div className="truncate text-xs text-muted">
                        {customerDisplayName(r.customer)} · Return date: {formatDate(r.endDate)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {detailRentalId && <RentalDetailModal rentalId={detailRentalId} onClose={() => setDetailRentalId(null)} />}
    </div>
  );
}
