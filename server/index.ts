import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { initAuditTable, listAuditLogs, writeAudit } from "./audit.ts";
import {
  changePassword,
  getSession,
  getSettings,
  initAuthTables,
  login,
  logout,
  MIN_SESSION_TTL_MINUTES,
  refreshSession,
  revokeOtherSessions,
  updateSettings,
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
import type { Complaint, ComplaintInput } from "../src/schema/index.ts";

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
    complainantName: item.complainantName,
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
  res.json({ ok: true, db: DB_PATH });
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
    const session = login(username, password);
    setSessionCookie(res, session);
    auditFromReq(req, {
      userId: session.user.id,
      username: session.user.username,
      action: "LOGIN_SUCCESS",
      summary: `${session.user.username} 로그인`,
    });
    res.json({
      user: session.user,
      expiresAt: session.expiresAt,
      ttlMinutes: session.ttlMinutes,
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
  });
});

app.post("/api/auth/refresh", (req, res) => {
  try {
    const session = refreshSession(readToken(req));
    setSessionCookie(res, session);
    res.json({
      user: session.user,
      expiresAt: session.expiresAt,
      ttlMinutes: session.ttlMinutes,
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
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "현재/새 비밀번호를 입력하세요." });
      return;
    }
    changePassword(req.session!.user.id, currentPassword, newPassword);
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
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "비밀번호 변경 실패",
    });
  }
});

app.get("/api/settings", requireAuth, (_req, res) => {
  res.json({
    ...getSettings(),
    minSessionTtlMinutes: MIN_SESSION_TTL_MINUTES,
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
  const items = resetSeed();
  auditFromReq(req, {
    userId: req.session!.user.id,
    username: req.session!.user.username,
    action: "COMPLAINT_RESET_SEED",
    resourceType: "complaint",
    summary: `샘플 데이터 복원 ${items.length}건`,
  });
  res.json({ complaints: items, count: items.length });
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
