# 통합민원정보 — 웹 보고서 스키마

> **원본:** `docs/테스트자료 3.xlsx`  
> **기준일:** 2026-09-14  
> **데이터 입력·갱신 순서:** 관리대장 → 부서별현황 → 총괄표 → 일일보고  
> **구현 코드:** `src/schema/` (`types.ts`, `master.ts`, `aggregate.ts`, `seed.ts`)

원본 엑셀은 시트 4장이 서로 `COUNTIF`/`COUNTIFS`로 연결된다.  
**관리대장만 쓰기(Write)** 하고, 나머지 3장은 **파생 뷰(Read/Aggregate)** 로 설계한다.

---

## 1. 원본 시트 역할

| 시트 | 역할 | 웹에서의 성격 |
|---|---|---|
| `관리대장` | 민원 1건 = 1행. 단일 원천(SSOT) | 입력·수정 화면 |
| `부서별현황` | 처리부서별 건수/완료/미처리/처리율 | 파생 집계 화면 |
| `총괄표` | 처리개요·기간·경로·분야·실국 다차원 요약 | 파생 집계 화면 |
| `일일보고` | 경로×분야 매트릭스 + 동별 시민불편 | 파생 일일 보고서 |
| `Sheet2` | 접수경로·분야·처리구분·부서·실국·동 코드표 | 마스터(룩업) 데이터 |

엑셀 수식 근거(요약):

- 부서별현황 `C111` = `COUNTIF(관리대장!N:N, 부서명)`
- 총괄표 `A6` = `COUNTA(관리대장!A5:A10)` (접수 건수)
- 일일보고 `H9`(시민불편×도로 접수누적) = `COUNTIFS(관리대장 경로*불편*, 분야*도로*)`
- 일일보고 `F9`(일접수) = 위 조건 + `통보일 = TODAY()`

---

## 2. 데이터 흐름

```
[마스터] 부서·동·분야·경로 코드
           │
           ▼
① 관리대장  ──등록/수정/상태변경──►  Complaint (트랜잭션)
           │
           ├──────────────► ② 부서별현황  (부서 단위 rollup)
           │
           ├──────────────► ③ 총괄표      (경로·분야·실국·기간 rollup)
           │
           └──────────────► ④ 일일보고    (보고일 기준 매트릭스 + 동별)
```

**갱신 규칙**

1. 민원 등록·상태 변경은 항상 `Complaint`에만 반영한다.
2. 부서별현황·총괄표·일일보고는 DB에 중복 저장하지 않고, **조회 시점 집계** 또는 **보고일 스냅샷**으로 제공한다.
3. “일일보고 확정”이 필요하면 `DailyReportSnapshot`에 해당 보고일 집계 결과를 고정 저장한다(선택).

---

## 3. 코드 마스터 (Sheet2)

### 3.1 분야 `FieldCode`

| code | label |
|---|---|
| `ROAD` | 도로,도시정비 |
| `PARK` | 공원,녹지,하천 |
| `CLEAN` | 청소,환경 |
| `TRAFFIC` | 교통,가로정비 |
| `BUILDING` | 건축,광고물 |
| `ETC` | 기타 |

### 3.2 처리구분 `ProcessStatus`

| code | label | 집계 버킷 |
|---|---|---|
| `DONE` | 처리완료 | 완료(처리) |
| `SCHEDULED` | 처리예정 | 미처리 |
| `IMPOSSIBLE` | 처리불가 | 미처리 |

### 3.3 접수경로 `ReceiptRoute`

세부 코드는 엑셀 `Sheet2`와 동일하게 유지한다.

| group (일일보고 행) | 세부 route 예시 |
|---|---|
| `MOBILE` 기동처리반 | 기동처리반 점검사항 |
| `DUTY` 당직 | 당직(시), 당직(완산구), 당직(덕진구) |
| `CITIZEN` 시민불편 | 시민불편(중앙동) … 시민불편(혁신동) — 동별 35종 |
| `OFFICIAL` 공무원제보 | 공무원 제보 |
| `ETC` 기타 | 기타(언론,전화 등) |

> 총괄표의 접수경로별 현황은 **세부 route 그룹**(기동처리반 / 당직(시) / 당직(구) / 시민불편(동) / 공무원 제보 / 기타)을 사용한다.  
> 일일보고 매트릭스는 **4행 그룹**(기동·당직·시민불편·공무원제보)으로 축약한다.

