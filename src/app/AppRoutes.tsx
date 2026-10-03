import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ComingSoon } from "../components/ComingSoon";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import { NAV_BY_ROLE } from "../lib/nav-config";
import { AddRentalPage } from "../pages/AddRentalPage";
import { AuditLogsPage } from "../pages/AuditLogsPage";
import { AvailableRentalsPage } from "../pages/AvailableRentalsPage";
import { AvailableVehiclesPage } from "../pages/AvailableVehiclesPage";
import { CommissionPage } from "../pages/CommissionPage";
import { CustomerFormPage } from "../pages/CustomerFormPage";
import { CustomersPage } from "../pages/CustomersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { FollowupsPage } from "../pages/FollowupsPage";
import { MyCustomersPage } from "../pages/MyCustomersPage";
import { MyRentalsPage } from "../pages/MyRentalsPage";
import { MySalesPage } from "../pages/MySalesPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { FinanceReportsPage } from "../pages/FinanceReportsPage";
import { FinancingApplicationsPage } from "../pages/FinancingApplicationsPage";
import { FinancingPage } from "../pages/FinancingPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { InventoryPage } from "../pages/InventoryPage";
import { LoginPage } from "../pages/LoginPage";
import { MaintenanceSchedulePage } from "../pages/MaintenanceSchedulePage";
import { MechanicReportsPage } from "../pages/MechanicReportsPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { PartsRequestsPage } from "../pages/PartsRequestsPage";
import { PaymentsReceiptsPage } from "../pages/PaymentsReceiptsPage";
import { PaymentsRevenuePage } from "../pages/PaymentsRevenuePage";
import { ProfilePage } from "../pages/ProfilePage";
import { RentalsPage } from "../pages/RentalsPage";
import { RentalCustomersPage } from "../pages/RentalCustomersPage";
import { RentalPaymentsPage } from "../pages/RentalPaymentsPage";
import { RepaymentsPage } from "../pages/RepaymentsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SaleFormPage } from "../pages/SaleFormPage";
import { SalesPage } from "../pages/SalesPage";
import { ServiceHistoryPage } from "../pages/ServiceHistoryPage";
import { ServiceJobsPage } from "../pages/ServiceJobsPage";
import { ServicePage } from "../pages/ServicePage";
import { SettingsPage } from "../pages/SettingsPage";
import { TransfersPage } from "../pages/TransfersPage";
import { VehicleFormPage } from "../pages/VehicleFormPage";
import type { RoleCode } from "../types";

// Paths whose built screen is the same component for every role (the
// component itself dispatches on role internally, e.g. DashboardPage).
const SHARED_BUILT_SCREENS: Record<string, ReactElement> = {
  "/dashboard": <DashboardPage />,
  // Also present as an unconditional route below (every role can reach it
  // via the Topbar bell even without a sidebar entry) — listed here too so
  // a role that DOES list it in NAV_BY_ROLE (Sales) resolves to the real
  // page instead of falling through resolveScreen() to ComingSoon.
  "/notifications": <NotificationsPage />,
  // Shared by Sales and Rental Salesperson — FollowupsPage dispatches
  // on role internally (subtitle copy, the Rental Ref column, which
  // picker AddFollowupModal shows) now that Followup RBAC covers both.
  "/follow-ups": <FollowupsPage />,
};

// Paths that collide across roles but mean different screens per role
// (e.g. "/sales" is Admin's oversight table AND the Sales role's own "My
// Sales" list) — keyed by role first so building one role's screen can
// never leak into another role that happens to reuse the same path.
const ROLE_BUILT_SCREENS: Partial<Record<RoleCode, Record<string, ReactElement>>> = {
  ADMIN: {
    "/inventory": <InventoryPage />,
    "/sales": <SalesPage />,
    "/customers": <CustomersPage />,
    "/service": <ServicePage />,
    "/payments-revenue": <PaymentsRevenuePage />,
    "/rentals": <RentalsPage />,
    "/financing": <FinancingPage />,
    "/transfers": <TransfersPage />,
    "/employees": <EmployeesPage />,
    "/reports": <ReportsPage />,
    "/settings": <SettingsPage />,
    "/audit-logs": <AuditLogsPage />,
  },
  SALES_SALESPERSON: {
    "/vehicles": <AvailableVehiclesPage />,
    "/sales": <MySalesPage />,
    "/customers": <MyCustomersPage />,
    "/commission": <CommissionPage />,
  },
  RENTAL_SALESPERSON: {
    "/rental-vehicles": <AvailableRentalsPage />,
    "/rentals": <MyRentalsPage />,
    "/customers": <RentalCustomersPage />,
    "/rentals/new": <AddRentalPage />,
    "/rental-payments": <RentalPaymentsPage />,
  },
  FINANCE_MANAGER: {
    "/financing": <FinancingApplicationsPage />,
    "/payments-receipts": <PaymentsReceiptsPage />,
    "/repayments": <RepaymentsPage />,
    "/reports": <FinanceReportsPage />,
  },
  MECHANIC: {
    "/jobs": <ServiceJobsPage />,
    "/maintenance-schedule": <MaintenanceSchedulePage />,
    "/parts-requests": <PartsRequestsPage />,
    "/service-history": <ServiceHistoryPage />,
    "/reports": <MechanicReportsPage />,
  },
};

function resolveScreen(role: RoleCode, path: string, label: string): ReactElement {
  return SHARED_BUILT_SCREENS[path] ?? ROLE_BUILT_SCREENS[role]?.[path] ?? <ComingSoon screen={label} />;
}

function RoleRoutes() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_BY_ROLE[user.role].map((item) => (
          <Route key={item.path} path={item.path} element={resolveScreen(user.role, item.path, item.label)} />
        ))}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/customers/new" element={<CustomerFormPage />} />
        <Route path="/customers/:customerId/edit" element={<CustomerFormPage />} />
        <Route path="/inventory/new" element={<VehicleFormPage />} />
        <Route path="/inventory/:vehicleId/edit" element={<VehicleFormPage />} />
        <Route path="/sales/new" element={<SaleFormPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/*" element={<RoleRoutes />} />
      </Route>
    </Routes>
  );
}
