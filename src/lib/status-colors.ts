import type { VehicleStatus } from "../types/dashboard";

// Stays within the locked Design Brief §2 palette (no colors outside the
// five named tokens) — UNDER_MAINTENANCE reuses Warning Orange at reduced
// opacity to stay visually distinct from Reserved on the same chart.
export const VEHICLE_STATUS_COLORS: Record<VehicleStatus, string> = {
  AVAILABLE: "#2E7D32",
  RESERVED: "#E67E22",
  RENTED: "#2F6690",
  SOLD: "#17324D",
  UNDER_MAINTENANCE: "rgba(230, 126, 34, 0.55)",
  UNAVAILABLE: "#6B7280",
  SOLD_DEAL_FAILED: "#C0392B",
};
