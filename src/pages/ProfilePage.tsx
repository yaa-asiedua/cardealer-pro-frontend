import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Loader2, User as UserIcon } from "lucide-react";
import { api, ApiError } from "../lib/api-client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROLE_LABELS } from "../lib/nav-config";

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action";

export function ProfilePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const isCommissioned = user.role === "SALES_SALESPERSON";

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      showToast("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4 border-b border-border pb-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-action/10 text-action">
            <UserIcon size={24} />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">{user.fullName}</p>
            <p className="text-sm text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-4">
          <div className="flex justify-between text-sm">
            <dt className="text-muted">Username</dt>
            <dd className="font-medium text-ink">{user.username}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-muted">Role</dt>
            <dd className="font-medium text-ink">{ROLE_LABELS[user.role]}</dd>
          </div>
          {isCommissioned && (
            <div className="flex justify-between text-sm">
              <dt className="text-muted">Commission rate</dt>
              <dd className="font-medium text-ink">{Number(user.commissionRate)}%</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound size={16} className="text-action" /> Change Password
        </h2>

        <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="currentPassword" className="mb-1 block text-xs font-medium text-muted">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-xs font-medium text-muted">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-muted">At least 8 characters</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-muted">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 flex items-center justify-center gap-2 self-start rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Change Password
          </button>
        </form>
      </div>
    </div>
  );
}
