import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, Clock, Plus, RotateCcw, Wallet } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { RecordRentalPaymentModal } from "../components/rentals/RecordRentalPaymentModal";
import { RentalDetailModal } from "../components/rentals/RentalDetailModal";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { METHOD_COLORS, paymentMethodLabel } from "../lib/revenue-helpers";
import { PAYMENT_METHOD_OPTIONS } from "../lib/sale-helpers";
import { daysOverdue } from "../lib/rental-helpers";
import { customerDisplayName } from "../types/customer";
import { outstandingBalance } from "../types/rental";
import type { Rental, RentalListResult, RentalPaymentListResult, RentalPaymentListRow } from "../types/rental";

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

// Reconciled against rentals_pages/rental payments.jpeg, with one real
// mismatch resolved up front (confirmed with the user): RentalPayment
// rows are a simple received-money ledger — a row only ever exists once
// money has actually come in, so there's no real "Pending"/"Overdue"
// *payment row* the way the mockup's table implies. Resolved as:
// Payments Received = real cash collected this month (sum of
// RentalPayment.amount); Pending/Overdue Payments = outstanding balance
// on open/overdue rentals (totalCost - paid, same outstandingBalance()
// helper used elsewhere); Payment Records = real RentalPayment
// transactions only, always "Paid" (nothing else a recorded payment
// could be). Also required a new backend endpoint (GET
// /api/rentals/payments) and a new RentalPayment.paymentRef field — this
// role had no way to list individual payment transactions with full
// detail before now.
export function RentalPaymentsPage() {
  const { showToast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<RentalPaymentListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingRentalId, setViewingRentalId] = useState<string | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);

  const [thisMonthRevenue, setThisMonthRevenue] = useState<number | null>(null);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<number | null>(null);
  const [thisMonthReceived, setThisMonthReceived] = useState<number | null>(null);
  const [lastMonthReceived, setLastMonthReceived] = useState<number | null>(null);
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [overdueTotal, setOverdueTotal] = useState<number | null>(null);
  const [recentPayments, setRecentPayments] = useState<RentalPaymentListRow[]>([]);
  const [overdueRentals, setOverdueRentals] = useState<Rental[]>([]);
  const [methodBreakdown, setMethodBreakdown] = useState<{ method: string; count: number; percent: number }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, methodFilter, dateFrom, dateTo]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (methodFilter) params.set("paymentMethod", methodFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    api
      .get<RentalPaymentListResult>(`/rentals/payments?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load payments"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, methodFilter, dateFrom, dateTo]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

    Promise.all([
      api.get<RentalListResult>(`/rentals?status=ACTIVE&dateFrom=${isoDate(monthStart)}&pageSize=100`),
      api.get<RentalListResult>(`/rentals?status=COMPLETED&dateFrom=${isoDate(monthStart)}&pageSize=100`),
    ])
      .then(([active, completed]) =>
        setThisMonthRevenue([...active.data, ...completed.data].reduce((sum, r) => sum + Number(r.totalCost), 0))
      )
      .catch(() => setThisMonthRevenue(null));

    Promise.all([
      api.get<RentalListResult>(
        `/rentals?status=ACTIVE&dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      ),
      api.get<RentalListResult>(
        `/rentals?status=COMPLETED&dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      ),
    ])
      .then(([active, completed]) =>
        setLastMonthRevenue([...active.data, ...completed.data].reduce((sum, r) => sum + Number(r.totalCost), 0))
      )
      .catch(() => setLastMonthRevenue(null));

    api
      .get<RentalPaymentListResult>(`/rentals/payments?dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) => {
        setThisMonthReceived(res.data.reduce((sum, p) => sum + Number(p.amount), 0));
        const counts = new Map<string, number>();
        for (const p of res.data) {
          const key = p.paymentMethod ?? "UNSPECIFIED";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const total = res.data.length;
        setMethodBreakdown(
          [...counts.entries()]
            .map(([method, count]) => ({ method, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 }))
            .sort((a, b) => b.count - a.count)
        );
      })
      .catch(() => {
        setThisMonthReceived(null);
        setMethodBreakdown([]);
      });

    api
      .get<RentalPaymentListResult>(
        `/rentals/payments?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      )
      .then((res) => setLastMonthReceived(res.data.reduce((sum, p) => sum + Number(p.amount), 0)))
      .catch(() => setLastMonthReceived(null));

    api
      .get<RentalPaymentListResult>("/rentals/payments?pageSize=5")
      .then((res) => setRecentPayments(res.data))
      .catch(() => setRecentPayments([]));

    Promise.all([
      api.get<RentalListResult>("/rentals?status=CONFIRMED&pageSize=100"),
      api.get<RentalListResult>("/rentals?status=ACTIVE&pageSize=100"),
    ])
      .then(([confirmed, active]) => {
        const now = new Date();
        let pending = 0;
        let overdue = 0;
        const overdueList: Rental[] = [];
        for (const r of confirmed.data) pending += outstandingBalance(r);
        for (const r of active.data) {
          const balance = outstandingBalance(r);
          if (balance <= 0) continue;
          if (new Date(r.endDate) < now) {
            overdue += balance;
            overdueList.push(r);
          } else {
            pending += balance;
          }
        }
        setPendingTotal(pending);
        setOverdueTotal(overdue);
        setOverdueRentals(overdueList.sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(0, 5));
      })
      .catch(() => {
        setPendingTotal(null);
        setOverdueTotal(null);
        setOverdueRentals([]);
      });
  }, []);

  useEffect(loadSummary, [loadSummary]);

  function resetFilters() {
    setSearch("");
    setMethodFilter("");
    setDateFrom("");
    setDateTo("");
  }

  function handlePaymentRecorded(message: string) {
    showToast(message);
    loadList();
    loadSummary();
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Banknote size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Rental Payments</h1>
            <p className="text-sm text-muted">Track and manage payments for all your rental bookings.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowRecordModal(true)}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={14} /> Record Payment
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Payments (This Period)"
          value={formatCurrencyCompact(thisMonthRevenue ?? 0)}
          sublabel={lastMonthRevenue !== null ? percentChange(thisMonthRevenue ?? 0, lastMonthRevenue) : "This month"}
          icon={Wallet}
        />
        <KpiCard
          label="Payments Received"
          value={formatCurrencyCompact(thisMonthReceived ?? 0)}
          sublabel={lastMonthReceived !== null ? percentChange(thisMonthReceived ?? 0, lastMonthReceived) : "This month"}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Pending Payments"
          value={formatCurrencyCompact(pendingTotal ?? 0)}
          sublabel="Outstanding on open rentals"
          icon={Clock}
          tone={pendingTotal && pendingTotal > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Overdue Payments"
          value={formatCurrencyCompact(overdueTotal ?? 0)}
          sublabel="Outstanding, past return date"
          icon={AlertTriangle}
          tone={overdueTotal && overdueTotal > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, rental reference, or vehicle…"
          className={`${inputCls} w-72`}
        />
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className={inputCls}>
          <option value="">All Payment Methods</option>
          {PAYMENT_METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel(m)}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">
            Payment Records ({result?.meta.total ?? 0})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Payment Ref</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Rental Ref</th>
                  <th className="px-4 py-3 font-semibold">Payment Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
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
                      No payments match these filters.
                    </td>
                  </tr>
                ) : (
                  result.data.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setViewingRentalId(p.rental.id)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface"
                    >
                      <td className="px-4 py-3 font-medium text-action">{p.paymentRef}</td>
                      <td className="px-4 py-3 text-ink">{customerDisplayName(p.rental.customer)}</td>
                      <td className="px-4 py-3 text-ink">
                        {p.rental.vehicle.make} {p.rental.vehicle.model}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{p.rental.rentalNumber}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(p.paymentDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                          Paid
                        </span>
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
                {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} payments
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

        <div className="flex flex-col gap-4">
          <SectionCard title="Recent Payments">
            {recentPayments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentPayments.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => setViewingRentalId(p.rental.id)}
                    className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{customerDisplayName(p.rental.customer)}</div>
                      <div className="truncate text-xs text-muted">
                        {p.rental.vehicle.make} {p.rental.vehicle.model} · {p.rental.rentalNumber}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-medium text-ink">{formatCurrency(p.amount)}</div>
                      <div className="text-xs text-muted">{formatDate(p.paymentDate)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Overdue Payments">
            {overdueRentals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No overdue balances right now.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {overdueRentals.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => setViewingRentalId(r.id)}
                    className="flex cursor-pointer items-start gap-2 py-2.5 text-sm hover:bg-surface"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{customerDisplayName(r.customer)}</div>
                      <div className="truncate text-xs text-muted">
                        {r.rentalNumber} · {daysOverdue(r.endDate)} day{daysOverdue(r.endDate) === 1 ? "" : "s"} overdue
                      </div>
                    </div>
                    <span className="shrink-0 font-medium text-danger">{formatCurrency(outstandingBalance(r))}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Payment Methods (This Month)">
            {methodBreakdown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No payments recorded this month.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {methodBreakdown.map((m) => (
                  <li key={m.method} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METHOD_COLORS[m.method] ?? METHOD_COLORS.UNSPECIFIED }} />
                      {paymentMethodLabel(m.method)}
                    </span>
                    <span className="font-medium text-ink">
                      {m.count} ({m.percent}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {viewingRentalId && <RentalDetailModal rentalId={viewingRentalId} onClose={() => setViewingRentalId(null)} />}
      {showRecordModal && <RecordRentalPaymentModal onClose={() => setShowRecordModal(false)} onRecorded={handlePaymentRecorded} />}
    </div>
  );
}
