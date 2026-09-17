# 사진 데이터 · 민원카드(HWPX) 처리 정책

> 코드 기준일: 2026-09-17  
> 구현: `src/import/hwpxParser.ts`, `src/schema/photos.ts`, `src/components/HwpxImportPanel.tsx`, `src/components/PhotoGallery.tsx`  
> 관련: [아키텍처](./architecture.md) · [ERD](./erd.md) · [데이터 흐름](./data-flow.md) · [저장 용량·성능 분산 방향](./storage-scaling-decision.md) · [PRD §4.9](./PRD.md)

---

## 1. 정책 요약

| 항목 | 정책 |
|---|---|
| 원본 HWPX | **보관하지 않음**. 가져오기 시에만 브라우저에서 파싱 |
| 사진 저장소 | **별도 파일/Blob 스토어 없음**(현행). `data:image/...;base64,...` URL을 민원 JSON에 포함 |
| 영속 위치 | SQLite `complaints.data` (Complaint JSON) |
| 서버 역할 | JSON CRUD만 수행. 이미지 업로드 전용 API 없음 |
| 용량 | Express JSON limit **100mb**. HWPX 유입 시 JPEG 압축 필수 |
| 용량·성능 분산 | 파일 분리(방안 1)는 **관리 이슈로 보류**. 압축 강화(방안 2)는 **QA 검증 중**. **아카이브 전환·복원(방안 5) MVP 구현**. 상세는 [storage-scaling-decision.md](./storage-scaling-decision.md) |
| 감사 | 파싱 자체는 감사하지 않음. **등록 API** 성공 시 `COMPLAINT_BATCH_CREATE` 등 기록 |

---

## 2. 사진 데이터 모델

### 2.1 구조

```ts
interface ComplaintPhoto {
  id: string;
  url: string;                    // 통상 data:image/jpeg;base64,...
  role: "receipt" | "before" | "after" | "other";
  label?: string | null;
  sourceName?: string | null;     // HWPX BinData 원본 파일명
}
```

| role | UI 라벨 | 용도 |
|---|---|---|
| `receipt` | 현장 | 접수·현장사진 (엑셀 J열 등) |
| `before` | 처리전 | 처리 전 (엑셀 P열) |
| `after` | 처리후 | 처리 후 (엑셀 Q열) |
| `other` | 기타 | 위치도·약도 등 |

민원 1건은 `photos: ComplaintPhoto[]`로 **다중 이미지**를 가진다.

### 2.2 레거시 필드 동기화

하위 호환용 deprecated 필드:

- `photoReceiptUrl` ← role `receipt` (없으면 `photos[0]`)
- `photoBeforeUrl` ← role `before`
- `photoAfterUrl` ← role `after`

| 함수 | 역할 |
|---|---|
| `syncPhotoFields(photos)` | 배열 → 레거시 3필드 동기화 |
| `coercePhotos(partial)` | 구버전(배열 없음) → `photos[]` 복원 |

저장·로드 시 항상 `normalizeComplaint` / `syncPhotoFields`로 양쪽을 맞춘다.

### 2.3 저장·전송 규칙

1. 사진은 **민원 레코드에 임베드**한다. DB에 `photos` 테이블이나 `data/uploads/` 디렉터리를 두지 않는다.
2. API는 민원 JSON 전체를 PUT/POST한다. 이미지 전용 multipart 업로드는 없다.
3. DB 초기화(`reset-seed`) 시 민원(사진 포함)·보고 스냅샷을 비우고 민원만 샘플로 교체되며, 계정·감사·설정은 유지된다.
4. 엑셀 내보내기(`ledgerExcel`)는 `includeImages` 옵션으로 data URL을 셀 이미지로 삽입한다. 통합 엑셀도 동일 시트 로직을 재사용한다.

### 2.4 UI 정책

- 표시·미리보기·role 변경·삭제는 `PhotoGallery`에서 수행한다.
- HWPX 초안 단계와 관리대장 편집 모두 동일 컴포넌트를 사용한다.
- role 변경 시 반드시 `syncPhotoFields`로 레거시 필드를 갱신한다.

---

## 3. 민원카드(HWPX) 가져오기 정책

### 3.1 지원 형식

- 확장자: `.hwpx` only (ZIP 컨테이너)
- 다중 파일 선택 가능
- 비-HWPX는 오류 목록에만 기록하고 건너뛴다

### 3.2 파싱 파이프라인

