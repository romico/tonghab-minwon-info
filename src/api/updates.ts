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
  portable: boolean;
  canApply: boolean;
  checkedAt: string;
  source: "github" | "feed" | "none";
  error?: string;
}

export interface UpdateApplyResult {
  ok: true;
  fromVersion: string;
  toVersion: string;
  message: string;
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

export async function apiApplyUpdate(input?: {
  downloadUrl?: string;
  targetVersion?: string;
}): Promise<UpdateApplyResult> {
  return apiRequest<UpdateApplyResult>("/api/updates/apply", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}
