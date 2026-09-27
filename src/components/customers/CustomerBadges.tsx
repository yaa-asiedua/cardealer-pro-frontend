import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_STYLES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_STYLES,
} from "../../lib/customer-helpers";
import type { CustomerStatus, CustomerType } from "../../types/customer";

function badgeCls(styles: string): string {
  return `inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`;
}

export function CustomerTypeBadge({ type }: { type: CustomerType }) {
  return <span className={badgeCls(CUSTOMER_TYPE_STYLES[type])}>{CUSTOMER_TYPE_LABELS[type]}</span>;
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <span className={badgeCls(CUSTOMER_STATUS_STYLES[status])}>{CUSTOMER_STATUS_LABELS[status]}</span>;
}
