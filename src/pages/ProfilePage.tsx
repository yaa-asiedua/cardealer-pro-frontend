import { User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../lib/nav-config";

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const isCommissioned = user.role === "SALES_SALESPERSON";

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4 border-b border-border pb-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-action/10 text-action">
            <UserIcon size={24} />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">{user.fullName}</p>
            <p className="text-sm text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-4">
          <div className="flex justify-between text-sm">
            <dt className="text-muted">Username</dt>
            <dd className="font-medium text-ink">{user.username}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-muted">Role</dt>
            <dd className="font-medium text-ink">{ROLE_LABELS[user.role]}</dd>
          </div>
          {isCommissioned && (
            <div className="flex justify-between text-sm">
              <dt className="text-muted">Commission rate</dt>
              <dd className="font-medium text-ink">{Number(user.commissionRate)}%</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
          Password changes are handled by an Administrator. Contact Admin if you need a reset.
        </p>
      </div>
    </div>
  );
}
