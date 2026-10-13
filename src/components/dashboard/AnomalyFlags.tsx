import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { api } from "../../lib/api-client";

interface Anomaly {
  code: string;
  severity: "high" | "medium";
  title: string;
  detail: string;
  path: string;
}

// Admin's intelligent assistant (GET /dashboard/anomalies): unusual
// patterns in the business's own recorded data, each with the figures
// behind it — something to look into, not proof that anything is wrong.
export function AnomalyFlags() {
  const [anomalies, setAnomalies] = useState<Anomaly[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ anomalies: Anomaly[] }>("/dashboard/anomalies")
      .then((res) => !cancelled && setAnomalies(res.anomalies))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Unusual activity" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sparkles size={15} className="text-action" /> Unusual activity
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Last 30 days compared with the usual level for your business — worth a look, not proof of a problem.
      </p>

      {failed ? (
        <p className="py-3 text-sm text-muted">The check isn't available right now.</p>
      ) : !anomalies ? (
        <div className="flex justify-center py-3">
          <Loader2 size={18} className="animate-spin text-action" />
        </div>
      ) : anomalies.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-success">
          <CheckCircle2 size={16} /> Nothing unusual in the last 30 days.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {anomalies.map((a) => (
            <li key={a.code} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.severity === "high" ? "bg-danger" : "bg-warning"}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {a.title}
                    <span className="sr-only"> ({a.severity === "high" ? "high" : "medium"} priority)</span>
                  </p>
                  <p className="text-xs text-muted">{a.detail}</p>
                </div>
              </div>
              <Link to={a.path} className="shrink-0 pl-4 text-xs font-medium text-action hover:underline sm:pl-0">
                Look into it →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
