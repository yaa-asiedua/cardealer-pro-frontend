export type CustomerType = "PURCHASE" | "RENTAL" | "BOTH";
export type CustomerStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  idNumber: string | null;
  idType: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  occupation: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  landmark: string | null;
  postalAddress: string | null;
  digitalAddress: string | null;
  driverLicenseNo: string | null;
  licenseExpiry: string | null;
  emergencyContact: string | null;
  preferredContactMethod: string | null;
  notes: string | null;
  customerType: CustomerType;
  status: CustomerStatus;
  profilePhotoUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Computed server-side (not stored columns) — see customer.service.ts's
  // loadAggregates().
  transactionCount: number;
  outstandingBalance: number;
  totalSpent: number;
  lastPurchaseDate: string | null;
  lastRentalDate: string | null;
}

export interface CustomerListResult {
  data: Customer[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  idNumber?: string;
  idType?: string;
  gender?: string;
  dateOfBirth?: string;
  nationality?: string;
  occupation?: string;
  address?: string;
  city?: string;
  region?: string;
  landmark?: string;
  postalAddress?: string;
  digitalAddress?: string;
  driverLicenseNo?: string;
  licenseExpiry?: string;
  preferredContactMethod?: string;
  notes?: string;
  customerType?: CustomerType;
  status?: CustomerStatus;
  profilePhotoUrl?: string;
  salespersonId?: string;
}

export function customerDisplayName(customer: Pick<Customer, "firstName" | "lastName">): string {
  return `${customer.firstName} ${customer.lastName}`;
}
