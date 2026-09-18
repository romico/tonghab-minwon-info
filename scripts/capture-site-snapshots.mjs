#!/usr/bin/env node
/**
 * docs/site-snapshots 전체 페이지(fullPage) PNG 갱신.
 * - 개인정보: ?docsSnapshot=1 → 마스킹 강제, 「보기」토글 숨김
 * - 기본 계정 최초 비밀번호 변경 후 캡처
 *
 * 사전: API(9000) + Vite(5173) 기동
 *   TM_DATA_DIR=/tmp/tm-snap PORT=9000 npm run start:api
 *   npm run dev:web
 *
 * 실행: npm run capture:site-snapshots
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "site-snapshots");
const baseUrl = process.env.TM_SNAPSHOT_BASE_URL?.trim() || "http://localhost:5173";
const user = process.env.TM_SNAPSHOT_USER?.trim() || "admin";
const initialPass = process.env.TM_SNAPSHOT_PASS_INITIAL?.trim() || "admin";
const newPass = process.env.TM_SNAPSHOT_PASS?.trim() || "snap-demo-2026";
const periodFrom = process.env.TM_SNAPSHOT_FROM?.trim() || "2026-03-01";
const periodTo = process.env.TM_SNAPSHOT_TO?.trim() || "2026-09-18";

mkdirSync(outDir, { recursive: true });

const shots = [
  { file: "00-login.png", path: "/login", beforeLogin: true },
  { file: "01-dashboard.png", path: "/" },
  { file: "02-ledger.png", path: "/ledger" },
  {
    file: "02b-ledger-register.png",
    path: "/ledger",
    after: async (page) => {
      await page.getByRole("heading", { name: "관리대장" }).waitFor({
        timeout: 15_000,
      });
      const btn = page.locator("button.btn-primary", { hasText: "민원 등록" });
      await btn.waitFor({ state: "visible", timeout: 15_000 });
      await btn.click();
      await page.getByRole("heading", { name: "민원 등록" }).waitFor({
        timeout: 10_000,
      });
    },
  },
  { file: "03-departments.png", path: "/departments" },
  { file: "04-summary.png", path: "/summary" },
  { file: "05-daily.png", path: "/daily" },
  { file: "06-audit.png", path: "/audit" },
  { file: "07-settings.png", path: "/settings" },
];

async function waitSettled(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

async function ensureLoggedIn(page) {
  await page.goto(`${baseUrl}/login?docsSnapshot=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => {
    sessionStorage.setItem("tm-docs-snapshot", "1");
    document.body.classList.add("docs-snapshot");
  });

  const onForceChange = async () =>
    (await page.getByRole("heading", { name: "비밀번호 변경 필수" }).count()) > 0;
  const onAppShell = async () =>
    (await page.locator("nav, .sidebar, .app-shell, a[href='/ledger']").count()) > 0;

  if (!(await page.getByRole("button", { name: "로그인" }).count())) {
    if (await onForceChange()) await changePassword(page, initialPass);
    return;
  }

  const tryLogin = async (password) => {
    await page.locator('input[autocomplete="username"]').fill(user);
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.getByRole("button", { name: "로그인" }).click();
    await page
      .getByRole("heading", { name: "비밀번호 변경 필수" })
      .or(page.locator("a[href='/ledger'], a[href=\"/ledger\"]"))
      .or(page.locator(".login-error"))
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await waitSettled(page);
  };

  await tryLogin(initialPass);
  if (
    (await page.getByRole("button", { name: "로그인" }).count()) &&
    !(await onForceChange())
  ) {
    await tryLogin(newPass);
  }

  if (await onForceChange()) {
    await changePassword(page, initialPass);
  }

  if (await onForceChange() || (await page.getByRole("button", { name: "로그인" }).count())) {
    const err = await page.locator(".login-error").textContent().catch(() => "");
    throw new Error(`로그인 실패: ${page.url()} ${err || ""}`.trim());
  }
}

async function changePassword(page, currentPassword) {
  await page.locator('input[autocomplete="current-password"]').fill(currentPassword);
  await page.locator('input[autocomplete="new-password"]').nth(0).fill(newPass);
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(newPass);
  await page.getByRole("button", { name: /비밀번호 변경/ }).click();
  await page
    .locator("a[href='/ledger'], a[href=\"/ledger\"], .main, .page-header")
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await waitSettled(page);
  if (await page.getByRole("heading", { name: "비밀번호 변경 필수" }).count()) {
    throw new Error("비밀번호 변경 후에도 강제 변경 화면이 남아 있습니다.");
  }
}

async function setPeriod(page) {
  const from = page.locator('input[type="date"][title="처리부서 통보일 시작"]');
  const to = page.locator('input[type="date"][title="처리부서 통보일 종료"]');
  if ((await from.count()) && (await to.count())) {
    await from.fill(periodFrom);
    await to.fill(periodTo);
    await waitSettled(page);
  }
}

async function shot(page, file) {
  const path = join(outDir, file);
  await page.screenshot({ path, fullPage: true, type: "png" });
  console.log(`  ✓ ${file}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log(`base=${baseUrl}`);
  console.log(`out=${outDir}`);
  console.log("docsSnapshot=1 (PII masked), fullPage=true");

  // Login page (before auth)
  await page.goto(`${baseUrl}/login?docsSnapshot=1`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => {
    sessionStorage.setItem("tm-docs-snapshot", "1");
    document.body.classList.add("docs-snapshot");
  });
  await waitSettled(page);
  await shot(page, "00-login.png");

  await ensureLoggedIn(page);
  await page.goto(`${baseUrl}/?docsSnapshot=1`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    sessionStorage.setItem("tm-docs-snapshot", "1");
    document.body.classList.add("docs-snapshot");
  });
  await setPeriod(page);

  for (const step of shots) {
    if (step.beforeLogin) continue;
    await page.goto(`${baseUrl}${step.path}?docsSnapshot=1`, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => {
      sessionStorage.setItem("tm-docs-snapshot", "1");
      document.body.classList.add("docs-snapshot");
    });
    await setPeriod(page);
    if (step.after) await step.after(page);
    await waitSettled(page);
    // never click PII reveal
    if ((await page.locator(".pii-toggle").count()) > 0) {
      // should be hidden via CSS; assert not visible
      const visible = await page.locator(".pii-toggle:visible").count();
      if (visible > 0) {
        throw new Error(`PII 보기 버튼이 보입니다 (${step.file})`);
      }
    }
    await shot(page, step.file);
  }

  const meta = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    fullPage: true,
    docsSnapshot: true,
    piiMasked: true,
    periodFrom,
    periodTo,
    files: shots.map((s) => s.file),
  };
  writeFileSync(join(outDir, "capture-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log("done");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
