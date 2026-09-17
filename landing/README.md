# landing/ — Cloudflare Pages 소개·다운로드 페이지

`update-site/`(업데이트 JSON 피드)와 **분리된** 정적 랜딩입니다. 앱 본체(로그인·DB)는 포함하지 않습니다.

화면 스냅샷 이미지는 사용하지 않습니다. 히어로는 CSS 배경·그리드·오브로만 구성합니다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 소개 · 플랫폼별 다운로드 · CHANGELOG 기반 변경 이력 · 사용 방법 |
| `styles.css` | 레이아웃·모션 |
| `script.js` | `update.json` 플랫폼 URL 반영, `changelog.json` 렌더 |
| `changelog.json` | 루트 `CHANGELOG.md` 요약 (랜딩용) |

## 로컬 미리보기

```bash
npx --yes serve landing -p 4173
# → http://localhost:4173
```

## Cloudflare Pages 배포

```bash
npx wrangler login   # 최초 1회
npm run deploy:landing
```

프로젝트명 기본값: `tonghab-minwon` → `https://tonghab-minwon.pages.dev`

## 다운로드 URL

페이지 로드 시 피드를 조회해 플랫폼별 링크를 갱신합니다.

1. `https://update.uany.net/tonghab-minwon-info/update.json`
2. `https://uany-update.pages.dev/tonghab-minwon-info/update.json`

실패 시 HTML fallback(Worker `platform` 쿼리)을 유지합니다.

## 변경 이력 갱신

루트 `CHANGELOG.md`가 바뀌면 `landing/changelog.json`을 같은 내용으로 맞춰 주세요.
(배포 버전 태그 `0.1.11`·`0.1.12`는 CHANGELOG 본문에 아직 섹션이 없으면 피드 버전만 상단에 표시됩니다.)
