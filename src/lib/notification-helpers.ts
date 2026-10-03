export type NotificationCategory =
  | "FOLLOWUP"
  | "APPLICATIONS"
  | "CUSTOMERS"
  | "PAYMENTS"
  | "SERVICE_JOBS"
  | "PARTS"
  | "SYSTEM";

// Notification.type is free-text on the backend (not an enum) — this maps
// every real type currently fired anywhere in the app into one of the
// categories the Notifications page's tabs use. Anything not listed here
// (including any future type) falls through to SYSTEM rather than being
// silently dropped.
//
// APPLICATIONS (renamed from an earlier "SALES") covers the financing
// application lifecycle end to end: Sales sees FINANCING_PENDING/APPROVED/
// REJECTED about their own customer's loan, and Finance Manager sees
// FINANCING_PENDING here too (notifyRole("FINANCE_MANAGER", ...) fires in
// sale.service.ts whenever a financed sale is created) — this is the one
// real "new application" signal Finance Manager already receives, matching
// the "New Financing Applications" grouping on their Notifications mockup.
// There's no real per-loan "overdue repayment" push notification (no job
// scheduler exists anywhere in this app to detect and fire one on a
// schedule) — that mockup category isn't represented here; the Repayments
// page's live overdue tracking is the honest equivalent.
//
// SERVICE_JOBS/PARTS added for Mechanic's own Notifications mockup.
// SERVICE_JOB_ASSIGNED is the one real "new work" signal a Mechanic
// receives (fired in service-job.service.ts when Admin assigns a job).
// PART_REQUEST_* covers the full parts-request lifecycle — Admin sees
// PART_REQUEST_CREATED (new requests to review), a Mechanic sees
// APPROVED/REJECTED/FULFILLED (their own request's outcome). Same "no
// scheduler" gap as Financing's Repayments: there's no real "Overdue
// Maintenance"/"Low Stock"/"Monthly Report Ready" push notification —
// nothing fires those on a schedule, and no stock-quantity concept
// exists at all (see the Parts Requests page's own reconciliation
// notes) — none of that is represented here. "Vehicle Inspection
// Result"/"Vehicle Fault Alert" dropped too — no inspection or
// diagnostic-scan feature exists anywhere in this system.
const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  FOLLOWUP_CREATED: "FOLLOWUP",
  FINANCING_PENDING: "APPLICATIONS",
  FINANCING_APPROVED: "APPLICATIONS",
  FINANCING_REJECTED: "APPLICATIONS",
  CUSTOMER_ASSIGNED: "CUSTOMERS",
  SALE_PAYMENT_RECEIVED: "PAYMENTS",
  RENTAL_PAYMENT_RECEIVED: "PAYMENTS",
  SERVICE_JOB_ASSIGNED: "SERVICE_JOBS",
  PART_REQUEST_CREATED: "PARTS",
  PART_REQUEST_APPROVED: "PARTS",
  PART_REQUEST_REJECTED: "PARTS",
  PART_REQUEST_FULFILLED: "PARTS",
};

export function notificationCategory(type: string): NotificationCategory {
  return CATEGORY_BY_TYPE[type] ?? "SYSTEM";
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  FOLLOWUP: "Follow-ups",
  APPLICATIONS: "Applications",
  CUSTOMERS: "Customers",
  PAYMENTS: "Payments",
  SERVICE_JOBS: "Service Jobs",
  PARTS: "Parts Requests",
  SYSTEM: "System",
};
