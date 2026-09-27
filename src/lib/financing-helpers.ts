import type { FinancingStatus } from "../types/financing";

export const FINANCING_STATUS_LABELS: Record<FinancingStatus, string> = {
  PENDING: "Pending Review",
  APPROVED: "Approved",
  ACTIVE: "Active",
  REJECTED: "Rejected",
  COMPLETED: "Closed",
  DEFAULTED: "Defaulted",
};

export const FINANCING_STATUS_STYLES: Record<FinancingStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  APPROVED: "bg-action/10 text-action",
  ACTIVE: "bg-success/10 text-success",
  REJECTED: "bg-danger/10 text-danger",
  COMPLETED: "bg-primary/10 text-primary",
  DEFAULTED: "bg-danger/10 text-danger",
};
