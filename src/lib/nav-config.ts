import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Car,
  ClipboardList,
  FileClock,
  FileText,
  Gauge,
  Handshake,
  History,
  LayoutDashboard,
  ReceiptText,
  Repeat,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { RoleCode } from "../types";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

// Per-role screen inventory reconciled in the published "Design Spec
// Reconciliation" artifact (v1.1) against 03_App_Flow_Document.docx §9.
// "New Sale" / "New Rental" are actions reached from Available
// Vehicles/Rental Vehicles, not standalone nav items — same for rental
// deposit capture, which lives inside the New Rental flow per that
// artifact's note on the "Payments" nav item.
export const NAV_BY_ROLE: Record<RoleCode, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Inventory", path: "/inventory", icon: Car },
    { label: "Sales", path: "/sales", icon: Handshake },
    { label: "Customers", path: "/customers", icon: Users },
    { label: "Rentals", path: "/rentals", icon: Repeat },
    { label: "Service Center", path: "/service", icon: Wrench },
    // Distinct from Finance's future "/payments" (an incoming-payments
    // action queue) — this is Admin's own revenue analytics dashboard.
    { label: "Payments & Revenue", path: "/payments-revenue", icon: Wallet },
    { label: "Financing", path: "/financing", icon: BadgeDollarSign },
    { label: "Transfers", path: "/transfers", icon: FileClock },
    { label: "Employees", path: "/employees", icon: Users },
    { label: "Reports", path: "/reports", icon: FileText },
    { label: "Settings", path: "/settings", icon: Settings },
    { label: "Audit Logs", path: "/audit-logs", icon: ShieldAlert },
  ],
  SALES_SALESPERSON: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Available Vehicles", path: "/vehicles", icon: Car },
    { label: "My Sales", path: "/sales", icon: Handshake },
    { label: "My Customers", path: "/customers", icon: Users },
    { label: "Financing Requests", path: "/financing", icon: BadgeDollarSign },
    { label: "My Commission", path: "/commission", icon: Wallet },
  ],
  RENTAL_SALESPERSON: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Available Rental Vehicles", path: "/rental-vehicles", icon: Car },
    { label: "My Rentals", path: "/rentals", icon: Repeat },
    { label: "Active Rentals", path: "/active-rentals", icon: Gauge },
    { label: "Customers", path: "/customers", icon: Users },
    { label: "Rental Revenue", path: "/rental-revenue", icon: FileText },
  ],
  FINANCE_MANAGER: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Loans & Financing", path: "/financing", icon: BadgeDollarSign },
    { label: "Payments", path: "/payments", icon: Wallet },
    { label: "Receipts", path: "/receipts", icon: ReceiptText },
    { label: "Overdue Accounts", path: "/overdue", icon: ShieldAlert },
    { label: "Financial Reports", path: "/reports", icon: FileText },
  ],
  MECHANIC: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "My Jobs", path: "/jobs", icon: ClipboardList },
    { label: "Service Schedule", path: "/schedule", icon: FileClock },
    { label: "Service History", path: "/history", icon: History },
    { label: "Service Menu", path: "/service-menu", icon: Wrench },
  ],
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: "Admin",
  SALES_SALESPERSON: "Salesperson (Sales)",
  RENTAL_SALESPERSON: "Salesperson (Rentals)",
  FINANCE_MANAGER: "Finance Manager",
  MECHANIC: "Mechanic",
};

export const DEFAULT_ROUTE = "/dashboard";
