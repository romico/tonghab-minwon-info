import { getDb } from "./db.ts";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAIL"
  | "LOGIN_TOTP_REQUIRED"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "SETTINGS_UPDATE"
  | "TOTP_SETUP_BEGIN"
  | "TOTP_ENABLED"
  | "TOTP_DISABLED"
  | "COMPLAINT_CREATE"
  | "COMPLAINT_UPDATE"
  | "COMPLAINT_DELETE"
  | "COMPLAINT_BATCH_CREATE"
  | "COMPLAINT_REPLACE"
  | "COMPLAINT_RESET_SEED"
  | "DB_ARCHIVE_ROLLOVER"
  | "DB_ARCHIVE_RESTORE_MERGE"
  | "DB_ARCHIVE_RESTORE_REPLACE"
  | "DB_ARCHIVE_DELETE"
  | "SNAPSHOT_FREEZE"
  | "UPDATE_APPLY";

export interface AuditLog {
  id: number;
  createdAt: string;
  userId: number | null;
  username: string | null;
  action: AuditAction;
  resourceType: string | null;
  resourceId: string | null;
  summary: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditQuery {
  limit?: number;
  offset?: number;
  action?: string;
  from?: string;
  to?: string;
  username?: string;
}

export function initAuditTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      summary TEXT NOT NULL,
      detail_json TEXT,
      ip TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_logs(username);
  `);
}

export function writeAudit(input: {
  userId?: number | null;
  username?: string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  summary: string;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO audit_logs
        (user_id, username, action, resource_type, resource_id, summary, detail_json, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId ?? null,
      input.username ?? null,
      input.action,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.summary,
      input.detail ? JSON.stringify(input.detail) : null,
      input.ip ?? null,
      input.userAgent ?? null,
    );
}

export function clearAuditLogs(): void {
  getDb().exec("DELETE FROM audit_logs");
}

export function listAuditLogs(query: AuditQuery = {}): {
  logs: AuditLog[];
  total: number;
} {
  const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
  const offset = Math.max(Number(query.offset ?? 0), 0);
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (query.action) {
    where.push("action = ?");
    params.push(query.action);
  }
  if (query.username) {
    where.push("username = ?");
    params.push(query.username);
  }
  if (query.from) {
    where.push("created_at >= ?");
    params.push(query.from);
  }
  if (query.to) {
    where.push("created_at <= ?");
    params.push(`${query.to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM audit_logs ${whereSql}`)
      .get(...params) as { n: number }
  ).n;

  const rows = getDb()
    .prepare(
      `SELECT id, created_at, user_id, username, action, resource_type, resource_id,
              summary, detail_json, ip, user_agent
       FROM audit_logs
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<{
    id: number;
    created_at: string;
    user_id: number | null;
    username: string | null;
    action: AuditAction;
    resource_type: string | null;
    resource_id: string | null;
    summary: string;
    detail_json: string | null;
    ip: string | null;
    user_agent: string | null;
  }>;

  return {
    total,
    logs: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      username: r.username,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      summary: r.summary,
      detail: r.detail_json
        ? (JSON.parse(r.detail_json) as Record<string, unknown>)
        : null,
      ip: r.ip,
      userAgent: r.user_agent,
    })),
  };
}
