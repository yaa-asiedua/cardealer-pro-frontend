import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Car, Image as ImageIcon, Loader2, ShoppingCart, Star, Trash2, UploadCloud } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import { formatDateTime } from "../lib/format";
import {
  FUEL_TYPE_OPTIONS,
  PURPOSE_LABELS,
  SEAT_OPTIONS,
  TRANSMISSION_OPTIONS,
  deriveVehiclePurpose,
  registrationRequiredForPurpose,
} from "../lib/vehicle-helpers";
import { StatusBadge } from "../components/StatusBadge";
import type { Vehicle, VehicleFormValues, VehiclePurpose } from "../types/vehicle";

const EMPTY_FORM: VehicleFormValues = {
  make: "",
  model: "",
  year: new Date().getFullYear(),
  registrationNo: "",
  vin: "",
  engineNo: "",
  color: "",
  mileage: "",
  fuelType: "",
  transmission: "",
  engineCapacity: "",
  seats: "",
  vehicleType: "",
  purchasePrice: "",
  sellingPrice: "",
  rentalDailyRate: "",
  description: "",
  status: "AVAILABLE",
  purpose: "FOR_SALE",
};

function toFormValues(vehicle: Vehicle): VehicleFormValues {
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    registrationNo: vehicle.registrationNo ?? "",
    vin: vehicle.vin,
    engineNo: vehicle.engineNo ?? "",
    color: vehicle.color ?? "",
    mileage: vehicle.mileage?.toString() ?? "",
    fuelType: vehicle.fuelType ?? "",
    transmission: vehicle.transmission ?? "",
    engineCapacity: vehicle.engineCapacity ?? "",
    seats: vehicle.seats?.toString() ?? "",
    vehicleType: vehicle.vehicleType ?? "",
    purchasePrice: vehicle.purchasePrice ?? "",
    sellingPrice: vehicle.sellingPrice ?? "",
    rentalDailyRate: vehicle.rentalDailyRate ?? "",
    description: vehicle.description ?? "",
    status: vehicle.status,
    purpose: deriveVehiclePurpose(vehicle) ?? "FOR_SALE",
  };
}

// Numeric fields flow through the same string state as text inputs
// (simplest controlled-input model); converted back to numbers here right
// before the request. The price field(s) not implied by `purpose` are sent
// as an explicit `null` (not just omitted) so an edit that changes purpose
// actually clears the other one instead of leaving a stale value in place —
// same reasoning for registrationNo when switching to a For Sale listing.
function buildPayload(values: VehicleFormValues, isCreate: boolean) {
  const showsSelling = values.purpose === "FOR_SALE" || values.purpose === "BOTH";
  const showsRental = values.purpose === "FOR_RENT" || values.purpose === "BOTH";
  const needsRegistration = registrationRequiredForPurpose(values.purpose);

  const payload: Record<string, unknown> = {
    make: values.make,
    model: values.model,
    year: Number(values.year),
    registrationNo: needsRegistration ? values.registrationNo : null,
    vin: values.vin,
    engineNo: values.engineNo || undefined,
    color: values.color || undefined,
    mileage: values.mileage ? Number(values.mileage) : undefined,
    fuelType: values.fuelType || undefined,
    transmission: values.transmission || undefined,
    engineCapacity: values.engineCapacity || undefined,
    seats: values.seats ? Number(values.seats) : undefined,
    vehicleType: values.vehicleType || undefined,
    purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : undefined,
    sellingPrice: showsSelling && values.sellingPrice ? Number(values.sellingPrice) : null,
    rentalDailyRate: showsRental && values.rentalDailyRate ? Number(values.rentalDailyRate) : null,
    description: values.description || undefined,
  };
  if (isCreate) payload.status = values.status;
  return payload;
}

const PURPOSE_CARDS: { value: VehiclePurpose; icon: typeof ShoppingCart; description: string }[] = [
  { value: "FOR_SALE", icon: ShoppingCart, description: "Vehicle will be sold only" },
  { value: "FOR_RENT", icon: Calendar, description: "Vehicle will be rented only" },
  { value: "BOTH", icon: Car, description: "Vehicle will be available for sale and rent" },
];