### 3.4 행정동 `Dong`

| district | dongs |
|---|---|
| `WANSAN` 완산구 (19) | 중앙동, 풍남동, 노송동, 완산동, 동서학동, 서서학동, 중화산1동, 중화산2동, 평화1동, 평화2동, 서신동, 삼천1동, 삼천2동, 삼천3동, 효자1동, 효자2동, 효자3동, 효자4동, 효자5동 |
| `DEOKJIN` 덕진구 (16) | 진북동, 인후1동, 인후2동, 인후3동, 덕진동, 금암동, 팔복동, 우아1동, 우아2동, 호성동, 송천1동, 송천2동, 송천3동, 조촌동, 여의동, 혁신동 |

시민불편 접수경로는 `시민불편({동명})` 형식으로 동과 1:1 매핑한다.

### 3.5 처리부서 `Department` / 실국 `Bureau`

- 부서 127개 (`부서별현황` 연번 1–127, Sheet2 동일)
- 실국(상위) 17개: 직속, 기획조정실, 광역도시기반조성국, 경제산업국, 인구청년정책국, 복지환경국, 문화체육관광국, 건설안전국, 자연순환녹지국, 대중교통국, 보건소, 농업기술센터, 상하수도본부, 도서관평생학습본부, 사업소, 완산구, 덕진구
- 부서명은 `"실국명 과명"` 또는 `"(부시장 직속) …"` / `"(사업소) …"` 패턴.  
  `bureau_id`는 부서 마스터에 외래키로 고정한다.

---

## 4. 핵심 엔티티

### 4.1 ER 개요

```
Bureau 1──* Department
Dong   *──1 District
Complaint *──1 ReceiptRoute
Complaint *──1 FieldCode
Complaint *──1 Department
Complaint *──? ProcessStatus
Complaint *──? Dong          (시민불편인 경우 route에서 파생 가능)
```

### 4.2 `Complaint` (관리대장 — 쓰기 모델)

| 필드 | 타입 | 원본 열 | 설명 |
|---|---|---|---|
| `id` | UUID / serial | 연번 | PK |
| `receipt_route_code` | enum/string | 접수경로 | Sheet2 세부 경로 |
| `receipt_route_group` | enum | (파생) | MOBILE/DUTY/CITIZEN/OFFICIAL/ETC |
| `received_at` | date | 접수일(점검일) | |
| `notified_at` | date \| null | 처리부서 통보일 | 일접수 판정 기준 |
| `complainant_name` | string | 성명 | 익명 허용 |
| `complainant_phone` | string \| null | 연락처 | |
| `field_code` | enum | 분야 | FieldCode |
| `content` | text | 민원(통보)내용 | |
| `location` | string \| null | 위치 | |
| `photo_receipt_url` | string \| null | 민원사항.현장사진 | |
| `process_status` | enum \| null | 처리구분 | DONE/SCHEDULED/IMPOSSIBLE |
| `completed_or_due_at` | date \| null | 처리완료일(예정일) | |
| `pending_reason` | string \| null | 미처리 사유 | |
| `department_id` | FK | 처리부서 | |
| `assignee_name` | string \| null | 담당자 | |
| `photo_before_url` | string \| null | 처리 전 | |
| `photo_after_url` | string \| null | 처리 후 | |
| `remark` | string \| null | 비고 | |
| `created_at` / `updated_at` | datetime | — | |

**파생 속성**

| 속성 | 계산 |
|---|---|
| `elapsed_days` | `today - notified_at` (또는 완료일이면 `completed_or_due_at - notified_at`) — 총괄표 처리기간 버킷용 |
| `is_processed` | `process_status === DONE` |
| `is_unprocessed` | `SCHEDULED \| IMPOSSIBLE` |
| `dong_code` | route가 `시민불편(*)`이면 괄호 안 동명 |

샘플(원본 2건):

| id | route | field | dept | status |
|---|---|---|---|---|
| 1 | 시민불편사항(우아2동) | 교통,가로정비 | 덕진구 산업교통과 | (미기재→처리불가 계산열) |
| 2 | 시민불편사항(조촌동) | 청소,환경 | 덕진구 청소위생과 | (미기재→처리불가 계산열) |

