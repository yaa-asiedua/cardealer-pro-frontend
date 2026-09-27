import {
  PART_REQUEST_STATUS_LABELS,
  PART_REQUEST_STATUS_STYLES,
  SERVICE_JOB_STATUS_LABELS,
  SERVICE_JOB_STATUS_STYLES,
} from "../../lib/service-helpers";
import type { PartRequestStatus, ServiceJobStatus } from "../../types/service";

function badgeCls(styles: string): string {
  return `inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`;
}

export function ServiceJobStatusBadge({ status }: { status: ServiceJobStatus }) {
  return <span className={badgeCls(SERVICE_JOB_STATUS_STYLES[status])}>{SERVICE_JOB_STATUS_LABELS[status]}</span>;
}

export function PartRequestStatusBadge({ status }: { status: PartRequestStatus }) {
  return <span className={badgeCls(PART_REQUEST_STATUS_STYLES[status])}>{PART_REQUEST_STATUS_LABELS[status]}</span>;
}
