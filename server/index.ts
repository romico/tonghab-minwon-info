import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { initAuditTable, listAuditLogs, writeAudit, clearAuditLogs } from "./audit.ts";
import {
  beginTotpSetup,
  changePassword,
  completeTotpLogin,
  confirmTotpSetup,
  disableTotp,
  getSession,
  getSettings,
  getTotpStatus,
  assertTotpIfEnabled,
  initAuthTables,
  login,
  logout,
  MIN_SESSION_TTL_MINUTES,
  refreshSession,
  revokeOtherSessions,
  updateSettings,
  verifyUserPassword,
  type SessionInfo,
} from "./auth.ts";
import {
  addComplaints,
  complaintExists,
  DB_PATH,
  deleteComplaint,
  getComplaint,
  initDb,
  listComplaints,
  replaceAll,
  resetSeed,
  upsertComplaint,
} from "./db.ts";
import {
  freezeSnapshot,
  getLatestSnapshotForDate,
  getLatestSnapshotsForDates,
  getSnapshotById,
  initSnapshotTable,
  listSnapshots,
} from "./snapshots.ts";
import { getVaultStatus, VaultLockedError } from "./vault.ts";
import {
  applyUpdate,
  checkForUpdate,
  getCurrentVersion,
  getUpdateConfig,
  isPortableInstall,
  saveUpdateConfig,
} from "./update.ts";
import type { Complaint, ComplaintInput } from "../src/schema/index.ts";
import { maskName, maskPhone } from "../src/lib/privacy.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const COOKIE_NAME = "tm_session";
const DIST_DIR = process.env.TM_DIST_DIR ?? join(process.cwd(), "dist");
const SERVE_STATIC =
  process.env.TM_SERVE_STATIC !== "0" && existsSync(join(DIST_DIR, "index.html"));

declare global {
  namespace Express {
    interface Request {
      session?: SessionInfo;
    }
  }
}

initDb();
initAuthTables();
initAuditTable();
initSnapshotTable();

