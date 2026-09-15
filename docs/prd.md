# 통합민원정보 — 제품요구사항정의서 (PRD)

| 항목 | 내용 |
|---|---|
| **문서 유형** | Product Requirements Document |
| **작성 방식** | 코드베이스 리버스 엔지니어링 (구현 기준) |
| **제품명** | 통합민원정보 (`tonghab-minwon-info`) |
| **브랜드 표시** | Jeonju AX |
| **현재 버전** | 0.1.2 |
| **기준 커밋/릴리즈** | `v0.1.2` Windows Portable |
| **원본 업무 양식** | `docs/테스트자료 3.xlsx` (관리대장·부서별현황·총괄표·일일보고) |
| **관련 기술 문서** | [`docs/report-schema.md`](./report-schema.md) |
| **문서 목적** | 구현된 범위·규칙·제약·미구현 항목을 단일 문서로 고정하여 유지보수·인수·후속 기획에 사용 |

> **원칙:** 본 PRD는 **코드에 존재하는 동작만** 요구사항으로 기술한다.  
> 스키마 문서에만 있고 API/UI가 없는 항목은 **「미구현 / 향후」** 로 분리한다.

---

## 1. 제품 개요

### 1.1 한 줄 정의

전주시 생활민원을 **관리대장(SSOT)** 한곳에 입력·가져오기하고, 통보일 기간으로 걸러 **부서별현황·총괄표·일일보고**를 로컬에서 실시간 집계하며, 개별·통합 엑셀로 내보내는 **단일 관리자용 Windows 포터블 웹앱**이다.

### 1.2 배경·문제

| 기존 | 문제 | 제품 대응 |
|---|---|---|
| Excel 4시트 + COUNTIF 연결 | 수식 깨짐, 다중 파일 복사, 이미지·개인정보 관리 곤란 | 관리대장만 쓰고 나머지는 조회 시점 집계 |
| 일일보고 수동 갱신 | 보고일·경로×분야 매트릭스 수작업 | `buildDailyReport` 자동 산출 |
| PC별 Node/환경 의존 | 현장 PC 설치 부담 | Node 22 win-x64 내장 포터블 ZIP |

### 1.3 목표 (Goals)

1. 관리대장 CRUD·HWPX 가져오기로 민원 원천을 유지한다.
2. 부서/총괄/일일 파생 화면이 원천과 항상 일치한다(중복 저장 없음).
3. 원본 엑셀 양식에 맞춘 시트별·통합 엑셀을 제공한다.
4. 로컬 SQLite + 세션 인증으로 오프라인에 가까운 단독 운영이 가능하다.
5. 로그인·민원 변경·설정 변경을 감사 로그로 남긴다.

### 1.4 비목표 (Non-Goals) — 현재 버전

- 다중 역할(RBAC)·조직 단위 권한
- 클라우드 멀티테넌시·원격 동기화
- 일일보고 **확정(freeze) 스냅샷 API** (`DailyReportSnapshot`)
- OAuth / SSO
- 모바일 네이티브 앱

### 1.5 사용자

| 페르소나 | 설명 | 권한 |
|---|---|---|
| **관리자** | 시 생활민원 담당(단일 계정 중심) | 전 기능 접근 |

기본 시드 계정: `admin` / `admin` (유저 0명일 때 서버가 생성).

### 1.6 성공 지표 (구현 관점)

- 관리대장 1건 등록 → 부서·총괄·일일·대시보드 KPI가 즉시 반영
- 포터블 ZIP 압축 해제 후 `my-minwon-server.bat`만으로 `http://127.0.0.1:8787` 기동
- 통합 엑셀 4시트가 각 화면 개별 내보내기와 동일 양식

---

## 2. 제품 범위·정보 구조

### 2.1 정보 아키텍처 (네비게이션)

| 순서 | 경로 | 라벨 | 성격 |
|---|---|---|---|
| 홈 | `/` | 대시보드 | 현황·우선순위·통합 엑셀 |
| 1 | `/ledger` | 관리대장 | **쓰기 SSOT** |
| 2 | `/departments` | 부서별현황 | 파생 집계 |
| 3 | `/summary` | 총괄표 | 파생 집계 |
| 4 | `/daily` | 일일보고 | 파생 집계 |
| — | `/audit` | 감사로그 | 운영 |
| — | `/settings` | 설정 | 운영 |
| — | `/login` | 로그인 | 인증 |

