import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  Download,
  Percent,
  Repeat,
  RotateCcw,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";
import { KpiCard } from "../components/dashboard/KpiCard";
import { SectionCard } from "../components/dashboard/SectionCard";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { useChartTheme } from "../lib/chart-theme";
import { downloadCsv } from "../lib/csv";
import { formatCurrency, formatCurrencyCompact, formatDate } from "../lib/format";
import { CATEGORY_COLORS } from "../lib/revenue-helpers";
import { CHART_PALETTE, percentChange, REPORT_TYPE_LABELS } from "../lib/report-helpers";
import type { ReportType } from "../lib/report-helpers";
import type { SalesReport } from "../types/sale";
import type { RentalsReport } from "../types/rental";
import type { ServiceReport } from "../types/service";
import type { FinancingReport } from "../types/financing";
import type { RevenueOverview } from "../types/revenue";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function prevPeriod(fromISO: string, toISO: string): { from: string; to: string } {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  const periodMs = Math.max(to.getTime() - from.getTime(), 0);
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(from.getTime() - periodMs - 86_400_000);
  return { from: isoDate(prevFrom), to: isoDate(prevTo) };
}

async function fetchCount(path: string, params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, pageSize: "1" }).toString();
  const res = await api.get<{ meta: { total: number } }>(`${path}?${query}`);
  return res.meta.total;
}

interface SimpleCounts {
  labels: string[];
  values: number[];
}

const REPORT_TYPE_OPTIONS: ReportType[] = [
  "ALL",
  "SALES",
  "INVENTORY",
  "RENTALS",
  "SERVICE",
  "FINANCING",
  "REVENUE",
  "CUSTOMERS",
  "EMPLOYEES",
  "TRANSFERS",
];

