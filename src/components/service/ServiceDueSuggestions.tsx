import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "../../lib/api-client";
import { formatDate } from "../../lib/format";
import type { Vehicle } from "../../types/vehicle";

type DueUrgency = "OVERDUE" | "DUE" | "DUE_SOON";

export type DueVehicle = Pick<Vehicle, "id" | "stockNumber" | "make" | "model" | "year" | "registrationNo" | "mileage" | "status">;

interface Suggestion {
  vehicle: DueVehicle;
  urgency: DueUrgency;
  dueDate: string;
  reasons: string[];
  lastService: { jobNumber: string; completedAt: string | null; serviceType: string | null } | null;
}

interface SuggestionsResult {
  suggestions: Suggestion[];
  counts: { overdue: number; due: number; dueSoon: number };
}

const URGENCY_STYLES: Record<DueUrgency, string> = {
  OVERDUE: "bg-danger/10 text-danger",
  DUE: "bg-warning/10 text-warning",
  DUE_SOON: "bg-action/10 text-action",
};
const URGENCY_LABELS: Record<DueUrgency, string> = { OVERDUE: "Overdue", DUE: "Due now", DUE_SOON: "Due soon" };

interface ServiceDueSuggestionsProps {
  limit?: number;
  // Admin only: book the car in. Only offered for cars free to be worked on.
  onAssign?: (vehicle: DueVehicle) => void;
  refreshKey?: number;
}

// Mechanic's intelligent assistant (GET /service/jobs/due-suggestions):
// the dealership's own cars that should come in for a service, from their
// mileage/age, service history, reminders and rental use — each with its
// reasons. A suggestion only; the Admin still creates the job.
export function ServiceDueSuggestions({ limit = 5, onAssign, refreshKey = 0 }: ServiceDueSuggestionsProps) {
  const [result, setResult] = useState<SuggestionsResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api
      .get<SuggestionsResult>("/service/jobs/due-suggestions")
      .then((res) => !cancelled && setResult(res))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const items = result ? (showAll ? result.suggestions : result.suggestions.slice(0, limit)) : [];

  return (
    <section aria-label="Service due" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles size={15} className="text-action" /> Service due
        </h2>
        {result && result.suggestions.length > 0 && (
          <p className="text-xs text-muted">
            {result.counts.overdue} overdue · {result.counts.due} due now · {result.counts.dueSoon} due soon
          </p>
        )}
      </div>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Suggested from each car's mileage, age, service history, reminders and time on hire.
      </p>

      {failed ? (
        <p className="py-4 text-center text-sm text-muted">Suggestions aren't available right now.</p>
      ) : !result ? (
        <div className="flex justify-center py-4">
          <Loader2 size={18} className="animate-spin text-action" />
        </div>
      ) : result.suggestions.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">No cars are due for a service.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {items.map((s) => (
              <li key={s.vehicle.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_STYLES[s.urgency]}`}>
                      {URGENCY_LABELS[s.urgency]}
                    </span>
                    <span className="font-medium text-ink">
                      {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {s.vehicle.registrationNo ?? s.vehicle.stockNumber}
                    {s.vehicle.mileage !== null && ` · ${s.vehicle.mileage.toLocaleString()} km`}
                    {s.lastService?.completedAt
                      ? ` · last service ${formatDate(s.lastService.completedAt)}${s.lastService.serviceType ? ` (${s.lastService.serviceType})` : ""}`
                      : " · no service on record"}
                    {s.vehicle.status === "RENTED" && " · on hire now"}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-ink/80">
                    {s.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                {onAssign && s.vehicle.status === "AVAILABLE" && (
                  <button
                    type="button"
                    onClick={() => onAssign(s.vehicle)}
                    className="shrink-0 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-action hover:bg-surface"
                  >
                    Assign job
                  </button>
                )}
              </li>
            ))}
          </ul>
          {result.suggestions.length > limit && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm font-medium text-action hover:underline">
              {showAll ? "Show fewer" : `Show all ${result.suggestions.length} →`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
