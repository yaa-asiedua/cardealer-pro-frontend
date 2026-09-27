import type { EmploymentStatus } from "../types/employee";

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On Leave",
  INACTIVE: "Inactive",
};

export const EMPLOYMENT_STATUS_STYLES: Record<EmploymentStatus, string> = {
  ACTIVE: "bg-success/10 text-success",
  ON_LEAVE: "bg-warning/10 text-warning",
  INACTIVE: "bg-danger/10 text-danger",
};

// Free-text on the backend (User.department), but a fixed list keeps data
// entry consistent — same tradeoff as Inventory's Seats/Fuel/Transmission
// dropdowns (a "select one" list rather than open text for a field that
// really only takes a handful of real values in this dealership).
export const DEPARTMENT_OPTIONS = ["Management", "Sales", "Rentals", "Finance", "Service Center"];
