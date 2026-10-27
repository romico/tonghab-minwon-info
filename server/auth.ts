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
  deriveVaultKey,
  unlockVaultForUser,
  rewrapVaultPassword,
  wrapActiveDekForUser,
  getActiveDek,
  isVaultUnlocked,
  getVaultStatus,
} from "./vault.ts";
import {
  ALL_PERMISSIONS,
  parsePermissionsJson,
  type Permission,
} from "./permissions.ts";

export const MIN_SESSION_TTL_MINUTES = 10;
export const DEFAULT_SESSION_TTL_MINUTES = 30;
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";
const CHALLENGE_TTL_MS = 5 * 60_000;

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  totpEnabled: boolean;
  /** 기본 비밀번호(admin) 사용 중 — 변경 전까지 다른 API 차단 */
  mustChangePassword: boolean;
  isActive: boolean;
  permissions: Permission[];
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
  if (!names.has("must_change_password")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!names.has("display_name")) {
    db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
  }
  if (!names.has("is_active")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`,
    );
  }
  if (!names.has("permissions_json")) {
    db.exec(`ALTER TABLE users ADD COLUMN permissions_json TEXT`);
  }
  if (!names.has("vault_wrap")) {
    db.exec(`ALTER TABLE users ADD COLUMN vault_wrap TEXT`);
  }
  if (!names.has("vault_wrap_salt")) {
    db.exec(`ALTER TABLE users ADD COLUMN vault_wrap_salt TEXT`);
  }
}

function ensureAdminPermissions(): void {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, username, permissions_json, display_name FROM users`)
    .all() as Array<{
    id: number;
    username: string;
    permissions_json: string | null;
    display_name: string | null;
  }>;
  const update = db.prepare(
    `UPDATE users SET permissions_json = ?, display_name = COALESCE(NULLIF(display_name, ''), ?), updated_at = datetime('now') WHERE id = ?`,
  );
  const allJson = JSON.stringify(ALL_PERMISSIONS);
  for (const row of rows) {
    const perms = parsePermissionsJson(row.permissions_json);
    const display = row.display_name?.trim() || row.username;
    if (row.username === DEFAULT_USERNAME && perms.length === 0) {
      update.run(allJson, display, row.id);
    } else if (!row.display_name) {
      update.run(
        row.permissions_json ?? JSON.stringify([]),
        display,
        row.id,
      );
    }
  }
}

/** 아직 기본 비밀번호(admin)인 계정은 변경 강제 플래그를 켠다 */
function syncMustChangePasswordFlags(): void {
  const rows = getDb()
    .prepare(`SELECT id, password_hash FROM users`)
    .all() as Array<{ id: number; password_hash: string }>;
  const mark = getDb().prepare(
    `UPDATE users SET must_change_password = 1 WHERE id = ?`,
  );
  for (const row of rows) {
    if (verifyPassword(DEFAULT_PASSWORD, row.password_hash)) {
      mark.run(row.id);
    }
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
      `INSERT INTO users (username, password_hash, must_change_password, display_name, is_active, permissions_json)
       VALUES (?, ?, 1, ?, 1, ?)`,
    ).run(
      DEFAULT_USERNAME,
      hashPassword(DEFAULT_PASSWORD),
      DEFAULT_USERNAME,
      JSON.stringify(ALL_PERMISSIONS),
    );
  }

  syncMustChangePasswordFlags();
  ensureAdminPermissions();

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
  must_change_password: number;
  display_name: string | null;
  is_active: number;
  permissions_json: string | null;
};

const USER_SELECT = `id, username, password_hash, totp_secret, totp_enabled, totp_recovery_hashes,
              must_change_password, display_name, is_active, permissions_json`;

