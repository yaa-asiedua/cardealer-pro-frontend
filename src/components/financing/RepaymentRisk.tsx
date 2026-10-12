import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api-client";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface RiskFactor {
  label: string;
  detail: string;
  points: number;
}

interface RiskAssessment {
  level: RiskLevel;
  score: number;
  factors: RiskFactor[];
  limitations: string;
}

const LEVEL_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-success/10 text-success",
  MEDIUM: "bg-warning/10 text-warning",
  HIGH: "bg-danger/10 text-danger",
};

const LEVEL_LABELS: Record<RiskLevel, string> = { LOW: "Low risk", MEDIUM: "Medium risk", HIGH: "High risk" };

// Finance's intelligent assistant (GET /finance/loans/:id/risk): a
// rule-based repayment-risk hint with every reason shown, so the Finance
// Manager can weigh it — advice only, it never approves or rejects.
export function RepaymentRisk({ financingId }: { financingId: string }) {
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRisk(null);
    setFailed(false);
    api
      .get<{ risk: RiskAssessment }>(`/finance/loans/${financingId}/risk`)
      .then((res) => !cancelled && setRisk(res.risk))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [financingId]);

  return (
    <section aria-label="Repayment risk" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldAlert size={15} className="text-action" /> Repayment risk
        </h3>
        {risk && (
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_STYLES[risk.level]}`}>
            {LEVEL_LABELS[risk.level]}
          </span>
        )}
      </div>
      <p className="mb-3 mt-0.5 text-xs text-muted">A guide to help your decision — not a decision.</p>

      {failed ? (
        <p className="text-xs text-muted">The risk check isn't available right now.</p>
      ) : !risk ? (
        <div className="flex justify-center py-3">
          <Loader2 size={18} className="animate-spin text-action" />
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {risk.factors.map((f) => (
              <li key={f.label} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.points > 0 ? "bg-danger" : f.points < 0 ? "bg-success" : "bg-muted/50"}`}
                />
                <span>
                  <span className="font-medium text-ink">{f.label}</span>
                  <span className="text-muted"> — {f.detail}</span>
                  <span className="sr-only">{f.points > 0 ? " (raises risk)" : f.points < 0 ? " (lowers risk)" : ""}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{risk.limitations}</p>
        </>
      )}
    </section>
  );
}
