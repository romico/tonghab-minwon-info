# 새 기여자 온보딩 노트

이 문서는 `romico/tonghab-minwon-info` 저장소에 처음 기여하는 개발자가 **로컬 실행부터 변경 검증과 Pull Request 작성까지** 한 번에 진행할 수 있도록 정리한 안내서입니다. 이 프로젝트는 전주 AX 통합민원정보를 관리하는 내부 운영용 웹 애플리케이션이며, 관리대장 데이터를 기준으로 부서별 현황·총괄표·일일보고·대시보드와 Excel 내보내기를 제공합니다.

> **먼저 읽을 문서**: 제품 요구사항은 [`docs/prd.md`](./prd.md), 시스템 경계와 모듈 관계는 [`docs/architecture.md`](./architecture.md), 데이터 흐름은 [`docs/data-flow.md`](./data-flow.md), 테이블과 파생 보고서 모델은 [`docs/erd.md`](./erd.md)와 [`docs/report-schema.md`](./report-schema.md)에서 확인합니다.

## 1. 저장소 개요

| 항목 | 현재 기준 |
|---|---|
| 기본 브랜치 | `main` (개발) · `master` (최종 릴리스 전용) |
| 앱 유형 | React 단일 페이지 애플리케이션 + Express API |
| 언어 | TypeScript |
| 개발 런타임 | Node.js 22 이상 |
| 데이터베이스 | Node 내장 `node:sqlite` |
| 런타임 DB 위치 | `data/tonghab-minwon.db` |
| 개발 웹 주소 | `http://localhost:5173` |
| 개발 API 주소 | `http://127.0.0.1:9000` |
| 포터블 배포 | Windows / macOS / Linux 포터블 ZIP (기본 포트 9000) |

`main`에서 일상 개발·PR을 진행하고, 최종 릴리스 시에만 `master`로 반영합니다. 런타임 DB, 빌드 산출물, 로컬 환경 파일, 포터블 패키지는 `.gitignore` 대상입니다. 운영 데이터가 들어 있는 `data/tonghab-minwon.db`는 절대 커밋하지 않습니다.

> Windows에서 `listen EACCES` 가 나면 TCP 제외 범위를 의하세요: [`portable-windows-port-troubleshooting.md`](./portable-windows-port-troubleshooting.md)

## 2. 로컬 개발 환경 준비

### 2.1 요구사항

Node.js 22 이상과 Git이 필요합니다. Node.js 22의 내장 SQLite 기능을 사용하므로 낮은 버전에서는 서버가 정상적으로 시작되지 않을 수 있습니다.

```bash
git clone https://github.com/romico/tonghab-minwon-info.git
cd tonghab-minwon-info
node --version
npm --version
npm install
```

### 2.2 개발 서버 실행

프론트엔드와 API를 함께 실행하려면 다음 명령을 사용합니다.

```bash
npm run dev
```

Vite 개발 서버는 `5173` 포트에서 실행되고 `/api` 요청을 `9000` 포트의 Express 서버로 프록시합니다. 브라우저에서 `http://localhost:5173`을 엽니다.

개별 실행이 필요하면 다음 명령을 사용합니다.

```bash
npm run dev:web   # Vite 프론트엔드만 실행
npm run dev:api   # Express API만 실행
```

기본 로그인 계정과 초기 데이터는 인증·시드 구현을 확인한 뒤 사용합니다. 비밀번호나 운영 데이터를 문서, 이슈, 커밋 메시지에 기록하지 않습니다.

### 2.3 환경 변수

환경 변수는 모두 선택 사항이며, 기본값으로 로컬 개발을 시작할 수 있습니다.

| 변수 | 기본값 | 용도 |
|---|---:|---|
| `PORT` | `9000` | Express API 포트 |
| `HOST` | `127.0.0.1` | API 바인딩 주소 |
| `TM_DATA_DIR` | 현재 작업 디렉터리의 `data` | SQLite DB 디렉터리 |
| `TM_DIST_DIR` | 현재 작업 디렉터리의 `dist` | 정적 파일 경로 |
| `TM_SERVE_STATIC` | 자동 결정 | `0`이면 API의 정적 파일 서빙 비활성화 |

