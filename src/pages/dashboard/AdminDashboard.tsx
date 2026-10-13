import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { Boxes, Handshake, Landmark, Repeat, Users, Wrench } from "lucide-react";
import { AlertBanner } from "../../components/dashboard/AlertBanner";
import { AnomalyFlags } from "../../components/dashboard/AnomalyFlags";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { useChartTheme } from "../../lib/chart-theme";
import { formatCurrencyCompact, formatEnumLabel } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/nav-config";
import { VEHICLE_STATUS_COLORS } from "../../lib/status-colors";
import type { AdminDashboard as AdminDashboardData, VehicleStatus } from "../../types/dashboard";

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const { gridStroke, tickFill } = useChartTheme();
  const alerts = [
    data.pendingLoanApprovals > 0 && {
      label: `${data.pendingLoanApprovals} loan approval${data.pendingLoanApprovals === 1 ? "" : "s"} pending`,
      path: "/financing",
    },
    data.transfersPending > 0 && {
      label: `${data.transfersPending} ownership transfer${data.transfersPending === 1 ? "" : "s"} pending`,
      path: "/transfers",
    },
    data.overduePayments > 0 && {
      label: `${data.overduePayments} overdue payment${data.overduePayments === 1 ? "" : "s"}`,
      path: "/financing",
    },
    data.lowInventory.alert && {
      label: `Low inventory: only ${data.lowInventory.availableCount} vehicle${data.lowInventory.availableCount === 1 ? "" : "s"} available`,
      path: "/inventory",
    },
  ].filter((a): a is { label: string; path: string } => !!a);

  const inventoryChartData = (Object.entries(data.inventoryByStatus) as [VehicleStatus, number][]).map(
    ([status, count]) => ({ status: formatEnumLabel(status), count, fill: VEHICLE_STATUS_COLORS[status] })
  );

  const staffChartData = Object.entries(data.staffByRole).map(([role, count]) => ({
    role: ROLE_LABELS[role as keyof typeof ROLE_LABELS],
    count,
  }));

  const totalStaff = Object.values(data.staffByRole).reduce((sum, n) => sum + n, 0);
  const totalVehicles = Object.values(data.inventoryByStatus).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <div>
      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Sales this month"
          value={formatCurrencyCompact(data.salesThisMonth.revenue)}
          sublabel={`${data.salesThisMonth.count} sale${data.salesThisMonth.count === 1 ? "" : "s"}`}
          icon={Handshake}
        />
        <KpiCard label="Active rentals" value={String(data.rentalsActive)} icon={Repeat} />
        <KpiCard label="Services in progress" value={String(data.servicesInProgress)} icon={Wrench} />
        <KpiCard
          label="Finance outstanding"
          value={formatCurrencyCompact(data.financeOutstanding)}
          icon={Landmark}
          tone={data.financeOutstanding > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Vehicles available"
          value={String(data.lowInventory.availableCount)}
          sublabel={`of ${totalVehicles} total`}
          icon={Boxes}
          tone={data.lowInventory.alert ? "danger" : "success"}
        />
        <KpiCard label="Active staff" value={String(totalStaff)} icon={Users} />
      </div>

      <div className="mt-6">
        <AnomalyFlags />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Inventory by status">
          {inventoryChartData.length === 0 ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-1 text-center">
              <Boxes size={22} className="text-muted" />
              <p className="text-sm text-muted">No vehicles in inventory yet.</p>
              <Link to="/inventory" className="touch-target text-xs font-medium text-action hover:underline">
                Add a vehicle →
              </Link>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart accessibilityLayer data={inventoryChartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: tickFill }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: tickFill }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {inventoryChartData.map((entry) => (
                    <Cell key={entry.status} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Staff by role">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart accessibilityLayer data={staffChartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="role" tick={{ fontSize: 11, fill: tickFill }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: tickFill }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#2F6690" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
    </div>
  );
}
