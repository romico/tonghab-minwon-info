import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const UPDATES_DIR = join(ROOT, "updates");
const DOWNLOAD_ZIP = join(UPDATES_DIR, "download.zip");
const EXTRACT_DIR = join(UPDATES_DIR, "extract");
const APPLY_BAT = join(UPDATES_DIR, "apply-update.bat");
const DATA_DIR = process.env.TM_DATA_DIR ?? join(ROOT, "data");

/** GitHub owner/repo — 릴리스 조회 대상 */
export const GITHUB_REPO =
  process.env.TM_GITHUB_REPO?.trim() || "romico/tonghab-minwon-info";

const ASSET_PREFIX = "tonghab-minwon-info-windows-portable-v";

export type UpdateCheckResult = {
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
};

export type UpdateApplyResult = {
  ok: true;
  fromVersion: string;
  toVersion: string;
  message: string;
};

function readPackageVersion(): string {
  const candidates = [
    join(ROOT, "package.json"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
      if (pkg.version) return String(pkg.version);
    } catch {
      /* try next */
    }
  }
  return "0.0.0";
}

export function getCurrentVersion(): string {
  return readPackageVersion();
}

/** runtime\\node.exe 또는 TM_PORTABLE=1 이면 포터블 배포 */
export function isPortableInstall(): boolean {
  if (process.env.TM_PORTABLE === "1") return true;
  return existsSync(join(ROOT, "runtime", "node.exe"));
}

export function canApplyUpdate(): boolean {
  return process.platform === "win32" && isPortableInstall();
}

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

/** semver 비교: a>b → 1, a<b → -1, 같음 → 0 */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split(/[.+-]/)
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const pb = normalizeVersion(b)
    .split(/[.+-]/)
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d > 0) return 1;
    if (d < 0) return -1;
  }
  return 0;
}

/**
 * 비공개 GitHub 릴리스용 토큰.
 * 우선순위: TM_GITHUB_TOKEN → GITHUB_TOKEN → data/github-token.txt
 */