**데이터 갱신 순서(업무):** 관리대장 → (자동) 부서별현황 → 총괄표 → 일일보고.

### 2.2 시스템 컨텍스트

```
[관리자 브라우저]
       │  cookie tm_session / JSON API
       ▼
[Express :8787] ── static dist/ (프로덕션)
       │
       ▼
[SQLite] data/tonghab-minwon.db
  · users / sessions / app_settings
  · complaints (id + JSON)
  · audit_logs
```

집계(부서·총괄·일일)는 **DB 테이블이 아니라** 클라이언트 `ComplaintStore`가 `filteredComplaints`에 대해 `src/schema/aggregate.ts`를 호출해 메모리에서 계산한다.

---

## 3. 기술 요구사항 (구현 스택)

| 계층 | 기술 | 비고 |
|---|---|---|
| Frontend | React 19, React Router 7, Vite 7, TypeScript 5.9 | SPA |
| Backend | Express 5 | 개발 `tsx`, 배포 esbuild → `server.cjs` |
| DB | `node:sqlite` (`DatabaseSync`), WAL | `--experimental-sqlite` |
| Auth | scrypt 해시, 세션 토큰 | HttpOnly 쿠키 `tm_session` |
| Export | exceljs + file-saver | |
| Import | jszip (HWPX=ZIP) | |
| 배포 | `scripts/build-release.mjs` | Node 22.18.0 win-x64 번들 |

환경 변수:

| 변수 | 기본 | 의미 |
|---|---|---|
| `PORT` | `8787` | HTTP 포트 |
| `HOST` | `127.0.0.1` | 바인딩 |
| `TM_DATA_DIR` | `cwd/data` | DB 디렉터리 |
| `NODE_ENV` | (포터블 `production`) | |

요청 body limit: **50mb** (사진 data URL 대비).

---

## 4. 기능 요구사항

### 4.1 인증·세션 (FR-AUTH)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-AUTH-01 | 미인증 사용자는 보호 API·앱 본문을 사용할 수 없다 | `/api/health`, `/api/auth/login` 제외 `requireAuth` |
| FR-AUTH-02 | 로그인 성공 시 세션 쿠키 발급 | `tm_session`, HttpOnly, SameSite=Lax |
| FR-AUTH-03 | 세션 TTL은 설정값(분)을 따른다 | 기본 30, 최소 10 (`app_settings.session_ttl_minutes`) |
| FR-AUTH-04 | 만료 60초 전 자동 refresh | AuthStore |
| FR-AUTH-05 | 사용자 활동(클릭/키) 시 남은 시간 &lt; TTL/2 이면 refresh | |
| FR-AUTH-06 | 로그아웃 시 서버 세션 폐기 + 쿠키 제거 | |
| FR-AUTH-07 | 비밀번호 변경: 현재 비번 확인, 새 비번 ≥4자 | 성공 시 **타 세션 revoke**, 현재 세션 유지·연장 |
| FR-AUTH-08 | 역할(RBAC)은 없다 | username만 표시 |

**화면:** `/login`, `/settings` (세션·비밀번호).

---

### 4.2 글로벌 레이아웃·기간 필터 (FR-LAYOUT)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-LAYOUT-01 | 사이드바에 네비·브랜드·로그아웃 | `AppLayout` |
| FR-LAYOUT-02 | **통보일(`notifiedAt`)** 기준 기간 From~To 필터 | `periodFrom` / `periodTo` (localStorage) |
| FR-LAYOUT-03 | 기간 활성 시 통보일이 없거나 범위 밖인 건은 제외 | `filteredComplaints` |
| FR-LAYOUT-04 | `/audit`, `/settings`에서는 기간 UI 숨김 | |
| FR-LAYOUT-05 | 사이드바에 전체/필터 건수 표시 | 예: `4건` 또는 `기간 n/m건` |
| FR-LAYOUT-06 | 모바일에서 버거 메뉴로 사이드바 토글 | |

> **용어 주의:** UI 문구 “보고일 기준 기간”은 구현상 **통보일 기간 필터**이다.  
> 스토어의 `reportDate`(일일 일접수·총괄 기간버킷용)와는 별개이며, **보고일 변경 UI는 현재 없음**(기본=오늘 또는 localStorage 잔존값).

---

