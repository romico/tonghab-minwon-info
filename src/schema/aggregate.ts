import {
  BUREAUS,
  DAILY_ROUTE_GROUPS,
  DEPARTMENT_BY_ID,
  DEPARTMENTS,
  DONGS,
  FIELD_LABEL,
  FIELD_OPTIONS,
  ROUTE_DETAIL_LABEL,
  ROUTE_GROUP_LABEL,
  inferRouteDetailGroup,
} from "./master";
import type {
  Complaint,
  DailyCellMetrics,
  DailyReport,
  DepartmentStatusRow,
  DimensionStat,
  FieldCode,
  GrowthMetric,
  PeriodBucketKey,
  ProcessOverview,
  RouteDetailGroup,
  RouteGroup,
  SnapshotGrowthComparison,
  SnapshotKpi,
  SummaryReport,
} from "./types";

function emptyMetrics(): DailyCellMetrics {
  return { dailyReceived: 0, cumulativeDone: 0, cumulativeReceived: 0 };
}

function rate(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function isUnprocessed(c: Complaint): boolean {
  return c.processStatus === "SCHEDULED" || c.processStatus === "IMPOSSIBLE";
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

export function classifyPeriod(
  c: Complaint,
  reportDate: string,
): PeriodBucketKey | null {
  if (c.processStatus === "SCHEDULED") return "SCHEDULED";
  if (c.processStatus === "IMPOSSIBLE") return "IMPOSSIBLE";
  if (!c.notifiedAt) return null;
  const end =
    c.processStatus === "DONE" && c.completedOrDueAt
      ? c.completedOrDueAt
      : reportDate;
  const days = dayDiff(c.notifiedAt, end);
  if (days <= 3) return "D1_3";
  if (days <= 5) return "D4_5";
  if (days <= 7) return "D6_7";
  if (days <= 10) return "D8_10";
  return "D_OVER_10";
}

export function buildDepartmentStatus(
  complaints: Complaint[],
): DepartmentStatusRow[] {
  return DEPARTMENTS.map((dept) => {
    const rows = complaints.filter((c) => c.departmentId === dept.id);
    const doneCount = rows.filter((c) => c.processStatus === "DONE").length;
    const unprocessedCount = rows.filter(isUnprocessed).length;
    return {
      departmentId: dept.id,
      departmentName: dept.name,
      bureauId: dept.bureauId,
      complaintCount: rows.length,
      doneCount,
      unprocessedCount,
      processRate: rate(doneCount, rows.length),
    };
  });
}

function dimensionStats(
  keys: { key: string; label: string }[],
  complaints: Complaint[],
  pick: (c: Complaint) => string,
): DimensionStat[] {
  const total = complaints.length;
  return keys.map(({ key, label }) => {
    const rows = complaints.filter((c) => pick(c) === key);
    const unprocessedCount = rows.filter(isUnprocessed).length;
    return {
      key,
      label,
      receivedCount: rows.length,
      receivedRatio: rate(rows.length, total),
      unprocessedCount,
      unprocessedRatio: rate(unprocessedCount, total),
    };
  });
}

export function buildSummaryReport(
  complaints: Complaint[],
  reportDate: string,
): SummaryReport {
  const receivedCount = complaints.length;
  const doneCount = complaints.filter((c) => c.processStatus === "DONE").length;
  const unprocessedCount = complaints.filter(isUnprocessed).length;

  const overview: ProcessOverview = {
    receivedCount,
    doneCount,
    doneRate: rate(doneCount, receivedCount),
    unprocessedCount,
    unprocessedRate: rate(unprocessedCount, receivedCount),
  };

  const byPeriod: Record<PeriodBucketKey, number> = {
    D1_3: 0,
    D4_5: 0,
    D6_7: 0,
    D8_10: 0,
    D_OVER_10: 0,
    SCHEDULED: 0,
    IMPOSSIBLE: 0,
  };
  for (const c of complaints) {
    const bucket = classifyPeriod(c, reportDate);
    if (bucket) byPeriod[bucket] += 1;
  }

  const routeKeys = (
    Object.keys(ROUTE_DETAIL_LABEL) as RouteDetailGroup[]
  ).map((key) => ({ key, label: ROUTE_DETAIL_LABEL[key] }));

  const byRoute = dimensionStats(routeKeys, complaints, (c) =>
    inferRouteDetailGroup(c.receiptRouteCode),
  );

  const byField = dimensionStats(
    FIELD_OPTIONS.map((f) => ({ key: f.code, label: f.label })),
    complaints,
    (c) => c.fieldCode,
  );

  const byBureau = dimensionStats(
    BUREAUS.map((b) => ({ key: b.id, label: b.name })),
    complaints,
    (c) => DEPARTMENT_BY_ID[c.departmentId]?.bureauId ?? "",
  );

  return { reportDate, overview, byPeriod, byRoute, byField, byBureau };
}

export function buildDailyReport(
  complaints: Complaint[],
  reportDate: string,
): DailyReport {
  const rowKeys = ["TOTAL", ...DAILY_ROUTE_GROUPS] as const;
  const colKeys = ["TOTAL", ...FIELD_OPTIONS.map((f) => f.code)] as const;

  const cells: Record<string, Record<string, DailyCellMetrics>> = {};
  for (const row of rowKeys) {
    cells[row] = {};
    for (const col of colKeys) cells[row]![col] = emptyMetrics();
  }

  const matchRow = (group: RouteGroup, row: string) =>
    row === "TOTAL" || row === group;
  const matchCol = (field: FieldCode, col: string) =>
    col === "TOTAL" || col === field;

  for (const c of complaints) {
    if (c.receiptRouteGroup === "ETC") continue;
    for (const row of rowKeys) {
      if (!matchRow(c.receiptRouteGroup, row)) continue;
      for (const col of colKeys) {
        if (!matchCol(c.fieldCode, col)) continue;
        const cell = cells[row]![col]!;
        cell.cumulativeReceived += 1;
        if (c.processStatus === "DONE") cell.cumulativeDone += 1;
        if (c.notifiedAt === reportDate) cell.dailyReceived += 1;
      }
    }
  }

  const dongStats = DONGS.map((d) => ({
    district: d.district,
    dongCode: d.code,
    count: complaints.filter(
      (c) => c.receiptRouteGroup === "CITIZEN" && c.dongCode === d.code,
    ).length,
  }));

  return {
    reportDate,
    matrix: { reportDate, cells },
    dongStats,
    wansanTotal: dongStats
      .filter((d) => d.district === "WANSAN")
      .reduce((s, d) => s + d.count, 0),
    deokjinTotal: dongStats
      .filter((d) => d.district === "DEOKJIN")
      .reduce((s, d) => s + d.count, 0),
  };
}

export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

export function formatTriplet(m: DailyCellMetrics): string {
  return `${m.dailyReceived}/${m.cumulativeDone}/${m.cumulativeReceived}`;
}

export function routeGroupLabel(group: RouteGroup | "TOTAL"): string {
  return group === "TOTAL" ? "계" : ROUTE_GROUP_LABEL[group];
}

export function fieldLabel(code: FieldCode | "TOTAL"): string {
  return code === "TOTAL" ? "계" : FIELD_LABEL[code];
}

export function shiftIsoDate(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 보고일 기준 스냅샷 KPI (플로우·스톡) */
export function buildSnapshotKpi(
  complaints: Complaint[],
  reportDate: string,
): SnapshotKpi {
  let dailyReceived = 0;
  let dailyDone = 0;
  let inProgressCount = 0;
  let doneCount = 0;
  let impossibleCount = 0;

  for (const c of complaints) {
    if (c.notifiedAt === reportDate) dailyReceived += 1;
    if (c.processStatus === "DONE") {
      doneCount += 1;
      if (c.completedOrDueAt === reportDate) dailyDone += 1;
    }
    if (c.processStatus === "IMPOSSIBLE") impossibleCount += 1;
    if (isUnprocessed(c)) inProgressCount += 1;
  }

  return {
    reportDate,
    dailyReceived,
    dailyDone,
    inProgressCount,
    cumulativeReceived: complaints.length,
    doneCount,
    impossibleCount,
  };
}

function growthMetric(current: number, baseline: number): GrowthMetric {
  const delta = current - baseline;
  return {
    current,
    baseline,
    delta,
    rate: baseline === 0 ? null : delta / baseline,
  };
}

/**
 * 두 스냅샷 KPI로 접수·처리중 증감율 비교.
 * 스냅샷이 없는 날은 호출하지 않는다(추정 금지).
 */
export function compareSnapshotGrowth(
  current: SnapshotKpi,
  baseline: SnapshotKpi,
  meta: {
    currentSnapshotId: number;
    baselineSnapshotId: number;
    lagDays: number;
  },
): SnapshotGrowthComparison {
  const received = growthMetric(current.dailyReceived, baseline.dailyReceived);
  const inProgress = growthMetric(
    current.inProgressCount,
    baseline.inProgressCount,
  );
  const gap =
    received.rate != null && inProgress.rate != null
      ? inProgress.rate - received.rate
      : null;

  return {
    reportDate: current.reportDate,
    baselineDate: baseline.reportDate,
    lagDays: meta.lagDays,
    currentSnapshotId: meta.currentSnapshotId,
    baselineSnapshotId: meta.baselineSnapshotId,
    received,
    inProgress,
    gap,
  };
}

export function formatGrowthRate(rate: number | null): string {
  if (rate == null) return "—";
  const pct = Math.round(rate * 1000) / 10;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}
