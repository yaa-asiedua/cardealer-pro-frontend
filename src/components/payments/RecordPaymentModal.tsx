import { useState } from "react";
import { X } from "lucide-react";
import { SearchSelect } from "../SearchSelect";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency } from "../../lib/format";
import { paymentMethodLabel } from "../../lib/revenue-helpers";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { Sale, SaleListResult } from "../../types/sale";
import { ModalOverlay } from "../ModalOverlay";

export type PaymentType = "SALE" | "RENTAL" | "FINANCING" | "SERVICE";

const TYPE_LABELS: Record<PaymentType, string> = {
  SALE: "Cash Sale",
  RENTAL: "Rental",
  FINANCING: "Loan Installment",
  SERVICE: "Service Job",
};

const TYPE_HINTS: Record<PaymentType, string> = {
  SALE: "Confirm payment on a completed cash sale",
  RENTAL: "Record a deposit or balance installment",
  FINANCING: "Record a loan repayment installment",
  SERVICE: "Confirm payment on a completed job",
};

const PAYMENT_METHOD_OPTIONS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD"] as const;

interface RentalTarget {
  id: string;
  rentalNumber: string;
  totalCost: string;
  customer: { firstName: string; lastName: string };
  vehicle: { make: string; model: string; year: number };
  payments: { amount: string }[];
}

export interface FinancingTarget {
  id: string;
  outstandingBalance: string;
  sale: {
    customer: { firstName: string; lastName: string };
    vehicle: { make: string; model: string; year: number };
  };
}

interface ServiceJobTarget {
  id: string;
  jobNumber: string;
  vehicle: { make: string; model: string; year: number };
  serviceCost: string | null;
  partsCost: string | null;
  labourCost: string | null;
}

function fieldClass() {
  return "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";
}

interface RecordPaymentModalProps {
  onClose: () => void;
  onRecorded: (message: string) => void;
  // Lets a caller that already knows the transaction type (and, for a
  // loan, which one) skip straight past the type-picker/search steps —
  // used by the Financing page's per-row "Record Payment" action so
  // clicking it on a specific loan doesn't make the admin search for the
  // loan they just clicked.
  initialType?: PaymentType;
  initialFinancing?: FinancingTarget;
}

