import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDraftFromTokens,
  tokensFromMarkdown,
  type CardImportDraft,
} from "../src/import/cardFieldExtract.ts";
import { bytesToDataUrl, stripImageMetadata } from "../src/import/stripImageMetadata.ts";
import { syncPhotoFields, type ComplaintPhoto } from "../src/schema/index.ts";

process.env.KORDOC_OFFLINE ??= "1";

const ALLOWED_EXT = new Set([".hwpx", ".hwp", ".pdf"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10;
const MIN_TEXT_CHARS = 40;

export type ParseImportFileInput = {
  originalName: string;
  buffer: Buffer;
};

function extOf(name: string): string {
  const m = name.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m?.[1] ?? "";
}

/**
 * multipart 파일명은 UTF-8인데 multer가 latin1로 읽어 한글이 깨진다.
 * latin1→utf8 복구가 되면 쓰고, 아니면 원문을 유지한다.
 */
export function decodeUploadFileName(name: string): string {
  const raw = String(name ?? "").trim() || "upload.bin";
  if (!/[^\x00-\x7F]/.test(raw)) return raw;
  try {
    const fixed = Buffer.from(raw, "latin1").toString("utf8");
    if (fixed.includes("\uFFFD")) return raw;
    const hasHangul = /[가-힣]/.test(fixed);
    const hasExt = ALLOWED_EXT.has(extOf(fixed));
    if (hasHangul || (hasExt && !fixed.includes("\0"))) return fixed;
  } catch {
    /* keep raw */
  }
  return raw;
}

function photosFromKordocImages(
  images: Array<{ filename: string; data: Uint8Array; mimeType: string }> | undefined,
): ComplaintPhoto[] {
  if (!images?.length) return [];
  const photos: ComplaintPhoto[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    if (!img.mimeType?.startsWith("image/")) continue;
    const stripped = stripImageMetadata(img.data);
    if (!stripped) continue;
    const role: ComplaintPhoto["role"] =
      i === 0 ? "receipt" : i === 1 ? "before" : i === 2 ? "after" : "other";
    photos.push({
      id: `kordoc-${i + 1}`,
      url: bytesToDataUrl(stripped.bytes, stripped.mime),
      role,
      label: img.filename || `첨부 ${i + 1}`,
      sourceName: img.filename,
    });
  }
  return syncPhotoFields(photos).photos;
}

const PARSE_OPTS = { images: true, tableFormat: "gfm" as const };

async function parseOneFile(
  file: ParseImportFileInput,
  parse: typeof import("kordoc").parse,
): Promise<CardImportDraft> {
  const originalName = decodeUploadFileName(file.originalName);
  const ext = extOf(originalName);
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`${originalName}: HWPX·HWP·PDF만 지원합니다.`);
  }
  if (file.buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(`${originalName}: 파일이 20MB를 초과합니다.`);
  }

  const dir = mkdtempSync(join(tmpdir(), "tm-kordoc-"));
  const path = join(dir, `doc${ext}`);
  try {
    writeFileSync(path, file.buffer);
    let result = await parse(path, PARSE_OPTS);
    if (!result.success) {
      throw new Error(`${originalName}: ${result.error}`);
    }

    let markdown = result.markdown ?? "";
    let images = result.images;
    let warnings = result.warnings;
    let isImageBased = Boolean(result.isImageBased);

    const textLen = markdown.replace(/\s+/g, "").length;
    if (textLen < MIN_TEXT_CHARS || isImageBased) {
      const ocrResult = await parse(path, { ...PARSE_OPTS, ocr: true });
      if (ocrResult.success) {
        const ocrLen = (ocrResult.markdown ?? "").replace(/\s+/g, "").length;
        if (ocrLen > textLen) {
          markdown = ocrResult.markdown ?? "";
          images = ocrResult.images;
          warnings = ocrResult.warnings;
          isImageBased = Boolean(ocrResult.isImageBased);
        }
      }
    }

    const tokens = tokensFromMarkdown(markdown);
    const photos = photosFromKordocImages(images);
    const draft = buildDraftFromTokens(tokens, originalName, photos);
    for (const w of warnings ?? []) {
      const msg = typeof w === "string" ? w : (w as { message?: string }).message;
      if (msg) draft.parseWarnings.push(msg);
    }
    if (isImageBased) {
      draft.parseWarnings.push("이미지 기반 문서로 OCR을 사용했습니다.");
    }
    return draft;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function parseImportFiles(files: ParseImportFileInput[]): Promise<{
  drafts: CardImportDraft[];
  errors: string[];
}> {
  if (files.length === 0) {
    throw new Error("파일이 없습니다.");
  }
  if (files.length > MAX_FILES) {
    throw new Error(`한 번에 최대 ${MAX_FILES}개까지 가져올 수 있습니다.`);
  }

  mkdirSync(join(tmpdir(), "tm-kordoc-keep"), { recursive: true });
  const { parse } = await import("kordoc");
  const drafts: CardImportDraft[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      drafts.push(
        await parseOneFile(
          {
            ...file,
            originalName: decodeUploadFileName(file.originalName),
          },
          parse,
        ),
      );
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { drafts, errors };
}
