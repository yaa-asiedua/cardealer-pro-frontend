import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Car,
  Clock,
  Download,
  Key,
  Lightbulb,
  Plus,
  RotateCcw,
  ScanLine,
  Wallet,
} from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RentalDetailModal } from "../components/rentals/RentalDetailModal";
import { RentalFormModal } from "../components/rentals/RentalFormModal";
import { RentalStatusBadge } from "../components/rentals/RentalStatusBadge";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { customerDisplayName } from "../types/customer";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { Rental, RentalListResult, RentalsReport, RentalStatus } from "../types/rental";
import type { VehicleListResult } from "../types/vehicle";
import { useAutoRefresh } from "../lib/use-auto-refresh";

type Tab = "all" | "active" | "upcoming" | "dueToday" | "overdue" | "returned";

interface Kpis {
  fleet: number;
  active: number;
  available: number;
  dueToday: number;
  overdue: number;
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
}

async function fetchRentalCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<RentalListResult>(`/rentals?${query}`);
  return res.meta.total;
}

async function fetchVehicleCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<VehicleListResult>(`/vehicles?${query}`);
  return res.meta.total;
}

// The vehicle `purpose` filter is single-value only (FOR_RENT | FOR_RENT |
// BOTH) — "rentable" spans two of those, so this sums two parallel calls,
// same client-merge tradeoff already used for the Financing search in the
// Payments & Revenue Record Payment modal.
async function fetchRentableVehicleCount(extra: Record<string, string> = {}): Promise<number> {
  const [forRent, both] = await Promise.all([
    fetchVehicleCount({ ...extra, purpose: "FOR_RENT" }),
    fetchVehicleCount({ ...extra, purpose: "BOTH" }),
  ]);
  return forRent + both;
}

