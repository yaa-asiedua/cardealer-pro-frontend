import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Clock, Plus, Receipt as ReceiptIcon, RotateCcw } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { FinancingDetailModal } from "../components/financing/FinancingDetailModal";
import { RecordPaymentModal } from "../components/payments/RecordPaymentModal";
import { useChartTheme } from "../lib/chart-theme";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api-client";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import {
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_STYLES,
  currentInstallment,
  daysOverdue,
  daysUntil,
  installmentStatus,
  installmentsDueInRange,
} from "../lib/financing-schedule";
import type { Installment, InstallmentStatus } from "../lib/financing-schedule";
import { customerDisplayName } from "../types/customer";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { Financing, FinancingListResult } from "../types/financing";
import type { RevenueTransactionListResult } from "../types/revenue";

type Tab = "" | "UPCOMING" | "OVERDUE" | "COMPLETED";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short" });
}

function percentChange(current: number, previous: number): string | undefined {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change vs last month";
  return `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}% vs last month`;
}

interface Row {
  financing: Financing;
  installment: Installment | null;
  status: InstallmentStatus;
}

// Reconciled against finance_pages/repayments.jpeg — this is the real
// "View Repayment Schedule" feature deferred from the Dashboard/
// Financing Quick Actions. Entirely derived from already-stored loan
// terms (termMonths/monthlyPayment/firstPaymentDue, see
// lib/financing-schedule.ts) — no installment is stored anywhere, so
// this is computed client-side from one bulk fetch rather than a
// server-paginated query, the same "derived, not a new stored concept"
// treatment as Rental/Sale balance calcs elsewhere. One real,
// deliberate inconsistency with other Finance pages, flagged in
// financing-schedule.ts too: Overdue here is based on the CURRENT
// installment's own due date, not the loan's firstPaymentDue (which is
// what the overdue=true flag used on the Dashboard/Financing/Payments
// pages checks) — that flag effectively never clears once a loan's
// first month has passed, which isn't useful for installment-level
// tracking. The two pages can legitimately show different numbers for
// the same loan.
//
// Dropped, not real: the mockup's "All Risk Levels" filter (the paused
// AI risk-scoring feature, same call made on every other Finance page)
// and "Send Reminder"/"Follow Up" actions — customers aren't notifiable
// users in this system (no email/SMS provider, no customer login), so
// there's no real recipient or channel for a reminder. Replaced with a
// real "View" action opening the existing loan detail modal.
export function RepaymentsPage() {
  const { showToast } = useToast();
  const { gridStroke, tickFill } = useChartTheme();

  const [allLoans, setAllLoans] = useState<Financing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState<Tab>("");
  const [page, setPage] = useState(1);

  const [thisMonthReceived, setThisMonthReceived] = useState<number | null>(null);
  const [lastMonthReceived, setLastMonthReceived] = useState<number | null>(null);
  const [paymentsByMonth, setPaymentsByMonth] = useState<Map<string, number>>(new Map());

  const [detailId, setDetailId] = useState<string | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const load = useCallback(() => {
    setIsLoading(true);
    api
      .get<FinancingListResult>("/finance/loans?status=APPROVED,ACTIVE,COMPLETED&pageSize=100")
      .then((res) => setAllLoans(res.data))
      .catch(() => setAllLoans([]))
      .finally(() => setIsLoading(false));

    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    const yearStart = new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1));

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?type=FINANCING_PAYMENT&dateFrom=${isoDate(yearStart)}&pageSize=100`)
      .then((res) => {
        const byMonth = new Map<string, number>();
        let thisMonth = 0;
        let lastMonth = 0;
        for (const p of res.data) {
          const d = new Date(p.date);
          byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) ?? 0) + p.amount);
          if (d >= monthStart) thisMonth += p.amount;
          else if (d >= lastMonthStart && d <= lastMonthEnd) lastMonth += p.amount;
        }
        setPaymentsByMonth(byMonth);
        setThisMonthReceived(thisMonth);
        setLastMonthReceived(lastMonth);
      })
      .catch(() => {
        setPaymentsByMonth(new Map());
        setThisMonthReceived(null);
        setLastMonthReceived(null);
      });
  }, []);

  useEffect(load, [load]);

  const now = useMemo(() => new Date(), []);

  const rows: Row[] = useMemo(
    () =>
      allLoans.map((financing) => {
        const installment = financing.status === "COMPLETED" ? null : currentInstallment(financing);
        const status = financing.status === "COMPLETED" ? "PAID" : installmentStatus(installment, now);
        return { financing, installment, status };
      }),
    [allLoans, now]
  );

  const tabCounts = useMemo(() => {
    const c = { "": rows.length, UPCOMING: 0, OVERDUE: 0, COMPLETED: 0 } as Record<Tab, number>;
    for (const r of rows) {
      if (r.status === "OVERDUE") c.OVERDUE++;
      else if (r.status === "DUE_SOON" || r.status === "UPCOMING") c.UPCOMING++;
      else if (r.status === "PAID") c.COMPLETED++;
    }
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (tab === "UPCOMING") list = list.filter((r) => r.status === "UPCOMING" || r.status === "DUE_SOON");
    else if (tab === "OVERDUE") list = list.filter((r) => r.status === "OVERDUE");
    else if (tab === "COMPLETED") list = list.filter((r) => r.status === "PAID");

    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          customerDisplayName(r.financing.sale.customer).toLowerCase().includes(q) ||
          vehicleDisplayName(r.financing.sale.vehicle).toLowerCase().includes(q) ||
          r.financing.financingNumber.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (!a.installment && !b.installment) return 0;
      if (!a.installment) return 1;
      if (!b.installment) return -1;
      return a.installment.dueDate.getTime() - b.installment.dueDate.getTime();
    });
  }, [rows, tab, debouncedSearch]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const overdueRows = useMemo(() => rows.filter((r) => r.status === "OVERDUE"), [rows]);
  const overdueTotal = useMemo(() => overdueRows.reduce((sum, r) => sum + Number(r.financing.outstandingBalance), 0), [overdueRows]);

  const upcomingRows = useMemo(
    () => rows.filter((r) => r.status === "DUE_SOON" && r.installment).sort((a, b) => a.installment!.dueDate.getTime() - b.installment!.dueDate.getTime()),
    [rows]
  );
  const upcomingTotal = useMemo(
    () => rows.filter((r) => r.status === "UPCOMING" || r.status === "DUE_SOON").reduce((sum, r) => sum + (r.installment?.amount ?? 0), 0),
    [rows]
  );

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  const expectedThisMonth = useMemo(
    () => allLoans.reduce((sum, f) => sum + installmentsDueInRange(f, monthStart, now).reduce((s, i) => s + i.amount, 0), 0),
    [allLoans, monthStart, now]
  );
  const expectedLastMonth = useMemo(
    () => allLoans.reduce((sum, f) => sum + installmentsDueInRange(f, lastMonthStart, lastMonthEnd).reduce((s, i) => s + i.amount, 0), 0),
    [allLoans, lastMonthStart, lastMonthEnd]
  );

  const expectedByMonth = useMemo(() => {
    const byMonth = new Map<string, number>();
    const yearStart = new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1));
    for (const f of allLoans) {
      for (const installment of installmentsDueInRange(f, yearStart, now)) {
        const key = monthKey(installment.dueDate);
        byMonth.set(key, (byMonth.get(key) ?? 0) + installment.amount);
      }
    }
    return byMonth;
  }, [allLoans, monthStart, now]);

  const chartData = useMemo(() => {
    const keys = new Set([...paymentsByMonth.keys(), ...expectedByMonth.keys()]);
    return [...keys]
      .sort()
      .map((key) => ({
        month: monthLabel(key),
        received: Math.round(paymentsByMonth.get(key) ?? 0),
        expected: Math.round(expectedByMonth.get(key) ?? 0),
      }));
  }, [paymentsByMonth, expectedByMonth]);

  const statusBreakdown = useMemo(() => {
    const total = rows.length;
    const colors: Record<string, string> = { Paid: "#16a34a", Upcoming: "#d97706", Overdue: "#dc2626" };
    return [
      { key: "Paid", value: tabCounts.COMPLETED, color: colors.Paid },
      { key: "Upcoming", value: tabCounts.UPCOMING, color: colors.Upcoming },
      { key: "Overdue", value: tabCounts.OVERDUE, color: colors.Overdue },
    ]
      .filter((d) => d.value > 0)
      .map((d) => ({ ...d, percent: total > 0 ? Math.round((d.value / total) * 100) : 0 }));
  }, [tabCounts, rows.length]);

  function resetFilters() {
    setSearch("");
    setTab("");
  }

  function handlePaymentRecorded(message: string) {
    setShowRecordPayment(false);
    showToast(message);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <ReceiptIcon size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">Repayments</h1>
          <p className="text-sm text-muted">Track repayment schedules, monitor instalments, and manage overdue accounts.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Active Financing" value={String(allLoans.length)} sublabel="With a repayment schedule" icon={ReceiptIcon} />
        <KpiCard
          label="Total Instalments Expected"
          value={formatCurrencyCompact(expectedThisMonth)}
          sublabel={percentChange(expectedThisMonth, expectedLastMonth) ?? "This month"}
          icon={ReceiptIcon}
        />
        <KpiCard
          label="Instalments Received"
          value={formatCurrencyCompact(thisMonthReceived ?? 0)}
          sublabel={lastMonthReceived !== null ? percentChange(thisMonthReceived ?? 0, lastMonthReceived) : "This month"}
          icon={ReceiptIcon}
          tone="success"
        />
        <KpiCard label="Upcoming Instalments" value={formatCurrencyCompact(upcomingTotal)} sublabel="Not yet due" icon={Clock} tone="warning" />
        <KpiCard label="Overdue Amount" value={formatCurrencyCompact(overdueTotal)} sublabel="Past due date" icon={AlertTriangle} tone={overdueTotal > 0 ? "danger" : "default"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["", "UPCOMING", "OVERDUE", "COMPLETED"] as Tab[]).map((t) => (
              <button
                key={t || "ALL"}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {t === "" ? "All Repayments" : t === "UPCOMING" ? "Upcoming" : t === "OVERDUE" ? "Overdue" : "Completed"} ({tabCounts[t]})
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, vehicle, or application no…"
              className="w-72 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
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
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">
              Repayment Schedule ({filteredRows.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="sticky-actions w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Financing Ref.</th>
                    <th className="px-4 py-3 font-semibold">Instalment No.</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount Due</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted">
                        No repayments match these filters.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map(({ financing: f, installment, status }) => (
                      <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface">
                        <td className="px-4 py-3 text-ink">{customerDisplayName(f.sale.customer)}</td>
                        <td className="px-4 py-3 text-ink">{vehicleDisplayName(f.sale.vehicle)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-action">{f.financingNumber}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {installment ? `${installment.number} / ${f.termMonths}` : `${f.termMonths} / ${f.termMonths}`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">
                          {installment ? formatCurrency(installment.amount) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{installment ? formatDate(installment.dueDate.toISOString()) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${INSTALLMENT_STATUS_STYLES[status]}`}>
                            {INSTALLMENT_STATUS_LABELS[status]}
                          </span>
                          {status === "OVERDUE" && installment && (
                            <div className="mt-0.5 text-xs text-muted">{daysOverdue(installment.dueDate, now)} days</div>
                          )}
                          {status === "DUE_SOON" && installment && (
                            <div className="mt-0.5 text-xs text-muted">{daysUntil(installment.dueDate, now)} days</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setDetailId(f.id)} className="text-xs font-medium text-action hover:underline">
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                <span className="text-muted">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} repayments
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
                    Previous
                  </button>
                  <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Upcoming Repayments (Next 7 Days)">
              {upcomingRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Nothing due in the next 7 days.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {upcomingRows.slice(0, 5).map((r) => (
                    <li key={r.financing.id} onClick={() => setDetailId(r.financing.id)} className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{customerDisplayName(r.financing.sale.customer)}</div>
                        <div className="truncate text-xs text-muted">{formatDate(r.installment!.dueDate.toISOString())}</div>
                      </div>
                      <span className="shrink-0 font-medium text-ink">{formatCurrency(r.installment!.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Payment Trend">
              {chartData.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">No financing activity yet this year.</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart accessibilityLayer data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 12 }} />
                    <YAxis tick={{ fill: tickFill, fontSize: 12 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="received" name="Received" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expected" name="Expected" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Repayment Status Summary">
            {statusBreakdown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No financing on record yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={statusBreakdown} dataKey="value" nameKey="key" innerRadius={38} outerRadius={60} paddingAngle={2}>
                      {statusBreakdown.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                  {statusBreakdown.map((d) => (
                    <li key={d.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.key}
                      </span>
                      <span className="font-medium text-ink">
                        {d.value} ({d.percent}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          <SectionCard title="Overdue Repayments">
            {overdueRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No overdue repayments right now.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {overdueRows.slice(0, 5).map((r) => (
                  <li key={r.financing.id} onClick={() => setDetailId(r.financing.id)} className="flex cursor-pointer items-start gap-2 py-2.5 text-sm hover:bg-surface">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{customerDisplayName(r.financing.sale.customer)}</div>
                      <div className="truncate text-xs text-muted">
                        {r.installment ? `${daysOverdue(r.installment.dueDate, now)} days overdue` : "—"}
                      </div>
                    </div>
                    <span className="shrink-0 font-medium text-danger">{formatCurrency(r.financing.outstandingBalance)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Quick Actions">
            <button
              type="button"
              onClick={() => setShowRecordPayment(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary"
            >
              <Plus size={16} /> Record Payment
            </button>
          </SectionCard>
        </div>
      </div>

      {showRecordPayment && (
        <RecordPaymentModal onClose={() => setShowRecordPayment(false)} onRecorded={handlePaymentRecorded} initialType="FINANCING" />
      )}
      {detailId && <FinancingDetailModal financingId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
