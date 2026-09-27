import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency, formatDate, formatDateTime, formatEnumLabel } from "../../lib/format";
import { customerDisplayName } from "../../types/customer";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { SaleStatusBadge } from "./SaleStatusBadge";
import type { Sale } from "../../types/sale";

export function SaleDetailModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ sale: Sale }>(`/sales/${saleId}`)
      .then((res) => !cancelled && setSale(res.sale))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load sale"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Sale Detail</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-action" />
            </div>
          ) : error || !sale ? (
            <p className="py-10 text-center text-sm text-danger">{error ?? "Sale not found"}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">{sale.saleNumber}</p>
                  <p className="text-xs text-muted">{formatDate(sale.saleDate)}</p>
                </div>
                <SaleStatusBadge status={sale.saleStatus} />
              </div>

              <DetailSection title="Customer">
                <p className="text-sm text-ink">{customerDisplayName(sale.customer)}</p>
                <p className="text-xs text-muted">{sale.customer.phone ?? sale.customer.email ?? "No contact on file"}</p>
              </DetailSection>

              <DetailSection title="Vehicle">
                <p className="text-sm text-ink">{vehicleDisplayName(sale.vehicle)}</p>
                <p className="text-xs text-muted">
                  {sale.vehicle.stockNumber} · {sale.vehicle.registrationNo ?? "No registration on file"}
                </p>
              </DetailSection>

              <DetailSection title="Salesperson">
                <p className="text-sm text-ink">{sale.salesperson.fullName}</p>
              </DetailSection>

              <DetailSection title="Price & commission">
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted">Selling price</dt>
                  <dd className="text-right text-ink">{formatCurrency(sale.sellingPrice)}</dd>
                  <dt className="text-muted">Discount</dt>
                  <dd className="text-right text-ink">−{formatCurrency(sale.discount)}</dd>
                  <dt className="font-medium text-ink">Final price</dt>
                  <dd className="text-right font-medium text-ink">{formatCurrency(sale.finalPrice)}</dd>
                  <dt className="text-muted">Payment method</dt>
                  <dd className="text-right text-ink">{sale.paymentMethod ?? "—"}</dd>
                  <dt className="text-muted">Commission ({Number(sale.commissionRate)}%)</dt>
                  <dd className="text-right text-ink">{formatCurrency(sale.commissionAmount)}</dd>
                </dl>
              </DetailSection>

              {sale.financing && (
                <DetailSection title="Financing">
                  <dl className="grid grid-cols-2 gap-y-1 text-sm">
                    <dt className="text-muted">Status</dt>
                    <dd className="text-right text-ink">{formatEnumLabel(sale.financing.status)}</dd>
                    <dt className="text-muted">Principal</dt>
                    <dd className="text-right text-ink">{formatCurrency(sale.financing.principalAmount)}</dd>
                    <dt className="text-muted">Interest rate</dt>
                    <dd className="text-right text-ink">{Number(sale.financing.interestRate)}%</dd>
                    <dt className="text-muted">Term</dt>
                    <dd className="text-right text-ink">{sale.financing.termMonths} months</dd>
                    <dt className="text-muted">Monthly payment</dt>
                    <dd className="text-right text-ink">{formatCurrency(sale.financing.monthlyPayment)}</dd>
                    <dt className="text-muted">Outstanding balance</dt>
                    <dd className="text-right text-ink">{formatCurrency(sale.financing.outstandingBalance)}</dd>
                  </dl>
                </DetailSection>
              )}

              {sale.ownershipTransfer && (
                <DetailSection title="Ownership transfer">
                  <p className="text-sm text-ink">{formatEnumLabel(sale.ownershipTransfer.status)}</p>
                  {sale.ownershipTransfer.completedAt && (
                    <p className="text-xs text-muted">Completed {formatDateTime(sale.ownershipTransfer.completedAt)}</p>
                  )}
                </DetailSection>
              )}

              {sale.notes && (
                <DetailSection title="Notes">
                  <p className="whitespace-pre-wrap text-sm text-ink">{sale.notes}</p>
                </DetailSection>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
