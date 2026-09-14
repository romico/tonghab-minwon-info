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

export interface DailyReportSnapshot {
  reportDate: string;
  payload: DailyReport;
  frozenAt: string;
  frozenBy: string | null;
}
