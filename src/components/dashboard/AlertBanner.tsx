import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";

export interface AlertItem {
  label: string;
  path: string;
}

// App Flow §3: "Alerts highlight overdue payments, pending transfers, low
// inventory and loan approvals. Clicking an alert opens the relevant
// operational queue." Only rendered when there's something to flag.
export function AlertBanner({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {alerts.map((alert) => (
        <Link
          key={alert.label}
          to={alert.path}
          className="flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm transition-colors hover:bg-warning/10"
        >
          <span className="flex items-center gap-2 font-medium text-ink">
            <AlertTriangle size={16} className="text-warning" />
            {alert.label}
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
      ))}
    </div>
  );
}
