import type { RoleCode } from "./index";

export type VehicleStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "RENTED"
  | "SOLD"
  | "UNDER_MAINTENANCE"
  | "UNAVAILABLE"
  | "SOLD_DEAL_FAILED";

export interface AdminDashboard {
  role: "ADMIN";
  salesThisMonth: { count: number; revenue: number };
  rentalsActive: number;
  servicesInProgress: number;
  financeOutstanding: number;
  inventoryByStatus: Partial<Record<VehicleStatus, number>>;
  lowInventory: { availableCount: number; threshold: number; alert: boolean };
  staffByRole: Record<RoleCode, number>;
  pendingLoanApprovals: number;
  transfersPending: number;
  overduePayments: number;
}

export interface SalesDashboard {
  role: "SALES_SALESPERSON";
  mySalesThisMonth: { count: number; revenue: number };
  myCommission: { thisMonth: number; yearToDate: number };
  rank: number | null;
  activeCustomers: number;
  availableVehicles: number;
  leaderboard: { salespersonId: string; fullName: string; commission: number; rank: number }[];
}

export interface RentalsDashboard {
  role: "RENTAL_SALESPERSON";
  bookingsThisMonth: number;
  rentalRevenueThisMonth: number;
  availableRentalVehicles: number;
  activeRentals: number;
  returnsDue: number;
  gpsStatus: { active: number; ofActiveRentals: number };
}

export interface FinanceDashboard {
  role: "FINANCE_MANAGER";
  outstandingLoans: number;
  overduePayments: number;
  collectionsToday: number;
  collectionRatePercent: number;
  pendingApprovals: number;
}

export interface MechanicDashboard {
  role: "MECHANIC";
  pendingJobs: number;
  inProgressJobs: number;
  completedJobsTotal: number;
  monthlyPerformance: { jobCount: number; revenue: number };
}

export type Dashboard =
  | AdminDashboard
  | SalesDashboard
  | RentalsDashboard
  | FinanceDashboard
  | MechanicDashboard;
