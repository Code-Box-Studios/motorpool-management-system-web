// src/lib/api/notifications.ts
import type { NotificationTypeValue } from '@mms/shared';
import { api } from './client.js';

export interface NotificationRow {
  id: string;
  type: NotificationTypeValue;
  title: string;
  body: string | null;
  /** An app path — already resolved server-side, so the bell just links to it. */
  linkTo: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  data: NotificationRow[];
  /** Total unread for this user — NOT the length of `data`, which is capped. */
  unread: number;
}

export async function getNotifications(
  limit = 20
): Promise<NotificationListResponse> {
  return api.get<NotificationListResponse>('/notifications', { limit });
}

export async function markNotificationsRead(
  ids: string[]
): Promise<{ count: number; unread: number }> {
  return api.post('/notifications/mark-read', { ids });
}

export async function markAllNotificationsRead(): Promise<{
  count: number;
  unread: number;
}> {
  return api.post('/notifications/mark-all-read');
}
