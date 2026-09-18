/**
 * 로그인 무차별 대입 완화 — 프로세스 메모리 기준 (포터블 단일 인스턴스).
 * IP·계정별 실패 횟수 / 짧은 창의 시도 횟수를 제한한다.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** 창 안에서 허용하는 실패 횟수 (초과 시 lockout) */
const MAX_FAILURES = envInt("TM_LOGIN_MAX_FAILURES", 5);
/** 실패 집계 창 (ms) */
const FAILURE_WINDOW_MS = envInt("TM_LOGIN_WINDOW_MS", 15 * 60_000);
/** 잠금 유지 시간 (ms) */
const LOCKOUT_MS = envInt("TM_LOGIN_LOCKOUT_MS", 15 * 60_000);
/** IP당 분당 최대 시도(성공·실패 포함) */
const MAX_ATTEMPTS_PER_MIN = envInt("TM_LOGIN_MAX_ATTEMPTS_PER_MINUTE", 20);

type Bucket = {
  failures: number[];
  lockedUntil: number;
  attemptTimes: number[];
};

const byIp = new Map<string, Bucket>();
const byUser = new Map<string, Bucket>();

export class LoginRateLimitedError extends Error {
  readonly status = 429;
  readonly retryAfterSec: number;
  readonly code = "LOGIN_RATE_LIMITED";

  constructor(retryAfterSec: number) {
    const sec = Math.max(1, retryAfterSec);
    super(
      `로그인 시도가 너무 많습니다. ${sec}초 후에 다시 시도해 주세요.`,
    );
    this.name = "LoginRateLimitedError";
    this.retryAfterSec = sec;
  }
}

function bucket(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { failures: [], lockedUntil: 0, attemptTimes: [] };
    map.set(key, b);
  }
  return b;
}

function pruneFailures(b: Bucket, now: number): void {
  const cut = now - FAILURE_WINDOW_MS;
  b.failures = b.failures.filter((t) => t >= cut);
  const attemptCut = now - 60_000;
  b.attemptTimes = b.attemptTimes.filter((t) => t >= attemptCut);
  if (b.lockedUntil && b.lockedUntil <= now) b.lockedUntil = 0;
}

function retryAfterFrom(b: Bucket, now: number): number {
  if (b.lockedUntil > now) {
    return Math.ceil((b.lockedUntil - now) / 1000);
  }
  if (b.attemptTimes.length >= MAX_ATTEMPTS_PER_MIN) {
    const oldest = b.attemptTimes[0]!;
    return Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
  }
  return 1;
}

function assertBucket(b: Bucket, now: number): void {
  pruneFailures(b, now);
  if (b.lockedUntil > now) {
    throw new LoginRateLimitedError(retryAfterFrom(b, now));
  }
  if (b.attemptTimes.length >= MAX_ATTEMPTS_PER_MIN) {
    throw new LoginRateLimitedError(retryAfterFrom(b, now));
  }
}

function normalizeUser(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeIp(ip: string | null | undefined): string {
  const v = (ip ?? "").trim();
  return v || "unknown";
}

/** 로그인·TOTP 시도 전 호출 */
export function assertLoginAllowed(
  ip: string | null | undefined,
  username: string,
): void {
  const now = Date.now();
  assertBucket(bucket(byIp, normalizeIp(ip)), now);
  assertBucket(bucket(byUser, normalizeUser(username)), now);
}

function noteAttempt(b: Bucket, now: number): void {
  pruneFailures(b, now);
  b.attemptTimes.push(now);
}

function noteFailure(b: Bucket, now: number): void {
  noteAttempt(b, now);
  b.failures.push(now);
  pruneFailures(b, now);
  if (b.failures.length >= MAX_FAILURES) {
    b.lockedUntil = now + LOCKOUT_MS;
    b.failures = [];
  }
}

export function recordLoginFailure(
  ip: string | null | undefined,
  username: string,
): void {
  const now = Date.now();
  noteFailure(bucket(byIp, normalizeIp(ip)), now);
  noteFailure(bucket(byUser, normalizeUser(username)), now);
}

export function recordLoginSuccess(
  ip: string | null | undefined,
  username: string,
): void {
  const now = Date.now();
  const ipKey = normalizeIp(ip);
  const userKey = normalizeUser(username);
  const ipB = bucket(byIp, ipKey);
  const userB = bucket(byUser, userKey);
  noteAttempt(ipB, now);
  noteAttempt(userB, now);
  ipB.failures = [];
  ipB.lockedUntil = 0;
  userB.failures = [];
  userB.lockedUntil = 0;
}

/** 테스트·진단용 */
export function _resetLoginGuardForTests(): void {
  byIp.clear();
  byUser.clear();
}

export function getLoginGuardConfig(): {
  maxFailures: number;
  failureWindowMs: number;
  lockoutMs: number;
  maxAttemptsPerMinute: number;
} {
  return {
    maxFailures: MAX_FAILURES,
    failureWindowMs: FAILURE_WINDOW_MS,
    lockoutMs: LOCKOUT_MS,
    maxAttemptsPerMinute: MAX_ATTEMPTS_PER_MIN,
  };
}
