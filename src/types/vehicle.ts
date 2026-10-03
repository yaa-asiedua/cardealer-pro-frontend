import type { VehicleStatus } from "./dashboard";

export type { VehicleStatus };

export type VehiclePurpose = "FOR_SALE" | "FOR_RENT" | "BOTH";

export interface VehicleImage {
  id: string;
  vehicleId: string;
  fileUrl: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface VehicleStatusHistoryEntry {
  id: string;
  vehicleId: string;
  oldStatus: VehicleStatus | null;
  newStatus: VehicleStatus;
  reason: string | null;
  changedBy: string;
  changedAt: string;
}

export interface Vehicle {
  id: string;
  stockNumber: string;
  make: string;
  model: string;
  year: number;
  registrationNo: string | null;
  vin: string;
  engineNo: string | null;
  color: string | null;
  mileage: number | null;
  fuelType: string | null;
  transmission: string | null;
  engineCapacity: string | null;
  seats: number | null;
  vehicleType: string | null;
  purchasePrice: string | null;
  sellingPrice: string | null;
  rentalDailyRate: string | null;
  status: VehicleStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  images?: VehicleImage[];
  statusHistory?: VehicleStatusHistoryEntry[];
}

export interface VehicleListResult {
  data: Vehicle[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
  typeCounts?: Record<string, number>;
}

export interface VehicleFormValues {
  make: string;
  model: string;
  year: number;
  registrationNo: string;
  vin: string;
  engineNo: string;
  color: string;
  mileage: string;
  fuelType: string;
  transmission: string;
  engineCapacity: string;
  seats: string;
  vehicleType: string;
  purchasePrice: string;
  sellingPrice: string;
  rentalDailyRate: string;
  description: string;
  status: VehicleStatus;
  // Local-only UI state, not sent to the backend as its own field — drives
  // which price field(s) and whether Registration No. show, and which
  // price field gets explicitly nulled out on submit.
  purpose: VehiclePurpose;
}
