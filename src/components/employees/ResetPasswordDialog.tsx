import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { api, ApiError } from "../../lib/api-client";

export function ResetPasswordDialog({
  employeeId,
  employeeName,
  onClose,
  onReset,
}: {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onReset: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      throw new Error("Password must be at least 8 characters");
    }
    try {
      await api.post(`/admin/users/${employeeId}/reset-password`, { newPassword });
      onReset();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to reset password");
    }
  }

  return (
    <ConfirmDialog
      title="Reset password?"
      description={`Set a new password for ${employeeName}. They'll need to use it on their next login.`}
      confirmLabel="Reset Password"
      extraContent={
        <div>
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (min. 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
      }
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
