import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { SearchSelect } from "../SearchSelect";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import { customerDisplayName } from "../../types/customer";
import type { Customer, CustomerListResult } from "../../types/customer";
import type { FollowupType } from "../../types/followup";
import type { Rental, RentalListResult } from "../../types/rental";
import type { Vehicle, VehicleListResult } from "../../types/vehicle";
import { ModalOverlay } from "../ModalOverlay";

const TYPE_OPTIONS: { value: FollowupType; label: string }[] = [
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
];

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink";

export function AddFollowupModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const isRental = user?.role === "RENTAL_SALESPERSON";
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [rental, setRental] = useState<Rental | null>(null);
  const [type, setType] = useState<FollowupType>("CALL");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await api.get<CustomerListResult>(`/customers?search=${encodeURIComponent(query)}&pageSize=8`);
    return res.data;
  }, []);

  const fetchVehicles = useCallback(async (query: string) => {
    const res = await api.get<VehicleListResult>(`/vehicles?search=${encodeURIComponent(query)}&pageSize=8`);
    return res.data;
  }, []);

  const fetchRentals = useCallback(async (query: string) => {
    const res = await api.get<RentalListResult>(`/rentals?search=${encodeURIComponent(query)}&pageSize=8`);
    return res.data;
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer || !dueDate) {
      setError("Customer and due date are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/followups", {
        customerId: customer.id,
        vehicleId: isRental ? rental?.vehicleId : vehicle?.id,
        rentalId: isRental ? rental?.id : undefined,
        type,
        dueAt: new Date(`${dueDate}T${dueTime}`).toISOString(),
        notes: notes.trim() || undefined,
      });
      showToast("Follow-up added");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create follow-up");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Add Follow-up</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink">Customer</label>
            <SearchSelect
              placeholder="Search customer by name, phone, or email…"
              selected={customer}
              onSelect={setCustomer}
              fetchOptions={fetchCustomers}
              getId={(c) => c.id}
              getLabel={(c) => customerDisplayName(c)}
              getSubLabel={(c) => c.phone ?? c.email ?? ""}
            />
          </div>

          {isRental ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink">Rental Booking (Optional)</label>
              <SearchSelect
                placeholder="Search by rental number, customer, or vehicle…"
                selected={rental}
                onSelect={setRental}
                fetchOptions={fetchRentals}
                getId={(r) => r.id}
                getLabel={(r) => `${r.rentalNumber} — ${vehicleDisplayName(r.vehicle)}`}
                getSubLabel={(r) => r.vehicle.registrationNo ?? r.vehicle.stockNumber}
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink">Vehicle of Interest (Optional)</label>
              <SearchSelect
                placeholder="Search vehicles by make, model, or stock number…"
                selected={vehicle}
                onSelect={setVehicle}
                fetchOptions={fetchVehicles}
                getId={(v) => v.id}
                getLabel={(v) => vehicleDisplayName(v)}
                getSubLabel={(v) => v.stockNumber}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink">Follow-up Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as FollowupType)} className={inputCls}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Date</label>
                <input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Time</label>
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What's this follow-up about?"
              className={inputCls}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !customer || !dueDate}
              className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Add Follow-up"}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
