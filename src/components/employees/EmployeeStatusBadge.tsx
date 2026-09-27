import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUS_STYLES } from "../../lib/employee-helpers";
import type { EmploymentStatus } from "../../types/employee";

export function EmployeeStatusBadge({ status }: { status: EmploymentStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${EMPLOYMENT_STATUS_STYLES[status]}`}>
      {EMPLOYMENT_STATUS_LABELS[status]}
    </span>
  );
}
