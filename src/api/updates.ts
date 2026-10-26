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
  /** 실행 중인 런타임. 예: v22.23.4 */
  nodeVersion: string;
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

export async function apiApplyUpdate(): Promise<UpdateApplyResult> {
  return apiRequest<UpdateApplyResult>("/api/updates/apply", {
    method: "POST",
    body: "{}",
  });
}

export type RestartWait = "restarted" | "still-up" | "down";

/** 적용 응답이 끊겨도, 서버가 내려갔다가 올라오면 재시작으로 본다. */
export async function waitUntilServerRestarts(
  previousVersion: string,
  timeoutMs = 120_000,
): Promise<RestartWait> {
  const started = Date.now();
  let sawDown = false;
  let upStreak = 0;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error("health");
      const data = (await res.json()) as { version?: string };
      if (sawDown || (data.version != null && data.version !== previousVersion)) {
        return "restarted";
      }
      upStreak += 1;
      if (upStreak >= 8 && Date.now() - started > 10_000) return "still-up";
    } catch {
      sawDown = true;
      upStreak = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return sawDown ? "down" : "still-up";
}
