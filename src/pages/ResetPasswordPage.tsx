import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { AuthLayout } from "../components/auth/AuthLayout";
import { api, ApiError } from "../lib/api-client";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  if (!token) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
            <ShieldAlert size={26} />
          </div>
          <h1 className="text-xl font-bold text-ink">Invalid reset link</h1>
          <p className="mt-2 text-sm text-muted">This link is missing its reset token. Request a new one below.</p>
          <Link
            to="/forgot-password"
            className="mt-6 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
          >
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (succeeded) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 size={26} />
          </div>
          <h1 className="text-xl font-bold text-ink">Password reset</h1>
          <p className="mt-2 text-sm text-muted">Your password has been changed. Sign in with your new password.</p>
          <Link to="/login" className="mt-6 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-primary">
            Go to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword });
      setSucceeded(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-action/10 text-action">
          <KeyRound size={26} />
        </div>
        <h1 className="text-xl font-bold text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">Choose a new password for your account</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-ink">
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
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-ink">
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
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
            {error.includes("expired") && (
              <>
                {" "}
                <Link to="/forgot-password" className="font-medium underline">
                  Request a new link
                </Link>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting ? "Saving…" : "Reset Password"}
        </button>
      </form>
    </AuthLayout>
  );
}
