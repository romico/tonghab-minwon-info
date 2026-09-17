import type { Complaint, ComplaintPhoto } from "./types";

export function syncPhotoFields(photos: ComplaintPhoto[]): Pick<
  Complaint,
  "photos" | "photoReceiptUrl" | "photoBeforeUrl" | "photoAfterUrl"
> {
  const receipt =
    photos.find((p) => p.role === "receipt") ?? photos[0] ?? null;
  const before = photos.find((p) => p.role === "before") ?? null;
  const after = photos.find((p) => p.role === "after") ?? null;
  return {
    photos,
    photoReceiptUrl: receipt?.url ?? null,
    photoBeforeUrl: before?.url ?? null,
    photoAfterUrl: after?.url ?? null,
  };
}

/** 구버전 데이터(photos 없음)도 배열로 정규화 */
export function coercePhotos(
  partial: Partial<
    Pick<Complaint, "photos" | "photoReceiptUrl" | "photoBeforeUrl" | "photoAfterUrl">
  >,
): ComplaintPhoto[] {
  if (partial.photos && partial.photos.length > 0) return partial.photos;

  const photos: ComplaintPhoto[] = [];
  if (partial.photoReceiptUrl) {
    photos.push({
      id: "legacy-receipt",
      url: partial.photoReceiptUrl,
      role: "receipt",
      label: "현장사진",
    });
  }
  if (partial.photoBeforeUrl) {
    photos.push({
      id: "legacy-before",
      url: partial.photoBeforeUrl,
      role: "before",
      label: "처리 전",
    });
  }
  if (partial.photoAfterUrl) {
    photos.push({
      id: "legacy-after",
      url: partial.photoAfterUrl,
      role: "after",
      label: "처리 후",
    });
  }
  return photos;
}

export function photoRoleLabel(role: ComplaintPhoto["role"]): string {
  switch (role) {
    case "receipt":
      return "현장";
    case "before":
      return "처리전";
    case "after":
      return "처리후";
    default:
      return "기타";
  }
}

/** 목록/메모리용: data URL 등 무거운 이미지 본문을 제거한다. */
export function stripComplaintMedia(c: Complaint): Complaint {
  const photos = (c.photos ?? []).map((p) => ({
    ...p,
    url: "",
  }));
  return {
    ...c,
    photos,
    photoReceiptUrl: null,
    photoBeforeUrl: null,
    photoAfterUrl: null,
  };
}

export function complaintHasMedia(c: Pick<Complaint, "photos" | "photoReceiptUrl" | "photoBeforeUrl" | "photoAfterUrl">): boolean {
  if ((c.photos ?? []).length > 0) return true;
  return Boolean(c.photoReceiptUrl || c.photoBeforeUrl || c.photoAfterUrl);
}

export function complaintMediaLoaded(
  c: Pick<Complaint, "photos" | "photoReceiptUrl" | "photoBeforeUrl" | "photoAfterUrl">,
): boolean {
  if ((c.photos ?? []).some((p) => Boolean(p.url))) return true;
  return Boolean(c.photoReceiptUrl || c.photoBeforeUrl || c.photoAfterUrl);
}
