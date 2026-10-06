import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { AuthLayout } from "../components/auth/AuthLayout";
import { api, ApiError } from "../lib/api-client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <MailCheck size={26} />
          </div>
          <h1 className="text-xl font-bold text-ink">Check your email</h1>
          <p className="mt-2 text-sm text-muted">
            If an account exists for <span className="font-medium text-ink">{email}</span>, a reset link has been sent.
          </p>
          <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
            No email provider is configured in this dev environment — the reset link is written to the backend
            server's console log instead of actually being emailed.
          </p>
          <Link to="/login" className="touch-target mt-6 flex items-center gap-1.5 text-sm font-medium text-action hover:underline">
            <ArrowLeft size={14} /> Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-action/10 text-action">
          <Mail size={26} />
        </div>
        <h1 className="text-xl font-bold text-ink">Forgot Password?</h1>
        <p className="mt-1 text-sm text-muted">Enter your email and we'll send you a reset link</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
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
          className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting ? "Sending…" : "Send Reset Link"}
        </button>
      </form>

      <Link to="/login" className="touch-target mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-action hover:underline">
        <ArrowLeft size={14} /> Back to login
      </Link>
    </AuthLayout>
  );
}
