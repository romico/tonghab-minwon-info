/** 통합민원정보 보고서 스키마 — docs/report-schema.md 기준 */

export type FieldCode =
  | "ROAD"
  | "PARK"
  | "CLEAN"
  | "TRAFFIC"
  | "BUILDING"
  | "ETC";

export type ProcessStatus = "DONE" | "SCHEDULED" | "IMPOSSIBLE";

export type RouteGroup =
  | "MOBILE"
  | "DUTY"
  | "CITIZEN"
  | "OFFICIAL"
  | "ETC";

/** 총괄표 접수경로 세부 그룹 */
export type RouteDetailGroup =
  | "MOBILE"
  | "DUTY_CITY"
  | "DUTY_DISTRICT"
  | "CITIZEN"
  | "OFFICIAL"
  | "ETC";

export type DistrictCode = "WANSAN" | "DEOKJIN";

export type PeriodBucketKey =
  | "D1_3"
  | "D4_5"
  | "D6_7"
  | "D8_10"
  | "D_OVER_10"
  | "SCHEDULED"
  | "IMPOSSIBLE";

export interface Bureau {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Department {
  id: string;
  name: string;
  bureauId: string;
  sortOrder: number;
}

export interface Dong {
  code: string;
  district: DistrictCode;
  citizenRouteLabel: string;
}

export interface FieldOption {
  code: FieldCode;
  label: string;
}

export interface ProcessStatusOption {
  code: ProcessStatus;
  label: string;
}

export interface ComplaintPhoto {
  id: string;
  url: string;
  /** 접수·현장 / 처리전 / 처리후 / 기타 */
  role: "receipt" | "before" | "after" | "other";
  label?: string | null;
  sourceName?: string | null;
}

export interface Complaint {
  id: string;
  receiptRouteCode: string;
  receiptRouteGroup: RouteGroup;
  receivedAt: string;
  notifiedAt: string | null;
  complainantName: string;
  complainantPhone: string | null;
  fieldCode: FieldCode;
  content: string;
  location: string | null;
  /** @deprecated photos[0]과 동기화. 하위 호환용 */
  photoReceiptUrl: string | null;
  processStatus: ProcessStatus | null;
  completedOrDueAt: string | null;
  pendingReason: string | null;
  departmentId: string;
  assigneeName: string | null;
  /** @deprecated photos role=before 와 동기화 */
  photoBeforeUrl: string | null;
  /** @deprecated photos role=after 와 동기화 */
  photoAfterUrl: string | null;
  /** 첨부 이미지 전체 (HWPX BinData 다중 이미지) */
  photos: ComplaintPhoto[];
  remark: string | null;
  dongCode: string | null;
}

export type ComplaintInput = Omit<Complaint, "id" | "receiptRouteGroup" | "dongCode"> & {
  id?: string;
};

export interface DepartmentStatusRow {
  departmentId: string;
  departmentName: string;
  bureauId: string;
  complaintCount: number;
  doneCount: number;
  unprocessedCount: number;
  processRate: number;
}

export interface ProcessOverview {
  receivedCount: number;
  doneCount: number;
  doneRate: number;
  unprocessedCount: number;
  unprocessedRate: number;
}

export interface DimensionStat {
  key: string;
  label: string;
  receivedCount: number;
  receivedRatio: number;
  unprocessedCount: number;
  unprocessedRatio: number;
}

export interface SummaryReport {
  reportDate: string;
  overview: ProcessOverview;
  byPeriod: Record<PeriodBucketKey, number>;
  byRoute: DimensionStat[];
  byField: DimensionStat[];
  byBureau: DimensionStat[];
}

export interface DailyCellMetrics {
  dailyReceived: number;
  cumulativeDone: number;
  cumulativeReceived: number;
}

export interface DailyMatrix {
  reportDate: string;
  /** rowKey: RouteGroup | "TOTAL", colKey: FieldCode | "TOTAL" */
  cells: Record<string, Record<string, DailyCellMetrics>>;
}

export interface DongCitizenStat {
  district: DistrictCode;
  dongCode: string;
  count: number;
}

export interface DailyReport {
  reportDate: string;
  matrix: DailyMatrix;
  dongStats: DongCitizenStat[];
  wansanTotal: number;
  deokjinTotal: number;
}

/** 일자별 스냅샷에 고정하는 KPI (플로우 + 스톡) */
export interface SnapshotKpi {
  reportDate: string;
  /** 일접수: notifiedAt === reportDate */
  dailyReceived: number;
  /** 일완료: DONE && completedOrDueAt === reportDate */
  dailyDone: number;
  /** 일말 처리중(미처리) 잔량: SCHEDULED + IMPOSSIBLE */
  inProgressCount: number;
  /** 누적 접수(스냅샷 대상 집합) */
  cumulativeReceived: number;
  /** 누적 완료 */
  doneCount: number;
  /** 처리불가 잔량 */
  impossibleCount: number;
}

/** 저장·API용 보고 스냅샷 (이력형 — 같은 보고일 재확정 시 새 행) */
export interface ReportSnapshot {
  id: number;
  reportDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  frozenAt: string;
  frozenBy: string | null;
  complaintIds: string[];
  kpi: SnapshotKpi;
  daily: DailyReport;
  note: string | null;
}

/** @deprecated ReportSnapshot 사용. 스키마 문서 호환용 */
export interface DailyReportSnapshot {
  reportDate: string;
  payload: DailyReport;
  frozenAt: string;
  frozenBy: string | null;
}

/** 증감율 비교 한 축 (접수 또는 처리중) */
export interface GrowthMetric {
  current: number;
  baseline: number;
  /** null = 분모 0으로 비율 불가 (절대 건수만 의미) */
  rate: number | null;
  delta: number;
}

export interface SnapshotGrowthComparison {
  reportDate: string;
  baselineDate: string;
  lagDays: number;
  currentSnapshotId: number;
  baselineSnapshotId: number;
  received: GrowthMetric;
  inProgress: GrowthMetric;
  /** 처리중 증감율 − 접수 증감율 (둘 다 rate 있을 때만) */
  gap: number | null;
}
