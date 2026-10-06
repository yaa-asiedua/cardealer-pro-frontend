import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, Users2 } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";
import { useBusinessSettings } from "../context/BusinessSettingsContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api-client";
import type { BusinessSettings, UpdateBusinessSettingsInput } from "../types/settings";

type Tab = "business" | "users" | "payments" | "security" | "notifications" | "system";

const TABS: { key: Tab; label: string }[] = [
  { key: "business", label: "Business Settings" },
  { key: "users", label: "User & Role Management" },
  { key: "payments", label: "Payment Settings" },
  { key: "security", label: "Security Settings" },
  { key: "notifications", label: "Notification Settings" },
  { key: "system", label: "System Configuration" },
];

// Deliberately no "Backup & Restore" tab — cut entirely, not deferred.
// See src/modules/settings/README.md (backend) for the full reasoning:
// no real backing exists, and a "restore the database" action is a
// destructive feature that shouldn't be fabricated as a UI exercise.

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("business");

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
              tab === t.key ? "bg-action/10 text-action" : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {tab === "business" && <BusinessSettingsTab />}
        {tab === "users" && <UserManagementTab />}
        {tab === "payments" && <ComingSoon screen="Payment Settings" />}
        {tab === "security" && <ComingSoon screen="Security Settings" />}
        {tab === "notifications" && <ComingSoon screen="Notification Settings" />}
        {tab === "system" && <ComingSoon screen="System Configuration" />}
      </div>
    </div>
  );
}

function UserManagementTab() {
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-action/10 text-action">
          <Users2 size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">User & Role Management</p>
          <p className="mt-1 text-sm text-muted">
            Manage staff, roles, and account status from the Employees page — the same real employee records, not a
            separate copy.
          </p>
          <button
            type="button"
            onClick={() => navigate("/employees")}
            className="mt-3 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Go to Employees
          </button>
        </div>
      </div>
    </div>
  );
}

function BusinessSettingsTab() {
  const { showToast } = useToast();
  const { refresh: refreshLogo } = useBusinessSettings();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    api
      .get<{ settings: BusinessSettings }>("/settings/business")
      .then((res) => {
        setBusinessName(res.settings.businessName ?? "");
        setBusinessEmail(res.settings.businessEmail ?? "");
        setBusinessPhone(res.settings.businessPhone ?? "");
        setBusinessAddress(res.settings.businessAddress ?? "");
        setTimeZone(res.settings.timeZone ?? "");
        setLogoUrl(res.settings.logoUrl ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load settings"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogoSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { url } = await api.upload<{ url: string }>("/uploads/business-logo", formData);
      setLogoUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
    }
  }, []);

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      const payload: UpdateBusinessSettingsInput = {
        businessName: businessName.trim() || null,
        businessEmail: businessEmail.trim() || null,
        businessPhone: businessPhone.trim() || null,
        businessAddress: businessAddress.trim() || null,
        timeZone: timeZone.trim() || null,
        logoUrl: logoUrl || null,
      };
      await api.patch("/settings/business", payload);
      showToast("Settings saved");
      refreshLogo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-action" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Building2 size={18} className="text-action" />
        <h2 className="text-sm font-semibold text-ink">Business Information</h2>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink">Business Name</span>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink">Business Email</span>
          <input type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink">Business Phone</span>
          <input type="tel" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink">
            Time Zone <span className="font-normal text-muted">(stored only — not yet applied anywhere)</span>
          </span>
          <input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="e.g. Africa/Accra" className={inputCls} />
        </label>
        <label className="col-span-full flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-ink">Business Address</span>
          <textarea rows={2} value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} className={inputCls} />
        </label>
      </div>

      <div className="mt-5">
        <span className="text-xs font-medium text-ink">Business Logo</span>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <Building2 size={22} className="text-muted" />}
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface">
            {isUploadingLogo ? "Uploading…" : "Upload logo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoSelected} disabled={isUploadingLogo} className="hidden" />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">Shows in the sidebar for every role once saved.</p>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isUploadingLogo}
          className="flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving && <Loader2 size={14} className="animate-spin" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";
