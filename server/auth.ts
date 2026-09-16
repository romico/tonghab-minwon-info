import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db.ts";
import {
  buildOtpauthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotp,
} from "./totp.ts";
import {
  lockVault,
  sealSecret,
  unsealSecret,
  tryUnsealSecret,
  unlockVaultWithPassword,
  rotateVaultPassword,
  getActiveDek,
  isVaultUnlocked,
  getVaultStatus,
} from "./vault.ts";

export const MIN_SESSION_TTL_MINUTES = 10;
export const DEFAULT_SESSION_TTL_MINUTES = 30;
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";
const CHALLENGE_TTL_MS = 5 * 60_000;

export interface AuthUser {
  id: number;
  username: string;
  totpEnabled: boolean;
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

export interface LoginSuccess extends SessionInfo {
  requiresTotp?: false;
  vault: ReturnType<typeof getVaultStatus>;
  /** 손상된 2FA를 비밀번호 검증 후 자동 해제한 경우 */
  totpReset?: boolean;
  warning?: string;
}

export interface LoginTotpChallenge {
  requiresTotp: true;
  challengeToken: string;
  expiresAt: string;
}

type Challenge = {
  userId: number;
  username: string;
  password: string;
  expiresAt: number;
};

const loginChallenges = new Map<string, Challenge>();

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
  return timingSafeEqual(next, prev);
}

function isoFromMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function purgeChallenges(): void {
  const now = Date.now();
  for (const [token, ch] of loginChallenges) {
    if (ch.expiresAt < now) loginChallenges.delete(token);
  }
}

function ensureTotpColumns(): void {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(users)`).all() as {
    name: string;
  }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("totp_secret")) {
    db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
  }
  if (!names.has("totp_enabled")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!names.has("totp_recovery_hashes")) {
    db.exec(`ALTER TABLE users ADD COLUMN totp_recovery_hashes TEXT`);
  }
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

  ensureTotpColumns();

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

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  totp_recovery_hashes: string | null;
};

function findUserByUsername(username: string): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, password_hash, totp_secret, totp_enabled, totp_recovery_hashes
       FROM users WHERE username = ?`,
    )
    .get(username) as UserRow | undefined;
  return row ?? null;
}

function findUserById(id: number): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, password_hash, totp_secret, totp_enabled, totp_recovery_hashes
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined;
  return row ?? null;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    totpEnabled: Boolean(row.totp_enabled),
  };
}

function createSession(user: AuthUser): SessionInfo {
  const ttlMinutes = getSettings().sessionTtlMinutes;
  const token = randomBytes(32).toString("hex");
  const expiresAt = isoFromMinutes(ttlMinutes);
  getDb()
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
    )
    .run(token, user.id, expiresAt);
  return { token, user, expiresAt, ttlMinutes };
}

function finishLogin(user: UserRow, password: string): LoginSuccess {
  unlockVaultWithPassword(password);
  const session = createSession(toAuthUser(user));
  return {
    ...session,
    requiresTotp: false,
    vault: getVaultStatus(),
  };
}

