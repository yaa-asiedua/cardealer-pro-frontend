import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  Camera,
  Car,
  Check,
  FileText,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { formatCurrency, formatDate } from "../lib/format";
import { vehicleDisplayName } from "../lib/vehicle-helpers";
import { SearchSelect } from "../components/SearchSelect";
import { StatusBadge } from "../components/StatusBadge";
import { customerDisplayName } from "../types/customer";
import type { Customer, CustomerListResult } from "../types/customer";
import type { CreateRentalInput } from "../types/rental";
import type { Vehicle, VehicleListResult } from "../types/vehicle";

interface RentalSalespersonOption {
  id: string;
  fullName: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const STEPS = [
  { n: 1, title: "Customer & Vehicle", subtitle: "Select customer and vehicle" },
  { n: 2, title: "Rental Details", subtitle: "Set dates, pricing and terms" },
  { n: 3, title: "Documents & ID", subtitle: "Verify documents" },
  { n: 4, title: "Review & Confirm", subtitle: "Check details and create rental" },
];

function calculateRentalDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_DAY);
  return Math.max(1, days);
}

// Reconciled against rentals_pages/add-rental.jpeg, with four decisions
// confirmed up front: (1) "Scan Driver's Licence (Smart Capture)" is the
// paused OCR/AI feature — built as manual entry only here, same as
// RentalFormModal already does; (2) Pickup/Return Time dropped — endDate/
// startDate are @db.Date columns with no time component anywhere in the
// schema; (3) Discount is real now — a genuine small schema addition
// (Rental.discount, mirrors Sale.discount) made for this page; (4)
// Pickup/Return Location and Purpose of Rental dropped entirely — no
// branches/locations or rental-purpose concept exists anywhere in this
// backend. Unlike RentalFormModal (dates before vehicle search, since
// availability is date-range based), this page picks the vehicle first —
// any AVAILABLE-for-rent vehicle, not date-filtered — and lets the
// backend's real overlap check at submit time be the final word, same as
// how a date conflict already surfaces as a real 409 today.
export function AddRentalPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [activeStep, setActiveStep] = useState(1);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerTab, setCustomerTab] = useState<"search" | "new">("search");
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    driverLicenseNo: "",
    licenseExpiry: "",
  });
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  const [salespeople, setSalespeople] = useState<RentalSalespersonOption[] | null>(null);
  const [salespersonId, setSalespersonId] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [depositAmount, setDepositAmount] = useState("");
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsProvider, setGpsProvider] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ data: RentalSalespersonOption[] }>("/admin/users?roleCode=RENTAL_SALESPERSON&status=ACTIVE&pageSize=100")
      .then((res) => setSalespeople(res.data))
      .catch(() => setSalespeople([]));
  }, [isAdmin]);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await api.get<CustomerListResult>(`/customers?search=${encodeURIComponent(query)}&pageSize=8`);
    return res.data;
  }, []);

  const fetchVehicles = useCallback(async (query: string) => {
    const res = await api.get<VehicleListResult>(
      `/vehicles?status=AVAILABLE&forRent=true&search=${encodeURIComponent(query)}&pageSize=20`
    );
    return res.data;
  }, []);

  function handleSelectVehicle(v: Vehicle | null) {
    setVehicle(v);
    if (v?.rentalDailyRate) setDailyRate(v.rentalDailyRate);
  }

  async function handleCreateCustomer() {
    setError(null);
    if (!newCustomer.firstName.trim() || !newCustomer.lastName.trim()) {
      setError("First and last name are required to create a customer");
      return;
    }
    if (!newCustomer.driverLicenseNo.trim() || !newCustomer.licenseExpiry) {
      setError("A driver's licence number and expiry are required to rent to a new customer");
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const res = await api.post<{ customer: Customer }>("/customers", {
        firstName: newCustomer.firstName.trim(),
        lastName: newCustomer.lastName.trim(),
        phone: newCustomer.phone.trim() || undefined,
        driverLicenseNo: newCustomer.driverLicenseNo.trim(),
        licenseExpiry: newCustomer.licenseExpiry,
        customerType: "RENTAL",
      });
      setCustomer(res.customer);
      setNewCustomer({ firstName: "", lastName: "", phone: "", driverLicenseNo: "", licenseExpiry: "" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create customer";
      setError(message);
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  async function handlePhotoSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !customer) return;
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { url } = await api.upload<{ url: string }>("/uploads/customer-photo", formData);
      const res = await api.patch<{ customer: Customer }>(`/customers/${customer.id}`, { profilePhotoUrl: url });
      setCustomer(res.customer);
      showToast("Photo uploaded");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to upload photo";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  // Informational only, same as RentalFormModal — the backend deliberately
  // doesn't enforce this yet (existing customers predate the licence
  // field), see rental.service.ts's comment before re-coupling the two.
  const licenseWarning = useMemo(() => {
    if (!customer) return null;
    if (!customer.driverLicenseNo || !customer.licenseExpiry) {
      return "This customer has no driver's licence on file.";
    }
    if (endDate && customer.licenseExpiry < endDate) {
      return `This customer's driver's licence expires ${formatDate(customer.licenseExpiry)}, before the rental period ends.`;
    }
    return null;
  }, [customer, endDate]);

  const rentalDays = useMemo(() => calculateRentalDays(startDate, endDate), [startDate, endDate]);
  const subtotal = useMemo(() => rentalDays * (Number(dailyRate) || 0), [rentalDays, dailyRate]);
  const totalCost = useMemo(() => Math.max(0, subtotal - (Number(discount) || 0)), [subtotal, discount]);

  const stepValid = useMemo(
    () => ({
      1: customer !== null && vehicle !== null,
      2:
        Boolean(startDate) &&
        Boolean(endDate) &&
        endDate >= startDate &&
        Number(dailyRate) > 0 &&
        Number(discount) <= subtotal &&
        (!isAdmin || salespersonId !== ""),
      3: true,
    }),
    [customer, vehicle, startDate, endDate, dailyRate, discount, subtotal, isAdmin, salespersonId]
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
    if (!vehicle || !customer || !allValid) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const payload: CreateRentalInput = {
        customerId: customer.id,
        vehicleId: vehicle.id,
        rentalSalespersonId: isAdmin ? salespersonId : undefined,
        startDate,
        endDate,
        dailyRate: Number(dailyRate),
        discount: Number(discount) || undefined,
        depositAmount: depositAmount ? Number(depositAmount) : undefined,
        gpsEnabled,
        gpsProvider: gpsEnabled && gpsProvider.trim() ? gpsProvider.trim() : undefined,
        notes: notes.trim() || undefined,
      };
      await api.post("/rentals", payload);
      showToast("Rental created");
      navigate("/rentals");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create rental");
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepSummary: Record<number, string> = {
    1: customer && vehicle ? `${customerDisplayName(customer)} · ${vehicleDisplayName(vehicle)}` : "Not selected yet",
    2: startDate && endDate ? `${rentalDays} day${rentalDays === 1 ? "" : "s"} · ${formatCurrency(totalCost)}` : "Not set yet",
    3: "Reviewed",
  };

  return (
    <div>
      <Link to="/rentals" className="touch-target mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-action hover:underline">
        <Car size={14} className="rotate-180" /> Back to My Rentals
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-action/10 text-action">
          <Calendar size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">New Rental</h1>
          <p className="text-sm text-muted">Create a new rental booking for a customer.</p>
        </div>
      </div>

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
          {/* Step 1: Customer & Vehicle */}
          <StepCard
            icon={Users}
            title="1. Customer Information"
            subtitle="Search for an existing customer or add a new one."
            active={activeStep === 1}
            summary={stepSummary[1]}
            onHeaderClick={() => goToStep(1)}
          >
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Users size={14} className="text-action" /> Customer
              </h3>
              {customer ? (
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action/10 text-sm font-semibold text-action">
                    {customer.profilePhotoUrl ? (
                      <img src={customer.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <>
                        {customer.firstName[0]}
                        {customer.lastName[0]}
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{customerDisplayName(customer)}</span>
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        Customer selected
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      {customer.phone && <span>{customer.phone}</span>}
                      {customer.email && <span>{customer.email}</span>}
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
                      Search Existing Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerTab("new")}
                      className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                        customerTab === "new" ? "bg-card text-action shadow-sm" : "text-muted"
                      }`}
                    >
                      Add New Customer
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
                        placeholder="Driver's licence no."
                        value={newCustomer.driverLicenseNo}
                        onChange={(e) => setNewCustomer((c) => ({ ...c, driverLicenseNo: e.target.value }))}
                        className={inputCls}
                      />
                      <label className="col-span-2 flex flex-col gap-1 text-sm">
                        <span className="text-xs font-medium text-ink">Licence expiry</span>
                        <input
                          type="date"
                          value={newCustomer.licenseExpiry}
                          onChange={(e) => setNewCustomer((c) => ({ ...c, licenseExpiry: e.target.value }))}
                          className={inputCls}
                        />
                      </label>
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
              {licenseWarning && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{licenseWarning}</span>
                </div>
              )}
            </div>

            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Car size={14} className="text-action" /> Vehicle Selection
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
                      {vehicle.seats != null && (
                        <span className="flex items-center gap-1">
                          <Users size={12} /> {vehicle.seats} Seats
                        </span>
                      )}
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
                    <div className="mt-1 text-xs text-muted">{vehicle.registrationNo ?? vehicle.stockNumber}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {vehicle.rentalDailyRate && (
                      <span className="font-semibold text-ink">{formatCurrency(vehicle.rentalDailyRate)} / day</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectVehicle(null)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
                    >
                      Change Vehicle
                    </button>
                  </div>
                </div>
              ) : (
                <SearchSelect
                  placeholder="Search available rental vehicles by make, model, plate…"
                  selected={null}
                  onSelect={(v) => v && handleSelectVehicle(v)}
                  fetchOptions={fetchVehicles}
                  getId={(v) => v.id}
                  getLabel={(v) => vehicleDisplayName(v)}
                  getSubLabel={(v) =>
                    `${v.registrationNo ?? v.stockNumber}${v.rentalDailyRate ? ` · ${formatCurrency(v.rentalDailyRate)}/day` : ""}`
                  }
                />
              )}
            </div>

            {isAdmin && (
              <div className="mt-5">
                <Field label="Rental Salesperson" required>
                  <select required value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className={inputCls}>
                    <option value="">Select a salesperson…</option>
                    {salespeople?.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.fullName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            <StepNextButton visible={activeStep === 1} disabled={!stepValid[1]} onClick={goNext} />
          </StepCard>

          {/* Step 2: Rental Details */}
          <StepCard
            icon={Calendar}
            title="2. Rental Details"
            subtitle="Set dates, pricing and terms."
            active={activeStep === 2}
            summary={stepSummary[2]}
            onHeaderClick={() => goToStep(2)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Pickup Date" required>
                <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Return Date" required>
                <input
                  required
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Rental Duration">
                <div className="flex h-[38px] items-center rounded-lg bg-surface px-3 text-sm text-muted">
                  {rentalDays} day{rentalDays === 1 ? "" : "s"}
                </div>
              </Field>
              <Field label="Daily Rate (GHS)" required>
                <input
                  required
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
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
              <Field label="Total Amount (GHS)">
                <div className="flex h-[38px] items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink">
                  {formatCurrency(totalCost)}
                </div>
              </Field>
              <Field label="Deposit (GHS)">
                <input
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Special Notes (Optional)">
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions or notes…"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border p-4">
              <label className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <MapPin size={16} className="text-action" /> GPS Tracking
                </span>
                <input type="checkbox" checked={gpsEnabled} onChange={(e) => setGpsEnabled(e.target.checked)} className="h-4 w-4" />
              </label>
              {gpsEnabled && (
                <input
                  placeholder="GPS provider (optional)"
                  value={gpsProvider}
                  onChange={(e) => setGpsProvider(e.target.value)}
                  className={`${inputCls} mt-3`}
                />
              )}
            </div>

            <StepNextButton visible={activeStep === 2} disabled={!stepValid[2]} onClick={goNext} />
          </StepCard>

          {/* Step 3: Documents & ID */}
          <StepCard
            icon={FileText}
            title="3. Documents & ID"
            subtitle="Verify the customer's ID and licence details."
            active={activeStep === 3}
            summary={stepSummary[3]}
            onHeaderClick={() => goToStep(3)}
          >
            {customer ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-muted">
                    {customer.profilePhotoUrl ? (
                      <img src={customer.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Camera size={22} />
                    )}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-surface">
                    {isUploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    {customer.profilePhotoUrl ? "Replace Photo" : "Upload Photo"}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} disabled={isUploadingPhoto} />
                  </label>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                  <ReviewRow label="ID Type" value={customer.idType ?? "Not on file"} />
                  <ReviewRow label="ID Number" value={customer.idNumber ?? "Not on file"} />
                  <ReviewRow label="Driver's Licence No." value={customer.driverLicenseNo ?? "Not on file"} />
                  <ReviewRow
                    label="Licence Expiry"
                    value={customer.licenseExpiry ? formatDate(customer.licenseExpiry) : "Not on file"}
                  />
                </dl>

                {(!customer.idType || !customer.idNumber || !customer.driverLicenseNo) && (
                  <p className="mt-3 text-xs text-muted">
                    Missing details can be added on the customer's{" "}
                    <Link to={`/customers/${customer.id}/edit`} target="_blank" className="touch-target font-medium text-action hover:underline">
                      profile page
                    </Link>
                    .
                  </p>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted">Select a customer in Step 1 first.</p>
            )}

            <StepNextButton visible={activeStep === 3} disabled={!stepValid[3]} onClick={goNext} />
          </StepCard>

          {/* Step 4: Review & Confirm */}
          <StepCard
            icon={FileText}
            title="4. Review & Confirm"
            subtitle="Check details and create rental."
            active={activeStep === 4}
            summary={undefined}
            onHeaderClick={() => goToStep(4)}
          >
            <dl className="flex flex-col gap-2 text-sm">
              <ReviewRow label="Customer" value={customer ? customerDisplayName(customer) : "—"} />
              <ReviewRow label="Vehicle" value={vehicle ? vehicleDisplayName(vehicle) : "—"} />
              <ReviewRow label="Pickup Date" value={startDate ? formatDate(startDate) : "—"} />
              <ReviewRow label="Return Date" value={endDate ? formatDate(endDate) : "—"} />
              <ReviewRow label="Duration" value={`${rentalDays} day${rentalDays === 1 ? "" : "s"}`} />
              <ReviewRow label="Daily Rate" value={formatCurrency(Number(dailyRate) || 0)} />
              <ReviewRow label="Subtotal" value={formatCurrency(subtotal)} />
              <ReviewRow label="Discount" value={formatCurrency(Number(discount) || 0)} />
              <ReviewRow label="Total Amount" value={formatCurrency(totalCost)} />
              {depositAmount && <ReviewRow label="Deposit" value={formatCurrency(Number(depositAmount))} />}
              <ReviewRow label="GPS Tracking" value={gpsEnabled ? "Enabled" : "Not enabled"} />
            </dl>
          </StepCard>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Users size={16} className="text-action" /> Customer Preview
            </h2>
            {customer ? (
              <div className="border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action/10 text-sm font-semibold text-action">
                    {customer.profilePhotoUrl ? (
                      <img src={customer.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <>
                        {customer.firstName[0]}
                        {customer.lastName[0]}
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{customerDisplayName(customer)}</div>
                    {customer.phone && <div className="text-xs text-muted">{customer.phone}</div>}
                    {customer.email && <div className="truncate text-xs text-muted">{customer.email}</div>}
                  </div>
                </div>
                {(customer.address || customer.city) && (
                  <p className="mt-2 text-xs text-muted">{[customer.address, customer.city].filter(Boolean).join(", ")}</p>
                )}
              </div>
            ) : (
              <p className="border-b border-border pb-3 text-xs text-muted">No customer selected yet.</p>
            )}

            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FileText size={16} className="text-action" /> Rental Summary
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
                  <div className="text-xs text-muted">{vehicle.registrationNo ?? vehicle.stockNumber}</div>
                </div>
              </div>
            ) : (
              <p className="border-b border-border pb-3 text-xs text-muted">No vehicle selected yet.</p>
            )}

            <div className="border-b border-border pb-3">
              <Row2 label="Daily Rate" value={formatCurrency(Number(dailyRate) || 0)} />
              <Row2
                label="Rental Period"
                value={startDate && endDate ? `${formatDate(startDate)} - ${formatDate(endDate)}` : "—"}
              />
              <Row2 label="Duration" value={`${rentalDays} day${rentalDays === 1 ? "" : "s"}`} />
            </div>

            <div>
              <Row2 label="Subtotal" value={formatCurrency(subtotal)} />
              <Row2 label="Discount" value={formatCurrency(Number(discount) || 0)} />
              <Row2 label="Total Amount" value={formatCurrency(totalCost)} bold />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-between gap-2 border-t border-border bg-surface py-4 lg:col-span-3">
          <button
            type="button"
            onClick={() => navigate("/rentals")}
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
              Create Rental
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
