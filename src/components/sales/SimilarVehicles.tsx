import { useEffect, useState } from "react";
import { Car, Loader2, Sparkles } from "lucide-react";
import { api } from "../../lib/api-client";
import { formatCurrency } from "../../lib/format";
import { vehicleDisplayName } from "../../lib/vehicle-helpers";
import type { Vehicle } from "../../types/vehicle";

interface Recommendation {
  vehicle: Vehicle;
  score: number;
  reasons: string[];
}

interface SimilarVehiclesProps {
  vehicleId: string;
  // Shown as the button on each suggestion ("Use instead", "Sell this one")
  pickLabel: string;
  onPick: (vehicle: Vehicle) => void;
  limit?: number;
}

// Sales' intelligent assistant (GET /vehicles/:id/similar): available cars
// close to the one being looked at, ranked by a transparent attribute
// match. Shown as a suggestion with its reasons — the salesperson decides.
export function SimilarVehicles({ vehicleId, pickLabel, onPick, limit = 3 }: SimilarVehiclesProps) {
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    api
      .get<{ recommendations: Recommendation[] }>(`/vehicles/${vehicleId}/similar?limit=${limit}`)
      .then((res) => !cancelled && setItems(res.recommendations))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [vehicleId, limit]);

  return (
    <section aria-label="Similar cars in stock" className="rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sparkles size={15} className="text-action" /> Similar cars in stock
      </h3>
      <p className="mb-3 mt-0.5 text-xs text-muted">Suggested by body type, price, make and year, to offer the customer alternatives.</p>

      {failed ? (
        <p className="text-xs text-muted">Suggestions aren't available right now.</p>
      ) : items === null ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Finding similar cars…
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted">No close alternatives in stock right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ vehicle, score, reasons }) => {
            const image = vehicle.images?.[0];
            return (
              <li key={vehicle.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-muted">
                    {image ? <img src={image.fileUrl} alt="" className="h-full w-full object-cover" /> : <Car size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-ink">{vehicleDisplayName(vehicle)}</span>
                      <span className="text-sm tabular-nums text-ink">{formatCurrency(vehicle.sellingPrice ?? 0)}</span>
                      <span className="text-xs font-medium text-action">{score}% match</span>
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {reasons.slice(0, 4).map((r) => (
                        <li key={r} className="rounded-full bg-action/10 px-2 py-0.5 text-[11px] text-action">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick(vehicle)}
                  className="shrink-0 rounded-lg border border-action px-3 py-1.5 text-xs font-semibold text-action hover:bg-action hover:text-white"
                >
                  {pickLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
