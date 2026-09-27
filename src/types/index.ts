export type RoleCode =
  | "ADMIN"
  | "SALES_SALESPERSON"
  | "RENTAL_SALESPERSON"
  | "FINANCE_MANAGER"
  | "MECHANIC";

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: RoleCode;
  commissionRate: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

export interface NotificationListResult extends PaginatedResult<AppNotification> {
  unreadCount: number;
}
