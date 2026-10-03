import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { ServiceJob } from "../../types/service";

// First real "create" side of the Parts Request workflow — Admin's own
// Service Center only ever reviews (approve/reject/fulfill); a Mechanic
// is the one who actually requests parts, mid-job, per README.md's
// PartRequest lifecycle. Always tied to a specific job (no standalone/
// general stock requests), so this only ever opens from a job already in
// context (the Service Jobs page's selected job), never as a bare action.
export function RequestPartsModal({
  job,
  onClose,
  onRequested,
}: {
  job: ServiceJob;
  onClose: () => void;
  onRequested: () => void;
}) {
  const { showToast } = useToast();
  const [partName, setPartName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partName.trim()) return setError("Enter the part or item name");
    if (!(Number(quantity) > 0)) return setError("Quantity must be greater than zero");

    setIsSubmitting(true);
    try {
      await api.post("/service/parts-requests", {
        serviceJobId: job.id,
        partName: partName.trim(),
        quantity: Number(quantity),
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
        notes: notes.trim() || undefined,
      });
      showToast("Parts request submitted");
      onRequested();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to submit parts request";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Request Parts</h2>
            <p className="text-xs text-muted">
              {job.jobNumber} · {vehicleDisplayName(job.vehicle)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-ink">
              Part / Item <span className="text-danger">*</span>
            </label>
            <input
              required
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="e.g. Brake pads (front)"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-ink">
                Quantity <span className="text-danger">*</span>
              </span>
              <input
                required
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-ink">Est. Cost (GHS, optional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
              />
            </label>
          </div>

          <div className="mb-5">
            <label className="mb-1 block text-xs font-medium text-ink">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this part is needed…"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          </div>

          <div className="flex justify-end gap-2">
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
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
