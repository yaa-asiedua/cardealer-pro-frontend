import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api-client";
import type { BusinessSettings } from "../types/settings";

interface BusinessSettingsContextValue {
  logoUrl: string | null;
  refresh: () => void;
}

const BusinessSettingsContext = createContext<BusinessSettingsContextValue | null>(null);

// GET /settings/business works for any authenticated role (only editing
// is Admin-only), so this fetches once at the app root regardless of
// which role is logged in — same "fetch once, not per navigation" shape
// as AuthContext's own session restore. A pre-login 401 is expected and
// silently ignored, same as AuthContext does for /auth/me.
export function BusinessSettingsProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .get<{ settings: BusinessSettings }>("/settings/business")
      .then((res) => setLogoUrl(res.settings.logoUrl))
      .catch(() => setLogoUrl(null));
  }, []);

  useEffect(refresh, [refresh]);

  const value = useMemo(() => ({ logoUrl, refresh }), [logoUrl, refresh]);

  return <BusinessSettingsContext.Provider value={value}>{children}</BusinessSettingsContext.Provider>;
}

export function useBusinessSettings(): BusinessSettingsContextValue {
  const ctx = useContext(BusinessSettingsContext);
  if (!ctx) {
    throw new Error("useBusinessSettings must be used within a BusinessSettingsProvider");
  }
  return ctx;
}
