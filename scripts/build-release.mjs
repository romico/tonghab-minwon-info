#!/usr/bin/env node
/**
 * 포터블 배포 패키지 생성 (Windows / Linux / macOS)
 * - Node.js 런타임 내장 → PC에 Node 설치 불필요
 * - 사용: node scripts/build-release.mjs [--platform win32-x64|linux-x64|darwin-arm64|darwin-x64]
 *         node scripts/build-release.mjs --all
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
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
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".cache");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const APP_VERSION = String(pkg.version ?? "0.0.0");
const NODE_VERSION = process.env.TM_NODE_VERSION ?? "22.18.0";

const DEFAULT_FEED =
  process.env.TM_UPDATE_FEED_URL?.trim() ||
  "https://update.uany.net/tonghab-minwon-info/update.json";
const WORKER_BASE =
  process.env.TM_UPDATE_DOWNLOAD_BASE?.trim() ||
  "https://tonghab-update-download.romico-ccb.workers.dev/download";
/** GitHub Release 태그 — CI 태그 빌드 시 TM_RELEASE_TAG=vX.Y.Z 로 맞춤 */
const RELEASE_TAG =
  process.env.TM_RELEASE_TAG?.trim() || `v${APP_VERSION}`;

/** @typedef {{ id: string, label: string, nodeArchive: string, nodeDirHint: string, nodeBinary: string, outDirName: string, zipName: (v: string) => string, assetPrefix: string, launcher: string }} PlatformDef */

/** @type {Record<string, PlatformDef>} */
const PLATFORMS = {
  "win32-x64": {
    id: "win32-x64",
    label: "Windows x64",
    nodeArchive: `node-v${NODE_VERSION}-win-x64.zip`,
    nodeDirHint: "win",
    nodeBinary: "node.exe",
    outDirName: "release-win",
    zipName: (v) => `tonghab-minwon-info-windows-portable-v${v}.zip`,
    assetPrefix: "tonghab-minwon-info-windows-portable-v",
    launcher: "bat",
  },
  "linux-x64": {
    id: "linux-x64",
    label: "Linux x64",
    nodeArchive: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
    nodeDirHint: "linux",
    nodeBinary: "node",
    outDirName: "release-linux",
    zipName: (v) => `tonghab-minwon-info-linux-portable-v${v}.zip`,
    assetPrefix: "tonghab-minwon-info-linux-portable-v",
    launcher: "sh",
  },
  "darwin-arm64": {
    id: "darwin-arm64",
    label: "macOS Apple Silicon",
    nodeArchive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    nodeDirHint: "darwin",
    nodeBinary: "node",
    outDirName: "release-mac-arm64",
    zipName: (v) => `tonghab-minwon-info-macos-arm64-portable-v${v}.zip`,
    assetPrefix: "tonghab-minwon-info-macos-arm64-portable-v",
    launcher: "sh",
  },
  "darwin-x64": {
    id: "darwin-x64",
    label: "macOS Intel",
    nodeArchive: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    nodeDirHint: "darwin",
    nodeBinary: "node",
    outDirName: "release-mac-x64",
    zipName: (v) => `tonghab-minwon-info-macos-x64-portable-v${v}.zip`,
    assetPrefix: "tonghab-minwon-info-macos-x64-portable-v",
    launcher: "sh",
  },
};

function parseArgs(argv) {
  const all = argv.includes("--all");
  const idx = argv.indexOf("--platform");
  const platformArg =
    idx >= 0
      ? argv[idx + 1]
      : process.env.TM_PLATFORM?.trim() || null;
  if (all) return Object.keys(PLATFORMS);
  if (platformArg) {
    if (!PLATFORMS[platformArg]) {
      console.error(
        `알 수 없는 플랫폼: ${platformArg}\n가능: ${Object.keys(PLATFORMS).join(", ")}`,
      );
      process.exit(1);
    }
    return [platformArg];
  }
  return ["win32-x64"];
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`  캐시 사용: ${dest}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`  다운로드: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`다운로드 실패: ${res.status} ${url}`);
  }
  await pipeline(res.body, createWriteStream(dest));
}

