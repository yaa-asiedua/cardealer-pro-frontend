import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Loader2, User as UserIcon, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api, ApiError } from "../../lib/api-client";
import { DEPARTMENT_OPTIONS } from "../../lib/employee-helpers";
import { ROLE_LABELS } from "../../lib/nav-config";
import type { RoleCode } from "../../types";
import type { CreateEmployeeInput, Employee, EmploymentStatus, UpdateEmployeeInput } from "../../types/employee";
import { ModalOverlay } from "../ModalOverlay";

interface EmployeeFormModalProps {
  employeeId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS: RoleCode[] = ["ADMIN", "SALES_SALESPERSON", "RENTAL_SALESPERSON", "FINANCE_MANAGER", "MECHANIC"];

export function EmployeeFormModal({ employeeId, onClose, onSaved }: EmployeeFormModalProps) {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const isCreate = !employeeId;
  const isEditingSelf = !isCreate && employeeId === currentUser?.id;

  const [isLoading, setIsLoading] = useState(!isCreate);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [roleCode, setRoleCode] = useState<RoleCode | "">("");
  const [department, setDepartment] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [status, setStatus] = useState<EmploymentStatus>("ACTIVE");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isCreate) return;
    api
      .get<{ user: Employee }>(`/admin/users/${employeeId}`)
      .then((emp) => {
        setUsername(emp.user.username);
        setFullName(emp.user.fullName);
        setEmail(emp.user.email ?? "");
        setPhone(emp.user.phone ?? "");
        setAddress(emp.user.address ?? "");
        setDateOfBirth(emp.user.dateOfBirth ? emp.user.dateOfBirth.slice(0, 10) : "");
        setProfilePhotoUrl(emp.user.profilePhotoUrl ?? "");
        setRoleCode(emp.user.role.code);
        setDepartment(emp.user.department ?? "");
        setCommissionRate(emp.user.commissionRate ?? "");
        setStatus(emp.user.status);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load employee"))
      .finally(() => setIsLoading(false));
  }, [isCreate, employeeId]);

  const handlePhotoSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { url } = await api.upload<{ url: string }>("/uploads/employee-photo", formData);
      setProfilePhotoUrl(url);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to upload photo";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [showToast]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) return setError("Full name is required");
    if (!roleCode) return setError("Select a role");
    if (isCreate && (!username.trim() || !password)) return setError("Username and password are required");

    setIsSubmitting(true);
    try {
      if (isCreate) {
        const payload: CreateEmployeeInput = {
          username: username.trim(),
          password,
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          profilePhotoUrl: profilePhotoUrl || undefined,
          roleCode,
          department: department.trim() || undefined,
          commissionRate: roleCode === "SALES_SALESPERSON" && commissionRate ? Number(commissionRate) : undefined,
        };
        await api.post("/admin/users", payload);
      } else {
        const payload: UpdateEmployeeInput = {
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          dateOfBirth: dateOfBirth || null,
          profilePhotoUrl: profilePhotoUrl || null,
          roleCode,
          department: department.trim() || null,
          commissionRate: roleCode === "SALES_SALESPERSON" && commissionRate ? Number(commissionRate) : null,
          status,
        };
        await api.patch(`/admin/users/${employeeId}`, payload);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save employee";
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
          <h2 className="text-base font-semibold text-ink">{isCreate ? "New Employee" : "Edit Employee"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-action" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && (
                <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <FormSection title="Personal Information">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-muted">
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserIcon size={24} />
                    )}
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface">
                    {isUploadingPhoto ? "Uploading…" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoSelected}
                      disabled={isUploadingPhoto}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Full name</span>
                    <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Phone</span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Email</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Date of birth</span>
                    <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Address</span>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
                  </label>
                </div>
              </FormSection>

              <FormSection title="Employment Details">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Role</span>
                    <select required value={roleCode} onChange={(e) => setRoleCode(e.target.value as RoleCode)} className={inputCls}>
                      <option value="">Select role…</option>
                      {ROLE_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {ROLE_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-ink">Department</span>
                    <input list="department-options" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} />
                    <datalist id="department-options">
                      {DEPARTMENT_OPTIONS.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </label>
                  {roleCode === "SALES_SALESPERSON" && (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-medium text-ink">Commission rate (%)</span>
                      <input
                        type="number" inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.1"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        className={inputCls}
                      />
                    </label>
                  )}
                  {!isCreate && (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-medium text-ink">Status</span>
                      <select
                        value={status}
                        disabled={isEditingSelf}
                        onChange={(e) => setStatus(e.target.value as EmploymentStatus)}
                        className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="ON_LEAVE">On Leave</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                      {isEditingSelf && <span className="text-xs text-muted">You can't change your own status.</span>}
                    </label>
                  )}
                </div>
              </FormSection>

              {isCreate && (
                <FormSection title="System Access">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-medium text-ink">Username</span>
                      <input required value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-medium text-ink">Password</span>
                      <input
                        required
                        type="password"
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputCls}
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Set directly here — no invite email is sent (no email provider is configured in this environment). The
                    employee can change their password after logging in, or you can reset it later from this page.
                  </p>
                </FormSection>
              )}
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
                disabled={isSubmitting || isUploadingPhoto}
                className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {isCreate ? "Save Employee" : "Save Changes"}
              </button>
            </div>
          </form>
        )}
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
