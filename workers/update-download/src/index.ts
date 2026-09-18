/**
 * 포터블 ZIP 프록시 — 공개 GitHub Release asset 중계
 * GET /download?tag=v0.1.9&platform=win32-x64|linux-x64|darwin-arm64|darwin-x64
 *
 * 기본: 인증 없이 공개 릴리스만 조회하고 browser_download_url 로 리다이렉트.
 * 비공개 릴리스 중계는 ALLOW_PRIVATE_RELEASES=true + GITHUB_TOKEN 일 때만.
 */
export interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  /** "true" | "1" — 비공개 릴리스를 토큰으로 중계 (기본 비활성) */
  ALLOW_PRIVATE_RELEASES?: string;
}

type GhAsset = {
  id: number;
  name: string;
  size?: number;
  browser_download_url?: string;
};

type GhRelease = {
  assets?: GhAsset[];
};

const DEFAULT_REPO = "romico/tonghab-minwon-info";

const PLATFORM_PREFIX: Record<string, string> = {
  "win32-x64": "tonghab-minwon-info-windows-portable-v",
  windows: "tonghab-minwon-info-windows-portable-v",
  win: "tonghab-minwon-info-windows-portable-v",
  "linux-x64": "tonghab-minwon-info-linux-portable-v",
  linux: "tonghab-minwon-info-linux-portable-v",
  "darwin-arm64": "tonghab-minwon-info-macos-arm64-portable-v",
  "macos-arm64": "tonghab-minwon-info-macos-arm64-portable-v",
  "darwin-x64": "tonghab-minwon-info-macos-x64-portable-v",
  "macos-x64": "tonghab-minwon-info-macos-x64-portable-v",
  macos: "tonghab-minwon-info-macos-arm64-portable-v",
  darwin: "tonghab-minwon-info-macos-arm64-portable-v",
};

function resolvePrefix(platformRaw: string | null): string {
  const key = (platformRaw || "win32-x64").trim().toLowerCase();
  return PLATFORM_PREFIX[key] ?? PLATFORM_PREFIX["win32-x64"];
}

function allowPrivateReleases(env: Env): boolean {
  const v = (env.ALLOW_PRIVATE_RELEASES ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function apiHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "uany-update-download-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/download") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const privateMode = allowPrivateReleases(env);
    const token = env.GITHUB_TOKEN?.trim() || null;
    if (privateMode && !token) {
      return Response.json(
        {
          error:
            "ALLOW_PRIVATE_RELEASES 가 켜져 있으나 GITHUB_TOKEN 이 없습니다.",
        },
        { status: 500 },
      );
    }

    // 공개 모드에서는 토큰을 쓰지 않음 — 비공개 릴리스 우회 방지
    const authToken = privateMode ? token : null;

    const repo = env.GITHUB_REPO?.trim() || DEFAULT_REPO;
    const tagRaw = (url.searchParams.get("tag") || url.searchParams.get("v") || "")
      .trim()
      .replace(/^v/i, "");
    const releasePath = tagRaw
      ? `releases/tags/v${tagRaw}`
      : "releases/latest";
    const assetPrefix = resolvePrefix(url.searchParams.get("platform"));

    const releaseRes = await fetch(
      `https://api.github.com/repos/${repo}/${releasePath}`,
      { headers: apiHeaders(authToken) },
    );
    if (!releaseRes.ok) {
      return Response.json(
        {
          error:
            releaseRes.status === 404
              ? "공개 릴리스를 찾을 수 없습니다."
              : `릴리스 조회 실패 (${releaseRes.status})`,
        },
        { status: releaseRes.status },
      );
    }

    const release = (await releaseRes.json()) as GhRelease;
    const asset = (release.assets ?? []).find(
      (a) => a.name.startsWith(assetPrefix) && a.name.endsWith(".zip"),
    );
    if (!asset) {
      return Response.json(
        {
          error: `포터블 ZIP 을 찾지 못했습니다 (${assetPrefix}*).`,
        },
        { status: 404 },
      );
    }

    // 공개: GitHub 공식 다운로드 URL로 리다이렉트 (토큰 불필요)
    if (!privateMode) {
      const publicUrl = asset.browser_download_url?.trim();
      if (!publicUrl) {
        return Response.json(
          { error: "공개 다운로드 URL 이 없습니다." },
          { status: 404 },
        );
      }
      return Response.redirect(publicUrl, 302);
    }

    // 비공개(옵트인): assets API 로 스트림 중계
    if (request.method === "HEAD") {
      const headers = new Headers();
      headers.set("Content-Type", "application/zip");
      headers.set(
        "Content-Disposition",
        `attachment; filename="${asset.name.replace(/"/g, "")}"`,
      );
      if (typeof asset.size === "number") {
        headers.set("Content-Length", String(asset.size));
      }
      return new Response(null, { status: 200, headers });
    }

    const assetRes = await fetch(
      `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`,
      {
        headers: {
          Accept: "application/octet-stream",
          Authorization: `Bearer ${authToken}`,
          "User-Agent": "uany-update-download-worker",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!assetRes.ok || !assetRes.body) {
      return Response.json(
        { error: `ZIP 다운로드 실패 (${assetRes.status})` },
        { status: assetRes.status },
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${asset.name.replace(/"/g, "")}"`,
    );
    headers.set("Cache-Control", "public, max-age=300");
    const len = assetRes.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    else if (typeof asset.size === "number") {
      headers.set("Content-Length", String(asset.size));
    }

    return new Response(assetRes.body, { status: 200, headers });
  },
};
