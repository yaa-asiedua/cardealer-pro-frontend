import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { api, ApiError } from "../lib/api-client";
import { AdminDashboard } from "./dashboard/AdminDashboard";
import { FinanceDashboard } from "./dashboard/FinanceDashboard";
import { MechanicDashboard } from "./dashboard/MechanicDashboard";
import { RentalsDashboard } from "./dashboard/RentalsDashboard";
import { SalesDashboard } from "./dashboard/SalesDashboard";
import type { Dashboard } from "../types/dashboard";

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api
      .get<{ dashboard: Dashboard }>("/dashboard")
      .then((res) => {
        if (!cancelled) setDashboard(res.dashboard);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-action" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
        <AlertCircle size={24} className="text-danger" />
        <p className="text-sm text-ink">{error ?? "Failed to load dashboard"}</p>
      </div>
    );
  }

  switch (dashboard.role) {
    case "ADMIN":
      return <AdminDashboard data={dashboard} />;
    case "SALES_SALESPERSON":
      return <SalesDashboard data={dashboard} />;
    case "RENTAL_SALESPERSON":
      return <RentalsDashboard data={dashboard} />;
    case "FINANCE_MANAGER":
      return <FinanceDashboard data={dashboard} />;
    case "MECHANIC":
      return <MechanicDashboard data={dashboard} />;
  }
}
