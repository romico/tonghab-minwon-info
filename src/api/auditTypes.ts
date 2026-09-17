export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAIL"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "SETTINGS_UPDATE"
  | "COMPLAINT_CREATE"
  | "COMPLAINT_UPDATE"
  | "COMPLAINT_DELETE"
  | "COMPLAINT_BATCH_CREATE"
  | "COMPLAINT_REPLACE"
  | "COMPLAINT_RESET_SEED"
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
  LOGOUT: "로그아웃",
  PASSWORD_CHANGE: "비밀번호 변경",
  SETTINGS_UPDATE: "설정 변경",
  COMPLAINT_CREATE: "민원 등록",
  COMPLAINT_UPDATE: "민원 수정",
  COMPLAINT_DELETE: "민원 삭제",
  COMPLAINT_BATCH_CREATE: "민원 일괄등록",
  COMPLAINT_REPLACE: "민원 전체교체",
  COMPLAINT_RESET_SEED: "DB 초기화",
  SNAPSHOT_FREEZE: "보고 스냅샷 확정",
  UPDATE_APPLY: "앱 업데이트",
};