### 4.3 대시보드 `/` (FR-DASH)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-DASH-01 | 로그인 후 기본 진입 경로 | `/` |
| FR-DASH-02 | KPI: 전체 / 완료 / 예정 / 불가 / 미정 | `processStatus` 및 null=미정 |
| FR-DASH-03 | KPI·상태 클릭 시 관리대장 상태 필터 이동 | `/ledger?status=` |
| FR-DASH-04 | 추세 차트: 접수·완료 일별 | 기간 없으면 최근 14일, 상한 90일 |
| FR-DASH-05 | 부서 부하 Top N | 클릭 시 `/departments?dept=` |
| FR-DASH-06 | 처리예정 우선순위 목록 | 마감/대기일 기준 |
| FR-DASH-07 | 최근 민원 목록 | |
| FR-DASH-08 | **통합 엑셀 다운로드** | 4시트 단일 파일 (아래 4.8) |
| FR-DASH-09 | 데이터 새로고침 | `GET /api/complaints` 재조회 |

---

### 4.4 관리대장 `/ledger` (FR-LEDGER) — SSOT

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-LEDGER-01 | 민원 목록·등록·수정·삭제 | API PUT/POST/DELETE |
| FR-LEDGER-02 | URL `q` / `status` / `dept` / `edit` 동기화 | 검색·필터·수정 진입 |
| FR-LEDGER-03 | 분야·처리상태·부서 필터 | |
| FR-LEDGER-04 | HWPX 다중 가져오기 → 초안 확인 → 일괄 등록 | `HwpxImportPanel` |
| FR-LEDGER-05 | 개인정보 UI 기본 마스킹, 보기 토글 | `MaskedPersonalInfo` |
| FR-LEDGER-06 | 엑셀 다운로드 + 마스킹 옵션 | 시트 `(관리대장)` |
| FR-LEDGER-07 | 삭제 시 확인 모달(미리보기) | |
| FR-LEDGER-08 | 사진: receipt / before / after / other | data URL 저장 가능 |

**민원 도메인 필드(필수 개념):**

| 필드 | 설명 |
|---|---|
| `receiptRouteCode` | 접수경로 문자열(마스터 규칙) |
| `receivedAt` / `notifiedAt` | 접수일 / 통보일 (ISO `YYYY-MM-DD`) |
| `complainantName` / `complainantPhone` | 민원인 |
| `fieldCode` | ROAD\|PARK\|CLEAN\|TRAFFIC\|BUILDING\|ETC |
| `content` / `location` | 내용 / 위치 |
| `processStatus` | DONE\|SCHEDULED\|IMPOSSIBLE\|**null(미정)** |
| `completedOrDueAt` | 완료일 또는 예정일 |
| `pendingReason` | 미처리 사유 |
| `departmentId` | `dept-1` … `dept-127` |
| `assigneeName` / `remark` | 담당자 / 비고 |
| `photos[]` | 역할별 이미지 |
| `dongCode` | 시민불편 경로에서 파생 |

---

### 4.5 부서별현황 `/departments` (FR-DEPT)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-DEPT-01 | 부서별 민원건수·완료·미처리·처리율 | `buildDepartmentStatus` |
| FR-DEPT-02 | 필터 `dept`, `status`(NONE=미정) | URL 연동 |
| FR-DEPT-03 | 건 클릭 시 관리대장 수정 진입 | `returnTo` 상태 |
| FR-DEPT-04 | 엑셀은 **필터와 무관** 전체 부서 집계 | 시트 `(부서별현황)` |

**미처리 정의:** `processStatus === SCHEDULED || IMPOSSIBLE`  
(`null` 미정은 미처리 카운트에 **포함하지 않음**).

---

### 4.6 총괄표 `/summary` (FR-SUM)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-SUM-01 | 처리개요: 접수·처리(건수·율)·미처리(건수·율) | |
| FR-SUM-02 | 처리기간별 버킷 | D1_3 … D_OVER_10, SCHEDULED, IMPOSSIBLE |
| FR-SUM-03 | 접수경로별·분야별·실국별 차원 | 접수/미처리 건수·비율 |
| FR-SUM-04 | 엑셀 `(총괄표)` | 원본 양식 레이아웃 |

**기간 버킷 규칙(요약):**

1. 상태가 SCHEDULED / IMPOSSIBLE 이면 해당 버킷.
2. DONE이면 `notifiedAt` → (`completedOrDueAt` 또는 `reportDate`) 일수로 D1_3…D_OVER_10.
3. DONE인데 `notifiedAt` 없으면 버킷 미집계.

---

