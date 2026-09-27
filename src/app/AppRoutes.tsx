import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ComingSoon } from "../components/ComingSoon";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import { NAV_BY_ROLE } from "../lib/nav-config";
import { CustomerFormPage } from "../pages/CustomerFormPage";
import { CustomersPage } from "../pages/CustomersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { FinancingPage } from "../pages/FinancingPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { InventoryPage } from "../pages/InventoryPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { PaymentsRevenuePage } from "../pages/PaymentsRevenuePage";
import { ProfilePage } from "../pages/ProfilePage";
import { RentalsPage } from "../pages/RentalsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SaleFormPage } from "../pages/SaleFormPage";
import { SalesPage } from "../pages/SalesPage";
import { ServicePage } from "../pages/ServicePage";
import { SettingsPage } from "../pages/SettingsPage";
import { TransfersPage } from "../pages/TransfersPage";
import { VehicleFormPage } from "../pages/VehicleFormPage";
import type { RoleCode } from "../types";

// Paths whose built screen is the same component for every role (the
// component itself dispatches on role internally, e.g. DashboardPage).
const SHARED_BUILT_SCREENS: Record<string, ReactElement> = {
  "/dashboard": <DashboardPage />,
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