function extractArchive(archivePath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (archivePath.endsWith(".zip")) {
    const r = spawnSync("unzip", ["-q", "-o", archivePath, "-d", destDir], {
      stdio: "inherit",
    });
    if (r.status !== 0) {
      const d = spawnSync("ditto", ["-x", "-k", archivePath, destDir], {
        stdio: "inherit",
      });
      if (d.status !== 0) {
        throw new Error("ZIP 해제 실패 (unzip 또는 ditto 필요)");
      }
    }
    return;
  }
  const r = spawnSync("tar", ["-xf", archivePath, "-C", destDir], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(`tar 해제 실패: ${archivePath}`);
  }
}

function findExtractedNodeDir(extractRoot, hint) {
  const entries = readdirSync(extractRoot, { withFileTypes: true });
  const dir = entries.find(
    (e) =>
      e.isDirectory() &&
      e.name.startsWith("node-v") &&
      e.name.includes(hint),
  );
  if (!dir) throw new Error(`Node 폴더를 찾지 못함: ${extractRoot}`);
  return join(extractRoot, dir.name);
}

function writeBatLauncher(outDir) {
  const batBody = [
    "@echo off",
    "cd /d \"%~dp0\"",
    "",
    "set \"NODE_EXE=%~dp0runtime\\node.exe\"",
    "if not exist \"%NODE_EXE%\" (",
    "  echo.",
    "  echo [ERROR] runtime\\node.exe not found.",
    "  echo         Re-extract the portable ZIP and try again.",
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "set NODE_ENV=production",
    "set PORT=8787",
    "set HOST=127.0.0.1",
    "set TM_PORTABLE=1",
    "",
    "echo.",
    "echo ========================================",
    "echo  Tonghab Minwon Info (portable)",
    "echo  http://127.0.0.1:8787",
    "echo  login: admin / admin",
    "echo  stop:  Ctrl+C in this window",
    "echo ========================================",
    "echo.",
    "",
    "start \"\" \"http://127.0.0.1:8787\"",
    "\"%NODE_EXE%\" --experimental-sqlite server.cjs",
    "set EXITCODE=%ERRORLEVEL%",
    "if not %EXITCODE%==0 (",
    "  echo.",
    "  echo Server exited with error code %EXITCODE%.",
    "  pause",
    ")",
    "exit /b %EXITCODE%",
    "",
  ].join("\r\n");
  writeFileSync(join(outDir, "my-minwon-server.bat"), batBody, "latin1");
}