function findUserByUsername(username: string): UserRow | null {
  const row = getDb()
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE username = ?`)
    .get(username) as UserRow | undefined;
  return row ?? null;
}

function findUserById(id: number): UserRow | null {
  const row = getDb()
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
  return row ?? null;
}

function toAuthUser(row: UserRow): AuthUser {
  const stillDefault = verifyPassword(DEFAULT_PASSWORD, row.password_hash);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name?.trim() || row.username,
    totpEnabled: Boolean(row.totp_enabled),
    mustChangePassword: Boolean(row.must_change_password) || stillDefault,
    isActive: row.is_active !== 0,
    permissions: parsePermissionsJson(row.permissions_json),
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
  unlockVaultForUser(user.id, password);
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
  if (user.is_active === 0) {
    throw new Error("비활성화된 계정입니다. 관리자에게 문의하세요.");
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

  const dek = deriveVaultKey(challenge.userId, challenge.password);
  const secretPlain = tryUnsealSecret(user.totp_secret, dek);
  const recoveryOk = consumeRecoveryCode(user, code);
  const otpOk = secretPlain ? verifyTotp(secretPlain, code) : false;
  if (secretPlain && !otpOk && !recoveryOk) {
    throw new Error("인증 코드가 올바르지 않습니다.");
  }

  unlockVaultForUser(challenge.userId, challenge.password);

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
    unlockVaultForUser(userId, password);
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
  // 활성 세션이 없으면 볼트 잠금
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
      `SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.totp_enabled,
              u.password_hash, u.must_change_password, u.totp_secret, u.totp_recovery_hashes,
              u.display_name, u.is_active, u.permissions_json
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
        password_hash: string;
        must_change_password: number;
        totp_secret: string | null;
        totp_recovery_hashes: string | null;
        display_name: string | null;
        is_active: number;
        permissions_json: string | null;
      }
    | undefined;
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    logout(token);
    return null;
  }
  if (row.is_active === 0) {
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
    user: toAuthUser({
      id: row.user_id,
      username: row.username,
      password_hash: row.password_hash,
      totp_enabled: row.totp_enabled,
      totp_secret: row.totp_secret,
      totp_recovery_hashes: row.totp_recovery_hashes,
      must_change_password: row.must_change_password,
      display_name: row.display_name,
      is_active: row.is_active,
      permissions_json: row.permissions_json,
    }),
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
  if (newPassword === DEFAULT_PASSWORD) {
    throw new Error(
      "기본 비밀번호(admin)는 사용할 수 없습니다. 다른 비밀번호를 설정하세요.",
    );
  }
  if (newPassword === currentPassword) {
    throw new Error("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
  }
  if (!verifyUserPassword(userId, currentPassword)) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  assertTotpIfEnabled(userId, totpCode);
  rewrapVaultPassword(userId, currentPassword, newPassword);
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 0,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(hashPassword(newPassword), userId);
}

export interface ManagedUser {
  id: number;
  username: string;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  permissions: Permission[];
  createdAt: string;
}

export function listUsers(): ManagedUser[] {
  const rows = getDb()
    .prepare(
      `SELECT id, username, display_name, is_active, must_change_password, totp_enabled,
              permissions_json, created_at FROM users ORDER BY id ASC`,
    )
    .all() as Array<{
    id: number;
    username: string;
    display_name: string | null;
    is_active: number;
    must_change_password: number;
    totp_enabled: number;
    permissions_json: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name?.trim() || row.username,
    isActive: row.is_active !== 0,
    mustChangePassword: Boolean(row.must_change_password),
    totpEnabled: Boolean(row.totp_enabled),
    permissions: parsePermissionsJson(row.permissions_json),
    createdAt: row.created_at,
  }));
}

export function createUser(input: {
  username: string;
  displayName?: string;
  password: string;
  permissions: Permission[];
}): ManagedUser {
  if (!isVaultUnlocked()) {
    throw new Error("데이터 잠금 해제 후 계정을 만들 수 있습니다.");
  }
  const username = String(input.username ?? "").trim();
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(username)) {
    throw new Error("아이디는 영문·숫자·._- 2~32자여야 합니다.");
  }
  if (!input.password || input.password.length < 4) {
    throw new Error("초기 비밀번호는 4자 이상이어야 합니다.");
  }
  if (input.password === DEFAULT_PASSWORD) {
    throw new Error("기본 비밀번호(admin)는 사용할 수 없습니다.");
  }
  const permissions = parsePermissionsJson(JSON.stringify(input.permissions ?? []));
  const displayName = String(input.displayName ?? username).trim() || username;
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO users (username, password_hash, must_change_password, display_name, is_active, permissions_json)
         VALUES (?, ?, 1, ?, 1, ?)`,
      )
      .run(
        username,
        hashPassword(input.password),
        displayName,
        JSON.stringify(permissions),
      );
    const id = Number(result.lastInsertRowid);
    wrapActiveDekForUser(id, input.password);
    const created = listUsers().find((u) => u.id === id);
    if (!created) throw new Error("계정 생성에 실패했습니다.");
    return created;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      throw new Error("이미 존재하는 아이디입니다.");
    }
    throw err;
  }
}

export function updateUser(
  userId: number,
  input: {
    displayName?: string;
    isActive?: boolean;
    permissions?: Permission[];
  },
): ManagedUser {
  const user = findUserById(userId);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");

  const displayName =
    input.displayName !== undefined
      ? String(input.displayName).trim() || user.username
      : user.display_name?.trim() || user.username;
  const isActive =
    input.isActive !== undefined ? (input.isActive ? 1 : 0) : user.is_active;
  const permissions =
    input.permissions !== undefined
      ? parsePermissionsJson(JSON.stringify(input.permissions))
      : parsePermissionsJson(user.permissions_json);

  if (user.username === DEFAULT_USERNAME && isActive === 0) {
    throw new Error("기본 관리자 계정은 비활성화할 수 없습니다.");
  }

  getDb()
    .prepare(
      `UPDATE users SET display_name = ?, is_active = ?, permissions_json = ?,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(displayName, isActive, JSON.stringify(permissions), userId);

  if (isActive === 0) {
    getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  }

  const updated = listUsers().find((u) => u.id === userId);
  if (!updated) throw new Error("사용자를 찾을 수 없습니다.");
  return updated;
}

export function resetUserPassword(
  actorId: number,
  targetUserId: number,
  newPassword: string,
): void {
  if (!isVaultUnlocked()) {
    throw new Error("데이터 잠금 해제 후 비밀번호를 재설정할 수 있습니다.");
  }
  if (!newPassword || newPassword.length < 4) {
    throw new Error("새 비밀번호는 4자 이상이어야 합니다.");
  }
  if (newPassword === DEFAULT_PASSWORD) {
    throw new Error("기본 비밀번호(admin)는 사용할 수 없습니다.");
  }
  const target = findUserById(targetUserId);
  if (!target) throw new Error("사용자를 찾을 수 없습니다.");

  wrapActiveDekForUser(targetUserId, newPassword);
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 1,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(hashPassword(newPassword), targetUserId);
  getDb()
    .prepare(`DELETE FROM sessions WHERE user_id = ?`)
    .run(targetUserId);
  void actorId;
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
