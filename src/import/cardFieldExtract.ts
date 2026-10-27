import {
  DEPARTMENTS,
  DONGS,
  FIELD_OPTIONS,
  syncPhotoFields,
  type ComplaintInput,
  type ComplaintPhoto,
  type FieldCode,
  type ProcessStatus,
} from "../schema/index.ts";
import { buildImportKeyFromCard } from "./importMatch.ts";

export interface CardImportDraft extends ComplaintInput {
  sourceFileName: string;
  parseWarnings: string[];
  selected: boolean;
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

function extractPersonName(tokens: string[]): string {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.replace(/\s+/g, "");
    if (t === "성명" || /^성\s*명$/.test(tokens[i]!)) {
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

/** 시민불편(…동) 접수경로에 걸리지 않도록 본문 섹션만 시작점으로 쓴다. */
function isBodySectionStart(compact: string): boolean {
  if (/시민불편/.test(compact)) return false;
  if (/제시의견|불편및불만|불편·불만|불편\/불만|민원내용/.test(compact)) {
    return true;
  }
  return compact === "불편" || compact === "불만" || compact === "제시의견";
}

function isBodySectionEnd(compact: string): boolean {
  return (
    /위치도|현장사진|담당기관|담당부서|담당자|의견수렴자|추진중|처리결과|처리상태|진행상태/.test(
      compact,
    ) ||
    compact === "담당" ||
    compact === "추진"
  );
}

function findBodyBlock(tokens: string[]): string {
  let start = -1;
  for (let i = 0; i < tokens.length; i++) {
    const compact = tokens[i]!.replace(/\s+/g, "");
    if (isBodySectionStart(compact)) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";
  const parts: string[] = [];
  for (let i = start; i < tokens.length; i++) {
    const compact = tokens[i]!.replace(/\s+/g, "");
    if (isBodySectionEnd(compact)) break;
    const v = tokens[i]!.trim();
    if (v) parts.push(v);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** GFM 표 잔여 파이프를 제거한다. `|`만 남으면 빈 문자열. */
function stripMarkdownPipes(input: string): string {
  const cleaned = String(input ?? "")
    .replace(/\|+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/^[\s|]+|[\s|]+$/g, "").trim();
}

/** ○ 내용 / 내용: / 현황: 본문만 추출. 제목은 content에 넣지 않는다. */
function extractComplaintBody(bodyBlock: string, joined: string): string {
  const sources = [bodyBlock, joined].filter(Boolean);
  for (const src of sources) {
    const patterns = [
      /○\s*내\s*용\s*[:：]\s*(.+?)(?=\s*○|\s*담당|\s*추진|\s*위치도|\s*현장사진|$)/s,
      /(?:^|[\s\|])내용\s*[:：]\s*(.+?)(?=\s*○|\s*현황|\s*위치|\s*담당|\s*추진|$)/s,
      /현황\s*[:：]\s*(.+?)(?=\s*○|\s*내용|\s*위치|\s*담당|\s*추진|$)/s,
    ];
    for (const re of patterns) {
      const m = src.match(re);
      const hit = stripMarkdownPipes(stripHtmlToText(m?.[1] ?? ""));
      if (hit && hit.length >= 2) return hit;
    }
  }
  if (!bodyBlock) return "";
  return stripMarkdownPipes(
    stripHtmlToText(
      bodyBlock
        .replace(/○\s*위\s*치\s*[:：][^\n○]*/g, "")
        .replace(/○\s*위치\s*[:：][^\n○]*/g, "")
        .replace(/위치\s*[:：]\s*[^\n○]*/g, "")
        .replace(/코드\s*번호/g, " ")
        .replace(/제\s*목/g, " "),
    ),
  );
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

/** HTML 태그·엔티티를 평문으로 만든다. */
export function stripHtmlToText(input: string): string {
  return String(input ?? "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*tr\s*>/gi, "\n")
    .replace(/<\/\s*td\s*>/gi, " ")
    .replace(/<\/\s*th\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pushTableCells(line: string, tokens: string[]): void {
  for (const cell of line.split("|")) {
    const v = stripMarkdownPipes(
      stripHtmlToText(cell.replace(/\*\*/g, "")),
    );
    if (v && !/^:?-{3,}:?$/.test(v)) tokens.push(v);
  }
}

/** 마크다운·표 셀을 라벨 휴리스틱용 토큰으로 쪼갠다. */
export function tokensFromMarkdown(markdown: string): string[] {
  const plain = stripHtmlToText(markdown);
  const tokens: string[] = [];
  for (const line of plain.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\|?\s*:?-{3,}/.test(trimmed)) continue;
    // 선행 | 유무와 무관 — `|` 2개 이상이면 GFM 표 행으로 본다
    if (trimmed.startsWith("|") || (trimmed.match(/\|/g) ?? []).length >= 2) {
      pushTableCells(trimmed, tokens);
      continue;
    }
    const cleaned = stripMarkdownPipes(
      stripHtmlToText(
        trimmed
          .replace(/^#{1,6}\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "")
          .replace(/\*\*/g, ""),
      ),
    );
    if (cleaned) tokens.push(cleaned);
  }
  return tokens;
}

export function buildDraftFromTokens(
  tokens: string[],
  sourceFileName: string,
  photos: ComplaintPhoto[],
): CardImportDraft {
  const warnings: string[] = [];
  const joined = tokens.join("\n");

  const title = stripHtmlToText(
    afterLabel(tokens, ["제목", "제     목"]) ||
      findBetween(tokens, ["제목", "제     목"], ["수렴", "민원접수", "의견제시자", "관리번호"]),
  );

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

  const bodyBlock = findBodyBlock(tokens);

  const locationMatch =
    bodyBlock.match(/위치\s*[:：]\s*(.+?)(?=\s*○|\s*현황|\s*내용|\s*현실|$)/s) ||
    joined.match(/위치\s*[:：]\s*([^\n○]+)/);
  const location =
    stripMarkdownPipes(stripHtmlToText(locationMatch?.[1]?.trim() || "")) ||
    null;

  const cleanTitle = title
    .replace(/코드\s*번호/g, " ")
    .replace(/제\s*목/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const detail = extractComplaintBody(bodyBlock, joined);
  const content =
    stripMarkdownPipes(stripHtmlToText(detail || cleanTitle)) ||
    "(내용 없음)";
  if (!cleanTitle) warnings.push("제목을 찾지 못했습니다.");
  if (!detail) warnings.push("민원 본문을 찾지 못해 제목으로 대체합니다.");

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
    assigneeUserId: null,
    remark: deptRaw ? `원본담당: ${deptRaw}` : null,
    importKey,
  };
}

export function fieldLabelOf(code: FieldCode): string {
  return FIELD_OPTIONS.find((f) => f.code === code)?.label ?? code;
}
