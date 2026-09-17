#!/usr/bin/env node
/**
 * Windows 포터블 배포 패키지 생성
 * - Node.js win-x64 런타임 내장 → PC에 Node 설치 불필요
 * - 시작.bat 더블클릭으로 실행
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
const outDir = join(root, "release-win");
const cacheDir = join(root, ".cache");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const APP_VERSION = String(pkg.version ?? "0.0.0");

/** Node 22 LTS win-x64 (포터블) */
const NODE_VERSION = process.env.TM_NODE_VERSION ?? "22.18.0";
const NODE_ZIP = `node-v${NODE_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}`;

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

function unzip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const r = spawnSync("unzip", ["-q", "-o", zipPath, "-d", destDir], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    // Windows / unzip 없을 때 ditto (mac) 시도
    const d = spawnSync("ditto", ["-x", "-k", zipPath, destDir], {
      stdio: "inherit",
    });
    if (d.status !== 0) {
      throw new Error("ZIP 해제 실패 (unzip 또는 ditto 필요)");
    }
  }
}

function findExtractedNodeDir(extractRoot) {
  const entries = readdirSync(extractRoot, { withFileTypes: true });
  const dir = entries.find(
    (e) => e.isDirectory() && e.name.startsWith("node-v") && e.name.includes("win"),
  );
  if (!dir) throw new Error(`Node 폴더를 찾지 못함: ${extractRoot}`);
  return join(extractRoot, dir.name);
}

console.log("1/5 프론트엔드 빌드…");
run("npm", ["run", "build"]);

console.log("2/5 release-win 폴더 준비…");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "data"), { recursive: true });
mkdirSync(join(outDir, "runtime"), { recursive: true });
writeFileSync(
  join(outDir, "data", "README.txt"),
  "이 폴더에 tonghab-minwon.db 가 자동 생성됩니다. 백업 시 이 폴더를 복사하세요.\n\n업데이트: 배포본에 GitHub 읽기 토큰이 포함되어 있으면 설정에서 바로 확인할 수 있습니다.\n토큰이 없으면 data\\github-token.txt 또는 data\\update-feed.url 을 추가하세요.\n",
  "utf8",
);

/** 비공개 릴리스 조회용 — CI secrets.TM_UPDATE_GITHUB_TOKEN 등으로 주입 */
const embedToken = (
  process.env.TM_UPDATE_GITHUB_TOKEN?.trim() ||
  process.env.TM_GITHUB_TOKEN?.trim() ||
  ""
);
if (embedToken) {
  writeFileSync(join(outDir, "data", "github-token.txt"), `${embedToken}\n`, "utf8");
  console.log("  data/github-token.txt 포함 (업데이트용)");
}

console.log("3/5 Windows Node 런타임 준비…");
const zipPath = join(cacheDir, NODE_ZIP);
const extractTmp = join(cacheDir, `extract-${NODE_VERSION}`);
await download(NODE_URL, zipPath);
rmSync(extractTmp, { recursive: true, force: true });
unzip(zipPath, extractTmp);
const nodeHome = findExtractedNodeDir(extractTmp);
cpSync(join(nodeHome, "node.exe"), join(outDir, "runtime", "node.exe"));
writeFileSync(
  join(outDir, "runtime", "VERSION.txt"),
  `Node.js ${NODE_VERSION} win-x64 (nodejs.org 공식 바이너리)\n`,
  "utf8",
);

console.log("4/5 서버 번들…");
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, "server", "index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: join(outDir, "server.cjs"),
  packages: "bundle",
  external: ["node:sqlite"],
  logLevel: "info",
});

console.log("5/5 앱 파일·실행 스크립트…");
cpSync(join(root, "dist"), join(outDir, "dist"), { recursive: true });

// ASCII-only + Windows ANSI (latin1) — avoid Hangul / UTF-8 mojibake on some PCs
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

writeFileSync(
  join(outDir, "사용방법.txt"),
  `통합민원정보 — Windows 포터블 실행 안내
========================================

■ 특징
  - Node.js 설치 불필요 (runtime\\node.exe 내장)
  - USB·공유폴더에 복사해 그대로 실행 가능
  - 64비트 Windows 전용

■ 실행 방법
  1. ZIP을 원하는 위치에 압축 해제합니다.
  2. "my-minwon-server.bat" 을 더블클릭합니다.
  3. 브라우저에서 admin / admin 으로 로그인합니다.
  4. 종료: 콘솔 창에서 Ctrl+C

■ 데이터
  - data\\tonghab-minwon.db 에 저장됩니다.
  - 폴더 전체를 복사하면 데이터도 함께 이동합니다.

■ 업데이트
  - 설정 → "버전 및 업데이트"에서 확인·적용합니다 (SHA-256 검증, data 폴더 유지).
  - 공식 배포 ZIP에는 업데이트용 읽기 토큰이 포함되어 별도 설정이 필요 없습니다.
  - 사내 피드 사용 시: data\\update-feed.url 에 update.json 주소를 넣으세요.
  - 수동 시: 새 ZIP 해제 후 data 폴더를 그대로 옮기세요.

■ 포트 변경
  - my-minwon-server.bat 의 set PORT=8787 값을 수정하세요.

■ 문제 해결
  - SmartScreen 경고: "추가 정보" → "실행"
  - 포트 충돌: PORT 변경 또는 다른 프로그램 종료
  - 브라우저 미실행: http://127.0.0.1:8787 직접 접속
`,
  "utf8",
);

writeFileSync(
  join(outDir, "package.json"),
  `${JSON.stringify(
    {
      name: "tonghab-minwon-info-portable",
      private: true,
      version: APP_VERSION,
      type: "module",
      description: "Windows portable — run my-minwon-server.bat",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const zipName = `tonghab-minwon-info-windows-portable-v${APP_VERSION}.zip`;
const zipOut = join(root, zipName);
if (existsSync(zipOut)) rmSync(zipOut);
const zip = spawnSync("zip", ["-r", "-q", zipOut, "release-win"], {
  cwd: root,
  stdio: "inherit",
});
if (zip.status === 0) {
  const zipStat = statSync(zipOut);
  const sha256 = createHash("sha256").update(readFileSync(zipOut)).digest("hex");
  const publishedAt = new Date().toISOString();
  const downloadBase = (process.env.TM_UPDATE_DOWNLOAD_BASE ?? "").replace(/\/$/, "");
  const downloadUrl =
    process.env.TM_UPDATE_DOWNLOAD_URL?.trim() ||
    (downloadBase
      ? `${downloadBase}/${zipName}`
      : `https://github.com/romico/tonghab-minwon-info/releases/download/v${APP_VERSION}/${zipName}`);

  const manifest = {
    version: APP_VERSION,
    name: `v${APP_VERSION}`,
    notes: process.env.TM_UPDATE_NOTES?.trim() || "",
    publishedAt,
    downloadUrl,
    url: downloadUrl,
    sha256,
    size: zipStat.size,
    fileName: zipName,
    htmlUrl: `https://github.com/romico/tonghab-minwon-info/releases/tag/v${APP_VERSION}`,
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

  console.log(`\n완료(포터블): ${outDir}`);
  console.log(`ZIP: ${zipOut}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`매니페스트: ${updateJsonPath}`);
  console.log(`매니페스트: ${updateIniPath}`);
} else if (process.env.CI) {
  console.error("zip 명령 실패 — CI에서는 ZIP 생성이 필수입니다.");
  process.exit(zip.status ?? 1);
} else {
  console.log(`\n완료(포터블): ${outDir}`);
  console.log("zip 명령 없음 — release-win 폴더를 직접 압축해 배포하세요.");
}
