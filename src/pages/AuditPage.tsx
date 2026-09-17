import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { apiListAuditLogs } from "@/api/audit";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
  type AuditLog,
} from "@/api/auditTypes";

const PAGE_SIZE = 50;

const ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABELS) as Array<
  [AuditAction, string]
>;

function actionTone(action: AuditAction): string {
  if (
    action === "LOGIN_FAIL" ||
    action === "COMPLAINT_DELETE" ||
    action === "COMPLAINT_RESET_SEED"
  ) {
    return "danger";
  }
  if (action === "LOGIN_SUCCESS" || action === "COMPLAINT_CREATE") return "ok";
  if (
    action === "LOGIN_TOTP_REQUIRED" ||
    action === "PASSWORD_CHANGE" ||
    action === "SETTINGS_UPDATE" ||
    action === "TOTP_SETUP_BEGIN" ||
    action === "TOTP_ENABLED" ||
    action === "TOTP_DISABLED"
  ) {
    return "warn";
  }
  if (
    action === "COMPLAINT_UPDATE" ||
    action === "COMPLAINT_BATCH_CREATE" ||
    action === "COMPLAINT_REPLACE" ||
    action === "SNAPSHOT_FREEZE" ||
    action === "UPDATE_APPLY"
  ) {
    return "info";
  }
  return "muted";
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(
    async (
      nextOffset: number,
      filters?: {
        action: string;
        from: string;
        to: string;
        username: string;
      },
    ) => {
      const f = filters ?? { action, from, to, username };
      setLoading(true);
      setError(null);
      try {
        const data = await apiListAuditLogs({
          limit: PAGE_SIZE,
          offset: nextOffset,
          action: f.action || undefined,
          from: f.from || undefined,
          to: f.to || undefined,
          username: f.username.trim() || undefined,
        });
        setLogs(data.logs);
        setTotal(data.total);
        setOffset(nextOffset);
        setExpandedId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "감사 로그 조회 실패");
      } finally {
        setLoading(false);
      }
    },
    [action, from, to, username],
  );

  useEffect(() => {
    void load(0, { action: "", from: "", to: "", username: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 최초 1회
  }, []);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load(0);
  }

  function onReset() {
    setAction("");
    setFrom("");
    setTo("");
    setUsername("");
    void load(0, { action: "", from: "", to: "", username: "" });
  }

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="audit-page">
      <div className="page-header">
        <div>
          <h1>감사 로그</h1>
          <p>로그인·설정·민원 변경 이력을 조회합니다.</p>
        </div>
        <span className="badge">{total.toLocaleString("ko-KR")}건</span>
      </div>

      <form className="audit-filters" onSubmit={onFilter}>
        <div className="audit-filters-grid">
          <label className="field">
            행위
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">전체</option>
              {ACTION_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            사용자
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </label>
          <label className="field">
            시작일
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            종료일
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="audit-filters-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "조회 중…" : "조회"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={onReset}
          >
            초기화
          </button>
        </div>
      </form>

      {error && <p className="audit-error">{error}</p>}

      <div className={`panel audit-panel${loading ? " is-loading" : ""}`}>
        <div className="panel-head">
          <h2>이력 목록</h2>
          <span className="badge">
            {rangeStart}–{rangeEnd} / {total.toLocaleString("ko-KR")}
          </span>
        </div>

        <div className="panel-body audit-panel-body">
          <div className="audit-table-wrap">
            <table className="audit-table">
              <colgroup>
                <col className="audit-col-time" />
                <col className="audit-col-action-type" />
                <col className="audit-col-meta" />
                <col className="audit-col-summary" />
                <col className="audit-col-more" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">행위</th>
                  <th scope="col">사용자 / IP</th>
                  <th scope="col">요약</th>
                  <th scope="col" className="audit-col-action">
                    <span className="sr-only">상세</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="audit-empty">
                      <span className="audit-empty-spinner" aria-hidden />
                      불러오는 중…
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="audit-empty">
                      조건에 맞는 감사 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const open = expandedId === log.id;
                    const when = formatAtParts(log.createdAt);
                    return (
                      <Fragment key={log.id}>
                        <tr className={open ? "is-expanded" : undefined}>
                          <td className="audit-time" data-label="시각">
                            <span className="audit-time-date">{when.date}</span>
                            <span className="audit-time-clock">{when.time}</span>
                          </td>
                          <td className="audit-action-cell" data-label="행위">
                            <span
                              className={`audit-action-badge tone-${actionTone(log.action)}`}
                            >
                              {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                            </span>
                          </td>
                          <td className="audit-meta" data-label="정보">
                            <span className="audit-user">{log.username ?? "-"}</span>
                            <span className="audit-meta-sep" aria-hidden>
                              ·
                            </span>
                            <span className="audit-ip">{log.ip ?? "-"}</span>
                          </td>
                          <td className="audit-summary" data-label="요약">
                            <p className="audit-summary-text">{log.summary}</p>
                          </td>
                          <td className="audit-col-action" data-label="">
                            {log.detail ? (
                              <button
                                type="button"
                                className="btn btn-ghost audit-detail-btn"
                                aria-expanded={open}
                                onClick={() =>
                                  setExpandedId(open ? null : log.id)
                                }
                              >
                                {open ? "접기" : "상세"}
                              </button>
                            ) : (
                              <span className="audit-dash">—</span>
                            )}
                          </td>
                        </tr>
                        {open && log.detail && (
                          <tr className="audit-detail-row">
                            <td colSpan={5}>
                              <div className="audit-detail-box">
                                <div className="audit-detail-meta">
                                  {log.resourceType && (
                                    <span className="audit-chip">
                                      대상 {log.resourceType}
                                      {log.resourceId
                                        ? ` #${log.resourceId}`
                                        : ""}
                                    </span>
                                  )}
                                  {log.userAgent && (
                                    <span
                                      className="audit-ua"
                                      title={log.userAgent}
                                    >
                                      UA: {log.userAgent}
                                    </span>
                                  )}
                                </div>
                                <pre className="audit-detail">
                                  {JSON.stringify(log.detail, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="audit-pager">
          <button
            type="button"
            className="btn"
            disabled={loading || offset <= 0}
            onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
          >
            이전
          </button>
          <span className="audit-pager-status">
            {page} / {pageCount} 페이지
          </span>
          <button
            type="button"
            className="btn"
            disabled={loading || offset + PAGE_SIZE >= total}
            onClick={() => void load(offset + PAGE_SIZE)}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAtParts(value: string): { date: string; time: string } {
  const normalized = value.includes("T")
    ? value
    : value.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    return { date: value, time: "" };
  }
  return {
    date: d.toLocaleDateString("ko-KR"),
    time: d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}
