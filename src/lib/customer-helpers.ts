import type { CustomerStatus, CustomerType } from "../types/customer";

export const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];

// Ghana-specific ID documents, paired with the free-text idNumber field.
export const ID_TYPE_OPTIONS = ["Ghana Card", "Passport", "Voter's ID", "Driver's License", "NHIS Card", "Other"];

export const GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
];

export const PREFERRED_CONTACT_METHODS = ["Phone", "Email", "SMS", "WhatsApp"];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  PURCHASE: "Purchase",
  RENTAL: "Rental",
  BOTH: "Both",
};

export const CUSTOMER_TYPE_STYLES: Record<CustomerType, string> = {
  PURCHASE: "bg-action/10 text-action",
  RENTAL: "bg-primary/10 text-primary",
  BOTH: "bg-success/10 text-success",
};

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, string> = {
  DRAFT: "bg-muted/10 text-muted",
  ACTIVE: "bg-success/10 text-success",
  INACTIVE: "bg-danger/10 text-danger",
};