export function ReportsPage() {
  const { showToast } = useToast();
  const today = new Date();

  const [dateFrom, setDateFrom] = useState(isoDate(monthStart(today)));
  const [dateTo, setDateTo] = useState(isoDate(today));
  const [reportType, setReportType] = useState<ReportType>("ALL");

  const [appliedFrom, setAppliedFrom] = useState(dateFrom);
  const [appliedTo, setAppliedTo] = useState(dateTo);
  const [appliedType, setAppliedType] = useState<ReportType>("ALL");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sales, setSales] = useState<SalesReport | null>(null);
  const [prevSales, setPrevSales] = useState<SalesReport | null>(null);
  const [rentals, setRentals] = useState<RentalsReport | null>(null);
  const [prevRentals, setPrevRentals] = useState<RentalsReport | null>(null);
  const [service, setService] = useState<ServiceReport | null>(null);
  const [prevService, setPrevService] = useState<ServiceReport | null>(null);
  const [financing, setFinancing] = useState<FinancingReport | null>(null);
  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);
  const [simpleCounts, setSimpleCounts] = useState<SimpleCounts | null>(null);

  const loadAll = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const { from: prevFrom, to: prevTo } = prevPeriod(appliedFrom, appliedTo);
    const qs = `dateFrom=${appliedFrom}&dateTo=${appliedTo}`;
    const prevQs = `dateFrom=${prevFrom}&dateTo=${prevTo}`;

    const needs = (t: ReportType) => appliedType === "ALL" || appliedType === t;

    const tasks: Promise<void>[] = [];

    if (needs("SALES") || appliedType === "ALL") {
      tasks.push(
        api
          .get<{ report: SalesReport }>(`/reports/sales?${qs}`)
          .then((res) => setSales(res.report))
          .catch(() => setSales(null))
      );
      if (appliedType === "ALL") {
        tasks.push(
          api
            .get<{ report: SalesReport }>(`/reports/sales?${prevQs}`)
            .then((res) => setPrevSales(res.report))
            .catch(() => setPrevSales(null))
        );
      }
    }
    if (needs("RENTALS") || appliedType === "ALL") {
      tasks.push(
        api
          .get<{ report: RentalsReport }>(`/reports/rentals?${qs}`)
          .then((res) => setRentals(res.report))
          .catch(() => setRentals(null))
      );
      if (appliedType === "ALL") {
        tasks.push(
          api
            .get<{ report: RentalsReport }>(`/reports/rentals?${prevQs}`)
            .then((res) => setPrevRentals(res.report))
            .catch(() => setPrevRentals(null))
        );
      }
    }
    if (needs("SERVICE") || appliedType === "ALL") {
      tasks.push(
        api
          .get<{ report: ServiceReport }>(`/reports/service?${qs}`)
          .then((res) => setService(res.report))
          .catch(() => setService(null))
      );
      if (appliedType === "ALL") {
        tasks.push(
          api
            .get<{ report: ServiceReport }>(`/reports/service?${prevQs}`)
            .then((res) => setPrevService(res.report))
            .catch(() => setPrevService(null))
        );
      }
    }
    if (needs("FINANCING")) {
      tasks.push(
        api
          .get<{ report: FinancingReport }>(`/reports/finance?${qs}`)
          .then((res) => setFinancing(res.report))
          .catch(() => setFinancing(null))
      );
    }
    if (needs("REVENUE") || appliedType === "ALL") {
      tasks.push(
        api
          .get<{ report: RevenueOverview }>(`/reports/revenue?${qs}`)
          .then((res) => setRevenue(res.report))
          .catch(() => setRevenue(null))
      );
    }
    if (needs("INVENTORY")) {
      tasks.push(
        Promise.all([
          fetchCount("/vehicles", {}),
          fetchCount("/vehicles", { status: "AVAILABLE" }),
          fetchCount("/vehicles", { purpose: "FOR_SALE" }),
          fetchCount("/vehicles", { purpose: "FOR_RENT" }),
          fetchCount("/vehicles", { status: "UNDER_MAINTENANCE" }),
          fetchCount("/vehicles", { status: "SOLD" }),
        ]).then(([total, available, forSale, forRent, inService, sold]) =>
          setSimpleCounts({
            labels: ["Total", "Available", "For Sale", "For Rent", "In Service", "Sold"],
            values: [total, available, forSale, forRent, inService, sold],
          })
        )
      );
    }
    if (needs("CUSTOMERS")) {
      tasks.push(
        Promise.all([
          fetchCount("/customers", {}),
          fetchCount("/customers", { customerType: "PURCHASE" }),
          fetchCount("/customers", { customerType: "RENTAL" }),
          fetchCount("/customers", { customerType: "BOTH" }),
          fetchCount("/customers", { status: "ACTIVE" }),
        ]).then(([total, purchase, rental, both, active]) =>
          setSimpleCounts({ labels: ["Total", "Purchase", "Rental", "Both", "Active"], values: [total, purchase, rental, both, active] })
        )
      );
    }
    if (needs("EMPLOYEES")) {
      tasks.push(
        Promise.all([
          fetchCount("/admin/users", {}),
          fetchCount("/admin/users", { status: "ACTIVE" }),
          fetchCount("/admin/users", { status: "ON_LEAVE" }),
          fetchCount("/admin/users", { status: "INACTIVE" }),
        ]).then(([total, active, onLeave, inactive]) =>
          setSimpleCounts({ labels: ["Total", "Active", "On Leave", "Inactive"], values: [total, active, onLeave, inactive] })
        )
      );
    }
    if (needs("TRANSFERS")) {
      tasks.push(
        Promise.all([
          fetchCount("/transfers", {}),
          fetchCount("/transfers", { status: "PENDING" }),
          fetchCount("/transfers", { status: "SUBMITTED_TO_REGISTRY" }),
          fetchCount("/transfers", { status: "COMPLETED" }),
        ]).then(([total, pending, submitted, completed]) =>
          setSimpleCounts({ labels: ["Total", "Pending", "Submitted", "Completed"], values: [total, pending, submitted, completed] })
        )
      );
    }

    Promise.all(tasks)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load reports"))
      .finally(() => setIsLoading(false));
  }, [appliedFrom, appliedTo, appliedType]);

  useEffect(loadAll, [loadAll]);

  function handleApply() {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setAppliedType(reportType);
  }

  function handleReset() {
    const from = isoDate(monthStart(today));
    const to = isoDate(today);
    setDateFrom(from);
    setDateTo(to);
    setReportType("ALL");
    setAppliedFrom(from);
    setAppliedTo(to);
    setAppliedType("ALL");
  }

  function handleExport() {
    if (appliedType === "ALL") {
      if (!sales || !rentals || !service) {
        showToast("Nothing to export yet", "error");
        return;
      }
      downloadCsv(`reports-summary-${appliedFrom}-to-${appliedTo}.csv`, ["Metric", "Value"], [
        ["Total Sales", sales.totals.revenue],
        ["Vehicles Sold", sales.totals.count],
        ["Rental Revenue", rentals.totals.revenue],
        ["Service Revenue", service.totals.revenue],
      ]);
    } else if (appliedType === "SALES" && sales) {
      downloadCsv(
        `sales-report-${appliedFrom}-to-${appliedTo}.csv`,
        ["Salesperson", "Sales Count", "Revenue", "Commission"],
        sales.bySalesperson.map((r) => [r.fullName, r.count, r.revenue, r.commission])
      );
    } else if (appliedType === "RENTALS" && rentals) {
      downloadCsv(
        `rentals-report-${appliedFrom}-to-${appliedTo}.csv`,
        ["Vehicle", "Registration", "Booking Count", "Revenue"],
        rentals.byVehicle.map((r) => [`${r.make} ${r.model}`, r.registrationNo ?? "", r.bookingCount, r.revenue])
      );
    } else if (appliedType === "SERVICE" && service) {
      downloadCsv(
        `service-report-${appliedFrom}-to-${appliedTo}.csv`,
        ["Mechanic", "Jobs Completed", "Revenue"],
        service.byMechanic.map((r) => [r.fullName, r.jobCount, r.revenue])
      );
    } else if (appliedType === "FINANCING" && financing) {
      downloadCsv(`financing-report-${appliedFrom}-to-${appliedTo}.csv`, ["Metric", "Value"], [
        ["Loan Count", financing.loanCount],
        ["Total Principal", financing.totalPrincipal],
        ["Outstanding Loans", financing.outstandingLoans],
        ["Collection Rate %", financing.collectionRatePercent],
      ]);
    } else if (appliedType === "REVENUE" && revenue) {
      downloadCsv(
        `revenue-report-${appliedFrom}-to-${appliedTo}.csv`,
        ["Category", "Amount", "Percent"],
        revenue.byCategory.map((c) => [c.category, c.amount, c.percent])
      );
    } else if (simpleCounts) {
      downloadCsv(
        `${REPORT_TYPE_LABELS[appliedType].toLowerCase().replace(/\s+/g, "-")}-report-${appliedFrom}-to-${appliedTo}.csv`,
        ["Metric", "Count"],
        simpleCounts.labels.map((l, i) => [l, simpleCounts.values[i]])
      );
    } else {
      showToast("Nothing to export yet", "error");
      return;
    }
    showToast("Report exported");
  }

  const salesMom = sales && prevSales ? percentChange(sales.totals.revenue, prevSales.totals.revenue) : null;
  const vehiclesMom = sales && prevSales ? percentChange(sales.totals.count, prevSales.totals.count) : null;
  const rentalsMom = rentals && prevRentals ? percentChange(rentals.totals.revenue, prevRentals.totals.revenue) : null;
  const serviceMom = service && prevService ? percentChange(service.totals.revenue, prevService.totals.revenue) : null;

  function momSublabel(pct: number | null): string | undefined {
    if (pct === null) return undefined;
    return `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs previous period`;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-ink">Date Range</span>
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
              <span className="text-muted">–</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-ink">Report Type</span>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className={inputCls}>
              {REPORT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {REPORT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleApply} className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary">
            Apply
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          <Download size={16} />
          Export Report
        </button>
      </div>

      {isLoading ? (
        <div className="mt-8 flex justify-center text-sm text-muted">Loading…</div>
      ) : error ? (
        <div className="mt-8 text-center text-sm text-danger">{error}</div>
      ) : appliedType === "ALL" ? (
        <AllReportsView
          sales={sales}
          rentals={rentals}
          service={service}
          revenue={revenue}
          salesMom={salesMom}
          vehiclesMom={vehiclesMom}
          rentalsMom={rentalsMom}
          serviceMom={serviceMom}
          momSublabel={momSublabel}
        />
      ) : appliedType === "SALES" ? (
        <SalesReportView report={sales} />
      ) : appliedType === "RENTALS" ? (
        <RentalsReportView report={rentals} />
      ) : appliedType === "SERVICE" ? (
        <ServiceReportView report={service} />
      ) : appliedType === "FINANCING" ? (
        <FinancingReportView report={financing} />
      ) : appliedType === "REVENUE" ? (
        <RevenueReportView report={revenue} />
      ) : (
        <SimpleCountsView title={REPORT_TYPE_LABELS[appliedType]} counts={simpleCounts} />
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

function AllReportsView({
  sales,
  rentals,
  service,
  revenue,
  salesMom,
  vehiclesMom,
  rentalsMom,
  serviceMom,
  momSublabel,
}: {
  sales: SalesReport | null;
  rentals: RentalsReport | null;
  service: ServiceReport | null;
  revenue: RevenueOverview | null;
  salesMom: number | null;
  vehiclesMom: number | null;
  rentalsMom: number | null;
  serviceMom: number | null;
  momSublabel: (pct: number | null) => string | undefined;
}) {
  const { gridStroke, tickFill } = useChartTheme();
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Sales" value={sales ? formatCurrencyCompact(sales.totals.revenue) : "—"} sublabel={momSublabel(salesMom)} icon={TrendingUp} />
        <KpiCard label="Vehicles Sold" value={sales ? String(sales.totals.count) : "—"} sublabel={momSublabel(vehiclesMom)} icon={Banknote} />
        <KpiCard label="Rental Revenue" value={rentals ? formatCurrencyCompact(rentals.totals.revenue) : "—"} sublabel={momSublabel(rentalsMom)} icon={Repeat} />
        <KpiCard label="Service Revenue" value={service ? formatCurrencyCompact(service.totals.revenue) : "—"} sublabel={momSublabel(serviceMom)} icon={Wrench} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SectionCard title="Monthly Sales Trend">
            {!revenue || revenue.series.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenue.series} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(d: string) => formatDate(d)} />
                  <YAxis tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(d) => formatDate(d as string)} />
                  <Line type="monotone" dataKey="sales" name="Sales" stroke={CATEGORY_COLORS.Sales} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Vehicle Sales by Type">
          {!sales || sales.byVehicleType.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No sales in this period.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sales.byVehicleType} dataKey="count" nameKey="vehicleType" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {sales.byVehicleType.map((v, i) => (
                      <Cell key={v.vehicleType} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} vehicle${v === 1 ? "" : "s"}`} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {sales.byVehicleType.map((v, i) => (
                  <li key={v.vehicleType} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                      {v.vehicleType}
                    </span>
                    <span className="text-muted">{v.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        <SectionCard title="Revenue Breakdown">
          {!revenue || revenue.byCategory.every((c) => c.amount === 0) ? (
            <p className="py-10 text-center text-sm text-muted">No revenue in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenue.byCategory} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: tickFill }} />
                <YAxis tick={{ fontSize: 11, fill: tickFill }} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {revenue.byCategory.map((c) => (
                    <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function SalesReportView({ report }: { report: SalesReport | null }) {
  if (!report) return <EmptyState />;
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Sales Count" value={String(report.totals.count)} icon={Banknote} />
        <KpiCard label="Revenue" value={formatCurrencyCompact(report.totals.revenue)} icon={Wallet} />
        <KpiCard label="Commission" value={formatCurrencyCompact(report.totals.commission)} icon={Percent} />
      </div>
      <SectionCard title="By Salesperson">
        <ReportTable
          headers={["Salesperson", "Sales", "Revenue", "Commission"]}
          rows={report.bySalesperson.map((r) => [r.fullName, String(r.count), formatCurrency(r.revenue), formatCurrency(r.commission)])}
        />
      </SectionCard>
    </div>
  );
}

function RentalsReportView({ report }: { report: RentalsReport | null }) {
  if (!report) return <EmptyState />;
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Booking Count" value={String(report.totals.bookingCount)} icon={Repeat} />
        <KpiCard label="Revenue" value={formatCurrencyCompact(report.totals.revenue)} icon={Wallet} />
      </div>
      <SectionCard title="By Vehicle">
        <ReportTable
          headers={["Vehicle", "Registration", "Bookings", "Revenue"]}
          rows={report.byVehicle.map((r) => [`${r.make} ${r.model}`, r.registrationNo ?? "—", String(r.bookingCount), formatCurrency(r.revenue)])}
        />
      </SectionCard>
    </div>
  );
}

function ServiceReportView({ report }: { report: ServiceReport | null }) {
  if (!report) return <EmptyState />;
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Jobs Completed" value={String(report.totals.jobCount)} icon={CheckCircle2} />
        <KpiCard label="Revenue" value={formatCurrencyCompact(report.totals.revenue)} icon={Wrench} />
      </div>
      <SectionCard title="By Mechanic">
        <ReportTable
          headers={["Mechanic", "Jobs", "Revenue"]}
          rows={report.byMechanic.map((r) => [r.fullName, String(r.jobCount), formatCurrency(r.revenue)])}
        />
      </SectionCard>
    </div>
  );
}

function FinancingReportView({ report }: { report: FinancingReport | null }) {
  if (!report) return <EmptyState />;
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Loan Count" value={String(report.loanCount)} icon={BadgeDollarSign} />
      <KpiCard label="Total Principal" value={formatCurrencyCompact(report.totalPrincipal)} icon={Wallet} />
      <KpiCard label="Outstanding" value={formatCurrencyCompact(report.outstandingLoans)} icon={AlertTriangle} />
      <KpiCard label="Collection Rate" value={`${report.collectionRatePercent}%`} icon={TrendingUp} />
    </div>
  );
}

function RevenueReportView({ report }: { report: RevenueOverview | null }) {
  if (!report) return <EmptyState />;
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total Revenue" value={formatCurrencyCompact(report.totals.total)} icon={TrendingUp} />
        <KpiCard label="Sales" value={formatCurrencyCompact(report.totals.sales)} icon={Banknote} />
        <KpiCard label="Rentals" value={formatCurrencyCompact(report.totals.rentals)} icon={Repeat} />
        <KpiCard label="Service" value={formatCurrencyCompact(report.totals.service)} icon={Wrench} />
        <KpiCard label="Financing" value={formatCurrencyCompact(report.totals.financing)} icon={BadgeDollarSign} />
      </div>
      <SectionCard title="By Payment Method">
        <ReportTable headers={["Method", "Amount", "%"]} rows={report.byMethod.map((m) => [m.method, formatCurrency(m.amount), `${m.percent}%`])} />
      </SectionCard>
    </div>
  );
}

function SimpleCountsView({ title, counts }: { title: string; counts: SimpleCounts | null }) {
  if (!counts) return <EmptyState />;
  return (
    <div className="mt-6">
      <SectionCard title={title}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {counts.labels.map((label, i) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{counts.values[i]}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function EmptyState() {
  return <div className="mt-8 text-center text-sm text-muted">No data available for this report.</div>;
}

function ReportTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No data for this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
