import type { VehicleStatus } from "../types/vehicle";
import { formatEnumLabel } from "../lib/format";

// Design Brief §5 "Status Badge": text + semantic colour, never colour alone.
const STATUS_STYLES: Record<VehicleStatus, string> = {
  AVAILABLE: "bg-success/10 text-success",
  RESERVED: "bg-warning/10 text-warning",
  RENTED: "bg-action/10 text-action",
  // Not bg-primary/text-primary: that's the role-themed sidebar color (a
  // fixed dark navy), which reads fine on a light card but disappears
  // against a dark-mode card — bg-ink/text-ink tracks the light/dark
  // surface token instead, so this stays a distinct neutral badge in both.
  SOLD: "bg-ink/10 text-ink",
  UNDER_MAINTENANCE: "bg-warning/10 text-warning",
  UNAVAILABLE: "bg-muted/10 text-muted",
  SOLD_DEAL_FAILED: "bg-danger/10 text-danger",
};

export function StatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {formatEnumLabel(status)}
    </span>
  );
}
