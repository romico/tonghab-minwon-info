import { apiRequest } from "./client";

export interface AuthUser {
  id: number;
  username: string;
  totpEnabled?: boolean;
  mustChangePassword?: boolean;
}

export interface VaultStatus {
  enabled: boolean;
  unlocked: boolean;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: string;
  ttlMinutes: number;
  vault?: VaultStatus;
  totpReset?: boolean;
  warning?: string;
}

export interface LoginTotpChallenge {
  requiresTotp: true;
  challengeToken: string;
  expiresAt: string;
}

export interface AppSettings {
  sessionTtlMinutes: number;
  minSessionTtlMinutes: number;
  expiresAt?: string;
  ttlMinutes?: number;
  vault?: VaultStatus;
  totp?: {
    enabled: boolean;
    recoveryCodesRemaining: number;
  };
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<AuthSession | LoginTotpChallenge> {
  return apiRequest<AuthSession | LoginTotpChallenge>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function apiLoginTotp(
  challengeToken: string,
  code: string,
): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/login/totp", {
    method: "POST",
    body: JSON.stringify({ challengeToken, code }),
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
  totpCode?: string,
): Promise<AuthSession & { ok: true }> {
  return apiRequest<AuthSession & { ok: true }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword,
      ...(totpCode ? { totpCode } : {}),
    }),
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

export async function apiGetTotpStatus(): Promise<{
  enabled: boolean;
  recoveryCodesRemaining: number;
}> {
  return apiRequest("/api/auth/totp");
}

export async function apiTotpSetup(): Promise<{
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}> {
  return apiRequest("/api/auth/totp/setup", {
    method: "POST",
    body: "{}",
  });
}

export async function apiTotpConfirm(code: string): Promise<{
  ok: true;
  recoveryCodes: string[];
}> {
  return apiRequest("/api/auth/totp/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiTotpDisable(
  password: string,
  code: string,
): Promise<{ ok: true }> {
  return apiRequest("/api/auth/totp/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}
