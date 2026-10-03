import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Download, FileText, RotateCcw, Wallet } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { useChartTheme } from "../lib/chart-theme";
import { api } from "../lib/api-client";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { METHOD_COLORS, TRANSACTION_TYPE_LABELS, paymentMethodLabel } from "../lib/revenue-helpers";
import type { Financing, FinancingListResult, FinancingReport } from "../types/financing";
import type { RevenueTransaction, RevenueTransactionListResult } from "../types/revenue";

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

const STATUS_COLORS = { Approved: "#16a34a", Pending: "#d97706", Declined: "#dc2626" };
const METHOD_PIE_COLORS = ["#2F6FE4", "#16a34a", "#f59e0b", "#a855f7", "#94a3b8"];

const REPORT_SECTIONS: { id: string; label: string; hint: string }[] = [
  { id: "financing-summary", label: "Financing Summary Report", hint: "Total applications, approvals, and amounts" },
  { id: "payments-report", label: "Payments Report", hint: "All payments received and methods" },
  { id: "outstanding-balance", label: "Outstanding Balance Report", hint: "Outstanding amounts by customer" },
  { id: "overdue-repayments", label: "Overdue Repayments Report", hint: "Overdue accounts and aging analysis" },
  { id: "payments-report", label: "Customer Payment History", hint: "Detailed customer payment records (below)" },
  { id: "vehicle-financing-performance", label: "Vehicle Financing Performance", hint: "Performance by vehicle make and model" },
  { id: "monthly-financing-trends", label: "Monthly Financial Report", hint: "Monthly financing summary" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Reconciled against finance_pages/reports.jpeg. Reuses the exact same
// KPI/donut computations already built for the Dashboard and Financing
// pages (same definitions, same reasoning) rather than inventing a
// fourth version of "Total Financed Amount" etc. One deliberate
// difference: "Total Payments Received" here is blended across all 4
// transaction types (Sale/Rental/Financing/Service), matching this
// page's own charts/table below it — the Dashboard/Financing pages keep
// it Financing-only. Both are real, just scoped differently for their
// own page's context (same kind of flagged divergence as Repayments'
// overdue definition).
//
// Dropped, not real:
// - "Overdue Repayments Trend" (a bar chart implying overdue amounts
//   *historically*, month by month) — overdue is a snapshot (computed
//   from today's date), there's no stored history of what was overdue
//   in March. Replaced with a real "Top Overdue Accounts" list instead
//   of fabricating a trend.
// - "Scheduled Reports" (automated monthly/weekly report emails) — needs
//   both a job scheduler and an email provider, neither of which exist
//   anywhere in this codebase (same gap already documented for the
//   password-reset email flow).
// - The "Report Type"/"Financing Type"/"Payment Status" filter dropdowns
//   — none map to a real, useful distinction beyond what's already
//   better expressed elsewhere (there's only one financing product in
//   this schema, and a Receipt's status is always "Paid"). Kept Search
//   only. The 7 "Report Types" sidebar cards are real — they scroll to
//   the matching section below rather than opening 7 unbuilt pages.
// "Generate Report" exports the detailed table as CSV (real, client-side
// — no PDF/report-generation service exists, same "no fake affordances"
// treatment lib/csv.ts already documents for Payments & Revenue).
export function FinanceReportsPage() {
  const { gridStroke, tickFill } = useChartTheme();

  const [allLoans, setAllLoans] = useState<Financing[]>([]);
  const [overdueLoans, setOverdueLoans] = useState<Financing[]>([]);
  const [financeReport, setFinanceReport] = useState<FinancingReport | null>(null);
  const [thisMonthFinanced, setThisMonthFinanced] = useState<number | null>(null);
  const [lastMonthFinanced, setLastMonthFinanced] = useState<number | null>(null);
  const [thisMonthReceipts, setThisMonthReceipts] = useState<RevenueTransaction[] | null>(null);
  const [lastMonthReceipts, setLastMonthReceipts] = useState<RevenueTransaction[] | null>(null);
  const [receiptsThisYear, setReceiptsThisYear] = useState<RevenueTransaction[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tableResult, setTableResult] = useState<RevenueTransactionListResult | null>(null);
  const [isLoadingTable, setIsLoadingTable] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch]);

  useEffect(() => {
    setIsLoadingTable(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    api
      .get<RevenueTransactionListResult>(`/finance/receipts?${params.toString()}`)
      .then(setTableResult)
      .catch(() => setTableResult(null))
      .finally(() => setIsLoadingTable(false));
  }, [page, debouncedSearch]);

  const load = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    const yearStart = new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1));

    api
      .get<FinancingListResult>("/finance/loans?pageSize=100")
      .then((res) => setAllLoans(res.data))
      .catch(() => setAllLoans([]));

    api
      .get<FinancingListResult>("/finance/loans?overdue=true&pageSize=100")
      .then((res) => setOverdueLoans(res.data))
      .catch(() => setOverdueLoans([]));

    api
      .get<{ report: FinancingReport }>("/reports/finance")
      .then((res) => setFinanceReport(res.report))
      .catch(() => setFinanceReport(null));

    Promise.all([
      api.get<{ report: FinancingReport }>(`/reports/finance?dateFrom=${isoDate(monthStart)}`),
      api.get<{ report: FinancingReport }>(`/reports/finance?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}`),
    ])
      .then(([thisMonth, lastMonth]) => {
        setThisMonthFinanced(thisMonth.report.totalPrincipal);
        setLastMonthFinanced(lastMonth.report.totalPrincipal);
      })
      .catch(() => {
        setThisMonthFinanced(null);
        setLastMonthFinanced(null);
      });

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?dateFrom=${isoDate(monthStart)}&pageSize=100`)
      .then((res) => setThisMonthReceipts(res.data))
      .catch(() => setThisMonthReceipts(null));

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`)
      .then((res) => setLastMonthReceipts(res.data))
      .catch(() => setLastMonthReceipts(null));

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?dateFrom=${isoDate(yearStart)}&pageSize=100`)
      .then((res) => setReceiptsThisYear(res.data))
      .catch(() => setReceiptsThisYear([]));
  }, []);

  useEffect(load, [load]);

  const thisMonthReceived = useMemo(() => (thisMonthReceipts ? thisMonthReceipts.reduce((s, r) => s + r.amount, 0) : null), [thisMonthReceipts]);
  const lastMonthReceived = useMemo(() => (lastMonthReceipts ? lastMonthReceipts.reduce((s, r) => s + r.amount, 0) : null), [lastMonthReceipts]);
  const overdueTotal = useMemo(() => overdueLoans.reduce((s, f) => s + Number(f.outstandingBalance), 0), [overdueLoans]);

  const decidedLoans = useMemo(() => allLoans.filter((f) => f.status !== "PENDING" && f.status !== "REJECTED"), [allLoans]);

  const cohort = useMemo(() => {
    const { start: monthStart } = monthBounds(0);
    const thisMonth = allLoans.filter((f) => new Date(f.applicationDate) >= monthStart);
    const approved = thisMonth.filter((f) => f.status !== "PENDING" && f.status !== "REJECTED").length;
    const pending = thisMonth.filter((f) => f.status === "PENDING").length;
    const declined = thisMonth.filter((f) => f.status === "REJECTED").length;
    return { total: thisMonth.length, approved, pending, declined };
  }, [allLoans]);

  const statusBreakdown = useMemo(
    () =>
      [
        { key: "Approved", value: cohort.approved, color: STATUS_COLORS.Approved },
        { key: "Pending", value: cohort.pending, color: STATUS_COLORS.Pending },
        { key: "Declined", value: cohort.declined, color: STATUS_COLORS.Declined },
      ].filter((d) => d.value > 0),
    [cohort]
  );

  const paymentsVsFinancedChart = useMemo(() => {
    const received = new Map<string, number>();
    for (const r of receiptsThisYear) {
      const key = monthKey(new Date(r.date));
      received.set(key, (received.get(key) ?? 0) + r.amount);
    }
    const financed = new Map<string, number>();
    const { start: monthStart } = monthBounds(0);
    const yearStart = new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1));
    for (const f of allLoans) {
      const d = new Date(f.applicationDate);
      if (d < yearStart) continue;
      const key = monthKey(d);
      financed.set(key, (financed.get(key) ?? 0) + Number(f.principalAmount));
    }
    const keys = new Set([...received.keys(), ...financed.keys()]);
    return [...keys].sort().map((key) => ({
      month: monthLabel(key),
      received: Math.round(received.get(key) ?? 0),
      financed: Math.round(financed.get(key) ?? 0),
    }));
  }, [receiptsThisYear, allLoans]);

  const applicationsTrendChart = useMemo(() => {
    const applied = new Map<string, number>();
    const approved = new Map<string, number>();
    const { start: monthStart } = monthBounds(0);
    const yearStart = new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1));
    for (const f of allLoans) {
      const appliedDate = new Date(f.applicationDate);
      if (appliedDate >= yearStart) {
        const key = monthKey(appliedDate);
        applied.set(key, (applied.get(key) ?? 0) + 1);
      }
      if (f.decisionDate && f.status !== "REJECTED") {
        const decidedDate = new Date(f.decisionDate);
        if (decidedDate >= yearStart) {
          const key = monthKey(decidedDate);
          approved.set(key, (approved.get(key) ?? 0) + 1);
        }
      }
    }
    const keys = new Set([...applied.keys(), ...approved.keys()]);
    return [...keys].sort().map((key) => ({
      month: monthLabel(key),
      applications: applied.get(key) ?? 0,
      approved: approved.get(key) ?? 0,
    }));
  }, [allLoans]);

  const methodBreakdown = useMemo(() => {
    if (!thisMonthReceipts) return [];
    const totals = new Map<string, number>();
    for (const r of thisMonthReceipts) {
      const key = r.paymentMethod ?? "UNSPECIFIED";
      totals.set(key, (totals.get(key) ?? 0) + r.amount);
    }
    const grandTotal = [...totals.values()].reduce((s, v) => s + v, 0);
    return [...totals.entries()]
      .map(([method, amount]) => ({ method, amount, percent: grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [thisMonthReceipts]);

  const topVehicles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of decidedLoans) {
      const key = `${f.sale.vehicle.make} ${f.sale.vehicle.model}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([vehicle, count]) => ({ vehicle, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [decidedLoans]);

  const topOverdueAccounts = useMemo(
    () => [...overdueLoans].sort((a, b) => Number(b.outstandingBalance) - Number(a.outstandingBalance)).slice(0, 5),
    [overdueLoans]
  );

  function handleGenerateReport() {
    if (!tableResult || tableResult.data.length === 0) return;
    const headers = ["Date", "Customer", "Vehicle", "Transaction Type", "Amount (GHS)", "Payment Method", "Status"];
    const rows = tableResult.data.map((r) => [
      formatDate(r.date),
      r.customerName ?? "",
      r.vehicle ?? "",
      TRANSACTION_TYPE_LABELS[r.type],
      r.amount,
      r.paymentMethod ? paymentMethodLabel(r.paymentMethod) : "",
      "Paid",
    ]);
    downloadCsv(`financial-report-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Reports</h1>
            <p className="text-sm text-muted">View financial reports and insights.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGenerateReport}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Download size={14} /> Generate Report
        </button>
      </div>

      <div id="financing-summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Financed Amount"
          value={formatCurrencyCompact(thisMonthFinanced ?? 0)}
          sublabel={lastMonthFinanced !== null ? percentChange(thisMonthFinanced ?? 0, lastMonthFinanced) : "This month"}
          icon={Wallet}
        />
        <KpiCard
          label="Total Payments Received"
          value={formatCurrencyCompact(thisMonthReceived ?? 0)}
          sublabel={lastMonthReceived !== null ? percentChange(thisMonthReceived ?? 0, lastMonthReceived) : "This month"}
          icon={Wallet}
          tone="success"
        />
        <div id="outstanding-balance">
          <KpiCard
            label="Outstanding Balance"
            value={formatCurrencyCompact(financeReport?.outstandingLoans ?? 0)}
            sublabel="All active loans"
            icon={FileText}
          />
        </div>
        <div id="overdue-repayments">
          <KpiCard
            label="Overdue Amount"
            value={formatCurrencyCompact(overdueTotal)}
            sublabel="Past due date"
            icon={AlertTriangle}
            tone={overdueTotal > 0 ? "danger" : "default"}
          />
        </div>
      </div>

      <div className="mb-4 mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, vehicle, or reference…"
          className="w-72 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
        />
        <button
          type="button"
          onClick={() => setSearch("")}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Payments Received vs New Financing">
            {paymentsVsFinancedChart.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No financial activity yet this year.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={paymentsVsFinancedChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 12 }} />
                  <YAxis tick={{ fill: tickFill, fontSize: 12 }} tickFormatter={(v) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="received" name="Payments Received" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="financed" name="New Financing" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Financing Applications by Status">
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No applications yet this month.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="key" innerRadius={40} outerRadius={65} paddingAngle={2}>
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
                      {d.value} ({Math.round((d.value / cohort.total) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div id="monthly-financing-trends">
          <SectionCard title="Monthly Financing Trends">
            {applicationsTrendChart.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No applications yet this year.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={applicationsTrendChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 12 }} />
                  <YAxis tick={{ fill: tickFill, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="applications" name="New Applications" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="approved" name="Approved" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Top Overdue Accounts">
          {topOverdueAccounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No overdue accounts right now.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {topOverdueAccounts.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">
                      {f.sale.customer.firstName} {f.sale.customer.lastName}
                    </div>
                    <div className="truncate text-xs text-muted">{f.financingNumber}</div>
                  </div>
                  <span className="shrink-0 font-medium text-danger">{formatCurrency(f.outstandingBalance)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div id="vehicle-financing-performance">
          <SectionCard title="Top Performing Vehicles (Financing)">
            {topVehicles.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No financed vehicles yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {topVehicles.map((v) => (
                  <li key={v.vehicle} className="flex items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 truncate text-ink">{v.vehicle}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-2 rounded-full bg-action"
                        style={{ width: `${Math.round((v.count / topVehicles[0].count) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs text-muted">{v.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div id="payments-report" className="lg:col-span-2">
          <SectionCard title="Detailed Financial Report">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold">Customer</th>
                    <th className="pb-2 font-semibold">Vehicle</th>
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 text-right font-semibold">Amount</th>
                    <th className="pb-2 font-semibold">Method</th>
                    <th className="pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingTable ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : !tableResult || tableResult.data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-muted">
                        No records match this search.
                      </td>
                    </tr>
                  ) : (
                    tableResult.data.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="py-2 text-xs text-muted">{formatDate(r.date)}</td>
                        <td className="py-2 text-ink">{r.customerName ?? "—"}</td>
                        <td className="py-2 text-ink">{r.vehicle ?? "—"}</td>
                        <td className="py-2 text-xs text-muted">{TRANSACTION_TYPE_LABELS[r.type]}</td>
                        <td className="py-2 text-right tabular-nums text-ink">{formatCurrency(r.amount)}</td>
                        <td className="py-2 text-xs text-muted">{r.paymentMethod ? paymentMethodLabel(r.paymentMethod) : "—"}</td>
                        <td className="py-2">
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

            {tableResult && tableResult.meta.pageCount > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">
                  Showing {(tableResult.meta.page - 1) * tableResult.meta.pageSize + 1}–
                  {Math.min(tableResult.meta.page * tableResult.meta.pageSize, tableResult.meta.total)} of {tableResult.meta.total} records
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= tableResult.meta.pageCount}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Revenue by Payment Method">
            {methodBreakdown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No payments recorded this month.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={methodBreakdown} dataKey="amount" nameKey="method" innerRadius={0} outerRadius={65}>
                      {methodBreakdown.map((d, i) => (
                        <Cell key={d.method} fill={METHOD_COLORS[d.method] ?? METHOD_PIE_COLORS[i % METHOD_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                  {methodBreakdown.map((d) => (
                    <li key={d.method} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METHOD_COLORS[d.method] ?? METHOD_COLORS.UNSPECIFIED }} />
                        {paymentMethodLabel(d.method)}
                      </span>
                      <span className="font-medium text-ink">{d.percent}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          <SectionCard title="Report Types">
            <ul className="flex flex-col gap-1">
              {REPORT_SECTIONS.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-surface"
                  >
                    <div className="text-sm font-medium text-ink">{s.label}</div>
                    <div className="text-xs text-muted">{s.hint}</div>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
