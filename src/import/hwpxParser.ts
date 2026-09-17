import JSZip from "jszip";
import {
  DEPARTMENTS,
  DONGS,
  FIELD_OPTIONS,
  syncPhotoFields,
  type ComplaintInput,
  type ComplaintPhoto,
  type FieldCode,
  type ProcessStatus,
} from "@/schema";
import { buildImportKeyFromCard } from "@/import/importMatch";

export interface HwpxImportDraft extends ComplaintInput {
  sourceFileName: string;
  parseWarnings: string[];
  selected: boolean;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, "\n");
}

function extractTextTokens(sectionXml: string): string[] {
  const tokens: string[] = [];
  const re = /<(?:hp:)?t(?:\s[^>]*)?>(.*?)<\/(?:hp:)?t>/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionXml))) {
    const raw = decodeEntities(m[1] ?? "");
    const text = raw.replace(/<[^>]+>/g, "");
    if (text.length) tokens.push(text);
  }
  return tokens;
}

function extractPrvText(raw: Uint8Array): string {
  const encodings: string[] = ["utf-8", "utf-16le", "utf-16"];
  for (const enc of encodings) {
    try {
      const t = new TextDecoder(enc).decode(raw);
      const score = [...t.slice(0, 200)].filter(
        (c) => (c >= "가" && c <= "힣") || c.charCodeAt(0) < 128,
      ).length;
      if (score > 30) return t;
    } catch {
      /* try next */
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(raw);
}

const FORM_LABELS =
  /^(성명|성\s*명|소속|전화|접수|수렴|의견|코드|관리|제목|위치|담당|추진|또는직업|민원접수|결과통보)/;

function afterLabel(tokens: string[], labels: string[]): string {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.replace(/\s+/g, "");
    if (labels.some((l) => t === l.replace(/\s+/g, "") || t.includes(l.replace(/\s+/g, "")))) {
      for (let j = i + 1; j < Math.min(i + 8, tokens.length); j++) {
        const v = tokens[j]!.trim();
        if (!v) continue;
        const compact = v.replace(/\s+/g, "");
        if (labels.some((l) => compact === l.replace(/\s+/g, ""))) continue;
        if (FORM_LABELS.test(v) || FORM_LABELS.test(compact)) continue;
        if (/^[〔\[【]/.test(v)) continue;
        return v;
      }
    }
  }
  return "";
}

/** 성명 전용: 바로 다음 칸이 라벨이면 공란(익명)으로 본다 */
function extractPersonName(tokens: string[]): string {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.replace(/\s+/g, "");
    if (t === "성명" || t === "성명".replace(/\s+/g, "") || /^성\s*명$/.test(tokens[i]!)) {
      const next = tokens[i + 1]?.trim() ?? "";
      if (!next || FORM_LABELS.test(next) || FORM_LABELS.test(next.replace(/\s+/g, ""))) {
        return "익명";
      }
      return next;
    }
  }
  return afterLabel(tokens, ["성명", "성  명"]) || "익명";
}

function findBetween(
  tokens: string[],
  startLabels: string[],
  endLabels: string[],
): string {
  let start = -1;
  for (let i = 0; i < tokens.length; i++) {
    const compact = tokens[i]!.replace(/\s+/g, "");
    if (startLabels.some((l) => compact.includes(l.replace(/\s+/g, "")))) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";
  const parts: string[] = [];
  for (let i = start; i < tokens.length; i++) {
    const compact = tokens[i]!.replace(/\s+/g, "");
    if (endLabels.some((l) => compact.includes(l.replace(/\s+/g, "")))) break;
    const v = tokens[i]!.trim();
    if (v) parts.push(v);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function parseKoreanDate(raw: string): string | null {
  const m = raw.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (!m) return null;
  const y = m[1]!;
  const mo = m[2]!.padStart(2, "0");
  const d = m[3]!.padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function inferField(text: string): FieldCode {
  const t = text.replace(/\s+/g, "");
  if (/방치차|주차|교통|가로|차량/.test(t)) return "TRAFFIC";
  if (/불법투기|종량제|쓰레기|청소|환경|악취/.test(t)) return "CLEAN";
  if (/공원|녹지|하천|농수로/.test(t)) return "PARK";
  if (/건축|광고|간판/.test(t)) return "BUILDING";
  if (/맨홀|도로|침수|역류|관로|하수|우수/.test(t)) return "ROAD";
  return "ETC";
}

function inferDong(text: string): string | null {
  for (const d of DONGS) {
    if (text.includes(d.code)) return d.code;
  }
  // 관리번호 패턴 우아2동-845
  const m = text.match(/([가-힣0-9]+동)\s*[-−]/);
  if (m) {
    const code = m[1]!;
    if (DONGS.some((d) => d.code === code)) return code;
  }
  return null;
}

function matchDepartment(raw: string, dongHint: string | null): string {
  const cleaned = raw
    .replace(/구청/g, "구")
    .replace(/\s+/g, " ")
    .trim();

  const exact = DEPARTMENTS.find((d) => d.name === cleaned);
  if (exact) return exact.id;

  // "덕진 건설과" → "덕진구 건설과"
  const spaced = cleaned.replace(/덕진\s+/, "덕진구 ").replace(/완산\s+/, "완산구 ");
  const bySpaced = DEPARTMENTS.find((d) => d.name === spaced);
  if (bySpaced) return bySpaced.id;

  const byIncludes = DEPARTMENTS.filter(
    (d) =>
      d.name.includes(cleaned) ||
      cleaned.includes(d.name) ||
      d.name.endsWith(cleaned.replace(/^덕진구\s*|^완산구\s*/, "")),
  );
  if (byIncludes.length === 1) return byIncludes[0]!.id;

  // 과명만 있는 경우 동 힌트로 구 선택
  const shortName = cleaned.replace(/^덕진구\s*|^완산구\s*|^전주시\s*/, "");
  if (dongHint) {
    const dong = DONGS.find((d) => d.code === dongHint);
    if (dong) {
      const prefix = dong.district === "DEOKJIN" ? "덕진구" : "완산구";
      const hit = DEPARTMENTS.find((d) => d.name === `${prefix} ${shortName}`);
      if (hit) return hit.id;
    }
  }

  const soft = DEPARTMENTS.find(
    (d) => d.name.endsWith(shortName) || d.name.includes(shortName),
  );
  if (soft) return soft.id;

  return DEPARTMENTS[0]!.id;
}

function inferProcessStatus(tokens: string[]): ProcessStatus {
  const joined = tokens.join(" ");
  // 양식 기본 문구 "추진중 ․ 종결 ․ 불가 등"은 무시
  const cleaned = joined.replace(
    /추진중\s*[․·\.]\s*종결\s*[․·\.]\s*불가(?:\s*등)?/g,
    " ",
  );
  if (/처리불가|불가(?!\s*등)/.test(cleaned) && !/추진중|처리예정/.test(cleaned)) {
    return "IMPOSSIBLE";
  }
  if (
    /처리완료|완료처리|조치완료|종결\s*처리|(처리결과|처리상태|진행상태)[^\n]{0,24}(완료|종결)/.test(
      cleaned,
    )
  ) {
    return "DONE";
  }
  return "SCHEDULED";
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

async function extractAllImages(
  zip: JSZip,
  tokens: string[],
): Promise<ComplaintPhoto[]> {
  const names = Object.keys(zip.files)
    .filter((n) => n.startsWith("BinData/") && !zip.files[n]!.dir)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const captions = collectImageCaptions(tokens);
  const photos: ComplaintPhoto[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const file = zip.files[name]!;
    const buf = await file.async("uint8array");
    const mime = mimeFromName(name);
    if (!mime.startsWith("image/")) continue;

    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    const blob = new Blob([copy], { type: mime });

    let url: string;
    try {
      url = await compressImage(blob, {
        maxEdge: 640,
        quality: 0.55,
        maxBytes: 90_000,
      });
    } catch {
      // 압축 실패 시에도 원본 대신 최소 JPEG 재시도
      try {
        url = await compressImage(blob, {
          maxEdge: 480,
          quality: 0.4,
          maxBytes: 60_000,
        });
      } catch {
        let binary = "";
        const chunk = 0x8000;
        for (let j = 0; j < buf.length; j += chunk) {
          binary += String.fromCharCode(...buf.subarray(j, j + chunk));
        }
        url = `data:${mime};base64,${btoa(binary)}`;
      }
    }

    const caption = captions[i] ?? null;
    const role = inferPhotoRole(caption, i, names.length);
    photos.push({
      id: `img-${i + 1}`,
      url,
      role,
      label: caption || defaultPhotoLabel(role, i, names.length),
      sourceName: name.replace(/^BinData\//, ""),
    });
  }

  return photos;
}

function collectImageCaptions(tokens: string[]): string[] {
  const captions: string[] = [];
  const skip =
    /^(위치도|현장사진|현황사진|담당|추진|맨홀|코드|제목|의견|성명|전화|접수|수렴|관리|\[|〔)/;
  for (const t of tokens) {
    const v = t.trim();
    if (!v || v.length > 40) continue;
    if (skip.test(v.replace(/\s+/g, ""))) continue;
    if (/^\d+$/.test(v)) continue;
    // 짧은 설명 문구 (예: 농지로 우수 유입, 8.30일 폭우 시 역류)
    if (/유입|역류|폭우|방치|투기|수거|침수|관로|현장|처리\s*전|처리\s*후/.test(v)) {
      captions.push(v);
    }
  }
  return captions;
}

function inferPhotoRole(
  caption: string | null,
  index: number,
  total: number,
): ComplaintPhoto["role"] {
  const c = caption?.replace(/\s+/g, "") ?? "";
  if (/처리전|작업전|조치전/.test(c)) return "before";
  if (/처리후|작업후|조치후|완료/.test(c)) return "after";
  if (/위치도|약도|지도/.test(c)) return "other";
  if (total >= 2 && index === 0 && /위치/.test(c)) return "other";
  return "receipt";
}

function defaultPhotoLabel(
  role: ComplaintPhoto["role"],
  index: number,
  total: number,
): string {
  if (role === "before") return "처리 전";
  if (role === "after") return "처리 후";
  if (role === "other") return total > 1 && index === 0 ? "위치도" : `첨부 ${index + 1}`;
  return total > 1 ? `현장사진 ${index + 1}` : "현장사진";
}

type CompressOptions = {
  maxEdge: number;
  quality: number;
  /** data URL 문자열 길이 상한(대략 base64 포함). 넘으면 품질/크기를 더 줄인다. */
  maxBytes?: number;
};

function compressImage(
  blob: Blob,
  options: CompressOptions,
): Promise<string> {
  const { maxEdge, quality, maxBytes = 120_000 } = options;
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        // 긴 변 기준으로 축소 (기존은 width만 봐서 세로 사진이 거의 안 줄어듦)
        const longEdge = Math.max(img.width, img.height) || 1;
        let scale = Math.min(1, maxEdge / longEdge);
        let q = quality;
        let dataUrl = "";

        for (let attempt = 0; attempt < 5; attempt++) {
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas");
          ctx.drawImage(img, 0, 0, w, h);
          dataUrl = canvas.toDataURL("image/jpeg", q);
          if (dataUrl.length <= maxBytes) break;
          scale *= 0.82;
          q = Math.max(0.35, q - 0.08);
        }

        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image load"));
    };
    img.src = objectUrl;
  });
}

function buildDraftFromTokens(
  tokens: string[],
  sourceFileName: string,
  photos: ComplaintPhoto[],
): HwpxImportDraft {
  const warnings: string[] = [];
  const joined = tokens.join("\n");

  const title =
    afterLabel(tokens, ["제목", "제     목"]) ||
    findBetween(tokens, ["제목", "제     목"], ["수렴", "민원접수", "의견제시자", "관리번호"]);

  const dateRaw =
    afterLabel(tokens, ["수렴일자", "수렴 일자", "민원접수", "접수일", "접 수 일"]) ||
    "";
  const receivedAt = parseKoreanDate(dateRaw) ?? parseKoreanDate(joined);
  if (!receivedAt) warnings.push("접수일을 찾지 못해 오늘 날짜를 사용합니다.");

  const name = extractPersonName(tokens);
  const phone = (() => {
    const p = afterLabel(tokens, ["전화번호"]);
    return /^\d[\d\-]+$/.test(p) ? p : null;
  })();

  const bodyBlock = findBetween(
    tokens,
    ["불편", "불만", "제시의견"],
    ["위치도", "현장사진", "담당", "추진"],
  );

  const locationMatch =
    bodyBlock.match(/위치\s*[:：]\s*(.+?)(?=\s*○|\s*현황|\s*내용|\s*현실|$)/s) ||
    joined.match(/위치\s*[:：]\s*([^\n○]+)/);
  const location = locationMatch?.[1]?.trim() || null;

  const contentParts: string[] = [];
  const cleanTitle = title
    .replace(/코드\s*번호/g, " ")
    .replace(/제\s*목/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanTitle) contentParts.push(cleanTitle);
  const detail =
    bodyBlock
      .replace(/○\s*위\s*치\s*[:：][^\n○]*/g, "")
      .replace(/○\s*위치\s*[:：][^\n○]*/g, "")
      .replace(/코드\s*번호/g, " ")
      .replace(/제\s*목/g, " ")
      .replace(/\s+/g, " ")
      .trim() || cleanTitle;
  if (detail && detail !== cleanTitle) contentParts.push(detail);
  const content = contentParts.join(" — ") || "(내용 없음)";
  if (!cleanTitle) warnings.push("제목을 찾지 못했습니다.");

  const deptRaw =
    afterLabel(tokens, ["담당기관", "담당 기관", "담당부서", "담당 부서"]) || "";
  if (!deptRaw) warnings.push("담당 부서를 찾지 못해 기본 부서를 사용합니다.");

  const collector =
    afterLabel(tokens, ["의견수렴자", "의견 수렴자"]) || "";
  const dong =
    inferDong(joined) ||
    inferDong(collector) ||
    inferDong(deptRaw) ||
    inferDong(location ?? "");

  const departmentId = matchDepartment(deptRaw || "덕진구 행정지원과", dong);
  const fieldCode = inferField(`${title}\n${content}`);
  const routeCode = dong ? `시민불편(${dong})` : "기타(언론,전화 등)";
  if (!dong) warnings.push("행정동을 추정하지 못해 접수경로를 기타로 둡니다.");
  if (photos.length > 1) {
    warnings.push(`첨부 이미지 ${photos.length}장을 모두 가져왔습니다.`);
  } else if (photos.length === 0) {
    warnings.push("첨부 이미지가 없습니다.");
  }

  const assigneeRaw = (() => {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]!.replace(/\s+/g, "") === "담당자") {
        const next = tokens[i + 1]?.trim() ?? "";
        if (!next || FORM_LABELS.test(next) || FORM_LABELS.test(next.replace(/\s+/g, ""))) {
          return null;
        }
        return next;
      }
    }
    return null;
  })();

  const today = new Date().toISOString().slice(0, 10);
  const synced = syncPhotoFields(photos);
  const processStatus = inferProcessStatus(tokens);
  const received = receivedAt ?? today;
  const importKey = buildImportKeyFromCard({
    receivedAt: received,
    content,
    complainantPhone: phone,
    location,
  });

  return {
    sourceFileName,
    parseWarnings: warnings,
    selected: true,
    receiptRouteCode: routeCode,
    receivedAt: received,
    notifiedAt: received,
    complainantName: name,
    complainantPhone: phone,
    fieldCode,
    content,
    location,
    ...synced,
    processStatus,
    completedOrDueAt: processStatus === "DONE" ? received : null,
    pendingReason: null,
    departmentId,
    assigneeName: assigneeRaw,
    remark: deptRaw ? `원본담당: ${deptRaw}` : null,
    importKey,
  };
}

export async function parseHwpxFile(file: File): Promise<HwpxImportDraft> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const section = zip.file("Contents/section0.xml");
  if (!section) {
    throw new Error(`${file.name}: section0.xml이 없습니다.`);
  }
  const sectionXml = await section.async("string");
  let tokens = extractTextTokens(sectionXml);

  if (tokens.filter((t) => t.trim()).length < 8) {
    const prv = zip.file("Preview/PrvText.txt");
    if (prv) {
      const buf = await prv.async("uint8array");
      const text = extractPrvText(buf);
      tokens = text
        .split(/[<>\n\r]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const photos = await extractAllImages(zip, tokens);
  return buildDraftFromTokens(tokens, file.name, photos);
}

export async function parseHwpxFiles(
  files: FileList | File[],
  onProgress?: (done: number, total: number, fileName: string) => void,
): Promise<{
  drafts: HwpxImportDraft[];
  errors: string[];
}> {
  const list = Array.from(files);
  const drafts: HwpxImportDraft[] = [];
  const errors: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i]!;
    onProgress?.(i, list.length, file.name);
    if (!file.name.toLowerCase().endsWith(".hwpx")) {
      errors.push(`${file.name}: HWPX 파일만 지원합니다.`);
      continue;
    }
    try {
      drafts.push(await parseHwpxFile(file));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (list.length > 0) {
    onProgress?.(list.length, list.length, list[list.length - 1]!.name);
  }
  return { drafts, errors };
}

export function fieldLabelOf(code: FieldCode): string {
  return FIELD_OPTIONS.find((f) => f.code === code)?.label ?? code;
}
