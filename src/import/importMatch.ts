import type { Complaint, ComplaintInput } from "@/schema";

function normText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normPhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** 양식 라벨 잔여물을 제거하고 동일 카드 비교용으로 정규화 */
export function normContentForMatch(value: string | null | undefined): string {
  return normText(value)
    .replace(/코드\s*번호/g, " ")
    .replace(/제\s*목/g, " ")
    .replace(/관리\s*번호/g, " ")
    .replace(/[—–-]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 동일 카드 지문.
 * 관리번호·파일명은 관리자가 임의로 바꾸거나 형식이 제각각이므로 쓰지 않는다.
 * 접수일 + 민원내용(+연락처·위치)이 같으면 같은 카드로 본다.
 */
export function buildImportFingerprint(input: {
  receivedAt: string;
  content: string;
  complainantPhone?: string | null;
  location?: string | null;
}): string {
  return [
    "fp",
    input.receivedAt.trim(),
    normContentForMatch(input.content),
    normPhone(input.complainantPhone),
    normText(input.location),
  ].join("|");
}

export function buildImportKeyFromCard(input: {
  receivedAt: string;
  content: string;
  complainantPhone?: string | null;
  location?: string | null;
}): string {
  return buildImportFingerprint(input);
}

/**
 * 가져오기 초안과 기존 민원을 매칭한다.
 * importKey(지문) 일치, 또는 레거시(file:/mgmt:) 건은 내용 지문으로 보조 매칭.
 */
export function findExistingForImport(
  existing: Complaint[],
  draft: Pick<
    ComplaintInput,
    "importKey" | "receivedAt" | "content" | "complainantPhone" | "location"
  >,
): Complaint | null {
  const key = draft.importKey?.trim() || buildImportFingerprint(draft);
  const byKey = existing.find((c) => c.importKey === key);
  if (byKey) return byKey;

  const fp = buildImportFingerprint(draft);
  return (
    existing.find((c) => {
      if (c.importKey === fp) return true;
      // 과거 file:/mgmt: 키 건도 내용이 같으면 동일 카드로 갱신
      return buildImportFingerprint(c) === fp;
    }) ?? null
  );
}

export type ImportResolveResult = {
  input: ComplaintInput;
  action: "create" | "update";
  existingId: string | null;
};

export function resolveImportInput(
  existing: Complaint[],
  draft: ComplaintInput,
): ImportResolveResult {
  const matched = findExistingForImport(existing, draft);
  const importKey = buildImportFingerprint(draft);
  if (matched) {
    return {
      action: "update",
      existingId: matched.id,
      input: {
        ...draft,
        id: matched.id,
        importKey,
      },
    };
  }
  return {
    action: "create",
    existingId: null,
    input: {
      ...draft,
      importKey,
    },
  };
}
