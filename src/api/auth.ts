import { apiRequest } from "./client";

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: string;
  ttlMinutes: number;
}

export interface AppSettings {
  sessionTtlMinutes: number;
  minSessionTtlMinutes: number;
  expiresAt?: string;
  ttlMinutes?: number;
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function apiLogout(): Promise<void> {
  await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function apiMe(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/me");
}

export async function apiRefreshSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/refresh", {
    method: "POST",
    body: "{}",
  });
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthSession & { ok: true }> {
  return apiRequest("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function apiGetSettings(): Promise<AppSettings> {
  return apiRequest<AppSettings>("/api/settings");
}

export async function apiUpdateSettings(input: {
  sessionTtlMinutes: number;
}): Promise<AppSettings> {
  return apiRequest<AppSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
