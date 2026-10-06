import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, FileText, RotateCcw } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FinancingDetailModal } from "../components/financing/FinancingDetailModal";
import { FinancingStatusBadge } from "../components/financing/FinancingStatusBadge";
import { RecordPaymentModal } from "../components/payments/RecordPaymentModal";
import type { FinancingTarget } from "../components/payments/RecordPaymentModal";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatDate } from "../lib/format";
import { customerDisplayName } from "../types/customer";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { Financing, FinancingListResult } from "../types/financing";

type Tab = "" | "PENDING" | "APPROVED" | "REJECTED";

const APPROVED_STATUSES = "APPROVED,ACTIVE,COMPLETED,DEFAULTED";
const TAB_STATUS: Record<Tab, string | undefined> = {
  "": undefined,
  PENDING: "PENDING",
  APPROVED: APPROVED_STATUSES,
  REJECTED: "REJECTED",
};

const STATUS_COLORS = { Approved: "#16a34a", Pending: "#d97706", Declined: "#dc2626" };

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

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<FinancingListResult>(`/finance/loans?${query}`);
  return res.meta.total;
}

// Reconciled against finance_pages/financing.jpeg. Real and included:
// financingNumber (new this round), Approve/Reject/Request Info/Record
// Payment actions (mirrors Admin's FinancingPage.tsx exactly, built in a
// separate dedicated file since the two mockups already frame the same
// data differently — Admin's groups by loan lifecycle stage, this one by
// application-approval outcome). Two scopes are deliberately different
// on this page: the KPI row is "this month's new applications" (matches
// the Dashboard's own cohort definition exactly, so the same numbers
// mean the same thing on both pages); the status tabs/table are
// all-time — a Finance Manager reviewing "Pending" needs to see every
// pending application, not just this month's.
//
// Dropped, not real: the mockup's Risk Level column/filter and
// "Repayment Risk Alerts" panel (the paused AI "financing risk flag"
// feature, same call made on the Dashboard) — replaced with a real
// "Overdue Repayments" panel. "+ New Financing Application" is also
// gone — financing records are only ever created as a side effect of a
// Sales Salesperson choosing "Financing" at sale time, never a
// standalone Finance-initiated action.
export function FinancingApplicationsPage() {
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<FinancingListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tabCounts, setTabCounts] = useState<Record<Tab, number | null>>({
    "": null,
    PENDING: null,
    APPROVED: null,
    REJECTED: null,
  });
  const [allLoans, setAllLoans] = useState<Financing[]>([]);
  const [overdueLoans, setOverdueLoans] = useState<Financing[]>([]);

  const [rejectTarget, setRejectTarget] = useState<Financing | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [infoTarget, setInfoTarget] = useState<Financing | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<FinancingTarget | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (TAB_STATUS[tab]) params.set("status", TAB_STATUS[tab]!);

    api
      .get<FinancingListResult>(`/finance/loans?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load applications"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, tab]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    Promise.all([
      fetchCount({}),
      fetchCount({ status: "PENDING" }),
      fetchCount({ status: APPROVED_STATUSES }),
      fetchCount({ status: "REJECTED" }),
    ]).then(([all, pending, approved, rejected]) =>
      setTabCounts({ "": all, PENDING: pending, APPROVED: approved, REJECTED: rejected })
    );

    api
      .get<FinancingListResult>("/finance/loans?pageSize=100")
      .then((res) => setAllLoans(res.data))
      .catch(() => setAllLoans([]));

    api
      .get<FinancingListResult>("/finance/loans?overdue=true&pageSize=5")
      .then((res) => setOverdueLoans(res.data))
      .catch(() => setOverdueLoans([]));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  function refreshAll() {
    loadList();
    loadSummary();
  }

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

  const statusBreakdown = useMemo(() => {
    const c = cohort.thisMonth;
    return [
      { key: "Approved", value: c.approved, color: STATUS_COLORS.Approved },
      { key: "Pending", value: c.pending, color: STATUS_COLORS.Pending },
      { key: "Declined", value: c.declined, color: STATUS_COLORS.Declined },
    ].filter((d) => d.value > 0);
  }, [cohort]);

  const recentApplications = useMemo(() => allLoans.slice(0, 5), [allLoans]);

  async function handleApprove(financing: Financing) {
    setBusyId(financing.id);
    try {
      await api.post(`/finance/loans/${financing.id}/approve`);
      showToast(`${financing.financingNumber} approved`);
      refreshAll();
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
      refreshAll();
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

  function resetFilters() {
    setSearch("");
    setTab("");
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
          <FileText size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink">Financing</h1>
          <p className="text-sm text-muted">Manage financing applications and track approval status.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          icon={FileText}
          tone="success"
        />
        <KpiCard
          label="Pending"
          value={String(cohort.thisMonth.pending)}
          sublabel={percentChange(cohort.thisMonth.pending, cohort.lastMonth.pending) ?? "This month"}
          icon={FileText}
          tone={cohort.thisMonth.pending > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Declined"
          value={String(cohort.thisMonth.declined)}
          sublabel={percentChange(cohort.thisMonth.declined, cohort.lastMonth.declined) ?? "This month"}
          icon={FileText}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["", "PENDING", "APPROVED", "REJECTED"] as Tab[]).map((t) => (
              <button
                key={t || "ALL"}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {t === "" ? "All" : t === "PENDING" ? "Pending" : t === "APPROVED" ? "Approved" : "Declined"} (
                {tabCounts[t] ?? "—"})
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, vehicle, or application no…"
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
            <div className="overflow-x-auto">
              <table className="sticky-actions w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Application No.</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold">Down Payment</th>
                    <th className="px-4 py-3 text-right font-semibold">Tenure</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
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
                        No applications match these filters.
                      </td>
                    </tr>
                  ) : (
                    result.data.map((f) => {
                      const downPayment = Number(f.sale.finalPrice) - Number(f.principalAmount);
                      const isOverdue =
                        (f.status === "APPROVED" || f.status === "ACTIVE") &&
                        Number(f.outstandingBalance) > 0 &&
                        !!f.firstPaymentDue &&
                        new Date(f.firstPaymentDue) < new Date();
                      const isBusy = busyId === f.id;
                      return (
                        <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface">
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => setDetailId(f.id)} className="font-mono text-xs text-action hover:underline">
                              {f.financingNumber}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-ink">{customerDisplayName(f.sale.customer)}</td>
                          <td className="px-4 py-3 text-ink">{vehicleDisplayName(f.sale.vehicle)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(f.principalAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(downPayment)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{f.termMonths} mo</td>
                          <td className="px-4 py-3">
                            <FinancingStatusBadge status={f.status} isOverdue={isOverdue} />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">{formatDate(f.applicationDate)}</td>
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
                                    Info
                                  </button>
                                </>
                              )}
                              {(f.status === "APPROVED" || f.status === "ACTIVE") && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRecordPaymentTarget({
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
                  {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} applications
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
          <SectionCard title="Overdue Repayments">
            {overdueLoans.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No overdue repayments right now.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {overdueLoans.map((f) => (
                  <li
                    key={f.id}
                    onClick={() => setDetailId(f.id)}
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
          </SectionCard>

          <SectionCard title="Application Status Summary">
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

          <SectionCard title="Recent Applications">
            {recentApplications.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No applications yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentApplications.map((f) => (
                  <li
                    key={f.id}
                    onClick={() => setDetailId(f.id)}
                    className="flex cursor-pointer items-center justify-between gap-2 py-2.5 text-sm hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{customerDisplayName(f.sale.customer)}</div>
                      <div className="truncate text-xs text-muted">{vehicleDisplayName(f.sale.vehicle)}</div>
                    </div>
                    <FinancingStatusBadge status={f.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {rejectTarget && (
        <ConfirmDialog
          title="Reject this application?"
          description={`${rejectTarget.financingNumber} (${customerDisplayName(rejectTarget.sale.customer)}) will be rejected and the vehicle released for sale.`}
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
          description={`A note will be logged against ${infoTarget.financingNumber}'s application (no automated email is sent — no email provider is configured in this environment).`}
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

      {recordPaymentTarget && (
        <RecordPaymentModal
          onClose={() => setRecordPaymentTarget(null)}
          onRecorded={(message) => {
            showToast(message);
            refreshAll();
          }}
          initialType="FINANCING"
          initialFinancing={recordPaymentTarget}
        />
      )}

      {detailId && <FinancingDetailModal financingId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
