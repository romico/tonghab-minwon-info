import { apiRequest } from "@/api/client";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  downloadUrl: string | null;
  htmlUrl: string | null;
  sha256: string | null;
  size: number | null;
  portable: boolean;
  canApply: boolean;
  checkedAt: string;
  source: "github" | "feed" | "none";
  feedUrl: string | null;
  error?: string;
}

export interface UpdateApplyResult {
  ok: true;
  fromVersion: string;
  toVersion: string;
  sha256: string | null;
  message: string;
}

export interface UpdateConfig {
  feedUrl: string | null;
  feedUrlFromEnv: boolean;
  githubTokenConfigured: boolean;
  githubTokenFromEnv: boolean;
  githubTokenHint: string | null;
}

export interface AppVersionInfo {
  version: string;
  portable: boolean;
}

export async function apiGetVersion(): Promise<AppVersionInfo> {
  return apiRequest<AppVersionInfo>("/api/version");
}

export async function apiCheckUpdate(): Promise<UpdateCheckResult> {
  return apiRequest<UpdateCheckResult>("/api/updates/check");
}

export async function apiGetUpdateConfig(): Promise<UpdateConfig> {
  return apiRequest<UpdateConfig>("/api/updates/config");
}

export async function apiSaveUpdateConfig(input: {
  feedUrl?: string | null;
  githubToken?: string | null;
  clearGithubToken?: boolean;
}): Promise<UpdateConfig> {
  return apiRequest<UpdateConfig>("/api/updates/config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function apiApplyUpdate(input?: {
  downloadUrl?: string;
  targetVersion?: string;
  sha256?: string;
}): Promise<UpdateApplyResult> {
  return apiRequest<UpdateApplyResult>("/api/updates/apply", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}
