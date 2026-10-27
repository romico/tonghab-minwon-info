import ExcelJS from "exceljs";
import { findExistingForImport } from "@/import/importMatch";
import {
  DEPARTMENTS,
  FIELD_OPTIONS,
  PROCESS_STATUS_OPTIONS,
  syncPhotoFields,
  type Complaint,
  type ComplaintInput,
  type ComplaintPhoto,
  type FieldCode,
  type ProcessStatus,
} from "@/schema";

export interface LedgerImportResult {
  items: ComplaintInput[];
  errors: string[];
}

const FIELD_BY_LABEL = new Map(
  FIELD_OPTIONS.map((f) => [compact(f.label), f.code]),
);
const STATUS_BY_LABEL = new Map(
  PROCESS_STATUS_OPTIONS.map((s) => [compact(s.label), s.code]),
);

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

function cellPlain(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "예" : "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("result" in value) {
      return cellPlain(value.result as ExcelJS.CellValue);
    }
  }
  return "";
}

function formatIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  if (Number.isNaN(utc.getTime())) return null;
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value: ExcelJS.CellValue): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatIso(value);
  }
  if (typeof value === "number") return excelSerialToIso(value);
  if (typeof value === "object" && "result" in value) {
    return parseDate(value.result as ExcelJS.CellValue);
  }
  const text = cellPlain(value);
  const m = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

function findDepartmentId(name: string): string | null {
  const key = compact(name);
  if (!key) return null;
  const found = DEPARTMENTS.find((d) => compact(d.name) === key);
  return found?.id ?? null;
}

function findField(label: string): FieldCode | null {
  return FIELD_BY_LABEL.get(compact(label)) ?? null;
}

function findStatus(label: string): ProcessStatus | null {
  const key = compact(label);
  if (!key) return null;
  return STATUS_BY_LABEL.get(key) ?? null;
}

function bytesToDataUrl(bytes: Uint8Array, extension: string): string {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  const mime =
    extension === "png"
      ? "image/png"
      : extension === "gif"
        ? "image/gif"
        : "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

function imageToDataUrl(image: ExcelJS.Image): string | null {
  const extension = image.extension || "jpeg";
  if (image.base64) {
    const mime =
      extension === "png"
        ? "image/png"
        : extension === "gif"
          ? "image/gif"
          : "image/jpeg";
    return `data:${mime};base64,${image.base64}`;
  }
  const buffer = image.buffer;
  if (!buffer) return null;
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer as ArrayBuffer);
  if (bytes.byteLength === 0) return null;
  return bytesToDataUrl(bytes, extension);
}

function photoRole(nativeCol: number): ComplaintPhoto["role"] | null {
  const col = Math.floor(nativeCol);
  if (col === 9) return "receipt";
  if (col === 15) return "before";
  if (col === 16) return "after";
  return null;
}

function photosByRow(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
): Map<number, ComplaintPhoto[]> {
  const byRow = new Map<number, ComplaintPhoto[]>();
  for (const placed of ws.getImages()) {
    const role = photoRole(placed.range.tl.nativeCol);
    const excelRow = Math.floor(placed.range.tl.nativeRow) + 1;
    if (!role || excelRow < 5) continue;
    const image = wb.getImage(Number(placed.imageId));
    const url = imageToDataUrl(image);
    if (!url) continue;
    const list = byRow.get(excelRow) ?? [];
    list.push({
      id: `excel-${excelRow}-${role}-${list.length + 1}`,
      url,
      role,
      sourceName: "관리대장",
    });
    byRow.set(excelRow, list);
  }
  return byRow;
}

function rowIsEmpty(values: string[]): boolean {
  return values.every((value) => value === "");
}

/**
 * 통합 엑셀의 `(관리대장)` 시트를 민원 입력으로 읽는다.
 * 열은 내보내기와 같다. A 연번, B 접수경로, C 접수일, D 통보일, E 성명,
 * F 연락처, G 분야, H 내용, I 위치, J 현장사진, K 처리구분, L 완료·예정일,
 * M 미처리 사유, N 처리부서, O 담당자, P 처리 전, Q 처리 후, R 비고.
 */
