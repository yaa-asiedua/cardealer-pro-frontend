import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency } from "../../lib/format";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { ServiceJob, ServiceType } from "../../types/service";
import { ModalOverlay } from "../ModalOverlay";

interface CompletePartRow {
  partName: string;
  quantity: string;
  unitCost: string;
}

const EMPTY_PART_ROW: CompletePartRow = { partName: "", quantity: "1", unitCost: "" };

// Shared by Admin's Service Center and the Mechanic's own Service Jobs
// page — same completion form either way. Service cost isn't collected
// here — it's auto-filled server-side from the chosen Service Type's
// default price (PRD 4.6: "auto-filled from the controlled menu, not
// mechanic-editable"), matching completeServiceJob()'s own logic exactly.
// Only parts and labour are direct input.
export function CompleteServiceJobModal({
  job,
  onClose,
  onCompleted,
}: {
  job: ServiceJob;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { showToast } = useToast();
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState(job.serviceTypeId ?? "");
  const [labourCost, setLabourCost] = useState("");
  const [parts, setParts] = useState<CompletePartRow[]>([{ ...EMPTY_PART_ROW }]);
  const [notes, setNotes] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: ServiceType[] }>("/service-types")
      .then((res) => setServiceTypes(res.data.filter((t) => t.isActive)))
      .catch(() => setServiceTypes([]));
  }, []);

  function updatePart(index: number, patch: Partial<CompletePartRow>) {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPartRow() {
    setParts((prev) => [...prev, { ...EMPTY_PART_ROW }]);
  }

  function removePartRow(index: number) {
    setParts((prev) => prev.filter((_, i) => i !== index));
  }

  const validParts = useMemo(
    () => parts.filter((p) => p.partName.trim() && Number(p.quantity) > 0 && p.unitCost !== ""),
    [parts]
  );
  const totalEstimatedCost = useMemo(
    () => validParts.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unitCost), 0) + (Number(labourCost) || 0),
    [validParts, labourCost]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!serviceTypeId) return setError("Select the service type performed");

    setIsSubmitting(true);
    try {
      await api.post(`/service/jobs/${job.id}/complete`, {
        serviceTypeId,
        labourCost: Number(labourCost) || 0,
        parts: validParts.map((p) => ({ partName: p.partName.trim(), quantity: Number(p.quantity), unitCost: Number(p.unitCost) })),
        notes: notes.trim() || undefined,
        nextServiceDate: nextServiceDate || undefined,
      });
      onCompleted();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to complete job";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Complete Service Job</h2>
            <p className="text-xs text-muted">
              {job.jobNumber} · {vehicleDisplayName(job.vehicle)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-ink">
                Service Type <span className="text-danger">*</span>
              </label>
              <select
                required
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              >
                <option value="">Select the service performed…</option>
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.defaultPrice ? ` (${formatCurrency(t.defaultPrice)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ink">Parts Used (optional)</span>
                <button
                  type="button"
                  onClick={addPartRow}
                  className="flex items-center gap-1 text-xs font-medium text-action hover:underline"
                >
                  <Plus size={12} /> Add part
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {parts.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_90px_90px_auto] items-center gap-2">
                    <input
                      placeholder="Part / item name"
                      value={p.partName}
                      onChange={(e) => updatePart(i, { partName: e.target.value })}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                    />
                    <input
                      type="number" inputMode="numeric"
                      min={1}
                      placeholder="Qty"
                      value={p.quantity}
                      onChange={(e) => updatePart(i, { quantity: e.target.value })}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                    />
                    <input
                      type="number" inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="Unit (GHS)"
                      value={p.unitCost}
                      onChange={(e) => updatePart(i, { unitCost: e.target.value })}
                      className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                    />
                    <div className="rounded-lg bg-surface px-2 py-1.5 text-right text-xs text-ink">
                      {formatCurrency((Number(p.quantity) || 0) * (Number(p.unitCost) || 0))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePartRow(i)}
                      disabled={parts.length === 1}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Remove part"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink">Labour Cost (GHS)</span>
                <input
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={labourCost}
                  onChange={(e) => setLabourCost(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-ink">Next Service Date (optional)</span>
                <input
                  type="date"
                  value={nextServiceDate}
                  onChange={(e) => setNextServiceDate(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
                />
              </label>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-ink">Notes (optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details about the work done…"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
              <span className="text-muted">Total Estimated Cost (parts + labour)</span>
              <span className="font-semibold text-ink">{formatCurrency(totalEstimatedCost)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Service cost is auto-filled from the selected service type's price.</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Complete Job
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
