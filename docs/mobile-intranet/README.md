# 사내망 모바일·현장 확장 (별도 트랙)

> **본 문서는 기존 PC 포터블 제품(`docs/prd.md`)과 분리 관리한다.**  
> 기준일: 2026-09-17 · 상태: **기획 초안 (미구현)**

## 1. 왜 별도인가

현재 `tonghab-minwon-info` 0.x는 **단일 PC · Node 포터블 · 브라우저 UI**가 제품 경계다.  
아래 요구는 같은 도메인(관리대장 SSOT)을 쓰더라도 런타임·배포·보안 경계가 달라 **별도 제품 단계**로 둔다.

| 구분 | 기존 프로그램 (본제품) | 본 트랙 |
|---|---|---|
| 실행 | Windows/Mac/Linux 포터블 ZIP | 사내망 서버 + Android/iOS(또는 Capacitor) |
| DB | 로컬 `data/tonghab-minwon.db` | 사내망 서버 SQLite(또는 동일 API) |
| 입력 | PC 파일 선택(HWPX·사진) | HWPX + **카메라 즉시 촬영** |
| 보고 | 브라우저 Excel 다운로드 | 집계 Excel **이메일 전송** |
| 현장 | 해당 없음 | 처리 시 **처리전/후 촬영** + 오프라인 **동기화 큐** |

기존 PRD 비목표의 「모바일 네이티브 앱」은 본제품 범위에서 제외한 것이며, **본 폴더가 그 확장의 SSOT**다.

## 2. 문서 목록

| 문서 | 내용 |
|---|---|
| [requirements.md](./requirements.md) | 목표·비목표·기능 요구·우선순위 |
| [architecture.md](./architecture.md) | 구성도·API 방향·동기화·메일 |
| [sync-qr-pairing.md](./sync-qr-pairing.md) | 포터블↔모바일 · QR 페어링 vs 실데이터 동기화 |

## 3. 본제품과의 접점 (재사용)

구현 시 코드를 포크하지 않고 **API·도메인만 확장**하는 것을 원칙으로 한다.

| 재사용 | 위치 |
|---|---|
| Complaint / photos role | `src/schema/*`, `docs/photo-hwpx-policy.md` |
| HWPX 파싱·JPEG 압축 | `src/import/hwpxParser.ts` |
| 집계·Excel 생성 로직 | `src/schema/aggregate.ts`, `src/export/*` |
| Express CRUD·인증 | `server/` |

| 본제품에 넣지 않음 (이 트랙) | 예 |
|---|---|
| Capacitor/네이티브 프로젝트 | `apps/mobile/` 등 **별도 패키지** 권장 |
| SMTP·엑셀 메일 API | 서버 확장 시에도 플래그/모듈 분리 |
| 동기화 큐 | 클라이언트 전용 스토리지 |

## 4. 결정 로그 (대화 요약)

1. PC `.app`화·폰 단독 Node 포터블은 채택하지 않음.  
2. **사내망에 서버를 두고** 모바일은 UI·카메라·오프라인 큐만 담당.  
3. 처리 즉시 촬영은 기존 `receipt` / `before` / `after` role로 매핑.  
4. Excel은 기기 다운로드보다 **서버 생성 → 사내 메일**을 우선.  
5. 포터블↔모바일: QR은 **페어링(URL·토큰)** 만. 동기화 본체는 HTTP API ([sync-qr-pairing.md](./sync-qr-pairing.md)).

## 5. 변경 규칙

- 본 폴더 문서만으로 범위·우선순위를 갱신한다.  
- 본제품 `prd.md` / `architecture.md`에 기능을 섞어 쓰지 않는다.  
- 본제품 쪽에는 **교차참조 한 줄**만 유지한다.
