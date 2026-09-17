/**
 * 포터블 ZIP 프록시 — 클라이언트 토큰 없이 GitHub Release asset 중계
 * GET /?tag=v0.1.8  또는  GET /download?tag=v0.1.8
 */
export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

type GhRelease = {
  assets?: Array<{ id: number; name: string; size?: number }>;
};

const DEFAULT_REPO = "romico/tonghab-minwon-info";
const ASSET_PREFIX = "tonghab-minwon-info-windows-portable-v";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const token = env.GITHUB_TOKEN?.trim();
    if (!token) {
      return Response.json(
        { error: "GITHUB_TOKEN 이 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/download") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const repo = env.GITHUB_REPO?.trim() || DEFAULT_REPO;
    const tagRaw = (url.searchParams.get("tag") || url.searchParams.get("v") || "")
      .trim()
      .replace(/^v/i, "");
    const releasePath = tagRaw
      ? `releases/tags/v${tagRaw}`
      : "releases/latest";

    const apiHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "uany-update-download-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const releaseRes = await fetch(
      `https://api.github.com/repos/${repo}/${releasePath}`,
      { headers: apiHeaders },
    );
    if (!releaseRes.ok) {
      return Response.json(
        { error: `릴리스 조회 실패 (${releaseRes.status})` },
        { status: releaseRes.status },
      );
    }

    const release = (await releaseRes.json()) as GhRelease;
    const asset = (release.assets ?? []).find(
      (a) => a.name.startsWith(ASSET_PREFIX) && a.name.endsWith(".zip"),
    );
    if (!asset) {
      return Response.json(
        { error: "포터블 ZIP 을 찾지 못했습니다." },
        { status: 404 },
      );
    }

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
          Authorization: `Bearer ${token}`,
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
