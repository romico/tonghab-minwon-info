import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  DEPARTMENT_BY_ID,
  FIELD_LABEL,
  PROCESS_STATUS_LABEL,
  type Complaint,
  type ComplaintPhoto,
} from "@/schema";
import { maskName, maskPhone } from "@/lib/privacy";

export interface LedgerExportOptions {
  /** true면 성명·연락처 마스킹 */
  maskPersonalInfo?: boolean;
  /** 이미지 삽입 (용량↑). 기본 true */
  includeImages?: boolean;
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}`;
}

function statusLabel(c: Complaint): string {
  return c.processStatus ? PROCESS_STATUS_LABEL[c.processStatus] : "";
}

function pickPhoto(
  photos: ComplaintPhoto[],
  role: ComplaintPhoto["role"],
): ComplaintPhoto | undefined {
  return photos.find((p) => p.role === role);
}

function dataUrlToBuffer(
  dataUrl: string,
): { buffer: ArrayBuffer; ext: "jpeg" | "png" } | null {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) return null;
  const b64 = m[2]!;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // webp는 exceljs가 jpeg/png만 받으므로 jpeg로 표기(실제 바이트는 원본; 대부분 jpeg 저장)
  const kind = m[1]!.toLowerCase();
  const ext = kind === "png" ? "png" : "jpeg";
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return { buffer, ext };
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F0E8" },
};

const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFB0A898" },
};

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.fill = HEADER_FILL;
  cell.font = { name: "맑은 고딕", size: 10, bold: true };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

function applyBodyStyle(cell: ExcelJS.Cell, opts?: { wrap?: boolean; center?: boolean }) {
  cell.font = { name: "맑은 고딕", size: 10 };
  cell.alignment = {
    vertical: "middle",
    horizontal: opts?.center ? "center" : "left",
    wrapText: opts?.wrap ?? true,
  };
  cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

export async function addLedgerSheet(
  wb: ExcelJS.Workbook,
  complaints: Complaint[],
  options: LedgerExportOptions = {},
): Promise<void> {
  const { maskPersonalInfo = false, includeImages = true } = options;

  const ws = wb.addWorksheet("(관리대장)", {
    views: [{ state: "frozen", ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });

  // 열 너비 (A=1 … R=18)
  const widths = [6, 18, 12, 12, 10, 14, 14, 36, 18, 14, 10, 12, 16, 18, 10, 12, 12, 12];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // 제목
  ws.mergeCells("A1:R1");
  const title = ws.getCell("A1");
  title.value = "생활민원 관리 대장";
  title.font = { name: "맑은 고딕", size: 16, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.getRow(2).height = 8;

  // 헤더 행 3–4 (원본 양식)
  ws.mergeCells("A3:A4");
  ws.mergeCells("B3:B4");
  ws.mergeCells("C3:C4");
  ws.mergeCells("D3:D4");
  ws.mergeCells("E3:F3");
  ws.mergeCells("G3:G4");
  ws.mergeCells("H3:J3");
  ws.mergeCells("K3:K4"); // 처리구분 (독립 열)
  ws.mergeCells("L3:O3"); // 처리현황
  ws.mergeCells("P3:Q3");
  ws.mergeCells("R3:R4");

  const h3: Record<string, string> = {
    A3: "연번",
    B3: "접수경로",
    C3: "접수일\n(점검일)",
    D3: "처리부서\n통보일",
    E3: "민원인",
    G3: "분야",
    H3: "민원사항",
    K3: "처리구분",
    L3: "처리현황",
    P3: "현장사진",
    R3: "비고",
  };
  for (const [addr, val] of Object.entries(h3)) {
    ws.getCell(addr).value = val;
  }

  const h4: Record<string, string> = {
    E4: "성명",
    F4: "연락처",
    H4: "민원(통보)내용",
    I4: "위치",
    J4: "현장사진",
    L4: "처리완료일\n(예정일)",
    M4: "미처리 사유(불가,예정)",
    N4: "처리부서",
    O4: "담당자",
    P4: "처리 전",
    Q4: "처리 후",
  };
  for (const [addr, val] of Object.entries(h4)) {
    ws.getCell(addr).value = val;
  }

  for (let r = 3; r <= 4; r++) {
    ws.getRow(r).height = 22;
    for (let c = 1; c <= 18; c++) applyHeaderStyle(ws.getCell(r, c));
  }

  // 데이터
  complaints.forEach((c, idx) => {
    const rowIdx = 5 + idx;
    const row = ws.getRow(rowIdx);
    row.height = includeImages ? 72 : 36;

    const name = maskPersonalInfo ? maskName(c.complainantName) : c.complainantName;
    const phone = maskPersonalInfo
      ? maskPhone(c.complainantPhone) || ""
      : c.complainantPhone || "";

    const photos = c.photos ?? [];
    const receipt =
      pickPhoto(photos, "receipt") ?? photos.find((p) => p.role === "other") ?? photos[0];
    const before = pickPhoto(photos, "before");
    const after = pickPhoto(photos, "after");

    const values: (string | number)[] = [
      idx + 1,
      c.receiptRouteCode,
      formatDisplayDate(c.receivedAt),
      formatDisplayDate(c.notifiedAt),
      name,
      phone,
      FIELD_LABEL[c.fieldCode],
      c.content,
      c.location ?? "",
      "", // J 현장사진 — 이미지
      statusLabel(c),
      formatDisplayDate(c.completedOrDueAt),
      c.pendingReason ?? "",
      DEPARTMENT_BY_ID[c.departmentId]?.name ?? "",
      c.assigneeName ?? "",
      "", // P 처리 전
      "", // Q 처리 후
      c.remark ?? "",
    ];

    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      applyBodyStyle(cell, {
        center: i === 0 || i === 2 || i === 3 || i === 10 || i === 11,
        wrap: true,
      });
    });

    if (includeImages) {
      const embeds: { photo?: ComplaintPhoto; col: number }[] = [
        { photo: receipt, col: 10 },
        { photo: before, col: 16 },
        { photo: after, col: 17 },
      ];
      for (const { photo, col } of embeds) {
        if (!photo?.url?.startsWith("data:image")) continue;
        const parsed = dataUrlToBuffer(photo.url);
        if (!parsed) continue;
        const imageId = wb.addImage({
          buffer: parsed.buffer,
          extension: parsed.ext,
        });
        ws.addImage(imageId, {
          tl: { col: col - 1 + 0.1, row: rowIdx - 1 + 0.1 },
          ext: { width: 88, height: 60 },
          editAs: "oneCell",
        });
      }
    } else {
      // 이미지 대신 장수 표기
      row.getCell(10).value =
        photos.filter((p) => p.role === "receipt" || p.role === "other").length ||
        (photos[0] ? 1 : 0)
          ? `${photos.length}장`
          : "";
      row.getCell(16).value = before ? "있음" : "";
      row.getCell(17).value = after ? "있음" : "";
    }
  });
}

export async function exportLedgerExcel(
  complaints: Complaint[],
  options: LedgerExportOptions = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "통합민원정보";
  wb.created = new Date();
  await addLedgerSheet(wb, complaints, options);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(blob, `생활민원_관리대장_${stamp}.xlsx`);
}
