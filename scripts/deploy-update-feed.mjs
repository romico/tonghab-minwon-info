#!/usr/bin/env node
/**
 * update.json 만 Cloudflare Pages(uany-update)에 배포
 * 경로: /tonghab-minwon-info/update.json
 * 기본 URL: https://uany-update.pages.dev/tonghab-minwon-info/update.json
 * (커스텀) https://update.uany.net/tonghab-minwon-info/update.json
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const project = process.env.TM_UPDATE_PROJECT?.trim() || "tonghab-minwon-info";
const pagesProject = process.env.TM_PAGES_PROJECT?.trim() || "uany-update";
const srcJson = join(root, "update.json");
const siteDir = join(root, "update-site");
const destDir = join(siteDir, project);
const destJson = join(destDir, "update.json");

if (!existsSync(srcJson)) {
  console.error("update.json 이 없습니다. 먼저 npm run release:win 을 실행하세요.");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(srcJson, destJson);
writeFileSync(join(siteDir, "_ok.txt"), "ok\n", "utf8");

const manifest = JSON.parse(readFileSync(destJson, "utf8"));
console.log(`배포 준비: ${project}/update.json (v${manifest.version})`);

const r = spawnSync(
  "npx",
  [
    "wrangler",
    "pages",
    "deploy",
    siteDir,
    "--project-name",
    pagesProject,
    "--commit-dirty=true",
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (r.status !== 0) process.exit(r.status ?? 1);

console.log(`피드: https://update.uany.net/${project}/update.json`);
console.log(`(또는) https://${pagesProject}.pages.dev/${project}/update.json`);
