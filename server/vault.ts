import { randomBytes } from "node:crypto";
import { getDb } from "./db.ts";
import {
  decryptNullable,
  decryptString,
  deriveKey,
  encryptNullable,
  encryptString,
  isEncrypted,
  keyVerifier,
  newSaltHex,
  verifyKey,
} from "./field-crypto.ts";
import type { Complaint, ComplaintPhoto } from "../src/schema/index.ts";

const KEY_SALT = "vault_salt";
const KEY_VERIFIER = "vault_verifier";
const KEY_ENABLED = "vault_enabled";
const KEY_WRAP_VERSION = "vault_wrap_version";

let activeDek: Buffer | null = null;

export class VaultLockedError extends Error {
  constructor(message = "데이터 잠금 상태입니다. 다시 로그인해 주세요.") {
    super(message);
    this.name = "VaultLockedError";
  }
}

function getSetting(key: string): string | null {
  try {
    const row = getDb()
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    // initDb 시드 시점 등 app_settings 미생성
    return null;
  }
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function isVaultEnabled(): boolean {
  return getSetting(KEY_ENABLED) === "1";
}

export function isVaultUnlocked(): boolean {
  return activeDek != null;
}

export function getActiveDek(): Buffer {
  if (!activeDek) throw new VaultLockedError();
  return activeDek;
}

export function lockVault(): void {
  activeDek = null;
}

export function getVaultStatus(): {
  enabled: boolean;
  unlocked: boolean;
} {
  return {
    enabled: isVaultEnabled(),
    unlocked: isVaultUnlocked(),
  };
}

function sealPhoto(photo: ComplaintPhoto, key: Buffer): ComplaintPhoto {
  return {
    ...photo,
    url: photo.url ? encryptString(photo.url, key) : photo.url,
  };
}

function unsealPhoto(photo: ComplaintPhoto, key: Buffer): ComplaintPhoto {
  return {
    ...photo,
    url: photo.url ? decryptString(photo.url, key) : photo.url,
  };
}

/** 저장용: 개인정보 필드 암호화 */
export function sealComplaint(item: Complaint, key: Buffer): Complaint {
  return {
    ...item,
    complainantName: encryptString(item.complainantName ?? "", key),
    complainantPhone: encryptNullable(item.complainantPhone, key),
    photoReceiptUrl: encryptNullable(item.photoReceiptUrl, key),
    photoBeforeUrl: encryptNullable(item.photoBeforeUrl, key),
    photoAfterUrl: encryptNullable(item.photoAfterUrl, key),
    photos: (item.photos ?? []).map((p) => sealPhoto(p, key)),
  };
}

/** 응답용: 개인정보 필드 복호화 */
export function unsealComplaint(item: Complaint, key: Buffer): Complaint {
  return {
    ...item,
    complainantName: decryptString(item.complainantName ?? "", key),
    complainantPhone: decryptNullable(item.complainantPhone, key),
    photoReceiptUrl: decryptNullable(item.photoReceiptUrl, key),
    photoBeforeUrl: decryptNullable(item.photoBeforeUrl, key),
    photoAfterUrl: decryptNullable(item.photoAfterUrl, key),
    photos: (item.photos ?? []).map((p) => unsealPhoto(p, key)),
  };
}

function needsSeal(item: Complaint): boolean {
  if (!isEncrypted(item.complainantName)) return true;
  if (item.complainantPhone && !isEncrypted(item.complainantPhone)) return true;
  if (item.photoReceiptUrl && !isEncrypted(item.photoReceiptUrl)) return true;
  if (item.photoBeforeUrl && !isEncrypted(item.photoBeforeUrl)) return true;
  if (item.photoAfterUrl && !isEncrypted(item.photoAfterUrl)) return true;
  for (const p of item.photos ?? []) {
    if (p.url && !isEncrypted(p.url)) return true;
  }
  return false;
}

/** 평문 민원을 일괄 암호화해 DB에 다시 씀 */
export function migrateComplaintsToEncrypted(key: Buffer): number {
  const rows = getDb()
    .prepare(`SELECT id, data FROM complaints`)
    .all() as { id: string; data: string }[];
  const update = getDb().prepare(
    `UPDATE complaints SET data = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  let changed = 0;
  getDb().exec("BEGIN");
  try {
    for (const row of rows) {
      const item = JSON.parse(row.data) as Complaint;
      if (!needsSeal(item)) continue;
      const sealed = sealComplaint(item, key);
      update.run(JSON.stringify(sealed), row.id);
      changed += 1;
    }
    getDb().exec("COMMIT");
  } catch (err) {
    getDb().exec("ROLLBACK");
    throw err;
  }
  return changed;
}

/** 암호문 민원을 새 키로 재암호화 */
export function reencryptAllComplaints(
  oldKey: Buffer,
  newKey: Buffer,
): number {
  const rows = getDb()
    .prepare(`SELECT id, data FROM complaints`)
    .all() as { id: string; data: string }[];
  const update = getDb().prepare(
    `UPDATE complaints SET data = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  let changed = 0;
  getDb().exec("BEGIN");
  try {
    for (const row of rows) {
      try {
        const item = JSON.parse(row.data) as Complaint;
        const plain = unsealComplaint(item, oldKey);
        const sealed = sealComplaint(plain, newKey);
        update.run(JSON.stringify(sealed), row.id);
        changed += 1;
      } catch {
        /* 복호화되지 않는 레코드는 건너뛴다. 목록·삭제는 그대로 동작한다. */
      }
    }
    getDb().exec("COMMIT");
  } catch (err) {
    getDb().exec("ROLLBACK");
    throw err;
  }
  return changed;
}

export function isVaultWrapMode(): boolean {
  return getSetting(KEY_WRAP_VERSION) === "1";
}

function getUserVaultWrap(userId: number): {
  wrap: string | null;
  salt: string | null;
} {
  const row = getDb()
    .prepare(`SELECT vault_wrap, vault_wrap_salt FROM users WHERE id = ?`)
    .get(userId) as
    | { vault_wrap: string | null; vault_wrap_salt: string | null }
    | undefined;
  return {
    wrap: row?.vault_wrap ?? null,
    salt: row?.vault_wrap_salt ?? null,
  };
}

export function setUserVaultWrap(
  userId: number,
  wrap: string,
  salt: string,
): void {
  getDb()
    .prepare(
      `UPDATE users SET vault_wrap = ?, vault_wrap_salt = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(wrap, salt, userId);
}

/** DEK를 비밀번호 기반 KEK로 감싼다. */
export function wrapDekForPassword(
  dek: Buffer,
  password: string,
): { wrap: string; salt: string } {
  const salt = newSaltHex();
  const kek = deriveKey(password, salt);
  const wrap = encryptString(dek.toString("base64"), kek);
  return { wrap, salt };
}

export function unwrapDekWithPassword(
  wrap: string,
  salt: string,
  password: string,
): Buffer {
  const kek = deriveKey(password, salt);
  const b64 = decryptString(wrap, kek);
  const dek = Buffer.from(b64, "base64");
  if (dek.length !== 32) {
    throw new Error("데이터 잠금 해제에 실패했습니다.");
  }
  return dek;
}

function unlockLegacyPasswordDerived(password: string): Buffer {
  const salt = getSetting(KEY_SALT);
  const verifier = getSetting(KEY_VERIFIER);
  if (!salt || !verifier) {
    throw new Error("암호화 설정이 손상되었습니다.");
  }
  const dek = deriveKey(password, salt);
  if (!verifyKey(dek, verifier)) {
    throw new Error("데이터 잠금 해제에 실패했습니다.");
  }
  return dek;
}

/**
 * 비밀번호가 맞으면 DEK만 돌려준다. 프로세스 잠금 상태는 바꾸지 않는다.
 * wrap 모드면 사용자 wrap을 쓰고, 아니면 레거시(비밀번호=DEK) 경로.
 */
export function deriveVaultKey(userId: number, password: string): Buffer {
  if (!password) throw new Error("비밀번호가 필요합니다.");
  if (!isVaultEnabled()) {
    throw new Error("데이터 잠금 해제에 실패했습니다.");
  }
  const verifier = getSetting(KEY_VERIFIER);
  if (!verifier) throw new Error("암호화 설정이 손상되었습니다.");

  if (isVaultWrapMode()) {
    const { wrap, salt } = getUserVaultWrap(userId);
    if (!wrap || !salt) {
      throw new Error("이 계정의 데이터 잠금 키가 없습니다. 관리자에게 문의하세요.");
    }
    const dek = unwrapDekWithPassword(wrap, salt, password);
    if (!verifyKey(dek, verifier)) {
      throw new Error("데이터 잠금 해제에 실패했습니다.");
    }
    return dek;
  }

  return unlockLegacyPasswordDerived(password);
}

/**
 * 로그인 성공 시 호출.
 * - 미활성: 랜덤 DEK + 사용자 wrap 생성 후 활성화
 * - wrap 모드: 사용자 wrap 해제
 * - 레거시: 비밀번호 유도 DEK 후 해당 사용자를 wrap으로 마이그레이션
 */
export function unlockVaultForUser(
  userId: number,
  password: string,
): {
  migrated: number;
  enabledNow: boolean;
} {
  if (!password) throw new Error("비밀번호가 필요합니다.");

  if (!isVaultEnabled()) {
    const dek = randomBytes(32);
    setSetting(KEY_VERIFIER, keyVerifier(dek));
    // 레거시 필드도 채워 두어 아카이브 호환 유지 (wrap 모드에서는 로그인에 쓰지 않음)
    setSetting(KEY_SALT, newSaltHex());
    const { wrap, salt } = wrapDekForPassword(dek, password);
    setUserVaultWrap(userId, wrap, salt);
    const migrated = migrateComplaintsToEncrypted(dek);
    setSetting(KEY_ENABLED, "1");
    setSetting(KEY_WRAP_VERSION, "1");
    activeDek = dek;
    return { migrated, enabledNow: true };
  }

  const verifier = getSetting(KEY_VERIFIER);
  if (!verifier) throw new Error("암호화 설정이 손상되었습니다.");

  if (isVaultWrapMode()) {
    const { wrap, salt } = getUserVaultWrap(userId);
    if (!wrap || !salt) {
      throw new Error("이 계정의 데이터 잠금 키가 없습니다. 관리자에게 문의하세요.");
    }
    const dek = unwrapDekWithPassword(wrap, salt, password);
    if (!verifyKey(dek, verifier)) {
      throw new Error("데이터 잠금 해제에 실패했습니다.");
    }
    const migrated = migrateComplaintsToEncrypted(dek);
    activeDek = dek;
    return { migrated, enabledNow: false };
  }

  // 레거시 → wrap 1회 마이그레이션 (기존 DEK 유지, 민원 재암호화 없음)
  const dek = unlockLegacyPasswordDerived(password);
  const { wrap, salt } = wrapDekForPassword(dek, password);
  setUserVaultWrap(userId, wrap, salt);
  setSetting(KEY_WRAP_VERSION, "1");
  const migrated = migrateComplaintsToEncrypted(dek);
  activeDek = dek;
  return { migrated, enabledNow: false };
}

/** @deprecated unlockVaultForUser 사용. 단일 사용자 호환용 래퍼 */
export function unlockVaultWithPassword(password: string): {
  migrated: number;
  enabledNow: boolean;
} {
  const row = getDb()
    .prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!row) throw new Error("사용자가 없습니다.");
  return unlockVaultForUser(row.id, password);
}

/**
 * 비밀번호 변경: wrap만 재발급 (민원 전체 재암호화 없음).
 * wrap 이전이면 먼저 레거시 잠금 해제 후 wrap으로 전환한다.
 */
export function rewrapVaultPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): void {
  if (!newPassword) throw new Error("새 비밀번호가 필요합니다.");

  if (!isVaultEnabled()) {
    unlockVaultForUser(userId, newPassword);
    return;
  }

  let dek: Buffer;
  if (isVaultWrapMode()) {
    dek = deriveVaultKey(userId, currentPassword);
  } else {
    dek = unlockLegacyPasswordDerived(currentPassword);
    setSetting(KEY_WRAP_VERSION, "1");
  }

  const { wrap, salt } = wrapDekForPassword(dek, newPassword);
  setUserVaultWrap(userId, wrap, salt);
  activeDek = dek;
}

/** 열린 볼트의 DEK를 새 사용자 초기 비밀번호로 wrap */
export function wrapActiveDekForUser(userId: number, password: string): void {
  const dek = getActiveDek();
  const { wrap, salt } = wrapDekForPassword(dek, password);
  setUserVaultWrap(userId, wrap, salt);
}

/** @deprecated wrap 모드에서는 rewrapVaultPassword 사용 */
export function rotateVaultPassword(
  currentPassword: string,
  newPassword: string,
): void {
  const row = getDb()
    .prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`)
    .get() as { id: number } | undefined;
  if (!row) throw new Error("사용자가 없습니다.");
  rewrapVaultPassword(row.id, currentPassword, newPassword);
}

/** users.totp_secret 등 볼트 키로 密封된 값 재암호화 */
export function reencryptSealedUserSecrets(
  oldKey: Buffer,
  newKey: Buffer,
): void {
  const rows = getDb()
    .prepare(
      `SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL AND totp_secret != ''`,
    )
    .all() as { id: number; totp_secret: string }[];
  const update = getDb().prepare(
    `UPDATE users SET totp_secret = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  for (const row of rows) {
    try {
      const plain = decryptString(row.totp_secret, oldKey);
      update.run(encryptString(plain, newKey), row.id);
    } catch {
      // 이미 새 키거나 손상된 값은 건너뜀 (로그인 시 복구 경로 있음)
    }
  }
}

/** 보관본 app_settings의 salt/verifier로 DEK 유도·검증 */
export function dekFromArchiveSettings(
  password: string,
  salt: string | null,
  verifier: string | null,
): Buffer {
  if (!password) {
    throw new Error("보관본 비밀번호가 필요합니다.");
  }
  if (!salt || !verifier) {
    throw new Error("보관본 암호화 설정이 손상되었습니다.");
  }
  const dek = deriveKey(password, salt);
  if (!verifyKey(dek, verifier)) {
    throw new Error(
      "보관본 비밀번호가 올바르지 않습니다. (아카이브 시점 비밀번호를 입력하세요)",
    );
  }
  return dek;
}

/** TOTP 시크릿 등 부가 비밀값 암·복호화 */
export function sealSecret(plain: string, key: Buffer): string {
  return encryptString(plain, key);
}

export function unsealSecret(stored: string, key: Buffer): string {
  return decryptString(stored, key);
}

export function tryUnsealSecret(
  stored: string,
  key: Buffer,
): string | null {
  try {
    return decryptString(stored, key);
  } catch {
    return null;
  }
}
