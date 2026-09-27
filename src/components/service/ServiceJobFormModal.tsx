import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Loader2, Wrench, X } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { SearchSelect } from "../SearchSelect";
import type { ServiceType } from "../../types/service";
import type { Vehicle, VehicleListResult } from "../../types/vehicle";

interface MechanicOption {
  id: string;
  fullName: string;
}

interface ServiceJobFormModalProps {
  onClose: () => void;
  onCreated: () => void;
}

// Reconciled against admin_pages/"add- service page.jpeg": that mockup's
// Customer, Registration Number, Mileage, Preferred Date/Time, Priority,
// and a create-time Service Status all have no backing anywhere in the
// schema (a service job here is about the dealership's own vehicle, not a
// customer drop-off, and there's no scheduling/priority concept at all).
// Its "Service Type" / "Service Category" / "Service/Repair" three-field
// split collapses into the one real flat ServiceType list. Its Parts &
// Labour section is real, but only at job *completion* — the exact service
// performed and what it took often aren't known until a mechanic has
// diagnosed and done the work, so that capability lives on the new
// Complete Job dialog in ServicePage.tsx, not here.
export function ServiceJobFormModal({ onClose, onCreated }: ServiceJobFormModalProps) {
  const { showToast } = useToast();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [mechanicId, setMechanicId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: MechanicOption[] }>("/admin/users?roleCode=MECHANIC&status=ACTIVE&pageSize=100")
      .then((res) => setMechanics(res.data))
      .catch(() => setMechanics([]));
    api
      .get<{ data: ServiceType[] }>("/service-types")
      .then((res) => setServiceTypes(res.data.filter((t) => t.isActive)))
      .catch(() => setServiceTypes([]));
  }, []);

  const fetchVehicles = useCallback(async (query: string) => {
    const res = await api.get<VehicleListResult>(`/vehicles?status=AVAILABLE&search=${encodeURIComponent(query)}&pageSize=20`);
    return res.data;
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vehicle) return setError("Select a vehicle first");
    if (!mechanicId) return setError("Select a mechanic to assign this job to");

    setIsSubmitting(true);
    try {
      await api.post("/service/jobs", {
        vehicleId: vehicle.id,
        assignedMechanicId: mechanicId,
        issueDescription: issueDescription.trim() || undefined,
        serviceTypeId: serviceTypeId || undefined,
      });
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create service job";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-action/10 text-action">
              <Wrench size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Add Service</h2>
              <p className="text-xs text-muted">Record a new service job for a dealership vehicle.</p>
            </div>
          </div>
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

            <SectionCard title="Vehicle & Assignment">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Vehicle" required>
                  <SearchSelect
                    placeholder="Search available vehicles by make, model, VIN…"
                    selected={vehicle}
                    onSelect={setVehicle}
                    fetchOptions={fetchVehicles}
                    getId={(v) => v.id}
                    getLabel={(v) => `${v.year} ${v.make} ${v.model}`}
                    getSubLabel={(v) => v.stockNumber}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Assign Mechanic" required>
                    <select
                      required
                      value={mechanicId}
                      onChange={(e) => setMechanicId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Select a mechanic…</option>
                      {mechanics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Service Type">
                    <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)} className={inputCls}>
                      <option value="">Not yet known — diagnose first</option>
                      {serviceTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Issue Description">
              <textarea
                rows={3}
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                placeholder="Describe the issue, symptoms, or reason for this service…"
                className={inputCls}
              />
            </SectionCard>
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
              Save Service
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border">
      <div className="bg-action/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-action">{title}</div>
      <div className="p-4">{children}</div>
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