```
.hwpx (File)
  → JSZip
  → 텍스트: Contents/section0.xml 의 <t> 토큰
       (부족 시 Preview/PrvText.txt 폴백)
  → 이미지: BinData/* → JPEG 압축
       (긴 변 max **640px**, quality **0.55**, 초과 시 단계 축소; 실패 시 480/0.4 재시도)
       → data URL
  → 필드 휴리스틱 → HwpxImportDraft (초안)
  → 사용자 검토·수정
  → 백그라운드 건별 등록 → POST /api/complaints { items }
```

### 3.3 이미지 추출 규칙

| 단계 | 규칙 |
|---|---|
| 소스 | ZIP 내 `BinData/` 하위 파일, 이름 정렬 |
| MIME | 확장자로 판별. `image/*`만 채택 |
| 압축 | canvas → JPEG data URL. **긴 변** 기준 리사이즈. 실패 시 강한 재시도 후 원본 base64 폴백 |
| 캡션 | 본문 토큰 중 짧은 설명 문구를 수집해 순서대로 매칭 |
| role 추정 | 캡션에 「처리전/후」「위치도」 등이 있으면 해당 role, 기본 `receipt` |
| 원본명 | `sourceName`에 BinData 상대 경로 보존 |

**원본 HWPX·원본 해상도 바이너리는 DB/디스크에 남기지 않는다.**

### 3.4 텍스트 필드 매핑 (휴리스틱)

| 민원 필드 | 추출 단서 |
|---|---|
| `complainantName` | 「성명」 다음 칸 (비어 있으면 `익명`) |
| `complainantPhone` | 「전화번호」 |
| `receivedAt` / `notifiedAt` | 「수렴일자」「접수일」 등 → 파싱 실패 시 오늘 |
| `content` | 「제목」+ 불편/제시의견 본문 |
| `location` | 「위치 :」 패턴 |
| `departmentId` | 「담당기관/부서」 → 부서 마스터 매칭 (실패 시 기본 부서) |
| `dongCode` / 경로 | 본문·소속·위치에서 동 추정 → `시민불편({동})`, 실패 시 기타 경로 |
| `fieldCode` | 제목·내용 키워드로 분야 추론 |
| `processStatus` | 불가 문구 없으면 기본 `SCHEDULED` |
| `assigneeName` | 「담당자」 다음 칸 |
| `remark` | 원본 담당기관 문구 기록 |

파싱 경고(`parseWarnings`)는 초안 UI에 표시한다. **등록 전 사용자 확인이 필수**다.

### 3.5 등록 정책

1. 초안에서 선택(`selected`)된 항목만 등록한다.
2. `sourceFileName` / `parseWarnings` / `selected`는 API payload에서 제거한다.
3. 서버는 일괄 생성 감사 `COMPLAINT_BATCH_CREATE`를 기록한다.
4. 등록 성공 후 초안 목록을 비운다. HWPX 파일 핸들은 유지하지 않는다.

---

## 4. 보안·용량·한계

| 항목 | 정책 |
|---|---|
| 개인정보 | 성명·연락처는 민원 JSON에 평문 저장. 엑셀 내보내기 시 마스킹 옵션 가능 |
| 용량 위험 | 사진 다건·비압축 시 DB·요청 비대화 → HWPX 경로 압축 강제, 목록 API는 사진 본문 제외. 구조적 분산은 [storage-scaling-decision.md](./storage-scaling-decision.md) 참고 |
| 휴리스틱 | 부서·분야·상태·role 오추정 가능 → UX상 검수 필수 |
| 감사 공백 | HWPX/엑셀 **파싱**은 감사 없음. **등록·수정·삭제 API**만 감사 |
| 오프라인 원본 | 원본 민원카드 파일 재현이 필요하면 업무 측에서 HWPX를 별도 보관 |

---

## 5. 관련 코드 맵

| 관심사 | 경로 |
|---|---|
| HWPX 파서 | `src/import/hwpxParser.ts` |
| 가져오기 UI | `src/components/HwpxImportPanel.tsx` |
| 사진 UI | `src/components/PhotoGallery.tsx` |
| 동기화·정규화 | `src/schema/photos.ts` |
| 타입 | `src/schema/types.ts` (`ComplaintPhoto`, `Complaint`) |
| 엑셀 이미지 | `src/export/ledgerExcel.ts` (`includeImages`) |
| API body limit | `server/index.ts` |