### 4.7 일일보고 `/daily` (FR-DAILY)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-DAILY-01 | 경로그룹 × 분야 매트릭스 | 일접수 / 처리누적 / 접수누적 |
| FR-DAILY-02 | 일접수 = `notifiedAt === reportDate` | |
| FR-DAILY-03 | **ETC 경로그룹은 매트릭스에서 제외** | |
| FR-DAILY-04 | 동별 시민불편(완산/덕진) | `CITIZEN` + `dongCode` |
| FR-DAILY-05 | 엑셀 `(일일보고)` | |

---

### 4.8 엑셀 내보내기 (FR-XLSX)

| ID | 산출물 | 시트 | 파일명 패턴 |
|---|---|---|---|
| FR-XLSX-01 | 관리대장 | `(관리대장)` | `생활민원_관리대장_YYYYMMDD.xlsx` |
| FR-XLSX-02 | 부서별 | `(부서별현황)` | `부서별_처리현황_YYYYMMDD.xlsx` |
| FR-XLSX-03 | 총괄 | `(총괄표)` | `생활민원_처리현황_총괄표_YYYYMMDD.xlsx` |
| FR-XLSX-04 | 일일 | `(일일보고)` | `생활민원_일일보고_YYYYMMDD.xlsx` |
| FR-XLSX-05 | 통합(대시보드) | 위 4장 순서 | `생활민원_통합보고서_YYYYMMDD.xlsx` |

공통:

- 라이브러리: ExcelJS, 맑은 고딕 스타일·원본 유사 헤더 색.
- 관리대장 이미지: data URL을 셀에 embed (옵션 off 시 장수/있음 표기).
- 통합 내보내기 기본: **개인정보 마스킹 false**, 이미지 포함 true (대시보드에 마스킹 토글 없음).
- 내보내기 행위 자체는 **감사 로그 미기록**.

구현 모듈: `src/export/{ledger,department,summary,daily,combined}Excel.ts`  
시트 작성 함수 `add*Sheet` 재사용.

---

### 4.9 HWPX 가져오기 (FR-HWPX)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-HWPX-01 | `.hwpx` 다중 선택 | ZIP 내 section XML + `BinData/` |
| FR-HWPX-02 | 이미지 JPEG 압축 | maxWidth 720, quality 0.72 → data URL |
| FR-HWPX-03 | 성명·전화·제목·내용·위치·부서·담당자 휴리스틱 추출 | |
| FR-HWPX-04 | 동 추정 시 `시민불편({동})` 경로 | 실패 시 기타 경로 폴백 |
| FR-HWPX-05 | 기본 처리상태 추정 | 불가 문구 없으면 `SCHEDULED` |
| FR-HWPX-06 | 초안 검토 후 일괄 `POST /api/complaints` | `COMPLAINT_BATCH_CREATE` 감사 |

**제약:** 휴리스틱이므로 부서·분야·상태 오추정 가능 → 등록 전 사용자 확인이 필수 UX.  
**저장·압축·역할·용량 정책 전문:** [photo-hwpx-policy.md](./photo-hwpx-policy.md)

---

### 4.10 감사로그 `/audit` (FR-AUDIT)

| action | 의미 |
|---|---|
| `LOGIN_SUCCESS` / `LOGIN_FAIL` / `LOGOUT` | 인증 |
| `PASSWORD_CHANGE` | 비밀번호 변경 |
| `SETTINGS_UPDATE` | 세션 TTL 변경(before/after) |
| `COMPLAINT_CREATE` / `UPDATE` / `DELETE` | 단건 + detail |
| `COMPLAINT_BATCH_CREATE` | 일괄 건수 |
| `COMPLAINT_REPLACE` | 전체 교체 |
| `COMPLAINT_RESET_SEED` | DB 초기화 |

| ID | 요구사항 |
|---|---|
| FR-AUDIT-01 | 필터: action, from, to, username |
| FR-AUDIT-02 | 페이지 크기 기본 50 (API limit 1–200) |
| FR-AUDIT-03 | IP·User-Agent·시각 기록 |
| FR-AUDIT-04 | 모바일 카드형 레이아웃 지원 |

---

