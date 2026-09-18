# 통합민원정보 (민원 AX · Jeonju AX)

전주시 생활민원을 **관리대장** 한곳에 입력·가져오기하고, 통보일 기간 기준으로 **부서별현황 · 총괄표 · 일일보고**를 실시간 집계하며, 개별·통합 엑셀로 내보내는 **로컬 관리자용 웹앱**입니다.

관리대장만 쓰고(SSOT), 나머지 보고 화면은 조회 시점에 집계합니다. SQLite + 세션 인증으로 **Windows · Linux · macOS** 포터블 단독 운영이 가능합니다. 민원인 성명·연락처·사진 등은 저장 시 암호화되며, **로그인 시 Vault가 잠금 해제**됩니다.

| 항목 | 내용 |
|---|---|
| 버전 | 0.1.18 ([변경 이력](./CHANGELOG.md)) |
| 소개·다운로드 | https://minwon.uany.net/ |
| 업데이트 피드 | https://update.uany.net/tonghab-minwon-info/update.json |
| 기본 계정 | `admin` / `admin` (**최초 로그인 시 변경 필수**) |
| 법적 고지 | 앱 내 `/legal/…` · 설정 「민원 AX 정보」 (로그인 전 열람 가능) |
| 개발 UI | http://localhost:5173 |
| API / 프로덕션 | http://127.0.0.1:8787 |

---

## 주요 기능

### 민원·보고

- **관리대장 (SSOT)** — 민원 CRUD, 보고일·통보일 기간 필터, 목록 페이징
- **HWPX 민원카드** — 가져오기·검수·등록, 동일 카드 재가져오기 시 `importKey` 기준 갱신, 대량 등록 백그라운드 job + 전역 진행 배너
- **사진** — 현장·처리 전·후 첨부, 반입 시 긴 변 640px·JPEG 압축, 목록은 lite(본문 제외)·상세·엑셀은 `media=1`로 본문 포함
- **파생 보고** — 부서별현황 · 총괄표 · 일일보고 (관리대장 기준 메모리 집계, 중복 저장 없음)
- **대시보드** — KPI·추이·처리 상태·부서 업무량, 통합·시트별 엑셀 내보내기 (마스킹 옵션)
- **보고 확정** — 스냅샷으로 당시 보고 숫자 보존, 전일·전주 대비 확인

### 보안·운영

- **인증** — 세션 TTL, 비밀번호 변경, (선택) TOTP 2FA·복구 코드
- **개인정보** — Vault 저장 암호화(로그인 시 잠금 해제), 화면 기본 마스킹
- **감사로그** — 로그인·설정·민원·아카이브 등 변경 이력
- **DB 용량** — 경로·파일 크기·사진 payload 비중 표시, VACUUM 용량 회수
- **아카이브** — 활성 민원만 비우고 `data/archives/`에 보관 · 병합/통째 복원 · 비밀번호·2FA 확인 후 삭제 (스냅샷·감사·계정·Vault 설정 유지)
- **자동 업데이트** — 설정에서 버전 확인·적용 (`update.json` 공개 피드, SHA-256 검증, **`data/` 유지**, 토큰 불필요)
- **릴리스·배포** — 태그 `v*` → 멀티 OS ZIP + GitHub Release + 피드 배포 ([업데이트·배포 정책](./docs/update-deploy-policy.md))

### 배포·안내

- **포터블** — Windows · Linux · macOS(arm64/x64), Node 내장, 패키지 `readme.txt` 안내
- **소개 사이트** — https://minwon.uany.net/ (다운로드·변경 이력)
- **민원 AX 정보** — 법적고지 · 개인정보 처리방침 · 이용약관 · 라이선스 · 오픈소스 고지 (설정·로그인·`/legal/:docId`, 로그인 전 열람 가능)

화면 스냅샷: [`docs/site-snapshots/`](./docs/site-snapshots/README.md)  
저장·용량 정책: [`docs/storage-scaling-decision.md`](./docs/storage-scaling-decision.md) · [`docs/photo-hwpx-policy.md`](./docs/photo-hwpx-policy.md)  
업데이트·배포 정책: [`docs/update-deploy-policy.md`](./docs/update-deploy-policy.md)


---

## 기술 스택

| 계층 | 기술 |
|---|---|
| Frontend | React 19, React Router 7, Vite 7, TypeScript |
| Backend | Express 5 (`server/`) |
| DB | Node 내장 `node:sqlite` → `data/tonghab-minwon.db` (+ `data/archives/`) |
| Export / Import | ExcelJS, JSZip (HWPX) |
| Auth | scrypt 해시, HttpOnly 쿠키 `tm_session`, (선택) TOTP 2FA, Vault 암호화 |

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

## 포터블 배포

PC에 Node 설치 없이 ZIP 압축 해제 후 실행할 수 있습니다. 안내 파일은 패키지 루트 **`readme.txt`** 입니다.

