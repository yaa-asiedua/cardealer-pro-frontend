import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Package, PackagePlus, RotateCcw, X } from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { PartRequestStatusBadge } from "../components/service/ServiceBadges";
import { RequestPartsModal } from "../components/service/RequestPartsModal";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { formatCurrency, formatDateTime } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import type { PartRequest, PartRequestListResult, PartRequestStatus, ServiceJob, ServiceJobListResult } from "../types/service";
import { ModalOverlay } from "../components/ModalOverlay";

type Tab = "" | PartRequestStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: "", label: "All Requests" },
  { key: "REQUESTED", label: "Requested" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "FULFILLED", label: "Fulfilled" },
];

async function fetchCount(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<PartRequestListResult>(`/service/parts-requests?${query}`);
  return res.meta.total;
}

const STATUS_COLORS: Record<string, string> = {
  Requested: "#d97706",
  Approved: "#2563eb",
  Rejected: "#dc2626",
  Fulfilled: "#16a34a",
};
const PART_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#94a3b8"];

// Reconciled against mechanic_pages/parts and inventory.jpeg — and the
// title doesn't survive reconciliation intact. The mockup depicts a
// full stock-keeping system (part catalog with SKUs/categories/brands,
// stock quantities, reorder levels, suppliers, shelf locations, stock
// adjustment, a stock-movement ledger) — none of which exists anywhere.
// Checked the same way as Vehicle Inspections: no Part/Supplier/Stock
// model in the schema, and zero mentions of "stock"/"supplier"/
// "reorder" in any of the 6 design documents (the PRD's only "parts"
// references are all about the existing ServicePart cost line-item,
// e.g. "Record parts, labour and total service cost"). Unlike
// Inspections, though, there IS a real, smaller feature inside this
// mockup: PartRequest, the requisition workflow already built this
// session — this page is that, not a stock system. nav-config.ts
// already anticipated this during the Dashboard round (labeled "Parts
// Requests", not "Parts & Inventory").
//
// Dropped, same reasoning: Total/In Stock/Low Stock/Out of Stock KPIs,
// the Part Details panel's stock/reorder/location/supplier fields, the
// "Adjust Stock"/"+ Add New Part" actions, "Recent Inventory Activity"
// (a stock-movement ledger — substituted with a real "Recent Requests"
// list), and "Top Part Categories" (PartRequest has no category field —
// substituted with a real "Most Requested Parts" breakdown by name).
//
// GET /service/parts-requests gained a `search` param this round
// (partName/requestNumber) — it only ever supported `status` before,
// which would have made this page's search box decorative.
export function PartsRequestsPage() {
  const [tab, setTab] = useState<Tab>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<PartRequestListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tabCounts, setTabCounts] = useState<Record<Tab, number | null>>({
    "": null,
    REQUESTED: null,
    APPROVED: null,
    REJECTED: null,
    FULFILLED: null,
  });
  const [allRequests, setAllRequests] = useState<PartRequest[]>([]);

  const [selected, setSelected] = useState<PartRequest | null>(null);
  const [pickingJob, setPickingJob] = useState(false);
  const [myOpenJobs, setMyOpenJobs] = useState<ServiceJob[]>([]);
  const [requestingPartsJob, setRequestingPartsJob] = useState<ServiceJob | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const loadList = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (tab) params.set("status", tab);

    api
      .get<PartRequestListResult>(`/service/parts-requests?${params.toString()}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load parts requests"))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, tab]);

  useEffect(loadList, [loadList]);

  const loadSummary = useCallback(() => {
    Promise.all([
      fetchCount({}),
      fetchCount({ status: "REQUESTED" }),
      fetchCount({ status: "APPROVED" }),
      fetchCount({ status: "REJECTED" }),
      fetchCount({ status: "FULFILLED" }),
    ]).then(([all, requested, approved, rejected, fulfilled]) =>
      setTabCounts({ "": all, REQUESTED: requested, APPROVED: approved, REJECTED: rejected, FULFILLED: fulfilled })
    );

    api
      .get<PartRequestListResult>("/service/parts-requests?pageSize=100")
      .then((res) => setAllRequests(res.data))
      .catch(() => setAllRequests([]));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  function refreshAll() {
    loadList();
    loadSummary();
  }

  const recentRequests = useMemo(() => allRequests.slice(0, 5), [allRequests]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<PartRequestStatus, number> = { REQUESTED: 0, APPROVED: 0, REJECTED: 0, FULFILLED: 0 };
    for (const r of allRequests) counts[r.status]++;
    return [
      { key: "Requested", value: counts.REQUESTED, color: STATUS_COLORS.Requested },
      { key: "Approved", value: counts.APPROVED, color: STATUS_COLORS.Approved },
      { key: "Rejected", value: counts.REJECTED, color: STATUS_COLORS.Rejected },
      { key: "Fulfilled", value: counts.FULFILLED, color: STATUS_COLORS.Fulfilled },
    ].filter((d) => d.value > 0);
  }, [allRequests]);

  const partBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRequests) counts.set(r.partName, (counts.get(r.partName) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [allRequests]);

  const { gridStroke, tickFill } = useChartTheme();

  function resetFilters() {
    setSearch("");
    setTab("");
  }

  function openJobPicker() {
    api
      .get<ServiceJobListResult>("/service/jobs?pageSize=100")
      .then((res) => setMyOpenJobs(res.data.filter((j) => j.status === "PENDING" || j.status === "IN_PROGRESS")))
      .catch(() => setMyOpenJobs([]));
    setPickingJob(true);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action/10 text-action">
            <Package size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Parts Requests</h1>
            <p className="text-sm text-muted">Request and track parts needed for your service jobs.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openJobPicker}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
        >
          <PackagePlus size={16} />
          Request Parts
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Requests" value={String(tabCounts[""] ?? "—")} sublabel="All-time" icon={Package} />
        <KpiCard
          label="Requested"
          value={String(tabCounts.REQUESTED ?? "—")}
          sublabel="Awaiting review"
          icon={Package}
          tone={(tabCounts.REQUESTED ?? 0) > 0 ? "warning" : "default"}
        />
        <KpiCard label="Approved" value={String(tabCounts.APPROVED ?? "—")} sublabel="Awaiting fulfillment" icon={Package} />
        <KpiCard label="Fulfilled" value={String(tabCounts.FULFILLED ?? "—")} sublabel="All-time" icon={Package} tone="success" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key || "ALL"}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t.key ? "bg-action text-white" : "border border-border text-ink hover:bg-surface"
                }`}
              >
                {t.label} ({tabCounts[t.key] ?? "—"})
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by part name or request no…"
              className="w-full sm:w-64 rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-surface"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-semibold">Request No.</th>
                    <th className="px-4 py-3 font-semibold">Part</th>
                    <th className="px-4 py-3 font-semibold">Service Job</th>
                    <th className="px-4 py-3 text-right font-semibold">Est. Cost</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-danger">
                        {error}
                      </td>
                    </tr>
                  ) : !result || result.data.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted">
                        No parts requests match these filters.
                      </td>
                    </tr>
                  ) : (
                    result.data.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${selected?.id === r.id ? "bg-action/5" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-action">{r.requestNumber}</td>
                        <td className="px-4 py-3 text-ink">
                          {r.partName} <span className="text-xs text-muted">×{r.quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {r.serviceJob.jobNumber} · {vehicleDisplayName(r.serviceJob.vehicle)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">
                          {r.estimatedCost ? formatCurrency(r.estimatedCost) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <PartRequestStatusBadge status={r.status} />
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
                  {Math.min(result.meta.page * result.meta.pageSize, result.meta.total)} of {result.meta.total} requests
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
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Request Details">
            {!selected ? (
              <p className="py-6 text-center text-sm text-muted">Select a request to view its details.</p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <div className="font-medium text-ink">{selected.requestNumber}</div>
                  <div className="text-xs text-muted">
                    {selected.serviceJob.jobNumber} · {vehicleDisplayName(selected.serviceJob.vehicle)}
                  </div>
                </div>
                <dl className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between"><dt className="text-muted">Part</dt><dd className="text-ink">{selected.partName}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Quantity</dt><dd className="text-ink">{selected.quantity}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Est. Cost</dt><dd className="text-ink">{selected.estimatedCost ? formatCurrency(selected.estimatedCost) : "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Status</dt><dd><PartRequestStatusBadge status={selected.status} /></dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Requested</dt><dd className="text-ink">{formatDateTime(selected.createdAt)}</dd></div>
                  {selected.reviewedAt && (
                    <div className="flex justify-between"><dt className="text-muted">Reviewed</dt><dd className="text-ink">{formatDateTime(selected.reviewedAt)}</dd></div>
                  )}
                  {selected.fulfilledAt && (
                    <div className="flex justify-between"><dt className="text-muted">Fulfilled</dt><dd className="text-ink">{formatDateTime(selected.fulfilledAt)}</dd></div>
                  )}
                </dl>
                {selected.notes && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-ink">Notes</div>
                    <p className="text-xs text-muted">{selected.notes}</p>
                  </div>
                )}
                {selected.rejectionReason && (
                  <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2">
                    <div className="mb-1 text-xs font-medium text-danger">Rejection Reason</div>
                    <p className="text-xs text-danger">{selected.rejectionReason}</p>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent Requests">
            {recentRequests.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No requests yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentRequests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{r.partName}</div>
                      <div className="truncate text-xs text-muted">{r.serviceJob.jobNumber}</div>
                    </div>
                    <PartRequestStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Request Status">
          {statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No requests yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="key" innerRadius={44} outerRadius={70} paddingAngle={2}>
                    {statusBreakdown.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <div className="text-2xl font-semibold tabular-nums text-ink">{allRequests.length}</div>
                <p className="mb-2 text-xs text-muted">Requests (up to 100 most recent)</p>
                <ul className="flex flex-col gap-1.5 text-xs">
                  {statusBreakdown.map((d) => (
                    <li key={d.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.key}
                      </span>
                      <span className="font-medium text-ink">
                        {d.value} ({Math.round((d.value / allRequests.length) * 100)}%)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Most Requested Parts">
          {partBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No requests yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart accessibilityLayer data={partBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={{ fill: tickFill, fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fill: tickFill, fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {partBreakdown.map((_, i) => (
                    <Cell key={i} fill={PART_COLORS[i % PART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {pickingJob && (
        <ModalOverlay onClose={() => setPickingJob(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Select a Job</h2>
              <button type="button" onClick={() => setPickingJob(false)} className="text-muted hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {myOpenJobs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                No Pending or In Progress jobs assigned to you. Parts requests must be tied to an active job.
              </p>
            ) : (
              <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto">
                {myOpenJobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickingJob(false);
                        setRequestingPartsJob(j);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 py-2.5 text-left text-sm hover:bg-surface"
                    >
                      <span className="font-medium text-ink">
                        {j.jobNumber} · {vehicleDisplayName(j.vehicle)}
                      </span>
                      <span className="text-xs text-muted">{j.serviceType?.name ?? j.issueDescription ?? "No service type set"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ModalOverlay>
      )}

      {requestingPartsJob && (
        <RequestPartsModal
          job={requestingPartsJob}
          onClose={() => setRequestingPartsJob(null)}
          onRequested={() => {
            setRequestingPartsJob(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}
