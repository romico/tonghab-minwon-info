import JSZip from "jszip";
import {
  buildDraftFromTokens,
  fieldLabelOf,
  parseKoreanDate,
  type CardImportDraft,
} from "@/import/cardFieldExtract";
import { bytesToDataUrl, stripImageMetadata } from "@/import/stripImageMetadata";
import type { ComplaintPhoto, FieldCode } from "@/schema";

export type HwpxImportDraft = CardImportDraft;
export { fieldLabelOf, parseKoreanDate };

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

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

type CompressOptions = {
  maxEdge: number;
  quality: number;
  maxBytes?: number;
};

function compressImage(blob: Blob, options: CompressOptions): Promise<string> {
  const { maxEdge, quality, maxBytes = 120_000 } = options;
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
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

function collectImageCaptions(tokens: string[]): string[] {
  const captions: string[] = [];
  const skip =
    /^(위치도|현장사진|현황사진|담당|추진|맨홀|코드|제목|의견|성명|전화|접수|수렴|관리|\[|〔)/;
  for (const t of tokens) {
    const v = t.trim();
    if (!v || v.length > 40) continue;
    if (skip.test(v.replace(/\s+/g, ""))) continue;
    if (/^\d+$/.test(v)) continue;
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
      try {
        url = await compressImage(blob, {
          maxEdge: 480,
          quality: 0.4,
          maxBytes: 60_000,
        });
      } catch {
        const stripped = stripImageMetadata(buf);
        if (!stripped) continue;
        url = bytesToDataUrl(stripped.bytes, stripped.mime);
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

export type { FieldCode };
