import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Car, LayoutGrid, List, Loader2, RotateCcw, Search } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency } from "../lib/format";
import { FUEL_TYPE_OPTIONS, TRANSMISSION_OPTIONS, vehicleDisplayName } from "../lib/vehicle-helpers";
import type { Vehicle, VehicleListResult } from "../types/vehicle";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest First" },
  { value: "createdAt:asc", label: "Oldest First" },
  { value: "sellingPrice:asc", label: "Price: Low to High" },
  { value: "sellingPrice:desc", label: "Price: High to Low" },
  { value: "year:desc", label: "Year: Newest" },
];

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted";

// Read-only view for the Sales Salesperson role — same /vehicles data
// Admin's Inventory page uses, but without the edit/delete/status-change
// actions, which stay Admin-only. "Sell" just opens the New Sale flow;
// the salesperson picks the vehicle there like any other sale.
export function AvailableVehiclesPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [transmission, setTransmission] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState(SORT_OPTIONS[0].value);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<VehicleListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, make, model, vehicleType, transmission, fuelType, yearFrom, yearTo, priceMin, priceMax]);

  const [sortBy, sortDir] = sort.split(":");

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "12", status: "AVAILABLE", sortBy, sortDir });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (make) params.set("make", make);
    if (model) params.set("model", model);
    if (vehicleType) params.set("vehicleType", vehicleType);
    if (transmission) params.set("transmission", transmission);
    if (fuelType) params.set("fuelType", fuelType);
    if (yearFrom) params.set("yearFrom", yearFrom);
    if (yearTo) params.set("yearTo", yearTo);
    if (priceMin) params.set("priceMin", priceMin);
    if (priceMax) params.set("priceMax", priceMax);

    api
      .get<VehicleListResult>(`/vehicles?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load vehicles"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, make, model, vehicleType, transmission, fuelType, yearFrom, yearTo, priceMin, priceMax, sortBy, sortDir]);

  useEffect(loadList, [loadList]);

  function resetFilters() {
    setSearch("");
    setMake("");
    setModel("");
    setVehicleType("");
    setTransmission("");
    setFuelType("");
    setYearFrom("");
    setYearTo("");
    setPriceMin("");
    setPriceMax("");
  }

  const typeCounts = result?.typeCounts ?? {};
  const quickFilters = useMemo(() => {
    const total = result?.meta.total ?? 0;
    const perType = result?.typeCounts ?? {};
    return [{ label: "All", value: "", count: total }, ...Object.entries(perType).map(([t, c]) => ({ label: t, value: t, count: c }))];
  }, [result]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Car size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Available Vehicles</h1>
            <p className="text-sm text-muted">Browse and find the perfect vehicle for your customers.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/sales/new")}
          className="shrink-0 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          + New Sale
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by make, model, or keyword…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className={inputCls} />
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className={inputCls} />
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls}>
            <option value="">All Types</option>
            {Object.keys(typeCounts).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="Year From" className={inputCls} />
          <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="Year To" className={inputCls} />
          <select value={transmission} onChange={(e) => setTransmission(e.target.value)} className={inputCls}>
            <option value="">All Transmissions</option>
            {TRANSMISSION_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className={inputCls}>
            <option value="">All Fuel Types</option>
            {FUEL_TYPE_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="Min Price (GHS)" className={inputCls} />
          <div className="flex gap-2">
            <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Max Price (GHS)" className={inputCls} />
            <button
              type="button"
              onClick={resetFilters}
              title="Reset filters"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setVehicleType(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                vehicleType === f.value ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
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
            className={`rounded-lg border border-border p-1.5 ${view === "grid" ? "bg-action text-white" : "text-muted hover:bg-surface"}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-lg border border-border p-1.5 ${view === "list" ? "bg-action text-white" : "text-muted hover:bg-surface"}`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 size={24} className="animate-spin text-action" />
        </div>
      ) : !result || result.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted">
          No available vehicles found.
        </div>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" : "flex flex-col gap-3"}>
          {result.data.map((vehicle: Vehicle) => {
            const primaryImage = vehicle.images?.find((img) => img.isPrimary) ?? vehicle.images?.[0];
            return (
              <div
                key={vehicle.id}
                className={`overflow-hidden rounded-xl border border-border bg-card ${view === "list" ? "flex items-center gap-4" : ""}`}
              >
                <div className={view === "list" ? "h-24 w-32 shrink-0 bg-surface" : "flex h-36 items-center justify-center bg-surface"}>
                  {primaryImage ? (
                    <img src={primaryImage.fileUrl} alt={vehicleDisplayName(vehicle)} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Car size={32} className="text-muted" />
                    </div>
                  )}
                </div>
                <div className={`flex-1 p-4 ${view === "list" ? "flex items-center justify-between gap-4" : ""}`}>
                  <div>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink">{vehicleDisplayName(vehicle)}</h3>
                      {view === "grid" && <StatusBadge status={vehicle.status} />}
                    </div>
                    <p className="mb-2 text-xs text-muted">
                      {vehicle.vehicleType ?? "—"} · {vehicle.transmission ?? "—"} · {vehicle.fuelType ?? "—"}
                    </p>
                    {vehicle.mileage !== null && (
                      <p className="mb-2 text-xs text-muted">
                        {vehicle.mileage.toLocaleString()} km {vehicle.color ? `· ${vehicle.color}` : ""}
                      </p>
                    )}
                    <p className="mb-3 text-lg font-semibold tabular-nums text-ink">
                      {vehicle.sellingPrice ? formatCurrency(Number(vehicle.sellingPrice)) : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/sales/new")}
                    className={`rounded-lg bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-primary ${view === "grid" ? "w-full" : "shrink-0"}`}
                  >
                    Sell
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
    </div>
  );
}