const app = express();
app.use(express.json({ limit: "50mb" }));

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function readToken(req: express.Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME]!;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function clientMeta(req: express.Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const xf = req.headers["x-forwarded-for"];
  const ip =
    (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    null;
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? req.headers["user-agent"]
      : null;
  return { ip, userAgent };
}

function setSessionCookie(res: express.Response, session: SessionInfo): void {
  const maxAge = Math.max(
    60,
    Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
  );
  res.setHeader(
    "Set-Cookie",
    [
      `${COOKIE_NAME}=${encodeURIComponent(session.token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
    ].join("; "),
  );
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const session = getSession(readToken(req));
  if (!session) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  req.session = session;
  next();
}

function auditFromReq(
  req: express.Request,
  input: Parameters<typeof writeAudit>[0],
): void {
  const meta = clientMeta(req);
  writeAudit({
    ...input,
    ip: input.ip ?? meta.ip,
    userAgent: input.userAgent ?? meta.userAgent,
  });
}

function clipText(value: string | null | undefined, max = 40): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "(내용 없음)";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function complaintAuditDetail(item: Complaint) {
  return {
    content: item.content,
    complainantName: maskName(item.complainantName),
    complainantPhone: item.complainantPhone
      ? maskPhone(item.complainantPhone)
      : null,
    fieldCode: item.fieldCode,
    departmentId: item.departmentId,
    processStatus: item.processStatus,
    notifiedAt: item.notifiedAt,
    receivedAt: item.receivedAt,
  };
}

function auditComplaintMutation(
  req: express.Request,
  action: "COMPLAINT_CREATE" | "COMPLAINT_UPDATE" | "COMPLAINT_DELETE",
  item: Complaint,
): void {
  const verb =
    action === "COMPLAINT_CREATE"
      ? "등록"
      : action === "COMPLAINT_UPDATE"
        ? "수정"
        : "삭제";
  auditFromReq(req, {
    userId: req.session!.user.id,
    username: req.session!.user.username,
    action,
    resourceType: "complaint",
    resourceId: item.id,
    summary: `민원 ${verb}: ${clipText(item.content)}`,
    detail: complaintAuditDetail(item),
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: DB_PATH,
    version: getCurrentVersion(),
    portable: isPortableInstall(),
  });
});

app.get("/api/version", (_req, res) => {
  res.json({
    version: getCurrentVersion(),
    portable: isPortableInstall(),
  });
});

app.get("/api/updates/check", requireAuth, async (_req, res) => {
  try {
    const result = await checkForUpdate();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "업데이트 확인 실패",
    });
  }
});

app.get("/api/updates/config", requireAuth, (_req, res) => {
  res.json(getUpdateConfig());
});

app.put("/api/updates/config", requireAuth, (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      feedUrl?: string | null;
      githubToken?: string | null;
      clearGithubToken?: boolean;
    };
    const config = saveUpdateConfig({
      feedUrl: body.feedUrl,
      githubToken: body.githubToken,
      clearGithubToken: body.clearGithubToken === true,
    });
    auditFromReq(req, {
      userId: req.session!.user.id,
      username: req.session!.user.username,
      action: "SETTINGS_UPDATE",
      resourceType: "update_config",
      resourceId: null,
      summary: "업데이트 설정 변경",
      detail: {
        feedUrl: config.feedUrl,
        githubTokenConfigured: config.githubTokenConfigured,
        clearedToken: body.clearGithubToken === true,
      },
    });
    res.json(config);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "업데이트 설정 저장 실패",
    });
  }
});

app.post("/api/updates/apply", requireAuth, async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      downloadUrl?: string;
      targetVersion?: string;
      sha256?: string;
    };
    const result = await applyUpdate({
      downloadUrl: body.downloadUrl,
      targetVersion: body.targetVersion,
      sha256: body.sha256,
    });
    auditFromReq(req, {
      userId: req.session!.user.id,
      username: req.session!.user.username,
      action: "UPDATE_APPLY",
      resourceType: "app",
      resourceId: result.toVersion,
      summary: `앱 업데이트 적용: ${result.fromVersion} → ${result.toVersion}`,
      detail: {
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
        sha256: result.sha256,
      },
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "업데이트 적용 실패",
    });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    res.status(400).json({ error: "아이디와 비밀번호를 입력하세요." });
    return;
  }
  try {
    const result = login(username, password);
    if (result.requiresTotp) {
      auditFromReq(req, {
        username: username.trim(),
        action: "LOGIN_TOTP_REQUIRED",
        summary: `${username.trim()} 2단계 인증 대기`,
      });
      res.json({
        requiresTotp: true,
        challengeToken: result.challengeToken,
        expiresAt: result.expiresAt,
      });
      return;
    }
    setSessionCookie(res, result);
    auditFromReq(req, {
      userId: result.user.id,
      username: result.user.username,
      action: "LOGIN_SUCCESS",
      summary: `${result.user.username} 로그인`,
      detail: { vault: result.vault },
    });
    res.json({
      user: result.user,
      expiresAt: result.expiresAt,
      ttlMinutes: result.ttlMinutes,
      vault: result.vault,
    });
  } catch (err) {
    auditFromReq(req, {
      username: username.trim(),
      action: "LOGIN_FAIL",
      summary: `로그인 실패: ${username.trim()}`,
      detail: {
        reason: err instanceof Error ? err.message : "unknown",
      },
    });
    res.status(401).json({
      error: err instanceof Error ? err.message : "로그인 실패",
    });
  }
});

app.post("/api/auth/login/totp", (req, res) => {
  const { challengeToken, code } = req.body as {
    challengeToken?: string;
    code?: string;
  };
  if (!challengeToken || !code) {
    res.status(400).json({ error: "인증 코드가 필요합니다." });
    return;
  }
  try {
    const result = completeTotpLogin(challengeToken, code);
    setSessionCookie(res, result);
    auditFromReq(req, {
      userId: result.user.id,
      username: result.user.username,
      action: "LOGIN_SUCCESS",
      summary: result.totpReset
        ? `${result.user.username} 로그인(2FA 손상 해제)`
        : `${result.user.username} 로그인(2FA)`,
      detail: {
        vault: result.vault,
        totp: true,
        totpReset: Boolean(result.totpReset),
      },
    });
    res.json({
      user: result.user,
      expiresAt: result.expiresAt,
      ttlMinutes: result.ttlMinutes,
      vault: result.vault,
      totpReset: result.totpReset,
      warning: result.warning,
    });
  } catch (err) {
    auditFromReq(req, {
      action: "LOGIN_FAIL",
      summary: "2단계 인증 실패",
      detail: {
        reason: err instanceof Error ? err.message : "unknown",
      },
    });
    res.status(401).json({
      error: err instanceof Error ? err.message : "2단계 인증 실패",
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const session = getSession(readToken(req));
  logout(readToken(req));
  clearSessionCookie(res);
  if (session) {
    auditFromReq(req, {
      userId: session.user.id,
      username: session.user.username,
      action: "LOGOUT",
      summary: `${session.user.username} 로그아웃`,
    });
  }
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSession(readToken(req));
  if (!session) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  res.json({
    user: session.user,
    expiresAt: session.expiresAt,
    ttlMinutes: session.ttlMinutes,
    vault: getVaultStatus(),
  });
});

app.get("/api/auth/totp", requireAuth, (req, res) => {
  try {
    res.json(getTotpStatus(req.session!.user.id));
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "조회 실패",
    });
  }
});

app.post("/api/auth/totp/setup", requireAuth, async (req, res) => {
  try {
    const setup = await beginTotpSetup(req.session!.user.id);
    auditFromReq(req, {
      userId: req.session!.user.id,
      username: req.session!.user.username,
      action: "TOTP_SETUP_BEGIN",
      summary: "2단계 인증 설정 시작",
    });
    res.json(setup);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "설정 시작 실패",
    });
  }
});

app.post("/api/auth/totp/confirm", requireAuth, (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: "인증 코드를 입력하세요." });
    return;
  }
  try {
    const result = confirmTotpSetup(req.session!.user.id, code);
    auditFromReq(req, {
      userId: req.session!.user.id,
      username: req.session!.user.username,
      action: "TOTP_ENABLED",
      summary: "2단계 인증 활성화",
    });
    res.json({ ok: true, recoveryCodes: result.recoveryCodes });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "활성화 실패",
    });
  }
});

app.post("/api/auth/totp/disable", requireAuth, (req, res) => {
  const { password, code } = req.body as {
    password?: string;
    code?: string;
  };
  if (!password || !code) {
    res.status(400).json({ error: "비밀번호와 인증 코드가 필요합니다." });
    return;
  }
  try {
    disableTotp(req.session!.user.id, password, code);
    auditFromReq(req, {
      userId: req.session!.user.id,
      username: req.session!.user.username,
      action: "TOTP_DISABLED",
      summary: "2단계 인증 비활성화",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "비활성화 실패",
    });
  }
});

app.post("/api/auth/refresh", (req, res) => {
  try {
    const session = refreshSession(readToken(req));
    setSessionCookie(res, session);
    res.json({
      user: session.user,
      expiresAt: session.expiresAt,
      ttlMinutes: session.ttlMinutes,
      vault: getVaultStatus(),
    });
  } catch (err) {
    clearSessionCookie(res);
    res.status(401).json({
      error: err instanceof Error ? err.message : "세션 갱신 실패",
    });
  }
});

app.post("/api/auth/change-password", requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword, totpCode } = req.body as {
      currentPassword?: string;
      newPassword?: string;
      totpCode?: string;
    };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "현재/새 비밀번호를 입력하세요." });
      return;
    }
    changePassword(
      req.session!.user.id,
      currentPassword,
      newPassword,
      totpCode,
    );
    revokeOtherSessions(req.session!.user.id, req.session!.token);
    const session = refreshSession(req.session!.token);
    setSessionCookie(res, session);
    auditFromReq(req, {
      userId: session.user.id,
      username: session.user.username,
      action: "PASSWORD_CHANGE",
      summary: `${session.user.username} 비밀번호 변경`,
    });
    res.json({
      ok: true,
      expiresAt: session.expiresAt,
      ttlMinutes: session.ttlMinutes,
      vault: getVaultStatus(),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "비밀번호 변경 실패",
    });
  }
});

app.get("/api/settings", requireAuth, (req, res) => {
  res.json({
    ...getSettings(),
    minSessionTtlMinutes: MIN_SESSION_TTL_MINUTES,
    vault: getVaultStatus(),
    totp: getTotpStatus(req.session!.user.id),
  });
});

app.put("/api/settings", requireAuth, (req, res) => {
  try {
    const body = req.body as { sessionTtlMinutes?: number };
    const before = getSettings();
    const settings = updateSettings({
      sessionTtlMinutes: Number(body.sessionTtlMinutes),
    });
    const session = refreshSession(req.session!.token);
    setSessionCookie(res, session);
    auditFromReq(req, {
      userId: session.user.id,
      username: session.user.username,
      action: "SETTINGS_UPDATE",
      summary: `세션 유효시간 ${before.sessionTtlMinutes}분 → ${settings.sessionTtlMinutes}분`,
      detail: { before, after: settings },
    });
    res.json({
      ...settings,
      minSessionTtlMinutes: MIN_SESSION_TTL_MINUTES,
      expiresAt: session.expiresAt,
      ttlMinutes: session.ttlMinutes,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "설정 저장 실패",
    });
  }
});

app.get("/api/audit", requireAuth, (req, res) => {
  const result = listAuditLogs({
    limit: Number(req.query.limit ?? 50),
    offset: Number(req.query.offset ?? 0),
    action: typeof req.query.action === "string" ? req.query.action : undefined,
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    username:
      typeof req.query.username === "string" ? req.query.username : undefined,
  });
  res.json(result);
});

function filterByNotifiedPeriod(
  complaints: Complaint[],
  from: string | null,
  to: string | null,
): Complaint[] {
  if (!from && !to) return complaints;
  return complaints.filter((c) => {
    if (!c.notifiedAt) return false;
    if (from && c.notifiedAt < from) return false;
    if (to && c.notifiedAt > to) return false;
    return true;
  });
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get("/api/reports/snapshots", requireAuth, (req, res) => {
  const datesRaw =
    typeof req.query.dates === "string" ? req.query.dates.trim() : "";
  if (datesRaw) {
    const dates = datesRaw
      .split(",")
      .map((d) => d.trim())
      .filter((d) => ISO_DATE_RE.test(d));
    res.json({ byDate: getLatestSnapshotsForDates(dates) });
    return;
  }
  const result = listSnapshots({
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    limit: Number(req.query.limit ?? 50),
    offset: Number(req.query.offset ?? 0),
  });
  res.json(result);
});

app.get("/api/reports/snapshots/latest/:date", requireAuth, (req, res) => {
  const raw = req.params.date;
  const date = Array.isArray(raw) ? raw[0] : raw;
  if (!date || !ISO_DATE_RE.test(date)) {
    res.status(400).json({ error: "보고일 형식이 올바르지 않습니다." });
    return;
  }
  const snap = getLatestSnapshotForDate(date);
  if (!snap) {
    res.status(404).json({ error: "해당 보고일 스냅샷이 없습니다." });
    return;
  }
  res.json({ snapshot: snap });
});

app.get("/api/reports/snapshots/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "잘못된 스냅샷 ID" });
    return;
  }
  const snap = getSnapshotById(id);
  if (!snap) {
    res.status(404).json({ error: "스냅샷을 찾을 수 없습니다." });
    return;
  }
  res.json({ snapshot: snap });
});

app.post("/api/reports/snapshots", requireAuth, (req, res) => {
  const body = req.body as {
    reportDate?: string;
    periodFrom?: string | null;
    periodTo?: string | null;
    note?: string | null;
  };
  const reportDate = body.reportDate ?? "";
  if (!ISO_DATE_RE.test(reportDate)) {
    res.status(400).json({ error: "보고일(reportDate)이 필요합니다." });
    return;
  }
  const periodFrom =
    typeof body.periodFrom === "string" && ISO_DATE_RE.test(body.periodFrom)
      ? body.periodFrom
      : null;
  const periodTo =
    typeof body.periodTo === "string" && ISO_DATE_RE.test(body.periodTo)
      ? body.periodTo
      : null;
  const all = listComplaints();
  const filtered = filterByNotifiedPeriod(all, periodFrom, periodTo);
  const snap = freezeSnapshot({
    reportDate,
    periodFrom,
    periodTo,
    complaints: filtered,
    frozenBy: req.session!.user.username,
    note: typeof body.note === "string" ? body.note : null,
  });
  auditFromReq(req, {
    userId: req.session!.user.id,
    username: req.session!.user.username,
    action: "SNAPSHOT_FREEZE",
    resourceType: "report_snapshot",
    resourceId: String(snap.id),
    summary: `보고 스냅샷 확정 ${reportDate} (${filtered.length}건)`,
    detail: {
      reportDate,
      periodFrom,
      periodTo,
      complaintCount: filtered.length,
      kpi: snap.kpi,
    },
  });
  res.status(201).json({ snapshot: snap });
});

app.get("/api/complaints", requireAuth, (_req, res) => {
  res.json({ complaints: listComplaints() });
});

app.put("/api/complaints", requireAuth, (req, res) => {
  const input = req.body as ComplaintInput;
  const isUpdate = Boolean(input.id && complaintExists(input.id));
  const item = upsertComplaint(input);
  auditComplaintMutation(
    req,
    isUpdate ? "COMPLAINT_UPDATE" : "COMPLAINT_CREATE",
    item,
  );
  res.json({ complaint: item });
});

app.post("/api/complaints", requireAuth, (req, res) => {
  const body = req.body as ComplaintInput | { items: ComplaintInput[] };
  if ("items" in body && Array.isArray(body.items)) {
    const items = addComplaints(body.items);
    auditFromReq(req, {
      userId: req.session!.user.id,
      username: req.session!.user.username,
      action: "COMPLAINT_BATCH_CREATE",
      resourceType: "complaint",
      summary: `민원 일괄등록 ${items.length}건`,
      detail: {
        count: items.length,
        items: items.map((c) => ({
          id: c.id,
          content: clipText(c.content, 60),
          fieldCode: c.fieldCode,
          departmentId: c.departmentId,
        })),
      },
    });
    res.status(201).json({ complaints: items, count: items.length });
    return;
  }
  const input = body as ComplaintInput;
  const isUpdate = Boolean(input.id && complaintExists(input.id));
  const item = upsertComplaint(input);
  auditComplaintMutation(
    req,
    isUpdate ? "COMPLAINT_UPDATE" : "COMPLAINT_CREATE",
    item,
  );
  res.status(201).json({ complaint: item });
});

app.post("/api/complaints/replace", requireAuth, (req, res) => {
  const body = req.body as { complaints?: Complaint[] };
  const items = replaceAll(body.complaints ?? []);
  auditFromReq(req, {
    userId: req.session!.user.id,
    username: req.session!.user.username,
    action: "COMPLAINT_REPLACE",
    resourceType: "complaint",
    summary: `민원 전체교체 ${items.length}건`,
    detail: { count: items.length },
  });
  res.json({ complaints: items, count: items.length });
});

app.post("/api/complaints/reset-seed", requireAuth, (req, res) => {
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const totpCode =
    typeof req.body?.totpCode === "string" ? req.body.totpCode : undefined;
  if (!verifyUserPassword(req.session!.user.id, password)) {
    res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
    return;
  }
  try {
    assertTotpIfEnabled(req.session!.user.id, totpCode);
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : "2단계 인증이 필요합니다.",
    });
    return;
  }
  const items = resetSeed();
  clearAuditLogs();
  auditFromReq(req, {
    userId: req.session!.user.id,
    username: req.session!.user.username,
    action: "COMPLAINT_RESET_SEED",
    resourceType: "complaint",
    summary: `DB 초기화(샘플 복원) ${items.length}건 · 스냅샷·감사로그 초기화`,
    detail: {
      complaintCount: items.length,
      clearedSnapshots: true,
      clearedAuditLogs: true,
    },
  });
  res.json({
    complaints: items,
    count: items.length,
    clearedSnapshots: true,
    clearedAuditLogs: true,
  });
});

app.delete("/api/complaints/:id", requireAuth, (req, res) => {
  const id = String(req.params.id);
  const existing = getComplaint(id);
  if (!existing) {
    res.status(404).json({ error: "민원을 찾을 수 없습니다." });
    return;
  }
  deleteComplaint(id);
  auditComplaintMutation(req, "COMPLAINT_DELETE", existing);
  res.json({ ok: true, id });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API를 찾을 수 없습니다." });
});

if (SERVE_STATIC) {
  app.use(express.static(DIST_DIR, { index: false, fallthrough: true }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(join(DIST_DIR, "index.html"));
  });
}

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof VaultLockedError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "서버 오류",
    });
  },
);

app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`통합민원정보      ${url}`);
  console.log(`DB 파일           ${DB_PATH}`);
  if (SERVE_STATIC) console.log(`정적 파일         ${DIST_DIR}`);
  console.log(`기본 계정         admin / admin`);
});
