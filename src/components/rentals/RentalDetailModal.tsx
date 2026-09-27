import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/format";
import { paymentMethodLabel } from "../../lib/revenue-helpers";
import { customerDisplayName } from "../../types/customer";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { outstandingBalance } from "../../types/rental";
import { RentalStatusBadge } from "./RentalStatusBadge";
import type { Rental } from "../../types/rental";

export function RentalDetailModal({ rentalId, onClose }: { rentalId: string; onClose: () => void }) {
  const [rental, setRental] = useState<Rental | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ rental: Rental }>(`/rentals/${rentalId}`)
      .then((res) => !cancelled && setRental(res.rental))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load rental"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rentalId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Rental Detail</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-action" />
            </div>
          ) : error || !rental ? (
            <p className="py-10 text-center text-sm text-danger">{error ?? "Rental not found"}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">{rental.rentalNumber}</p>
                  <p className="text-xs text-muted">
                    {formatDate(rental.startDate)} – {formatDate(rental.endDate)}
                  </p>
                </div>
                <RentalStatusBadge
                  status={rental.rentalStatus}
                  isOverdue={rental.rentalStatus === "ACTIVE" && new Date(rental.endDate) < new Date()}
                />
              </div>

              <DetailSection title="Customer">
                <p className="text-sm text-ink">{customerDisplayName(rental.customer)}</p>
                <p className="text-xs text-muted">{rental.customer.phone ?? rental.customer.email ?? "No contact on file"}</p>
                {rental.customer.driverLicenseNo && (
                  <p className="text-xs text-muted">
                    Licence {rental.customer.driverLicenseNo}
                    {rental.customer.licenseExpiry ? ` · expires ${formatDate(rental.customer.licenseExpiry)}` : ""}
                  </p>
                )}
              </DetailSection>

              <DetailSection title="Vehicle">
                <p className="text-sm text-ink">{vehicleDisplayName(rental.vehicle)}</p>
                <p className="text-xs text-muted">
                  {rental.vehicle.stockNumber} · {rental.vehicle.registrationNo ?? "No registration on file"}
                </p>
              </DetailSection>

              {rental.rentalSalesperson && (
                <DetailSection title="Rental salesperson">
                  <p className="text-sm text-ink">{rental.rentalSalesperson.fullName}</p>
                </DetailSection>
              )}

              <DetailSection title="Cost & payments">
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted">Daily rate</dt>
                  <dd className="text-right text-ink">{formatCurrency(rental.dailyRate)}</dd>
                  <dt className="text-muted">Rental days</dt>
                  <dd className="text-right text-ink">{rental.rentalDays}</dd>
                  <dt className="font-medium text-ink">Total cost</dt>
                  <dd className="text-right font-medium text-ink">{formatCurrency(rental.totalCost)}</dd>
                  <dt className="text-muted">Outstanding</dt>
                  <dd className="text-right text-ink">{formatCurrency(outstandingBalance(rental))}</dd>
                </dl>
              </DetailSection>

              {rental.payments.length > 0 && (
                <DetailSection title="Payment history">
                  <ul className="flex flex-col gap-1.5">
                    {rental.payments.map((p) => (
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

              {rental.gpsEnabled && (
                <DetailSection title="GPS tracking">
                  <p className="text-sm text-ink">Enabled{rental.gpsProvider ? ` · ${rental.gpsProvider}` : ""}</p>
                </DetailSection>
              )}

              {(rental.actualPickupAt || rental.actualReturnAt) && (
                <DetailSection title="Handoff">
                  {rental.actualPickupAt && <p className="text-sm text-ink">Picked up {formatDateTime(rental.actualPickupAt)}</p>}
                  {rental.actualReturnAt && <p className="text-sm text-ink">Returned {formatDateTime(rental.actualReturnAt)}</p>}
                </DetailSection>
              )}

              {rental.notes && (
                <DetailSection title="Notes">
                  <p className="whitespace-pre-wrap text-sm text-ink">{rental.notes}</p>
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
