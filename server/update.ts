import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  createReadStream,
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
const APPLY_SH = join(UPDATES_DIR, "apply-update.sh");
const DATA_DIR = process.env.TM_DATA_DIR ?? join(ROOT, "data");

/** GitHub owner/repo — 릴리스 조회 대상 */
export const GITHUB_REPO =
  process.env.TM_GITHUB_REPO?.trim() || "romico/tonghab-minwon-info";

const MANIFEST_JSON = "update.json";
const MANIFEST_INI = "update.ini";

const PLATFORM_ASSET_PREFIX: Record<string, string> = {
  "win32-x64": "tonghab-minwon-info-windows-portable-v",
  "linux-x64": "tonghab-minwon-info-linux-portable-v",
  "darwin-arm64": "tonghab-minwon-info-macos-arm64-portable-v",
  "darwin-x64": "tonghab-minwon-info-macos-x64-portable-v",
};

/** 현재 런타임 플랫폼 키 (예: win32-x64, darwin-arm64) */
export function currentPlatformId(): string {
  const arch =
    process.arch === "arm64" || process.arch === "x64" ? process.arch : "x64";
  return `${process.platform}-${arch}`;
}

export function assetPrefixForPlatform(platformId = currentPlatformId()): string {
  return (
    PLATFORM_ASSET_PREFIX[platformId] ??
    PLATFORM_ASSET_PREFIX["win32-x64"]
  );
}

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  downloadUrl: string | null;
  htmlUrl: string | null;
  /** 소문자 hex. 있으면 다운로드 후 검증 */
  sha256: string | null;
  size: number | null;
  portable: boolean;
  canApply: boolean;
  checkedAt: string;
  source: "github" | "feed" | "none";
  feedUrl: string | null;
  error?: string;
};

export type UpdateApplyResult = {
  ok: true;
  fromVersion: string;
  toVersion: string;
  sha256: string | null;
  message: string;
};

export type UpdatePlatformEntry = {
  downloadUrl: string;
  sha256: string | null;
  size: number | null;
  fileName: string | null;
};

