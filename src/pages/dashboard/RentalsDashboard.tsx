import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Car, CalendarClock, KeyRound, MapPin, Plus, UserPlus, Wallet } from "lucide-react";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { RentalDetailModal } from "../../components/rentals/RentalDetailModal";
import { RentalRowStatusBadge } from "../../components/rentals/RentalRowStatusBadge";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api-client";
import { useChartTheme } from "../../lib/chart-theme";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../../lib/format";
import { daysOverdue } from "../../lib/rental-helpers";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { customerDisplayName } from "../../types/customer";
import type { Rental, RentalListResult } from "../../types/rental";
import type { Vehicle, VehicleListResult } from "../../types/vehicle";
import type { RentalsDashboard as RentalsDashboardData } from "../../types/dashboard";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function percentChange(current: number, previous: number): string | undefined {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change vs last month";
  return `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}% vs last month`;
}

function CustomerCell({ rental }: { rental: Rental }) {
  const c = rental.customer;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action/10 text-xs font-semibold text-action">
        {c.profilePhotoUrl ? (
          <img src={c.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            {c.firstName[0]}
            {c.lastName[0]}
          </>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{customerDisplayName(c)}</div>
        {c.phone && <div className="text-xs text-muted">{c.phone}</div>}
      </div>
    </div>
  );
}

function VehicleCell({ rental }: { rental: Rental }) {
  const v = rental.vehicle;
  const image = v.images?.find((img) => img.isPrimary) ?? v.images?.[0];
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-muted">
        {image ? <img src={image.fileUrl} alt="" className="h-full w-full object-cover" /> : <Car size={14} />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm text-ink">{vehicleDisplayName(v)}</div>
        <div className="text-xs text-muted">{v.stockNumber}</div>
      </div>
    </div>
  );
}

const STATUS_COLORS = { available: "#16a34a", rented: "#2563eb" };

// Design Brief §6 "Rental Salesperson", reconciled against
// rentals_pages/dashboard.jpeg. KPIs/tables come from real, already-
// ownership-scoped endpoints (listRentals is scoped to the actor same as
// Sales) — nothing here is fabricated, but several mockup details aren't:
// rental end dates have no time component (@db.Date, see rentals/README),
// so table rows show a date only, not the mockup's invented return times;
// customer avatars use the real profilePhotoUrl field (same as
// MyCustomersPage), falling back to initials when none is on file; and
// the per-row "···" menu is a real "View" button opening
// RentalDetailModal instead of an unbuilt actions menu. The mockup's donut
// also double-counted Due Today/Overdue as slices alongside Rented (they're
// already a subset of it) — simplified to a clean Available/Rented split
// that actually sums to the fleet total.
export function RentalsDashboard({ data }: { data: RentalsDashboardData }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { gridStroke, tickFill } = useChartTheme();

  const [dueToday, setDueToday] = useState<RentalListResult | null>(null);
  const [overdue, setOverdue] = useState<RentalListResult | null>(null);
  const [upcomingReturns, setUpcomingReturns] = useState<Rental[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<number | null>(null);
  const [activityData, setActivityData] = useState<{ day: string; newRentals: number; returns: number }[]>([]);
  const [viewingRentalId, setViewingRentalId] = useState<string | null>(null);

  const load = useCallback(() => {
    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    const now = new Date();

    api
      .get<RentalListResult>("/rentals?dueToday=true&pageSize=10")
      .then(setDueToday)
      .catch(() => setDueToday(null));

    api
      .get<RentalListResult>("/rentals?overdue=true&pageSize=10")
      .then(setOverdue)
      .catch(() => setOverdue(null));

    Promise.all([
      api.get<RentalListResult>(
        `/rentals?status=ACTIVE&dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      ),
      api.get<RentalListResult>(
        `/rentals?status=COMPLETED&dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}&pageSize=100`
      ),
    ])
      .then(([active, completed]) =>
        setLastMonthRevenue([...active.data, ...completed.data].reduce((sum, r) => sum + Number(r.totalCost), 0))
      )
      .catch(() => setLastMonthRevenue(null));

    api
      .get<RentalListResult>("/rentals?status=ACTIVE&pageSize=100")
      .then((res) => {
        const in7Days = new Date(now.getTime() + 7 * MS_PER_DAY);
        setUpcomingReturns(
          res.data
            .filter((r) => {
              const end = new Date(r.endDate);
              return end.getTime() > now.getTime() && end.getTime() <= in7Days.getTime();
            })
            .sort((a, b) => a.endDate.localeCompare(b.endDate))
            .slice(0, 5)
        );
      })
      .catch(() => setUpcomingReturns([]));

    api
      .get<VehicleListResult>("/vehicles?status=AVAILABLE&pageSize=20")
      .then((res) => setAvailableVehicles(res.data.filter((v) => v.rentalDailyRate).slice(0, 5)))
      .catch(() => setAvailableVehicles([]));

    Promise.all([
      api.get<RentalListResult>(`/rentals?dateFrom=${isoDate(monthStart)}&pageSize=100`),
      api.get<RentalListResult>(`/rentals?status=COMPLETED&pageSize=100`),
    ])
      .then(([newRentalsRes, completedRes]) => {
        const byDay = new Map<string, { newRentals: number; returns: number }>();
        for (const r of newRentalsRes.data) {
          const day = r.startDate.slice(0, 10);
          const entry = byDay.get(day) ?? { newRentals: 0, returns: 0 };
          entry.newRentals += 1;
          byDay.set(day, entry);
        }
        const monthStartIso = isoDate(monthStart);
        for (const r of completedRes.data) {
          if (!r.actualReturnAt) continue;
          const day = r.actualReturnAt.slice(0, 10);
          if (day < monthStartIso) continue;
          const entry = byDay.get(day) ?? { newRentals: 0, returns: 0 };
          entry.returns += 1;
          byDay.set(day, entry);
        }
        setActivityData(
          [...byDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, v]) => ({ day: formatDate(day), ...v }))
        );
      })
      .catch(() => setActivityData([]));
  }, []);

  useEffect(load, [load]);

  const totalFleet = data.availableRentalVehicles + data.activeRentals;
  const statusBreakdown =
    totalFleet > 0
      ? [
          { key: "available", label: "Available", value: data.availableRentalVehicles, color: STATUS_COLORS.available },
          { key: "rented", label: "Rented", value: data.activeRentals, color: STATUS_COLORS.rented },
        ]
      : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Welcome back, {user?.fullName?.split(" ")[0] ?? "there"}!</h1>
        <p className="text-sm text-muted">Manage your rental operations, customers and upcoming returns.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Available Vehicles" value={String(data.availableRentalVehicles)} sublabel="Ready to rent" icon={Car} />
        <KpiCard
          label="Currently Rented"
          value={String(data.activeRentals)}
          sublabel={totalFleet > 0 ? `of ${totalFleet} total fleet` : undefined}
          icon={KeyRound}
        />
        <KpiCard
          label="Due for Return Today"
          value={dueToday !== null ? String(dueToday.meta.total) : "—"}
          icon={CalendarClock}
          tone={dueToday && dueToday.meta.total > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Overdue Rentals"
          value={overdue !== null ? String(overdue.meta.total) : "—"}
          icon={AlertTriangle}
          tone={overdue && overdue.meta.total > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Rental Revenue (this month)"
          value={formatCurrencyCompact(data.rentalRevenueThisMonth)}
          sublabel={lastMonthRevenue !== null ? percentChange(data.rentalRevenueThisMonth, lastMonthRevenue) : undefined}
          icon={Wallet}
          tone="success"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <SectionCard title="Rental Activity (this month)">
            {activityData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No rental activity yet this month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart accessibilityLayer data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="day" tick={{ fill: tickFill, fontSize: 12 }} />
                  <YAxis tick={{ fill: tickFill, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="newRentals" name="New Rentals" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="returns" name="Returns" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Rental Status">
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No fleet data yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="label" innerRadius={38} outerRadius={60} paddingAngle={2}>
                    {statusBreakdown.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                {statusBreakdown.map((d) => (
                  <li key={d.key} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.label}
                    </span>
                    <span className="font-medium text-ink">
                      {d.value} ({Math.round((d.value / totalFleet) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigate("/rentals/new")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Plus size={18} className="text-action" />
              New Rental
            </button>
            <button
              type="button"
              onClick={() => navigate("/rental-vehicles")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Car size={18} className="text-action" />
              Available Rentals
            </button>
            <button
              type="button"
              onClick={() => navigate("/customers/new")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <UserPlus size={18} className="text-action" />
              Add Customer
            </button>
            <button
              type="button"
              onClick={() => navigate("/rental-payments")}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
            >
              <Wallet size={18} className="text-action" />
              Rental Payments
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Rentals Due Today">
          {!dueToday || dueToday.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No rentals due for return today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-semibold">Customer</th>
                    <th className="pb-2 font-semibold">Vehicle</th>
                    <th className="pb-2 font-semibold">Return Date</th>
                    <th className="pb-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {dueToday.data.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2">
                        <CustomerCell rental={r} />
                      </td>
                      <td className="py-2">
                        <VehicleCell rental={r} />
                      </td>
                      <td className="py-2 text-ink">
                        {formatDate(r.endDate)}
                        <span className="ml-2">
                          <RentalRowStatusBadge rental={r} />
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => setViewingRentalId(r.id)} className="text-xs font-medium text-action hover:underline">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Overdue Rentals">
          {!overdue || overdue.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No overdue rentals.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-semibold">Customer</th>
                    <th className="pb-2 font-semibold">Vehicle</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.data.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2">
                        <CustomerCell rental={r} />
                      </td>
                      <td className="py-2">
                        <VehicleCell rental={r} />
                      </td>
                      <td className="py-2">
                        <RentalRowStatusBadge rental={r} />
                        <div className="mt-0.5 text-xs text-muted">
                          {daysOverdue(r.endDate)} day{daysOverdue(r.endDate) === 1 ? "" : "s"} overdue
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => setViewingRentalId(r.id)} className="text-xs font-medium text-action hover:underline">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Available Vehicles for New Rental">
            {availableVehicles.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No available rental vehicles right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {availableVehicles.map((v) => {
                  const image = v.images?.find((img) => img.isPrimary) ?? v.images?.[0];
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => navigate("/rentals/new")}
                      className="overflow-hidden rounded-lg border border-border text-left hover:border-action"
                    >
                      <div className="flex h-20 items-center justify-center bg-surface">
                        {image ? (
                          <img src={image.fileUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Car size={24} className="text-muted" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-xs font-semibold text-ink">{vehicleDisplayName(v)}</div>
                        <div className="text-[11px] text-muted">{v.stockNumber}</div>
                        {v.rentalDailyRate && (
                          <div className="mt-0.5 text-[11px] font-medium text-action">{formatCurrency(v.rentalDailyRate)}/day</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate("/rental-vehicles")}
              className="mt-3 block text-sm font-medium text-action hover:underline"
            >
              View all →
            </button>
          </SectionCard>
        </div>

        <SectionCard title="Upcoming Returns (Next 7 Days)">
          {upcomingReturns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No returns due in the next 7 days.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {upcomingReturns.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{customerDisplayName(r.customer)}</div>
                    <div className="truncate text-xs text-muted">{vehicleDisplayName(r.vehicle)}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDate(r.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="GPS-enabled rentals">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
              <MapPin size={18} />
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums text-ink">
                {data.gpsStatus.active}
                <span className="text-base font-normal text-muted"> / {data.gpsStatus.ofActiveRentals}</span>
              </div>
              <p className="text-xs text-muted">of active rentals have GPS enabled</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {viewingRentalId && <RentalDetailModal rentalId={viewingRentalId} onClose={() => setViewingRentalId(null)} />}
    </div>
  );
}
