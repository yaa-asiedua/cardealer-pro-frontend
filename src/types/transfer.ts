import type { Customer } from "./customer";
import type { Vehicle } from "./vehicle";

export type TransferStatus = "PENDING" | "SUBMITTED_TO_REGISTRY" | "COMPLETED";

export interface Transfer {
  id: string;
  saleId: string;
  customerId: string;
  vehicleId: string;
  status: TransferStatus;
  oldLogbookCollectedAt: string | null;
  submittedToRegistryAt: string | null;
  completedAt: string | null;
  registryReference: string | null;
  feeAmount: string | null;
  notes: string | null;
  handledBy: string;
  createdAt: string;
  updatedAt: string;
  sale: { id: string; saleNumber: string };
  customer: Customer;
  vehicle: Vehicle;
}

export interface TransferListResult {
  data: Transfer[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}
