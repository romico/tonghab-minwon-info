#!/usr/bin/env node
/**
 * 포터블 배포 패키지 생성 (Windows / Linux / macOS)
 * - Node.js 런타임 내장 → PC에 Node 설치 불필요
 * - 사용: node scripts/build-release.mjs [--platform win32-x64|linux-x64|darwin-arm64|darwin-x64]
 *         node scripts/build-release.mjs --all
 *         node scripts/build-release.mjs --launchers-only   # 런처·readme만 갱신
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
    "setlocal EnableExtensions EnableDelayedExpansion",
    "cd /d \"%~dp0\"",
    "chcp 65001 >nul 2>&1",
    "",
    "set \"NODE_EXE=%~dp0runtime\\node.exe\"",
    "set \"PID_FILE=%~dp0data\\server.pid\"",
    "set \"LOG_FILE=%~dp0data\\server.log\"",
    "set \"ROOT=%~dp0\"",
    "",
    "if not exist \"%NODE_EXE%\" (",
    "  echo.",
    "  echo [ERROR] runtime\\node.exe not found.",
    "  echo         Re-extract the portable ZIP and try again.",
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "if not exist \"%~dp0data\" mkdir \"%~dp0data\"",
    "",
    "set NODE_ENV=production",
    "if not defined PORT set PORT=8787",
    "if not defined HOST set HOST=127.0.0.1",
    "set TM_PORTABLE=1",
    "",
    ":menu",
    "cls",
    "call :status",
    "echo ========================================",
    "echo  통합민원정보 (portable)",
    "echo  http://%HOST%:%PORT%",
    "echo  상태: !STATUS_TEXT!",
    "echo ========================================",
    "echo.",
    "echo   1^) 실행",
    "echo   2^) 중지",
    "echo   3^) 재실행",
    "echo   4^) 강제종료",
    "echo   5^) 종료",
    "echo.",
    "set \"CHOICE=\"",
    "set /p \"CHOICE=선택 [1-5]: \"",
    "if \"!CHOICE!\"==\"1\" goto do_start",
    "if \"!CHOICE!\"==\"2\" goto do_stop",
    "if \"!CHOICE!\"==\"3\" goto do_restart",
    "if \"!CHOICE!\"==\"4\" goto do_force",
    "if \"!CHOICE!\"==\"5\" goto do_exit",
    "echo.",
    "echo 잘못된 선택입니다.",
    "timeout /t 1 >nul",
    "goto menu",
    "",
    ":do_start",
    "call :start_server",
    "echo.",
    "pause",
    "goto menu",
    "",
    ":do_stop",
    "call :stop_server 0",
    "echo.",
    "pause",
    "goto menu",
    "",
    ":do_restart",
    "call :stop_server 0",
    "timeout /t 1 >nul",
    "call :start_server",
    "echo.",
    "pause",
    "goto menu",
    "",
    ":do_force",
    "call :stop_server 1",
    "echo.",
    "pause",
    "goto menu",
    "",
    ":do_exit",
    "echo.",
    "echo 메뉴를 종료합니다. (서버는 별도로 중지하지 않습니다)",
    "echo.",
    "endlocal",
    "exit /b 0",
    "",
    ":status",
    "set \"STATUS_TEXT=중지됨\"",
    "set \"SERVER_PID=\"",
    "if exist \"%PID_FILE%\" (",
    "  set /p SERVER_PID=<\"%PID_FILE%\"",
    "  if defined SERVER_PID (",
    "    tasklist /FI \"PID eq !SERVER_PID!\" 2>nul | findstr /I \"!SERVER_PID!\" >nul",
    "    if not errorlevel 1 (",
    "      set \"STATUS_TEXT=실행 중 (PID !SERVER_PID!)\"",
    "      exit /b 0",
    "    )",
    "  )",
    "  del /f /q \"%PID_FILE%\" >nul 2>&1",
    ")",
    "for /f \"tokens=5\" %%P in ('netstat -ano 2^>nul ^| findstr /R /C\":%PORT% .*LISTENING\"') do (",
    "  set \"STATUS_TEXT=실행 중 (포트 %PORT% / PID %%P)\"",
    "  set \"SERVER_PID=%%P\"",
    "  exit /b 0",
    ")",
    "exit /b 1",
    "",
    ":start_server",
    "call :status",
    "if not errorlevel 1 (",
    "  echo 이미 실행 중입니다. !STATUS_TEXT!",
    "  exit /b 0",
    ")",
    "echo 서버를 시작합니다...",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$p = Start-Process -FilePath '%NODE_EXE%' -ArgumentList '--experimental-sqlite','server.cjs' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $p.Id -Encoding ascii\"",
    "if errorlevel 1 (",
    "  echo [ERROR] 서버 기동에 실패했습니다.",
    "  exit /b 1",
    ")",
    "timeout /t 1 >nul",
    "call :status",
    "if errorlevel 1 (",
    "  echo [ERROR] 프로세스가 바로 종료되었습니다. data\\server.log 를 확인하세요.",
    "  exit /b 1",
    ")",
    "echo 시작됨: !STATUS_TEXT!",
    "echo URL: http://%HOST%:%PORT%",
    "start \"\" \"http://%HOST%:%PORT%\"",
    "exit /b 0",
    "",
    ":stop_server",
    "set \"FORCE=%~1\"",
    "if \"!FORCE!\"==\"1\" (",
    "  echo 강제 종료합니다. ^(PID·포트·고아 프로세스^)",
    "  call :kill_orphans",
    "  del /f /q \"%PID_FILE%\" >nul 2>&1",
    "  echo 중지되었습니다.",
    "  exit /b 0",
    ")",
    "call :status",
    "if errorlevel 1 (",
    "  echo 실행 중인 서버가 없습니다.",
    "  del /f /q \"%PID_FILE%\" >nul 2>&1",
    "  exit /b 0",
    ")",
    "echo 중지합니다...",
    "if defined SERVER_PID (",
    "  taskkill /PID !SERVER_PID! >nul 2>&1",
    "  timeout /t 2 >nul",
    "  tasklist /FI \"PID eq !SERVER_PID!\" 2>nul | findstr /I \"!SERVER_PID!\" >nul",
    "  if not errorlevel 1 taskkill /PID !SERVER_PID! /F /T >nul 2>&1",
    ") else (",
    "  for /f \"tokens=5\" %%P in ('netstat -ano 2^>nul ^| findstr /R /C\":%PORT% .*LISTENING\"') do taskkill /PID %%P >nul 2>&1",
    ")",
    "del /f /q \"%PID_FILE%\" >nul 2>&1",
    "echo 중지되었습니다.",
    "exit /b 0",
    "",
    ":kill_orphans",
    "if exist \"%PID_FILE%\" (",
    "  set /p SERVER_PID=<\"%PID_FILE%\"",
    "  if defined SERVER_PID taskkill /PID !SERVER_PID! /F /T >nul 2>&1",
    ")",
    "for /f \"tokens=5\" %%P in ('netstat -ano 2^>nul ^| findstr /R /C\":%PORT% .*LISTENING\"') do (",
    "  echo  - 포트 %PORT% 리스너 종료: PID %%P",
    "  taskkill /PID %%P /F /T >nul 2>&1",
    ")",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command ^\"$ErrorActionPreference='SilentlyContinue'; $root=(Resolve-Path -LiteralPath '.').Path; $port=[int]$env:PORT; if(-not $port){$port=%PORT%}; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and $_.CommandLine -match 'server\\.cjs' } | ForEach-Object { Write-Host (' - orphan PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }; try { Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object { Write-Host (' - port PID ' + $_.OwningProcess); Stop-Process -Id $_.OwningProcess -Force } } catch {}\"",
    "exit /b 0",
    "",
  ].join("\r\n");
  writeFileSync(
    join(outDir, "my-minwon-server.bat"),
    `\ufeff${batBody}`,
    "utf8",
  );
}

function writeShLauncher(outDir) {
  const sh = `#!/usr/bin/env bash
cd "$(dirname "$0")"

NODE_BIN="$(pwd)/runtime/node"
PID_FILE="$(pwd)/data/server.pid"
LOG_FILE="$(pwd)/data/server.log"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "[ERROR] runtime/node not found or not executable."
  echo "        Re-extract the portable ZIP and try again."
  exit 1
fi

mkdir -p data

export NODE_ENV=production
export PORT="\${PORT:-8787}"
export HOST="\${HOST:-127.0.0.1}"
export TM_PORTABLE=1

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  if command -v lsof >/dev/null 2>&1; then
    local p
    p="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
    if [[ -n "$p" ]]; then
      echo "$p"
      return 0
    fi
  fi
  local orphan
  orphan="$(find_orphan_pids | head -n 1 || true)"
  if [[ -n "$orphan" ]]; then
    echo "$orphan"
    return 0
  fi
  return 1
}

find_orphan_pids() {
  local root cmd pid
  root="$(pwd)"
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "${root}/server\\.cjs" 2>/dev/null || true
    pgrep -f "server\\.cjs" 2>/dev/null | while read -r pid; do
      [[ -z "$pid" ]] && continue
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      case "$cmd" in
        *"${root}/"*server.cjs*|*"${root}/runtime/node"*) echo "$pid" ;;
      esac
    done
    return 0
  fi
  ps -ax -o pid=,command= 2>/dev/null | while read -r pid cmd; do
    case "$cmd" in
      *"${root}/server.cjs"*|*"${root}/runtime/node"*"server.cjs"*) echo "$pid" ;;
    esac
  done
}

status_text() {
  local pid
  if pid="$(is_running)"; then
    echo "실행 중 (PID $pid)"
  else
    echo "중지됨"
  fi
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "http://\${HOST}:\${PORT}" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://\${HOST}:\${PORT}" >/dev/null 2>&1 || true
  fi
}

start_server() {
  local pid
  if pid="$(is_running)"; then
    echo "이미 실행 중입니다. (PID $pid)"
    return 0
  fi
  echo "서버를 시작합니다..."
  nohup "$NODE_BIN" --experimental-sqlite server.cjs >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 1
  if pid="$(is_running)"; then
    echo "시작됨: PID $pid"
    echo "URL: http://\${HOST}:\${PORT}"
    echo "로그: $LOG_FILE"
    open_browser
  else
    echo "[ERROR] 프로세스가 바로 종료되었습니다. $LOG_FILE 을 확인하세요."
    rm -f "$PID_FILE"
    return 1
  fi
}

kill_orphans() {
  local pid p
  if [[ -f "$PID_FILE" ]]; then
    pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      echo " - PID 파일 프로세스 종료: $pid"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  if command -v lsof >/dev/null 2>&1; then
    for p in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true); do
      echo " - 포트 $PORT 리스너 종료: PID $p"
      kill -KILL "$p" 2>/dev/null || true
    done
  fi
  for p in $(find_orphan_pids | sort -u); do
    if kill -0 "$p" 2>/dev/null; then
      echo " - 고아 프로세스 종료: PID $p"
      kill -KILL "$p" 2>/dev/null || true
    fi
  done
}

stop_server() {
  local force="\${1:-0}"
  local pid
  if [[ "$force" == "1" ]]; then
    echo "강제 종료합니다. (PID·포트·고아 프로세스)"
    kill_orphans
    rm -f "$PID_FILE"
    echo "중지되었습니다."
    return 0
  fi
  if ! pid="$(is_running)"; then
    echo "실행 중인 서버가 없습니다."
    rm -f "$PID_FILE"
    return 0
  fi
  echo "중지합니다... (PID $pid)"
  kill -TERM "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.4
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "응답이 없어 강제 종료합니다..."
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "중지되었습니다."
}

while true; do
  clear 2>/dev/null || true
  echo "========================================"
  echo " 통합민원정보 (portable)"
  echo " http://\${HOST}:\${PORT}"
  echo " 상태: $(status_text)"
  echo "========================================"
  echo
  echo "  1) 실행"
  echo "  2) 중지"
  echo "  3) 재실행"
  echo "  4) 강제종료"
  echo "  5) 종료"
  echo
  read -r -p "선택 [1-5]: " choice
  echo
  case "$choice" in
    1) start_server ;;
    2) stop_server 0 ;;
    3)
      stop_server 0
      sleep 0.5
      start_server
      ;;
    4) stop_server 1 ;;
    5)
      echo "메뉴를 종료합니다. (서버는 별도로 중지하지 않습니다)"
      exit 0
      ;;
    *) echo "잘못된 선택입니다." ;;
  esac
  echo
  read -r -p "Enter 키를 누르면 메뉴로 돌아갑니다..." _
done
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
  2. "${launcher}" 를 실행합니다. (메뉴 TUI)
  3. 메뉴에서 1) 실행 → 브라우저에서 admin / admin 으로 로그인합니다.
     · 초기 계정은 설정에서 변경하세요.
     · 로그인 시 개인정보 DB 암호화가 잠금 해제됩니다.
  4. 메뉴: 1 실행 / 2 중지 / 3 재실행 / 4 강제종료(고아 프로세스 포함) / 5 종료

■ 데이터
  - data/tonghab-minwon.db 에 저장됩니다.
  - data/archives/ 에 관리연도·분기 아카이브가 보관됩니다.
  - data/server.pid · data/server.log 는 런처가 관리합니다.
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

if (process.argv.includes("--launchers-only")) {
  const ids = process.argv.includes("--platform")
    ? targets
    : Object.keys(PLATFORMS);
  for (const id of ids) {
    const plat = PLATFORMS[id];
    if (!plat) continue;
    const outDir = join(root, plat.outDirName);
    if (!existsSync(outDir)) {
      console.log(`skip ${plat.outDirName} (폴더 없음)`);
      continue;
    }
    mkdirSync(join(outDir, "data"), { recursive: true });
    if (plat.launcher === "bat") writeBatLauncher(outDir);
    else writeShLauncher(outDir);
    writeUsage(outDir, plat);
    console.log(`launchers → ${plat.outDirName}`);
  }
  process.exit(0);
}

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
