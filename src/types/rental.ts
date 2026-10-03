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
  paymentRef: string;
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
  discount: string;
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
  discount?: number;
  depositAmount?: number;
  gpsEnabled?: boolean;
  gpsProvider?: string;
  notes?: string;
}

// GET /api/rentals/payments — distinct from Rental.payments above (which
// only ever carries { amount } for the lighter-weight outstanding-balance
// calc). Each row here is one real received-payment transaction, with
// enough of its parent rental/customer/vehicle to render without a
// second fetch.
export interface RentalPaymentListRow extends RentalPayment {
  rental: {
    id: string;
    rentalNumber: string;
    customer: Pick<Customer, "id" | "firstName" | "lastName" | "phone" | "email" | "profilePhotoUrl">;
    vehicle: Pick<Vehicle, "id" | "make" | "model" | "year" | "registrationNo" | "stockNumber" | "images">;
  };
}

export interface RentalPaymentListResult {
  data: RentalPaymentListRow[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
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
