# 사내망 모바일·현장 확장 — 아키텍처 방향

> 상위: [README.md](./README.md) · 요구: [requirements.md](./requirements.md)  
> 상태: 기획 초안 · **미구현**. 본제품 `docs/architecture.md`를 대체하지 않는다.

## 1. 전체 구성

```text
┌─────────────────────────────┐         사내망          ┌──────────────────────────┐
│  Mobile Client              │  HTTPS / VPN           │  Intranet Server         │
│  (Capacitor / Native shell) │ ◄────────────────────► │  Express + SQLite        │
│  · HWPX / Camera UI         │                        │  (본제품 server/ 확장)   │
│  · pending sync queue       │                        │  · CRUD / photos API     │
│  · 처리 촬영 화면           │                        │  · export → SMTP         │
└─────────────────────────────┘                        └──────────────────────────┘
         │                                                      │
         │  offline 시 로컬 큐만 기록                              │ data/tonghab-minwon.db
         └──────────────────────────────────────────────────────┘
```

원칙:

1. **SSOT는 서버 관리대장** (본제품과 동일).  
2. 모바일은 **입력·촬영·큐·조회 UI**; 집계·메일은 서버.  
3. 네이티브 프로젝트는 저장소 내 **별도 패키지** (`apps/mobile/` 등)로 두고 본제품 포터블 빌드와 분리.

## 2. 본제품 대비 변경점

| 영역 | 본제품 | 본 트랙 |
|---|---|---|
| `HOST` | `127.0.0.1` | 사내 IP / `0.0.0.0` + 방화벽 |
| 사진 추가 | 민원 JSON 전체 PUT | **사진 전용 append API** 권장 |
| Excel | 브라우저 `file-saver` | 서버 생성 + SMTP |
| 클라이언트 | SPA only | SPA + Capacitor(카메라·파일·로컬 스토리지) |

## 3. API 방향 (초안)

구현 시 OpenAPI로 옮긴다. 아래는 범위 고정용.

### 3.1 사진 append

```http
POST /api/complaints/:id/photos
Content-Type: application/json

{
  "role": "before" | "after" | "receipt" | "other",
  "url": "data:image/jpeg;base64,...",
  "label": "처리전",
  "clientLocalId": "optional-for-idempotency"
}
```

- 성공 시 민원의 `photos[]`에 append + `syncPhotoFields`.  
- `clientLocalId`로 재시도 시 중복 삽입 방지.  
- 감사: `COMPLAINT_PHOTO_APPEND` (가칭).

### 3.2 상태 + 사진 일괄 (선택)

```http
POST /api/complaints/:id/field-update
{
  "status": "COMPLETED",
  "photos": [ { "role": "after", "url": "..." } ],
  "clientLocalId": "..."
}
```

처리 완료와 처리후 사진을 한 트랜잭션에 묶을 때 사용.

### 3.3 Excel 메일

```http
POST /api/exports/email
{
  "report": "combined" | "ledger" | "daily" | ...,
  "params": { "reportDate": "2026-09-17", "maskPii": true },
  "to": ["report@intranet.example"]
}
```

- 수신자는 서버 화이트리스트와 교집합.  
- SMTP 설정은 환경변수/`settings` (본제품 settings와 모듈 분리 권장).  
- 감사: `EXPORT_EMAIL` (가칭).

## 4. 동기화 큐

```text
촬영/상태변경
  → enqueue(pending)
  → online? upload : wait
  → 200 + ack → dequeue
  → 4xx 비즈니스 오류 → failed (수동 확인)
  → 5xx/네트워크 → retry (backoff)
```

| 항목 | 권장 |
|---|---|
| 저장소 | Capacitor Preferences / SQLite(기기) — 사진은 파일 경로 참조 가능 |
| 충돌 | 사진: append 전용 → 충돌 적음. 메타: `updatedAt` 비교 후 서버 우선 또는 명시적 merge UI |
| 보안 | 잠금 화면, 전송 후 원본 삭제, 보관 기간 상한 |

## 5. 사진 role 매핑

본제품 `docs/photo-hwpx-policy.md`와 동일.

| 업무 | role |
|---|---|
| HWPX/현장 접수 | `receipt` |
| 처리 직전 | `before` |
| 처리 직후 | `after` |

## 6. 배포

| 구성 요소 | 배포 |
|---|---|
| 서버 | 사내 PC/서버에 본제품 포터블 또는 `npm start` 계열 + 사내 HOST |
| 앱 | 사내 서명 + MDM / 내부 링크 (스토어 비목표) |
| 업데이트 | 서버는 본제품 update feed 가능. 앱은 스토어 대신 MDM 버전 관리 |

## 7. 본제품 코드 경계

- **허용**: `server/`에 사진 append·메일 모듈을 **feature flag**로 추가.  
- **금지**: 포터블 런처·단일 PC 기본 경로를 모바일 전제로 바꾸기.  
- **권장 디렉터리**: `apps/mobile/`, `server/modules/export-email/`, `docs/mobile-intranet/`(본 문서).
