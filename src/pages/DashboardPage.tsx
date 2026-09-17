import { SnapshotFreezeBar } from "@/components/SnapshotFreezeBar";
import { SnapshotGrowthPanel } from "@/components/SnapshotGrowthPanel";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DEPARTMENTS,
  FIELD_OPTIONS,
  PROCESS_STATUS_LABEL,
  type Complaint,
  type ProcessStatus,
} from "@/schema";
import { useComplaintStore } from "@/store/ComplaintStore";

type PriorityLevel = "overdue" | "urgent" | "soon" | "normal" | "none";

interface TrendPoint {
  date: string;
  label: string;
  received: number;
  done: number;
}

interface ScheduledItem {
  complaint: Complaint;
  priority: PriorityLevel;
  priorityLabel: string;
  dueLabel: string;
  daysLeft: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function dayDiff(from: string, to: string): number {
  const a = parseDate(from).getTime();
  const b = parseDate(to).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function buildTrend(
  complaints: Complaint[],
  periodFrom: string,
  periodTo: string,
): TrendPoint[] {
  const end = periodTo || todayIso();
  let start = periodFrom;
  if (!start) {
    start = addDays(end, -13);
  }
  // 기간이 너무 길면 끝점 기준 최대 90일만 생성 후, 실적 구간으로 다시 자름
  const span = Math.max(0, dayDiff(start, end));
  const days = Math.min(span, 90) + 1;
  const actualStart = addDays(end, -(days - 1));

  const points: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(actualStart, i);
    points.push({
      date,
      label: formatShortDate(date),
      received: 0,
      done: 0,
    });
  }
  const index = new Map(points.map((p, i) => [p.date, i]));

  for (const c of complaints) {
    if (c.receivedAt && index.has(c.receivedAt)) {
      points[index.get(c.receivedAt)!]!.received += 1;
    }
    if (
      c.processStatus === "DONE" &&
      c.completedOrDueAt &&
      index.has(c.completedOrDueAt)
    ) {
      points[index.get(c.completedOrDueAt)!]!.done += 1;
    }
  }

  // 앞·뒤 연속 0건 구간 제거 (좌우 빈 공간 축소), 양옆 1일만 여유
  let first = points.findIndex((p) => p.received > 0 || p.done > 0);
  let last = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i]!.received > 0 || points[i]!.done > 0) {
      last = i;
      break;
    }
  }
  if (first < 0 || last < 0) {
    // 실적 없으면 최근 14일만
    return points.slice(Math.max(0, points.length - 14));
  }
  first = Math.max(0, first - 1);
  last = Math.min(points.length - 1, last + 1);
  const trimmed = points.slice(first, last + 1);
  // 너무 짧으면 최소 7일 확보
  if (trimmed.length >= 7) return trimmed;
  const need = 7 - trimmed.length;
  const expandStart = Math.max(0, first - need);
  return points.slice(expandStart, last + 1);
}

function classifyPriority(
  c: Complaint,
  today: string,
): Omit<ScheduledItem, "complaint"> {
  const due = c.completedOrDueAt;
  if (due) {
    if (due < today) {
      const overdue = dayDiff(due, today);
      return {
        priority: "overdue",
        priorityLabel: `${overdue}일 초과`,
        dueLabel: due,
        daysLeft: -overdue,
      };
    }
    if (due === today) {
      return {
        priority: "urgent",
        priorityLabel: "오늘 마감",
        dueLabel: due,
        daysLeft: 0,
      };
    }
    const left = dayDiff(today, due);
    if (left <= 3) {
      return {
        priority: "soon",
        priorityLabel: `${left}일 남음`,
        dueLabel: due,
        daysLeft: left,
      };
    }
    return {
      priority: "normal",
      priorityLabel: `${left}일 남음`,
      dueLabel: due,
      daysLeft: left,
    };
  }

  // 마감일 없으면 통보/접수 대기 일수로 우선순위
  const base = c.notifiedAt || c.receivedAt;
  if (!base) {
    return {
      priority: "none",
      priorityLabel: "기한 미정",
      dueLabel: "마감 미설정",
      daysLeft: null,
    };
  }
  const waiting = Math.max(0, dayDiff(base, today));
  if (waiting >= 7) {
    return {
      priority: "overdue",
      priorityLabel: `대기 ${waiting}일`,
      dueLabel: "마감 미설정",
      daysLeft: -waiting,
    };
  }
  if (waiting >= 4) {
    return {
      priority: "soon",
      priorityLabel: `대기 ${waiting}일`,
      dueLabel: "마감 미설정",
      daysLeft: null,
    };
  }
  if (waiting >= 1) {
    return {
      priority: "normal",
      priorityLabel: `대기 ${waiting}일`,
      dueLabel: "마감 미설정",
      daysLeft: null,
    };
  }
  return {
    priority: "urgent",
    priorityLabel: "신규",
    dueLabel: "마감 미설정",
    daysLeft: 0,
  };
}

