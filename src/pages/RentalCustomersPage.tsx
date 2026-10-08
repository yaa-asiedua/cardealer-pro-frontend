import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Plus, Repeat, RotateCcw, UserCheck, Users } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { CustomerStatusBadge } from "../components/customers/CustomerBadges";
import { api, ApiError } from "../lib/api-client";
import { CUSTOMER_STATUS_LABELS } from "../lib/customer-helpers";
import { formatDate } from "../lib/format";
import { customerDisplayName } from "../types/customer";
import type { Customer, CustomerListResult, CustomerStatus, CustomerType } from "../types/customer";

function weekBounds(weeksAgo: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
  return d;
}

function percentChange(current: number, previous: number): string | undefined {
  if (previous === 0) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change vs last week";
  return `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}% vs last week`;
}

// Rental Salesperson's own Customers list — reconciled against
// rentals_pages/customers.jpeg. Modeled on MyCustomersPage.tsx (same
// /customers endpoint, already scoped to this salesperson's own records).
// Two mockup details don't map to anything real: the "CUST-001" style
// reference number (no such field on Customer — replaced with the real
// createdAt, same substitution MyCustomersPage already makes) and the
// "Customer Types" sidebar panel (Individual/Corporate/Walk-in/Repeat
// Customer aren't the real CustomerType enum — PURCHASE/RENTAL/BOTH —
// and a rental salesperson's own customers are ~always RENTAL anyway, so
// that breakdown wouldn't show anything useful). Replaced with a real
// Customer Status breakdown (Active/Inactive/Draft) instead of dropping
// the panel outright. Quick Actions similarly swaps the mockup's
// "Import Customers"/"Export List" (no bulk import/export feature exists
// anywhere in this backend) for "New Rental"/"My Rentals" — both real.
export function RentalCustomersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<CustomerType | "">("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<CustomerListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bulk, setBulk] = useState<Customer[] | null>(null);
  const [recent, setRecent] = useState<Customer[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("customerType", typeFilter);

    api
      .get<CustomerListResult>(`/customers?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load customers"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, statusFilter, typeFilter]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    // Bulk fetch powers New/Returning KPIs, the status breakdown and the
    // Recent Customers panel — same bounded-accuracy tradeoff already
    // accepted elsewhere (MyCustomersPage's "New This Month",
    // FollowupsPage's pill counts): accurate up to the 100 most recent.
    api
      .get<CustomerListResult>("/customers?pageSize=100")
      .then((res) => {
        setBulk(res.data);
        setRecent(res.data.slice(0, 5));
      })
      .catch(() => {
        setBulk(null);
        setRecent([]);
      });
  }, []);

  useEffect(loadSummary, [loadSummary]);

  const kpis = useMemo(() => {
    if (!bulk) return null;
    const weekAgo = weekBounds(1);
    const twoWeeksAgo = weekBounds(2);
    const newThisWeek = bulk.filter((c) => new Date(c.createdAt) >= weekAgo).length;
    const returning = bulk.filter((c) => c.rentalCount > 1).length;
    const active = bulk.filter((c) => c.status === "ACTIVE").length;
    return {
      total: result?.meta.total ?? bulk.length,
      active,
      newThisWeek,
      newLastWeek: bulk.filter((c) => new Date(c.createdAt) >= twoWeeksAgo && new Date(c.createdAt) < weekAgo).length,
      returning,
    };
  }, [bulk, result]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<CustomerStatus, number> = { ACTIVE: 0, INACTIVE: 0, DRAFT: 0 };
    for (const c of bulk ?? []) counts[c.status]++;
    return counts;
  }, [bulk]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Customers</h1>
            <p className="text-sm text-muted">Manage your rental customers and view their rental history.</p>
          </div>
        </div>
        <Link
          to="/customers/new"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={14} /> Add Customer
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Customers" value={kpis ? String(kpis.total) : "—"} icon={Users} />
        <KpiCard label="Active Customers" value={kpis ? String(kpis.active) : "—"} icon={UserCheck} tone="success" />
        <KpiCard
          label="New Customers"
          value={kpis ? String(kpis.newThisWeek) : "—"}
          sublabel={kpis ? (percentChange(kpis.newThisWeek, kpis.newLastWeek) ?? "This week") : undefined}
          icon={Plus}
        />
        <KpiCard label="Returning Customers" value={kpis ? String(kpis.returning) : "—"} icon={Repeat} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or ID number…"
          className="w-full sm:w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CustomerStatus | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CustomerType | "")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
        >
          <option value="">All Customer Types</option>
          <option value="RENTAL">Rental</option>
          <option value="PURCHASE">Purchase</option>
          <option value="BOTH">Both</option>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">
            Customer List ({result?.meta.total ?? 0})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">ID Type &amp; Number</th>
                  <th className="px-4 py-3 font-semibold">Driver's Licence</th>
                  <th className="px-4 py-3 text-right font-semibold">Total Rentals</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      Loading…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-danger">
                      {error}
                    </td>
                  </tr>
                ) : !result || result.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      No customers match these filters.
                    </td>
                  </tr>
                ) : (
                  result.data.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-muted">
                            {c.profilePhotoUrl ? (
                              <img src={c.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Users size={16} />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-ink">{customerDisplayName(c)}</div>
                            <div className="text-xs text-muted">Joined {formatDate(c.createdAt)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink">{c.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {c.idType ?? "—"}
                        {c.idNumber && <div>{c.idNumber}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {c.driverLicenseNo ? (
                          <>
                            <div>{c.driverLicenseNo}</div>
                            {c.licenseExpiry && <div>Exp: {formatDate(c.licenseExpiry)}</div>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{c.rentalCount}</td>
                      <td className="px-4 py-3">
                        <CustomerStatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {result && result.meta.pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <span className="text-muted">
                Showing {(result.meta.page - 1) * result.meta.pageSize + 1}–
                {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} customers
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

        <div className="flex flex-col gap-4">
          <SectionCard title="Recent Customers">
            {!bulk || recent.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center">
                {!bulk ? <Loader2 size={20} className="animate-spin text-action" /> : <p className="text-sm text-muted">No customers yet.</p>}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recent.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-muted">
                      {c.profilePhotoUrl ? (
                        <img src={c.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Users size={14} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{customerDisplayName(c)}</div>
                      <div className="text-xs text-muted">Joined {formatDate(c.createdAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Customer Status">
            <ul className="flex flex-col gap-2 text-sm">
              {(Object.keys(statusBreakdown) as CustomerStatus[]).map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <span className="text-muted">{CUSTOMER_STATUS_LABELS[s]}</span>
                  <span className="font-medium text-ink">{statusBreakdown[s]}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/customers/new"
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
              >
                <Plus size={18} className="text-action" />
                Add Customer
              </Link>
              <Link
                to="/rentals/new"
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
              >
                <CheckCircle2 size={18} className="text-action" />
                New Rental
              </Link>
              <Link
                to="/rentals"
                className="col-span-2 flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs font-medium text-ink hover:bg-surface"
              >
                <Repeat size={18} className="text-action" />
                My Rentals
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>

    </div>
  );
}
