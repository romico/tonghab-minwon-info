import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFreezeSnapshot, apiGetLatestSnapshot } from "@/api/snapshots";
import type { ReportSnapshot } from "@/schema";
import { useComplaintStore } from "@/store/ComplaintStore";

type Props = {
  showDailyLink?: boolean;
};

export function SnapshotFreezeBar({ showDailyLink = false }: Props) {
  const location = useLocation();
  const {
    reportDate,
    setReportDate,
    periodFrom,
    periodTo,
    filteredComplaints,
  } = useComplaintStore();
  const [latest, setLatest] = useState<ReportSnapshot | null>(null);
  const [freezing, setFreezing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLatest(await apiGetLatestSnapshot(reportDate));
    } catch {
      setLatest(null);
    }
  }, [reportDate]);

  useEffect(() => {
    void reload();
  }, [reload, location.pathname]);

  async function onFreeze() {
    const ok = window.confirm(
      `보고일 ${reportDate} 스냅샷을 확정할까요?\n` +
        `대상 ${filteredComplaints.length}건 (상단 통보일 기간 필터 적용).\n` +
        `같은 보고일을 다시 확정해도 이전 이력은 유지됩니다.`,
    );
    if (!ok) return;
    setFreezing(true);
    setMsg(null);
    setErr(null);
    try {
      const snap = await apiFreezeSnapshot({
        reportDate,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
      });
      setLatest(snap);
      setMsg(
        `확정 완료 #${snap.id} · 일접수 ${snap.kpi.dailyReceived} · 처리중 ${snap.kpi.inProgressCount}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "스냅샷 확정에 실패했습니다.");
    } finally {
      setFreezing(false);
    }
  }

  const periodLabel =
    periodFrom || periodTo
      ? `${periodFrom || "…"} ~ ${periodTo || "…"}`
      : "전체";

  return (
    <section
      className={`snapshot-freeze-bar${latest ? " is-frozen" : " is-pending"}`}
      aria-label="보고 스냅샷 확정"
    >
      <div className="snapshot-freeze-top">
        <div className="snapshot-freeze-copy">
          <div className="snapshot-freeze-heading">
            <span
              className={`snapshot-freeze-pill${latest ? " is-ok" : " is-warn"}`}
            >
              {latest ? "확정됨" : "미확정"}
            </span>
            <span className="snapshot-freeze-kicker">보고 스냅샷</span>
          </div>
          <h2 className="snapshot-freeze-title">
            {latest
              ? `${reportDate} 스냅샷이 고정되어 있습니다`
              : `${reportDate} 보고일을 스냅샷으로 확정하세요`}
          </h2>
          <p className="snapshot-freeze-desc">
            확정 시 <strong>일접수·처리중 잔량</strong>이 그날 기준으로
            고정됩니다. 이후 민원 상태를 바꿔도 증감율 비교에는 확정값이
            사용됩니다.
          </p>
        </div>

        <div className="snapshot-freeze-controls">
          <label className="field snapshot-freeze-date">
            <span>보고일</span>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`btn snapshot-freeze-btn${
              latest ? "" : " btn-primary"
            }`}
            disabled={freezing}
            onClick={() => void onFreeze()}
          >
            {freezing
              ? "확정 중…"
              : latest
                ? "다시 확정"
                : "스냅샷 확정"}
          </button>
          {showDailyLink && (
            <Link className="btn btn-ghost" to="/daily">
              일일보고
            </Link>
          )}
        </div>
      </div>

      {latest && (
        <div className="snapshot-freeze-kpi" aria-label="확정 KPI">
          <div className="snapshot-freeze-kpi-item">
            <span>일접수</span>
            <strong>{latest.kpi.dailyReceived}</strong>
          </div>
          <div className="snapshot-freeze-kpi-item">
            <span>처리중</span>
            <strong>{latest.kpi.inProgressCount}</strong>
          </div>
          <div className="snapshot-freeze-kpi-item">
            <span>누적접수</span>
            <strong>{latest.kpi.cumulativeReceived}</strong>
          </div>
          <div className="snapshot-freeze-kpi-item">
            <span>완료</span>
            <strong>{latest.kpi.doneCount}</strong>
          </div>
        </div>
      )}

      <footer className="snapshot-freeze-foot">
        <span className="snapshot-freeze-meta">
          {latest
            ? `#${latest.id} · ${latest.frozenAt}${
                latest.frozenBy ? ` · ${latest.frozenBy}` : ""
              }`
            : "증감율 비교를 위해 보고일·비교일 모두 확정이 필요합니다"}
        </span>
        <span className="snapshot-freeze-meta is-right">
          대상 {filteredComplaints.length}건 · 통보일 {periodLabel}
        </span>
      </footer>

      {msg && <p className="form-ok snapshot-freeze-msg">{msg}</p>}
      {err && <p className="form-error snapshot-freeze-msg">{err}</p>}
    </section>
  );
}
