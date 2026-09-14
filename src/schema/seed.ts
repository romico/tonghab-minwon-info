import { DEPARTMENT_BY_NAME, inferDongCode, inferRouteGroup } from "./master";
import { coercePhotos, syncPhotoFields } from "./photos";
import type { Complaint } from "./types";

/** 원본 테스트자료 3.xlsx 관리대장 샘플 2건 */
export const SEED_COMPLAINTS: Complaint[] = [
  {
    id: "1",
    receiptRouteCode: "시민불편(우아2동)",
    receiptRouteGroup: "CITIZEN",
    receivedAt: "2026-09-09",
    notifiedAt: "2026-09-11",
    complainantName: "익명",
    complainantPhone: "010-0000-0005",
    fieldCode: "TRAFFIC",
    content: "장기방치된 차량 처리 요청 (00모0000)",
    location: "아중중앙로 oo 맞은편",
    photoReceiptUrl: null,
    processStatus: "IMPOSSIBLE",
    completedOrDueAt: null,
    pendingReason: "처리불가",
    departmentId: DEPARTMENT_BY_NAME["덕진구 산업교통과"]!.id,
    assigneeName: "이땡땡",
    photoBeforeUrl: null,
    photoAfterUrl: null,
    photos: [],
    remark: null,
    dongCode: "우아2동",
  },
  {
    id: "2",
    receiptRouteCode: "시민불편(조촌동)",
    receiptRouteGroup: "CITIZEN",
    receivedAt: "2026-09-10",
    notifiedAt: "2026-09-11",
    complainantName: "익명",
    complainantPhone: "010-0000-0006",
    fieldCode: "CLEAN",
    content:
      "불법투기 쓰레기 및 종량제봉투 쓰레기가 수거 되지 않아 지속적으로 불법쓰레기를 버리는 상황으로 주변 환경이 저해되고 있으므로 불법투기 쓰레기 및 종량제 봉투 수거 처리 요청",
    location: "남정동 999-9 앞",
    photoReceiptUrl: null,
    processStatus: "IMPOSSIBLE",
    completedOrDueAt: null,
    pendingReason: "처리불가",
    departmentId: DEPARTMENT_BY_NAME["덕진구 청소위생과"]!.id,
    assigneeName: "임땡땡",
    photoBeforeUrl: null,
    photoAfterUrl: null,
    photos: [],
    remark: null,
    dongCode: "조촌동",
  },
];

export function normalizeComplaint(
  partial: Omit<Complaint, "receiptRouteGroup" | "dongCode" | "photos"> & {
    receiptRouteGroup?: Complaint["receiptRouteGroup"];
    dongCode?: string | null;
    photos?: Complaint["photos"];
  },
): Complaint {
  const photos = coercePhotos(partial);
  const synced = syncPhotoFields(photos);
  return {
    ...partial,
    ...synced,
    receiptRouteGroup:
      partial.receiptRouteGroup ?? inferRouteGroup(partial.receiptRouteCode),
    dongCode: partial.dongCode ?? inferDongCode(partial.receiptRouteCode),
  };
}