function resolveGithubToken(): string | null {
  const fromEnv =
    process.env.TM_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const filePath = join(DATA_DIR, "github-token.txt");
  try {
    if (!existsSync(filePath)) return null;
    const text = readFileSync(filePath, "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

function resolveFeedUrl(): string | null {
  return process.env.TM_UPDATE_FEED_URL?.trim() || null;
}

function githubHeaders(token: string | null, accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": `tonghab-minwon-info/${getCurrentVersion()}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

type GhRelease = {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string;
  assets?: Array<{
    id?: number;
    name?: string;
    browser_download_url?: string;
    url?: string;
    size?: number;
  }>;
};

type FeedPayload = {
  version?: string;
  name?: string;
  notes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  htmlUrl?: string;
};

function pickPortableAsset(release: GhRelease): {
  name: string;
  /** 브라우저용(공개) 또는 API 자산 URL(비공개+토큰) */
  downloadUrl: string;
} | null {
  const assets = release.assets ?? [];
  const match = assets.find(
    (a) =>
      typeof a.name === "string" &&
      a.name.startsWith(ASSET_PREFIX) &&
      a.name.endsWith(".zip"),
  );
  if (!match?.name) return null;
  const token = resolveGithubToken();
  // 비공개 저장소는 API asset URL + Bearer 가 안정적
  if (token && typeof match.id === "number") {
    return {
      name: match.name,
      downloadUrl: `https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${match.id}`,
    };
  }
  if (typeof match.browser_download_url === "string") {
    return { name: match.name, downloadUrl: match.browser_download_url };
  }
  if (typeof match.url === "string") {
    return { name: match.name, downloadUrl: match.url };
  }
  return null;
}

function clipNotes(body: string | null | undefined, max = 800): string | null {
  if (!body) return null;
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function emptyBase(): UpdateCheckResult {
  return {
    currentVersion: getCurrentVersion(),
    latestVersion: null,
    updateAvailable: false,
    releaseName: null,
    releaseNotes: null,
    publishedAt: null,
    downloadUrl: null,
    htmlUrl: null,
    portable: isPortableInstall(),
    canApply: canApplyUpdate(),
    checkedAt: new Date().toISOString(),
    source: "none",
  };
}

async function checkFromFeed(feedUrl: string): Promise<UpdateCheckResult> {
  const base = emptyBase();
  const res = await fetch(feedUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": `tonghab-minwon-info/${base.currentVersion}`,
    },
  });
  if (!res.ok) {
    return { ...base, source: "feed", error: `업데이트 피드 조회 실패 (${res.status})` };
  }
  const feed = (await res.json()) as FeedPayload;
  const latestVersion = normalizeVersion(feed.version ?? "");
  if (!latestVersion || !feed.downloadUrl) {
    return {
      ...base,
      source: "feed",
      error: "업데이트 피드 형식이 올바르지 않습니다 (version, downloadUrl 필요).",
    };
  }
  return {
    ...base,
    source: "feed",
    latestVersion,
    updateAvailable: compareVersions(latestVersion, base.currentVersion) > 0,
    releaseName: feed.name ?? `v${latestVersion}`,
    releaseNotes: clipNotes(feed.notes),
    publishedAt: feed.publishedAt ?? null,
    downloadUrl: feed.downloadUrl,
    htmlUrl: feed.htmlUrl ?? null,
  };
}

async function checkFromGithub(): Promise<UpdateCheckResult> {
  const base = emptyBase();
  const token = resolveGithubToken();
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: githubHeaders(token, "application/vnd.github+json"),
  });

  if (res.status === 404) {
    return {
      ...base,
      source: "github",
      error: token
        ? "게시된 릴리스가 없거나 저장소/권한을 확인하세요."
        : "릴리스를 찾을 수 없습니다. 비공개 저장소라면 data/github-token.txt 에 읽기 전용 PAT를 넣거나 TM_GITHUB_TOKEN을 설정하세요.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ...base,
      source: "github",
      error: `GitHub 인증 실패 (${res.status}). 토큰 권한(contents:read)을 확인하세요.`,
    };
  }
  if (!res.ok) {
    return {
      ...base,
      source: "github",
      error: `GitHub 조회 실패 (${res.status})`,
    };
  }

  const release = (await res.json()) as GhRelease;
  const latestVersion = normalizeVersion(release.tag_name ?? "");
  if (!latestVersion) {
    return {
      ...base,
      source: "github",
      error: "최신 릴리스 태그를 읽지 못했습니다.",
    };
  }
  const asset = pickPortableAsset(release);
  return {
    ...base,
    source: "github",
    latestVersion,
    updateAvailable: compareVersions(latestVersion, base.currentVersion) > 0,
    releaseName: release.name ?? `v${latestVersion}`,
    releaseNotes: clipNotes(release.body),
    publishedAt: release.published_at ?? null,
    downloadUrl: asset?.downloadUrl ?? null,
    htmlUrl: release.html_url ?? null,
  };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const feedUrl = resolveFeedUrl();
    if (feedUrl) return await checkFromFeed(feedUrl);
    return await checkFromGithub();
  } catch (err) {
    return {
      ...emptyBase(),
      error: err instanceof Error ? err.message : "업데이트 확인 실패",
    };
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const token = resolveGithubToken();
  const isGithubApi =
    url.includes("api.github.com/") && url.includes("/releases/assets/");
  const headers: Record<string, string> = {
    "User-Agent": `tonghab-minwon-info/${getCurrentVersion()}`,
  };
  if (isGithubApi) {
    headers.Accept = "application/octet-stream";
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (token && url.includes("github.com")) {
    headers.Authorization = `Bearer ${token}`;
    headers.Accept = "application/octet-stream";
  }

  const res = await fetch(url, {
    headers,
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw new Error(`다운로드 실패 (${res.status})`);
  }
  await pipeline(res.body, createWriteStream(dest));
}

function expandZipWindows(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const ps = [
    `$ErrorActionPreference='Stop'`,
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
  ].join("; ");
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { stdio: "pipe", encoding: "utf8" },
  );
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || "").toString().trim();
    throw new Error(
      detail
        ? `ZIP 해제 실패: ${detail.slice(0, 400)}`
        : "ZIP 해제 실패 (PowerShell Expand-Archive)",
    );
  }
}

