import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Calendar,
  Car,
  Check,
  CreditCard,
  FileText,
  Fuel,
  Gauge,
  Plus,
  Loader2,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatDate } from "../lib/format";
import { paymentMethodLabel } from "../lib/revenue-helpers";
import { PAYMENT_METHOD_OPTIONS } from "../lib/sale-helpers";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { SearchSelect } from "../components/SearchSelect";
import { StatusBadge } from "../components/StatusBadge";
import { customerDisplayName } from "../types/customer";
import type { Customer, CustomerListResult } from "../types/customer";
import type { CreateSaleInput } from "../types/sale";
import type { Vehicle, VehicleListResult } from "../types/vehicle";

interface SalespersonOption {
  id: string;
  fullName: string;
}

const STEPS = [
  { n: 1, title: "Vehicle & Customer", subtitle: "Select a vehicle and customer" },
  { n: 2, title: "Sale Details", subtitle: "Pricing and terms" },
  { n: 3, title: "Payment", subtitle: "Payment information" },
  { n: 4, title: "Review & Confirm", subtitle: "Review and complete" },
];

export function SaleFormPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [activeStep, setActiveStep] = useState(1);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerTab, setCustomerTab] = useState<"search" | "new">("search");
  const [newCustomer, setNewCustomer] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [salespeople, setSalespeople] = useState<SalespersonOption[] | null>(null);
  const [salespersonId, setSalespersonId] = useState("");

  const [sellingPrice, setSellingPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");

  const [includeTradeIn, setIncludeTradeIn] = useState(false);
  const [tradeInMake, setTradeInMake] = useState("");
  const [tradeInModel, setTradeInModel] = useState("");
  const [tradeInYear, setTradeInYear] = useState("");
  const [tradeInValue, setTradeInValue] = useState("");
  const [tradeInOutstandingLoan, setTradeInOutstandingLoan] = useState("0");

  const [saleType, setSaleType] = useState<"OUTRIGHT" | "FINANCING">("OUTRIGHT");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [firstPaymentDue, setFirstPaymentDue] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ data: SalespersonOption[] }>("/admin/users?roleCode=SALES_SALESPERSON&status=ACTIVE&pageSize=100")
      .then((res) => setSalespeople(res.data))
      .catch(() => setSalespeople([]));
  }, [isAdmin]);

  const fetchVehicles = useCallback(async (query: string) => {
    const res = await api.get<VehicleListResult>(`/vehicles?status=AVAILABLE&search=${encodeURIComponent(query)}&pageSize=20`);
    // A sale needs a selling price to prefill — a rental-only vehicle (no
    // sellingPrice) can't be sold through this form.
    return res.data.filter((v) => v.sellingPrice);
  }, []);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await api.get<CustomerListResult>(`/customers?search=${encodeURIComponent(query)}&pageSize=8`);
    return res.data;
  }, []);

  function handleSelectVehicle(v: Vehicle) {
    setVehicle(v);
    if (v.sellingPrice) setSellingPrice(v.sellingPrice);
  }

  async function handleCreateCustomer() {
    setError(null);
    if (!newCustomer.firstName.trim() || !newCustomer.lastName.trim()) {
      setError("First and last name are required to create a customer");
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const res = await api.post<{ customer: Customer }>("/customers", {
        firstName: newCustomer.firstName.trim(),
        lastName: newCustomer.lastName.trim(),
        phone: newCustomer.phone.trim() || undefined,
        email: newCustomer.email.trim() || undefined,
      });
      setCustomer(res.customer);
      setNewCustomer({ firstName: "", lastName: "", phone: "", email: "" });
      setCustomerTab("search");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer");
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  const finalPricePreview = useMemo(() => {
    const price = Number(sellingPrice) || 0;
    const disc = Number(discount) || 0;
    return Math.max(0, price - disc);
  }, [sellingPrice, discount]);

  // A trade-in reduces what the customer actually owes, not the recorded
  // sale price or commission (both stay based on finalPrice alone — see
  // sale.service.ts's calculateAmountPayable, which this mirrors).
  const netTradeInValue = useMemo(() => {
    if (!includeTradeIn) return 0;
    const value = Number(tradeInValue) || 0;
    const loan = Number(tradeInOutstandingLoan) || 0;
    return Math.max(0, value - loan);
  }, [includeTradeIn, tradeInValue, tradeInOutstandingLoan]);

  const amountPayable = useMemo(
    () => Math.max(0, finalPricePreview - netTradeInValue),
    [finalPricePreview, netTradeInValue]
  );

  // Flat-rate (simple interest) financing, the standard for auto loans in
  // this market: the stated rate is annual and prorated by the actual term
  // rather than compounding on a shrinking balance — Total Interest =
  // Principal × Rate% × (Term ÷ 12), spread evenly across the term. Matches
  // the read-only "Final Sale Price" pattern above: computed, not entered.
  const calculatedMonthlyPayment = useMemo(() => {
    const principal = Number(principalAmount) || 0;
    const rate = Number(interestRate) || 0;
    const months = Number(termMonths) || 0;
    if (principal <= 0 || months <= 0) return 0;
    const totalInterest = principal * (rate / 100) * (months / 12);
    return (principal + totalInterest) / months;
  }, [principalAmount, interestRate, termMonths]);

  const tradeInValid =
    !includeTradeIn ||
    (tradeInMake.trim() !== "" &&
      tradeInModel.trim() !== "" &&
      tradeInYear !== "" &&
      Number(tradeInValue) > 0 &&
      Number(tradeInOutstandingLoan) <= Number(tradeInValue));

  const stepValid = useMemo(
    () => ({
      1: vehicle !== null && customer !== null,
      2: Number(sellingPrice) > 0 && (!isAdmin || salespersonId !== "") && tradeInValid,
      3: saleType === "OUTRIGHT" || (principalAmount !== "" && interestRate !== "" && termMonths !== ""),
    }),
    [vehicle, customer, sellingPrice, isAdmin, salespersonId, tradeInValid, saleType, principalAmount, interestRate, termMonths]
  );

  const allValid = stepValid[1] && stepValid[2] && stepValid[3];

  function goToStep(n: number) {
    setActiveStep(n);
  }

  function goNext() {
    if (!stepValid[activeStep as 1 | 2 | 3]) return;
    setActiveStep((s) => Math.min(4, s + 1));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vehicle || !customer || !allValid) {
      setError("Please complete all required steps first");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: CreateSaleInput = {
        customerId: customer.id,
        vehicleId: vehicle.id,
        salespersonId: isAdmin ? salespersonId : undefined,
        sellingPrice: Number(sellingPrice),
        discount: Number(discount) || 0,
        paymentMethod: saleType === "OUTRIGHT" ? paymentMethod || undefined : undefined,
        notes: notes.trim() || undefined,
        financing:
          saleType === "FINANCING"
            ? {
                principalAmount: Number(principalAmount),
                interestRate: Number(interestRate),
                termMonths: Number(termMonths),
                monthlyPayment: calculatedMonthlyPayment,
                firstPaymentDue: firstPaymentDue || undefined,
              }
            : undefined,
        tradeIn: includeTradeIn
          ? {
              make: tradeInMake.trim(),
              model: tradeInModel.trim(),
              year: Number(tradeInYear),
              tradeInValue: Number(tradeInValue),
              outstandingLoan: Number(tradeInOutstandingLoan) || 0,
            }
          : undefined,
      };
      await api.post("/sales", payload);
      showToast("Sale created");
      navigate("/sales");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create sale");
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepSummary: Record<number, string> = {
    1:
      vehicle && customer
        ? `${vehicleDisplayName(vehicle)} · ${customerDisplayName(customer)}`
        : vehicle
          ? vehicleDisplayName(vehicle)
          : customer
            ? customerDisplayName(customer)
            : "Not selected yet",
    2: Number(sellingPrice) > 0 ? `Final price ${formatCurrency(finalPricePreview)}` : "Not set yet",
    3: saleType === "FINANCING" ? "Financing" : paymentMethod ? paymentMethodLabel(paymentMethod) : "Outright purchase",
  };

  return (
    <div>
      <Link to="/sales" className="touch-target mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-action hover:underline">
        <ArrowLeft size={14} /> Back to Sales
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-action/10 text-action">
          <ShoppingCart size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">Add New Sale</h1>
          <p className="text-sm text-muted">Record a new vehicle sale and manage customer, payment and ownership details.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-6 hidden items-start sm:flex">
        {STEPS.map((s, i) => (
          <div key={s.n} className={`flex flex-1 items-start ${i === STEPS.length - 1 ? "flex-none" : ""}`}>
            <button type="button" onClick={() => goToStep(s.n)} className="flex flex-col items-center text-center">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  activeStep === s.n
                    ? "bg-action text-white"
                    : stepValid[s.n as 1 | 2 | 3] || s.n < activeStep
                      ? "bg-success/10 text-success"
                      : "bg-surface text-muted"
                }`}
              >
                {(stepValid[s.n as 1 | 2 | 3] || s.n < activeStep) && activeStep !== s.n ? <Check size={16} /> : s.n}
              </span>
              <span className={`mt-1.5 max-w-[110px] text-xs font-semibold ${activeStep === s.n ? "text-action" : "text-ink"}`}>
                {s.title}
              </span>
              <span className="max-w-[110px] text-[11px] text-muted">{s.subtitle}</span>
            </button>
            {i < STEPS.length - 1 && <div className="mt-4 h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Step 1: Vehicle & Customer */}
          <StepCard
            icon={Car}
            step={1}
            title="1. Vehicle & Customer"
            subtitle="Choose the customer and the vehicle for this sale."
            active={activeStep === 1}
            summary={stepSummary[1]}
            onHeaderClick={() => goToStep(1)}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Users size={14} className="text-action" /> Customer
                </h3>
                {customer ? (
                  <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-action/10 text-sm font-semibold text-action">
                      {customer.firstName[0]}
                      {customer.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{customerDisplayName(customer)}</span>
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                          Existing Customer
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                        {customer.phone && <span>{customer.phone}</span>}
                        {customer.email && <span>{customer.email}</span>}
                        {customer.city && <span>{customer.city}</span>}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {customer.transactionCount} previous transaction{customer.transactionCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomer(null)}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="mb-3 flex gap-1 rounded-lg bg-surface p-1 text-sm">
                      <button
                        type="button"
                        onClick={() => setCustomerTab("search")}
                        className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                          customerTab === "search" ? "bg-card text-action shadow-sm" : "text-muted"
                        }`}
                      >
                        Search Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomerTab("new")}
                        className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                          customerTab === "new" ? "bg-card text-action shadow-sm" : "text-muted"
                        }`}
                      >
                        Add New
                      </button>
                    </div>

                    {customerTab === "search" ? (
                      <SearchSelect
                        placeholder="Search by name, phone, email, or customer ID…"
                        selected={null}
                        onSelect={(c) => c && setCustomer(c)}
                        fetchOptions={fetchCustomers}
                        getId={(c) => c.id}
                        getLabel={(c) => customerDisplayName(c)}
                        getSubLabel={(c) => c.phone ?? c.email ?? ""}
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="First name"
                          value={newCustomer.firstName}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, firstName: e.target.value }))}
                          className={inputCls}
                        />
                        <input
                          placeholder="Last name"
                          value={newCustomer.lastName}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, lastName: e.target.value }))}
                          className={inputCls}
                        />
                        <input type="tel"
                          placeholder="Phone"
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
                          className={inputCls}
                        />
                        <input
                          placeholder="Email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))}
                          className={inputCls}
                        />
                        <button
                          type="button"
                          onClick={handleCreateCustomer}
                          disabled={isCreatingCustomer}
                          className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-60"
                        >
                          {isCreatingCustomer ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          Create Customer
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Car size={14} className="text-action" /> Vehicle
                </h3>
                {vehicle ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted">
                      {vehicle.images?.[0] ? (
                        <img src={vehicle.images[0].fileUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Car size={20} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{vehicleDisplayName(vehicle)}</span>
                        <StatusBadge status={vehicle.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                        {vehicle.vehicleType && <span>{vehicle.vehicleType}</span>}
                        {vehicle.fuelType && (
                          <span className="flex items-center gap-1">
                            <Fuel size={12} /> {vehicle.fuelType}
                          </span>
                        )}
                        {vehicle.mileage != null && (
                          <span className="flex items-center gap-1">
                            <Gauge size={12} /> {vehicle.mileage.toLocaleString()} km
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Stock: {vehicle.stockNumber} · VIN: {vehicle.vin}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-ink">{formatCurrency(vehicle.sellingPrice ?? 0)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVehicle(null)}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <SearchSelect
                    placeholder="Search available vehicles by make, model, VIN…"
                    selected={null}
                    onSelect={(v) => v && handleSelectVehicle(v)}
                    fetchOptions={fetchVehicles}
                    getId={(v) => v.id}
                    getLabel={(v) => vehicleDisplayName(v)}
                    getSubLabel={(v) => `${v.stockNumber}${v.sellingPrice ? ` · ${formatCurrency(v.sellingPrice)}` : ""}`}
                  />
                )}
              </div>
            </div>
            <StepNextButton visible={activeStep === 1} disabled={!stepValid[1]} onClick={goNext} />
          </StepCard>

          {/* Step 2: Sale Details */}
          <StepCard
            icon={FileText}
            step={2}
            title="2. Sale Details"
            subtitle="Set the sale price and additional details."
            active={activeStep === 2}
            summary={stepSummary[2]}
            onHeaderClick={() => goToStep(2)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Sale Price (GHS)" required>
                <input
                  required
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Discount (GHS)">
                <input
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Sale Date">
                <div className="flex h-[38px] items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm text-muted">
                  <Calendar size={14} /> {formatDate(new Date().toISOString())} (today)
                </div>
              </Field>
              <Field label="Final Sale Price (GHS)">
                <div className="flex h-[38px] items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink">
                  {formatCurrency(finalPricePreview)}
                </div>
              </Field>
              {isAdmin && (
                <Field label="Salesperson" required>
                  <select required value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className={inputCls}>
                    <option value="">Select a salesperson…</option>
                    {salespeople?.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.fullName}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Sale Type">
                <div className="flex h-[38px] items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="saleType"
                      checked={saleType === "OUTRIGHT"}
                      onChange={() => setSaleType("OUTRIGHT")}
                    />
                    Outright Purchase
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="saleType"
                      checked={saleType === "FINANCING"}
                      onChange={() => setSaleType("FINANCING")}
                    />
                    Financing
                  </label>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional notes about the sale…"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border p-4">
              <label className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ArrowLeftRight size={16} className="text-action" /> Trade-in Vehicle (Optional)
                </span>
                <input
                  type="checkbox"
                  checked={includeTradeIn}
                  onChange={(e) => setIncludeTradeIn(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              {includeTradeIn && (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field label="Make" required>
                      <input required value={tradeInMake} onChange={(e) => setTradeInMake(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Model" required>
                      <input required value={tradeInModel} onChange={(e) => setTradeInModel(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Year" required>
                      <input
                        required
                        type="number" inputMode="numeric"
                        value={tradeInYear}
                        onChange={(e) => setTradeInYear(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Trade-in Value (GHS)" required>
                      <input
                        required
                        type="number" inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={tradeInValue}
                        onChange={(e) => setTradeInValue(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Outstanding Loan (GHS)">
                      <input
                        type="number" inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={tradeInOutstandingLoan}
                        onChange={(e) => setTradeInOutstandingLoan(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Net Trade-in Value (GHS)">
                      <div className="flex h-[38px] items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink">
                        {formatCurrency(netTradeInValue)}
                      </div>
                    </Field>
                  </div>
                  {Number(tradeInOutstandingLoan) > Number(tradeInValue || 0) && (
                    <p className="mt-2 text-xs text-danger">Outstanding loan cannot exceed the trade-in value.</p>
                  )}
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-action/5 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">Amount Payable</span>
                    <span className="font-semibold text-ink">{formatCurrency(amountPayable)}</span>
                  </div>
                </>
              )}
            </div>

            <StepNextButton visible={activeStep === 2} disabled={!stepValid[2]} onClick={goNext} />
          </StepCard>

          {/* Step 3: Payment & Financing */}
          <StepCard
            icon={CreditCard}
            step={3}
            title="3. Payment"
            subtitle="Record payment information or link to a financing application."
            active={activeStep === 3}
            summary={stepSummary[3]}
            onHeaderClick={() => goToStep(3)}
          >
            {saleType === "OUTRIGHT" ? (
              <Field label="Payment Method">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {paymentMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Principal (GHS)" required>
                  <input
                    required
                    type="number" inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Interest Rate (%)" required>
                  <input
                    required
                    type="number" inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Term (months)" required>
                  <input
                    required
                    type="number" inputMode="numeric"
                    min={1}
                    value={termMonths}
                    onChange={(e) => setTermMonths(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Monthly Payment (GHS)">
                  <div className="flex h-[38px] items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink">
                    {formatCurrency(calculatedMonthlyPayment)}
                  </div>
                </Field>
                <Field label="First Payment Due">
                  <input
                    type="date"
                    value={firstPaymentDue}
                    onChange={(e) => setFirstPaymentDue(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
            <StepNextButton visible={activeStep === 3} disabled={!stepValid[3]} onClick={goNext} />
          </StepCard>

          {/* Step 4: Review & Confirm */}
          <StepCard
            icon={FileText}
            step={4}
            title="4. Review & Confirm"
            subtitle="Review the sale details before submitting."
            active={activeStep === 4}
            summary={undefined}
            onHeaderClick={() => goToStep(4)}
          >
            <dl className="flex flex-col gap-2 text-sm">
              <ReviewRow label="Vehicle" value={vehicle ? vehicleDisplayName(vehicle) : "—"} />
              <ReviewRow label="Customer" value={customer ? customerDisplayName(customer) : "—"} />
              <ReviewRow label="Sale Price" value={formatCurrency(sellingPrice || 0)} />
              <ReviewRow label="Discount" value={formatCurrency(discount || 0)} />
              <ReviewRow label="Final Price" value={formatCurrency(finalPricePreview)} />
              {includeTradeIn && (
                <>
                  <ReviewRow label="Trade-in" value={`${tradeInYear} ${tradeInMake} ${tradeInModel}`.trim()} />
                  <ReviewRow label="Net Trade-in Value" value={`- ${formatCurrency(netTradeInValue)}`} />
                  <ReviewRow label="Amount Payable" value={formatCurrency(amountPayable)} />
                </>
              )}
              <ReviewRow label="Sale Type" value={saleType === "OUTRIGHT" ? "Outright Purchase" : "Financing"} />
              {saleType === "OUTRIGHT" ? (
                <ReviewRow label="Payment Method" value={paymentMethod ? paymentMethodLabel(paymentMethod) : "Not set"} />
              ) : (
                <ReviewRow
                  label="Financing"
                  value={`${formatCurrency(principalAmount || 0)} · ${interestRate || 0}% · ${termMonths || 0} mo`}
                />
              )}
              {saleType === "FINANCING" && (
                <ReviewRow label="Monthly Payment" value={formatCurrency(calculatedMonthlyPayment)} />
              )}
            </dl>
          </StepCard>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FileText size={16} className="text-action" /> Sale Summary
            </h2>

            {vehicle ? (
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted">
                  {vehicle.images?.[0] ? (
                    <img src={vehicle.images[0].fileUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Car size={16} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{vehicleDisplayName(vehicle)}</div>
                  <div className="text-xs text-muted">{vehicle.stockNumber}</div>
                  <div className="text-xs font-medium text-ink">{formatCurrency(vehicle.sellingPrice ?? 0)}</div>
                </div>
              </div>
            ) : (
              <p className="border-b border-border pb-3 text-xs text-muted">No vehicle selected yet.</p>
            )}

            {customer ? (
              <div className="border-b border-border pb-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</div>
                <div className="mt-1 text-sm font-medium text-ink">{customerDisplayName(customer)}</div>
                {customer.phone && <div className="text-xs text-muted">{customer.phone}</div>}
              </div>
            ) : (
              <p className="border-b border-border pb-3 text-xs text-muted">No customer selected yet.</p>
            )}

            <div className="border-b border-border pb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing</div>
              <Row2 label="Sale Price" value={formatCurrency(sellingPrice || 0)} />
              <Row2 label="Discount" value={formatCurrency(discount || 0)} />
              <Row2 label="Final Price" value={formatCurrency(finalPricePreview)} bold />
              {includeTradeIn && (
                <>
                  <Row2 label="Trade-in Value" value={`- ${formatCurrency(netTradeInValue)}`} />
                  <Row2 label="Amount Payable" value={formatCurrency(amountPayable)} bold />
                </>
              )}
            </div>

            <div className="border-b border-border pb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Calendar size={12} /> Sale Date
              </div>
              <div className="mt-1 text-sm text-ink">{formatDate(new Date().toISOString())}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sale Type</div>
              <div className="mt-1 text-sm text-ink">{saleType === "OUTRIGHT" ? "Outright Purchase" : "Financing"}</div>
              {saleType === "FINANCING" && calculatedMonthlyPayment > 0 && (
                <div className="mt-1 text-xs text-muted">{formatCurrency(calculatedMonthlyPayment)}/month</div>
              )}
            </div>

            {isAdmin && salespeople?.find((sp) => sp.id === salespersonId) && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Salesperson</div>
                <div className="mt-1 text-sm text-ink">{salespeople.find((sp) => sp.id === salespersonId)?.fullName}</div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-between gap-2 border-t border-border bg-surface py-4 lg:col-span-3">
          <button
            type="button"
            onClick={() => navigate("/sales")}
            disabled={isSubmitting}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            Cancel
          </button>
          {activeStep === 4 ? (
            <button
              type="submit"
              disabled={isSubmitting || !allValid}
              className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Submit Sale
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!stepValid[activeStep as 1 | 2 | 3]}
              className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

function StepCard({
  icon: Icon,
  title,
  subtitle,
  active,
  summary,
  onHeaderClick,
  children,
}: {
  icon: typeof Car;
  step: number;
  title: string;
  subtitle: string;
  active: boolean;
  summary: string | undefined;
  onHeaderClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onHeaderClick}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action/10 text-action">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="truncate text-xs text-muted">{active ? subtitle : (summary ?? subtitle)}</div>
        </div>
      </button>
      {active && <div className="border-t border-border px-5 py-4">{children}</div>}
    </div>
  );
}

function StepNextButton({ visible, disabled, onClick }: { visible: boolean; disabled: boolean; onClick: () => void }) {
  if (!visible) return null;
  // Hidden on phones: there the sticky footer's "Next" is always on screen
  // and runs the same goNext(), so this second forward button was just a
  // duplicate (mobile audit).
  return (
    <div className="mt-4 hidden justify-end sm:flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        Continue
      </button>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function Row2({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="mt-1 flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={bold ? "font-semibold text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}
