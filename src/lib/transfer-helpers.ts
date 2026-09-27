import type { TransferStatus } from "../types/transfer";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING: "Pending",
  SUBMITTED_TO_REGISTRY: "Submitted to Registry",
  COMPLETED: "Completed",
};

export const TRANSFER_STATUS_STYLES: Record<TransferStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  SUBMITTED_TO_REGISTRY: "bg-action/10 text-action",
  COMPLETED: "bg-success/10 text-success",
};
