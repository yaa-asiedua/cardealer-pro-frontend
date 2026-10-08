import { useEffect, useRef } from "react";

const MIN_GAP_MS = 10_000;

// Re-runs a page's data loader every `intervalMs` while the tab is visible,
// and straight away when the user comes back to the tab — so an Admin
// watching Sales/Rentals/Service sees what other roles just did without
// reloading. Background refreshes are throttled (at most one per 10s).
// Pages keep showing their current rows while a refresh is in flight
// (their loading placeholder only shows before the first load).
export function useAutoRefresh(refresh: () => void, intervalMs = 60_000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let last = Date.now();
    function run() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      refreshRef.current();
    }
    const id = window.setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs]);
}
