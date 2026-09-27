import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Car,
  Key,
  Loader2,
  Plus,
  UserPlus,
  Users,
  Upload,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import {
  GENDER_OPTIONS,
  GHANA_REGIONS,
  ID_TYPE_OPTIONS,
  PREFERRED_CONTACT_METHODS,
} from "../lib/customer-helpers";
import { formatDateTime } from "../lib/format";
import type { Customer, CustomerStatus, CustomerType } from "../types/customer";

interface SalespersonOption {
  id: string;
  fullName: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  idType: string;
  idNumber: string;
  nationality: string;
  occupation: string;
  address: string;
  city: string;
  region: string;
  landmark: string;
  postalAddress: string;
  digitalAddress: string;
  customerType: CustomerType;
  preferredContactMethod: string;
  notes: string;
  salespersonId: string;
  status: CustomerStatus;
  profilePhotoUrl: string;
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  idType: "",
  idNumber: "",
  nationality: "Ghanaian",
  occupation: "",
  address: "",
  city: "",
  region: "",
  landmark: "",
  postalAddress: "",
  digitalAddress: "",
  customerType: "PURCHASE",
  preferredContactMethod: "",
  notes: "",
  salespersonId: "",
  status: "ACTIVE",
  profilePhotoUrl: "",
};

function toFormState(c: Customer): FormState {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    gender: c.gender ?? "",
    dateOfBirth: c.dateOfBirth?.slice(0, 10) ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    idType: c.idType ?? "",
    idNumber: c.idNumber ?? "",
    nationality: c.nationality ?? "",
    occupation: c.occupation ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    region: c.region ?? "",
    landmark: c.landmark ?? "",
    postalAddress: c.postalAddress ?? "",
    digitalAddress: c.digitalAddress ?? "",
    customerType: c.customerType,
    preferredContactMethod: c.preferredContactMethod ?? "",
    notes: c.notes ?? "",
    salespersonId: "",
    status: c.status,
    profilePhotoUrl: c.profilePhotoUrl ?? "",
  };
}

function buildPayload(values: FormState, isAdmin: boolean, status?: CustomerStatus) {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    gender: values.gender || undefined,
    dateOfBirth: values.dateOfBirth || undefined,
    phone: values.phone || undefined,
    email: values.email || undefined,
    idType: values.idType || undefined,
    idNumber: values.idNumber || undefined,
    nationality: values.nationality || undefined,
    occupation: values.occupation || undefined,
    address: values.address || undefined,
    city: values.city || undefined,
    region: values.region || undefined,
    landmark: values.landmark || undefined,
    postalAddress: values.postalAddress || undefined,
    digitalAddress: values.digitalAddress || undefined,
    customerType: values.customerType,
    preferredContactMethod: values.preferredContactMethod || undefined,
    notes: values.notes || undefined,
    profilePhotoUrl: values.profilePhotoUrl || undefined,
    status: status ?? values.status,
    ...(isAdmin && values.salespersonId ? { salespersonId: values.salespersonId } : {}),
  };
}