export function RecordPaymentModal({ onClose, onRecorded, initialType, initialFinancing }: RecordPaymentModalProps) {
  const [type, setType] = useState<PaymentType | null>(initialType ?? null);

  function handleDone(message: string) {
    onRecorded(message);
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Record Payment</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {!type ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {(Object.keys(TYPE_LABELS) as PaymentType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className="rounded-lg border border-border p-4 text-left hover:border-action hover:bg-surface"
              >
                <p className="text-sm font-semibold text-ink">{TYPE_LABELS[t]}</p>
                <p className="mt-1 text-xs text-muted">{TYPE_HINTS[t]}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            {!initialType && (
              <button type="button" onClick={() => setType(null)} className="text-xs font-medium text-action hover:underline">
                ← Change transaction type
              </button>
            )}
            <div className="mt-3">
              {type === "SALE" && <SalePaymentForm onDone={handleDone} />}
              {type === "RENTAL" && <RentalPaymentForm onDone={handleDone} />}
              {type === "FINANCING" && <FinancingPaymentForm onDone={handleDone} initialTarget={initialFinancing} />}
              {type === "SERVICE" && <ServicePaymentForm onDone={handleDone} />}
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

function SalePaymentForm({ onDone }: { onDone: (message: string) => void }) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Sale | null>(null);
  const [referenceNo, setReferenceNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSales(query: string): Promise<Sale[]> {
    const params = new URLSearchParams({ status: "COMPLETED", paymentStatus: "PENDING", pageSize: "10" });
    if (query) params.set("search", query);
    const res = await api.get<SaleListResult>(`/sales?${params.toString()}`);
    return res.data;
  }

  async function handleSubmit() {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post(`/finance/sales/${selected.id}/payment`, referenceNo ? { referenceNo } : {});
      onDone(`Payment confirmed for ${selected.saleNumber}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to confirm payment";
      setError(message);
      showToast(message, "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted">Completed sale awaiting payment</label>
        <div className="mt-1">
          <SearchSelect<Sale>
            placeholder="Search by sale number, customer, or vehicle…"
            selected={selected}
            onSelect={setSelected}
            fetchOptions={fetchSales}
            getId={(s) => s.id}
            getLabel={(s) => `${s.saleNumber} — ${s.customer.firstName} ${s.customer.lastName}`}
            getSubLabel={(s) => `${vehicleDisplayName(s.vehicle)} · ${formatCurrency(s.finalPrice)}`}
          />
        </div>
      </div>

      {selected && (
        <>
          <div>
            <label className="text-xs font-medium text-muted">Reference number (optional)</label>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. bank slip number"
              className={fieldClass()}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="mt-1 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Confirming…" : `Confirm ${formatCurrency(selected.finalPrice)} received`}
          </button>
        </>
      )}
    </div>
  );
}

function RentalPaymentForm({ onDone }: { onDone: (message: string) => void }) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<RentalTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function outstandingFor(r: RentalTarget): number {
    const paid = r.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return Math.max(0, Number(r.totalCost) - paid);
  }

  // No search param exists on GET /rentals yet (a small dataset by design
  // at this stage) — filters client-side, same tradeoff SearchSelect
  // already documents for its own defaults.
  async function fetchRentals(query: string): Promise<RentalTarget[]> {
    const res = await api.get<{ data: RentalTarget[] }>("/rentals?paymentStatus=PENDING&pageSize=50");
    const q = query.trim().toLowerCase();
    const matches = q
      ? res.data.filter(
          (r) =>
            r.rentalNumber.toLowerCase().includes(q) ||
            `${r.customer.firstName} ${r.customer.lastName}`.toLowerCase().includes(q) ||
            `${r.vehicle.make} ${r.vehicle.model}`.toLowerCase().includes(q)
        )
      : res.data;
    return matches.slice(0, 10);
  }

  function handleSelect(r: RentalTarget | null) {
    setSelected(r);
    setAmount(r ? String(outstandingFor(r)) : "");
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
      // If this installment brings the rental fully paid, finalize it and
      // issue the receipt in the same action rather than leaving a second
      // manual step — confirmRentalPayment only succeeds once the ledger
      // actually covers totalCost. GET /rentals/:id wraps its payload as
      // { rental: {...} }, same as every other single-resource GET here.
      const updated = await api.get<{ rental: RentalTarget }>(`/rentals/${selected.id}`);
      if (outstandingFor(updated.rental) <= 0) {
        await api.post(`/finance/rentals/${selected.id}/payment`, {});
      }
      onDone(`Payment recorded for ${selected.rentalNumber}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to record payment";
      setError(message);
      showToast(message, "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted">Rental with an outstanding balance</label>
        <div className="mt-1">
          <SearchSelect<RentalTarget>
            placeholder="Search by rental number, customer, or vehicle…"
            selected={selected}
            onSelect={handleSelect}
            fetchOptions={fetchRentals}
            getId={(r) => r.id}
            getLabel={(r) => `${r.rentalNumber} — ${r.customer.firstName} ${r.customer.lastName}`}
            getSubLabel={(r) => `${vehicleDisplayName(r.vehicle)} · Outstanding ${formatCurrency(outstandingFor(r))}`}
          />
        </div>
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted">Amount</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass()} />
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
  );
}

function FinancingPaymentForm({
  onDone,
  initialTarget,
}: {
  onDone: (message: string) => void;
  initialTarget?: FinancingTarget;
}) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<FinancingTarget | null>(initialTarget ?? null);
  const [amount, setAmount] = useState(initialTarget ? String(Number(initialTarget.outstandingBalance)) : "");
  const [method, setMethod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // listFinancingQuerySchema only accepts one status value, so an
  // APPROVED-or-ACTIVE loan search needs two calls merged — same
  // client-merge tradeoff as the rentals picker above.
  async function fetchFinancing(query: string): Promise<FinancingTarget[]> {
    const [approved, active] = await Promise.all([
      api.get<{ data: FinancingTarget[] }>("/finance/loans?status=APPROVED&pageSize=50"),
      api.get<{ data: FinancingTarget[] }>("/finance/loans?status=ACTIVE&pageSize=50"),
    ]);
    const all = [...approved.data, ...active.data];
    const q = query.trim().toLowerCase();
    const matches = q
      ? all.filter(
          (f) =>
            `${f.sale.customer.firstName} ${f.sale.customer.lastName}`.toLowerCase().includes(q) ||
            `${f.sale.vehicle.make} ${f.sale.vehicle.model}`.toLowerCase().includes(q)
        )
      : all;
    return matches.slice(0, 10);
  }

  function handleSelect(f: FinancingTarget | null) {
    setSelected(f);
    setAmount(f ? String(Number(f.outstandingBalance)) : "");
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
      await api.post("/finance/payments", {
        financingId: selected.id,
        amount: amt,
        paymentMethod: method || undefined,
        referenceNo: referenceNo || undefined,
      });
      onDone("Loan payment recorded");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to record payment";
      setError(message);
      showToast(message, "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted">Approved or active loan</label>
        <div className="mt-1">
          <SearchSelect<FinancingTarget>
            placeholder="Search by customer or vehicle…"
            selected={selected}
            onSelect={handleSelect}
            fetchOptions={fetchFinancing}
            getId={(f) => f.id}
            getLabel={(f) => `${f.sale.customer.firstName} ${f.sale.customer.lastName}`}
            getSubLabel={(f) => `${vehicleDisplayName(f.sale.vehicle)} · Outstanding ${formatCurrency(f.outstandingBalance)}`}
          />
        </div>
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted">Amount</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass()} />
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
  );
}

function ServicePaymentForm({ onDone }: { onDone: (message: string) => void }) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<ServiceJobTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function totalFor(j: ServiceJobTarget): number {
    return Number(j.serviceCost ?? 0) + Number(j.partsCost ?? 0) + Number(j.labourCost ?? 0);
  }

  async function fetchJobs(query: string): Promise<ServiceJobTarget[]> {
    const params = new URLSearchParams({ status: "COMPLETED", unbilled: "true", pageSize: "10" });
    if (query) params.set("search", query);
    const res = await api.get<{ data: ServiceJobTarget[] }>(`/service/jobs?${params.toString()}`);
    return res.data;
  }

  async function handleSubmit() {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post(`/finance/service/${selected.id}/payment`, {});
      onDone(`Payment confirmed for ${selected.jobNumber}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to confirm payment";
      setError(message);
      showToast(message, "error");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted">Completed job awaiting billing</label>
        <div className="mt-1">
          <SearchSelect<ServiceJobTarget>
            placeholder="Search by job number or vehicle…"
            selected={selected}
            onSelect={setSelected}
            fetchOptions={fetchJobs}
            getId={(j) => j.id}
            getLabel={(j) => `${j.jobNumber} — ${vehicleDisplayName(j.vehicle)}`}
            getSubLabel={(j) => formatCurrency(totalFor(j))}
          />
        </div>
      </div>

      {selected && (
        <>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="mt-1 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Confirming…" : `Confirm ${formatCurrency(totalFor(selected))} received`}
          </button>
        </>
      )}
    </div>
  );
}
