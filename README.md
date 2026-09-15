# 통합민원정보 (Jeonju AX)

전주시 생활민원을 **관리대장** 한곳에 입력·가져오기하고, 통보일 기간 기준으로 **부서별현황 · 총괄표 · 일일보고**를 실시간 집계하며, 개별·통합 엑셀로 내보내는 **로컬 관리자용 웹앱**입니다.

관리대장만 쓰고(SSOT), 나머지 보고 화면은 조회 시점에 집계합니다. SQLite + 세션 인증으로 Windows 포터블 단독 운영이 가능합니다.

| 항목 | 내용 |
|---|---|
| 버전 | 0.1.4 |
| 기본 계정 | `admin` / `admin` |
| 개발 UI | http://localhost:5173 |
| API / 프로덕션 | http://127.0.0.1:8787 |

---

## 주요 기능

- **관리대장** — 민원 CRUD, HWPX(민원카드) 가져오기, 사진 첨부, 개인정보 마스킹 엑셀
- **부서별현황 · 총괄표 · 일일보고** — 관리대장 기반 파생 집계 (중복 저장 없음)
- **대시보드** — KPI, 추이, 처리 상태·부서 업무량, 통합 엑셀 다운로드
- **감사로그** — 로그인·설정·민원 변경 이력
- **설정** — 세션 유효시간, 비밀번호 변경, DB 샘플 초기화

화면 스냅샷: [`docs/site-snapshots/`](./docs/site-snapshots/README.md)

---

## 기술 스택

| 계층 | 기술 |
|---|---|
| Frontend | React 19, React Router 7, Vite 7, TypeScript |
| Backend | Express 5 (`server/`) |
| DB | Node 내장 `node:sqlite` → `data/tonghab-minwon.db` |
| Export / Import | ExcelJS, JSZip (HWPX) |
| Auth | scrypt 해시, HttpOnly 쿠키 `tm_session` |

---

## 빠른 시작 (개발)

요구사항: **Node.js 22+** (내장 SQLite 사용)

```bash
npm install
npm run dev
```

- Vite: http://localhost:5173 (`/api` → `8787` 프록시)
- API: http://127.0.0.1:8787

개별 실행:

```bash
npm run dev:web   # 프론트만
npm run dev:api   # API만
```

프로덕션 빌드 후 API가 `dist/`를 함께 서빙:

```bash
npm run build
npm run start:api
# → http://127.0.0.1:8787
```

### 환경 변수

| 변수 | 기본 | 의미 |
|---|---|---|
| `PORT` | `8787` | HTTP 포트 |
| `HOST` | `127.0.0.1` | 바인딩 주소 |
| `TM_DATA_DIR` | `cwd/data` | DB 디렉터리 |
| `TM_DIST_DIR` | `cwd/dist` | 정적 파일 경로 |
| `TM_SERVE_STATIC` | (자동) | `0`이면 정적 서빙 비활성 |

---

## Windows 포터블 배포

PC에 Node 설치 없이 ZIP 압축 해제 후 실행할 수 있습니다.

```bash
npm run release:win
```

산출물:

- `tonghab-minwon-info-windows-portable-v{version}.zip`
- 내부 `my-minwon-server.bat` → http://127.0.0.1:8787

Node 22 win-x64 런타임이 패키지에 포함됩니다.

### CI (GitHub Actions)

워크플로: [`.github/workflows/windows-portable.yml`](./.github/workflows/windows-portable.yml)

| 트리거 | 동작 |
|---|---|
| `master` push / PR | 포터블 ZIP 빌드 → Artifact 업로드 |
| `workflow_dispatch` | 수동 빌드 |
| tag `v*` (예: `v0.1.4`) | Artifact + **GitHub Release** 게시 |

```bash
git tag v0.1.4
git push origin v0.1.4
```

---

## 디렉터리 구조

```
tonghab-minwon-info/
├── server/          # Express API, SQLite, 인증·감사
├── src/
│   ├── pages/       # 화면
│   ├── schema/      # 도메인 타입·마스터·집계
│   ├── store/       # Auth / Complaint 상태
│   ├── export/      # 시트별·통합 엑셀
│   └── import/      # HWPX 파서
├── scripts/         # Windows 포터블 빌드
├── data/            # 런타임 DB (gitignore)
└── docs/            # PRD·아키텍처·스키마
```

---

## 문서

| 문서 | 설명 |
|---|---|
| [docs/PRD.md](./docs/PRD.md) | 제품요구사항 (구현 기준) |
| [docs/architecture.md](./docs/architecture.md) | 아키텍처 |
| [docs/erd.md](./docs/erd.md) | ERD |
| [docs/data-flow.md](./docs/data-flow.md) | 데이터 흐름 |
| [docs/report-schema.md](./docs/report-schema.md) | 보고서 스키마 |
| [docs/photo-hwpx-policy.md](./docs/photo-hwpx-policy.md) | 사진·민원카드 정책 |
| [docs/site-snapshots/](./docs/site-snapshots/README.md) | UI 화면 스냅샷 |

---

## 업무 흐름

```
관리대장 입력/가져오기
        │
        ▼
기간(통보일) 필터
        │
        ├─→ 부서별현황
        ├─→ 총괄표
        ├─→ 일일보고
        └─→ 대시보드 / 엑셀 내보내기
```

집계는 DB 테이블이 아니라 클라이언트 `src/schema/aggregate.ts`에서 메모리 계산합니다.

---

## 라이선스

Private — 내부 운영용.
