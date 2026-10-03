export interface AuditLogUser {
  id: string;
  fullName: string;
  username: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  roleCode: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: AuditLogUser;
}

export interface AuditLogListResult {
  data: AuditLog[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}