개인 테스트 데이터는 저장소 바깥의 별도 디렉터리를 `TM_DATA_DIR`로 지정하는 편이 안전합니다.

## 3. 프로젝트 구조

```text
tonghab-minwon-info/
├── server/                  # Express API, SQLite 접근, 인증, 감사 로그
│   ├── index.ts             # 라우트 등록과 HTTP 서버 시작
│   ├── db.ts                # DB 연결, 스키마 초기화, CRUD 쿼리
│   ├── auth.ts              # scrypt 비밀번호 해시와 세션 쿠키
│   └── audit.ts             # 로그인·설정·민원 변경 감사 기록
├── src/
│   ├── pages/               # 라우트별 화면
│   ├── components/          # 여러 화면에서 재사용하는 UI
│   ├── api/                 # 브라우저에서 API를 호출하는 함수와 타입
│   ├── store/               # 인증·민원 상태와 서버 동기화
│   ├── schema/              # 도메인 타입, 마스터 데이터, 집계 로직
│   ├── export/              # 보고서별 ExcelJS 내보내기
│   ├── import/              # HWPX 민원카드 파싱
│   └── lib/                 # 개인정보 마스킹 등 공통 유틸리티
├── scripts/                 # Windows 포터블 패키지 생성
├── docs/                    # 요구사항, 아키텍처, 데이터 모델, 스냅샷
├── data/                    # 로컬 SQLite 런타임 디렉터리; DB 파일은 미추적
├── .github/workflows/       # GitHub Actions CI·릴리스 워크플로
├── index.html               # Vite 진입 HTML
├── vite.config.ts           # React 플러그인과 `/api` 프록시
├── tsconfig*.json           # 엄격한 TypeScript 설정
└── package.json             # 명령어와 의존성
```

## 4. 요청이 코드로 흐르는 방식

일반적인 민원 변경은 다음 경로를 따릅니다.

```text
페이지
  → src/api의 요청 함수
  → server/index.ts의 Express 라우트
  → server/db.ts의 SQLite 처리
  → 응답
  → src/store의 상태 갱신
  → 페이지와 파생 보고서 재계산
```

`Complaint`가 관리대장의 쓰기 모델입니다. 부서별 현황, 총괄표, 일일보고, 대시보드는 별도의 중복 테이블에 저장하지 않고 관리대장과 마스터 데이터를 바탕으로 파생됩니다. 집계 규칙을 바꿀 때는 먼저 [`src/schema/aggregate.ts`](../src/schema/aggregate.ts)와 [`docs/report-schema.md`](./report-schema.md)를 함께 확인합니다.

### 주요 기능별 진입점

| 기능 | 화면 | 클라이언트 핵심 파일 | 서버·도메인 참고 |
|---|---|---|---|
| 로그인·세션 | `LoginPage` | `src/api/auth.ts`, `src/store/AuthStore.tsx` | `server/auth.ts` |
| 관리대장 CRUD | `LedgerPage` | `src/api/complaints.ts`, `src/store/ComplaintStore.tsx` | `server/index.ts`, `server/db.ts` |
| HWPX 가져오기 | `LedgerPage` 내 패널 | `src/components/HwpxImportPanel.tsx`, `src/import/hwpxParser.ts` | 사진·민원카드 정책 문서 |
| 부서별 현황 | `DepartmentPage` | `src/schema/aggregate.ts`, `src/export/departmentExcel.ts` | 부서 마스터 |
| 총괄표 | `SummaryPage` | `src/export/summaryExcel.ts` | 보고서 스키마 |
| 일일보고 | `DailyPage` | `src/export/dailyExcel.ts` | 보고일·통보일 규칙 |
| 대시보드 | `DashboardPage` | `src/export/combinedExcel.ts` | 파생 집계 |
| 감사로그 | `AuditPage` | `src/api/audit.ts` | `server/audit.ts` |
| 설정·초기화 | `SettingsPage` | `src/api/auth.ts`, `src/store/ComplaintStore.tsx` | 권한과 감사 기록 |

## 5. 핵심 도메인 규칙

