import type { Vehicle, VehiclePurpose, VehicleStatus } from "../types/vehicle";

// Mirrors cardealer-pro-backend/src/modules/vehicles/vehicle-status.service.ts
// VALID_TRANSITIONS exactly — kept here so the status-change menu only ever
// offers a transition the backend will actually accept. If the backend map
// changes, update this too.
export const VALID_VEHICLE_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  AVAILABLE: ["RESERVED", "RENTED", "SOLD", "UNDER_MAINTENANCE", "UNAVAILABLE"],
  RESERVED: ["AVAILABLE", "SOLD", "RENTED", "SOLD_DEAL_FAILED"],
  RENTED: ["AVAILABLE"],
  SOLD: [],
  UNDER_MAINTENANCE: ["AVAILABLE", "UNAVAILABLE"],
  UNAVAILABLE: ["AVAILABLE"],
  SOLD_DEAL_FAILED: ["AVAILABLE", "RESERVED"],
};

// Not a stored field — derived the same way the backend's `purpose` list
// filter does (see vehicle.service.ts PURPOSE_FILTERS).
export function deriveVehiclePurpose(vehicle: Pick<Vehicle, "sellingPrice" | "rentalDailyRate">): VehiclePurpose | null {
  const hasSale = vehicle.sellingPrice !== null;
  const hasRental = vehicle.rentalDailyRate !== null;
  if (hasSale && hasRental) return "BOTH";
  if (hasSale) return "FOR_SALE";
  if (hasRental) return "FOR_RENT";
  return null;
}

export const PURPOSE_LABELS: Record<VehiclePurpose, string> = {
  FOR_SALE: "For Sale",
  FOR_RENT: "For Rent",
  BOTH: "For Both",
};

export function vehicleDisplayName(vehicle: Pick<Vehicle, "make" | "model" | "year">): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

// Registration is required unless the listing is sale-only — mirrors
// cardealer-pro-backend/src/modules/vehicles/vehicle.service.ts's
// assertRegistrationNoRequirement() exactly, so the form only shows/requires
// the field when the backend will actually require it.
export function registrationRequiredForPurpose(purpose: VehiclePurpose): boolean {
  return purpose !== "FOR_SALE";
}

// Free-text fields the user asked to become dropdowns — kept here as the
// single source of truth for the option lists.
export const SEAT_OPTIONS = [2, 4, 5, 6, 7, 8, 9, 12, 15];
export const TRANSMISSION_OPTIONS = ["Automatic", "Manual", "CVT", "Semi-Automatic"];
export const FUEL_TYPE_OPTIONS = ["Petrol", "Diesel", "Hybrid", "Electric", "LPG"];
