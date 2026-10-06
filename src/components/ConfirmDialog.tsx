import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { ModalOverlay } from "./ModalOverlay";

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  extraContent?: ReactNode;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

// Design Brief §5 "Confirmation Dialog": explain impact before an
// irreversible or status-changing action.
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  extraContent,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      showToast(message, "error");
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={isSubmitting ? undefined : onCancel}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <div className="mt-1 text-sm text-muted">{description}</div>
          </div>
        </div>

        {extraContent && <div className="mt-4">{extraContent}</div>}

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
              danger ? "bg-danger hover:bg-danger/90" : "bg-action hover:bg-primary"
            }`}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
