import type { SalePaymentStatus, SaleStatus } from "../types/sale";

// Real backend PaymentMethod enum values (CASH/BANK_TRANSFER/MOBILE_MONEY/
// CARD) — pair with paymentMethodLabel() from revenue-helpers.ts for
// display. Previously held human-readable-but-invalid values including a
// "Cheque" option with no backing enum member at all, which broke both the
// Sales filter (paymentMethod query param never matched anything) and the
// New Sale form's submit (an invalid enum value the backend would reject).
export const PAYMENT_METHOD_OPTIONS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD"] as const;

export const SALE_STATUS_STYLES: Record<SaleStatus, string> = {
  DRAFT: "bg-muted/10 text-muted",
  PENDING_FINANCE: "bg-warning/10 text-warning",
  COMPLETED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
  CANCELLED: "bg-muted/10 text-muted",
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: "Draft",
  PENDING_FINANCE: "Pending",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

// Mirrors the real Sale.paymentStatus enum exactly (PENDING/RECEIVED/
// REVERSED) — a sale has no partial-payment ledger like a Rental does, so
// there's no "Partial" state here.
export const SALE_PAYMENT_STATUS_STYLES: Record<SalePaymentStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  RECEIVED: "bg-success/10 text-success",
  REVERSED: "bg-danger/10 text-danger",
};

export const SALE_PAYMENT_STATUS_LABELS: Record<SalePaymentStatus, string> = {
  PENDING: "Pending",
  RECEIVED: "Paid",
  REVERSED: "Refunded",
};