### 4.11 설정 `/settings` (FR-SET)

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| FR-SET-01 | 세션 TTL 조회·저장 | 최소 10분 |
| FR-SET-02 | 현재 TTL·만료시각·최소값 표시 | |
| FR-SET-03 | 비밀번호 변경 폼 | FR-AUTH-07 |
| FR-SET-04 | DB 초기화: 비밀번호 재확인 모달 | |
| FR-SET-05 | 초기화 후 | `complaints` → 시드 2건; **users·sessions·settings·audit 유지** |
| FR-SET-06 | 레이아웃 | 세로 스택 패널(그리드 레이아웃 미사용), admin 배지 우측 정렬 |

---

## 5. API 요구사항

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/health` | × | 헬스·DB |
| POST | `/api/auth/login` | × | 로그인 |
| POST | `/api/auth/logout` | ○ | 로그아웃 |
| GET | `/api/auth/me` | ○ | 세션 조회 |
| POST | `/api/auth/refresh` | ○ | TTL 연장 |
| POST | `/api/auth/change-password` | ○ | 비번 변경 |
| GET | `/api/settings` | ○ | TTL |
| PUT | `/api/settings` | ○ | TTL 저장 |
| GET | `/api/audit` | ○ | 감사 목록 |
| GET | `/api/complaints` | ○ | 전체 |
| PUT | `/api/complaints` | ○ | upsert |
| POST | `/api/complaints` | ○ | 단건 또는 `{ items }` |
| POST | `/api/complaints/replace` | ○ | 전체 교체 |
| POST | `/api/complaints/reset-seed` | ○ | 시드 복원 |
| DELETE | `/api/complaints/:id` | ○ | 삭제 |

개발 시 Vite가 `/api` → `127.0.0.1:8787` 프록시.

---

## 6. 데이터·마스터 요구사항

### 6.1 저장

| 테이블/저장소 | 내용 |
|---|---|
| `complaints` | `id`, `data`(Complaint JSON), `received_at`, `notified_at` |
| `users` | 계정·password_hash |
| `sessions` | 토큰·만료 |
| `app_settings` | session_ttl_minutes 등 |
| `audit_logs` | 감사 |
| localStorage | report-date, period-from/to, 레거시 마이그레이션 플래그 |

### 6.2 마스터 코드 (요약)

상세 표는 `docs/report-schema.md` §3 및 `src/schema/master.ts`.

| 마스터 | 규모/값 |
|---|---|
| 분야 | 6종 FieldCode |
| 처리구분 | DONE / SCHEDULED / IMPOSSIBLE (+ UI 미정 null) |
| 접수경로 그룹 | MOBILE / DUTY / CITIZEN / OFFICIAL / ETC (+ 총괄용 Detail) |
| 부서 | 127 (`dept-1`…`dept-127`), 실국 17 |
| 동 | 완산 19 + 덕진 16 |

### 6.3 시드

`SEED_COMPLAINTS` 샘플 2건. DB 초기화 시 동일 세트로 복원.

---

## 7. 비기능 요구사항 (NFR)

| ID | 분류 | 요구사항 |
|---|---|---|
| NFR-01 | 배포 | Windows 64bit 포터블 ZIP, Node 설치 불필요 |
| NFR-02 | 기동 | `my-minwon-server.bat` → 브라우저 `http://127.0.0.1:8787` |
| NFR-03 | 데이터 이식 | `data/` 폴더 복사로 DB 이전 |
| NFR-04 | 개인정보 | UI 기본 마스킹; 엑셀은 옵션; Secure 쿠키 없음(로컬 HTTP) |
| NFR-05 | 용량 | 사진 data URL로 DB·요청 비대화 가능 → 50mb limit, HWPX 압축 |
| NFR-06 | 보안 경계 | 기본 바인딩 localhost; SmartScreen 경고 가능 |
| NFR-07 | 가용성 | 단일 프로세스·단일 파일 DB; 백업=파일 복사 |
| NFR-08 | 버전 | 앱 `package.json` 0.1.2; 포터블 내부 package 표기는 스크립트상 0.1.0 고정(불일치 허용 중) |

---

## 8. UX·화면 규칙 (구현 반영)

1. **쓰기와 읽기 분리:** 입력은 관리대장, 보고 화면은 파생만.
2. **기간 필터는 전역:** 대시보드·대장·부서·총괄·일일가 동일 `filteredComplaints` 사용.
3. **설정은 세로 패널:** CSS grid로 세션/비밀번호를 2열 배치하지 않음(명시적 제품 결정).
4. **위험 작업:** DB 초기화·민원 삭제는 확인 모달.
5. **대시보드 CTA:** 「통합 엑셀 다운로드」 / 「데이터 새로고침」 인접 배치.

