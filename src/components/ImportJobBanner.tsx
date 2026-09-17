import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useComplaintStore } from "@/store/ComplaintStore";

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}초`;
  return `${m}분 ${s.toString().padStart(2, "0")}초`;
}

function estimateRemaining(
  current: number,
  total: number,
  startedAt: number | null,
  now: number,
): string | null {
  if (!startedAt || current <= 0 || current >= total) return null;
  const elapsed = now - startedAt;
  const perItem = elapsed / current;
  const remainMs = perItem * (total - current);
  if (!Number.isFinite(remainMs) || remainMs < 1000) return "곧 완료";
  return `약 ${formatElapsed(remainMs)} 남음`;
}

export function ImportJobBanner() {
  const location = useLocation();
  const { importJob, cancelImportJob, dismissImportJob } = useComplaintStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (importJob.status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [importJob.status]);

  useEffect(() => {
    if (importJob.status !== "running") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [importJob.status]);

  useEffect(() => {
    if (importJob.status !== "done" && importJob.status !== "cancelled") {
      return;
    }
    const id = window.setTimeout(() => dismissImportJob(), 10_000);
    return () => window.clearTimeout(id);
  }, [importJob.status, importJob.startedAt, dismissImportJob]);

  const pct = useMemo(() => {
    if (importJob.total <= 0) return 0;
    return Math.min(
      100,
      Math.round((importJob.current / importJob.total) * 100),
    );
  }, [importJob.current, importJob.total]);

  if (importJob.status === "idle") return null;

  const elapsedLabel =
    importJob.startedAt != null
      ? formatElapsed(now - importJob.startedAt)
      : null;
  const etaLabel =
    importJob.status === "running"
      ? estimateRemaining(
          importJob.current,
          importJob.total,
          importJob.startedAt,
          now,
        )
      : null;
  const cancelling = importJob.detail.startsWith("취소 요청");

  const title =
    importJob.status === "running"
      ? cancelling
        ? "민원카드 등록 취소 중"
        : "민원카드 백그라운드 등록"
      : importJob.status === "done"
        ? "민원카드 등록 완료"
        : importJob.status === "cancelled"
          ? "민원카드 등록 취소됨"
          : "민원카드 등록 오류";

  return (
    <div
      className={`import-job-banner is-${importJob.status}${cancelling ? " is-cancelling" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="import-job-banner-main">
        <div className="import-job-banner-top">
          <div className="import-job-banner-title">{title}</div>
          <div className="import-job-banner-stats" aria-label="등록 현황">
            <span className="import-job-chip">
              {importJob.current}/{importJob.total}건
            </span>
            {importJob.created > 0 && (
              <span className="import-job-chip is-ok">
                신규 {importJob.created}
              </span>
            )}
            {importJob.updated > 0 && (
              <span className="import-job-chip is-info">
                갱신 {importJob.updated}
              </span>
            )}
            {importJob.status === "running" && (
              <span className="import-job-chip">{pct}%</span>
            )}
          </div>
        </div>

        <div className="import-job-banner-detail">
          {importJob.status === "running" && (
            <>
              {importJob.detail}
              {elapsedLabel ? ` · 경과 ${elapsedLabel}` : ""}
              {etaLabel ? ` · ${etaLabel}` : ""}
              {" · 다른 메뉴로 이동해도 등록은 계속됩니다"}
            </>
          )}
          {importJob.status === "done" && importJob.message}
          {importJob.status === "cancelled" && importJob.message}
          {importJob.status === "error" && (
            <>
              {importJob.error}
              {importJob.current > 0
                ? ` (이미 ${importJob.current}/${importJob.total}건 반영됨)`
                : ""}
            </>
          )}
        </div>

        {(importJob.status === "running" ||
          importJob.status === "done" ||
          importJob.status === "cancelled") && (
          <div
            className="import-job-banner-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={title}
          >
            <div
              className="import-job-banner-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="import-job-banner-actions">
        {location.pathname !== "/ledger" && (
          <Link to="/ledger" className="btn btn-ghost">
            관리대장
          </Link>
        )}
        {importJob.status === "running" ? (
          <button
            type="button"
            className="btn"
            disabled={cancelling}
            onClick={cancelImportJob}
          >
            {cancelling ? "취소 중…" : "등록 취소"}
          </button>
        ) : (
          <button type="button" className="btn" onClick={dismissImportJob}>
            닫기
          </button>
        )}
      </div>
    </div>
  );
}
