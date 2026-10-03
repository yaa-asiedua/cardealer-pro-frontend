import type { Followup, FollowupStatus, FollowupType } from "../types/followup";

// Mirrors followup.service.ts's statusWhere() exactly — status isn't a
// stored column (see the backend schema comment), so it's derived
// identically on both sides from dueAt/completed rather than duplicated.
export function followupStatus(f: Pick<Followup, "dueAt" | "completed">): FollowupStatus {
  if (f.completed) return "COMPLETED";
  const due = new Date(f.dueAt);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (due < todayStart) return "OVERDUE";
  if (due <= todayEnd) return "DUE_TODAY";
  return "UPCOMING";
}

export const FOLLOWUP_STATUS_LABELS: Record<FollowupStatus, string> = {
  DUE_TODAY: "Due Today",
  OVERDUE: "Overdue",
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
};

export const FOLLOWUP_STATUS_STYLES: Record<FollowupStatus, string> = {
  DUE_TODAY: "bg-warning/10 text-warning",
  OVERDUE: "bg-danger/10 text-danger",
  UPCOMING: "bg-action/10 text-action",
  COMPLETED: "bg-success/10 text-success",
};

export const FOLLOWUP_TYPE_LABELS: Record<FollowupType, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};
