import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api-client";
import { useAuth } from "./AuthContext";
import type { BusinessSettings } from "../types/settings";

interface BusinessSettingsContextValue {
  logoUrl: string | null;
  refresh: () => void;
}

const BusinessSettingsContext = createContext<BusinessSettingsContextValue | null>(null);

// GET /settings/business works for any authenticated role (only editing
// is Admin-only), so this fetches at the app root once per signed-in
// user rather than per navigation. Keyed on the user, not on mount:
// fetching on mount meant the login screen's request 401'd and nothing
// re-fetched after sign-in, so the sidebar logo stayed blank until a
// full page reload.
export function BusinessSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!userId) {
      setLogoUrl(null);
      return;
    }
    api
      .get<{ settings: BusinessSettings }>("/settings/business")
      .then((res) => setLogoUrl(res.settings.logoUrl))
      .catch(() => setLogoUrl(null));
  }, [userId]);

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