> 원본 샘플은 `처리구분` 열이 비어 있고 `처리일 계산` 열이 `처리불가`다. 웹에서는 **처리구분을 필수**로 두고, 기간 계산은 서버에서 수행한다.

---

## 5. 파생 뷰 스키마

집계 쿼리는 모두 `Complaint` + 마스터에서 계산한다.  
`report_date`(= 보고일, 기본 오늘)를 파라미터로 받는다.

### 5.1 부서별현황 `DepartmentStatusRow`

| 필드 | 계산 |
|---|---|
| `department_id` | 마스터 |
| `department_name` | 마스터 |
| `bureau_id` | 마스터 |
| `complaint_count` | `COUNT` where dept |
| `done_count` | status = DONE |
| `unprocessed_count` | status ∈ {SCHEDULED, IMPOSSIBLE} |
| `process_rate` | `done / complaint_count` (0이면 0) |

합계 행 = 전 부서 SUM. (엑셀 `C4=SUM(C5:C1001)`)

### 5.2 총괄표 `SummaryReport`

#### 처리개요 `ProcessOverview`

| 필드 | 계산 |
|---|---|
| `received_count` | 전체 건수 |
| `done_count` / `done_rate` | DONE 건수 / 비율 |
| `unprocessed_count` / `unprocessed_rate` | 미처리 건수 / 비율 |

#### 처리기간별 `PeriodBucket`

버킷: `D1_3` | `D4_5` | `D6_7` | `D8_10` | `D_OVER_10` | `SCHEDULED` | `IMPOSSIBLE`  
→ `elapsed_days` 및 `process_status`로 분류.

#### 차원별 현황 `DimensionStat` (경로 / 분야 / 실국 공통)

| 필드 | 설명 |
|---|---|
| `dimension` | `route_group_detail` \| `field` \| `bureau` |
| `key` | 코드 |
| `received_count` / `received_ratio` | 접수 건수·전체 대비 비율 |
| `unprocessed_count` / `unprocessed_ratio` | 미처리 건수·해당 차원 접수 대비(또는 전체 대비 — 원본은 분모가 섹션 총접수) |

원본 총괄표 비율 분모: 섹션 헤더의 총접수(`$C$12`, `$C$18` 등).

### 5.3 일일보고 `DailyReport`

#### A. 생활민원 일일현황 매트릭스

축:

- 행: `route_group` ∈ {MOBILE, DUTY, CITIZEN, OFFICIAL} (+ 합계)
- 열: `field` 6종 (+ 계)

셀 메트릭 `DailyCellMetrics`:

| 필드 | 엑셀 | 계산 |
|---|---|---|
| `daily_received` | 일접수 | `notified_at == report_date` |
| `cumulative_done` | 처리누적 | `process_status == DONE` (기간: 연초~보고일 또는 전체 — 원본은 관리대장 범위 전체) |
| `cumulative_received` | 접수누적 | 해당 경로·분야 전체 건수 |

합계 열/행은 SUM.  
**입력자료** 블록은 동일 매트릭스를 `"일접수/처리누적/접수누적"` 문자열로 표시하는 뷰 전용 포맷이다.

#### B. 동별 시민불편 현황

| 필드 | 계산 |
|---|---|
| `district` | 완산구 / 덕진구 |
| `dong_code` | 동 |
| `count` | `receipt_route_group == CITIZEN` AND 해당 동 |

구 합계 = 산하 동 SUM.

---

## 6. TypeScript 스키마 (구현용)

