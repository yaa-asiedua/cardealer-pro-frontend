import type { RentalStatus } from "../types/rental";

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Upcoming",
  ACTIVE: "Active",
  COMPLETED: "Returned",
  CANCELLED: "Cancelled",
  OVERDUE: "Overdue",
};

export const RENTAL_STATUS_STYLES: Record<RentalStatus, string> = {
  PENDING: "bg-muted/10 text-muted",
  CONFIRMED: "bg-action/10 text-action",
  ACTIVE: "bg-success/10 text-success",
  COMPLETED: "bg-primary/10 text-primary",
  CANCELLED: "bg-danger/10 text-danger",
  OVERDUE: "bg-danger/10 text-danger",
};
