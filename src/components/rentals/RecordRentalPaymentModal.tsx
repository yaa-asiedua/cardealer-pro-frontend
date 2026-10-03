import { useState } from "react";
import { X } from "lucide-react";
import { SearchSelect } from "../SearchSelect";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency } from "../../lib/format";
import { paymentMethodLabel } from "../../lib/revenue-helpers";
import { PAYMENT_METHOD_OPTIONS } from "../../lib/sale-helpers";
import { outstandingBalance } from "../../types/rental";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { customerDisplayName } from "../../types/customer";
import type { Rental, RentalListResult } from "../../types/rental";

function fieldClass() {
  return "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";
}

interface RecordRentalPaymentModalProps {
  onClose: () => void;
  onRecorded: (message: string) => void;
}

// Ledger-only recording for this role — POST /rentals/:id/payments, same
// endpoint RentalFormModal/AddRentalPage use. Deliberately NOT the shared
// RecordPaymentModal: its rental flow auto-calls POST
// /finance/rentals/:id/payment once a balance hits zero, which is
// ADMIN+FINANCE_MANAGER only and would 403 for a Rental Salesperson.
// Finance confirms full payment and issues the receipt later, same real
// division of labour documented in rentals/README.md.
export function RecordRentalPaymentModal({ onClose, onRecorded }: RecordRentalPaymentModalProps) {
  const [selected, setSelected] = useState<Rental | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRentals(query: string): Promise<Rental[]> {
    const res = await api.get<RentalListResult>("/rentals?paymentStatus=PENDING&pageSize=50");
    const q = query.trim().toLowerCase();
    const matches = q
      ? res.data.filter(
          (r) =>
            r.rentalNumber.toLowerCase().includes(q) ||
            customerDisplayName(r.customer).toLowerCase().includes(q) ||
            vehicleDisplayName(r.vehicle).toLowerCase().includes(q)
        )
      : res.data;
    return matches.slice(0, 10);
  }

  function handleSelect(r: Rental | null) {
    setSelected(r);
    setAmount(r ? String(outstandingBalance(r)) : "");
  }

  async function handleSubmit() {
    if (!selected) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post(`/rentals/${selected.id}/payments`, {
        amount: amt,
        paymentMethod: method || undefined,
        referenceNo: referenceNo || undefined,
      });
      onRecorded(`Payment recorded for ${selected.rentalNumber}`);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to record payment";
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Record Payment</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted">Rental with an outstanding balance</label>
            <div className="mt-1">
              <SearchSelect<Rental>
                placeholder="Search by rental number, customer, or vehicle…"
                selected={selected}
                onSelect={handleSelect}
                fetchOptions={fetchRentals}
                getId={(r) => r.id}
                getLabel={(r) => `${r.rentalNumber} — ${customerDisplayName(r.customer)}`}
                getSubLabel={(r) => `${vehicleDisplayName(r.vehicle)} · Outstanding ${formatCurrency(outstandingBalance(r))}`}
              />
            </div>
          </div>

          {selected && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted">Amount</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass()} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className={fieldClass()}>
                    <option value="">Select…</option>
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {paymentMethodLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Reference number (optional)</label>
                <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={fieldClass()} />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="mt-1 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Recording…" : "Record Payment"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
