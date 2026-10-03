import { RENTAL_ROW_STATUS_LABELS, RENTAL_ROW_STATUS_STYLES, rentalRowStatus } from "../../lib/rental-helpers";
import type { Rental } from "../../types/rental";

// Row-level badge — shows "Due Today"/"Overdue" when applicable instead of
// the raw rentalStatus (ACTIVE for both). See rental-helpers.ts's
// rentalRowStatus() for how it's derived.
export function RentalRowStatusBadge({ rental }: { rental: Pick<Rental, "rentalStatus" | "endDate"> }) {
  const status = rentalRowStatus(rental);
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${RENTAL_ROW_STATUS_STYLES[status]}`}>
      {RENTAL_ROW_STATUS_LABELS[status]}
    </span>
  );
}
