import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowRight, Car, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthLayout } from "../components/auth/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api-client";
import { DEFAULT_ROUTE } from "../lib/nav-config";

const GENERIC_ERROR = "Invalid username or password";

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? DEFAULT_ROUTE;
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      // Backend deliberately returns one generic message for both a
      // wrong password and an unknown username (auth.service.ts) — surface
      // whatever it sends rather than a different client-side message.
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-action/10 text-action">
          <Car size={26} />
        </div>
        <h1 className="text-xl font-bold text-ink">Welcome Back!</h1>
        <p className="mt-1 text-sm text-muted">Sign in to access your dashboard</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-ink">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            {/* No email service is connected yet, so the self-service reset
                link would never reach anyone — an Admin resets passwords from
                Employees instead. The /forgot-password route still exists for
                when email delivery is added. */}
            <span className="text-xs text-muted">Forgot it? Ask your Admin</span>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-ink outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
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
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Sign In
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don't have an account? <span className="font-medium text-ink">Contact your administrator</span>
      </p>
    </AuthLayout>
  );
}