export function login(
  username: string,
  password: string,
): LoginSuccess | LoginTotpChallenge {
  const user = findUserByUsername(username.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  if (user.totp_enabled) {
    purgeChallenges();
    const challengeToken = randomBytes(24).toString("hex");
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    loginChallenges.set(challengeToken, {
      userId: user.id,
      username: user.username,
      password,
      expiresAt,
    });
    return {
      requiresTotp: true,
      challengeToken,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  return finishLogin(user, password);
}

export function completeTotpLogin(
  challengeToken: string,
  code: string,
): LoginSuccess {
  purgeChallenges();
  const challenge = loginChallenges.get(challengeToken);
  if (!challenge || challenge.expiresAt < Date.now()) {
    loginChallenges.delete(challengeToken);
    throw new Error("인증 요청이 만료되었습니다. 다시 로그인해 주세요.");
  }
  const user = findUserById(challenge.userId);
  if (!user || !user.totp_enabled || !user.totp_secret) {
    loginChallenges.delete(challengeToken);
    throw new Error("2단계 인증 설정을 확인할 수 없습니다.");
  }

  unlockVaultWithPassword(challenge.password);

  // 복구 코드는 TOTP 시크릿 복호화 없이도 검증 가능
  const recoveryOk = consumeRecoveryCode(user, code);

  const secretPlain = tryUnsealSecret(user.totp_secret, getActiveDek());
  const otpOk = secretPlain ? verifyTotp(secretPlain, code) : false;

  if (otpOk || recoveryOk) {
    // 시크릿 복호화 실패 상태로 들어온 경우(복구 코드) → 재설정 유도
    if (!secretPlain) {
      clearTotpConfig(user.id);
    }
    loginChallenges.delete(challengeToken);
    const fresh = findUserById(user.id)!;
    const session = createSession(toAuthUser(fresh));
    return {
      ...session,
      requiresTotp: false,
      vault: getVaultStatus(),
      ...(secretPlain
        ? {}
        : {
            totpReset: true,
            warning:
              "2단계 인증 키가 비밀번호와 맞지 않아 해제되었습니다. 설정에서 다시 등록해 주세요.",
          }),
    };
  }

  // 비밀번호·볼트는 맞는데 시크릿만 복호화 불가 → 2FA 설정 손상(예: 비번 변경 후 미재암호화)
  // 이 상태에서는 OTP 검증 자체가 불가하므로, 로컬 단일 관리자 잠김 방지를 위해 해제 후 로그인
  if (!secretPlain) {
    clearTotpConfig(user.id);
    loginChallenges.delete(challengeToken);
    const fresh = findUserById(user.id)!;
    const session = createSession(toAuthUser(fresh));
    return {
      ...session,
      requiresTotp: false,
      vault: getVaultStatus(),
      totpReset: true,
      warning:
        "2단계 인증 설정이 손상되어 자동 해제되었습니다. 설정에서 다시 등록해 주세요.",
    };
  }

  throw new Error("인증 코드가 올바르지 않습니다.");
}

function clearTotpConfig(userId: number): void {
  getDb()
    .prepare(
      `UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_recovery_hashes = NULL, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(userId);
}

function parseRecoveryHashes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function consumeRecoveryCode(user: UserRow, code: string): boolean {
  const cleaned = String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!cleaned) return false;
  const hashes = parseRecoveryHashes(user.totp_recovery_hashes);
  const idx = hashes.findIndex((h) => verifyPassword(cleaned, h));
  if (idx < 0) return false;
  const next = hashes.filter((_, i) => i !== idx);
  getDb()
    .prepare(
      `UPDATE users SET totp_recovery_hashes = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(JSON.stringify(next), user.id);
  return true;
}

/** 설정: TOTP 등록 시작(세션+볼트 필요) */
export async function beginTotpSetup(userId: number): Promise<{
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}> {
  if (!isVaultUnlocked()) {
    throw new Error("데이터 잠금 해제 후 설정할 수 있습니다.");
  }
  const user = findUserById(userId);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  if (user.totp_enabled) {
    throw new Error("이미 2단계 인증이 활성화되어 있습니다.");
  }
  const secret = generateTotpSecret();
  const sealed = sealSecret(secret, getActiveDek());
  getDb()
    .prepare(
      `UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(sealed, userId);
  const otpauthUrl = buildOtpauthUrl({
    secret,
    accountName: user.username,
  });
  const { default: QRCode } = await import("qrcode");
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return { secret, otpauthUrl, qrDataUrl };
}

export function confirmTotpSetup(
  userId: number,
  code: string,
): { recoveryCodes: string[] } {
  if (!isVaultUnlocked()) {
    throw new Error("데이터 잠금 해제 후 설정할 수 있습니다.");
  }
  const user = findUserById(userId);
  if (!user?.totp_secret) {
    throw new Error("먼저 2단계 인증 설정을 시작해 주세요.");
  }
  if (user.totp_enabled) {
    throw new Error("이미 2단계 인증이 활성화되어 있습니다.");
  }
  const secretPlain = unsealSecret(user.totp_secret, getActiveDek());
  if (!verifyTotp(secretPlain, code)) {
    throw new Error("인증 코드가 올바르지 않습니다.");
  }
  const recoveryCodes = generateRecoveryCodes();
  const hashes = recoveryCodes.map((c) =>
    hashPassword(c.toLowerCase().replace(/\s+/g, "")),
  );
  getDb()
    .prepare(
      `UPDATE users SET totp_enabled = 1, totp_recovery_hashes = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(JSON.stringify(hashes), userId);
  return { recoveryCodes };
}

export function disableTotp(
  userId: number,
  password: string,
  code: string,
): void {
  if (!verifyUserPassword(userId, password)) {
    throw new Error("비밀번호가 올바르지 않습니다.");
  }
  if (!isVaultUnlocked()) {
    unlockVaultWithPassword(password);
  }
  const user = findUserById(userId);
  if (!user?.totp_enabled || !user.totp_secret) {
    throw new Error("2단계 인증이 활성화되어 있지 않습니다.");
  }
  const recoveryOk = consumeRecoveryCode(user, code);
  const secretPlain = tryUnsealSecret(user.totp_secret, getActiveDek());
  const otpOk = secretPlain ? verifyTotp(secretPlain, code) : false;
  if (!otpOk && !recoveryOk) {
    throw new Error("인증 코드가 올바르지 않습니다.");
  }
  clearTotpConfig(userId);
}

export function getTotpStatus(userId: number): {
  enabled: boolean;
  recoveryCodesRemaining: number;
} {
  const user = findUserById(userId);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  return {
    enabled: Boolean(user.totp_enabled),
    recoveryCodesRemaining: parseRecoveryHashes(user.totp_recovery_hashes)
      .length,
  };
}

/**
 * 2FA가 켜져 있으면 OTP/복구 코드 필수.
 * 꺼져 있으면 code 무시하고 통과.
 */
export function assertTotpIfEnabled(
  userId: number,
  code: string | null | undefined,
): void {
  const user = findUserById(userId);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  if (!user.totp_enabled) return;

  const cleaned = String(code ?? "").trim();
  if (!cleaned) {
    throw new Error("2단계 인증 코드가 필요합니다.");
  }
  if (!isVaultUnlocked()) {
    throw new Error("데이터 잠금 해제 후 다시 시도해 주세요.");
  }

  const recoveryOk = consumeRecoveryCode(user, cleaned);
  if (recoveryOk) return;

  if (!user.totp_secret) {
    throw new Error("2단계 인증 설정을 확인할 수 없습니다.");
  }
  const secretPlain = tryUnsealSecret(user.totp_secret, getActiveDek());
  if (secretPlain && verifyTotp(secretPlain, cleaned)) return;

  throw new Error("인증 코드가 올바르지 않습니다.");
}

export function logout(token: string | null | undefined): void {
  if (!token) return;
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  // 단일 관리자: 세션이 없으면 볼트 잠금
  const remaining = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM sessions`)
    .get() as { n: number };
  if (remaining.n === 0) lockVault();
}

export function purgeExpiredSessions(): void {
  getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
    .run(new Date().toISOString());
  const remaining = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM sessions`)
    .get() as { n: number };
  if (remaining.n === 0) lockVault();
}

export function getSession(token: string | null | undefined): SessionInfo | null {
  if (!token) return null;
  purgeExpiredSessions();
  const row = getDb()
    .prepare(
      `SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.totp_enabled
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
        totp_enabled: number;
      }
    | undefined;
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    logout(token);
    return null;
  }
  // 서버 재시작 등으로 볼트가 잠긴 경우 세션 무효화 → 재로그인으로 DEK 확보
  if (!isVaultUnlocked()) {
    logout(token);
    return null;
  }
  return {
    token: row.token,
    user: {
      id: row.user_id,
      username: row.username,
      totpEnabled: Boolean(row.totp_enabled),
    },
    expiresAt: row.expires_at,
    ttlMinutes: getSettings().sessionTtlMinutes,
  };
}

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
  totpCode?: string | null,
): void {
  if (!newPassword || newPassword.length < 4) {
    throw new Error("새 비밀번호는 4자 이상이어야 합니다.");
  }
  if (!verifyUserPassword(userId, currentPassword)) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  assertTotpIfEnabled(userId, totpCode);
  rotateVaultPassword(currentPassword, newPassword);
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(hashPassword(newPassword), userId);
}

export function verifyUserPassword(userId: number, password: string): boolean {
  if (!password) return false;
  const row = getDb()
    .prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .get(userId) as { password_hash: string } | undefined;
  if (!row) return false;
  return verifyPassword(password, row.password_hash);
}

export function revokeOtherSessions(userId: number, keepToken: string): void {
  getDb()
    .prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`)
    .run(userId, keepToken);
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}
