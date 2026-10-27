/** 메뉴·동작 권한 키 (고정 목록) */

export const MENU_PERMISSIONS = [
  "menu.dashboard",
  "menu.ledger",
  "menu.departments",
  "menu.summary",
  "menu.daily",
  "menu.audit",
  "menu.settings",
  "menu.users",
] as const;

export const ACTION_PERMISSIONS = [
  "users.manage",
  "complaints.write",
  "complaints.assign",
  "complaints.status_own",
  "import.files",
] as const;

export type MenuPermission = (typeof MENU_PERMISSIONS)[number];
export type ActionPermission = (typeof ACTION_PERMISSIONS)[number];
export type Permission = MenuPermission | ActionPermission;

export const ALL_PERMISSIONS: Permission[] = [
  ...MENU_PERMISSIONS,
  ...ACTION_PERMISSIONS,
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "menu.dashboard": "대시보드",
  "menu.ledger": "관리대장",
  "menu.departments": "부서별현황",
  "menu.summary": "총괄표",
  "menu.daily": "일일보고",
  "menu.audit": "감사로그",
  "menu.settings": "설정",
  "menu.users": "계정·권한",
  "users.manage": "계정 관리",
  "complaints.write": "민원 전체 수정",
  "complaints.assign": "담당자 지정",
  "complaints.status_own": "본인 담당 처리현황",
  "import.files": "문서 가져오기",
};

export function parsePermissionsJson(raw: string | null | undefined): Permission[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set<string>(ALL_PERMISSIONS);
    return parsed.filter((x): x is Permission => typeof x === "string" && allowed.has(x));
  } catch {
    return [];
  }
}

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  required: Permission | Permission[],
): boolean {
  if (!permissions?.length) return false;
  const set = new Set(permissions);
  const need = Array.isArray(required) ? required : [required];
  return need.every((p) => set.has(p));
}

export function hasAnyPermission(
  permissions: readonly string[] | null | undefined,
  required: Permission[],
): boolean {
  if (!permissions?.length) return false;
  const set = new Set(permissions);
  return required.some((p) => set.has(p));
}
