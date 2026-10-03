import type { Rental, RentalStatus } from "../types/rental";

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

// Row-level effective status for list/table displays — like OVERDUE,
// DUE_TODAY is never stored (rentalStatus stays ACTIVE), just computed
// from endDate the same way listRentals' dueToday/overdue query flags
// are computed server-side (rental.service.ts).
export type RentalRowStatus = RentalStatus | "DUE_TODAY";

export const RENTAL_ROW_STATUS_LABELS: Record<RentalRowStatus, string> = {
  ...RENTAL_STATUS_LABELS,
  DUE_TODAY: "Due Today",
};

export const RENTAL_ROW_STATUS_STYLES: Record<RentalRowStatus, string> = {
  ...RENTAL_STATUS_STYLES,
  DUE_TODAY: "bg-warning/10 text-warning",
};

export function rentalRowStatus(rental: Pick<Rental, "rentalStatus" | "endDate">): RentalRowStatus {
  if (rental.rentalStatus !== "ACTIVE") return rental.rentalStatus;

  const end = new Date(rental.endDate);
  const now = new Date();
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (endDay < today) return "OVERDUE";
  if (endDay === today) return "DUE_TODAY";
  return "ACTIVE";
}

export function daysOverdue(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.max(1, Math.round((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24)));
}
