import type { Customer } from "./customer";
import type { Vehicle } from "./vehicle";

export type SaleStatus = "DRAFT" | "PENDING_FINANCE" | "COMPLETED" | "FAILED" | "CANCELLED";
export type SalePaymentStatus = "PENDING" | "RECEIVED" | "REVERSED";
export type FinancingStatus = "PENDING" | "APPROVED" | "REJECTED" | "ACTIVE" | "COMPLETED";
export type TransferStatus = "PENDING" | "SUBMITTED_TO_REGISTRY" | "COMPLETED";

export interface SaleFinancing {
  id: string;
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
  outstandingBalance: string;
}

export interface SaleOwnershipTransfer {
  id: string;
  saleId: string;
  status: TransferStatus;
  registryReference: string | null;
  completedAt: string | null;
}

export interface SaleSalesperson {
  id: string;
  fullName: string;
  username: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  customerId: string;
  salespersonId: string;
  vehicleId: string;
  saleDate: string;
  sellingPrice: string;
  discount: string;
  finalPrice: string;
  paymentMethod: string | null;
  paymentStatus: SalePaymentStatus;
  saleStatus: SaleStatus;
  commissionRate: string;
  commissionAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  vehicle: Vehicle;
  salesperson: SaleSalesperson;
  financing?: SaleFinancing | null;
  tradeIn?: TradeIn | null;
  // Most recent SALE-type receipt only (see sale.service.ts's listSales
  // include) — empty until confirmSalePayment has actually run.
  receipts?: { issuedAt: string }[];
  ownershipTransfer?: SaleOwnershipTransfer | null;
}

export interface SaleListResult {
  data: Sale[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface CreateSaleFinancingInput {
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  monthlyPayment: number;
  firstPaymentDue?: string;
}

export interface TradeIn {
  id: string;
  saleId: string;
  make: string;
  model: string;
  year: number;
  vehicleType: string | null;
  transmission: string | null;
  fuelType: string | null;
  tradeInValue: string;
  outstandingLoan: string;
  createdAt: string;
}

export interface CreateSaleTradeInInput {
  make: string;
  model: string;
  year: number;
  vehicleType?: string;
  transmission?: string;
  fuelType?: string;
  tradeInValue: number;
  outstandingLoan?: number;
}

export interface CreateSaleInput {
  customerId: string;
  vehicleId: string;
  salespersonId?: string;
  sellingPrice: number;
  discount?: number;
  paymentMethod?: string;
  notes?: string;
  financing?: CreateSaleFinancingInput;
  tradeIn?: CreateSaleTradeInInput;
}

export interface SalesReportRow {
  salespersonId: string;
  fullName: string;
  count: number;
  revenue: number;
  commission: number;
}

export interface SalesReport {
  totals: { count: number; revenue: number; commission: number };
  bySalesperson: SalesReportRow[];
  byVehicleType: { vehicleType: string; count: number; revenue: number }[];
}
