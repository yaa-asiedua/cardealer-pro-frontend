import { Link } from "react-router-dom";
import { Car, Gauge, MapPin, Repeat, Undo2 } from "lucide-react";
import { AlertBanner } from "../../components/dashboard/AlertBanner";
import { KpiCard } from "../../components/dashboard/KpiCard";
import { SectionCard } from "../../components/dashboard/SectionCard";
import { formatCurrencyCompact } from "../../lib/format";
import type { RentalsDashboard as RentalsDashboardData } from "../../types/dashboard";

// Design Brief §6 "Rental Salesperson": prioritize availability, active
// rentals, returns due and GPS state — active rentals should be
// immediately actionable, so "returns due" surfaces as an alert.
export function RentalsDashboard({ data }: { data: RentalsDashboardData }) {
  const alerts =
    data.returnsDue > 0
      ? [{ label: `${data.returnsDue} rental${data.returnsDue === 1 ? "" : "s"} due for return`, path: "/active-rentals" }]
      : [];

  return (
    <div>
      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Bookings this month" value={String(data.bookingsThisMonth)} icon={Repeat} />
        <KpiCard
          label="Rental revenue this month"
          value={formatCurrencyCompact(data.rentalRevenueThisMonth)}
          icon={Gauge}
        />
        <KpiCard label="Active rentals" value={String(data.activeRentals)} icon={Car} tone="success" />
        <KpiCard
          label="Due for return"
          value={String(data.returnsDue)}
          icon={Undo2}
          tone={data.returnsDue > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Available rental vehicles">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
              <Car size={18} />
            </div>
            <div className="text-2xl font-semibold tabular-nums text-ink">{data.availableRentalVehicles}</div>
          </div>
          <Link to="/rental-vehicles" className="mt-4 block text-sm font-medium text-action hover:underline">
            Browse Available Rental Vehicles →
          </Link>
        </SectionCard>

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
    </div>
  );
}
