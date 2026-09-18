# 업데이트·배포 정책

| 항목 | 내용 |
|---|---|
| 대상 | 통합민원정보 포터블 패키지 (Windows · Linux · macOS) |
| 버전 기준 | `package.json` `version` ↔ Git 태그 `v{version}` ↔ `CHANGELOG.md` |
| 작성 기준일 | 2026-09-17 |
| 관련 코드 | `server/update.ts`, `scripts/build-release.mjs`, `scripts/deploy-update-feed.mjs` |
| CI | [`.github/workflows/portable-release.yml`](../.github/workflows/portable-release.yml) |

---

## 1. 배포 원칙

1. **포터블 우선** — PC에 Node 설치 없이 ZIP 해제 후 실행 스크립트로 기동한다.
2. **데이터 분리** — 업무 DB·아카이브는 항상 패키지 `data/`에 둔다. 업데이트·재배포 시 `data/`는 덮어쓰지 않는다.
3. **버전 일치** — 릴리스 태그, `package.json`, 포터블 ZIP 파일명, `update.json`의 `version`을 동일하게 맞춘다.
4. **공개 피드** — 자동 업데이트는 GitHub 토큰 없이 공개 `update.json` + ZIP 프록시(Worker)로 받는다.
5. **내부 업무용** — 공식 대민 SaaS가 아니다. 패키지·DB·archives를 권한 없는 자에게 배포하지 않는다.

---

## 2. 릴리스 절차

### 2.1 준비

1. `main`에서 기능·수정 반영 후 `CHANGELOG.md`에 버전 섹션 작성
2. `package.json` `version` 갱신 (필요 시 `landing/changelog.json` 동기화)
3. `main` → `master` 병합 (최종 릴리스 반영)
4. `master`에서 태그 게시

### 2.2 태그 게시 (정식 배포)

```bash
git switch master
git pull origin master
git tag v0.1.17
git push origin v0.1.17
```

`Portable Release` 워크플로가 태그(`v*`)에서:

| 단계 | 내용 |
|---|---|
| 빌드 | `npm run release:all` → OS별 ZIP + `update.json` / `update.ini` |
| Artifact | ZIP·매니페스트 업로드 (30일) |
| GitHub Release | ZIP·매니페스트 첨부, 릴리스 노트 자동 생성 |
| 피드 배포 | `UANY_CLOUDFLARE_API_TOKEN` + `UANY_CLOUDFLARE_ACCOUNT_ID` 있으면 `npm run deploy:update-feed` |

토큰·계정 ID 시크릿이 없으면 Pages 피드 배포만 건너뛴다. 이 경우 로컬에서 수동 배포한다.

### 2.3 수동·로컬 빌드

```bash
npm run release:win        # 또는 linux / mac / mac-intel / all
npm run deploy:update-feed # 피드만
npm run deploy:landing     # 소개 사이트
```

---

## 3. 산출물

| 산출물 | 설명 |
|---|---|
| `tonghab-minwon-info-*-portable-v{ver}.zip` | 플랫폼별 포터블 패키지 |
| `update.json` / `update.ini` | 버전·플랫폼별 URL·SHA-256·크기 |
| 패키지 내 `readme.txt` | 실행·로그인·백업·업데이트 안내 |
| `my-minwon-server.bat` / `.sh` | TUI 메뉴(실행·중지·재실행·강제종료·종료). 강제종료 시 PID·포트·`server.cjs` 고아 프로세스 정리 |
| `data/README.txt` | DB·archives 백업 안내 |
| `runtime/` | 번들 Node 22 |
| `server.cjs` + `dist/` | API·프론트 정적 파일 |

플랫폼 ID: `win32-x64`, `linux-x64`, `darwin-arm64`, `darwin-x64`.

---

## 4. 업데이트 정책 (클라이언트)

### 4.1 확인

- 설정 → 「버전 및 업데이트」에서 확인
- 피드 URL 우선순위: `TM_UPDATE_FEED_URL` → `data/update-feed.url` → `package.json` `updateFeedUrl` → 기본 `https://update.uany.net/tonghab-minwon-info/update.json`
- 대체: `https://uany-update.pages.dev/tonghab-minwon-info/update.json`
- 현재 OS에 맞는 `platforms[{platformId}]` 항목을 사용한다 (없으면 최상위 `downloadUrl`)

### 4.2 적용 조건

| 조건 | 내용 |
|---|---|
| 대상 | 포터블 설치만 자동 적용 (`TM_PORTABLE=1` 등). 개발(`npm run dev`)은 수동 |
| 무결성 | 매니페스트 `sha256` 필수. 다운로드 ZIP과 불일치 시 적용 중단 |
| 유지 | `data/`, `updates/`, `.cache/`는 교체에서 **제외** |
| 방식 | ZIP 다운로드 → 검증 → 적용 스크립트(bat/sh) → 서버 재시작 |

### 4.3 사용자 책임

- 업데이트 전 **`data/` 전체 백업**을 권장한다 (archives 포함).
- 망분리·오프라인 PC는 ZIP을 수동 반입한 뒤, `data`를 유지한 채 패키지를 교체한다.
- 메이저·스키마 파괴적 변경이 있으면 CHANGELOG·릴리스 노트에 별도 고지한다 (필요 시 수동 마이그레이션).

---

## 5. URL·인프라

| 용도 | URL |
|---|---|
| 소개·다운로드 | https://minwon.uany.net/ |
| 업데이트 피드 | https://update.uany.net/tonghab-minwon-info/update.json |
| ZIP 다운로드 프록시 | Worker `tonghab-update-download` (`?tag=&platform=`) — **공개 릴리스만**(302). 비공개 중계는 `ALLOW_PRIVATE_RELEASES` 옵트인 |
| 소스·릴리스 | https://github.com/romico/tonghab-minwon-info/releases |

피드 예시 스키마: [`docs/update.example.json`](./update.example.json)

---

## 6. 보안·운영 메모

- ZIP·피드는 공개 채널이다. **DB·개인정보는 포함하지 않는다.**
- GitHub Releases ZIP은 Worker가 **공개 릴리스만** 중계한다(토큰 없이 `browser_download_url` 302). 비공개 릴리스 우회를 막기 위해 `ALLOW_PRIVATE_RELEASES` 기본값은 off.
- 설정에서 GitHub 토큰을 요구하지 않는 것이 기본이다 (`TM_GITHUB_TOKEN`은 피드 장애 시 폴백 조회용).
- SmartScreen·OS 게이트키퍼 경고는 서명되지 않은 포터블의 일반적 현상이다. 내부 배포 절차에 따라 안내한다.

---

## 7. 체크리스트 (릴리스 담당)

- [ ] `package.json` version = CHANGELOG 최신 섹션 = 태그 `v*`
- [ ] `landing/changelog.json` 동기화 (소개 사이트)
- [ ] CI Release에 4개 플랫폼 ZIP + `update.json` 첨부 확인
- [ ] `https://update.uany.net/tonghab-minwon-info/update.json` 의 `version`·`platforms` 확인
- [ ] (선택) `npm run deploy:landing` 후 minwon.uany.net 다운로드 링크 확인
- [ ] 포터블 1대에서 설정 → 업데이트 확인·적용 스모크 (`data` 유지)
