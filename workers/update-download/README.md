# tonghab-update-download Worker

포터블 ZIP 다운로드 프록시 (`?tag=&platform=`).

## 보안 모델

| 모드 | 조건 | 동작 |
|---|---|---|
| **공개 (기본)** | `ALLOW_PRIVATE_RELEASES=false` | GitHub API를 **토큰 없이** 조회 후 `browser_download_url`로 302. 비공개 릴리스는 404. |
| **비공개 (옵트인)** | `ALLOW_PRIVATE_RELEASES=true` + `GITHUB_TOKEN` 시크릿 | assets API로 스트림 중계. **URL만 알면 비공개 ZIP 다운로드 가능**하므로 저장소가 private일 때만 사용. |

공개 GitHub 저장소·릴리스로 전환할 때는 공개 모드를 유지하고, Cloudflare에 남아 있는 `GITHUB_TOKEN` Worker 시크릿은 제거하는 것을 권장합니다.

## 배포

```bash
cd workers/update-download
npx wrangler deploy
# 비공개 모드가 필요할 때만:
# npx wrangler secret put GITHUB_TOKEN
# wrangler.toml 또는 dashboard 에서 ALLOW_PRIVATE_RELEASES=true
```
