import { apiRequest } from "./client";

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  complaintId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export async function apiListNotifications(limit = 40): Promise<{
  unread: number;
  items: AppNotification[];
}> {
  return apiRequest(`/api/notifications?limit=${limit}`);
}

export async function apiMarkNotificationRead(id: number): Promise<{
  unread: number;
}> {
  return apiRequest(`/api/notifications/${id}/read`, {
    method: "POST",
    body: "{}",
  });
}

export async function apiMarkAllNotificationsRead(): Promise<void> {
  await apiRequest("/api/notifications/read-all", {
    method: "POST",
    body: "{}",
  });
}
