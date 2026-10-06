import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency, formatDateTime } from "../../lib/format";
import { customerDisplayName } from "../../types/customer";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { TransferStatusBadge } from "./TransferStatusBadge";
import type { Transfer } from "../../types/transfer";
import { ModalOverlay } from "../ModalOverlay";

export function TransferDetailModal({ transferId, onClose }: { transferId: string; onClose: () => void }) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ transfer: Transfer }>(`/transfers/${transferId}`)
      .then((res) => !cancelled && setTransfer(res.transfer))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load transfer"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [transferId]);

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Transfer Detail</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-action" />
            </div>
          ) : error || !transfer ? (
            <p className="py-10 text-center text-sm text-danger">{error ?? "Transfer not found"}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">{transfer.sale.saleNumber}</p>
                  <p className="text-xs text-muted">Opened {formatDateTime(transfer.createdAt)}</p>
                </div>
                <TransferStatusBadge status={transfer.status} />
              </div>

              <DetailSection title="From">
                <p className="text-sm text-ink">CARDEALER PRO (dealership stock)</p>
              </DetailSection>

              <DetailSection title="To (New Owner)">
                <p className="text-sm text-ink">{customerDisplayName(transfer.customer)}</p>
                <p className="text-xs text-muted">{transfer.customer.phone ?? transfer.customer.email ?? "No contact on file"}</p>
              </DetailSection>

              <DetailSection title="Vehicle">
                <p className="text-sm text-ink">{vehicleDisplayName(transfer.vehicle)}</p>
                <p className="text-xs text-muted">
                  {transfer.vehicle.stockNumber} · {transfer.vehicle.registrationNo ?? "No registration on file"}
                </p>
              </DetailSection>

              <DetailSection title="Progress">
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted">Old logbook collected</dt>
                  <dd className="text-right text-ink">{transfer.oldLogbookCollectedAt ? formatDateTime(transfer.oldLogbookCollectedAt) : "—"}</dd>
                  <dt className="text-muted">Submitted to registry</dt>
                  <dd className="text-right text-ink">{transfer.submittedToRegistryAt ? formatDateTime(transfer.submittedToRegistryAt) : "—"}</dd>
                  <dt className="text-muted">Registry reference</dt>
                  <dd className="text-right text-ink">{transfer.registryReference ?? "—"}</dd>
                  <dt className="text-muted">Completed</dt>
                  <dd className="text-right text-ink">{transfer.completedAt ? formatDateTime(transfer.completedAt) : "—"}</dd>
                  <dt className="text-muted">Transfer fee</dt>
                  <dd className="text-right text-ink">{transfer.feeAmount ? formatCurrency(transfer.feeAmount) : "—"}</dd>
                </dl>
              </DetailSection>

              {transfer.notes && (
                <DetailSection title="Notes">
                  <p className="whitespace-pre-wrap text-sm text-ink">{transfer.notes}</p>
                </DetailSection>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}
