import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGetSnapshotsByDates } from "@/api/snapshots";
import {
  compareSnapshotGrowth,
  formatGrowthRate,
  shiftIsoDate,
  type ReportSnapshot,
  type SnapshotGrowthComparison,
} from "@/schema";
import { useComplaintStore } from "@/store/ComplaintStore";

type LagPreset = 1 | 7 | "custom";

function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
}

function dayDiffIso(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function RateCard({
  title,
  metric,
  hint,
  unit = "건",
}: {
  title: string;
  metric: SnapshotGrowthComparison["received"];
  hint: string;
  unit?: string;
}) {
  const tone =
    metric.rate == null
      ? " is-neutral"
      : metric.rate > 0
        ? " is-up"
        : metric.rate < 0
          ? " is-down"
          : " is-flat";

  return (
    <article className={`dash-growth-card${tone}`}>
      <header className="dash-growth-card-head">
        <span className="dash-growth-label">{title}</span>
        <span className="dash-growth-chip" aria-hidden>
          {metric.rate == null
            ? "비율 불가"
            : metric.rate > 0
              ? "증가"
              : metric.rate < 0
                ? "감소"
                : "동일"}
        </span>
      </header>
      <strong className="dash-growth-rate">
        {formatGrowthRate(metric.rate)}
      </strong>
      <div className="dash-growth-abs">
        <span className="dash-growth-abs-now">
          {metric.current}
          {unit}
        </span>
        <span className="dash-growth-abs-arrow" aria-hidden>
          ←
        </span>
        <span className="dash-growth-abs-base">
          {metric.baseline}
          {unit}
        </span>
        <span className="dash-growth-abs-delta">
          ({formatDelta(metric.delta)}
          {unit})
        </span>
      </div>
      <p className="dash-growth-hint">{hint}</p>
    </article>
  );
}

function DatePickChip({
  label,
  date,
  status,
  ok,
  max,
  min,
  onChange,
}: {
  label: string;
  date: string;
  status: string;
  ok: boolean;
  max?: string;
  min?: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openCalendar() {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const picker = (
      el as HTMLInputElement & { showPicker?: () => void }
    ).showPicker;
    if (typeof picker === "function") {
      try {
        picker.call(el);
        return;
      } catch {
        // NotAllowedError 등 — 아래 click 폴백
      }
    }
    el.click();
  }

  return (
    <div
      className={`dash-growth-date-chip${ok ? " is-ok" : " is-warn"}`}
    >
      <div className="dash-growth-date-chip-top">
        <span className="dash-growth-date-label">{label}</span>
        <span className="dash-growth-date-status">{status}</span>
      </div>
      <div className="dash-growth-date-field-wrap">
        <input
          ref={inputRef}
          type="date"
          className="dash-growth-date-field"
          value={date}
          max={max}
          min={min}
          aria-label={`${label} 선택`}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        />
        <button
          type="button"
          className="dash-growth-date-open"
          onClick={openCalendar}
          aria-label={`${label} 달력 열기`}
        >
          달력
        </button>
      </div>
    </div>
  );
}

export function SnapshotGrowthPanel() {
  const { reportDate, setReportDate } = useComplaintStore();
  const [lagPreset, setLagPreset] = useState<LagPreset>(1);
  const [baselineDate, setBaselineDate] = useState(() =>
    shiftIsoDate(reportDate, -1),
  );
  const [byDate, setByDate] = useState<Record<string, ReportSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 전일/전주 프리셋일 때만 보고일 변경에 맞춰 비교일 동기화
  useEffect(() => {
    if (lagPreset === 1 || lagPreset === 7) {
      setBaselineDate(shiftIsoDate(reportDate, -lagPreset));
    }
  }, [reportDate, lagPreset]);

  const lagDays = useMemo(() => {
    const d = dayDiffIso(baselineDate, reportDate);
    return Math.max(1, Math.abs(d) || 1);
  }, [baselineDate, reportDate]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const map = await apiGetSnapshotsByDates([reportDate, baselineDate]);
      setByDate(map);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "스냅샷을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [reportDate, baselineDate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const comparison = useMemo(() => {
    const current = byDate[reportDate];
    const baseline = byDate[baselineDate];
    if (!current || !baseline) return null;
    return compareSnapshotGrowth(current.kpi, baseline.kpi, {
      currentSnapshotId: current.id,
      baselineSnapshotId: baseline.id,
      lagDays,
    });
  }, [byDate, reportDate, baselineDate, lagDays]);

  const currentSnap = byDate[reportDate];
  const baselineSnap = byDate[baselineDate];
  const ready = Boolean(currentSnap && baselineSnap);

  function applyPreset(days: 1 | 7) {
    setLagPreset(days);
    setBaselineDate(shiftIsoDate(reportDate, -days));
  }

  function onPickReportDate(next: string) {
    setReportDate(next);
  }

  function onPickBaselineDate(next: string) {
    setLagPreset("custom");
    setBaselineDate(next);
  }

  return (
    <section
      className={`panel dash-growth-panel${ready ? " is-ready" : " is-waiting"}`}
    >
      <div className="panel-head dash-growth-head">
        <div>
          <h2>접수·처리중 증감율</h2>
          <p className="dash-growth-sub">
            확정 스냅샷 기준 · {reportDate} vs {baselineDate}
            {lagPreset === "custom" ? " (직접 선택)" : ""}
          </p>
        </div>
        <div className="dash-growth-seg" role="group" aria-label="비교 기간">
          <button
            type="button"
            className={lagPreset === 1 ? "is-active" : undefined}
            onClick={() => applyPreset(1)}
          >
            전일
          </button>
          <button
            type="button"
            className={lagPreset === 7 ? "is-active" : undefined}
            onClick={() => applyPreset(7)}
          >
            전주
          </button>
          <button
            type="button"
            className={lagPreset === "custom" ? "is-active" : undefined}
            onClick={() => setLagPreset("custom")}
            title="비교일 칩에서 날짜를 직접 고르세요"
          >
            직접
          </button>
        </div>
      </div>

      <div className="panel-body dash-growth-body">
        <div className="dash-growth-pair">
          <DatePickChip
            label="보고일"
            date={reportDate}
            status={currentSnap ? `#${currentSnap.id}` : "미확정"}
            ok={Boolean(currentSnap)}
            onChange={onPickReportDate}
          />
          <span className="dash-growth-pair-vs" aria-hidden>
            vs
          </span>
          <DatePickChip
            label="비교일"
            date={baselineDate}
            status={baselineSnap ? `#${baselineSnap.id}` : "미확정"}
            ok={Boolean(baselineSnap)}
            max={reportDate}
            onChange={onPickBaselineDate}
          />
        </div>
        <p className="dash-growth-pick-hint">
          보고일·비교일은 날짜 칸이나 「달력」을 눌러 바꿀 수 있습니다.
        </p>

        {loading && (
          <div className="dash-growth-empty is-loading">
            <p className="dash-growth-empty-title">스냅샷을 불러오는 중…</p>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}

        {!loading && !comparison && (
          <div className="dash-growth-empty">
            <p className="dash-growth-empty-title">증감율을 아직 표시할 수 없습니다</p>
            <p className="dash-growth-empty-desc">
              양쪽 날짜가 <strong>모두 확정</strong>된 뒤에만 표시합니다.
              처리중 잔량은 원천 추정 없이 <strong>스냅샷만</strong> 사용합니다.
            </p>
            <ul className="dash-growth-todo">
              {!currentSnap && (
                <li className="dash-growth-todo-item">
                  <span className="dash-growth-todo-badge">필요</span>
                  <div className="dash-growth-todo-copy">
                    <strong>보고일 {reportDate}</strong>
                    <span>위 「보고 스냅샷」카드에서 확정하세요</span>
                  </div>
                </li>
              )}
              {!baselineSnap && (
                <li className="dash-growth-todo-item">
                  <span className="dash-growth-todo-badge">필요</span>
                  <div className="dash-growth-todo-copy">
                    <strong>비교일 {baselineDate}</strong>
                    <span>
                      {currentSnap
                        ? "다른 날을 고르거나 해당일을 확정하세요"
                        : "보고일 확정 후 비교일도 확정이 필요합니다"}
                    </span>
                  </div>
                </li>
              )}
              {currentSnap && (
                <li className="dash-growth-todo-item is-done">
                  <span className="dash-growth-todo-badge is-ok">완료</span>
                  <div className="dash-growth-todo-copy">
                    <strong>보고일 {reportDate}</strong>
                    <span>스냅샷 #{currentSnap.id} 확정됨</span>
                  </div>
                </li>
              )}
            </ul>
            <div className="dash-growth-empty-actions">
              <Link className="btn btn-ghost" to="/daily">
                일일보고에서 확정하기
              </Link>
            </div>
          </div>
        )}

        {comparison && (
          <>
            <div className="dash-growth-grid">
              <RateCard
                title="접수 증감율"
                metric={comparison.received}
                hint="일접수 기준"
              />
              <RateCard
                title="처리중 증감율"
                metric={comparison.inProgress}
                hint="미처리 잔량 기준"
              />
              <article
                className={`dash-growth-card is-gap${
                  comparison.gap == null
                    ? " is-neutral"
                    : comparison.gap > 0
                      ? " is-warn"
                      : " is-ok"
                }`}
              >
                <header className="dash-growth-card-head">
                  <span className="dash-growth-label">잔량 압력 격차</span>
                  <span className="dash-growth-chip">
                    {comparison.gap == null
                      ? "—"
                      : comparison.gap > 0
                        ? "압력↑"
                        : comparison.gap < 0
                          ? "여유"
                          : "균형"}
                  </span>
                </header>
                <strong className="dash-growth-rate">
                  {formatGrowthRate(comparison.gap)}
                </strong>
                <div className="dash-growth-abs">
                  처리중 증감율 − 접수 증감율
                </div>
                <p className="dash-growth-hint">
                  {comparison.gap == null
                    ? "분모 0으로 격차 계산 불가"
                    : comparison.gap > 0
                      ? "유입보다 잔량이 더 가파르게 증가"
                      : comparison.gap < 0
                        ? "잔량 압력이 유입보다 낮음"
                        : "유입과 잔량 변화 균형"}
                </p>
              </article>
            </div>
            <p className="dash-growth-ids">
              비교 스냅샷 #{comparison.currentSnapshotId} · #
              {comparison.baselineSnapshotId}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
