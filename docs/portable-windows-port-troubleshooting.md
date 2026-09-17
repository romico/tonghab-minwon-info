# Windows 포터블 — TCP 포트 제외 범위 트러블슈팅

> 기준일: 2026-09-17  
> 증상: `listen EACCES: permission denied 127.0.0.1:8787` (또는 유사 포트)  
> 관련: 포터블 런처 `my-minwon-server.bat`, 서버 `PORT` / 포트 폴백

## 1. 한 줄 요약

Windows에서 **포트가 비어 보여도** Hyper-V / WinNAT / WSL 등이 잡아 둔 **TCP 제외 범위(excluded port range)** 안이면 Node `listen`이 `EADDRINUSE`가 아니라 **`EACCES`(permission denied)** 로 실패한다.  
이 PC에서는 `8787`이 제외 구간 `8698–8797`에 포함되어 실패했고, **`9000`으로 기동에 성공**했다. 현재 기본 포트는 **9000**이다.

## 2. 증상

콘솔에 대략 다음이 보인다.

```text
Error: listen EACCES: permission denied 127.0.0.1:8787
    ...
  code: 'EACCES',
  syscall: 'listen',
  address: '127.0.0.1',
  port: 8787
```

| 헷갈리기 쉬운 점 | 실제 |
|---|---|
| “권한이 없다” → 관리자 실행? | 보통 **관리자 여부와 무관**. 제외 범위 문제 |
| “누가 쓰는 중?” → `EADDRINUSE` | 제외 범위는 **`EACCES`** 로 나오는 경우가 많음 |
| `netstat`에 8787 LISTENING 없음 | 그래도 제외 범위면 bind 실패 가능 |

배너(`통합민원정보 http://…`)가 잠깐 찍힌 뒤 바로 `EACCES`가 나는 경우도 있다. 제외 포트/재시도 과정에서 로그 순서가 섞여 보일 수 있으므로, **최종 exit code와 마지막 에러 코드**를 기준으로 본다.

## 3. 확인 방법

관리자 여부 무관, **cmd**에서:

```bat
netsh interface ipv4 show excludedportrange protocol=tcp
```

예시 (실제 현장 PC, 2026-09-17):

```text
프로토콜 tcp 포트 제외 범위

시작 포트    끝 포트
----------    --------
      5564        5663
      8698        8797
      8798        8897
      8898        8997
      9037        9136
      9137        9236
     27339       27339
     50000       50059     *

* - 관리 포트 제외입니다.
```

해석:

- **8787** → `8698–8797` **포함 → 사용 불가**
- **9000** → 위 구간에 없음 → **사용 가능** (실측 성공)
- **9037 근처** → `9037–9236`에 걸릴 수 있음 → 피할 것

원하는 포트 `N`이 “시작~끝” 사이인지 확인하면 된다.

## 4. 해결 (권장 순)

### 4.1 포트 바꿔 실행 (즉시)

```bat
set PORT=9000
my-minwon-server.bat
```

또는 bat/`server` 기본값이 이미 `9000`인 패키지를 사용한다.  
브라우저: `http://127.0.0.1:9000`

다른 후보 (제외 구간에 안 겹치게):

| 후보 | 비고 |
|---|---|
| 9000 | 현재 기본 · 현장 검증됨 |
| 7777, 9876, 9877 | 폴백 목록에 포함 |
| 18080, 18787, 3847, 4567 | 폴백 목록에 포함 |
| 8788–8790 | **이 PC에선 8698–8797 안이라 불가** |

### 4.2 앱 자동 폴백

서버는 `EACCES` / `EADDRINUSE` 시 다음 후보 포트로 재시도한다 (`server/index.ts` `portCandidates`).  
성공 시 콘솔에 실제 URL이 찍히고, `data/server.port`에 사용 포트가 기록된다.  
**8787만 고집하지 말고 콘솔에 나온 URL을 연다.**

### 4.3 제외 범위 원인 쪽 (선택 · 관리자)

제외 범위는 대개 다음이 만든다.

- Hyper-V / Windows 기능 “가상 머신 플랫폼”
- WSL2 / Docker Desktop
- WinNAT, 일부 VPN·보안 제품

범위를 **임의로 삭제하는 것은 비권장**(다른 기능이 깨질 수 있음).  
가능하면 **앱 포트를 9000 등으로 고정**하는 편이 안전하다.

꼭 범위를 줄여야 할 때만 (관리자, 조직 정책 확인 후):

```bat
netsh int ipv4 show dynamicport tcp
netsh int ipv4 set dynamicport tcp start=49152 num=16384
```

변경 후 **재부팅**이 필요할 수 있고, Hyper-V가 다시 제외 구간을 잡을 수 있다.

## 5. 체크리스트

- [ ] 오류 코드가 `EACCES` + `listen` 인가?
- [ ] `netsh interface ipv4 show excludedportrange protocol=tcp` 로 해당 포트가 구간에 있는가?
- [ ] `PORT=9000`(또는 제외 밖 포트)으로 재기동했는가?
- [ ] 콘솔/ `data/server.port` 의 **실제 포트**로 브라우저를 열었는가?
- [ ] (개발) Vite 프록시 대상이 API 포트와 같은가? (`vite.config.ts` → `9000`)

## 6. 코드·설정 위치

| 항목 | 위치 |
|---|---|
| 기본 `PORT` | `server/index.ts` (`9000`), Windows bat / mac·linux sh 런처 |
| 포트 폴백 | `server/index.ts` `portCandidates` / `startListening` |
| 실제 bind 포트 기록 | `data/server.port` |
| Vite 개발 프록시 | `vite.config.ts` → `http://127.0.0.1:9000` |

## 7. 관련 문서

- 포터블 ZIP `readme.txt` — 「포트 변경」절
- [`docs/architecture.md`](./architecture.md) — 런타임·배포
- [`docs/ONBOARDING.md`](./ONBOARDING.md) — 로컬 개발 포트
