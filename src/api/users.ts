import { apiRequest } from "./client";
import type { Permission } from "./auth";

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

export interface AssigneeOption {
  id: number;
  username: string;
  displayName: string;
}

export async function apiListUsers(): Promise<ManagedUser[]> {
  const res = await apiRequest<{ users: ManagedUser[] }>("/api/users");
  return res.users;
}

export async function apiListAssignees(): Promise<AssigneeOption[]> {
  const res = await apiRequest<{ users: AssigneeOption[] }>(
    "/api/users/assignees",
  );
  return res.users;
}

export async function apiCreateUser(input: {
  username: string;
  displayName?: string;
  password: string;
  permissions: Permission[];
}): Promise<ManagedUser> {
  const res = await apiRequest<{ user: ManagedUser }>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.user;
}

export async function apiUpdateUser(
  id: number,
  input: {
    displayName?: string;
    isActive?: boolean;
    permissions?: Permission[];
  },
): Promise<ManagedUser> {
  const res = await apiRequest<{ user: ManagedUser }>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.user;
}

export async function apiResetUserPassword(
  id: number,
  password: string,
): Promise<void> {
  await apiRequest(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function apiPermissionCatalog(): Promise<
  Array<{ id: Permission; label: string }>
> {
  const res = await apiRequest<{
    permissions: Array<{ id: Permission; label: string }>;
  }>("/api/permissions/catalog");
  return res.permissions;
}
