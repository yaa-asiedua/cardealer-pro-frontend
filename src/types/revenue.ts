export interface RevenueCategoryBreakdown {
  category: "Sales" | "Rentals" | "Service" | "Financing";
  amount: number;
  percent: number;
}

export interface RevenueMethodBreakdown {
  method: string;
  amount: number;
  percent: number;
}

export interface RevenueSeriesPoint {
  date: string;
  sales: number;
  rentals: number;
  service: number;
  financing: number;
}

export interface RevenueOverview {
  period: { dateFrom: string; dateTo: string };
  totals: { sales: number; rentals: number; service: number; financing: number; total: number };
  totalMomPercent: number | null;
  byCategory: RevenueCategoryBreakdown[];
  byMethod: RevenueMethodBreakdown[];
  series: RevenueSeriesPoint[];
  outstandingBalance: number;
  overdueAmount: number;
}

export type TransactionType = "SALE" | "RENTAL" | "FINANCING_PAYMENT" | "SERVICE";
export type TransactionStatus = "DRAFT" | "ISSUED" | "CANCELLED";

export interface RevenueTransaction {
  id: string;
  receiptNumber: string;
  // The underlying transaction's own reference number (saleNumber/
  // rentalNumber/financingNumber/jobNumber) — distinct from receiptNumber.
  reference: string | null;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  date: string;
  customerName: string | null;
  customerPhone: string | null;
  vehicle: string | null;
  description: string | null;
  paymentMethod: string | null;
  issuedBy: string;
}

export interface RevenueTransactionListResult {
  data: RevenueTransaction[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}
