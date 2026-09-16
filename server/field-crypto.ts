import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const ENC_PREFIX = "enc:v1:";
const SCRYPT_OPTS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** 비밀번호 + salt → AES-256 키 */
export function deriveKey(password: string, saltHex: string): Buffer {
  return scryptSync(password, Buffer.from(saltHex, "hex"), 32, SCRYPT_OPTS);
}

export function newSaltHex(): string {
  return randomBytes(16).toString("hex");
}

export function keyVerifier(dek: Buffer): string {
  return createHash("sha256").update(dek).digest("hex");
}

export function verifyKey(dek: Buffer, storedVerifier: string): boolean {
  const next = Buffer.from(keyVerifier(dek), "hex");
  const prev = Buffer.from(storedVerifier, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(ENC_PREFIX));
}

/** 평문 → enc:v1:<base64url(iv||tag||ciphertext)> */
export function encryptString(plain: string, key: Buffer): string {
  if (plain.startsWith(ENC_PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptString(stored: string, key: Buffer): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64url");
  if (raw.length < 12 + 16) {
    throw new Error("암호문 형식이 올바르지 않습니다.");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** null/빈 문자열은 그대로, 그 외 암호화 */
export function encryptNullable(
  value: string | null | undefined,
  key: Buffer,
): string | null {
  if (value == null) return null;
  if (value === "") return "";
  return encryptString(value, key);
}

export function decryptNullable(
  value: string | null | undefined,
  key: Buffer,
): string | null {
  if (value == null) return null;
  if (value === "") return "";
  return decryptString(value, key);
}
