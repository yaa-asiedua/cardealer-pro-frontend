import type { LucideIcon } from "lucide-react";

type Tone = "default" | "success" | "warning" | "danger";

const TONE_STYLES: Record<Tone, { bg: string; text: string }> = {
  // Not bg-primary/text-primary — see StatusBadge.tsx's SOLD comment for why.
  default: { bg: "bg-action/10", text: "text-action" },
  success: { bg: "bg-success/10", text: "text-success" },
  warning: { bg: "bg-warning/10", text: "text-warning" },
  danger: { bg: "bg-danger/10", text: "text-danger" },
};

interface KpiCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
  tone?: Tone;
}

// Label + large value + context, never colour alone (Design Brief §5 "KPI Card").
export function KpiCard({ label, value, sublabel, icon: Icon, tone = "default" }: KpiCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles.bg} ${styles.text}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {sublabel && <p className="mt-1 text-xs text-muted">{sublabel}</p>}
    </div>
  );
}