**처리 상태는 필수 값입니다.** `DONE`, `SCHEDULED`, `IMPOSSIBLE` 상태와 날짜·사유의 관계를 임의로 바꾸지 않습니다. 입력 규칙을 수정할 때는 화면 검증, API 검증, 보고서 집계를 함께 검토합니다.

**보고서의 기간 기준은 통보일입니다.** 일접수와 기간 필터를 수정할 때 `notified_at` 기준을 유지해야 합니다. 보고일과 기간 선택 상태는 화면에서 관리되며, 집계 함수의 입력으로 전달됩니다.

**개인정보는 최소한으로 노출합니다.** 연락처 등 민감 정보는 화면 표시와 Excel 내보내기에서 기존 마스킹 정책을 따릅니다. 관련 구현은 [`src/lib/privacy.ts`](../src/lib/privacy.ts)와 [`src/components/MaskedPersonalInfo.tsx`](../src/components/MaskedPersonalInfo.tsx)를 먼저 읽습니다.

**감사 로그를 우회하지 않습니다.** 로그인, 설정 변경, 민원 생성·수정·삭제처럼 운영 추적이 필요한 변경은 기존 API 경로를 사용합니다. 클라이언트에서 DB를 직접 수정하거나 감사 기록을 생략하는 코드를 추가하지 않습니다.

**데이터 초기화는 파괴적입니다.** 시드 초기화나 DB 삭제 기능을 수정하거나 실행하기 전에는 테스트 DB를 사용하고, 운영 DB 백업 절차를 확인합니다. `data/` 전체를 복사하면 포터블 앱 데이터 백업이 됩니다.

## 6. 변경 작업 방법

### 6.1 브랜치와 커밋

| 브랜치 | 용도 |
|---|---|
| `main` | 기본 개발 브랜치. PR 대상 |
| `master` | 최종 릴리스 전용. `main`에서 **fast-forward만** 반영 |
| `feat/*` · `fix/*` | 작업 브랜치 → `main`으로 PR |

**히스토리는 항상 선형(linear)으로 유지합니다.** merge commit을 만들지 않습니다.

| 상황 | 방법 |
|---|---|
| 작업 브랜치 → `main` (PR) | GitHub에서 **Squash merge** 또는 **Rebase and merge**만 사용 |
| `main` → `master` (릴리스) | `git merge --ff-only main` (또는 `main`을 `master`에 fast-forward) |
| 로컬이 뒤처진 경우 | `git pull --ff-only` / `git fetch` 후 rebase |

기능·버그·문서 변경마다 작업 브랜치를 만듭니다.

```bash
git switch -c feat/short-description
# 또는
git switch -c fix/short-description
```

커밋은 작고 목적이 분명해야 합니다. 기존 저장소의 커밋 스타일처럼 `feat:`, `fix:`, `docs:`, `chore:` 접두사를 사용하고, 한 커밋에 무관한 리팩터링을 섞지 않습니다.

### 6.2 변경 전 확인 순서

1. 관련 요구사항과 데이터 규칙을 읽습니다.
2. 변경할 화면의 `page`, `api`, `store`, `schema` 연결을 추적합니다.
3. 서버 라우트와 DB 쿼리의 입력·응답 형태를 확인합니다.
4. 개인정보·감사 로그·엑셀 내보내기에 미치는 영향을 확인합니다.
5. 필요한 경우 문서와 화면 스냅샷을 함께 갱신합니다.

### 6.3 검증 명령

Pull Request를 올리기 전에 최소한 다음을 실행합니다.

```bash
npm run build
git diff --check
git status --short
```

현재 `package.json`에는 별도 테스트 스크립트가 없으므로, 변경 기능은 개발 서버에서 직접 확인합니다. 민원 CRUD, 기간 필터, 각 보고서 화면, Excel 다운로드, 로그인·로그아웃, 감사로그를 변경 범위에 맞게 점검합니다. API 변경은 `npm run dev:api`를 실행한 상태에서 브라우저 동작과 함께 확인합니다.

## 7. Pull Request 체크리스트

다음 질문에 모두 답할 수 있을 때 Pull Request를 작성합니다.

