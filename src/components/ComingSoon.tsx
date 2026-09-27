import { Construction } from "lucide-react";

export function ComingSoon({ screen }: { screen: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
      <Construction size={28} className="text-muted" />
      <div>
        <p className="font-semibold text-ink">{screen}</p>
        <p className="mt-1 text-sm text-muted">This screen is coming in a later build phase.</p>
      </div>
    </div>
  );
}
