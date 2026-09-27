import type { VehiclePurpose } from "../../types/vehicle";
import { PURPOSE_LABELS } from "../../lib/vehicle-helpers";

const PURPOSE_STYLES: Record<VehiclePurpose, string> = {
  FOR_SALE: "bg-action/10 text-action",
  // Not bg-primary/text-primary — see StatusBadge.tsx's SOLD comment for why.
  FOR_RENT: "bg-ink/10 text-ink",
  BOTH: "bg-success/10 text-success",
};

export function PurposeBadge({ purpose }: { purpose: VehiclePurpose | null }) {
  if (!purpose) {
    return <span className="text-xs text-muted">—</span>;
  }
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${PURPOSE_STYLES[purpose]}`}>
      {PURPOSE_LABELS[purpose]}
    </span>
  );
}
