import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Bell,
  Car,
  CheckSquare,
  ClipboardList,
  FileClock,
  FileText,
  Handshake,
  History,
  LayoutDashboard,
  Plus,
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
  // "Financing Requests" was dropped from this role's nav: the /financing
  // API routes are ADMIN + FINANCE_MANAGER only (financing.routes.ts), so
  // there's no backend support today for a salesperson to view financing
  // requests tied to their own sales. Revisit if that's ever built out.
  SALES_SALESPERSON: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Available Vehicles", path: "/vehicles", icon: Car },
    { label: "My Sales", path: "/sales", icon: Handshake },
    { label: "My Customers", path: "/customers", icon: Users },
    { label: "My Commission", path: "/commission", icon: Wallet },
    { label: "Follow-ups", path: "/follow-ups", icon: CheckSquare },
    { label: "Notifications", path: "/notifications", icon: Bell },
  ],
  // Replaced earlier guessed items ("Active Rentals", "Rental Revenue")
  // with the real IA confirmed by rentals_pages/dashboard.jpeg's own
  // sidebar. "Settings" is in that mockup too but deliberately left out,
  // same as Sales — real self-service lives in Profile, reachable from
  // the topbar, not a sidebar page.
  RENTAL_SALESPERSON: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Available Rentals", path: "/rental-vehicles", icon: Car },
    { label: "My Rentals", path: "/rentals", icon: Repeat },
    { label: "Customers", path: "/customers", icon: Users },
    // Unlike Sales' "Add New Sale" (reached only via Quick Action buttons,
    // never in its own nav), this mockup's sidebar puts Add Rental here
    // directly — kept that way rather than flattening it to match Sales'
    // pattern, since it's what the mockup actually shows.
    { label: "Add Rental", path: "/rentals/new", icon: Plus },
    { label: "Rental Payments", path: "/rental-payments", icon: Wallet },
    { label: "Follow-ups", path: "/follow-ups", icon: CheckSquare },
    { label: "Notifications", path: "/notifications", icon: Bell },
  ],
  // Replaced earlier guessed items with the real IA confirmed by
  // finance_pages/dashboard.jpeg's own sidebar: "Payments"/"Receipts"
  // merge into one "Payments & Receipts" item, "Overdue Accounts" folds
  // into the new "Repayments" item instead of standing alone, and
  // "Financial Reports" shortens to "Reports". "Settings" is in that
  // mockup too but deliberately left out, same call as Sales/Rental —
  // real self-service lives in Profile, reachable from the topbar.
  FINANCE_MANAGER: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Financing", path: "/financing", icon: BadgeDollarSign },
    { label: "Payments & Receipts", path: "/payments-receipts", icon: Wallet },
    { label: "Repayments", path: "/repayments", icon: ReceiptText },
    { label: "Reports", path: "/reports", icon: FileText },
    { label: "Notifications", path: "/notifications", icon: Bell },
  ],
  // Replaced the earlier guessed items with the real IA confirmed by
  // mechanic_pages/dashboard.jpeg's own sidebar — with three drops, same
  // "verified against the schema, not assumed" treatment as every other
  // role: "Vehicle Inspections" (no distinct entity — an inspection is
  // just a ServiceJob whose type happens to be Engine/Suspension Check),
  // "Work Orders" (same ServiceJob entity as "Service Jobs", nothing
  // distinguishes the two here), and "Settings" (same call as every
  // other role — real self-service lives in Profile).
  MECHANIC: [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Service Jobs", path: "/jobs", icon: ClipboardList },
    { label: "Maintenance Schedule", path: "/maintenance-schedule", icon: FileClock },
    { label: "Parts Requests", path: "/parts-requests", icon: Wrench },
    { label: "Service History", path: "/service-history", icon: History },
    { label: "Reports", path: "/reports", icon: FileText },
    { label: "Notifications", path: "/notifications", icon: Bell },
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