---

## 9. 배포·릴리즈 요구사항

| 단계 | 명령/산출 |
|---|---|
| 빌드 | `npm run build` |
| 포터블 | `npm run release:win` → `release-win/` + `tonghab-minwon-info-windows-portable-v{version}.zip` |
| GitHub Release | 예: `v0.1.2` 에 ZIP 첨부 |
| 사용자 절차 | ZIP 해제 → bat 실행 → admin/admin → 업무 |

포함물: `runtime/node.exe`, `server.cjs`, `dist/`, `data/README.txt`, `사용방법.txt`, `my-minwon-server.bat`.

---

## 10. 제약·엣지케이스 (필수 인지)

| # | 내용 | 영향 |
|---|---|---|
| 1 | `reportDate` 변경 UI 없음 | 일접수·기간버킷이 오늘(또는 잔존 저장값)에 고정 |
| 2 | `DailyReportSnapshot` / freeze API 미구현 | 보고일 확정 이력 없음 |
| 3 | `processStatus === null` | KPI “미정”; 미처리·일부 버킷 제외 |
| 4 | 통보일 없는 건 | 기간 필터 시 제외 |
| 5 | 일일보고 ETC 경로 제외 | 기타 접수 매트릭스 누락 |
| 6 | HWPX 휴리스틱 | 오분류 → 등록 전 검수 필요 |
| 7 | 통합 엑셀 마스킹 옵션 없음 | 원문 개인정보 포함 가능 |
| 8 | 엑셀/HWPX 파싱은 감사 없음 | 등록 API만 감사 |
| 9 | 레거시 localStorage 민원 | 최초 로그인 후 `replace` 마이그레이션 1회 |
| 10 | 포터블 package 버전 하드코딩 | 루트 version과 불일치 가능 |

---

## 11. 미구현 / 향후 백로그 (코드·문서 갭)

`docs/report-schema.md` 등에 언급되었으나 **현재 미구현**:

| 항목 | 설명 | 우선 제안 |
|---|---|---|
| 일일보고 freeze | 보고일 스냅샷 저장·조회 API | P1 (보고 감사 필요 시) |
| 보고일 전용 UI | `reportDate` 선택기 | P0 (일접수 정확도) |
| 통합 엑셀 마스킹 토글 | 대시보드 | P1 |
| RBAC / 다중 사용자 관리 UI | users CRUD | P2 |
| HTTPS / Secure 쿠키 | 사내망 배포 시 | P2 |
| 포터블 version 동기화 | build-release.mjs | P3 |
| 엑셀 내보내기 감사 이벤트 | EXPORT_* | P2 |

---

## 12. 추적 매트릭스 (기능 ↔ 코드)

| 영역 | 주요 경로 |
|---|---|
| 라우팅 | `src/App.tsx` |
| 레이아웃·기간 | `src/components/AppLayout.tsx` |
| 상태 | `src/store/ComplaintStore.tsx`, `AuthStore` |
| 도메인·집계 | `src/schema/*` |
| 화면 | `src/pages/*` |
| API 서버 | `server/index.ts`, `auth.ts`, `db.ts`, `audit.ts` |
| 엑셀 | `src/export/*` |
| HWPX | `src/import/hwpxParser.ts` |
| 배포 | `scripts/build-release.mjs` |

---

## 13. 문서 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| 0.1 | 2026-09-15 | v0.1.2 코드 리버스 엔지니어링 초안 작성 |

---

## 부록 A. 사용자 여정 (핵심)

```
로그인(admin)
  → 대시보드에서 현황 파악 / 통합 엑셀
  → 관리대장: HWPX 또는 수동 등록·상태 갱신
  → 부서별·총괄·일일로 보고 확인·개별 엑셀
  → (선택) 감사로그 점검
  → 설정: TTL·비밀번호 / 필요 시 DB 초기화
```

## 부록 B. 용어

| 용어 | 정의 |
|---|---|
| SSOT | Single Source of Truth — 관리대장 Complaint |
| 통보일 | `notifiedAt`, 기간 필터·일접수 기준일 필드 |
| 보고일 | `reportDate`, 일일 “일접수”·완료 소요일 계산 기준(UI 미노출) |
| 미처리 | SCHEDULED 또는 IMPOSSIBLE |
| 미정 | `processStatus === null` |
| 포터블 | Node 런타임 포함 Windows ZIP 배포본 |
