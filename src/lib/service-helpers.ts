import type { PartRequestStatus, ServiceJobStatus } from "../types/service";

export const SERVICE_JOB_STATUS_LABELS: Record<ServiceJobStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const SERVICE_JOB_STATUS_STYLES: Record<ServiceJobStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  IN_PROGRESS: "bg-action/10 text-action",
  COMPLETED: "bg-success/10 text-success",
  CANCELLED: "bg-muted/10 text-muted",
};

export const PART_REQUEST_STATUS_LABELS: Record<PartRequestStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FULFILLED: "Fulfilled",
};

export const PART_REQUEST_STATUS_STYLES: Record<PartRequestStatus, string> = {
  REQUESTED: "bg-warning/10 text-warning",
  APPROVED: "bg-action/10 text-action",
  REJECTED: "bg-danger/10 text-danger",
  FULFILLED: "bg-success/10 text-success",
};