export function VehicleFormPage() {
  const { vehicleId } = useParams();
  const isCreate = !vehicleId;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [values, setValues] = useState<VehicleFormValues>(EMPTY_FORM);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(!isCreate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newImagePrimary, setNewImagePrimary] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  // Create mode only: photos genuinely can't attach to a vehicle that
  // doesn't exist yet (VehicleImage.vehicleId is a required FK), so a
  // picked file is held here as a local preview and actually uploaded
  // right after the vehicle is created — not sent anywhere until then.
  const [pendingImages, setPendingImages] = useState<{ file: File; url: string; isPrimary: boolean }[]>([]);

  useEffect(() => {
    return () => {
      pendingImages.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showsSelling = values.purpose === "FOR_SALE" || values.purpose === "BOTH";
  const showsRental = values.purpose === "FOR_RENT" || values.purpose === "BOTH";
  const needsRegistration = registrationRequiredForPurpose(values.purpose);

  useEffect(() => {
    if (isCreate || !vehicleId) return;
    let cancelled = false;
    api
      .get<{ vehicle: Vehicle }>(`/vehicles/${vehicleId}`)
      .then((res) => {
        if (cancelled) return;
        setVehicle(res.vehicle);
        setValues(toFormValues(res.vehicle));
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load vehicle"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isCreate, vehicleId]);

  function update<K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const payload = buildPayload(values, isCreate);
      if (isCreate) {
        const res = await api.post<{ vehicle: Vehicle }>("/vehicles", payload);
        let failedUploads = 0;
        for (const pending of pendingImages) {
          try {
            const formData = new FormData();
            formData.append("image", pending.file);
            const { url } = await api.upload<{ url: string }>("/uploads/vehicle-image", formData);
            await api.post(`/vehicles/${res.vehicle.id}/images`, { fileUrl: url, isPrimary: pending.isPrimary });
          } catch {
            failedUploads += 1;
          }
        }
        if (failedUploads > 0) {
          showToast(
            `Vehicle added, but ${failedUploads} photo${failedUploads > 1 ? "s" : ""} failed to upload — add ${
              failedUploads > 1 ? "them" : "it"
            } from Edit Vehicle.`,
            "error"
          );
        } else {
          showToast("Vehicle added successfully");
        }
        navigate("/inventory");
      } else {
        const res = await api.patch<{ vehicle: Vehicle }>(`/vehicles/${vehicleId}`, payload);
        setVehicle(res.vehicle);
        showToast("Vehicle updated successfully");
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : `Failed to ${isCreate ? "add" : "save"} vehicle`;
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refreshVehicle() {
    if (isCreate || !vehicleId) return;
    const res = await api.get<{ vehicle: Vehicle }>(`/vehicles/${vehicleId}`);
    setVehicle(res.vehicle);
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!vehicleId || !file) return;

    setError(null);
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { url } = await api.upload<{ url: string }>("/uploads/vehicle-image", formData);
      await api.post(`/vehicles/${vehicleId}/images`, { fileUrl: url, isPrimary: newImagePrimary });
      setNewImagePrimary(false);
      await refreshVehicle();
      showToast("Photo uploaded");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to upload image";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsUploadingImage(false);
      setFileInputKey((k) => k + 1); // remount to clear the picked file
    }
  }

  function handlePendingFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImages((prev) => [
      ...prev,
      { file, url: URL.createObjectURL(file), isPrimary: newImagePrimary || prev.length === 0 },
    ]);
    setNewImagePrimary(false);
    setFileInputKey((k) => k + 1);
  }

  function handleRemovePendingImage(index: number) {
    setPendingImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      const next = prev.filter((_, i) => i !== index);
      if (removed?.isPrimary && next.length > 0) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  function handleSetPendingPrimary(index: number) {
    setPendingImages((prev) => prev.map((p, i) => ({ ...p, isPrimary: i === index })));
  }

  async function handleDeleteImage(imageId: string) {
    if (!vehicleId) return;
    setError(null);
    try {
      await api.delete(`/vehicles/${vehicleId}/images/${imageId}`);
      await refreshVehicle();
      showToast("Photo removed");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to remove image";
      setError(message);
      showToast(message, "error");
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-action" />
      </div>
    );
  }

  return (
    <div>
      <Link to="/inventory" className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-action hover:underline">
        <ArrowLeft size={14} /> Back to Inventory
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-action/10 text-action">
          <Car size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">{isCreate ? "Add Vehicle" : "Edit Vehicle"}</h1>
          <p className="text-sm text-muted">
            {isCreate ? "Add a new vehicle to the inventory. Fill in the vehicle details below." : "Update this vehicle's details."}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {!isCreate && vehicle && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
          <span className="text-xs font-mono text-muted">{vehicle.stockNumber}</span>
          <StatusBadge status={vehicle.status} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <SectionCard title="Vehicle Purpose" required>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PURPOSE_CARDS.map(({ value, icon: Icon, description }) => {
              const selected = values.purpose === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update("purpose", value)}
                  aria-pressed={selected}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    selected ? "border-action bg-action/5 ring-1 ring-action" : "border-border hover:bg-surface"
                  }`}
                >
                  <Icon size={18} className={selected ? "mt-0.5 text-action" : "mt-0.5 text-muted"} />
                  <div>
                    <div className="text-sm font-semibold text-ink">{PURPOSE_LABELS[value]}</div>
                    <div className="text-xs text-muted">{description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Basic Information" accent="blue">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Make" required>
              <input required value={values.make} onChange={(e) => update("make", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Model" required>
              <input required value={values.model} onChange={(e) => update("model", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Year" required>
              <input
                required
                type="number"
                value={values.year}
                onChange={(e) => update("year", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Vehicle Type">
              <input
                value={values.vehicleType}
                onChange={(e) => update("vehicleType", e.target.value)}
                placeholder="Sedan, SUV, Pickup…"
                className={inputCls}
              />
            </Field>
            <Field label="Color">
              <input value={values.color} onChange={(e) => update("color", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Stock Number">
              <div className="flex h-[38px] items-center rounded-lg border border-border bg-surface px-3 font-mono text-xs text-muted">
                {isCreate ? "Auto-generated on save" : vehicle?.stockNumber}
              </div>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Vehicle Details" accent="blue">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="VIN (Chassis Number)" required>
              <input required value={values.vin} onChange={(e) => update("vin", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Engine Number">
              <input value={values.engineNo} onChange={(e) => update("engineNo", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mileage (km)">
              <input
                type="number"
                min={0}
                value={values.mileage}
                onChange={(e) => update("mileage", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Fuel Type">
              <select value={values.fuelType} onChange={(e) => update("fuelType", e.target.value)} className={inputCls}>
                <option value="">Select fuel type</option>
                {FUEL_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Transmission">
              <select value={values.transmission} onChange={(e) => update("transmission", e.target.value)} className={inputCls}>
                <option value="">Select transmission</option>
                {TRANSMISSION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Engine Capacity">
              <input
                value={values.engineCapacity}
                onChange={(e) => update("engineCapacity", e.target.value)}
                placeholder="e.g. 2.0L"
                className={inputCls}
              />
            </Field>
            <Field label="Number of Seats">
              <select value={values.seats} onChange={(e) => update("seats", e.target.value)} className={inputCls}>
                <option value="">Select number of seats</option>
                {SEAT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Registration No." required={needsRegistration}>
              {needsRegistration ? (
                <input
                  required
                  value={values.registrationNo}
                  onChange={(e) => update("registrationNo", e.target.value)}
                  className={inputCls}
                />
              ) : (
                <div className="flex h-[38px] items-center text-xs text-muted">Not required for a For Sale listing</div>
              )}
            </Field>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard title="Sales Information" accent="green" toggledOn={showsSelling}>
            {showsSelling ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Purchase Price (GHS)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={values.purchasePrice}
                    onChange={(e) => update("purchasePrice", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Selling Price (GHS)" required>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={values.sellingPrice}
                    onChange={(e) => update("sellingPrice", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                {isCreate && (
                  <Field label="Initial Status">
                    <select
                      value={values.status}
                      onChange={(e) => update("status", e.target.value as VehicleFormValues["status"])}
                      className={inputCls}
                    >
                      <option value="AVAILABLE">Available</option>
                      <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                      <option value="UNAVAILABLE">Unavailable</option>
                    </select>
                  </Field>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">Select a "For Sale" or "Both" purpose above to enable sales pricing.</p>
            )}
          </SectionCard>

          <SectionCard title="Rental Information" accent="purple" toggledOn={showsRental}>
            {showsRental ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Daily Rental Rate (GHS)" required>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={values.rentalDailyRate}
                    onChange={(e) => update("rentalDailyRate", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                {isCreate && !showsSelling && (
                  <Field label="Initial Status">
                    <select
                      value={values.status}
                      onChange={(e) => update("status", e.target.value as VehicleFormValues["status"])}
                      className={inputCls}
                    >
                      <option value="AVAILABLE">Available</option>
                      <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                      <option value="UNAVAILABLE">Unavailable</option>
                    </select>
                  </Field>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">Select a "For Rent" or "Both" purpose above to enable rental pricing.</p>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Additional Information" accent="blue">
          <Field label="Description">
            <textarea
              rows={3}
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Enter vehicle description, features, etc. (optional)"
              className={inputCls}
            />
          </Field>
        </SectionCard>

        <SectionCard title="Vehicle Images" accent="blue">
          {isCreate && (
            <p className="mb-3 text-xs text-muted">
              Photos picked here are held until you save, then uploaded automatically.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border px-2 text-center text-muted ${
                isUploadingImage ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface"
              }`}
            >
              {isUploadingImage ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
              <span className="text-xs font-semibold text-ink">
                {isUploadingImage ? "Uploading…" : "Click to upload images"}
              </span>
              <span className="text-[11px] text-muted">PNG, JPG (Max 5MB each)</span>
              <input
                key={fileInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={isCreate ? handlePendingFileSelected : handleFileSelected}
                disabled={isUploadingImage}
                className="hidden"
              />
            </label>

            {isCreate
              ? pendingImages.map((pending, i) => (
                  <div key={pending.url} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                    <img src={pending.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleSetPendingPrimary(i)}
                      aria-label="Set as primary"
                      className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 ${
                        pending.isPrimary ? "text-warning" : "text-muted opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <Star size={12} fill={pending.isPrimary ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePendingImage(i)}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-danger opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              : vehicle?.images?.map((img) => (
                  <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                    <img src={img.fileUrl} alt="" className="h-full w-full object-cover" />
                    {img.isPrimary && (
                      <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-warning">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(img.id)}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-danger opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

            {Array.from({
              length: Math.max(0, 4 - (isCreate ? pendingImages.length : vehicle?.images?.length ?? 0)),
            }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                className="flex aspect-square items-center justify-center rounded-lg border border-border bg-surface text-muted"
              >
                <ImageIcon size={20} />
              </div>
            ))}
          </div>

          <label className="mt-3 flex w-fit items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={newImagePrimary}
              onChange={(e) => setNewImagePrimary(e.target.checked)}
              className="rounded border-border"
            />
            Next upload is the primary photo
          </label>
        </SectionCard>

        {!isCreate && vehicle?.statusHistory && vehicle.statusHistory.length > 0 && (
          <SectionCard title="Status History" accent="blue">
            <ul className="flex flex-col gap-2 text-sm">
              {vehicle.statusHistory.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <div>
                    <span className="text-ink">
                      {entry.oldStatus ? `${entry.oldStatus} → ${entry.newStatus}` : `Created as ${entry.newStatus}`}
                    </span>
                    {entry.reason && <p className="text-xs text-muted">{entry.reason}</p>}
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(entry.changedAt)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface py-4">
          <button
            type="button"
            onClick={() => navigate("/inventory")}
            disabled={isSubmitting}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isCreate ? "Save Vehicle" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

const ACCENT_STYLES: Record<string, string> = {
  blue: "bg-action/5 text-action",
  green: "bg-success/10 text-success",
  purple: "bg-purple-100 text-purple-700",
};

function SectionCard({
  title,
  accent = "blue",
  required,
  toggledOn,
  children,
}: {
  title: string;
  accent?: "blue" | "green" | "purple";
  required?: boolean;
  toggledOn?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={`flex items-center justify-between px-5 py-3 text-sm font-semibold ${ACCENT_STYLES[accent]}`}>
        <span>
          {title}
          {required && <span className="text-danger"> *</span>}
        </span>
        {toggledOn !== undefined && (
          <span
            className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${toggledOn ? "bg-current" : "bg-border"}`}
          >
            <span
              className={`h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                toggledOn ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
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