function monthBounds(monthsAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = monthsAgo === 0 ? now : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start, end };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function RentalsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("all");

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [revenueThisMonth, setRevenueThisMonth] = useState<number | null>(null);
  const [revenueChangePercent, setRevenueChangePercent] = useState<number | null>(null);
  const [rentableVehicles, setRentableVehicles] = useState<VehicleOption[]>([]);

  const [topVehicle, setTopVehicle] = useState<{ name: string; count: number } | null>(null);

  const [showCreateRental, setShowCreateRental] = useState(false);
  const [detailRentalId, setDetailRentalId] = useState<string | null>(null);

  const loadKpis = useCallback(() => {
    Promise.all([
      fetchRentableVehicleCount(),
      fetchRentalCount({ status: "ACTIVE" }),
      fetchRentableVehicleCount({ status: "AVAILABLE" }),
      fetchRentalCount({ dueToday: "true" }),
      fetchRentalCount({ overdue: "true" }),
    ])
      .then(([fleet, active, available, dueToday, overdue]) => {
        setKpis({ fleet, active, available, dueToday, overdue });
      })
      .catch(() => undefined);

    const { start: monthStart } = monthBounds(0);
    const { start: lastMonthStart, end: lastMonthEnd } = monthBounds(1);
    Promise.all([
      api.get<{ report: RentalsReport }>(`/reports/rentals?dateFrom=${isoDate(monthStart)}`),
      api.get<{ report: RentalsReport }>(`/reports/rentals?dateFrom=${isoDate(lastMonthStart)}&dateTo=${isoDate(lastMonthEnd)}`),
    ])
      .then(([thisMonth, lastMonth]) => {
        setRevenueThisMonth(thisMonth.report.totals.revenue);
        if (lastMonth.report.totals.revenue > 0) {
          setRevenueChangePercent(
            Math.round(((thisMonth.report.totals.revenue - lastMonth.report.totals.revenue) / lastMonth.report.totals.revenue) * 1000) / 10
          );
        } else {
          setRevenueChangePercent(null);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadInsights = useCallback(() => {
    const { start: sixMonthsAgo } = monthBounds(6);
    api
      .get<RentalListResult>(`/rentals?status=COMPLETED&dateFrom=${isoDate(sixMonthsAgo)}&pageSize=100`)
      .then((res) => {
        const byVehicle = new Map<string, { name: string; count: number }>();
        for (const rental of res.data) {
          const entry = byVehicle.get(rental.vehicleId) ?? { name: vehicleDisplayName(rental.vehicle), count: 0 };
          entry.count += 1;
          byVehicle.set(rental.vehicleId, entry);
        }
        const top = [...byVehicle.values()].sort((a, b) => b.count - a.count)[0];
        setTopVehicle(top ?? null);
      })
      .catch(() => undefined);
  }, []);

  useAutoRefresh(() => {
    loadKpis();
    loadInsights();
  });

  useEffect(() => {
    loadKpis();
    loadInsights();
    Promise.all([
      api.get<VehicleListResult>("/vehicles?purpose=FOR_RENT&pageSize=100"),
      api.get<VehicleListResult>("/vehicles?purpose=BOTH&pageSize=100"),
    ])
      .then(([forRent, both]) => setRentableVehicles([...forRent.data, ...both.data]))
      .catch(() => setRentableVehicles([]));
  }, [loadKpis, loadInsights]);

  const [refreshKey, setRefreshKey] = useState(0);

  function refreshAll() {
    loadKpis();
    loadInsights();
    setRefreshKey((k) => k + 1);
  }

  const revenueSublabel = useMemo(() => {
    if (revenueChangePercent === null) return undefined;
    return `${revenueChangePercent >= 0 ? "↑" : "↓"} ${Math.abs(revenueChangePercent)}% from last month`;
  }, [revenueChangePercent]);

  const insight = useMemo(() => {
    if (kpis && kpis.overdue > 0) {
      return `${kpis.overdue} rental${kpis.overdue === 1 ? " is" : "s are"} currently overdue for return. Follow up with those customers first.`;
    }
    if (topVehicle && topVehicle.count >= 2) {
      return `${topVehicle.name} is the most-rented vehicle in the last 6 months (${topVehicle.count} rentals).`;
    }
    return null;
  }, [kpis, topVehicle]);

  const TAB_QUERY: Record<Tab, Partial<{ status: RentalStatus; dueToday: boolean; overdue: boolean }> | undefined> = {
    all: undefined,
    active: { status: "ACTIVE" },
    upcoming: { status: "CONFIRMED" },
    dueToday: { dueToday: true },
    overdue: { overdue: true },
    returned: { status: "COMPLETED" },
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Rental Fleet" value={kpis ? String(kpis.fleet) : "—"} icon={Car} />
        <KpiCard label="Active Rentals" value={kpis ? String(kpis.active) : "—"} icon={Key} tone="success" />
        <KpiCard label="Available" value={kpis ? String(kpis.available) : "—"} icon={RotateCcw} />
        <KpiCard label="Due Today" value={kpis ? String(kpis.dueToday) : "—"} icon={Clock} tone="warning" />
        <KpiCard label="Overdue" value={kpis ? String(kpis.overdue) : "—"} icon={AlertTriangle} tone="danger" />
        <KpiCard
          label="This Month Revenue"
          value={revenueThisMonth !== null ? formatCurrencyCompact(revenueThisMonth) : "—"}
          sublabel={revenueSublabel}
          icon={Wallet}
        />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_rgb(var(--color-border))] [mask-image:linear-gradient(to_right,#000_80%,transparent)] sm:[mask-image:none]">
        {(
          [
            ["all", "All Rentals"],
            ["active", "Active Rentals"],
            ["upcoming", "Upcoming"],
            ["dueToday", "Due Today"],
            ["overdue", "Overdue"],
            ["returned", "Returned"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 sm:px-4 text-sm font-medium ${
              tab === key ? "border-action text-action" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <RentalsTab
          forcedQuery={TAB_QUERY[tab]}
          vehicles={rentableVehicles}
          onCreateRental={tab === "all" ? () => setShowCreateRental(true) : undefined}
          onChanged={refreshAll}
          refreshKey={refreshKey}
          onSelectRental={setDetailRentalId}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action/10 text-action">
            <ScanLine size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Driver's License Reader</p>
            <p className="mt-1 text-sm text-muted">
              Scan a driver's licence to auto-fill customer details and validate rental eligibility.
            </p>
            <button
              type="button"
              disabled
              title="Coming soon — no OCR/camera integration exists yet"
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted opacity-70"
            >
              <ScanLine size={13} /> New Rental (Scan License) — Coming Soon
            </button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Lightbulb size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Rental Insights</p>
            <p className="mt-1 text-sm text-muted">{insight ?? "No standout activity to flag right now."}</p>
          </div>
        </div>
      </div>

      {showCreateRental && (
        <RentalFormModal
          onClose={() => setShowCreateRental(false)}
          onSaved={() => {
            showToast("Rental created");
            setShowCreateRental(false);
            refreshAll();
          }}
        />
      )}

      {detailRentalId && <RentalDetailModal rentalId={detailRentalId} onClose={() => setDetailRentalId(null)} />}
    </div>
  );
}

function RentalsTab({
  forcedQuery,
  vehicles,
  onCreateRental,
  onChanged,
  refreshKey,
  onSelectRental,
}: {
  forcedQuery?: Partial<{ status: RentalStatus; dueToday: boolean; overdue: boolean }>;
  vehicles: VehicleOption[];
  onCreateRental?: () => void;
  onChanged: () => void;
  refreshKey: number;
  onSelectRental: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RentalListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelRental, setCancelRental] = useState<Rental | null>(null);
  const [actionRentalId, setActionRentalId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, vehicleFilter, dateFrom, dateTo]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (vehicleFilter) params.set("vehicleId", vehicleFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (forcedQuery?.status) params.set("status", forcedQuery.status);
    if (forcedQuery?.dueToday) params.set("dueToday", "true");
    if (forcedQuery?.overdue) params.set("overdue", "true");

    api
      .get<RentalListResult>(`/rentals?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load rentals"))
      .finally(() => setIsLoading(false));
    // refreshKey isn't read above — deliberate cache-buster so an action
    // elsewhere (New Rental, pickup/return/cancel) re-fetches this tab
    // without lifting its filter/pagination state up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, vehicleFilter, dateFrom, dateTo, forcedQuery, refreshKey]);

  useEffect(loadList, [loadList]);

  useAutoRefresh(loadList);

  async function handlePickup(rental: Rental) {
    setActionRentalId(rental.id);
    try {
      await api.post(`/rentals/${rental.id}/pickup`);
      showToast(`${rental.rentalNumber} picked up`);
      loadList();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to record pickup", "error");
    } finally {
      setActionRentalId(null);
    }
  }

  async function handleReturn(rental: Rental) {
    setActionRentalId(rental.id);
    try {
      await api.post(`/rentals/${rental.id}/return`, {});
      showToast(`${rental.rentalNumber} returned`);
      loadList();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to record return", "error");
    } finally {
      setActionRentalId(null);
    }
  }

  async function handleCancel() {
    if (!cancelRental) return;
    try {
      await api.post(`/rentals/${cancelRental.id}/cancel`, {});
      showToast("Rental cancelled");
      setCancelRental(null);
      loadList();
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to cancel rental");
    }
  }

  function handleExport() {
    if (!result || result.data.length === 0) {
      showToast("No rentals to export", "error");
      return;
    }
    const headers = ["Rental #", "Customer", "Vehicle", "Start", "End", "Daily Rate", "Total", "Status"];
    const rows = result.data.map((r) => [
      r.rentalNumber,
      customerDisplayName(r.customer),
      vehicleDisplayName(r.vehicle),
      formatDate(r.startDate),
      formatDate(r.endDate),
      r.dailyRate,
      r.totalCost,
      r.rentalStatus,
    ]);
    downloadCsv(`rentals-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    showToast("Rentals exported");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by customer, vehicle, or booking ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="To"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setVehicleFilter("");
              setDateFrom("");
              setDateTo("");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
          >
            <Download size={16} />
            Export
          </button>
          {onCreateRental && (
            <button
              type="button"
              onClick={onCreateRental}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
            >
              <Plus size={16} />
              New Rental
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="phone-hide-6 phone-hide-7 sticky-actions w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Rental ID</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Start</th>
                <th className="px-4 py-3 font-semibold">End</th>
                <th className="px-4 py-3 text-right font-semibold">Daily Rate</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading && !result ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : !result || result.data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    No rentals match these filters.
                  </td>
                </tr>
              ) : (
                result.data.map((rental) => {
                  const isOverdue = rental.rentalStatus === "ACTIVE" && new Date(rental.endDate) < new Date();
                  const isBusy = actionRentalId === rental.id;
                  return (
                    <tr key={rental.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onSelectRental(rental.id)} className="font-mono text-xs text-action hover:underline">
                          {rental.rentalNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink">{customerDisplayName(rental.customer)}</td>
                      <td className="px-4 py-3 text-ink">{vehicleDisplayName(rental.vehicle)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(rental.startDate)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(rental.endDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(rental.dailyRate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(rental.totalCost)}</td>
                      <td className="px-4 py-3">
                        <RentalStatusBadge status={rental.rentalStatus} isOverdue={isOverdue} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          {rental.rentalStatus === "CONFIRMED" && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handlePickup(rental)}
                                className="text-xs font-medium text-action hover:underline disabled:opacity-50"
                              >
                                Record Pickup
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelRental(rental)}
                                className="text-xs font-medium text-danger hover:underline"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {rental.rentalStatus === "ACTIVE" && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleReturn(rental)}
                              className="text-xs font-medium text-success hover:underline disabled:opacity-50"
                            >
                              Record Return
                            </button>
                          )}
                        </div>
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
              {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} rentals
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
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

      {cancelRental && (
        <ConfirmDialog
          title="Cancel this rental?"
          description={`${cancelRental.rentalNumber} (${vehicleDisplayName(cancelRental.vehicle)}) will be marked as cancelled.`}
          confirmLabel="Cancel Rental"
          danger
          onConfirm={handleCancel}
          onCancel={() => setCancelRental(null)}
        />
      )}
    </div>
  );
}
