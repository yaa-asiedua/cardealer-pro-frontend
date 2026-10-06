import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Layers,
  Receipt as ReceiptIcon,
  Wallet,
  XCircle,
} from "lucide-react";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { FinancingDetailModal } from "../../components/financing/FinancingDetailModal";
import { FinancingStatusBadge } from "../../components/financing/FinancingStatusBadge";
import { RecordPaymentModal } from "../../components/payments/RecordPaymentModal";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useChartTheme } from "../../lib/chart-theme";
import { api } from "../../lib/api-client";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../../lib/format";
import { paymentMethodLabel } from "../../lib/revenue-helpers";
import { customerDisplayName } from "../../types/customer";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { Financing, FinancingListResult, FinancingReport } from "../../types/financing";
import type { RevenueTransaction, RevenueTransactionListResult } from "../../types/revenue";
import type { FinanceDashboard as FinanceDashboardData } from "../../types/dashboard";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function monthKey(d: Date | string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

// Reconciled against finance_pages/dashboard.jpeg — first real page for
// this role, so nav-config.ts was also updated to match this mockup's
// sidebar. "Application Status" (Approved/Pending/Declined) and the
// Total Applications/Approved/Pending/Declined KPIs are all the same
// applicationDate-scoped cohort, bucketed by outcome — Approved covers
// anything that got past the approval gate (APPROVED/ACTIVE/COMPLETED/
// DEFAULTED), not just the current APPROVED status, so the three
// buckets stay mutually exclusive and sum to the total by construction.
// "Active Financing" is a separate, all-time snapshot (current ACTIVE
// loans), not scoped to the period, so it correctly isn't part of that
// same total. Two things the mockup shows aren't real and were changed:
// "Repayment Risk Alerts" (High Risk/Medium Risk scoring) is the paused
// AI "financing risk flag" feature — replaced with a real "Pending
// Applications" panel (oldest-waiting-first) instead of a fake risk
// score. The Monthly Payments chart's second "Outstanding" series isn't
// a real monthly figure (outstanding balance is a snapshot, not
// something that happened "in March") — replaced with "New Financing"
// (principal originated that month), a real flow metric paired
// meaningfully against Payments Received.
export function FinanceDashboard({ data }: { data: FinanceDashboardData }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { gridStroke, tickFill } = useChartTheme();

  const [allLoans, setAllLoans] = useState<Financing[]>([]);
  const [overdueLoans, setOverdueLoans] = useState<Financing[]>([]);
  const [overdueTotal, setOverdueTotal] = useState<number | null>(null);
  const [recentPayments, setRecentPayments] = useState<RevenueTransaction[]>([]);
  const [paymentsByMonth, setPaymentsByMonth] = useState<Map<string, number>>(new Map());
  const [thisMonthReceived, setThisMonthReceived] = useState<number | null>(null);
  const [lastMonthReceived, setLastMonthReceived] = useState<number | null>(null);
  const [thisMonthFinanced, setThisMonthFinanced] = useState<number | null>(null);
  const [lastMonthFinanced, setLastMonthFinanced] = useState<number | null>(null);

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [viewingFinancingId, setViewingFinancingId] = useState<string | null>(null);

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
      .then((res) => {
        setOverdueLoans(res.data.slice(0, 5));
        setOverdueTotal(res.data.reduce((sum, f) => sum + Number(f.outstandingBalance), 0));
      })
      .catch(() => {
        setOverdueLoans([]);
        setOverdueTotal(null);
      });

    api
      .get<RevenueTransactionListResult>(`/finance/receipts?type=FINANCING_PAYMENT&dateFrom=${isoDate(yearStart)}&pageSize=100`)
      .then((res) => {
        setRecentPayments(res.data.slice(0, 5));
        const byMonth = new Map<string, number>();
        let thisMonth = 0;
        let lastMonth = 0;
        for (const p of res.data) {
          const key = monthKey(p.date);
          byMonth.set(key, (byMonth.get(key) ?? 0) + p.amount);
          const d = new Date(p.date);
          if (d >= monthStart) thisMonth += p.amount;
          else if (d >= lastMonthStart && d <= lastMonthEnd) lastMonth += p.amount;
        }
        setPaymentsByMonth(byMonth);
        setThisMonthReceived(thisMonth);
        setLastMonthReceived(lastMonth);
      })
      .catch(() => {
        setRecentPayments([]);
        setPaymentsByMonth(new Map());
        setThisMonthReceived(null);
        setLastMonthReceived(null);
      });

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
  }, []);

  useEffect(load, [load]);

  const { start: monthStart } = monthBounds(0);
  const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);

  const cohort = useMemo(() => {
    const bucket = (from: Date, to: Date) => {
      const rows = allLoans.filter((f) => {
        const d = new Date(f.applicationDate);
        return d >= from && d <= to;
      });
      const approved = rows.filter((f) => f.status !== "PENDING" && f.status !== "REJECTED").length;
      const pending = rows.filter((f) => f.status === "PENDING").length;
      const declined = rows.filter((f) => f.status === "REJECTED").length;
      return { total: rows.length, approved, pending, declined };
    };
    return { thisMonth: bucket(monthStart, new Date()), lastMonth: bucket(lastMonthStart, lastMonthEnd) };
  }, [allLoans, monthStart, lastMonthStart, lastMonthEnd]);

  const activeFinancing = useMemo(() => allLoans.filter((f) => f.status === "ACTIVE").length, [allLoans]);

  const pendingOldest = useMemo(
    () =>
      allLoans
        .filter((f) => f.status === "PENDING")
        .sort((a, b) => a.applicationDate.localeCompare(b.applicationDate))
        .slice(0, 5),
    [allLoans]
  );

  const recentApplications = useMemo(() => allLoans.slice(0, 5), [allLoans]);

  const financedByMonth = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const f of allLoans) {
      const key = monthKey(f.applicationDate);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(f.principalAmount));
    }
    return byMonth;
  }, [allLoans]);

  const chartData = useMemo(() => {
    const keys = new Set([...paymentsByMonth.keys(), ...financedByMonth.keys()]);
    return [...keys]
      .sort()
      .map((key) => ({
        month: monthLabel(key),
        received: Math.round(paymentsByMonth.get(key) ?? 0),
        financed: Math.round(financedByMonth.get(key) ?? 0),
      }));
  }, [paymentsByMonth, financedByMonth]);

  const statusBreakdown = useMemo(() => {
    const c = cohort.thisMonth;
    return [
      { key: "Approved", value: c.approved, color: STATUS_COLORS.Approved },
      { key: "Pending", value: c.pending, color: STATUS_COLORS.Pending },
      { key: "Declined", value: c.declined, color: STATUS_COLORS.Declined },
    ].filter((d) => d.value > 0);
  }, [cohort]);

  function handlePaymentRecorded(message: string) {
    setShowRecordPayment(false);
    showToast(message);
    load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Welcome back, {user?.fullName?.split(" ")[0] ?? "there"}!</h1>
        <p className="text-sm text-muted">Overview of financing, payments, and financial performance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Total Applications"
          value={String(cohort.thisMonth.total)}
          sublabel={percentChange(cohort.thisMonth.total, cohort.lastMonth.total) ?? "This month"}
          icon={FileText}
        />
        <KpiCard
          label="Approved"
          value={String(cohort.thisMonth.approved)}
          sublabel={percentChange(cohort.thisMonth.approved, cohort.lastMonth.approved) ?? "This month"}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="Pending"
          value={String(cohort.thisMonth.pending)}
          sublabel={percentChange(cohort.thisMonth.pending, cohort.lastMonth.pending) ?? "This month"}
          icon={Clock}
          tone={cohort.thisMonth.pending > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Declined"
          value={String(cohort.thisMonth.declined)}
          sublabel={percentChange(cohort.thisMonth.declined, cohort.lastMonth.declined) ?? "This month"}
          icon={XCircle}
          tone="danger"
        />
        <KpiCard label="Active Financing" value={String(activeFinancing)} sublabel="Currently active" icon={Layers} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Financed Amount"
          value={formatCurrencyCompact(thisMonthFinanced ?? 0)}
          sublabel={lastMonthFinanced !== null ? percentChange(thisMonthFinanced ?? 0, lastMonthFinanced) : "This month"}
          icon={Wallet}
        />
        <KpiCard
          label="Payments Received"
          value={formatCurrencyCompact(thisMonthReceived ?? 0)}
          sublabel={lastMonthReceived !== null ? percentChange(thisMonthReceived ?? 0, lastMonthReceived) : "This month"}
          icon={CreditCard}
          tone="success"
        />
        <KpiCard label="Outstanding Balance" value={formatCurrencyCompact(data.outstandingLoans)} sublabel="Across active loans" icon={Banknote} />
        <KpiCard
          label="Overdue Repayments"
          value={formatCurrencyCompact(overdueTotal ?? 0)}
          sublabel="Past due date"
          icon={AlertTriangle}
          tone={overdueTotal && overdueTotal > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <SectionCard title="Monthly Payments">
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No financing activity yet this year.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart accessibilityLayer data={chartData}>
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

        <SectionCard title="Application Status">
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No applications yet this month.</p>
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
                      {d.value} ({Math.round((d.value / cohort.thisMonth.total) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard title="Pending Applications">
          {pendingOldest.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nothing awaiting review.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {pendingOldest.map((f) => (
                <li
                  key={f.id}
                  onClick={() => setViewingFinancingId(f.id)}
                  className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{customerDisplayName(f.sale.customer)}</div>
                    <div className="truncate text-xs text-muted">{vehicleDisplayName(f.sale.vehicle)}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDate(f.applicationDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Recent Financing Applications">
          {recentApplications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No applications yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recentApplications.map((f) => (
                <li
                  key={f.id}
                  onClick={() => setViewingFinancingId(f.id)}
                  className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{customerDisplayName(f.sale.customer)}</div>
                    <div className="truncate text-xs text-muted">{vehicleDisplayName(f.sale.vehicle)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium text-ink">{formatCurrency(f.principalAmount)}</div>
                    <FinancingStatusBadge status={f.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => navigate("/financing")} className="mt-3 block text-sm font-medium text-action hover:underline">
            View all →
          </button>
        </SectionCard>

        <SectionCard title="Recent Payments">
          {recentPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No payments recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{p.customerName ?? "—"}</div>
                    <div className="truncate text-xs text-muted">
                      {p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : "—"} · {formatDate(p.date)}
                    </div>
                  </div>
                  <span className="shrink-0 font-medium text-ink">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => navigate("/payments-receipts")}
            className="mt-3 block text-sm font-medium text-action hover:underline"
          >
            View all →
          </button>
        </SectionCard>

        <SectionCard title="Overdue Repayments">
          {overdueLoans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No overdue repayments right now.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {overdueLoans.map((f) => (
                <li
                  key={f.id}
                  onClick={() => setViewingFinancingId(f.id)}
                  className="flex cursor-pointer items-start gap-2 py-2.5 text-sm hover:bg-surface"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{customerDisplayName(f.sale.customer)}</div>
                    <div className="truncate text-xs text-muted">{vehicleDisplayName(f.sale.vehicle)}</div>
                  </div>
                  <span className="shrink-0 font-medium text-danger">{formatCurrency(f.outstandingBalance)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => navigate("/repayments")} className="mt-3 block text-sm font-medium text-action hover:underline">
            View all →
          </button>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setShowRecordPayment(true)}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <CreditCard size={18} className="text-action" />
              Record Payment
            </button>
            <button
              type="button"
              onClick={() => navigate("/financing")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Clock size={18} className="text-action" />
              Review Applications
            </button>
            <button
              type="button"
              onClick={() => navigate("/repayments")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Banknote size={18} className="text-action" />
              Repayment Schedule
            </button>
            <button
              type="button"
              onClick={() => navigate("/payments-receipts")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <ReceiptIcon size={18} className="text-action" />
              View Receipts
            </button>
          </div>
        </SectionCard>
      </div>

      {showRecordPayment && (
        <RecordPaymentModal onClose={() => setShowRecordPayment(false)} onRecorded={handlePaymentRecorded} initialType="FINANCING" />
      )}
      {viewingFinancingId && <FinancingDetailModal financingId={viewingFinancingId} onClose={() => setViewingFinancingId(null)} />}
    </div>
  );
}