```bash
npm run release:win        # Windows x64
npm run release:linux      # Linux x64
npm run release:mac        # macOS Apple Silicon
npm run release:mac-intel  # macOS Intel
npm run release:all        # 전 플랫폼
```

산출물 예:

- `tonghab-minwon-info-{platform}-portable-v{version}.zip`
- Windows: `my-minwon-server.bat` · macOS/Linux: `my-minwon-server.sh`
- → http://127.0.0.1:8787 (`admin` / `admin`)

플랫폼별 Node 22 런타임이 패키지에 포함됩니다. 데이터는 `data/`(아카이브 포함)에 저장되므로 **백업 시 `data` 폴더 전체**를 복사하세요.

### CI · 업데이트 피드 · 랜딩

정책 전문: [`docs/update-deploy-policy.md`](./docs/update-deploy-policy.md)

워크플로: [`.github/workflows/portable-release.yml`](./.github/workflows/portable-release.yml)

| 트리거 | 동작 |
|---|---|
| `master` push / PR | 포터블 ZIP 빌드 → Artifact |
| `workflow_dispatch` | 수동 빌드 |
| tag `v*` (예: `v0.1.17`) | Artifact + **GitHub Release** + `update.json` 피드 배포 |

```bash
git tag v0.1.17
git push origin v0.1.17
```

자동 업데이트 요지:

- 피드: `https://update.uany.net/tonghab-minwon-info/update.json` (플랫폼별 URL·SHA-256)
- 적용: 포터블만 · 체크섬 필수 · **`data/`(archives 포함) 유지**
- ZIP 중계: Cloudflare Worker (클라이언트에 GitHub 토큰 없음)

피드·소개 사이트 수동 배포:

```bash
npm run deploy:update-feed   # update.uany.net
npm run deploy:landing       # minwon.uany.net (Cloudflare Pages)
```

랜딩 구성은 [`landing/README.md`](./landing/README.md)를 참고하세요.

---

## 디렉터리 구조

```
tonghab-minwon-info/
├── server/          # Express API, SQLite, 인증·감사·아카이브
├── src/
│   ├── pages/       # 화면 (+ LegalDocPage)
│   ├── legal/       # 법적고지·약관 문서 본문
│   ├── schema/      # 도메인 타입·마스터·집계
│   ├── store/       # Auth / Complaint 상태
│   ├── export/      # 시트별·통합 엑셀
│   └── import/      # HWPX 파서
├── scripts/         # 포터블 빌드·피드·시드
├── landing/         # 소개·다운로드 정적 사이트
├── update-site/     # 업데이트 JSON 피드 배포물
├── data/            # 런타임 DB·archives (gitignore)
└── docs/            # PRD·아키텍처·스키마·정책
```

---

## 문서

| 문서 | 설명 |
|---|---|
| [CHANGELOG.md](./CHANGELOG.md) | 버전별 변경 이력 |
| [docs/통합민원정보_서비스_기획_보고서.md](./docs/통합민원정보_서비스_기획_보고서.md) | 서비스 기획·현황 보고서 |
| [docs/SERVICE_REPORT_OUTLINE.md](./docs/SERVICE_REPORT_OUTLINE.md) | 서비스 분석·기획 보고서 구성안 |
| [docs/SERVICE_PLAN.md](./docs/SERVICE_PLAN.md) | 서비스 분석·사용자·로드맵·후속 기능 기획서 |
| [docs/ONBOARDING.md](./docs/ONBOARDING.md) | 새 기여자용 개발 환경·구조·변경·검증 안내 |
| [docs/prd.md](./docs/prd.md) | 제품요구사항 (구현 기준) |
| [docs/architecture.md](./docs/architecture.md) | 아키텍처 |
| [docs/erd.md](./docs/erd.md) | ERD |
| [docs/data-flow.md](./docs/data-flow.md) | 데이터 흐름 |
| [docs/report-schema.md](./docs/report-schema.md) | 보고서 스키마 |
| [docs/photo-hwpx-policy.md](./docs/photo-hwpx-policy.md) | 사진·민원카드 정책 |
| [docs/storage-scaling-decision.md](./docs/storage-scaling-decision.md) | 저장·용량·아카이브 결정 |
| [docs/update-deploy-policy.md](./docs/update-deploy-policy.md) | 업데이트·배포 정책 |
| [docs/privacy-security-policy.md](./docs/privacy-security-policy.md) | 개인정보 DB 저장 보안 정책(초안) |
| [docs/site-snapshots/](./docs/site-snapshots/README.md) | UI 화면 스냅샷 |
| [landing/README.md](./landing/README.md) | 소개 사이트 배포 |

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

Private — 내부 운영용. 앱 내 **라이선스 정책 · 오픈소스 고지**(`/legal/license`, `/legal/opensource`)를 참고하세요.
