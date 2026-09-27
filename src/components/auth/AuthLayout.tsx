import type { ReactNode } from "react";
import { Car, Link2, ShieldCheck, TrendingUp } from "lucide-react";

const FEATURES = [
  { icon: ShieldCheck, title: "Secure Access", desc: "Role-based authentication" },
  { icon: TrendingUp, title: "Real-time Insights", desc: "Make smarter business decisions" },
  { icon: Link2, title: "Everything Connected", desc: "One system. Total control." },
];

// Shared split-screen shell for every pre-auth screen (Login, Forgot
// Password, Reset Password) — same hero panel each time, per the
// admin_pages/loginpage.jpeg reference, but in the app's navy/blue palette
// rather than the mockup's red/black (per the client's explicit choice to
// keep one consistent brand color across the whole product). No real
// vehicle photo — there's no licensed image asset for this, so the hero
// uses a large decorative car glyph instead of guessing at a stock photo.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <div className="relative hidden w-[46%] max-w-xl shrink-0 flex-col justify-between overflow-hidden bg-primary px-12 py-12 text-white lg:flex">
        <Car size={480} strokeWidth={0.6} className="pointer-events-none absolute -bottom-24 -right-24 text-white/[0.06]" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <Car size={18} />
            </div>
            <span className="text-lg font-bold tracking-wide">CARDEALER PRO</span>
          </div>

          <h1 className="mt-16 text-4xl font-bold leading-tight">
            Smart Dealership.
            <br />
            <span className="text-action">Stronger Business.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Manage your sales, rentals, financing, inventory and service — all in one powerful platform.
          </p>
        </div>

        <div className="relative flex flex-col gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-action">
                <f.icon size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-white/60">{f.desc}</p>
              </div>
            </div>
          ))}
          <p className="mt-4 text-xs text-white/40">&copy; {new Date().getFullYear()} CARDEALER PRO. All rights reserved.</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
