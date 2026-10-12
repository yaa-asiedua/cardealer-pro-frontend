import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Clock, Download, FileCheck2, Lightbulb, RotateCcw, SendHorizonal } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TransferDetailModal } from "../components/transfers/TransferDetailModal";
import { TransferStatusBadge } from "../components/transfers/TransferStatusBadge";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatDate } from "../lib/format";
import { customerDisplayName } from "../types/customer";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { Transfer, TransferListResult, TransferStatus } from "../types/transfer";
import { useAutoRefresh } from "../lib/use-auto-refresh";

type Tab = "all" | "pending" | "submitted" | "completed";

interface Kpis {
  total: number;
  pending: number;
  submitted: number;
  completed: number;
}

async function fetchTransferCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<TransferListResult>(`/transfers?${query}`);
  return res.meta.total;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function TransfersPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [detailTransferId, setDetailTransferId] = useState<string | null>(null);

  const loadKpis = useCallback(() => {
    Promise.all([
      fetchTransferCount({}),
      fetchTransferCount({ status: "PENDING" }),
      fetchTransferCount({ status: "SUBMITTED_TO_REGISTRY" }),
      fetchTransferCount({ status: "COMPLETED" }),
    ]).then(([total, pending, submitted, completed]) => {
      setKpis({ total, pending, submitted, completed });
    });
  }, []);

  const loadInsight = useCallback(() => {
    api
      .get<TransferListResult>("/transfers?status=COMPLETED&pageSize=100")
      .then((res) => {
        const durations = res.data
          .filter((t) => t.completedAt)
          .map((t) => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / MS_PER_DAY);
        if (durations.length === 0) {
          setInsight(null);
          return;
        }
        const avgDays = Math.round((durations.reduce((sum, d) => sum + d, 0) / durations.length) * 10) / 10;
        setInsight(`Transfers complete in ${avgDays} day${avgDays === 1 ? "" : "s"} on average, based on the last ${durations.length} completed.`);
      })
      .catch(() => setInsight(null));

    // A separate check for the oldest still-open transfer takes priority
    // over the average-time insight when one exists — more actionable.
    api
      .get<TransferListResult>("/transfers?status=PENDING&pageSize=100")
      .then((res) => {
        if (res.data.length === 0) return;
        const oldest = [...res.data].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        const daysOpen = Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / MS_PER_DAY);
        if (daysOpen >= 7) {
          setInsight(`${vehicleDisplayName(oldest.vehicle)} (${oldest.sale.saleNumber}) has been pending for ${daysOpen} days — follow up on the logbook.`);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadKpis();
    loadInsight();
  }, [loadKpis, loadInsight]);
  useAutoRefresh(() => {
    loadKpis();
    loadInsight();
  });

  const [refreshKey, setRefreshKey] = useState(0);

  function refreshAll() {
    loadKpis();
    loadInsight();
    setRefreshKey((k) => k + 1);
  }

  const TAB_STATUS: Record<Tab, TransferStatus | undefined> = {
    all: undefined,
    pending: "PENDING",
    submitted: "SUBMITTED_TO_REGISTRY",
    completed: "COMPLETED",
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Transfers" value={kpis ? String(kpis.total) : "—"} icon={ClipboardList} />
        <KpiCard label="Pending" value={kpis ? String(kpis.pending) : "—"} sublabel="Documents not yet collected/submitted" icon={Clock} tone="warning" />
        <KpiCard label="Submitted to Registry" value={kpis ? String(kpis.submitted) : "—"} icon={SendHorizonal} />
        <KpiCard label="Completed" value={kpis ? String(kpis.completed) : "—"} icon={FileCheck2} tone="success" />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_rgb(var(--color-border))] [mask-image:linear-gradient(to_right,#000_80%,transparent)] sm:[mask-image:none]">
        {(
          [
            ["all", "All Transfers"],
            ["pending", "Pending"],
            ["submitted", "Submitted to Registry"],
            ["completed", "Completed"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 sm:px-4 text-sm font-medium ${
              tab === key ? "border-action text-action" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <TransfersTab
          forcedStatus={TAB_STATUS[tab]}
          onChanged={refreshAll}
          refreshKey={refreshKey}
          onSelectTransfer={setDetailTransferId}
        />
      </div>

      {insight && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Lightbulb size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Transfer Insight</p>
            <p className="mt-1 text-sm text-muted">{insight}</p>
          </div>
        </div>
      )}

      {detailTransferId && <TransferDetailModal transferId={detailTransferId} onClose={() => setDetailTransferId(null)} />}
    </div>
  );
}

function TransfersTab({
  forcedStatus,
  onChanged,
  refreshKey,
  onSelectTransfer,
}: {
  forcedStatus?: TransferStatus;
  onChanged: () => void;
  refreshKey: number;
  onSelectTransfer: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TransferListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<Transfer | null>(null);
  const [registryReference, setRegistryReference] = useState("");
  const [completeTarget, setCompleteTarget] = useState<Transfer | null>(null);
  const [feeAmount, setFeeAmount] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [newRegistrationNo, setNewRegistrationNo] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo, forcedStatus]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (forcedStatus) params.set("status", forcedStatus);

    api
      .get<TransferListResult>(`/transfers?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load transfers"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, dateFrom, dateTo, forcedStatus, refreshKey]);

  useEffect(loadList, [loadList]);

  useAutoRefresh(loadList);

  async function handleCollectDocuments(transfer: Transfer) {
    setBusyId(transfer.id);
    try {
      await api.post(`/transfers/${transfer.id}/collect-documents`);
      showToast("Old logbook marked as collected");
      loadList();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmit() {
    if (!submitTarget) return;
    try {
      await api.post(`/transfers/${submitTarget.id}/submit`, registryReference ? { registryReference } : {});
      showToast("Submitted to registry");
      setSubmitTarget(null);
      setRegistryReference("");
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to submit");
    }
  }

  async function handleComplete() {
    if (!completeTarget) return;
    const firstRegistration = completeTarget.isFirstRegistration;
    if (firstRegistration && !newRegistrationNo.trim()) {
      throw new Error("Enter the registration number issued for this vehicle");
    }
    try {
      await api.post(`/transfers/${completeTarget.id}/complete`, {
        registrationNo: firstRegistration ? newRegistrationNo.trim() : undefined,
        feeAmount: feeAmount ? Number(feeAmount) : undefined,
        notes: completionNotes || undefined,
      });
      showToast(firstRegistration ? "Registration completed and number saved to the vehicle" : "Transfer completed");
      setCompleteTarget(null);
      setFeeAmount("");
      setCompletionNotes("");
      setNewRegistrationNo("");
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to complete transfer");
    }
  }

  function handleExport() {
    if (!result || result.data.length === 0) {
      showToast("No transfers to export", "error");
      return;
    }
    const headers = ["Transfer Ref", "Customer", "Vehicle", "Fee", "Created", "Completed", "Status"];
    const rows = result.data.map((t) => [
      t.sale.saleNumber,
      customerDisplayName(t.customer),
      vehicleDisplayName(t.vehicle),
      t.feeAmount ?? "",
      formatDate(t.createdAt),
      t.completedAt ? formatDate(t.completedAt) : "",
      t.status,
    ]);
    downloadCsv(`transfers-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast("Transfers exported");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by customer, vehicle, or transfer ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="To"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
            }}
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
          <table className="sticky-actions w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Transfer Ref</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Fee</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading && !result ? (
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
                    No transfers match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((t) => {
                  const isBusy = busyId === t.id;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onSelectTransfer(t.id)} className="font-mono text-xs text-action hover:underline">
                          {t.sale.saleNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink">{customerDisplayName(t.customer)}</td>
                      <td className="px-4 py-3 text-ink">
                        {vehicleDisplayName(t.vehicle)}
                        {t.isFirstRegistration && (
                          <span className="mt-0.5 block w-fit rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                            First registration
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{t.feeAmount ? formatCurrency(t.feeAmount) : "—"}</td>
                      <td className="px-4 py-3">
                        <TransferStatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status === "PENDING" && !t.isFirstRegistration && !t.oldLogbookCollectedAt && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleCollectDocuments(t)}
                            className="text-xs font-medium text-action hover:underline disabled:opacity-50"
                          >
                            Collect Documents
                          </button>
                        )}
                        {t.status === "PENDING" && (t.isFirstRegistration || t.oldLogbookCollectedAt) && (
                          <button type="button" onClick={() => setSubmitTarget(t)} className="text-xs font-medium text-action hover:underline">
                            Submit to Registry
                          </button>
                        )}
                        {t.status === "SUBMITTED_TO_REGISTRY" && (
                          <button type="button" onClick={() => setCompleteTarget(t)} className="text-xs font-medium text-success hover:underline">
                            {t.isFirstRegistration ? "Complete Registration" : "Complete Transfer"}
                          </button>
                        )}
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
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} transfers
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

      {submitTarget && (
        <ConfirmDialog
          title="Submit to registry?"
          description={`${submitTarget.sale.saleNumber} (${vehicleDisplayName(submitTarget.vehicle)}) will be marked as submitted to the registry.`}
          confirmLabel="Submit to Registry"
          extraContent={
            <input
              placeholder="Registry reference (optional)"
              value={registryReference}
              onChange={(e) => setRegistryReference(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          }
          onConfirm={handleSubmit}
          onCancel={() => {
            setSubmitTarget(null);
            setRegistryReference("");
          }}
        />
      )}

      {completeTarget && (
        <ConfirmDialog
          title={completeTarget.isFirstRegistration ? "Complete first registration?" : "Complete this transfer?"}
          description={
            completeTarget.isFirstRegistration
              ? `${completeTarget.sale.saleNumber} (${vehicleDisplayName(completeTarget.vehicle)}) was never registered. Enter the registration number the registry issued; it will be saved to the vehicle.`
              : `${completeTarget.sale.saleNumber} (${vehicleDisplayName(completeTarget.vehicle)}) will be marked as completed.`
          }
          confirmLabel={completeTarget.isFirstRegistration ? "Complete Registration" : "Complete Transfer"}
          extraContent={
            <div className="flex flex-col gap-2">
              {completeTarget.isFirstRegistration && (
                <input
                  required
                  aria-label="New registration number"
                  placeholder="New registration number (e.g. GR 1234-26)"
                  value={newRegistrationNo}
                  onChange={(e) => setNewRegistrationNo(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                />
              )}
              <input
                type="number" inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="Transfer fee (GHS, optional)"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              />
              <textarea
                rows={2}
                placeholder="Notes (optional)"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              />
            </div>
          }
          onConfirm={handleComplete}
          onCancel={() => {
            setCompleteTarget(null);
            setFeeAmount("");
            setCompletionNotes("");
            setNewRegistrationNo("");
          }}
        />
      )}
    </div>
  );
}
