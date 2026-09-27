import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_STYLES } from "../../lib/transfer-helpers";
import type { TransferStatus } from "../../types/transfer";

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TRANSFER_STATUS_STYLES[status]}`}>
      {TRANSFER_STATUS_LABELS[status]}
    </span>
  );
}
