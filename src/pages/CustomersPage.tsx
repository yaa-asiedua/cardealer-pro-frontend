import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
  UserCheck,
  Users,
} from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { CustomerStatusBadge, CustomerTypeBadge } from "../components/customers/CustomerBadges";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatDate } from "../lib/format";
import { customerDisplayName } from "../types/customer";
import type { Customer, CustomerListResult, CustomerStatus, CustomerType } from "../types/customer";
import { RowMenu } from "../components/RowMenu";
import { useAutoRefresh } from "../lib/use-auto-refresh";

interface Kpis {
  total: number;
  newThisMonth: number;
  salesCustomers: number;
  rentalCustomers: number;
  active: number;
}

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<CustomerListResult>(`/customers?${query}`);
  return res.meta.total;
}

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CustomerType | "">("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "">("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<CustomerListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, statusFilter]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter) params.set("customerType", typeFilter);
    if (statusFilter) params.set("status", statusFilter);

    api
      .get<CustomerListResult>(`/customers?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load customers"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, typeFilter, statusFilter]);

  const loadKpis = useCallback(() => {
    Promise.all([
      fetchCount({}),
      fetchCount({ customerType: "PURCHASE" }),
      fetchCount({ customerType: "RENTAL" }),
      fetchCount({ customerType: "BOTH" }),
      fetchCount({ status: "ACTIVE" }),
    ])
      .then(([total, purchase, rental, both, active]) => {
        setKpis({ total, salesCustomers: purchase + both, rentalCustomers: rental + both, active, newThisMonth: 0 });
      })
      .catch(() => undefined);

    // "New this month" — among the most recently created (list already
    // orders by createdAt desc), same "accurate up to the fetched page"
    // tradeoff as Inventory's aging check.
    api
      .get<CustomerListResult>("/customers?pageSize=100")
      .then((res) => {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const count = res.data.filter((c) => new Date(c.createdAt) >= monthStart).length;
        setKpis((prev) => (prev ? { ...prev, newThisMonth: count } : prev));
      })
      .catch(() => undefined);
  }, []);

  useEffect(loadList, [loadList]);

  useAutoRefresh(loadList);
  useEffect(loadKpis, [loadKpis]);
  useAutoRefresh(loadKpis);

  function resetFilters() {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
  }

  function selectCustomer(id: string) {
    setSelectedId(id);
    setIsLoadingDetail(true);
    api
      .get<{ customer: Customer }>(`/customers/${id}`)
      .then((res) => setSelected(res.customer))
      .catch(() => setSelected(null))
      .finally(() => setIsLoadingDetail(false));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total Customers" value={kpis ? String(kpis.total) : "—"} icon={Users} />
        <KpiCard label="New This Month" value={kpis ? String(kpis.newThisMonth) : "—"} icon={Plus} tone="success" />
        <KpiCard label="Sales Customers" value={kpis ? String(kpis.salesCustomers) : "—"} icon={Banknote} />
        <KpiCard label="Rental Customers" value={kpis ? String(kpis.rentalCustomers) : "—"} icon={Users} />
        <KpiCard label="Active" value={kpis ? String(kpis.active) : "—"} icon={UserCheck} tone="success" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by name, phone, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CustomerType | "")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Customer Types</option>
            <option value="PURCHASE">Purchase</option>
            <option value="RENTAL">Rental</option>
            <option value="BOTH">Both</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CustomerStatus | "")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="DRAFT">Draft</option>
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

        <Link
          to="/customers/new"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <Plus size={16} />
          Add Customer
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="sticky-actions w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Transactions</th>
                  <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {isLoading && !result ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      Loading…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-danger">
                      {error}
                    </td>
                  </tr>
                ) : !result || result.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      No customers match these filters.
                    </td>
                  </tr>
                ) : (
                  result.data.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => selectCustomer(c.id)}
                      className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selectedId === c.id ? "bg-action/5" : ""}`}
                    >
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
                            <div className="text-xs text-muted">{formatDate(c.createdAt)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <div>{c.phone ?? "—"}</div>
                        <div>{c.email ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <CustomerTypeBadge type={c.customerType} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{c.transactionCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">
                        {c.outstandingBalance > 0 ? formatCurrency(c.outstandingBalance) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <CustomerStatusBadge status={c.status} />
                      </td>
                      <td className="relative px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            setMenuAnchor(e.currentTarget);
                            setOpenMenuId(openMenuId === c.id ? null : c.id);
                          }}
                          aria-expanded={openMenuId === c.id}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
                          aria-label="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === c.id && menuAnchor && (
                          <RowMenu anchor={menuAnchor} onClose={() => setOpenMenuId(null)} className="w-36">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                selectCustomer(c.id);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface"
                            >
                              View Details
                            </button>
                          </RowMenu>
                        )}
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

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {!selectedId ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
              <Users size={24} className="text-muted" />
              <p className="text-sm text-muted">Select a customer to view details.</p>
            </div>
          ) : isLoadingDetail || !selected ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 size={22} className="animate-spin text-action" />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-muted">
                  {selected.profilePhotoUrl ? (
                    <img src={selected.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Users size={20} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{customerDisplayName(selected)}</p>
                  <p className="text-xs text-muted">{selected.phone ?? selected.email ?? "No contact on file"}</p>
                </div>
                <CustomerStatusBadge status={selected.status} />
              </div>

              <dl className="flex flex-col gap-2 py-4 text-sm">
                <Row label="Total Spent" value={formatCurrency(selected.totalSpent)} />
                <Row label="Last Purchase" value={selected.lastPurchaseDate ? formatDate(selected.lastPurchaseDate) : "—"} />
                <Row label="Last Rental" value={selected.lastRentalDate ? formatDate(selected.lastRentalDate) : "—"} />
                <Row
                  label="Outstanding Balance"
                  value={selected.outstandingBalance > 0 ? formatCurrency(selected.outstandingBalance) : formatCurrency(0)}
                />
                <Row label="Customer Type" value={<CustomerTypeBadge type={selected.customerType} />} />
              </dl>

              <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
                <Link to={`/customers/${selected.id}/edit`} className="rounded-lg bg-action px-3 py-2 text-center font-semibold text-white hover:bg-primary">
                  View / Edit Profile
                </Link>
                <Link to="/sales" className="text-center text-action hover:underline">
                  View Sales
                </Link>
                <Link to="/rentals" className="text-center text-action hover:underline">
                  View Rentals
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
