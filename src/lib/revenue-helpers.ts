import type { TransactionStatus, TransactionType } from "../types/revenue";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  SALE: "Sale",
  RENTAL: "Rental",
  FINANCING_PAYMENT: "Loan Payment",
  SERVICE: "Service",
};

// Receipts in this app are only ever created already-ISSUED (no draft or
// cancel-receipt flow exists yet), so this always renders "Paid" in
// practice — the other two labels are here for completeness, not dead code.
export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  ISSUED: "Paid",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Card",
  UNSPECIFIED: "Unspecified",
};

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

// Fixed, distinct palette for the revenue-by-category charts — independent
// of the per-role theme colors (role-theme.ts), since this page's charts
// need four colors that stay meaningful regardless of which role's accent
// is currently active.
export const CATEGORY_COLORS: Record<string, string> = {
  Sales: "#2F6FE4",
  Rentals: "#7C3AED",
  Service: "#EA580C",
  Financing: "#0EA5E9",
};

export const METHOD_COLORS: Record<string, string> = {
  BANK_TRANSFER: "#2F6FE4",
  MOBILE_MONEY: "#F59E0B",
  CASH: "#2E7D32",
  CARD: "#DB2777",
  UNSPECIFIED: "#94A3B8",
};
