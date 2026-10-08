import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Car, Gauge, Key, MoreVertical, Plus, RotateCcw, ShoppingCart, Wrench } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { PurposeBadge } from "../components/inventory/PurposeBadge";
import { StatusChangeDialog } from "../components/inventory/StatusChangeDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatDate } from "../lib/format";
import { deriveVehiclePurpose, vehicleDisplayName } from "../lib/vehicle-helpers";
import type { Vehicle, VehicleListResult, VehiclePurpose, VehicleStatus } from "../types/vehicle";
import { RowMenu } from "../components/RowMenu";
import { useAutoRefresh } from "../lib/use-auto-refresh";

const AGING_THRESHOLD_DAYS = 90;

interface Kpis {
  total: number;
  available: number;
  forSale: number;
  forRent: number;
  inService: number;
  sold: number;
}

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<VehicleListResult>(`/vehicles?${query}`);
  return res.meta.total;
}

export function InventoryPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "">("");
  const [purposeFilter, setPurposeFilter] = useState<VehiclePurpose | "">("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<VehicleListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [agingCount, setAgingCount] = useState<number | null>(null);

  const [statusDialogVehicle, setStatusDialogVehicle] = useState<Vehicle | null>(null);
  const [deleteVehicle, setDeleteVehicle] = useState<Vehicle | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, purposeFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (purposeFilter) params.set("purpose", purposeFilter);

    api
      .get<VehicleListResult>(`/vehicles?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load vehicles"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, purposeFilter]);

  const loadKpis = useCallback(() => {
    Promise.all([
      fetchCount({}),
      fetchCount({ status: "AVAILABLE" }),
      fetchCount({ purpose: "FOR_SALE" }),
      fetchCount({ purpose: "FOR_RENT" }),
      fetchCount({ purpose: "BOTH" }),
      fetchCount({ status: "UNDER_MAINTENANCE" }),
      fetchCount({ status: "SOLD" }),
    ])
      .then(([total, available, forSaleOnly, forRentOnly, both, inService, sold]) => {
        setKpis({ total, available, forSale: forSaleOnly + both, forRent: forRentOnly + both, inService, sold });
      })
      .catch(() => undefined);

    // Aging check: oldest AVAILABLE vehicles first, capped at 100 — accurate
    // for dealership-scale inventory, approximate beyond that (see note in
    // PROGRESS.md).
    api
      .get<VehicleListResult>("/vehicles?status=AVAILABLE&pageSize=100&sortBy=createdAt&sortDir=asc")
      .then((res) => {
        const cutoff = Date.now() - AGING_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
        setAgingCount(res.data.filter((v) => new Date(v.createdAt).getTime() < cutoff).length);
      })
      .catch(() => setAgingCount(null));
  }, []);

  useEffect(loadList, [loadList]);

  useAutoRefresh(loadList);
  useEffect(loadKpis, [loadKpis]);
  useAutoRefresh(loadKpis);

  function refreshAll() {
    loadList();
    loadKpis();
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setPurposeFilter("");
  }

  async function handleDelete() {
    if (!deleteVehicle) return;
    try {
      await api.delete(`/vehicles/${deleteVehicle.id}`);
      showToast(`${vehicleDisplayName(deleteVehicle)} deleted`);
      setDeleteVehicle(null);
      refreshAll();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to delete vehicle");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total vehicles" value={kpis ? String(kpis.total) : "—"} icon={Car} />
        <KpiCard label="Available" value={kpis ? String(kpis.available) : "—"} icon={Car} tone="success" />
        <KpiCard label="For sale" value={kpis ? String(kpis.forSale) : "—"} icon={ShoppingCart} />
        <KpiCard label="For rent" value={kpis ? String(kpis.forRent) : "—"} icon={Key} />
        <KpiCard label="In service" value={kpis ? String(kpis.inService) : "—"} icon={Wrench} tone="warning" />
        <KpiCard label="Sold" value={kpis ? String(kpis.sold) : "—"} icon={Gauge} />
      </div>

      {agingCount !== null && agingCount > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-ink">
            <AlertCircle size={16} className="text-warning" />
            {agingCount} vehicle{agingCount === 1 ? "" : "s"} have been in stock for more than {AGING_THRESHOLD_DAYS} days.
            Consider reviewing pricing or assigning them for rental.
          </span>
          <Link to="/reports" className="touch-target whitespace-nowrap font-medium text-action hover:underline">
            View Full Report
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search make, model, VIN, reg. no, stock no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | "")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="RESERVED">Reserved</option>
            <option value="RENTED">Rented</option>
            <option value="SOLD">Sold</option>
            <option value="UNDER_MAINTENANCE">Under Maintenance</option>
            <option value="UNAVAILABLE">Unavailable</option>
            <option value="SOLD_DEAL_FAILED">Sold Deal Failed</option>
          </select>
          <select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value as VehiclePurpose | "")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Purpose</option>
            <option value="FOR_SALE">For Sale</option>
            <option value="FOR_RENT">For Rent</option>
            <option value="BOTH">For Both</option>
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/inventory/new")}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={16} />
          Add Vehicle
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="phone-hide-2 phone-hide-3 phone-hide-4 phone-hide-7 sticky-actions w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Stock No.</th>
                <th className="px-4 py-3 font-semibold">Purpose</th>
                <th className="px-4 py-3 font-semibold">Key Details</th>
                <th className="px-4 py-3 text-right font-semibold">Price / Rate</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Added On</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading && !result ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No vehicles match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((vehicle) => {
                  const primaryImage = vehicle.images?.find((i) => i.isPrimary) ?? vehicle.images?.[0];
                  const purpose = deriveVehiclePurpose(vehicle);
                  return (
                    <tr key={vehicle.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted">
                            {primaryImage ? (
                              <img src={primaryImage.fileUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Car size={18} />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-ink">{vehicleDisplayName(vehicle)}</div>
                            <div className="text-xs text-muted">{vehicle.vehicleType ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">{vehicle.stockNumber}</td>
                      <td className="px-4 py-3">
                        <PurposeBadge purpose={purpose} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <div>Reg: {vehicle.registrationNo ?? "—"}</div>
                        <div>
                          {vehicle.color ?? "—"} {vehicle.mileage != null ? `· ${vehicle.mileage.toLocaleString()} km` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">
                        {vehicle.sellingPrice && <div>{formatCurrency(vehicle.sellingPrice)}</div>}
                        {vehicle.rentalDailyRate && (
                          <div className="text-xs text-muted">{formatCurrency(vehicle.rentalDailyRate)}/day</div>
                        )}
                        {!vehicle.sellingPrice && !vehicle.rentalDailyRate && "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={vehicle.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(vehicle.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            setMenuAnchor(e.currentTarget);
                            setOpenMenuId(openMenuId === vehicle.id ? null : vehicle.id);
                          }}
                          aria-expanded={openMenuId === vehicle.id}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
                          aria-label="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === vehicle.id && menuAnchor && (
                          <RowMenu anchor={menuAnchor} onClose={() => setOpenMenuId(null)} className="w-44">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                navigate(`/inventory/${vehicle.id}/edit`);
                              }}
                              className="block w-full px-3 py-2 text-sm text-ink hover:bg-surface"
                            >
                              View / Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setStatusDialogVehicle(vehicle);
                              }}
                              className="block w-full px-3 py-2 text-sm text-ink hover:bg-surface"
                            >
                              Change Status
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setDeleteVehicle(vehicle);
                              }}
                              className="block w-full px-3 py-2 text-sm text-danger hover:bg-surface"
                            >
                              Delete
                            </button>
                          </RowMenu>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {result && result.meta.pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">
              Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} vehicles
            </span>
            <div className="flex items-center gap-2">
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

      {statusDialogVehicle && (
        <StatusChangeDialog
          vehicle={statusDialogVehicle}
          onClose={() => setStatusDialogVehicle(null)}
          onChanged={() => {
            showToast("Vehicle status updated");
            setStatusDialogVehicle(null);
            refreshAll();
          }}
        />
      )}

      {deleteVehicle && (
        <ConfirmDialog
          title="Delete this vehicle?"
          description={`${vehicleDisplayName(deleteVehicle)} (${deleteVehicle.stockNumber}) will be permanently removed. This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteVehicle(null)}
        />
      )}
    </div>
  );
}
