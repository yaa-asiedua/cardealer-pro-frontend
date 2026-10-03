import type { Customer } from "./customer";
import type { Vehicle } from "./vehicle";

export type FollowupType = "CALL" | "MEETING" | "WHATSAPP" | "EMAIL";
export type FollowupStatus = "DUE_TODAY" | "OVERDUE" | "UPCOMING" | "COMPLETED";

export interface FollowupSalesperson {
  id: string;
  fullName: string;
  username: string;
}

export interface Followup {
  id: string;
  customerId: string;
  salespersonId: string;
  vehicleId: string | null;
  rentalId: string | null;
  type: FollowupType;
  dueAt: string;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  vehicle: Vehicle | null;
  rental: { id: string; rentalNumber: string } | null;
  salesperson: FollowupSalesperson;
}

export interface FollowupListResult {
  data: Followup[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface CreateFollowupInput {
  customerId: string;
  vehicleId?: string;
  rentalId?: string;
  type: FollowupType;
  dueAt: string;
  notes?: string;
}
