import type { Customer } from "./customer";
import type { Vehicle } from "./vehicle";

export type RentalStatus = "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "OVERDUE";
export type RentalPaymentStatus = "PENDING" | "RECEIVED" | "REVERSED";

export interface RentalPayment {
  id: string;
  rentalId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNo: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface RentalSalesperson {
  id: string;
  fullName: string;
  username: string;
}

export interface Rental {
  id: string;
  rentalNumber: string;
  customerId: string;
  vehicleId: string;
  rentalSalespersonId: string;
  startDate: string;
  endDate: string;
  actualPickupAt: string | null;
  actualReturnAt: string | null;
  dailyRate: string;
  rentalDays: number;
  totalCost: string;
  depositAmount: string | null;
  paymentStatus: RentalPaymentStatus;
  rentalStatus: RentalStatus;
  gpsEnabled: boolean;
  gpsProvider: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  vehicle: Vehicle;
  rentalSalesperson?: RentalSalesperson;
  payments: RentalPayment[];
}

export interface RentalListResult {
  data: Rental[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface CreateRentalInput {
  customerId: string;
  vehicleId: string;
  rentalSalespersonId?: string;
  startDate: string;
  endDate: string;
  dailyRate?: number;
  depositAmount?: number;
  gpsEnabled?: boolean;
  gpsProvider?: string;
  notes?: string;
}

export interface RentalsReportRow {
  vehicleId: string;
  make: string;
  model: string;
  registrationNo: string | null;
  bookingCount: number;
  revenue: number;
}

export interface RentalsReport {
  totals: { bookingCount: number; revenue: number };
  byVehicle: RentalsReportRow[];
}

export function outstandingBalance(rental: Pick<Rental, "totalCost" | "payments">): number {
  const paid = rental.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return Math.max(0, Number(rental.totalCost) - paid);
}
