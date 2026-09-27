import type { Vehicle } from "./vehicle";

export type ServiceJobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type PartRequestStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "FULFILLED";

export interface ServiceType {
  id: string;
  name: string;
  description: string | null;
  defaultPrice: string | null;
  isActive: boolean;
}

export interface ServiceJobMechanic {
  id: string;
  fullName: string;
  username: string;
}

export interface ServicePart {
  id: string;
  partName: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
}

export interface ServiceJob {
  id: string;
  jobNumber: string;
  vehicleId: string;
  assignedMechanicId: string;
  issueDescription: string | null;
  status: ServiceJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  serviceTypeId: string | null;
  serviceCost: string | null;
  partsCost: string | null;
  labourCost: string | null;
  notes: string | null;
  nextServiceDate: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle: Vehicle;
  assignedMechanic: ServiceJobMechanic;
  serviceType?: ServiceType | null;
  parts?: ServicePart[];
}

export interface ServiceJobListResult {
  data: ServiceJob[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface PartRequest {
  id: string;
  requestNumber: string;
  serviceJobId: string;
  partName: string;
  quantity: string;
  estimatedCost: string | null;
  status: PartRequestStatus;
  requestedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  fulfilledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  serviceJob: ServiceJob;
  requester: ServiceJobMechanic;
  reviewer?: ServiceJobMechanic | null;
}

export interface PartRequestListResult {
  data: PartRequest[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface ServiceReport {
  totals: { jobCount: number; revenue: number };
  byMechanic: { mechanicId: string; fullName: string; jobCount: number; revenue: number }[];
}