- 변경 목적과 사용자 영향이 설명되어 있는가?
- 관련 요구사항·아키텍처·스키마 문서를 확인했는가?
- `npm run build`가 성공하는가?
- `git diff --check`에서 공백 오류가 없는가?
- 새 API 필드나 도메인 타입이 클라이언트와 서버 양쪽에 반영되었는가?
- 집계·기간 필터·Excel 내보내기 결과가 기존 규칙과 일치하는가?
- 개인정보가 로그, 화면, 다운로드 파일에 불필요하게 노출되지 않는가?
- 생성·수정·삭제 동작이 감사 로그를 남기는가?
- DB·빌드 산출물·실제 민원 자료가 커밋에 포함되지 않았는가?
- UI 변경이라면 `docs/site-snapshots/` 또는 관련 문서 갱신이 필요한지 판단했는가?

PR 본문에는 변경 이유, 주요 변경 파일, 검증 명령과 결과, 수동 확인 범위를 적습니다. 스크린샷은 UI 동작을 설명하는 데 필요한 경우에만 첨부하고 실제 개인정보가 포함된 이미지는 사용하지 않습니다.

## 8. Windows 포터블 배포와 GitHub Actions

Windows 배포 패키지는 다음 명령으로 만듭니다.

```bash
npm run release:win
```

스크립트는 프론트엔드를 빌드하고, Windows용 Node.js 런타임과 번들된 API를 포함한 `release-win/` 디렉터리와 ZIP을 생성합니다. 생성물은 `.gitignore` 대상입니다.

GitHub Actions 워크플로는 [`.github/workflows/portable-release.yml`](../.github/workflows/portable-release.yml)에 있습니다.

| 트리거 | 결과 |
|---|---|
| `main` push 또는 `main` 대상 Pull Request | 포터블 ZIP 빌드 및 Artifact 업로드 (개발 검증) |
| `master` push | 릴리스 직전 검증 빌드 |
| `workflow_dispatch` | 수동 빌드 |
| `v*` 태그 (보통 `master`에서) | Artifact 업로드 및 GitHub Release·업데이트 피드 게시 |

릴리스 태그를 만들 때는 버전과 `package.json`의 버전이 일치하는지 먼저 확인합니다.

```bash
git tag v0.1.4
git push origin v0.1.4
```

릴리스는 내부 운영 배포에 영향을 주므로 변경 검증과 리뷰가 끝난 뒤 진행합니다.

## 9. 문제 해결

| 증상 | 우선 확인할 항목 |
|---|---|
| 화면은 열리지만 API 연결 오류가 발생함 | `npm run dev:api` 실행 여부와 `9000` 포트 점유 여부. Windows `EACCES`면 [`portable-windows-port-troubleshooting.md`](./portable-windows-port-troubleshooting.md) |
| SQLite 관련 오류가 발생함 | Node.js가 22 이상인지, `TM_DATA_DIR`에 쓰기 권한이 있는지 |
| 변경한 화면이 보이지 않음 | Vite 콘솔 오류, 브라우저 새로고침, `src/App.tsx`의 라우트 등록 |
| 보고서 숫자가 다름 | 통보일 필터, 처리 상태, `src/schema/aggregate.ts`, 보고서 스키마 |
| Excel 파일 내용이 다름 | 해당 `src/export/*Excel.ts`와 개인정보 마스킹 유틸리티 |
| 포터블 실행이 실패함 | Windows 64비트 여부, 압축 해제 경로, `runtime/node.exe`, 포트 충돌 |

문제를 재현할 때는 실제 민원 대신 최소 재현용 테스트 데이터를 사용하고, 로그와 오류 메시지에서 개인정보를 제거한 뒤 이슈에 기록합니다.

## 참고 문서

[1]: https://github.com/romico/tonghab-minwon-info "tonghab-minwon-info GitHub repository"
[2]: ../README.md "tonghab-minwon-info README"
[3]: ./prd.md "제품 요구사항"
[4]: ./architecture.md "시스템 아키텍처"
[5]: ./data-flow.md "데이터 흐름"
[6]: ./erd.md "데이터 모델 ERD"
[7]: ./report-schema.md "보고서 스키마"
[8]: ../.github/workflows/windows-portable.yml "Windows 포터블 GitHub Actions 워크플로"
