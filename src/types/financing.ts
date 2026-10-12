import type { Sale } from "./sale";

export type FinancingStatus = "PENDING" | "APPROVED" | "ACTIVE" | "REJECTED" | "COMPLETED" | "DEFAULTED";

export interface FinancingPaymentRecord {
  id: string;
  financingId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNo: string | null;
  notes: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface Financing {
  id: string;
  financingNumber: string;
  saleId: string;
  customerId: string;
  principalAmount: string;
  interestRate: string;
  termMonths: number;
  monthlyPayment: string;
  status: FinancingStatus;
  applicationDate: string;
  decisionDate: string | null;
  rejectionReason: string | null;
  firstPaymentDue: string | null;
  // How far behind the customer is (server-computed from the repayment
  // schedule and payments): 0 when up to date.
  arrears?: { instalmentsDue: number; expectedPaid: number; paid: number; amount: number; missedInstalments: number };
  outstandingBalance: string;
  createdAt: string;
  updatedAt: string;
  sale: Sale;
  payments: FinancingPaymentRecord[];
}

export interface FinancingListResult {
  data: Financing[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface FinancingReport {
  loanCount: number;
  totalPrincipal: number;
  outstandingLoans: number;
  collectionRatePercent: number;
}

export function paidSoFar(financing: Pick<Financing, "payments">): number {
  return financing.payments.reduce((sum, p) => sum + Number(p.amount), 0);
}
