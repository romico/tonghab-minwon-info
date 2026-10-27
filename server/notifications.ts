import { getDb } from "./db.ts";

export type NotificationType = "ASSIGNED";

export interface AppNotification {
  id: number;
  userId: number;
  type: NotificationType;
  complaintId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export function initNotificationsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      complaint_id TEXT,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user
      ON notifications(user_id, read_at, created_at DESC);
  `);
  // 확인=삭제 정책 전환 후 예전 읽음 행 잔여 정리
  getDb().exec(`DELETE FROM notifications WHERE read_at IS NOT NULL`);
}

export function createNotification(input: {
  userId: number;
  type: NotificationType;
  complaintId?: string | null;
  message: string;
}): AppNotification {
  const result = getDb()
    .prepare(
      `INSERT INTO notifications (user_id, type, complaint_id, message)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.type,
      input.complaintId ?? null,
      input.message,
    );
  const id = Number(result.lastInsertRowid);
  const row = getDb()
    .prepare(
      `SELECT id, user_id, type, complaint_id, message, read_at, created_at
       FROM notifications WHERE id = ?`,
    )
    .get(id) as {
    id: number;
    user_id: number;
    type: NotificationType;
    complaint_id: string | null;
    message: string;
    read_at: string | null;
    created_at: string;
  };
  return mapRow(row);
}

export function listNotifications(
  userId: number,
  limit = 50,
): AppNotification[] {
  const rows = getDb()
    .prepare(
      `SELECT id, user_id, type, complaint_id, message, read_at, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, Math.min(200, Math.max(1, limit))) as Array<{
    id: number;
    user_id: number;
    type: NotificationType;
    complaint_id: string | null;
    message: string;
    read_at: string | null;
    created_at: string;
  }>;
  return rows.map(mapRow);
}

export function countUnreadNotifications(userId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    )
    .get(userId) as { n: number };
  return row.n;
}

export function deleteNotification(
  userId: number,
  notificationId: number,
): boolean {
  const result = getDb()
    .prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`)
    .run(notificationId, userId);
  return result.changes > 0;
}

export function deleteAllNotifications(userId: number): number {
  const result = getDb()
    .prepare(`DELETE FROM notifications WHERE user_id = ?`)
    .run(userId);
  return Number(result.changes);
}

function mapRow(row: {
  id: number;
  user_id: number;
  type: NotificationType;
  complaint_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    complaintId: row.complaint_id,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
