import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

// Serves as the catch-all for both a genuinely unknown path and a path
// that belongs to another role — since routes are only ever registered
// for the current role's own nav (see AppRoutes.tsx), the two cases are
// indistinguishable from here, matching App Flow §11's combined handling:
// "Unauthorized route: show access denied and redirect to the user's
// dashboard."
export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert size={32} className="text-muted" />
      <h1 className="text-lg font-semibold text-ink">Access denied</h1>
      <p className="text-sm text-muted">This page doesn't exist or isn't available for your role.</p>
      <Link to="/dashboard" className="touch-target mt-2 text-sm font-medium text-action hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
