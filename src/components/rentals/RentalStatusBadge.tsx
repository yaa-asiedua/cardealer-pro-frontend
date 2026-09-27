import { RENTAL_STATUS_LABELS, RENTAL_STATUS_STYLES } from "../../lib/rental-helpers";
import type { RentalStatus } from "../../types/rental";

// "Overdue" is computed (rentalStatus never actually gets set to it — see
// rental.service.ts's listRentals()), so a badge showing it is derived from
// the row's live endDate/status by the caller, not a stored status value.
export function RentalStatusBadge({ status, isOverdue }: { status: RentalStatus; isOverdue?: boolean }) {
  const effective = isOverdue && status === "ACTIVE" ? "OVERDUE" : status;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${RENTAL_STATUS_STYLES[effective]}`}>
      {RENTAL_STATUS_LABELS[effective]}
    </span>
  );
}