export async function parseLedgerExcel(
  data: ArrayBuffer,
): Promise<LedgerImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets.find((sheet) => sheet.name.includes("관리대장"));
  if (!ws) {
    throw new Error("관리대장 시트를 찾지 못했습니다.");
  }
  const header = cellPlain(ws.getRow(3).getCell(1).value);
  if (!header.includes("연번")) {
    throw new Error("관리대장 헤더(연번)를 찾지 못했습니다.");
  }

  const images = photosByRow(wb, ws);
  const items: ComplaintInput[] = [];
  const errors: string[] = [];
  let blankRun = 0;
  const lastRow = Math.min(ws.rowCount || 5, 5000);

  for (let rowIndex = 5; rowIndex <= lastRow; rowIndex++) {
    const row = ws.getRow(rowIndex);
    const route = cellPlain(row.getCell(2).value);
    const receivedRaw = row.getCell(3).value;
    const notifiedRaw = row.getCell(4).value;
    const name = cellPlain(row.getCell(5).value);
    const phone = cellPlain(row.getCell(6).value);
    const fieldLabel = cellPlain(row.getCell(7).value);
    const content = cellPlain(row.getCell(8).value);
    const location = cellPlain(row.getCell(9).value);
    const statusLabel = cellPlain(row.getCell(11).value);
    const dueRaw = row.getCell(12).value;
    const pendingReason = cellPlain(row.getCell(13).value);
    const departmentName = cellPlain(row.getCell(14).value);
    const assignee = cellPlain(row.getCell(15).value);
    const remark = cellPlain(row.getCell(18).value);

    const texts = [
      route,
      cellPlain(receivedRaw),
      cellPlain(notifiedRaw),
      name,
      phone,
      fieldLabel,
      content,
      location,
      statusLabel,
      cellPlain(dueRaw),
      pendingReason,
      departmentName,
      assignee,
      remark,
    ];
    if (rowIsEmpty(texts) && !images.has(rowIndex)) {
      blankRun += 1;
      if (blankRun >= 30) break;
      continue;
    }
    blankRun = 0;

    const rowErrors: string[] = [];
    const receivedAt = parseDate(receivedRaw);
    if (!receivedAt) rowErrors.push("접수일");
    if (!route) rowErrors.push("접수경로");
    if (!content) rowErrors.push("민원내용");
    const fieldCode = findField(fieldLabel);
    if (!fieldCode) rowErrors.push("분야");
    const departmentId = findDepartmentId(departmentName);
    if (!departmentId) rowErrors.push("처리부서");
    let processStatus: ProcessStatus | null = null;
    if (statusLabel) {
      processStatus = findStatus(statusLabel);
      if (!processStatus) rowErrors.push("처리구분");
    }
    if (rowErrors.length > 0 || !receivedAt || !fieldCode || !departmentId) {
      errors.push(`${rowIndex}행: ${rowErrors.join(", ")}을 확인하세요.`);
      continue;
    }

    const photos = images.get(rowIndex) ?? [];
    const synced = syncPhotoFields(photos);
    items.push({
      receiptRouteCode: route,
      receivedAt,
      notifiedAt: parseDate(notifiedRaw),
      complainantName: name,
      complainantPhone: phone || null,
      fieldCode,
      content,
      location: location || null,
      processStatus,
      completedOrDueAt: parseDate(dueRaw),
      pendingReason: pendingReason || null,
      departmentId,
      assigneeName: assignee || null,
      assigneeUserId: null,
      remark: remark || null,
      importKey: null,
      ...synced,
    });
  }

  return { items, errors };
}

/** 시트에 사진이 없는 갱신 건은 기존 사진 본문을 유지한다. */
export function keepExistingPhotos(
  existing: Complaint[],
  inputs: ComplaintInput[],
): ComplaintInput[] {
  return inputs.map((input) => {
    if (input.photos.some((photo) => photo.url)) return input;
    const matched = findExistingForImport(existing, input);
    if (!matched?.photos.some((photo) => photo.url)) return input;
    return { ...input, ...syncPhotoFields(matched.photos) };
  });
}
