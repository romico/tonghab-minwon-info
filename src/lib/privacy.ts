/** 개인정보 마스킹 유틸 (표시용). 원본은 스토어에 유지한다. */

export function maskName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "—";
  if (n === "익명" || n === "무명") return n;
  if (n.length === 1) return n;
  if (n.length === 2) return `${n[0]}○`;
  return `${n[0]}${"○".repeat(n.length - 1)}`;
}

export function maskPhone(phone: string | null | undefined): string {
  const p = (phone ?? "").trim();
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7) {
    return "*".repeat(Math.max(p.length, 4));
  }
  // 010-****-1234 형태 (뒤 4자리만 노출)
  const last4 = digits.slice(-4);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${last4}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-***-${last4}`;
  }
  return `${digits.slice(0, 3)}-****-${last4}`;
}

export function hasPersonalInfo(
  name: string | null | undefined,
  phone: string | null | undefined,
): boolean {
  const n = (name ?? "").trim();
  const p = (phone ?? "").trim();
  const nameSensitive = Boolean(n) && n !== "익명" && n !== "무명";
  return nameSensitive || Boolean(p);
}
