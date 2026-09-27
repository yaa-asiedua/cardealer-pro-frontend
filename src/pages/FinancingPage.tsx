import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FinancingDetailModal } from "../components/financing/FinancingDetailModal";
import { FinancingStatusBadge } from "../components/financing/FinancingStatusBadge";
import { RecordPaymentModal } from "../components/payments/RecordPaymentModal";
import type { FinancingTarget } from "../components/payments/RecordPaymentModal";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { paymentMethodLabel, TRANSACTION_TYPE_LABELS } from "../lib/revenue-helpers";
import { customerDisplayName } from "../types/customer";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { paidSoFar } from "../types/financing";
import type { Financing, FinancingListResult, FinancingReport } from "../types/financing";
import type { RevenueOverview, RevenueTransactionListResult } from "../types/revenue";

type Tab = "applications" | "active" | "payments" | "overdue" | "closed";

interface Kpis {
  pendingReview: number;
  activeLoans: number;
  totalFinanced: number;
  outstandingBalance: number;
  overdueAccounts: number;
}

const DONUT_COLORS = { Pending: "#F59E0B", Active: "#2E7D32", Overdue: "#C0392B", Closed: "#2F6FE4" };

async function fetchFinancingCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<FinancingListResult>(`/finance/loans?${query}`);
  return res.meta.total;
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function FinancingPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("applications");

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [collectedThisMonth, setCollectedThisMonth] = useState<number | null>(null);
  const [collectedChangePercent, setCollectedChangePercent] = useState<number | null>(null);
  const [donut, setDonut] = useState<{ Pending: number; Active: number; Overdue: number; Closed: number } | null>(null);

  const [recordPaymentTarget, setRecordPaymentTarget] = useState<FinancingTarget | "picker" | null>(null);
  const [detailFinancingId, setDetailFinancingId] = useState<string | null>(null);

  // These two requests are independent and resolve in whichever order the
  // network returns them — each setKpis below must fold onto the latest
  // `prev` (never assume its own values are the whole object, and never
  // silently drop its own update when `prev` is still null) or the
  // slower request's fields randomly overwrite the faster one's.
  const loadKpis = useCallback(() => {
    Promise.all([
      fetchFinancingCount({ status: "PENDING" }),
      fetchFinancingCount({ status: "APPROVED,ACTIVE" }),
      fetchFinancingCount({ overdue: "true" }),
      fetchFinancingCount({ status: "COMPLETED,REJECTED,DEFAULTED" }),
    ]).then(([pending, activeTotal, overdue, closed]) => {
      setKpis((prev) => ({
        pendingReview: pending,
        activeLoans: activeTotal,
        totalFinanced: prev?.totalFinanced ?? 0,
        outstandingBalance: prev?.outstandingBalance ?? 0,
        overdueAccounts: overdue,
      }));
      setDonut({ Pending: pending, Active: Math.max(0, activeTotal - overdue), Overdue: overdue, Closed: closed });
    });

    api.get<{ report: FinancingReport }>("/reports/finance").then((res) => {
      setKpis((prev) => ({
        pendingReview: prev?.pendingReview ?? 0,
        activeLoans: prev?.activeLoans ?? 0,
        totalFinanced: res.report.totalPrincipal,
        outstandingBalance: res.report.outstandingLoans,
        overdueAccounts: prev?.overdueAccounts ?? 0,
      }));
    });

    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    Promise.all([
      api.get<{ report: RevenueOverview }>(`/reports/revenue?dateFrom=${isoDate(monthStart)}`),
      api.get<{ report: RevenueOverview }>(`/reports/revenue?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}`),
    ])
      .then(([thisMonth, lastMonth]) => {
        setCollectedThisMonth(thisMonth.report.totals.financing);
        if (lastMonth.report.totals.financing > 0) {
          setCollectedChangePercent(
            Math.round(((thisMonth.report.totals.financing - lastMonth.report.totals.financing) / lastMonth.report.totals.financing) * 1000) / 10
          );
        } else {
          setCollectedChangePercent(null);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  const [refreshKey, setRefreshKey] = useState(0);

  function refreshAll() {
    loadKpis();
    setRefreshKey((k) => k + 1);
  }

  const collectedSublabel = useMemo(() => {
    if (collectedChangePercent === null) return undefined;
    return `${collectedChangePercent >= 0 ? "↑" : "↓"} ${Math.abs(collectedChangePercent)}% from last month`;
  }, [collectedChangePercent]);

  const donutTotal = donut ? donut.Pending + donut.Active + donut.Overdue + donut.Closed : 0;
  const donutData = donut
    ? (["Pending", "Active", "Overdue", "Closed"] as const)
        .map((k) => ({ name: k, value: donut[k] }))
        .filter((d) => d.value > 0)
    : [];

  const TAB_STATUS: Record<Tab, string | undefined> = {
    applications: "PENDING",
    active: "APPROVED,ACTIVE",
    payments: undefined,
    overdue: undefined,
    closed: "COMPLETED,REJECTED,DEFAULTED",
  };

  function openRecordPaymentFor(target: FinancingTarget) {
    setRecordPaymentTarget(target);
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Pending Review" value={kpis ? String(kpis.pendingReview) : "—"} sublabel="Awaiting review" icon={Clock} tone="warning" />
        <KpiCard label="Active Loans" value={kpis ? String(kpis.activeLoans) : "—"} sublabel="Currently active" icon={ClipboardList} tone="success" />
        <KpiCard label="Total Financed" value={kpis ? formatCurrencyCompact(kpis.totalFinanced) : "—"} sublabel="All time" icon={Banknote} />
        <KpiCard label="Outstanding Balance" value={kpis ? formatCurrencyCompact(kpis.outstandingBalance) : "—"} icon={FileText} />
        <KpiCard label="Overdue Accounts" value={kpis ? String(kpis.overdueAccounts) : "—"} sublabel="Requires attention" icon={AlertTriangle} tone="danger" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Collected This Month"
          value={collectedThisMonth !== null ? formatCurrencyCompact(collectedThisMonth) : "—"}
          sublabel={collectedSublabel}
          icon={Wallet}
        />
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(
          [
            ["applications", "Applications"],
            ["active", "Active Loans"],
            ["payments", "Payments"],
            ["overdue", "Overdue Accounts"],
            ["closed", "Closed Loans"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === key ? "border-action text-action" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "payments" ? (
          <FinancingPaymentsTab />
        ) : (
          <FinancingLoansTab
            forcedStatus={TAB_STATUS[tab]}
            forcedOverdue={tab === "overdue"}
            onChanged={refreshAll}
            refreshKey={refreshKey}
            onSelectFinancing={setDetailFinancingId}
            onRecordPayment={openRecordPaymentFor}
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Financing Overview">
          {!donut || donutTotal === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No loans on record yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={DONUT_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-3 flex flex-col gap-1.5">
                {(["Pending", "Active", "Overdue", "Closed"] as const).map((k) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[k] }} />
                      {k}
                    </span>
                    <span className="text-muted">
                      {donut[k]} {donutTotal > 0 ? `(${Math.round((donut[k] / donutTotal) * 100)}%)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTab("applications")}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface"
              >
                <CheckCircle2 size={16} className="text-action" /> Review Applications
              </button>
              <button
                type="button"
                onClick={() => setRecordPaymentTarget("picker")}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface"
              >
                <Wallet size={16} className="text-action" /> Record Payment
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      {recordPaymentTarget && (
        <RecordPaymentModal
          onClose={() => setRecordPaymentTarget(null)}
          onRecorded={(message) => {
            showToast(message);
            refreshAll();
          }}
          initialType={recordPaymentTarget === "picker" ? undefined : "FINANCING"}
          initialFinancing={recordPaymentTarget === "picker" ? undefined : recordPaymentTarget}
        />
      )}

      {detailFinancingId && <FinancingDetailModal financingId={detailFinancingId} onClose={() => setDetailFinancingId(null)} />}
    </div>
  );
}

function FinancingLoansTab({
  forcedStatus,
  forcedOverdue,
  onChanged,
  refreshKey,
  onSelectFinancing,
  onRecordPayment,
}: {
  forcedStatus?: string;
  forcedOverdue?: boolean;
  onChanged: () => void;
  refreshKey: number;
  onSelectFinancing: (id: string) => void;
  onRecordPayment: (target: FinancingTarget) => void;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<FinancingListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Financing | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [infoTarget, setInfoTarget] = useState<Financing | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, forcedStatus, forcedOverdue]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (forcedStatus) params.set("status", forcedStatus);
    if (forcedOverdue) params.set("overdue", "true");

    api
      .get<FinancingListResult>(`/finance/loans?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load loans"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, forcedStatus, forcedOverdue, refreshKey]);

  useEffect(loadList, [loadList]);

  async function handleApprove(financing: Financing) {
    setBusyId(financing.id);
    try {
      await api.post(`/finance/loans/${financing.id}/approve`);
      showToast(`${financing.sale.saleNumber} approved`);
      loadList();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to approve", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    try {
      await api.post(`/finance/loans/${rejectTarget.id}/reject`, { rejectionReason });
      showToast("Application rejected");
      setRejectTarget(null);
      setRejectionReason("");
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to reject application");
    }
  }

  async function handleRequestInfo() {
    if (!infoTarget) return;
    try {
      await api.post(`/finance/loans/${infoTarget.id}/request-info`, { message: infoMessage });
      showToast("Information request sent");
      setInfoTarget(null);
      setInfoMessage("");
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to send request");
    }
  }

  function handleExport() {
    if (!result || result.data.length === 0) {
      showToast("No loans to export", "error");
      return;
    }
    const headers = ["Loan Ref", "Customer", "Vehicle", "Principal", "Interest Rate", "Paid", "Balance", "First Payment Due", "Status"];
    const rows = result.data.map((f) => [
      f.sale.saleNumber,
      customerDisplayName(f.sale.customer),
      vehicleDisplayName(f.sale.vehicle),
      f.principalAmount,
      f.interestRate,
      paidSoFar(f),
      f.outstandingBalance,
      f.firstPaymentDue ? formatDate(f.firstPaymentDue) : "",
      f.status,
    ]);
    downloadCsv(`financing-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast("Loans exported");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by customer, vehicle, or loan ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
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
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Loan Ref</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 text-right font-semibold">Principal</th>
                <th className="px-4 py-3 text-right font-semibold">Rate</th>
                <th className="px-4 py-3 text-right font-semibold">Paid</th>
                <th className="px-4 py-3 text-right font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    No loans match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((f) => {
                  const isOverdue =
                    (f.status === "APPROVED" || f.status === "ACTIVE") &&
                    Number(f.outstandingBalance) > 0 &&
                    !!f.firstPaymentDue &&
                    new Date(f.firstPaymentDue) < new Date();
                  const isBusy = busyId === f.id;
                  return (
                    <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onSelectFinancing(f.id)} className="font-mono text-xs text-action hover:underline">
                          {f.sale.saleNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink">{customerDisplayName(f.sale.customer)}</td>
                      <td className="px-4 py-3 text-ink">{vehicleDisplayName(f.sale.vehicle)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(f.principalAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{Number(f.interestRate)}%</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(paidSoFar(f))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(f.outstandingBalance)}</td>
                      <td className="px-4 py-3">
                        <FinancingStatusBadge status={f.status} isOverdue={isOverdue} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          {f.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleApprove(f)}
                                className="text-xs font-medium text-action hover:underline disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button type="button" onClick={() => setRejectTarget(f)} className="text-xs font-medium text-danger hover:underline">
                                Reject
                              </button>
                              <button type="button" onClick={() => setInfoTarget(f)} className="text-xs font-medium text-muted hover:underline">
                                Request Info
                              </button>
                            </>
                          )}
                          {(f.status === "APPROVED" || f.status === "ACTIVE") && (
                            <button
                              type="button"
                              onClick={() =>
                                onRecordPayment({
                                  id: f.id,
                                  outstandingBalance: f.outstandingBalance,
                                  sale: { customer: f.sale.customer, vehicle: f.sale.vehicle },
                                })
                              }
                              className="text-xs font-medium text-success hover:underline"
                            >
                              Record Payment
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {result && result.meta.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} loans
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
      </div>

      {rejectTarget && (
        <ConfirmDialog
          title="Reject this application?"
          description={`${rejectTarget.sale.saleNumber} (${customerDisplayName(rejectTarget.sale.customer)}) will be rejected and the vehicle released for sale.`}
          confirmLabel="Reject Application"
          danger
          extraContent={
            <textarea
              required
              rows={2}
              placeholder="Reason for rejection…"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          }
          onConfirm={handleReject}
          onCancel={() => {
            setRejectTarget(null);
            setRejectionReason("");
          }}
        />
      )}

      {infoTarget && (
        <ConfirmDialog
          title="Request more information?"
          description={`A note will be logged against ${infoTarget.sale.saleNumber}'s application (no automated email is sent — no email provider is configured in this environment).`}
          confirmLabel="Send Request"
          extraContent={
            <textarea
              required
              rows={2}
              placeholder="What's needed from the customer…"
              value={infoMessage}
              onChange={(e) => setInfoMessage(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          }
          onConfirm={handleRequestInfo}
          onCancel={() => {
            setInfoTarget(null);
            setInfoMessage("");
          }}
        />
      )}
    </div>
  );
}

function FinancingPaymentsTab() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RevenueTransactionListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadList = useCallback(() => {
    setIsLoading(true);
    api
      .get<RevenueTransactionListResult>(`/finance/receipts?type=FINANCING_PAYMENT&page=${page}&pageSize=10`)
      .then(setResult)
      .finally(() => setIsLoading(false));
  }, [page]);

  useEffect(loadList, [loadList]);

  function handleExport() {
    if (!result || result.data.length === 0) {
      showToast("No payments to export", "error");
      return;
    }
    const headers = ["Receipt #", "Customer", "Loan", "Amount", "Method", "Date"];
    const rows = result.data.map((t) => [t.receiptNumber, t.customerName ?? "", t.description ?? "", t.amount, paymentMethodLabel(t.paymentMethod), formatDate(t.date)]);
    downloadCsv(`financing-payments-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast("Payments exported");
  }

  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Receipt #</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Loan</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No loan payments recorded yet.
                  </td>
                </tr>
              ) : (
                result.data.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{t.receiptNumber}</td>
                    <td className="px-4 py-3 text-ink">{t.customerName ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{t.description ?? TRANSACTION_TYPE_LABELS[t.type]}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(t.amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{paymentMethodLabel(t.paymentMethod)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDate(t.date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {result && result.meta.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">
              Page {result.meta.page} of {result.meta.pageCount}
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
      </div>
    </div>
  );
}