function writeShLauncher(outDir) {
  const sh = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

NODE_BIN="$(pwd)/runtime/node"
if [[ ! -x "$NODE_BIN" ]]; then
  echo "[ERROR] runtime/node not found or not executable."
  echo "        Re-extract the portable ZIP and try again."
  exit 1
fi

export NODE_ENV=production
export PORT="\${PORT:-8787}"
export HOST="\${HOST:-127.0.0.1}"
export TM_PORTABLE=1

echo
echo "========================================"
echo " Tonghab Minwon Info (portable)"
echo " http://\${HOST}:\${PORT}"
echo " login: admin / admin"
echo " stop:  Ctrl+C"
echo "========================================"
echo

if command -v open >/dev/null 2>&1; then
  open "http://\${HOST}:\${PORT}" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://\${HOST}:\${PORT}" >/dev/null 2>&1 || true
fi

exec "$NODE_BIN" --experimental-sqlite server.cjs
`;
  const path = join(outDir, "my-minwon-server.sh");
  writeFileSync(path, sh, "utf8");
  chmodSync(path, 0o755);
}

function writeUsage(outDir, plat) {
  const isWin = plat.launcher === "bat";
  const launcher = isWin ? "my-minwon-server.bat" : "./my-minwon-server.sh";
  const nodeHint = isWin ? "runtime\\node.exe" : "runtime/node";
  writeFileSync(
    join(outDir, "readme.txt"),
    `통합민원정보 — ${plat.label} 포터블 실행 안내
========================================

■ 특징
  - Node.js 설치 불필요 (${nodeHint} 내장)
  - USB·공유폴더에 복사해 그대로 실행 가능
  - ${plat.label} 전용

■ 실행 방법
  1. ZIP을 원하는 위치에 압축 해제합니다.
  2. "${launcher}" 를 실행합니다.
  3. 브라우저에서 admin / admin 으로 로그인합니다.
     · 초기 계정은 설정에서 변경하세요.
     · 로그인 시 개인정보 DB 암호화가 잠금 해제됩니다.
  4. 종료: 콘솔에서 Ctrl+C

■ 데이터
  - data/tonghab-minwon.db 에 저장됩니다.
  - data/archives/ 에 관리연도·분기 아카이브가 보관됩니다.
  - 백업·이전 시 data 폴더 전체(archives 포함)를 복사하세요.
  - 설정 화면에서 「아카이브 전환」「보관본 복원·삭제」를 사용할 수 있습니다.

■ 업데이트
  - 설정 → "버전 및 업데이트"에서 확인·적용합니다.
  - 피드: package.json 의 updateFeedUrl (update.uany.net)

■ 포트 변경
  - 실행 전 PORT=9000 ${launcher} 형태로 지정하거나
    스크립트 안의 PORT 기본값을 수정하세요.
`,
    "utf8",
  );
}

function downloadUrlFor(platformId) {
  const override = process.env.TM_UPDATE_DOWNLOAD_URL?.trim();
  if (override) return override;
  return `${WORKER_BASE}?tag=${encodeURIComponent(RELEASE_TAG)}&platform=${encodeURIComponent(platformId)}`;
}

/**
 * @param {PlatformDef} plat
 * @param {{ serverBuilt: boolean }} shared
 */
async function buildPlatform(plat, shared) {
  const outDir = join(root, plat.outDirName);
  console.log(`\n── ${plat.label} (${plat.id}) ──`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "data"), { recursive: true });
  mkdirSync(join(outDir, "runtime"), { recursive: true });
  writeFileSync(
    join(outDir, "data", "README.txt"),
    "이 폴더에 tonghab-minwon.db 가 자동 생성됩니다.\n\n" +
      "백업 시 이 폴더 전체(archives 포함)를 복사하세요.\n" +
      "- tonghab-minwon.db : 현재 활성 DB\n" +
      "- archives/ : 관리연도·분기 아카이브 보관본\n",
    "utf8",
  );

  const archivePath = join(cacheDir, plat.nodeArchive);
  const extractTmp = join(cacheDir, `extract-${plat.id}-${NODE_VERSION}`);
  await download(
    `https://nodejs.org/dist/v${NODE_VERSION}/${plat.nodeArchive}`,
    archivePath,
  );
  rmSync(extractTmp, { recursive: true, force: true });
  extractArchive(archivePath, extractTmp);
  const nodeHome = findExtractedNodeDir(extractTmp, plat.nodeDirHint);
  const srcBin = join(nodeHome, "bin", plat.nodeBinary);
  const srcRoot = join(nodeHome, plat.nodeBinary);
  const nodeSrc = existsSync(srcBin) ? srcBin : srcRoot;
  if (!existsSync(nodeSrc)) {
    throw new Error(`Node 바이너리 없음: ${nodeSrc}`);
  }
  const nodeDest = join(outDir, "runtime", plat.nodeBinary);
  cpSync(nodeSrc, nodeDest);
  if (plat.launcher === "sh") chmodSync(nodeDest, 0o755);
  writeFileSync(
    join(outDir, "runtime", "VERSION.txt"),
    `Node.js ${NODE_VERSION} ${plat.id} (nodejs.org)\n`,
    "utf8",
  );

  if (!shared.serverBuilt) {
    console.log("서버 번들…");
    await esbuild.build({
      absWorkingDir: root,
      entryPoints: [join(root, "server", "index.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      outfile: join(cacheDir, "server.cjs"),
      packages: "bundle",
      external: ["node:sqlite"],
      logLevel: "info",
    });
    shared.serverBuilt = true;
  }
  cpSync(join(cacheDir, "server.cjs"), join(outDir, "server.cjs"));
  cpSync(join(root, "dist"), join(outDir, "dist"), { recursive: true });

  if (plat.launcher === "bat") writeBatLauncher(outDir);
  else writeShLauncher(outDir);
  writeUsage(outDir, plat);

  writeFileSync(
    join(outDir, "package.json"),
    `${JSON.stringify(
      {
        name: "tonghab-minwon-info-portable",
        private: true,
        version: APP_VERSION,
        type: "module",
        description: `${plat.label} portable`,
        platform: plat.id,
        updateFeedUrl: DEFAULT_FEED,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const zipName = plat.zipName(APP_VERSION);
  const zipOut = join(root, zipName);
  if (existsSync(zipOut)) rmSync(zipOut);
  const zip = spawnSync("zip", ["-r", "-q", zipOut, plat.outDirName], {
    cwd: root,
    stdio: "inherit",
  });
  if (zip.status !== 0) {
    if (process.env.CI) {
      console.error("zip 명령 실패 — CI에서는 ZIP 생성이 필수입니다.");
      process.exit(zip.status ?? 1);
    }
    console.log(`zip 없음 — ${outDir} 폴더를 직접 압축하세요.`);
    return null;
  }

  const zipStat = statSync(zipOut);
  const sha256 = createHash("sha256").update(readFileSync(zipOut)).digest("hex");
  console.log(`ZIP: ${zipOut}`);
  console.log(`SHA-256: ${sha256}`);

  return {
    platform: plat.id,
    fileName: zipName,
    sha256,
    size: zipStat.size,
    downloadUrl: downloadUrlFor(plat.id),
    assetPrefix: plat.assetPrefix,
  };
}

const targets = parseArgs(process.argv.slice(2));
console.log(`포터블 빌드 대상: ${targets.join(", ")} (v${APP_VERSION})`);

console.log("1/N 프론트엔드 빌드…");
run("npm", ["run", "build"]);

const shared = { serverBuilt: false };
/** @type {Record<string, { downloadUrl: string, sha256: string, size: number, fileName: string }>} */
const platformsManifest = {};
let primary = null;

for (const id of targets) {
  const result = await buildPlatform(PLATFORMS[id], shared);
  if (!result) continue;
  platformsManifest[id] = {
    downloadUrl: result.downloadUrl,
    sha256: result.sha256,
    size: result.size,
    fileName: result.fileName,
  };
  if (!primary || id === "win32-x64") primary = result;
}

if (!primary) {
  console.log("\n매니페스트 생략 (ZIP 없음)");
  process.exit(0);
}

const publishedAt = new Date().toISOString();
const manifest = {
  version: APP_VERSION,
  name: `v${APP_VERSION}`,
  notes: process.env.TM_UPDATE_NOTES?.trim() || "",
  publishedAt,
  // 하위 호환: 최상위는 Windows(또는 단일 빌드) 기본값
  downloadUrl: primary.downloadUrl,
  url: primary.downloadUrl,
  sha256: primary.sha256,
  size: primary.size,
  fileName: primary.fileName,
  htmlUrl: `https://github.com/romico/tonghab-minwon-info/releases/tag/${RELEASE_TAG}`,
  platforms: platformsManifest,
};

const updateJsonPath = join(root, "update.json");
const updateIniPath = join(root, "update.ini");
writeFileSync(updateJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(
  updateIniPath,
  [
    "[Update]",
    `Version=${manifest.version}`,
    `Name=${manifest.name}`,
    `URL=${manifest.downloadUrl}`,
    `SHA256=${manifest.sha256}`,
    `Size=${manifest.size}`,
    `FileName=${manifest.fileName}`,
    `PublishedAt=${manifest.publishedAt}`,
    `HtmlUrl=${manifest.htmlUrl}`,
    `Notes=${manifest.notes.replace(/\r?\n/g, " ")}`,
    "",
  ].join("\r\n"),
  "utf8",
);

console.log(`\n완료 — 매니페스트: ${updateJsonPath}`);
console.log(`플랫폼: ${Object.keys(platformsManifest).join(", ")}`);
