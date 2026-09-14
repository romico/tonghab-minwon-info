import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db.ts";

export const MIN_SESSION_TTL_MINUTES = 10;
export const DEFAULT_SESSION_TTL_MINUTES = 30;
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";

export interface AuthUser {
  id: number;
  username: string;
}

export interface AppSettings {
  sessionTtlMinutes: number;
}

export interface SessionInfo {
  token: string;
  user: AuthUser;
  expiresAt: string;
  ttlMinutes: number;
}

function hashPassword(password: string, salt?: string): string {
  const useSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, useSalt, 64).toString("hex");
  return `${useSalt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function isoFromMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function initAuthTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  if (userCount.n === 0) {
    db.prepare(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
    ).run(DEFAULT_USERNAME, hashPassword(DEFAULT_PASSWORD));
  }

  const ttl = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'session_ttl_minutes'`)
    .get() as { value: string } | undefined;
  if (!ttl) {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('session_ttl_minutes', ?)`,
    ).run(String(DEFAULT_SESSION_TTL_MINUTES));
  }
}

export function getSettings(): AppSettings {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = 'session_ttl_minutes'`)
    .get() as { value: string } | undefined;
  const minutes = Number(row?.value ?? DEFAULT_SESSION_TTL_MINUTES);
  return {
    sessionTtlMinutes: Number.isFinite(minutes)
      ? Math.max(MIN_SESSION_TTL_MINUTES, Math.floor(minutes))
      : DEFAULT_SESSION_TTL_MINUTES,
  };
}

export function updateSettings(input: {
  sessionTtlMinutes: number;
}): AppSettings {
  const minutes = Math.floor(Number(input.sessionTtlMinutes));
  if (!Number.isFinite(minutes) || minutes < MIN_SESSION_TTL_MINUTES) {
    throw new Error(`세션 유효시간은 최소 ${MIN_SESSION_TTL_MINUTES}분입니다.`);
  }
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('session_ttl_minutes', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(String(minutes));
  return getSettings();
}

function findUserByUsername(username: string): {
  id: number;
  username: string;
  password_hash: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, password_hash FROM users WHERE username = ?`,
    )
    .get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  return row ?? null;
}

export function login(username: string, password: string): SessionInfo {
  const user = findUserByUsername(username.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  const ttlMinutes = getSettings().sessionTtlMinutes;
  const token = randomBytes(32).toString("hex");
  const expiresAt = isoFromMinutes(ttlMinutes);
  getDb()
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
    )
    .run(token, user.id, expiresAt);

  return {
    token,
    user: { id: user.id, username: user.username },
    expiresAt,
    ttlMinutes,
  };
}

export function logout(token: string | null | undefined): void {
  if (!token) return;
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function purgeExpiredSessions(): void {
  getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
    .run(new Date().toISOString());
}

export function getSession(token: string | null | undefined): SessionInfo | null {
  if (!token) return null;
  purgeExpiredSessions();
  const row = getDb()
    .prepare(
      `SELECT s.token, s.expires_at, u.id AS user_id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as
    | {
        token: string;
        expires_at: string;
        user_id: number;
        username: string;
      }
    | undefined;
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    logout(token);
    return null;
  }
  return {
    token: row.token,
    user: { id: row.user_id, username: row.username },
    expiresAt: row.expires_at,
    ttlMinutes: getSettings().sessionTtlMinutes,
  };
}

/** 세션 만료 시각을 현재 설정 TTL만큼 연장 */
export function refreshSession(token: string | null | undefined): SessionInfo {
  const session = getSession(token);
  if (!session) throw new Error("세션이 만료되었거나 유효하지 않습니다.");
  const ttlMinutes = getSettings().sessionTtlMinutes;
  const expiresAt = isoFromMinutes(ttlMinutes);
  getDb()
    .prepare(`UPDATE sessions SET expires_at = ? WHERE token = ?`)
    .run(expiresAt, session.token);
  return {
    ...session,
    expiresAt,
    ttlMinutes,
  };
}

export function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): void {
  if (!newPassword || newPassword.length < 4) {
    throw new Error("새 비밀번호는 4자 이상이어야 합니다.");
  }
  const row = getDb()
    .prepare(`SELECT id, password_hash FROM users WHERE id = ?`)
    .get(userId) as { id: number; password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(hashPassword(newPassword), userId);
  // 비밀번호 변경 시 다른 세션 전부(현재 토큰은 라우트에서 유지 가능)
}

export function revokeOtherSessions(userId: number, keepToken: string): void {
  getDb()
    .prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`)
    .run(userId, keepToken);
}

/** 쿠키 서명용이 아닌 단순 토큰 핑거프린트(로그용) */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}
