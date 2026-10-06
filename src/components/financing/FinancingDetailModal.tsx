import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency, formatDate } from "../../lib/format";
import { paymentMethodLabel } from "../../lib/revenue-helpers";
import { customerDisplayName } from "../../types/customer";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { paidSoFar } from "../../types/financing";
import { FinancingStatusBadge } from "./FinancingStatusBadge";
import type { Financing } from "../../types/financing";
import { ModalOverlay } from "../ModalOverlay";

export function FinancingDetailModal({ financingId, onClose }: { financingId: string; onClose: () => void }) {
  const [financing, setFinancing] = useState<Financing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ financing: Financing }>(`/finance/loans/${financingId}`)
      .then((res) => !cancelled && setFinancing(res.financing))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load loan"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [financingId]);

  const isOverdue =
    !!financing &&
    (financing.status === "APPROVED" || financing.status === "ACTIVE") &&
    Number(financing.outstandingBalance) > 0 &&
    !!financing.firstPaymentDue &&
    new Date(financing.firstPaymentDue) < new Date();

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Loan Detail</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-action" />
            </div>
          ) : error || !financing ? (
            <p className="py-10 text-center text-sm text-danger">{error ?? "Loan not found"}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">{financing.sale.saleNumber}</p>
                  <p className="text-xs text-muted">Applied {formatDate(financing.applicationDate)}</p>
                </div>
                <FinancingStatusBadge status={financing.status} isOverdue={isOverdue} />
              </div>

              <DetailSection title="Customer">
                <p className="text-sm text-ink">{customerDisplayName(financing.sale.customer)}</p>
                <p className="text-xs text-muted">{financing.sale.customer.phone ?? financing.sale.customer.email ?? "No contact on file"}</p>
              </DetailSection>

              <DetailSection title="Vehicle">
                <p className="text-sm text-ink">{vehicleDisplayName(financing.sale.vehicle)}</p>
                <p className="text-xs text-muted">
                  {financing.sale.vehicle.stockNumber} · {financing.sale.vehicle.registrationNo ?? "No registration on file"}
                </p>
              </DetailSection>

              <DetailSection title="Loan terms">
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted">Principal</dt>
                  <dd className="text-right text-ink">{formatCurrency(financing.principalAmount)}</dd>
                  <dt className="text-muted">Interest rate</dt>
                  <dd className="text-right text-ink">{Number(financing.interestRate)}%</dd>
                  <dt className="text-muted">Term</dt>
                  <dd className="text-right text-ink">{financing.termMonths} months</dd>
                  <dt className="text-muted">Monthly payment</dt>
                  <dd className="text-right text-ink">{formatCurrency(financing.monthlyPayment)}</dd>
                  <dt className="text-muted">First payment due</dt>
                  <dd className="text-right text-ink">{financing.firstPaymentDue ? formatDate(financing.firstPaymentDue) : "—"}</dd>
                </dl>
              </DetailSection>

              <DetailSection title="Balance">
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted">Paid so far</dt>
                  <dd className="text-right text-ink">{formatCurrency(paidSoFar(financing))}</dd>
                  <dt className="font-medium text-ink">Outstanding balance</dt>
                  <dd className="text-right font-medium text-ink">{formatCurrency(financing.outstandingBalance)}</dd>
                </dl>
              </DetailSection>

              {financing.payments.length > 0 && (
                <DetailSection title="Payment history">
                  <ul className="flex flex-col gap-1.5">
                    {financing.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted">
                          {formatDate(p.paymentDate)} · {paymentMethodLabel(p.paymentMethod)}
                        </span>
                        <span className="text-ink">{formatCurrency(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              )}

              {financing.rejectionReason && (
                <DetailSection title="Rejection reason">
                  <p className="whitespace-pre-wrap text-sm text-ink">{financing.rejectionReason}</p>
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
