import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Calendar, Car, Fuel, LayoutGrid, List, Loader2, Plus, RotateCcw, Search, Settings2, Users } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { VehicleDetailModal } from "../components/rentals/VehicleDetailModal";
import { StatusBadge } from "../components/StatusBadge";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency } from "../lib/format";
import { SEAT_OPTIONS, TRANSMISSION_OPTIONS, vehicleDisplayName } from "../lib/vehicle-helpers";
import type { RentalListResult } from "../types/rental";
import type { Vehicle, VehicleListResult } from "../types/vehicle";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest First" },
  { value: "createdAt:asc", label: "Oldest First" },
  { value: "rentalDailyRate:asc", label: "Price: Low to High" },
  { value: "rentalDailyRate:desc", label: "Price: High to Low" },
  { value: "year:desc", label: "Year: Newest" },
];

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted";

// Reconciled against rentals_pages/Available cars.jpeg. Real and included:
// all filters map to real fields (forRent/seats/priceMin-Max added to
// listVehiclesQuerySchema this round — see vehicle.service.ts). Dropped
// without asking (same precedent as Sales' Available Vehicles page):
// the mockup's heart/favorite icon — no favorites feature exists anywhere
// in the schema. "View Details" opens a real spec modal (not a dead
// button) with a "Rent This Vehicle" action that navigates to the
// dedicated Add Rental page (rentals_pages/add-rental.jpeg).
export function AvailableRentalsPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [make, setMake] = useState("");
  const [transmission, setTransmission] = useState("");
  const [seats, setSeats] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState(SORT_OPTIONS[0].value);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<VehicleListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableNow, setAvailableNow] = useState<number | null>(null);
  const [currentlyRented, setCurrentlyRented] = useState<number | null>(null);
  const [dueToday, setDueToday] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);

  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, vehicleType, make, transmission, seats, priceMin, priceMax]);

  const [sortBy, sortDir] = sort.split(":");

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
      status: "AVAILABLE",
      forRent: "true",
      sortBy,
      sortDir,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (vehicleType) params.set("vehicleType", vehicleType);
    if (make) params.set("make", make);
    if (transmission) params.set("transmission", transmission);
    if (seats) params.set("seats", seats);
    if (priceMin) params.set("priceMin", priceMin);
    if (priceMax) params.set("priceMax", priceMax);

    api
      .get<VehicleListResult>(`/vehicles?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load vehicles"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, vehicleType, make, transmission, seats, priceMin, priceMax, sortBy, sortDir]);

  useEffect(loadList, [loadList]);

  const loadKpis = useCallback(() => {
    api
      .get<VehicleListResult>("/vehicles?status=AVAILABLE&forRent=true&pageSize=1")
      .then((res) => setAvailableNow(res.meta.total))
      .catch(() => setAvailableNow(null));
    api
      .get<VehicleListResult>("/vehicles?status=RENTED&forRent=true&pageSize=1")
      .then((res) => setCurrentlyRented(res.meta.total))
      .catch(() => setCurrentlyRented(null));
    api
      .get<RentalListResult>("/rentals?dueToday=true&pageSize=1")
      .then((res) => setDueToday(res.meta.total))
      .catch(() => setDueToday(null));
    api
      .get<RentalListResult>("/rentals?overdue=true&pageSize=1")
      .then((res) => setOverdue(res.meta.total))
      .catch(() => setOverdue(null));
  }, []);

  useEffect(loadKpis, [loadKpis]);

  function resetFilters() {
    setSearch("");
    setVehicleType("");
    setMake("");
    setTransmission("");
    setSeats("");
    setPriceMin("");
    setPriceMax("");
  }

  const typeOptions = useMemo(() => Object.keys(result?.typeCounts ?? {}), [result]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Car size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Available Rentals</h1>
            <p className="text-sm text-muted">Browse and filter vehicles available for rent.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/rentals/new")}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={14} /> New Rental
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Available Now" value={availableNow !== null ? String(availableNow) : "—"} icon={Car} />
        <KpiCard label="Currently Rented" value={currentlyRented !== null ? String(currentlyRented) : "—"} icon={Users} />
        <KpiCard
          label="Due for Return Today"
          value={dueToday !== null ? String(dueToday) : "—"}
          icon={Calendar}
          tone={dueToday && dueToday > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Overdue Rentals"
          value={overdue !== null ? String(overdue) : "—"}
          icon={AlertCircle}
          tone={overdue && overdue > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by make, model, or plate number…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls}>
            <option value="">All Types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className={inputCls} />
          <select value={transmission} onChange={(e) => setTransmission(e.target.value)} className={inputCls}>
            <option value="">All Transmissions</option>
            {TRANSMISSION_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <select value={seats} onChange={(e) => setSeats(e.target.value)} className={inputCls}>
            <option value="">Any Seating</option>
            {SEAT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} seats
              </option>
            ))}
          </select>
          <input
            type="number"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="Min Price / day"
            className={inputCls}
          />
          <input
            type="number"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Max Price / day"
            className={inputCls}
          />
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Available Vehicles ({result?.meta.total ?? 0})</h2>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-ink">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={`rounded-lg border border-border p-1.5 ${view === "grid" ? "bg-action text-white" : "text-muted hover:bg-surface"}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
            className={`rounded-lg border border-border p-1.5 ${view === "list" ? "bg-action text-white" : "text-muted hover:bg-surface"}`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-action" />
        </div>
      ) : !result || result.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted">
          No available rental vehicles found.
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" : "flex flex-col gap-3"}>
          {result.data.map((vehicle) => {
            const primaryImage = vehicle.images?.find((img) => img.isPrimary) ?? vehicle.images?.[0];
            return (
              <div
                key={vehicle.id}
                className={`overflow-hidden rounded-xl border border-border bg-card ${view === "list" ? "flex items-center gap-4" : ""}`}
              >
                <div className={`relative ${view === "list" ? "h-24 w-32 shrink-0 bg-surface" : "flex h-36 items-center justify-center bg-surface"}`}>
                  {primaryImage ? (
                    <img src={primaryImage.fileUrl} alt={vehicleDisplayName(vehicle)} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Car size={32} className="text-muted" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2">
                    <StatusBadge status={vehicle.status} />
                  </span>
                  {vehicle.rentalDailyRate && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-2 py-1 text-xs font-semibold text-white">
                      {formatCurrency(vehicle.rentalDailyRate)} / day
                    </span>
                  )}
                </div>
                <div className={`flex-1 p-4 ${view === "list" ? "flex items-center justify-between gap-4" : ""}`}>
                  <div>
                    <h3 className="mb-1 font-semibold text-ink">{vehicleDisplayName(vehicle)}</h3>
                    <p className="mb-2 text-xs text-muted">{vehicle.registrationNo ?? vehicle.stockNumber}</p>
                    <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> {vehicle.year}
                      </span>
                      {vehicle.seats != null && (
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {vehicle.seats} Seats
                        </span>
                      )}
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                      {vehicle.fuelType && (
                        <span className="flex items-center gap-1">
                          <Fuel size={12} /> {vehicle.fuelType}
                        </span>
                      )}
                      {vehicle.transmission && (
                        <span className="flex items-center gap-1">
                          <Settings2 size={12} /> {vehicle.transmission}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailVehicle(vehicle)}
                    className={`rounded-lg bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-primary ${view === "grid" ? "w-full" : "shrink-0"}`}
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result && result.meta.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
            {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} vehicles
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= result.meta.pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {detailVehicle && (
        <VehicleDetailModal
          vehicle={detailVehicle}
          onClose={() => setDetailVehicle(null)}
          onRent={() => {
            setDetailVehicle(null);
            navigate("/rentals/new");
          }}
        />
      )}
    </div>
  );
}
