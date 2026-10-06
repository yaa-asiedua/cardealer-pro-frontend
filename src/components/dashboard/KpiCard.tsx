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
// Compact on phones, where pages lay these out 2 per row: tighter padding,
// smaller value, and the decorative icon dropped so the label has room —
// one-per-row full-size cards pushed every list 1–2 screens down.
export function KpiCard({ label, value, sublabel, icon: Icon, tone = "default" }: KpiCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted sm:text-xs">{label}</span>
        <div className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex ${styles.bg} ${styles.text}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-1.5 break-words text-lg font-semibold tabular-nums text-ink sm:mt-3 sm:text-2xl">{value}</div>
      {sublabel && <p className="mt-1 text-xs text-muted">{sublabel}</p>}
    </div>
  );
}
