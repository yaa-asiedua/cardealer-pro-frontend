export type ReportType = "ALL" | "SALES" | "INVENTORY" | "RENTALS" | "SERVICE" | "FINANCING" | "REVENUE" | "CUSTOMERS" | "EMPLOYEES" | "TRANSFERS";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  ALL: "All Reports",
  SALES: "Sales",
  INVENTORY: "Inventory",
  RENTALS: "Rentals",
  SERVICE: "Service Center",
  FINANCING: "Financing",
  REVENUE: "Payments & Revenue",
  CUSTOMERS: "Customers",
  EMPLOYEES: "Employees",
  TRANSFERS: "Transfers",
};

// A fixed palette for charts whose category set isn't the fixed 4-value
// revenue breakdown (lib/revenue-helpers.ts's CATEGORY_COLORS) — e.g.
// vehicle types, which vary by whatever's actually in inventory.
export const CHART_PALETTE = ["#2F6FE4", "#2E7D32", "#F59E0B", "#7C3AED", "#DB2777", "#0EA5E9", "#EA580C", "#94A3B8"];

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
