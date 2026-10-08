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
import { AlertTriangle, Banknote, Download, FileText, Lightbulb, Receipt, TrendingUp, Wallet, Wrench } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { RecordPaymentModal } from "../components/payments/RecordPaymentModal";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import {
  CATEGORY_COLORS,
  METHOD_COLORS,
  paymentMethodLabel,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "../lib/revenue-helpers";
import type { RevenueOverview, RevenueTransactionListResult } from "../types/revenue";
import { useAutoRefresh } from "../lib/use-auto-refresh";

type Period = "month" | "quarter" | "year";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periodRange(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = isoDate(now);
  if (period === "month") return { dateFrom: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo };
  if (period === "quarter") return { dateFrom: isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), dateTo };
  return { dateFrom: isoDate(new Date(now.getFullYear(), 0, 1)), dateTo };
}

export function PaymentsRevenuePage() {
  const { showToast } = useToast();
  const { gridStroke, tickFill, tickFillStrong } = useChartTheme();
  const [period, setPeriod] = useState<Period>("month");
  const [overview, setOverview] = useState<RevenueOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);

  const [expanded, setExpanded] = useState(false);
  const [txType, setTxType] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [transactions, setTransactions] = useState<RevenueTransactionListResult | null>(null);
  const [isLoadingTx, setIsLoadingTx] = useState(true);

  const [showRecordPayment, setShowRecordPayment] = useState(false);

  const loadOverview = useCallback(() => {
    setIsLoadingOverview(true);
    const { dateFrom, dateTo } = periodRange(period);
    api
      .get<{ report: RevenueOverview }>(`/reports/revenue?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((res) => setOverview(res.report))
      .catch(() => setOverview(null))
      .finally(() => setIsLoadingOverview(false));
  }, [period]);

  useEffect(loadOverview, [loadOverview]);

  useAutoRefresh(loadOverview);

  useEffect(() => {
    setTxPage(1);
  }, [txType, expanded]);

  const loadTransactions = useCallback(() => {
    setIsLoadingTx(true);
    const params = new URLSearchParams({ page: String(expanded ? txPage : 1), pageSize: expanded ? "10" : "5" });
    if (expanded && txType) params.set("type", txType);
    api
      .get<RevenueTransactionListResult>(`/finance/receipts?${params.toString()}`)
      .then(setTransactions)
      .catch(() => setTransactions(null))
      .finally(() => setIsLoadingTx(false));
  }, [expanded, txType, txPage]);

  useEffect(loadTransactions, [loadTransactions]);

  useAutoRefresh(loadTransactions);

  function handleRecorded(message: string) {
    showToast(message);
    loadOverview();
    loadTransactions();
  }

  function pctSublabel(category: string): string | undefined {
    const entry = overview?.byCategory.find((c) => c.category === category);
    return entry ? `${entry.percent}% of total` : undefined;
  }

  const momSublabel = useMemo(() => {
    if (overview?.totalMomPercent == null) return undefined;
    return `${overview.totalMomPercent >= 0 ? "↑" : "↓"} ${Math.abs(overview.totalMomPercent)}% from last period`;
  }, [overview]);

  // A concrete, computed nudge rather than a generic banner — leads with
  // the overdue figure when one exists (the most actionable fact), falls
  // back to whichever category actually led revenue this period.
  const insight = useMemo(() => {
    if (!overview) return null;
    if (overview.overdueAmount > 0) {
      return `${formatCurrency(overview.overdueAmount)} in loan payments is currently overdue. Consider following up with the affected customers.`;
    }
    const top = overview.byCategory[0];
    if (!top || top.amount <= 0) return null;
    return `${top.category} led revenue this period at ${top.percent}% of the total (${formatCurrency(top.amount)}).`;
  }, [overview]);

  function handleGenerateReport() {
    if (!overview) return;
    const headers = ["Metric", "Value"];
    const rows = [
      ["Period", `${overview.period.dateFrom.slice(0, 10)} to ${overview.period.dateTo.slice(0, 10)}`],
      ["Total Revenue", overview.totals.total],
      ["Sales Revenue", overview.totals.sales],
      ["Rental Revenue", overview.totals.rentals],
      ["Service Revenue", overview.totals.service],
      ["Financing Collections", overview.totals.financing],
      ["Outstanding Balance", overview.outstandingBalance],
      ["Overdue Amount", overview.overdueAmount],
    ];
    downloadCsv(`revenue-report-${overview.period.dateFrom.slice(0, 10)}.csv`, headers, rows);
    showToast("Revenue report downloaded");
  }

  function handleExportTransactions() {
    if (!transactions || transactions.data.length === 0) {
      showToast("No transactions to export", "error");
      return;
    }
    const headers = ["Receipt #", "Type", "Customer", "Description", "Amount", "Method", "Date", "Status"];
    const rows = transactions.data.map((t) => [
      t.receiptNumber,
      TRANSACTION_TYPE_LABELS[t.type],
      t.customerName ?? "",
      t.description ?? "",
      t.amount,
      paymentMethodLabel(t.paymentMethod),
      formatDate(t.date),
      TRANSACTION_STATUS_LABELS[t.status],
    ]);
    downloadCsv(`transactions-${isoDate(new Date())}.csv`, headers, rows);
    showToast("Transactions exported");
  }

  const hasSeriesData = overview?.series.some((s) => s.sales + s.rentals + s.service + s.financing > 0) ?? false;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total Revenue"
          value={overview ? formatCurrencyCompact(overview.totals.total) : "—"}
          sublabel={momSublabel}
          icon={TrendingUp}
        />
        <KpiCard
          label="Sales Revenue"
          value={overview ? formatCurrencyCompact(overview.totals.sales) : "—"}
          sublabel={pctSublabel("Sales")}
          icon={Banknote}
        />
        <KpiCard
          label="Rental Revenue"
          value={overview ? formatCurrencyCompact(overview.totals.rentals) : "—"}
          sublabel={pctSublabel("Rentals")}
          icon={Wallet}
        />
        <KpiCard
          label="Service Revenue"
          value={overview ? formatCurrencyCompact(overview.totals.service) : "—"}
          sublabel={pctSublabel("Service")}
          icon={Wrench}
        />
        <KpiCard
          label="Outstanding Balance"
          value={overview ? formatCurrencyCompact(overview.outstandingBalance) : "—"}
          icon={FileText}
          tone="warning"
        />
        <KpiCard
          label="Overdue Amount"
          value={overview ? formatCurrencyCompact(overview.overdueAmount) : "—"}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Revenue Overview">
            <div className="mb-3 flex justify-end">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
              >
                <option value="month">This Month</option>
                <option value="quarter">Last 3 Months</option>
                <option value="year">This Year</option>
              </select>
            </div>
            {isLoadingOverview ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted">Loading…</div>
            ) : !overview || !hasSeriesData ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted">No revenue recorded in this period yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart accessibilityLayer data={overview.series} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(d: string) => formatDate(d)} />
                  <YAxis tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(d) => formatDate(d as string)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="sales" name="Sales" stroke={CATEGORY_COLORS.Sales} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="rentals" name="Rentals" stroke={CATEGORY_COLORS.Rentals} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="service" name="Service" stroke={CATEGORY_COLORS.Service} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="financing" name="Financing" stroke={CATEGORY_COLORS.Financing} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Revenue by Business Area">
          {!overview || overview.totals.total <= 0 ? (
            <p className="py-10 text-center text-sm text-muted">No revenue recorded in this period yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={overview.byCategory} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {overview.byCategory.map((c) => (
                      <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 text-center text-sm font-semibold text-ink">{formatCurrencyCompact(overview.totals.total)}</div>
              <p className="text-center text-xs text-muted">Total Revenue</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {overview.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] }} />
                      {c.category}
                    </span>
                    <span className="text-muted">
                      {c.percent}% · {formatCurrencyCompact(c.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Recent Transactions">
            {expanded && (
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
                >
                  <option value="">All Types</option>
                  <option value="SALE">Sale</option>
                  <option value="RENTAL">Rental</option>
                  <option value="FINANCING_PAYMENT">Loan Payment</option>
                  <option value="SERVICE">Service</option>
                </select>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-2 py-2 font-semibold">ID</th>
                    <th className="px-2 py-2 font-semibold">Customer</th>
                    <th className="px-2 py-2 font-semibold">Type</th>
                    <th className="px-2 py-2 text-right font-semibold">Amount</th>
                    <th className="px-2 py-2 font-semibold">Method</th>
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingTx ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-8 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : !transactions || transactions.data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-8 text-center text-muted">
                        No transactions yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.data.map((t) => (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface">
                        <td className="px-2 py-2 font-mono text-xs text-ink">{t.receiptNumber}</td>
                        <td className="px-2 py-2 text-ink">{t.customerName ?? t.description ?? "—"}</td>
                        <td className="px-2 py-2 text-xs text-muted">{TRANSACTION_TYPE_LABELS[t.type]}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink">{formatCurrency(t.amount)}</td>
                        <td className="px-2 py-2 text-xs text-muted">{paymentMethodLabel(t.paymentMethod)}</td>
                        <td className="px-2 py-2 text-xs text-muted">{formatDate(t.date)}</td>
                        <td className="px-2 py-2">
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            {TRANSACTION_STATUS_LABELS[t.status]}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {expanded && transactions && transactions.meta.pageCount > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">
                  Page {transactions.meta.page} of {transactions.meta.pageCount}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={txPage <= 1}
                    onClick={() => setTxPage((p) => p - 1)}
                    className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={txPage >= transactions.meta.pageCount}
                    onClick={() => setTxPage((p) => p + 1)}
                    className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Quick Actions">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowRecordPayment(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface"
            >
              <Wallet size={16} className="text-action" /> Record Payment
            </button>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface"
            >
              <Receipt size={16} className="text-action" /> {expanded ? "Collapse Receipts" : "View Receipts"}
            </button>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={!overview}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
            >
              <FileText size={16} className="text-action" /> Generate Revenue Report
            </button>
            <button
              type="button"
              onClick={handleExportTransactions}
              disabled={!transactions?.data.length}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
            >
              <Download size={16} className="text-action" /> Export Transactions
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Top Revenue Sources">
          {!overview || overview.totals.total <= 0 ? (
            <p className="py-10 text-center text-sm text-muted">No revenue recorded in this period yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart accessibilityLayer data={overview.byCategory} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: tickFillStrong }} width={70} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {overview.byCategory.map((c) => (
                    <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Payment Methods">
          {!overview || overview.byMethod.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No payment-method data for this period yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={overview.byMethod} dataKey="amount" nameKey="method" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {overview.byMethod.map((m) => (
                      <Cell key={m.method} fill={METHOD_COLORS[m.method] ?? "#94A3B8"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-3 flex flex-col gap-1.5">
                {overview.byMethod.map((m) => (
                  <li key={m.method} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: METHOD_COLORS[m.method] ?? "#94A3B8" }} />
                      {paymentMethodLabel(m.method)}
                    </span>
                    <span className="text-muted">
                      {m.percent}% · {formatCurrencyCompact(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      {insight && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-action/20 bg-action/5 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action/10 text-action">
            <Lightbulb size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Revenue Insight</p>
            <p className="mt-1 text-sm text-muted">{insight}</p>
          </div>
        </div>
      )}

      {showRecordPayment && <RecordPaymentModal onClose={() => setShowRecordPayment(false)} onRecorded={handleRecorded} />}
    </div>
  );
}
