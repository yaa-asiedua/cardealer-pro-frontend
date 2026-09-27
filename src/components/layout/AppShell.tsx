import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBusinessSettings } from "../../context/BusinessSettingsContext";
import { NAV_BY_ROLE } from "../../lib/nav-config";
import { applyRoleTheme, resetRoleTheme } from "../../lib/role-theme";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const SHARED_TITLES: Record<string, string> = {
  "/profile": "Profile",
  "/notifications": "Notifications",
  "/customers/new": "Add Customer",
  "/inventory/new": "Add Vehicle",
  "/sales/new": "Add New Sale",
};

function resolveSharedTitle(pathname: string): string | undefined {
  if (SHARED_TITLES[pathname]) return SHARED_TITLES[pathname];
  if (/^\/customers\/[^/]+\/edit$/.test(pathname)) return "Edit Customer";
  if (/^\/inventory\/[^/]+\/edit$/.test(pathname)) return "Edit Vehicle";
  return undefined;
}

export function AppShell() {
  const { user } = useAuth();
  const { logoUrl } = useBusinessSettings();
  const location = useLocation();
  const role = user?.role;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (role) applyRoleTheme(role);
    return resetRoleTheme;
  }, [role]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const navItem = NAV_BY_ROLE[user.role].find((item) => item.path === location.pathname);
  const title = navItem?.label ?? resolveSharedTitle(location.pathname) ?? "CARDEALER PRO";

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar role={user.role} logoUrl={logoUrl} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
