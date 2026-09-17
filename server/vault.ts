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
      const item = JSON.parse(row.data) as Complaint;
      const plain = unsealComplaint(item, oldKey);
      const sealed = sealComplaint(plain, newKey);
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

/**
 * 로그인 성공 시 호출.
 * - 미활성: salt·verifier 생성, 기존 평문 마이그레이션 후 활성화
 * - 활성: 비밀번호로 키 검증 후 메모리에 보관
 */
export function unlockVaultWithPassword(password: string): {
  migrated: number;
  enabledNow: boolean;
} {
  if (!password) throw new Error("비밀번호가 필요합니다.");

  if (!isVaultEnabled()) {
    const salt = newSaltHex();
    const dek = deriveKey(password, salt);
    setSetting(KEY_SALT, salt);
    setSetting(KEY_VERIFIER, keyVerifier(dek));
    const migrated = migrateComplaintsToEncrypted(dek);
    setSetting(KEY_ENABLED, "1");
    activeDek = dek;
    return { migrated, enabledNow: true };
  }

  const salt = getSetting(KEY_SALT);
  const verifier = getSetting(KEY_VERIFIER);
  if (!salt || !verifier) {
    throw new Error("암호화 설정이 손상되었습니다.");
  }
  const dek = deriveKey(password, salt);
  if (!verifyKey(dek, verifier)) {
    throw new Error("데이터 잠금 해제에 실패했습니다.");
  }
  // 혹시 남은 평문 건 보완 마이그레이션
  const migrated = migrateComplaintsToEncrypted(dek);
  activeDek = dek;
  return { migrated, enabledNow: false };
}

/** 비밀번호 변경 시 전체 재암호화 + 새 verifier */
export function rotateVaultPassword(
  currentPassword: string,
  newPassword: string,
): void {
  if (!isVaultEnabled()) {
    unlockVaultWithPassword(newPassword);
    return;
  }
  const salt = getSetting(KEY_SALT);
  const verifier = getSetting(KEY_VERIFIER);
  if (!salt || !verifier) {
    throw new Error("암호화 설정이 손상되었습니다.");
  }
  const oldKey = deriveKey(currentPassword, salt);
  if (!verifyKey(oldKey, verifier)) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  const newSalt = newSaltHex();
  const newKey = deriveKey(newPassword, newSalt);
  reencryptAllComplaints(oldKey, newKey);
  reencryptSealedUserSecrets(oldKey, newKey);
  setSetting(KEY_SALT, newSalt);
  setSetting(KEY_VERIFIER, keyVerifier(newKey));
  activeDek = newKey;
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