export function CustomerFormPage() {
  const { customerId } = useParams();
  const isCreate = !customerId;
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [values, setValues] = useState<FormState>(EMPTY_FORM);
  const [savedCustomer, setSavedCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(!isCreate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      api.get<{ data: SalespersonOption[] }>("/admin/users?roleCode=SALES_SALESPERSON&status=ACTIVE&pageSize=100"),
      api.get<{ data: SalespersonOption[] }>("/admin/users?roleCode=RENTAL_SALESPERSON&status=ACTIVE&pageSize=100"),
    ])
      .then(([sales, rentals]) => setSalespeople([...sales.data, ...rentals.data].sort((a, b) => a.fullName.localeCompare(b.fullName))))
      .catch(() => setSalespeople([]));
  }, [isAdmin]);

  useEffect(() => {
    if (isCreate || !customerId) return;
    let cancelled = false;
    api
      .get<{ customer: Customer }>(`/customers/${customerId}`)
      .then((res) => {
        if (cancelled) return;
        setSavedCustomer(res.customer);
        setValues(toFormState(res.customer));
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Failed to load customer"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isCreate, customerId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const handlePhotoSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { url } = await api.upload<{ url: string }>("/uploads/customer-photo", formData);
      update("profilePhotoUrl", url);
      showToast("Photo uploaded");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to upload photo";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [showToast]);

  async function submit(status?: CustomerStatus) {
    setError(null);
    if (!values.firstName.trim() || !values.lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = buildPayload(values, isAdmin, status);
      if (isCreate) {
        await api.post<{ customer: Customer }>("/customers", payload);
        showToast("Customer added successfully");
        navigate("/customers");
      } else {
        const res = await api.patch<{ customer: Customer }>(`/customers/${customerId}`, payload);
        setSavedCustomer(res.customer);
        showToast("Customer updated");
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save customer";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
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
      <Link to="/customers" className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-action hover:underline">
        <ArrowLeft size={14} /> Back to Customers
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-action/10 text-action">
          <UserPlus size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">{isCreate ? "Add New Customer" : "Edit Customer"}</h1>
          <p className="text-sm text-muted">
            {isCreate ? "Register a new customer to the system. Fill in the customer details below." : "Update this customer's details."}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <FormCard title="1. Personal Information" subtitle="Basic details about the customer.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="First Name" required>
                <input required value={values.firstName} onChange={(e) => update("firstName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Last Name" required>
                <input required value={values.lastName} onChange={(e) => update("lastName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Gender" required>
                <select required value={values.gender} onChange={(e) => update("gender", e.target.value)} className={inputCls}>
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date of Birth">
                <input type="date" value={values.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone Number" required>
                <input required value={values.phone} onChange={(e) => update("phone", e.target.value)} placeholder="e.g. 020 123 4567" className={inputCls} />
              </Field>
              <Field label="Email Address">
                <input type="email" value={values.email} onChange={(e) => update("email", e.target.value)} placeholder="e.g. name@gmail.com" className={inputCls} />
              </Field>
              <Field label="ID Type">
                <select value={values.idType} onChange={(e) => update("idType", e.target.value)} className={inputCls}>
                  <option value="">Select ID type</option>
                  {ID_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ID Number">
                <input value={values.idNumber} onChange={(e) => update("idNumber", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Nationality">
                <input value={values.nationality} onChange={(e) => update("nationality", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Occupation">
                <input value={values.occupation} onChange={(e) => update("occupation", e.target.value)} placeholder="e.g. Businessman, Teacher, etc." className={inputCls} />
              </Field>
            </div>
          </FormCard>

          <FormCard title="2. Address Information" subtitle="Customer's residential address.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Residential Address" required>
                  <input required value={values.address} onChange={(e) => update("address", e.target.value)} placeholder="e.g. house number, street, area" className={inputCls} />
                </Field>
              </div>
              <Field label="City/Town">
                <input value={values.city} onChange={(e) => update("city", e.target.value)} placeholder="e.g. Accra" className={inputCls} />
              </Field>
              <Field label="Region">
                <select value={values.region} onChange={(e) => update("region", e.target.value)} className={inputCls}>
                  <option value="">Select region</option>
                  {GHANA_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Landmark (Optional)">
                <input value={values.landmark} onChange={(e) => update("landmark", e.target.value)} placeholder="e.g. Near the school" className={inputCls} />
              </Field>
              <Field label="Postal Address (Optional)">
                <input value={values.postalAddress} onChange={(e) => update("postalAddress", e.target.value)} placeholder="e.g. P.O. Box GP 1234" className={inputCls} />
              </Field>
              <Field label="Digital Address (Optional)">
                <input value={values.digitalAddress} onChange={(e) => update("digitalAddress", e.target.value)} placeholder="e.g. GA-123-4567" className={inputCls} />
              </Field>
            </div>
          </FormCard>

          <FormCard title="3. Customer Type & Preferences" subtitle="Set customer type and communication preferences.">
            <div className="mb-4">
              <span className="mb-2 block text-xs font-medium text-ink">
                Customer Type <span className="text-danger">*</span>
              </span>
              <div className="flex gap-4">
                {(["PURCHASE", "RENTAL", "BOTH"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-sm text-ink">
                    <input type="radio" name="customerType" checked={values.customerType === t} onChange={() => update("customerType", t)} />
                    {t === "PURCHASE" ? "Purchase" : t === "RENTAL" ? "Rental" : "Both"}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Preferred Contact Method">
                <select value={values.preferredContactMethod} onChange={(e) => update("preferredContactMethod", e.target.value)} className={inputCls}>
                  <option value="">Select preferred method</option>
                  {PREFERRED_CONTACT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <textarea rows={2} value={values.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Add any additional notes about the customer…" className={inputCls} />
              </Field>
            </div>
          </FormCard>

          {(isAdmin || !isCreate) && (
            <FormCard title="4. Additional Information" subtitle="Optional details for better customer management.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {isAdmin && (
                  <Field label="Assign Salesperson (Optional)">
                    <select value={values.salespersonId} onChange={(e) => update("salespersonId", e.target.value)} className={inputCls}>
                      <option value="">Select salesperson</option>
                      {salespeople.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.fullName}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {!isCreate && (
                  <Field label="Status">
                    <select value={values.status} onChange={(e) => update("status", e.target.value as CustomerStatus)} className={inputCls}>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="DRAFT">Draft</option>
                    </select>
                  </Field>
                )}
              </div>
            </FormCard>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <FormCard title="Profile Picture">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface text-muted">
                {values.profilePhotoUrl ? (
                  <img src={values.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Users size={32} />
                )}
              </div>
              <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface ${isUploadingPhoto ? "cursor-not-allowed opacity-60" : ""}`}>
                {isUploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {isUploadingPhoto ? "Uploading…" : "Upload Photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelected} disabled={isUploadingPhoto} className="hidden" />
              </label>
              <p className="text-center text-xs text-muted">JPG, PNG or WEBP. Max size 5MB</p>
            </div>
          </FormCard>

          <FormCard title="Customer Summary" subtitle="A quick overview of the customer details.">
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-action/5 px-3 py-2 text-xs text-ink">
              {isCreate
                ? "Customer information will be saved and assigned a unique customer ID automatically."
                : "Editing an existing customer record."}
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Customer ID" value={savedCustomer?.id.slice(0, 8) ?? "Auto-generated"} mono />
              <Row label="Full Name" value={values.firstName || values.lastName ? `${values.firstName} ${values.lastName}`.trim() : "—"} />
              <Row label="Phone" value={values.phone || "—"} />
              <Row label="Email" value={values.email || "—"} />
              <Row label="Customer Type" value={values.customerType === "PURCHASE" ? "Purchase" : values.customerType === "RENTAL" ? "Rental" : "Both"} />
              <Row label="Date Registered" value={savedCustomer ? formatDateTime(savedCustomer.createdAt) : "Not yet saved"} />
              <Row label="Status" value={values.status.charAt(0) + values.status.slice(1).toLowerCase()} />
            </dl>
          </FormCard>

          <FormCard title="Quick Actions" subtitle="Actions after saving the customer.">
            {!savedCustomer ? (
              <p className="text-xs text-muted">Available after you save this customer.</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/customers/new" className="flex items-center gap-2 text-action hover:underline">
                  <Plus size={14} /> Add Another Customer
                </Link>
                <Link to="/customers" className="flex items-center gap-2 text-action hover:underline">
                  <Users size={14} /> View Customer List
                </Link>
                <Link to="/sales" className="flex items-center gap-2 text-action hover:underline">
                  <Car size={14} /> Create a Sale
                </Link>
                <Link to="/rentals" className="flex items-center gap-2 text-action hover:underline">
                  <Key size={14} /> Create a Rental
                </Link>
              </div>
            )}
          </FormCard>
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 flex justify-between gap-2 border-t border-border bg-surface py-4">
        <button type="button" onClick={() => navigate("/customers")} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-card">
          Cancel
        </button>
        <div className="flex gap-2">
          {isCreate && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => submit("DRAFT")}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Save as Draft
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => submit(isCreate ? "ACTIVE" : undefined)}
            className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isCreate ? "Save Customer" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

function FormCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-2 first:border-0 first:pt-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-xs font-medium text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
