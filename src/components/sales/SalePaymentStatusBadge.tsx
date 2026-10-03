import { SALE_PAYMENT_STATUS_LABELS, SALE_PAYMENT_STATUS_STYLES } from "../../lib/sale-helpers";
import type { SalePaymentStatus } from "../../types/sale";

export function SalePaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${SALE_PAYMENT_STATUS_STYLES[status]}`}>
      {SALE_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