/** 원문 덤프에서 카드용 짧은 제목 추출 */
function extractComplaintTitle(content: string): string {
  const raw = content.replace(/\s+/g, " ").trim();
  if (!raw) return "제목 없음";

  const beforeCode = raw.split(/\s*[—–]\s*코드번호/)[0]?.trim();
  if (beforeCode && beforeCode.length >= 4 && beforeCode.length <= 72) {
    return beforeCode;
  }

  const titled = raw.match(
    /제\s*목\s+(.+?)(?=\s*(?:수렴|민원접수|의견|관리번호|코드번호|성명|$))/,
  );
  if (titled?.[1]) {
    const t = titled[1].trim();
    return t.length > 56 ? `${t.slice(0, 56)}…` : t;
  }

  const cut = raw.split(
    /\s*(?:의견제시자|의견 제시자|〔불편|\[불편|현실태|현황 및|요구사항)/,
  )[0]?.trim() ?? raw;
  if (cut.length <= 56) return cut || raw.slice(0, 56);
  return `${cut.slice(0, 56)}…`;
}

const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  overdue: 0,
  urgent: 1,
  soon: 2,
  normal: 3,
  none: 4,
};

function TrendLineChart({ points }: { points: TrendPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  /** 컨테이너 실측 너비 — viewBox와 1:1로 맞춰 가로 늘어나도 원이 찌그러지지 않음 */
  const [width, setWidth] = useState(720);
  const height = 160;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = (w: number) => {
      const next = Math.max(280, Math.round(w));
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 8, right: 8, bottom: 22, left: 28 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(
    1,
    ...points.map((p) => Math.max(p.received, p.done)),
  );

  const xAt = (i: number) =>
    pad.left +
    (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => pad.top + innerH - (v / maxY) * innerH;

  const toLine = (key: "received" | "done") =>
    points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`,
      )
      .join(" ");

  const toArea = (key: "received" | "done") => {
    if (points.length === 0) return "";
    const line = points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`,
      )
      .join(" ");
    const lastX = xAt(points.length - 1).toFixed(1);
    const firstX = xAt(0).toFixed(1);
    const base = (pad.top + innerH).toFixed(1);
    return `${line} L ${lastX} ${base} L ${firstX} ${base} Z`;
  };

  const ticks = [0, maxY];
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const active = hoverIdx != null ? points[hoverIdx] : null;

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * width;
    if (points.length <= 1) {
      setHoverIdx(0);
      return;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(xAt(i) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  return (
    <div className="dash-trend-chart" ref={wrapRef}>
      <svg
        className="dash-trend-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="민원 접수 및 처리 추이 차트"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="trendRecvFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9f1239" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#9f1239" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trendDoneFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#166534" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#166534" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yAt(t)}
              y2={yAt(t)}
              className="dash-trend-grid"
            />
            <text
              x={pad.left - 6}
              y={yAt(t) + 3}
              className="dash-trend-axis"
              textAnchor="end"
            >
              {t}
            </text>
          </g>
        ))}
        <path d={toArea("received")} fill="url(#trendRecvFill)" />
        <path d={toArea("done")} fill="url(#trendDoneFill)" />
        <path
          d={toLine("received")}
          className="dash-trend-line is-received"
          fill="none"
        />
        <path
          d={toLine("done")}
          className="dash-trend-line is-done"
          fill="none"
        />
        {hoverIdx != null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={pad.top}
            y2={pad.top + innerH}
            className="dash-trend-crosshair"
          />
        )}
        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.received)}
              r={hoverIdx === i ? 4 : 2.5}
              className="dash-trend-dot is-received"
            />
            <circle
              cx={xAt(i)}
              cy={yAt(p.done)}
              r={hoverIdx === i ? 4 : 2.5}
              className="dash-trend-dot is-done"
            />
            {i % labelStep === 0 || i === points.length - 1 ? (
              <text
                x={xAt(i)}
                y={height - 5}
                className="dash-trend-axis"
                textAnchor="middle"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {active && (
        <div className="dash-trend-tooltip" role="status">
          <strong>{active.date}</strong>
          <span className="is-received">접수 {active.received}</span>
          <span className="is-done">완료 {active.done}</span>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const {
    filteredComplaints,
    departmentStatus,
    summary,
    daily,
    refreshComplaints,
    storeLoading,
    periodFrom,
    periodTo,
  } = useComplaintStore();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const deptName = useMemo(
    () => Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name])),
    [],
  );

  const kpi = useMemo(() => {
    const total = filteredComplaints.length;
    const done = filteredComplaints.filter((c) => c.processStatus === "DONE").length;
    const scheduled = filteredComplaints.filter(
      (c) => c.processStatus === "SCHEDULED",
    ).length;
    const impossible = filteredComplaints.filter(
      (c) => c.processStatus === "IMPOSSIBLE",
    ).length;
    const unset = filteredComplaints.filter((c) => !c.processStatus).length;
    return {
      total,
      done,
      scheduled,
      impossible,
      unset,
      rate: total === 0 ? 0 : done / total,
    };
  }, [filteredComplaints]);

  const trend = useMemo(
    () => buildTrend(filteredComplaints, periodFrom, periodTo),
    [filteredComplaints, periodFrom, periodTo],
  );

  const trendSummary = useMemo(() => {
    const received = trend.reduce((n, p) => n + p.received, 0);
    const done = trend.reduce((n, p) => n + p.done, 0);
    const days = Math.max(1, trend.length);
    return {
      received,
      done,
      avgReceived: received / days,
      avgDone: done / days,
      rangeLabel:
        trend.length > 0
          ? `${trend[0]!.date} ~ ${trend[trend.length - 1]!.date}`
          : "—",
    };
  }, [trend]);

  const deptWorkload = useMemo(() => {
    const rows = departmentStatus
      .filter((r) => r.complaintCount > 0)
      .sort((a, b) => b.complaintCount - a.complaintCount)
      .slice(0, 8);
    const max = Math.max(1, ...rows.map((r) => r.complaintCount));
    return rows.map((r) => ({ ...r, pct: (r.complaintCount / max) * 100 }));
  }, [departmentStatus]);

  const scheduledItems = useMemo(() => {
    const today = todayIso();
    return filteredComplaints
      .filter((c) => c.processStatus === "SCHEDULED")
      .map((complaint) => ({
        complaint,
        ...classifyPriority(complaint, today),
      }))
      .sort((a, b) => {
        const po =
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (po !== 0) return po;
        const ad = a.complaint.completedOrDueAt ?? "9999-99-99";
        const bd = b.complaint.completedOrDueAt ?? "9999-99-99";
        return ad.localeCompare(bd);
      })
      .slice(0, 8);
  }, [filteredComplaints]);

  const recent = useMemo(() => {
    return [...filteredComplaints]
      .sort((a, b) => {
        const ad = a.receivedAt || "";
        const bd = b.receivedAt || "";
        if (ad !== bd) return bd.localeCompare(ad);
        return b.id.localeCompare(a.id);
      })
      .slice(0, 6);
  }, [filteredComplaints]);

  const statusDist = useMemo(
    () => [
      {
        key: "DONE" as ProcessStatus,
        label: PROCESS_STATUS_LABEL.DONE,
        count: kpi.done,
        tone: "ok" as const,
      },
      {
        key: "SCHEDULED" as ProcessStatus,
        label: PROCESS_STATUS_LABEL.SCHEDULED,
        count: kpi.scheduled,
        tone: "warn" as const,
      },
      {
        key: "IMPOSSIBLE" as ProcessStatus,
        label: PROCESS_STATUS_LABEL.IMPOSSIBLE,
        count: kpi.impossible,
        tone: "danger" as const,
      },
    ],
    [kpi],
  );

  function goLedger(status?: ProcessStatus | "ALL") {
    if (!status || status === "ALL") {
      navigate("/ledger");
      return;
    }
    navigate(`/ledger?status=${status}`);
  }

  function goDept(deptId: string) {
    navigate(`/departments?dept=${encodeURIComponent(deptId)}`);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshComplaints();
    } catch {
      /* storeError에 표시 */
    } finally {
      setRefreshing(false);
    }
  }

  async function onExportExcel() {
    setExporting(true);
    try {
      const { apiHydrateComplaintMedia } = await import("@/api/complaints");
      const { exportCombinedExcel } = await import("@/export/combinedExcel");
      const withPhotos = await apiHydrateComplaintMedia(filteredComplaints);
      await exportCombinedExcel({
        complaints: withPhotos,
        departmentStatus,
        summary,
        daily,
        includeImages: true,
      });
    } catch (err) {
      console.error(err);
      window.alert("엑셀 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dash-page">
      <div className="page-header">
        <div>
          <h1>오늘의 민원 처리 현황</h1>
          <p>
            관리보고에 입력된 데이터를 기준으로 업무 우선순위와 처리 흐름을
            한눈에 확인합니다.
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            disabled={exporting || storeLoading}
            onClick={() => void onExportExcel()}
          >
            {exporting ? "내보내는 중…" : "통합 엑셀 다운로드"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={refreshing || storeLoading}
            onClick={() => void onRefresh()}
          >
            {refreshing || storeLoading ? "새로고침 중…" : "데이터 새로고침"}
          </button>
        </div>
      </div>

      <div className="dash-kpi-grid">
        <button
          type="button"
          className="dash-kpi"
          onClick={() => goLedger("ALL")}
        >
          <span className="dash-kpi-label">전체 민원</span>
          <strong className="dash-kpi-value">{kpi.total}</strong>
          <span className="dash-kpi-desc">현재 접수된 전체 건수</span>
        </button>
        <button
          type="button"
          className="dash-kpi is-ok"
          onClick={() => goLedger("DONE")}
        >
          <span className="dash-kpi-label">처리완료</span>
          <strong className="dash-kpi-value">{kpi.done}</strong>
          <span className="dash-kpi-desc">완료된 민원</span>
        </button>
        <button
          type="button"
          className="dash-kpi is-warn"
          onClick={() => goLedger("SCHEDULED")}
        >
          <span className="dash-kpi-label">처리예정</span>
          <strong className="dash-kpi-value">{kpi.scheduled}</strong>
          <span className="dash-kpi-desc">후속 조치가 필요한 건</span>
        </button>
        <button
          type="button"
          className="dash-kpi is-danger"
          onClick={() => goLedger("IMPOSSIBLE")}
        >
          <span className="dash-kpi-label">처리불가</span>
          <strong className="dash-kpi-value">{kpi.impossible}</strong>
          <span className="dash-kpi-desc">사유 확인이 필요한 건</span>
        </button>
        <button
          type="button"
          className="dash-kpi is-accent"
          onClick={() => goLedger("DONE")}
        >
          <span className="dash-kpi-label">완료율</span>
          <strong className="dash-kpi-value">{formatPct(kpi.rate)}</strong>
          <span className="dash-kpi-desc">전체 대비 처리완료 비율</span>
        </button>
      </div>

      <SnapshotFreezeBar showDailyLink />
      <SnapshotGrowthPanel />

      <div className="dash-quick">
        <span className="dash-quick-label">빠른 업무 이동</span>
        <div className="dash-quick-actions">
          <Link className="btn" to="/ledger">
            관리대장
          </Link>
          <Link className="btn" to="/departments">
            부서별현황
          </Link>
          <Link className="btn" to="/summary">
            총괄표
          </Link>
          <Link className="btn" to="/daily">
            일일보고
          </Link>
          <Link className="btn" to="/ledger?status=SCHEDULED">
            처리예정 목록
          </Link>
        </div>
      </div>

      <div className="dash-grid">
        <section className="panel dash-panel dash-span-2">
          <div className="panel-head">
            <h2>접수·처리 추이</h2>
            <span className="badge">
              {periodFrom || periodTo
                ? "선택 기간"
                : `최근 ${trend.length}일`}
            </span>
          </div>
          <div className="panel-body dash-trend-body">
            {trend.every((p) => p.received === 0 && p.done === 0) ? (
              <div className="empty">
                선택 기간에 접수·처리 실적이 없습니다.
                <span className="dash-trend-empty-hint">
                  상단 보고일 기간을 조정하거나 관리대장에 민원을 등록해 주세요.
                </span>
              </div>
            ) : (
              <>
                <div className="dash-trend-toolbar">
                  <div className="dash-trend-legend">
                    <span className="is-received">접수</span>
                    <span className="is-done">처리완료</span>
                  </div>
                  <p className="dash-trend-range">{trendSummary.rangeLabel}</p>
                </div>
                <div className="dash-trend-summary">
                  <div className="dash-trend-stat">
                    <span>기간 접수</span>
                    <strong>{trendSummary.received}건</strong>
                  </div>
                  <div className="dash-trend-stat">
                    <span>기간 처리완료</span>
                    <strong>{trendSummary.done}건</strong>
                  </div>
                  <div className="dash-trend-stat">
                    <span>일평균 접수</span>
                    <strong>{trendSummary.avgReceived.toFixed(1)}건</strong>
                  </div>
                  <div className="dash-trend-stat">
                    <span>일평균 완료</span>
                    <strong>{trendSummary.avgDone.toFixed(1)}건</strong>
                  </div>
                </div>
                <TrendLineChart points={trend} />
              </>
            )}
          </div>
        </section>

        <section className="panel dash-panel">
          <div className="panel-head">
            <h2>처리 상태 분포</h2>
            <span className="badge">{kpi.total}건</span>
          </div>
          <div className="panel-body dash-status-body">
            {kpi.total === 0 ? (
              <div className="empty">표시할 상태가 없습니다.</div>
            ) : (
              <>
                <div className="dash-donut-wrap" aria-hidden>
                  <svg className="dash-donut" viewBox="0 0 120 120">
                    {(() => {
                      const r = 42;
                      const c = 2 * Math.PI * r;
                      let offset = 0;
                      const colors = {
                        ok: "#166534",
                        warn: "#d97706",
                        danger: "#9f1239",
                      } as const;
                      return statusDist.map((s) => {
                        const len = kpi.total === 0 ? 0 : (s.count / kpi.total) * c;
                        const el = (
                          <circle
                            key={s.key}
                            className="dash-donut-seg"
                            cx="60"
                            cy="60"
                            r={r}
                            fill="none"
                            stroke={colors[s.tone]}
                            strokeWidth="14"
                            strokeDasharray={`${len} ${c - len}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 60 60)"
                          />
                        );
                        offset += len;
                        return el;
                      });
                    })()}
                    <circle cx="60" cy="60" r="30" className="dash-donut-hole" />
                    <text x="60" y="56" textAnchor="middle" className="dash-donut-center-value">
                      {formatPct(kpi.rate)}
                    </text>
                    <text x="60" y="72" textAnchor="middle" className="dash-donut-center-label">
                      완료율
                    </text>
                  </svg>
                </div>
                <ul className="dash-status-list">
                  {statusDist.map((s) => {
                    const share = kpi.total === 0 ? 0 : s.count / kpi.total;
                    return (
                      <li key={s.key}>
                        <button
                          type="button"
                          className={`dash-status-row tone-${s.tone}`}
                          onClick={() => goLedger(s.key)}
                        >
                          <span className="dash-status-meta">
                            <strong>
                              <i className="dash-status-dot" aria-hidden />
                              {s.label}
                            </strong>
                            <em>
                              {s.count}건 · {formatPct(share)}
                            </em>
                          </span>
                          <span className="dash-status-track">
                            <span
                              className="dash-status-fill"
                              style={{ width: `${share * 100}%` }}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </section>

        <section className="panel dash-panel">
          <div className="panel-head">
            <h2>부서별 업무량</h2>
            <span className="badge">상위 {deptWorkload.length}</span>
          </div>
          <div className="panel-body">
            {deptWorkload.length === 0 ? (
              <div className="empty">부서 데이터가 없습니다.</div>
            ) : (
              <ul className="dash-dept-list">
                {deptWorkload.map((d, idx) => {
                  const pending = Math.max(0, d.complaintCount - d.doneCount);
                  const donePct =
                    d.complaintCount === 0
                      ? 0
                      : (d.doneCount / d.complaintCount) * 100;
                  const pendingPct =
                    d.complaintCount === 0
                      ? 0
                      : (pending / d.complaintCount) * 100;
                  return (
                    <li key={d.departmentId}>
                      <button
                        type="button"
                        className="dash-dept-row"
                        onClick={() => goDept(d.departmentId)}
                      >
                        <span className="dash-dept-rank" aria-hidden>
                          {idx + 1}
                        </span>
                        <span className="dash-dept-main">
                          <span className="dash-dept-meta">
                            <strong>{d.departmentName}</strong>
                            <em>
                              전체 {d.complaintCount} · 완료 {d.doneCount} · 미처리{" "}
                              {pending}
                            </em>
                          </span>
                          <span
                            className="dash-dept-track is-stack"
                            title={`완료 ${formatPct(d.processRate)}`}
                          >
                            <span
                              className="dash-dept-fill is-done"
                              style={{ width: `${donePct}%` }}
                            />
                            <span
                              className="dash-dept-fill is-pending"
                              style={{ width: `${pendingPct}%` }}
                            />
                          </span>
                        </span>
                        <span className="dash-dept-rate">
                          {formatPct(d.processRate)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="panel dash-panel dash-span-2">
          <div className="panel-head">
            <h2>처리 예정 민원</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => goLedger("SCHEDULED")}
            >
              전체 보기
            </button>
          </div>
          <div className="panel-body">
            {scheduledItems.length === 0 ? (
              <div className="empty">처리 예정 민원이 없습니다.</div>
            ) : (
              <ul className="dash-schedule-list">
                {scheduledItems.map((item) => {
                  const field =
                    FIELD_OPTIONS.find(
                      (f) => f.code === item.complaint.fieldCode,
                    )?.label ?? "—";
                  const title = extractComplaintTitle(item.complaint.content);
                  const hasDue = Boolean(item.complaint.completedOrDueAt);
                  return (
                    <li key={item.complaint.id}>
                      <button
                        type="button"
                        className={`dash-schedule-card priority-${item.priority}`}
                        onClick={() =>
                          navigate(
                            `/ledger?edit=${encodeURIComponent(item.complaint.id)}`,
                          )
                        }
                      >
                        <div className="dash-schedule-top">
                          <span
                            className={`dash-priority-badge priority-${item.priority}`}
                          >
                            {item.priorityLabel}
                          </span>
                          <span
                            className={`dash-schedule-due${hasDue ? "" : " is-unset"}`}
                          >
                            {hasDue
                              ? `마감 ${item.dueLabel}`
                              : item.dueLabel}
                          </span>
                        </div>
                        <p className="dash-schedule-title">{title}</p>
                        {item.complaint.location?.trim() ? (
                          <p className="dash-schedule-location">
                            {item.complaint.location}
                          </p>
                        ) : null}
                        <div className="dash-schedule-meta">
                          <span>{field}</span>
                          <span>
                            {deptName[item.complaint.departmentId] ?? "—"}
                          </span>
                          <span>
                            {item.complaint.assigneeName?.trim() || "담당 미정"}
                          </span>
                          <span>
                            접수 {item.complaint.receivedAt || "—"}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="panel dash-panel dash-span-2">
          <div className="panel-head">
            <h2>최근 접수 민원</h2>
            <Link className="btn btn-ghost" to="/ledger">
              관리대장
            </Link>
          </div>
          <div className="panel-body">
            {recent.length === 0 ? (
              <div className="empty">최근 접수 민원이 없습니다.</div>
            ) : (
              <table className="data-table dash-recent-table">
                <thead>
                  <tr>
                    <th>접수일</th>
                    <th>분야</th>
                    <th>민원내용</th>
                    <th>처리부서</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c) => (
                    <tr
                      key={c.id}
                      className="dash-recent-row"
                      onClick={() =>
                        navigate(`/ledger?edit=${encodeURIComponent(c.id)}`)
                      }
                    >
                      <td>{c.receivedAt}</td>
                      <td>
                        {FIELD_OPTIONS.find((f) => f.code === c.fieldCode)
                          ?.label ?? "—"}
                      </td>
                      <td className="content-cell" title={c.content}>
                        {c.content}
                      </td>
                      <td>{deptName[c.departmentId] ?? "—"}</td>
                      <td>
                        {c.processStatus
                          ? PROCESS_STATUS_LABEL[c.processStatus]
                          : "미정"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