export type UpdateManifest = {
  version: string;
  downloadUrl: string;
  sha256: string | null;
  size: number | null;
  name: string | null;
  notes: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  fileName: string | null;
  /** 플랫폼별 ZIP (있으면 현재 OS에 맞는 항목 우선) */
  platforms?: Record<string, UpdatePlatformEntry>;
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

/** runtime/node(.exe) 또는 TM_PORTABLE=1 이면 포터블 배포 */
export function isPortableInstall(): boolean {
  if (process.env.TM_PORTABLE === "1") return true;
  return (
    existsSync(join(ROOT, "runtime", "node.exe")) ||
    existsSync(join(ROOT, "runtime", "node"))
  );
}

/** Windows / Linux / macOS 포터블에서 자동 적용 가능 */
export function canApplyUpdate(): boolean {
  if (!isPortableInstall()) return false;
  return (
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin"
  );
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

function normalizeSha256(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.trim().toLowerCase().replace(/^sha256:/i, "");
  if (!/^[a-f0-9]{64}$/.test(hex)) return null;
  return hex;
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

/** 기본 업데이트 피드 (update.uany.net → Cloudflare Pages) */
export const DEFAULT_UPDATE_FEED_URL =
  process.env.TM_DEFAULT_UPDATE_FEED_URL?.trim() ||
  "https://update.uany.net/tonghab-minwon-info/update.json";

function readPackageUpdateFeedUrl(): string | null {
  const candidates = [
    join(ROOT, "package.json"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(readFileSync(path, "utf8")) as {
        updateFeedUrl?: string;
        tmUpdateFeedUrl?: string;
      };
      const url = (pkg.updateFeedUrl ?? pkg.tmUpdateFeedUrl)?.trim();
      if (url) return url;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * 업데이트 매니페스트 URL.
 * TM_UPDATE_FEED_URL → data/update-feed.url(선택 덮어쓰기) → package.json#updateFeedUrl → 기본값
 */
export function resolveFeedUrl(): string | null {
  const fromEnv = process.env.TM_UPDATE_FEED_URL?.trim();
  if (fromEnv) return fromEnv;
  const filePath = join(DATA_DIR, "update-feed.url");
  try {
    if (existsSync(filePath)) {
      const text = readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#"));
      if (text) return text;
    }
  } catch {
    /* fall through */
  }
  return readPackageUpdateFeedUrl() || DEFAULT_UPDATE_FEED_URL;
}

const FEED_URL_FILE = () => join(DATA_DIR, "update-feed.url");
const GITHUB_TOKEN_FILE = () => join(DATA_DIR, "github-token.txt");

export type UpdateConfig = {
  feedUrl: string | null;
  feedUrlFromEnv: boolean;
  githubTokenConfigured: boolean;
  githubTokenFromEnv: boolean;
  githubTokenHint: string | null;
};

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function getUpdateConfig(): UpdateConfig {
  const envFeed = process.env.TM_UPDATE_FEED_URL?.trim() || null;
  const envToken =
    process.env.TM_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
  const fileFeed = (() => {
    try {
      if (!existsSync(FEED_URL_FILE())) return null;
      return (
        readFileSync(FEED_URL_FILE(), "utf8")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith("#")) || null
      );
    } catch {
      return null;
    }
  })();
  const fileToken = (() => {
    try {
      if (!existsSync(GITHUB_TOKEN_FILE())) return null;
      return readFileSync(GITHUB_TOKEN_FILE(), "utf8").trim() || null;
    } catch {
      return null;
    }
  })();
  const effectiveToken = envToken || fileToken;
  return {
    feedUrl: envFeed || fileFeed || DEFAULT_UPDATE_FEED_URL,
    feedUrlFromEnv: Boolean(envFeed),
    githubTokenConfigured: Boolean(effectiveToken),
    githubTokenFromEnv: Boolean(envToken),
    githubTokenHint: effectiveToken ? maskToken(effectiveToken) : null,
  };
}

export function saveUpdateConfig(input: {
  feedUrl?: string | null;
  githubToken?: string | null;
  clearGithubToken?: boolean;
}): UpdateConfig {
  mkdirSync(DATA_DIR, { recursive: true });

  if (input.feedUrl !== undefined) {
    const url = (input.feedUrl ?? "").trim();
    if (!url) {
      if (existsSync(FEED_URL_FILE())) rmSync(FEED_URL_FILE(), { force: true });
    } else {
      if (!/^https?:\/\//i.test(url) && !url.startsWith("file:")) {
        throw new Error("피드 URL은 http(s):// 로 시작해야 합니다.");
      }
      writeFileSync(FEED_URL_FILE(), `${url}\n`, "utf8");
    }
  }

  if (input.clearGithubToken) {
    if (existsSync(GITHUB_TOKEN_FILE())) {
      rmSync(GITHUB_TOKEN_FILE(), { force: true });
    }
  } else if (input.githubToken !== undefined && input.githubToken !== null) {
    const token = input.githubToken.trim();
    if (!token) {
      if (existsSync(GITHUB_TOKEN_FILE())) {
        rmSync(GITHUB_TOKEN_FILE(), { force: true });
      }
    } else {
      writeFileSync(GITHUB_TOKEN_FILE(), `${token}\n`, "utf8");
    }
  }

  return getUpdateConfig();
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
    sha256: null,
    size: null,
    portable: isPortableInstall(),
    canApply: canApplyUpdate(),
    checkedAt: new Date().toISOString(),
    source: "none",
    feedUrl: resolveFeedUrl(),
  };
}

function resultFromManifest(
  base: UpdateCheckResult,
  manifest: UpdateManifest,
  source: "github" | "feed",
): UpdateCheckResult {
  return {
    ...base,
    source,
    latestVersion: manifest.version,
    updateAvailable: compareVersions(manifest.version, base.currentVersion) > 0,
    releaseName: manifest.name ?? `v${manifest.version}`,
    releaseNotes: clipNotes(manifest.notes),
    publishedAt: manifest.publishedAt,
    downloadUrl: manifest.downloadUrl,
    htmlUrl: manifest.htmlUrl,
    sha256: manifest.sha256,
    size: manifest.size,
  };
}

/** update.ini / version.ini 스타일 파서 */
export function parseUpdateIni(text: string): UpdateManifest {
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    const value = trimmed.slice(idx + 1).trim();
    if (key) map[key] = value;
  }
  return normalizeManifest({
    version: map.version ?? map.ver,
    name: map.name ?? map.title,
    notes: map.notes ?? map.releasenotes ?? map.description,
    publishedAt: map.publishedat ?? map.date,
    downloadUrl: map.url ?? map.downloadurl ?? map.download,
    htmlUrl: map.htmlurl ?? map.page,
    sha256: map.sha256 ?? map.hash ?? map.checksum ?? map.md5,
    size: map.size,
    fileName: map.filename ?? map.file,
  });
}

export function parseUpdateJson(raw: unknown): UpdateManifest {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const platformsRaw = obj.platforms;
  let platforms: Record<string, UpdatePlatformEntry> | undefined;
  if (platformsRaw && typeof platformsRaw === "object") {
    platforms = {};
    for (const [key, val] of Object.entries(
      platformsRaw as Record<string, unknown>,
    )) {
      if (!val || typeof val !== "object") continue;
      const p = val as Record<string, unknown>;
      const downloadUrl = str(p.downloadUrl ?? p.url)?.trim();
      if (!downloadUrl) continue;
      let size: number | null = null;
      if (typeof p.size === "number" && Number.isFinite(p.size)) size = p.size;
      else if (typeof p.size === "string" && p.size.trim()) {
        const n = Number(p.size.trim());
        if (Number.isFinite(n)) size = n;
      }
      platforms[key] = {
        downloadUrl,
        sha256: normalizeSha256(str(p.sha256 ?? p.hash)),
        size,
        fileName: str(p.fileName ?? p.filename)?.trim() || null,
      };
    }
    if (Object.keys(platforms).length === 0) platforms = undefined;
  }

  const base = normalizeManifest({
    version: str(obj.version),
    name: str(obj.name),
    notes: str(obj.notes ?? obj.releaseNotes),
    publishedAt: str(obj.publishedAt ?? obj.published_at),
    downloadUrl: str(obj.downloadUrl ?? obj.url ?? obj.download_url),
    htmlUrl: str(obj.htmlUrl ?? obj.html_url),
    sha256: str(obj.sha256 ?? obj.hash ?? obj.checksum),
    size: obj.size,
    fileName: str(obj.fileName ?? obj.filename ?? obj.file),
  });

  return pickManifestForPlatform({ ...base, platforms });
}

/** 현재 OS에 맞는 platforms 항목이 있으면 최상위 downloadUrl/sha256 등을 덮어쓴다 */
export function pickManifestForPlatform(
  manifest: UpdateManifest,
  platformId = currentPlatformId(),
): UpdateManifest {
  const map = manifest.platforms;
  if (map && Object.keys(map).length > 0) {
    const entry = map[platformId];
    if (!entry) {
      throw new Error(
        `이 플랫폼(${platformId})용 업데이트 패키지가 없습니다.`,
      );
    }
    return {
      ...manifest,
      downloadUrl: entry.downloadUrl,
      sha256: entry.sha256 ?? manifest.sha256,
      size: entry.size ?? manifest.size,
      fileName: entry.fileName ?? manifest.fileName,
    };
  }
  // 레거시 단일 피드(Windows ZIP만)
  if (platformId !== "win32-x64") {
    throw new Error(
      "이 업데이트 피드에는 Windows 패키지만 있습니다. 관리자에게 최신 멀티플랫폼 피드를 요청하세요.",
    );
  }
  return manifest;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function normalizeManifest(input: {
  version?: string;
  name?: string;
  notes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  htmlUrl?: string;
  sha256?: string;
  size?: unknown;
  fileName?: string;
}): UpdateManifest {
  const version = normalizeVersion(input.version ?? "");
  const downloadUrl = (input.downloadUrl ?? "").trim();
  if (!version) {
    throw new Error("매니페스트에 version 이 없습니다.");
  }
  if (!downloadUrl) {
    throw new Error("매니페스트에 downloadUrl(또는 url) 이 없습니다.");
  }
  let size: number | null = null;
  if (typeof input.size === "number" && Number.isFinite(input.size)) {
    size = input.size;
  } else if (typeof input.size === "string" && input.size.trim()) {
    const n = Number(input.size.trim());
    if (Number.isFinite(n)) size = n;
  }
  // ini 의 md5 필드는 32자 — sha256만 인정
  const sha256 = normalizeSha256(input.sha256);
  return {
    version,
    downloadUrl,
    sha256,
    size,
    name: input.name?.trim() || null,
    notes: input.notes?.trim() || null,
    publishedAt: input.publishedAt?.trim() || null,
    htmlUrl: input.htmlUrl?.trim() || null,
    fileName: input.fileName?.trim() || null,
  };
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: true; text: string; contentType: string } | { ok: false; status: number }> {
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) return { ok: false, status: res.status };
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  return { ok: true, text, contentType };
}

function looksLikeIni(url: string, contentType: string, text: string): boolean {
  if (/\.ini(\?|$)/i.test(url)) return true;
  if (/ini/i.test(contentType)) return true;
  const head = text.slice(0, 200).trimStart();
  return head.startsWith("[") || /^version\s*=/im.test(head);
}

export async function loadManifestFromUrl(
  feedUrl: string,
  headers?: Record<string, string>,
): Promise<UpdateManifest> {
  const fetched = await fetchText(feedUrl, {
    Accept: "application/json, text/plain, */*",
    "User-Agent": `tonghab-minwon-info/${getCurrentVersion()}`,
    ...(headers ?? {}),
  });
  if (!fetched.ok) {
    throw new Error(`업데이트 피드 조회 실패 (${fetched.status})`);
  }
  if (looksLikeIni(feedUrl, fetched.contentType, fetched.text)) {
    return parseUpdateIni(fetched.text);
  }
  try {
    return parseUpdateJson(JSON.parse(fetched.text) as unknown);
  } catch {
    // JSON 실패 시 ini 재시도
    return parseUpdateIni(fetched.text);
  }
}

async function checkFromFeed(feedUrl: string): Promise<UpdateCheckResult> {
  const base = emptyBase();
  try {
    const manifest = await loadManifestFromUrl(feedUrl);
    return resultFromManifest(base, manifest, "feed");
  } catch (err) {
    return {
      ...base,
      source: "feed",
      error: err instanceof Error ? err.message : "피드 확인 실패",
    };
  }
}

function pickAsset(
  release: GhRelease,
  predicate: (name: string) => boolean,
): { id: number; name: string; apiUrl: string; browserUrl: string | null; size: number | null } | null {
  const token = resolveGithubToken();
  for (const a of release.assets ?? []) {
    if (typeof a.name !== "string" || !predicate(a.name)) continue;
    if (typeof a.id !== "number") continue;
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${a.id}`;
    return {
      id: a.id,
      name: a.name,
      apiUrl: token ? apiUrl : a.browser_download_url || apiUrl,
      browserUrl: a.browser_download_url ?? null,
      size: typeof a.size === "number" ? a.size : null,
    };
  }
  return null;
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
        ? "업데이트를 확인할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요."
        : "업데이트를 확인할 수 없습니다. 네트워크 연결을 확인하거나 관리자에게 문의하세요.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ...base,
      source: "github",
      error: `업데이트 서버 인증에 실패했습니다. 관리자에게 문의하세요.`,
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

  const zip = pickAsset(
    release,
    (name) =>
      name.startsWith(assetPrefixForPlatform()) && name.endsWith(".zip"),
  );
  const manifestAsset = pickAsset(
    release,
    (name) =>
      name === MANIFEST_JSON ||
      name === MANIFEST_INI ||
      name.endsWith(`-v${latestVersion}.json`),
  );

  let sha256: string | null = null;
  let size: number | null = zip?.size ?? null;
  let downloadUrl = zip?.apiUrl ?? null;
  let notes = clipNotes(release.body);
  let name = release.name ?? `v${latestVersion}`;

  if (manifestAsset) {
    try {
      const manifest = await loadManifestFromUrl(
        manifestAsset.apiUrl,
        githubHeaders(token, "application/octet-stream"),
      );
      sha256 = manifest.sha256;
      if (manifest.size != null) size = manifest.size;
      if (manifest.downloadUrl) downloadUrl = manifest.downloadUrl;
      if (manifest.notes) notes = clipNotes(manifest.notes);
      if (manifest.name) name = manifest.name;
    } catch {
      /* zip 정보만으로 진행 */
    }
  }

  // 비공개 + 토큰이면 ZIP도 API asset URL 유지
  if (token && zip) {
    downloadUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${zip.id}`;
  }

  return {
    ...base,
    source: "github",
    latestVersion,
    updateAvailable: compareVersions(latestVersion, base.currentVersion) > 0,
    releaseName: name,
    releaseNotes: notes,
    publishedAt: release.published_at ?? null,
    downloadUrl,
    htmlUrl: release.html_url ?? null,
    sha256,
    size,
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

async function verifyDownload(options: {
  expectedSha256: string | null;
  expectedSize: number | null;
  requireChecksum: boolean;
}): Promise<string> {
  const st = statSync(DOWNLOAD_ZIP);
  if (st.size < 1024) {
    throw new Error("다운로드한 ZIP이 비정상적으로 작습니다.");
  }
  if (options.expectedSize != null && st.size !== options.expectedSize) {
    throw new Error(
      `파일 크기 불일치: 예상 ${options.expectedSize}바이트, 실제 ${st.size}바이트`,
    );
  }
  const actual = await sha256File(DOWNLOAD_ZIP);
  if (options.expectedSha256) {
    if (actual !== options.expectedSha256) {
      throw new Error(
        `SHA-256 불일치: 파일이 손상되었거나 위변조되었을 수 있습니다.\n예상 ${options.expectedSha256}\n실제 ${actual}`,
      );
    }
  } else if (options.requireChecksum) {
    throw new Error("체크섬(sha256) 없이 업데이트를 적용할 수 없습니다.");
  }
  return actual;
}

function expandZip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    const ps = [
      `$ErrorActionPreference='Stop'`,
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ].join("; ");
    const r = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        ps,
      ],
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
    return;
  }

  const r = spawnSync("unzip", ["-q", "-o", zipPath, "-d", destDir], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || "").toString().trim();
    throw new Error(
      detail
        ? `ZIP 해제 실패: ${detail.slice(0, 400)}`
        : "ZIP 해제 실패 (unzip)",
    );
  }
}

/** ZIP 루트 또는 release-* 폴더 아래의 포터블 패키지 루트 찾기 */
function findPackageRoot(extractRoot: string): string {
  const marker = join(extractRoot, "server.cjs");
  if (existsSync(marker)) return extractRoot;

  const nestedNames = [
    "release-win",
    "release-linux",
    "release-mac-arm64",
    "release-mac-x64",
  ];
  for (const name of nestedNames) {
    const nested = join(extractRoot, name, "server.cjs");
    if (existsSync(nested)) return join(extractRoot, name);
  }

  const entries = readdirSync(extractRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = join(extractRoot, e.name);
    if (existsSync(join(candidate, "server.cjs"))) return candidate;
    for (const name of nestedNames) {
      const deeper = join(candidate, name, "server.cjs");
      if (existsSync(deeper)) return join(candidate, name);
    }
  }
  throw new Error("업데이트 ZIP에서 server.cjs를 찾지 못했습니다.");
}

function writeApplyScriptWindows(packageRoot: string): void {
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

function writeApplyScriptUnix(packageRoot: string): void {
  const sh = `#!/usr/bin/env bash
set -euo pipefail
cd "${ROOT}"
echo
echo "[update] Waiting for server to exit..."
sleep 2
echo "[update] Applying files (data folder is kept)..."
SRC="${packageRoot}"
# rsync 우선, 없으면 find+cp
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \\
    --exclude data --exclude updates --exclude .cache \\
    "$SRC"/ ./
else
  while IFS= read -r -d '' f; do
    rel="\${f#"$SRC"/}"
    case "$rel" in
      data|data/*|updates|updates/*|.cache|.cache/*) continue ;;
    esac
    mkdir -p "$(dirname "$rel")"
    cp -a "$f" "$rel"
  done < <(find "$SRC" -type f -print0)
fi
chmod +x runtime/node my-minwon-server.sh 2>/dev/null || true
echo "[update] Restarting..."
nohup ./my-minwon-server.sh >/dev/null 2>&1 &
exit 0
`;
  writeFileSync(APPLY_SH, sh, "utf8");
  chmodSync(APPLY_SH, 0o755);
}

function launchApplyScript(): void {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", "/min", APPLY_BAT], {
      cwd: ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const child = spawn("bash", [APPLY_SH], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/**
 * 최신 포터블 ZIP을 받아 체크섬 검증 후 적용 스크립트를 띄우고 프로세스를 종료한다.
 * data/ 는 유지된다.
 */
export async function applyUpdate(options?: {
  downloadUrl?: string | null;
  targetVersion?: string | null;
  sha256?: string | null;
}): Promise<UpdateApplyResult> {
  if (!canApplyUpdate()) {
    throw new Error(
      "자동 업데이트는 포터블 배포(Windows / Linux / macOS)에서만 사용할 수 있습니다. 수동으로 ZIP을 받아 data 폴더를 유지한 채 교체하세요.",
    );
  }

  const check = await checkForUpdate();
  if (check.error && !options?.downloadUrl) {
    throw new Error(check.error);
  }
  const downloadUrl = options?.downloadUrl || check.downloadUrl;
  const toVersion =
    options?.targetVersion || check.latestVersion || "(unknown)";
  const expectedSha256 =
    normalizeSha256(options?.sha256) || check.sha256;
  if (!downloadUrl) {
    throw new Error(
      "다운로드 URL이 없습니다. update.json 피드 또는 GitHub Release를 확인하세요.",
    );
  }
  if (!check.updateAvailable && !options?.downloadUrl) {
    throw new Error("이미 최신 버전입니다.");
  }

  const requireChecksum = check.source === "feed" || Boolean(expectedSha256);

  mkdirSync(UPDATES_DIR, { recursive: true });
  if (existsSync(EXTRACT_DIR)) {
    rmSync(EXTRACT_DIR, { recursive: true, force: true });
  }
  if (existsSync(DOWNLOAD_ZIP)) {
    rmSync(DOWNLOAD_ZIP, { force: true });
  }

  await downloadFile(downloadUrl, DOWNLOAD_ZIP);
  const actualSha256 = await verifyDownload({
    expectedSha256,
    expectedSize: check.size,
    requireChecksum,
  });

  expandZip(DOWNLOAD_ZIP, EXTRACT_DIR);
  const packageRoot = findPackageRoot(EXTRACT_DIR);
  if (!existsSync(join(packageRoot, "server.cjs"))) {
    throw new Error("패키지에 server.cjs가 없습니다.");
  }

  if (process.platform === "win32") {
    writeApplyScriptWindows(packageRoot);
  } else {
    writeApplyScriptUnix(packageRoot);
  }
  launchApplyScript();

  const fromVersion = getCurrentVersion();
  setTimeout(() => {
    process.exit(0);
  }, 800);

  return {
    ok: true,
    fromVersion,
    toVersion: normalizeVersion(toVersion),
    sha256: actualSha256,
    message:
      "업데이트를 적용하고 서버를 다시 시작합니다. 잠시 후 화면이 새로고침됩니다.",
  };
}
