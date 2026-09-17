# Changelog

이 프로젝트의 주목할 만한 변경 사항을 기록합니다.  
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르며, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 지향합니다.

태그(`v*`)와 `package.json`의 `version`을 기준으로 정리했습니다.

---

## [0.1.17] - 2026-09-17

### Added

- 설정 「민원 AX 정보」— 소개 사이트, 법적고지, 개인정보 처리방침, 이용약관·라이선스·오픈소스 고지
- 로그인 화면·`/legal/:docId`에서 동일 문서 열람 (로그인 전 가능)

---

## [0.1.16] - 2026-09-17

### Fixed

- 통합·관리대장 엑셀 내보내기 시 사진이 빠지던 문제 — 목록 lite 이후 내보내기에서 `media=1`로 사진 본문을 다시 채움

### Changed

- 소개·다운로드 공식 주소 [minwon.uany.net](https://minwon.uany.net/) 안내 추가

---

## [0.1.15] - 2026-09-17

### Added

- **DB 아카이브 전환** — 현재 DB를 `data/archives/`에 보관한 뒤 활성 민원만 비움 (스냅샷·감사·계정·2FA·Vault 설정 유지)
- **보관본 복원** — 민원 병합(권장, Vault 시 아카이브 시점 비밀번호로 재암호화) / 통째 교체(위험, 재로그인)
- **보관본 삭제** — 비밀번호·2FA 확인 후 `archives/` 파일 영구 삭제
- 설정 화면 DB 경로·용량·사진 payload 비중 표시, VACUUM 용량 회수
- HWPX 대량 등록 백그라운드 job + 전역 진행 배너 (페이지 이동 중에도 이어감)
- 관리대장 목록 페이징
- 동일 민원카드 재가져오기 시 fingerprint(`importKey`) 기준 갱신
- 저장 용량·성능 분산 논의 문서 (`docs/storage-scaling-decision.md`)

### Changed

- HWPX 반입 사진 압축: 긴 변 640px · JPEG quality 0.55 (초과 시 단계 축소)
- 목록 API는 사진 본문을 제외(`listComplaintsLite`), 상세에서만 로드
- 신규 DB 파일이 아닐 때 민원 0건이어도 샘플을 다시 넣지 않음 (아카이브 전환 대비)
- 포터블 안내·`data/README.txt`에 archives 백업 안내 추가

### Fixed

- 사진 리사이즈가 가로만 보던 문제 → 긴 변 기준으로 통일

---

## [0.1.14] - 2026-09-17

### Fixed

- 민원카드(HWPX) 여러 건 등록 시 `request entity too large` 가 나던 문제 — 건별 등록으로 변경
- JSON 본문 한도 50MB → 100MB

### Added

- 민원카드 가져오기 분석·등록 진행률 표시

---

## [0.1.13] - 2026-09-17

### Fixed

- macOS·Linux 포터블에서 버전 확인 시 `import.meta.url` 이 없어 `fileURLToPath` 가 실패하던 오류 수정

---

## [0.1.10] - 2026-09-17

### Added

- Linux·macOS(arm64/x64) 포터블 패키징 (`release:linux`, `release:mac`, `release:mac-intel`, `release:all`)
- 플랫폼별 자동 업데이트 (`update.json`의 `platforms`, Worker `platform` 쿼리)
- 통합 릴리스 워크플로 (`portable-release.yml`)

### Changed

- Windows 전용 빌드·업데이트 경로를 다중 OS 번들·피드 구조로 확장

---

## [0.1.9] - 2026-09-17

### Fixed

- 감사 로그에 TOTP·스냅샷 관련 배지 표시 보정
- 업데이트 피드 기본값을 공개 피드 도메인으로 맞춤
- 테스트용 0.1.7 다운그레이드 상태를 정식 0.1.9 배포로 복구

---

## [0.1.8] - 2026-09-17

### Added

- Cloudflare Pages `update.json` 피드 + Worker ZIP 프록시로 **토큰 없이** 자동 업데이트 적용
- 업데이트 피드 배포 스크립트 (`deploy:update-feed`)
- `workers/update-download` (GitHub Release ZIP 중계)

### Changed

- 피드 URL을 `package.json`의 `updateFeedUrl`로 관리
- 설정 화면의 토큰 의존 UI 축소

---

## [0.1.7] - 2026-09-17

### Added

- 포터블 패키지에 업데이트용 GitHub 인증 정보 자동 포함(레거시, 이후 토큰 없는 프록시로 전환)
- 설정 화면에서 피드·인증 정보 저장 UI

---

## [0.1.6] - 2026-09-17

### Added

- `update.json` / `update.ini` 매니페스트 기반 업데이트
- 다운로드 파일 SHA-256 검증
- 빌드 시 체크섬 매니페스트 생성·릴리스 첨부

### Changed

- GitHub API 직접 조회보다 피드 기반 업데이트를 기본으로 전환

---

## [0.1.5] - 2026-09-17

### Added

- GitHub 릴리스 기반 버전 확인·자동 업데이트 (Windows 포터블, `data` 유지 적용)
- 설정·레이아웃의 업데이트 확인 UI (`server/update.ts`)
- 보고일 확정 스냅샷(`report_snapshots`) 및 확정·이력 API
- 접수·처리중 증감율 비교 UI (스냅샷 KPI 기준)
- 민원인 성명·연락처·사진 **at-rest 암호화** (AES-256-GCM)
- 선택적 **TOTP 2단계 인증**
- 보안 스모크 스크립트, 연간 시드 스크립트
- 서비스 기획서·배포용 기획 보고서(MD/HWPX), 개인정보 저장 보안 정책, 온보딩 문서

### Changed

- 인증·로그인 흐름에 OTP 단계 및 볼트(복호화 키) 연동
- 감사 이벤트·설정 화면을 보안·스냅샷 기능에 맞게 확장

---

## [0.1.4] - 2026-09-15

### Added

- Windows 포터블 ZIP 릴리스 준비 (`v0.1.4` 태그)
- GitHub Actions Windows 포터블 CI 배포
- README·화면 스냅샷 (`docs/site-snapshots/`)
- PRD·아키텍처·ERD·데이터 흐름·보고서 스키마 등 기술 문서

### Changed

- 대시보드·통합 엑셀 내보내기 및 설정/관리대장 UX 개선

### Fixed

- 대시보드 통합 엑셀 다운로드 버튼 문구 명확화

---

## [0.1.0] - 2026-09-15

최초 공개에 해당하는 기반 버전입니다. (`v0.1.0`~`v0.1.3` 태그는 없으며, `0.1.4` 이전 커밋을 요약합니다.)

### Added

- 관리대장 SSOT 기반 민원 CRUD
- HWPX(민원카드) 가져오기·사진 첨부
- 부서별현황·총괄표·일일보고 파생 집계
- 대시보드 KPI·통합/시트별 Excel 내보내기
- 세션 인증(scrypt)·감사로그·설정
- Windows 포터블 배포 스크립트 (Node 런타임 번들)
- 로컬 SQLite (`data/tonghab-minwon.db`) 단독 운영

---

## 태그 대응

| 버전 | Git 태그 |
|---|---|
| 0.1.17 | `v0.1.17` |
| 0.1.16 | `v0.1.16` |
| 0.1.15 | `v0.1.15` |
| 0.1.14 | `v0.1.14` |
| 0.1.13 | `v0.1.13` |
| 0.1.12 | `v0.1.12` |
| 0.1.11 | `v0.1.11` |
| 0.1.10 | `v0.1.10` |
| 0.1.9 | `v0.1.9` |
| 0.1.8 | `v0.1.8` |
| 0.1.7 | `v0.1.7` |
| 0.1.6 | `v0.1.6` |
| 0.1.5 | `v0.1.5` |
| 0.1.4 | `v0.1.4` |

> 릴리스 URL은 비공개 저장소이므로 CHANGELOG에 절대 경로를 두지 않습니다. 내부 확인은 GitHub Releases 또는 `gh release view <tag>`를 사용하세요.
