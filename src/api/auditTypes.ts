export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAIL"
  | "LOGIN_RATE_LIMITED"
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

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "로그인 성공",
  LOGIN_FAIL: "로그인 실패",
  LOGIN_RATE_LIMITED: "로그인 시도 제한",
  LOGIN_TOTP_REQUIRED: "2단계 인증 대기",
  LOGOUT: "로그아웃",
  PASSWORD_CHANGE: "비밀번호 변경",
  SETTINGS_UPDATE: "설정 변경",
  TOTP_SETUP_BEGIN: "2FA 설정 시작",
  TOTP_ENABLED: "2FA 활성화",
  TOTP_DISABLED: "2FA 비활성화",
  COMPLAINT_CREATE: "민원 등록",
  COMPLAINT_UPDATE: "민원 수정",
  COMPLAINT_DELETE: "민원 삭제",
  COMPLAINT_BATCH_CREATE: "민원 일괄등록",
  COMPLAINT_REPLACE: "민원 전체교체",
  COMPLAINT_RESET_SEED: "DB 초기화",
  DB_ARCHIVE_ROLLOVER: "DB 아카이브 전환",
  DB_ARCHIVE_RESTORE_MERGE: "DB 보관본 민원 병합",
  DB_ARCHIVE_RESTORE_REPLACE: "DB 보관본 통째 교체",
  DB_ARCHIVE_DELETE: "DB 보관본 삭제",
  SNAPSHOT_FREEZE: "보고 스냅샷 확정",
  UPDATE_APPLY: "앱 업데이트",
};
