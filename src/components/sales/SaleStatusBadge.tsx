import { SALE_STATUS_LABELS, SALE_STATUS_STYLES } from "../../lib/sale-helpers";
import type { SaleStatus } from "../../types/sale";

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${SALE_STATUS_STYLES[status]}`}>
      {SALE_STATUS_LABELS[status]}
    </span>
  );
}
