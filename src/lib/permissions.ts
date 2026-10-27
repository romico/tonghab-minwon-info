import type { Permission } from "@/api/auth";

export function userHasPermission(
  permissions: readonly string[] | null | undefined,
  required: Permission | Permission[],
): boolean {
  if (!permissions?.length) return false;
  const set = new Set(permissions);
  const need = Array.isArray(required) ? required : [required];
  return need.every((p) => set.has(p));
}

export const MENU_TO_PERMISSION: Record<string, Permission> = {
  "/": "menu.dashboard",
  "/ledger": "menu.ledger",
  "/departments": "menu.departments",
  "/summary": "menu.summary",
  "/daily": "menu.daily",
  "/audit": "menu.audit",
  "/settings": "menu.settings",
  "/users": "menu.users",
};
