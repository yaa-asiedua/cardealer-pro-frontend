import { Calendar, Car, Fuel, Gauge, Settings2, Users, X } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { formatCurrency } from "../../lib/format";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { Vehicle } from "../../types/vehicle";

interface VehicleDetailModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onRent: () => void;
}

// A real, read-only spec view — not a re-fetch, since the caller (the
// Available Rentals grid) already has the full Vehicle object. "Rent This
// Vehicle" hands off to RentalFormModal the same way the grid's own "New
// Rental" action does; RentalFormModal's own flow requires dates before a
// vehicle search (availability is date-range based, see rentals/README),
// so this can't pre-select the vehicle there — same limitation Sales'
// "Sell" button already accepts for New Sale.
export function VehicleDetailModal({ vehicle, onClose, onRent }: VehicleDetailModalProps) {
  const image = vehicle.images?.find((img) => img.isPrimary) ?? vehicle.images?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Vehicle Details</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex h-48 items-center justify-center overflow-hidden rounded-lg bg-surface">
            {image ? (
              <img src={image.fileUrl} alt={vehicleDisplayName(vehicle)} className="h-full w-full object-cover" />
            ) : (
              <Car size={40} className="text-muted" />
            )}
          </div>

          <div className="mt-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-ink">{vehicleDisplayName(vehicle)}</h3>
              <p className="text-xs text-muted">{vehicle.registrationNo ?? vehicle.stockNumber}</p>
            </div>
            <StatusBadge status={vehicle.status} />
          </div>

          {vehicle.rentalDailyRate && (
            <p className="mt-2 text-xl font-semibold tabular-nums text-action">
              {formatCurrency(vehicle.rentalDailyRate)} <span className="text-sm font-normal text-muted">/ day</span>
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Spec icon={Calendar} label="Year" value={String(vehicle.year)} />
            {vehicle.seats != null && <Spec icon={Users} label="Seats" value={String(vehicle.seats)} />}
            {vehicle.transmission && <Spec icon={Settings2} label="Transmission" value={vehicle.transmission} />}
            {vehicle.fuelType && <Spec icon={Fuel} label="Fuel Type" value={vehicle.fuelType} />}
            {vehicle.mileage != null && <Spec icon={Gauge} label="Mileage" value={`${vehicle.mileage.toLocaleString()} km`} />}
            {vehicle.color && <Spec icon={Car} label="Color" value={vehicle.color} />}
          </dl>

          {vehicle.description && <p className="mt-4 text-sm text-muted">{vehicle.description}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRent}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Rent This Vehicle
          </button>
        </div>
      </div>
    </div>
  );
}

function Spec({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
        <Icon size={14} />
      </div>
      <div>
        <dt className="text-[11px] text-muted">{label}</dt>
        <dd className="font-medium text-ink">{value}</dd>
      </div>
    </div>
  );
}
