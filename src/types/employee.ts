import type { RoleCode } from "./index";

export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "INACTIVE";

export interface EmployeeRole {
  id: string;
  code: RoleCode;
  name: string;
}

export interface Employee {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  profilePhotoUrl: string | null;
  department: string | null;
  commissionRate: string | null;
  status: EmploymentStatus;
  createdAt: string;
  updatedAt: string;
  role: EmployeeRole;
}

export interface EmployeeListResult {
  data: Employee[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

export interface CreateEmployeeInput {
  username: string;
  password: string;
  fullName: string;
  email?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  profilePhotoUrl?: string;
  roleCode: RoleCode;
  department?: string;
  commissionRate?: number;
}

export interface UpdateEmployeeInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  profilePhotoUrl?: string | null;
  department?: string | null;
  commissionRate?: number | null;
  roleCode?: RoleCode;
  status?: EmploymentStatus;
}
