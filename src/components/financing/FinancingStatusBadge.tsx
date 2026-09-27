import { FINANCING_STATUS_LABELS, FINANCING_STATUS_STYLES } from "../../lib/financing-helpers";
import type { FinancingStatus } from "../../types/financing";

// "Overdue" isn't a stored FinancingStatus value (same situation as
// Rentals' OVERDUE) — computed by the caller from firstPaymentDue/balance
// and passed in as isOverdue, same pattern as RentalStatusBadge.
export function FinancingStatusBadge({ status, isOverdue }: { status: FinancingStatus; isOverdue?: boolean }) {
  if (isOverdue && (status === "APPROVED" || status === "ACTIVE")) {
    return <span className="inline-block whitespace-nowrap rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">Overdue</span>;
  }
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${FINANCING_STATUS_STYLES[status]}`}>
      {FINANCING_STATUS_LABELS[status]}
    </span>
  );
}
