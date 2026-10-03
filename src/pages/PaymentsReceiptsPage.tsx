import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Clock, Plus, Printer, Receipt as ReceiptIcon, RotateCcw } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { RecordPaymentModal } from "../components/payments/RecordPaymentModal";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api-client";
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime } from "../lib/format";
import { METHOD_COLORS, TRANSACTION_TYPE_LABELS, paymentMethodLabel } from "../lib/revenue-helpers";
import { PAYMENT_METHOD_OPTIONS } from "../lib/sale-helpers";
import type { TransactionType, RevenueTransaction, RevenueTransactionListResult } from "../types/revenue";
import type { FinancingListResult } from "../types/financing";

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

const TYPE_OPTIONS: TransactionType[] = ["SALE", "RENTAL", "FINANCING_PAYMENT", "SERVICE"];

// Reconciled against finance_pages/payments.jpeg. The table/receipt
// preview are real (Receipt already carries everything needed — this
// round added `reference`, `vehicle`, `customerPhone` and `issuedBy` to
// GET /finance/receipts, plus real search/paymentMethod filters, since
// none of those existed before this page needed them). Two things in
// the mockup aren't real and were changed:
// - Every Receipt is created already-ISSUED (see financing.service.ts) —
//   there's no "Pending"/"Overdue" *receipt*, so the table's Status
//   column is always "Paid", same resolution as Rental Payments. The
//   mockup's "Payment Status" donut (Paid/Pending/Overdue) would be
//   100%/0%/0% if built honestly from receipts, so it's replaced with a
//   real "Receipts by Type" breakdown instead — still useful, not
//   misleading.
// - "Pending Payments"/"Overdue Payments" reflect Financing specifically
//   (the only transaction type with an itemized partial-payment ledger
//   this role can query) — Sales/Rentals aren't blended in, since
//   Finance Manager has no read access to /api/sales or /api/rentals,
//   and no accessible endpoint computes a true cross-type figure. Same
//   documented limitation already noted in revenue.service.ts.
// - "Generate Receipt"/"Download Receipt" aren't real standalone
//   actions — a Receipt is only ever created as a side effect of
//   recording a payment, and there's no PDF export anywhere in this
//   app. Consolidated into one real "Print Receipt" (the browser's own
//   print dialog, which already offers Save as PDF).
export function PaymentsReceiptsPage() {
  const { showToast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "">("");
  const [methodFilter, setMethodFilter] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<RevenueTransactionListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [thisMonthReceipts, setThisMonthReceipts] = useState<RevenueTransaction[] | null>(null);
  const [lastMonthReceipts, setLastMonthReceipts] = useState<RevenueTransaction[] | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<RevenueTransaction[]>([]);
  const [typeBreakdown, setTypeBreakdown] = useState<{ type: TransactionType; count: number; percent: number }[]>([]);
  const [methodBreakdown, setMethodBreakdown] = useState<{ method: string; amount: number; percent: number }[]>([]);
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [overdueTotal, setOverdueTotal] = useState<number | null>(null);

  const [selected, setSelected] = useState<RevenueTransaction | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, methodFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter) params.set("type", typeFilter);
    if (methodFilter) params.set("paymentMethod", methodFilter);

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?${params.toString()}`)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, typeFilter, methodFilter]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) => {
        setThisMonthReceipts(res.data);
        const counts = new Map<TransactionType, number>();
        for (const r of res.data) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
        const total = res.data.length;
        setTypeBreakdown(
          TYPE_OPTIONS.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({
            type: t,
            count: counts.get(t) ?? 0,
            percent: total > 0 ? Math.round(((counts.get(t) ?? 0) / total) * 100) : 0,
          }))
        );
        const methodTotals = new Map<string, number>();
        for (const r of res.data) {
          const key = r.paymentMethod ?? "UNSPECIFIED";
          methodTotals.set(key, (methodTotals.get(key) ?? 0) + r.amount);
        }
        const methodGrandTotal = [...methodTotals.values()].reduce((sum, v) => sum + v, 0);
        setMethodBreakdown(
          [...methodTotals.entries()]
            .map(([method, amount]) => ({ method, amount, percent: methodGrandTotal > 0 ? Math.round((amount / methodGrandTotal) * 100) : 0 }))
            .sort((a, b) => b.amount - a.amount)
        );
      })
      .catch(() => {
        setThisMonthReceipts(null);
        setTypeBreakdown([]);
        setMethodBreakdown([]);
      });

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`)
      .then((res) => setLastMonthReceipts(res.data))
      .catch(() => setLastMonthReceipts(null));

    api
      .get<RevenueTransactionListResult>("/finance/receipts?pageSize=5")
      .then((res) => setRecentReceipts(res.data))
      .catch(() => setRecentReceipts([]));

    api
      .get<{ report: { outstandingLoans: number } }>("/reports/finance")
      .then((res) => setPendingTotal(res.report.outstandingLoans))
      .catch(() => setPendingTotal(null));

    api
      .get<FinancingListResult>("/finance/loans?overdue=true&pageSize=100")
      .then((res) => setOverdueTotal(res.data.reduce((sum, f) => sum + Number(f.outstandingBalance), 0)))
      .catch(() => setOverdueTotal(null));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  const thisMonthReceived = useMemo(
    () => (thisMonthReceipts ? thisMonthReceipts.reduce((sum, r) => sum + r.amount, 0) : null),
    [thisMonthReceipts]
  );
  const lastMonthReceived = useMemo(
    () => (lastMonthReceipts ? lastMonthReceipts.reduce((sum, r) => sum + r.amount, 0) : null),
    [lastMonthReceipts]
  );

  function resetFilters() {
    setSearch("");
    setTypeFilter("");
    setMethodFilter("");
  }

  function handlePaymentRecorded(message: string) {
    setShowRecordPayment(false);
    showToast(message);
    loadList();
    loadSummary();
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <ReceiptIcon size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Payments &amp; Receipts</h1>
            <p className="text-sm text-muted">Record payments and manage all financial transactions.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowRecordPayment(true)}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={14} /> Record Payment
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Payments Received"
          value={formatCurrencyCompact(thisMonthReceived ?? 0)}
          sublabel={lastMonthReceived !== null ? percentChange(thisMonthReceived ?? 0, lastMonthReceived) : "This month"}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Total Receipts Issued"
          value={thisMonthReceipts !== null ? String(thisMonthReceipts.length) : "—"}
          sublabel={lastMonthReceipts !== null ? percentChange(thisMonthReceipts?.length ?? 0, lastMonthReceipts.length) : "This month"}
          icon={ReceiptIcon}
        />
        <KpiCard
          label="Pending Payments"
          value={formatCurrencyCompact(pendingTotal ?? 0)}
          sublabel="Financing — outstanding, not yet due"
          icon={Clock}
          tone={pendingTotal && pendingTotal > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Overdue Payments"
          value={formatCurrencyCompact(overdueTotal ?? 0)}
          sublabel="Financing — past due date"
          icon={AlertTriangle}
          tone={overdueTotal && overdueTotal > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, reference, or receipt no…"
          className="w-72 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TransactionType | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
        >
          <option value="">All Payment Types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TRANSACTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">
            Payment Records ({result?.meta.total ?? 0})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Receipt No.</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Reference No.</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
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
                ) : !result || result.data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted">
                      No payments match these filters.
                    </td>
                  </tr>
                ) : (
                  result.data.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selected?.id === r.id ? "bg-action/5" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-action">{r.receiptNumber}</td>
                      <td className="px-4 py-3 text-ink">{r.customerName ?? "—"}</td>
                      <td className="px-4 py-3 text-ink">{r.vehicle ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted">{r.reference ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{r.paymentMethod ? paymentMethodLabel(r.paymentMethod) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(r.date)}</td>
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
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
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

          <div className="border-t border-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Receipt Preview</h3>
            {!selected ? (
              <p className="py-6 text-center text-sm text-muted">Select a payment record to preview its receipt.</p>
            ) : (
              <div id="receipt-preview" className="rounded-lg border border-border p-5">
                <div className="flex items-start justify-between border-b border-border pb-3">
                  <div>
                    <p className="font-semibold text-ink">CarDealer Pro Ltd.</p>
                    <p className="text-xs text-muted">Official Receipt</p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>Receipt No: {selected.receiptNumber}</p>
                    <p>Date: {formatDateTime(selected.date)}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted">Customer</dt>
                  <dd className="text-right text-ink">{selected.customerName ?? "—"}</dd>
                  <dt className="text-muted">Contact</dt>
                  <dd className="text-right text-ink">{selected.customerPhone ?? "—"}</dd>
                  <dt className="text-muted">Vehicle</dt>
                  <dd className="text-right text-ink">{selected.vehicle ?? "—"}</dd>
                  <dt className="text-muted">Reference</dt>
                  <dd className="text-right text-ink">{selected.reference ?? "—"}</dd>
                  <dt className="text-muted">Payment Method</dt>
                  <dd className="text-right text-ink">{selected.paymentMethod ? paymentMethodLabel(selected.paymentMethod) : "—"}</dd>
                  <dt className="text-muted">Received By</dt>
                  <dd className="text-right text-ink">{selected.issuedBy}</dd>
                </dl>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-ink">
                  <span>{selected.description ?? TRANSACTION_TYPE_LABELS[selected.type]}</span>
                  <span>{formatCurrency(selected.amount)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="mt-4 flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
                >
                  <Printer size={14} /> Print Receipt
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Recent Receipts">
            {recentReceipts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No receipts issued yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentReceipts.map((r) => (
                  <li key={r.id} onClick={() => setSelected(r)} className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-action">{r.receiptNumber}</div>
                      <div className="truncate text-xs text-muted">{r.customerName ?? "—"}</div>
                    </div>
                    <span className="shrink-0 font-medium text-ink">{formatCurrency(r.amount)}</span>
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
                      {formatCurrencyCompact(m.amount)} ({m.percent}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Receipts by Type (This Month)">
            {typeBreakdown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No receipts issued this month.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {typeBreakdown.map((t) => (
                  <li key={t.type} className="flex items-center justify-between">
                    <span className="text-muted">{TRANSACTION_TYPE_LABELS[t.type]}</span>
                    <span className="font-medium text-ink">
                      {t.count} ({t.percent}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {showRecordPayment && <RecordPaymentModal onClose={() => setShowRecordPayment(false)} onRecorded={handlePaymentRecorded} />}
    </div>
  );
}