/** ZIP 루트 또는 release-win/ 아래의 포터블 패키지 루트 찾기 */
function findPackageRoot(extractRoot: string): string {
  const marker = join(extractRoot, "server.cjs");
  if (existsSync(marker)) return extractRoot;

  const nested = join(extractRoot, "release-win", "server.cjs");
  if (existsSync(nested)) return join(extractRoot, "release-win");

  const entries = readdirSync(extractRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = join(extractRoot, e.name);
    if (existsSync(join(candidate, "server.cjs"))) return candidate;
    const deeper = join(candidate, "release-win", "server.cjs");
    if (existsSync(deeper)) return join(candidate, "release-win");
  }
  throw new Error("업데이트 ZIP에서 server.cjs를 찾지 못했습니다.");
}

function writeApplyScript(packageRoot: string): void {
  const bat = [
    "@echo off",
    "setlocal",
    `cd /d "${ROOT}"`,
    "echo.",
    "echo [update] Waiting for server to exit...",
    "timeout /t 3 /nobreak >nul",
    "echo [update] Applying files (data folder is kept)...",
    `robocopy "${packageRoot}" "%cd%" /E /NFL /NDL /NJH /NJS /nc /ns /np /XD data updates .cache`,
    "set RC=%ERRORLEVEL%",
    "if %RC% GEQ 8 (",
    "  echo [update] Copy failed. ErrorLevel=%RC%",
    "  pause",
    "  exit /b %RC%",
    ")",
    "echo [update] Restarting...",
    'start "" "%cd%\\my-minwon-server.bat"',
    "endlocal",
    "exit /b 0",
    "",
  ].join("\r\n");
  writeFileSync(APPLY_BAT, bat, "utf8");
}

function launchApplyScript(): void {
  const child = spawn("cmd.exe", ["/c", "start", "", "/min", APPLY_BAT], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

/**
 * 최신 포터블 ZIP을 받아 적용 스크립트를 띄운 뒤 프로세스를 종료한다.
 * data/ 는 유지된다.
 */
export async function applyUpdate(options?: {
  downloadUrl?: string | null;
  targetVersion?: string | null;
}): Promise<UpdateApplyResult> {
  if (!canApplyUpdate()) {
    throw new Error(
      "자동 업데이트는 Windows 포터블 배포에서만 사용할 수 있습니다. 수동으로 ZIP을 받아 data 폴더를 유지한 채 교체하세요.",
    );
  }

  const check = await checkForUpdate();
  if (check.error && !options?.downloadUrl) {
    throw new Error(check.error);
  }
  const downloadUrl = options?.downloadUrl || check.downloadUrl;
  const toVersion =
    options?.targetVersion || check.latestVersion || "(unknown)";
  if (!downloadUrl) {
    throw new Error(
      "다운로드 URL이 없습니다. GitHub Release에 포터블 ZIP이 있는지 확인하세요.",
    );
  }
  if (!check.updateAvailable && !options?.downloadUrl) {
    throw new Error("이미 최신 버전입니다.");
  }

  mkdirSync(UPDATES_DIR, { recursive: true });
  if (existsSync(EXTRACT_DIR)) {
    rmSync(EXTRACT_DIR, { recursive: true, force: true });
  }
  if (existsSync(DOWNLOAD_ZIP)) {
    rmSync(DOWNLOAD_ZIP, { force: true });
  }

  await downloadFile(downloadUrl, DOWNLOAD_ZIP);
  const st = statSync(DOWNLOAD_ZIP);
  if (st.size < 1024) {
    throw new Error("다운로드한 ZIP이 비정상적으로 작습니다.");
  }

  expandZipWindows(DOWNLOAD_ZIP, EXTRACT_DIR);
  const packageRoot = findPackageRoot(EXTRACT_DIR);
  if (!existsSync(join(packageRoot, "server.cjs"))) {
    throw new Error("패키지에 server.cjs가 없습니다.");
  }

  writeApplyScript(packageRoot);
  launchApplyScript();

  const fromVersion = getCurrentVersion();
  setTimeout(() => {
    process.exit(0);
  }, 800);

  return {
    ok: true,
    fromVersion,
    toVersion: normalizeVersion(toVersion),
    message:
      "업데이트를 적용하고 서버를 다시 시작합니다. 잠시 후 브라우저를 새로고침하세요.",
  };
}