```ts
/** 마스터 */
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

export type DistrictCode = "WANSAN" | "DEOKJIN";

export interface Department {
  id: string;
  name: string; // "덕진구 산업교통과"
  bureauId: string;
  sortOrder: number; // 1..127
}

export interface Dong {
  code: string; // "우아2동"
  district: DistrictCode;
  citizenRouteLabel: string; // "시민불편(우아2동)"
}

/** ① 관리대장 — 유일한 Write 모델 */
export interface Complaint {
  id: string;
  receiptRouteCode: string;
  receiptRouteGroup: RouteGroup;
  receivedAt: string; // YYYY-MM-DD
  notifiedAt: string | null;
  complainantName: string;
  complainantPhone: string | null;
  fieldCode: FieldCode;
  content: string;
  location: string | null;
  photoReceiptUrl: string | null;
  processStatus: ProcessStatus | null;
  completedOrDueAt: string | null;
  pendingReason: string | null;
  departmentId: string;
  assigneeName: string | null;
  photoBeforeUrl: string | null;
  photoAfterUrl: string | null;
  remark: string | null;
  dongCode: string | null; // 시민불편일 때
}

/** ② 부서별현황 */
export interface DepartmentStatusRow {
  departmentId: string;
  departmentName: string;
  bureauId: string;
  complaintCount: number;
  doneCount: number;
  unprocessedCount: number;
  processRate: number; // 0..1
}

/** ③ 총괄표 */
export interface ProcessOverview {
  receivedCount: number;
  doneCount: number;
  doneRate: number;
  unprocessedCount: number;
  unprocessedRate: number;
}

export type PeriodBucketKey =
  | "D1_3"
  | "D4_5"
  | "D6_7"
  | "D8_10"
  | "D_OVER_10"
  | "SCHEDULED"
  | "IMPOSSIBLE";

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

/** ④ 일일보고 */
export interface DailyCellMetrics {
  dailyReceived: number;
  cumulativeDone: number;
  cumulativeReceived: number;
}

export interface DailyMatrix {
  reportDate: string;
  /** rows: RouteGroup without ETC + TOTAL; cols: FieldCode + TOTAL */
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

/** 선택: 일일보고 확정 스냅샷 */
export interface DailyReportSnapshot {
  reportDate: string; // unique
  payload: DailyReport;
  frozenAt: string; // ISO datetime
  frozenBy: string | null;
}
```

---

## 7. 집계 API 계약 (권장)

| 순서 | Method | Path | 설명 |
|---|---|---|---|
| ① 쓰기 | `POST/PATCH` | `/api/complaints` | 관리대장 CRUD |
| ② 조회 | `GET` | `/api/reports/by-department` | 부서별현황 |
| ③ 조회 | `GET` | `/api/reports/summary?date=` | 총괄표 |
| ④ 조회 | `GET` | `/api/reports/daily?date=` | 일일보고 |
| 확정 | `POST` | `/api/reports/daily/{date}/freeze` | 스냅샷 저장 |

쓰기 후 ②③④는 즉시 재계산되어 갱신된다.  
확정(freeze) 이후 해당 날짜 일일보고는 스냅샷을 우선 반환한다.

---

## 8. 화면 ↔ 스키마 매핑

| 화면 | 주 모델 | 입력 가능 |
|---|---|---|
| 관리대장(관리보고) | `Complaint` | ✅ |
| 부서별현황 | `DepartmentStatusRow[]` | ❌ (읽기) |
| 총괄표 | `SummaryReport` | ❌ (읽기) |
| 일일보고 | `DailyReport` | ❌ (읽기) / 확정만 가능 |

---

## 9. 검증 체크리스트 (원본 샘플 기준)

보고일·데이터 범위가 원본과 같다면:

| 검증 항목 | 기대값 |
|---|---|
| 접수 총건수 | 2 |
| 부서별: 덕진구 산업교통과 | 1 / 완료0 |
| 부서별: 덕진구 청소위생과 | 1 / 완료0 |
| 분야: 청소·환경 접수 | 1 |
| 분야: 교통·가로정비 접수 | 1 |
| 실국: 덕진구 접수 | 2 |
| 일일 매트릭스 시민불편 접수누적 | 계 2, 청소1, 교통1 |
| 동별: 우아2동·조촌동 | 각 1, 덕진구 합 2 |

---

## 10. 구현 시 주의

1. **원천 단일화:** 집계 시트를 DB 테이블로 복제하지 않는다.
2. **경로 그룹 매핑:** 세부 `시민불편(동)` → 일일보고 `시민불편` 행, 총괄표 `시민불편(동)` 열.
3. **일접수 기준:** 원본은 `처리부서 통보일 == TODAY()`. 웹도 `notifiedAt === reportDate`로 통일.
4. **비율 0건:** 원본 `#DIV/0!` → 웹에서는 `0` 또는 `null` 표시로 정규화.
5. **개인정보:** 성명·연락처는 관리대장 화면에서만 노출, 집계 화면에는 포함하지 않는다.
