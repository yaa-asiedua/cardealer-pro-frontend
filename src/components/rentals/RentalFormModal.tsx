import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { formatCurrency, formatDate } from "../../lib/format";
import { SearchSelect } from "../SearchSelect";
import type { Customer } from "../../types/customer";
import type { CreateRentalInput } from "../../types/rental";
import type { Vehicle } from "../../types/vehicle";
import { ModalOverlay } from "../ModalOverlay";

interface RentalSalespersonOption {
  id: string;
  fullName: string;
}

interface RentalFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function calculateRentalDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_DAY);
  return Math.max(1, days);
}

export function RentalFormModal({ onClose, onSaved }: RentalFormModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "ADMIN";

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [dailyRate, setDailyRate] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    driverLicenseNo: "",
    licenseExpiry: "",
  });

  const [salespeople, setSalespeople] = useState<RentalSalespersonOption[] | null>(null);
  const [salespersonId, setSalespersonId] = useState("");

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

  // Dates come first — the vehicle picker is scoped to GET /rentals/
  // availability for that exact range, so only genuinely bookable vehicles
  // ever show up (rather than letting the user pick any AVAILABLE vehicle
  // and finding out about a date conflict only after submitting).
  const fetchAvailableVehicles = useCallback(
    async (query: string) => {
      if (!startDate || !endDate) return [];
      const res = await api.get<{ data: Vehicle[] }>(
        `/rentals/availability?startDate=${startDate}&endDate=${endDate}`
      );
      const rentable = res.data.filter((v) => v.rentalDailyRate);
      const q = query.trim().toLowerCase();
      if (!q) return rentable.slice(0, 20);
      return rentable
        .filter((v) => `${v.make} ${v.model} ${v.stockNumber}`.toLowerCase().includes(q))
        .slice(0, 20);
    },
    [startDate, endDate]
  );

  function handleSelectVehicle(v: Vehicle | null) {
    setVehicle(v);
    if (v?.rentalDailyRate) setDailyRate(v.rentalDailyRate);
  }

  function handleDateChange(setter: (v: string) => void, value: string) {
    setter(value);
    // A vehicle picked under the old date range may no longer be
    // available for the new one — clear it rather than silently submit
    // a stale selection.
    setVehicle(null);
  }

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await api.get<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(query)}&pageSize=8`);
    return res.data;
  }, []);

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
      setIsCreatingCustomer(false);
      setNewCustomer({ firstName: "", lastName: "", phone: "", driverLicenseNo: "", licenseExpiry: "" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create customer";
      setError(message);
      showToast(message, "error");
    }
  }

  // Mirrors rental.service.ts's own two checks exactly, so the user is
  // warned as soon as an ineligible customer is picked rather than only
  // hearing about it if the backend ever rejects it. As of 2026-09-20 the
  // backend deliberately does NOT enforce this (existing customers predate
  // the licence field) — this warning is intentionally informational-only
  // for now, not blocking, since submission is allowed either way. See the
  // matching comment in rental.service.ts before re-coupling the two.
  const licenseWarning = useMemo(() => {
    if (!customer) return null;
    if (!customer.driverLicenseNo || !customer.licenseExpiry) {
      return "This customer has no driver's licence on file. Add one to their customer record before renting to them.";
    }
    if (endDate && customer.licenseExpiry < endDate) {
      return `This customer's driver's licence expires ${formatDate(customer.licenseExpiry)}, before the rental period ends. Update their licence or shorten the rental.`;
    }
    return null;
  }, [customer, endDate]);

  const rentalDays = useMemo(() => calculateRentalDays(startDate, endDate), [startDate, endDate]);
  const totalCostPreview = useMemo(() => rentalDays * (Number(dailyRate) || 0), [rentalDays, dailyRate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) return setError("Choose a start and end date");
    if (!vehicle) return setError("Select a vehicle first");
    if (!customer) return setError("Select or create a customer first");
    if (isAdmin && !salespersonId) return setError("Select a rental salesperson");

    setIsSubmitting(true);
    try {
      const payload: CreateRentalInput = {
        customerId: customer.id,
        vehicleId: vehicle.id,
        rentalSalespersonId: isAdmin ? salespersonId : undefined,
        startDate,
        endDate,
        dailyRate: Number(dailyRate) || undefined,
        depositAmount: depositAmount ? Number(depositAmount) : undefined,
        gpsEnabled,
        gpsProvider: gpsEnabled && gpsProvider.trim() ? gpsProvider.trim() : undefined,
        notes: notes.trim() || undefined,
      };
      await api.post("/rentals", payload);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create rental";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-ink">New Rental</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <FormSection title="Rental Period">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-ink">Start date</span>
                  <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(e) => handleDateChange(setStartDate, e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-ink">End date</span>
                  <input
                    required
                    type="date"
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(e) => handleDateChange(setEndDate, e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            </FormSection>

            <FormSection title="Vehicle">
              {!startDate || !endDate ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
                  Choose a start and end date to see which vehicles are available.
                </p>
              ) : (
                <SearchSelect
                  key={`${startDate}-${endDate}`}
                  placeholder="Search available vehicles by make, model, stock #…"
                  selected={vehicle}
                  onSelect={handleSelectVehicle}
                  fetchOptions={fetchAvailableVehicles}
                  getId={(v) => v.id}
                  getLabel={(v) => `${v.year} ${v.make} ${v.model}`}
                  getSubLabel={(v) => `${v.stockNumber}${v.rentalDailyRate ? ` · ${formatCurrency(v.rentalDailyRate)}/day` : ""}`}
                />
              )}
            </FormSection>

            <FormSection title="Customer">
              {isCreatingCustomer ? (
                <div className="rounded-lg border border-border p-3">
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
                  </div>
                  <p className="mt-2 text-xs text-muted">A valid licence covering the full rental period is required to book.</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCustomer(false)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink hover:bg-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      className="rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary"
                    >
                      Create customer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchSelect
                      placeholder="Search customer by name, phone, or email…"
                      selected={customer}
                      onSelect={setCustomer}
                      fetchOptions={fetchCustomers}
                      getId={(c) => c.id}
                      getLabel={(c) => `${c.firstName} ${c.lastName}`}
                      getSubLabel={(c) => (c.driverLicenseNo ? `Licence on file` : "No licence on file")}
                    />
                  </div>
                  {!customer && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingCustomer(true)}
                      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
                    >
                      <Plus size={13} /> New
                    </button>
                  )}
                </div>
              )}
              {licenseWarning && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{licenseWarning}</span>
                </div>
              )}
            </FormSection>

            {isAdmin && (
              <FormSection title="Rental salesperson">
                <select required value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className={inputCls}>
                  <option value="">Select a salesperson…</option>
                  {salespeople?.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.fullName}
                    </option>
                  ))}
                </select>
              </FormSection>
            )}

            <FormSection title="Rate & Deposit">
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-ink">Daily rate (GHS)</span>
                  <input
                    required
                    type="number" inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-ink">Deposit (GHS)</span>
                  <input
                    type="number" inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <div className="flex flex-col justify-end gap-1 text-sm">
                  <span className="text-xs font-medium text-muted">Total ({rentalDays || 0} day{rentalDays === 1 ? "" : "s"})</span>
                  <div className="rounded-lg bg-surface px-3 py-2 font-semibold text-ink">{formatCurrency(totalCostPreview)}</div>
                </div>
              </div>
            </FormSection>

            <FormSection title="GPS Tracking">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={gpsEnabled} onChange={(e) => setGpsEnabled(e.target.checked)} className="rounded border-border" />
                Enable GPS tracking for this rental
              </label>
              {gpsEnabled && (
                <input
                  placeholder="GPS provider (optional)"
                  value={gpsProvider}
                  onChange={(e) => setGpsProvider(e.target.value)}
                  className={`${inputCls} mt-2`}
                />
              )}
            </FormSection>

            <FormSection title="Notes">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </FormSection>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Create Rental
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}
