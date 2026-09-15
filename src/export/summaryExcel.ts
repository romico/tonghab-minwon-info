import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  PERIOD_BUCKET_LABEL,
  formatPct,
  type DimensionStat,
  type PeriodBucketKey,
  type SummaryReport,
} from "@/schema";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F0E8" },
};

const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEDE8DF" },
};

const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFB0A898" },
};

const PERIOD_ORDER: PeriodBucketKey[] = [
  "D1_3",
  "D4_5",
  "D6_7",
  "D8_10",
  "D_OVER_10",
  "SCHEDULED",
  "IMPOSSIBLE",
];

function border(cell: ExcelJS.Cell) {
  cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

function styleHeader(cell: ExcelJS.Cell, fill: ExcelJS.Fill = HEADER_FILL) {
  cell.fill = fill;
  cell.font = { name: "맑은 고딕", size: 10, bold: true };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  border(cell);
}

function styleBody(cell: ExcelJS.Cell, center = true) {
  cell.font = { name: "맑은 고딕", size: 10 };
  cell.alignment = {
    horizontal: center ? "center" : "left",
    vertical: "middle",
    wrapText: true,
  };
  border(cell);
}

function pct(n: number): string {
  return formatPct(n);
}

/** 미처리 비율 = 미처리/해당접수 (원본 양식). 0건이면 0% */
function unprocessedRate(item: DimensionStat): number {
  return item.receivedCount === 0
    ? 0
    : item.unprocessedCount / item.receivedCount;
}

function writeDimBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  items: DimensionStat[],
  colsPerItem = 4,
): number {
  const totalReceived = items.reduce((s, i) => s + i.receivedCount, 0);

  ws.mergeCells(startRow, 1, startRow, 2);
  const titleCell = ws.getCell(startRow, 1);
  titleCell.value = title;
  titleCell.font = { name: "맑은 고딕", size: 11, bold: true };
  titleCell.fill = SECTION_FILL;
  border(titleCell);
  border(ws.getCell(startRow, 2));

  const sumCell = ws.getCell(startRow, 3);
  sumCell.value = totalReceived;
  sumCell.font = { name: "맑은 고딕", size: 10, bold: true };
  styleBody(sumCell);

  const r1 = startRow + 1; // 카테고리명
  const r2 = startRow + 2; // 접수/미처리
  const r3 = startRow + 3; // 건수/비율
  const r4 = startRow + 4; // 값

  items.forEach((item, idx) => {
    const c = 1 + idx * colsPerItem;
    ws.mergeCells(r1, c, r1, c + colsPerItem - 1);
    const cat = ws.getCell(r1, c);
    cat.value = item.label;
    styleHeader(cat);

    ws.mergeCells(r2, c, r2, c + 1);
    ws.mergeCells(r2, c + 2, r2, c + 3);
    const recv = ws.getCell(r2, c);
    recv.value = "접수";
    styleHeader(recv);
    const unp = ws.getCell(r2, c + 2);
    unp.value = "미처리";
    styleHeader(unp);
    // fill merged partners
    styleHeader(ws.getCell(r2, c + 1));
    styleHeader(ws.getCell(r2, c + 3));

    ["건수", "비율", "건수", "비율"].forEach((h, i) => {
      const cell = ws.getCell(r3, c + i);
      cell.value = h;
      styleHeader(cell);
    });

    const values = [
      item.receivedCount,
      pct(item.receivedRatio),
      item.unprocessedCount,
      pct(unprocessedRate(item)),
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(r4, c + i);
      cell.value = v;
      styleBody(cell);
    });
  });

  return r4 + 2; // next section start (1 blank row)
}

/**
 * 원본 「생활민원 처리 현황」 총괄표 양식.
 * 시트명: (총괄표)
 */
export function addSummarySheet(
  wb: ExcelJS.Workbook,
  report: SummaryReport,
): void {
  const ws = wb.addWorksheet("(총괄표)");
  for (let i = 1; i <= 24; i++) {
    ws.getColumn(i).width = i % 2 === 1 ? 8 : 9;
  }
  ws.getColumn(1).width = 12;

  // 제목
  ws.mergeCells("A1:X1");
  const title = ws.getCell("A1");
  title.value = "생활민원 처리 현황";
  title.font = { name: "맑은 고딕", size: 16, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  // —— 처리개요 ——
  ws.getCell("A3").value = "처리개요";
  ws.getCell("A3").font = { name: "맑은 고딕", size: 11, bold: true };
  ws.getCell("A3").fill = SECTION_FILL;
  border(ws.getCell("A3"));

  ws.mergeCells("A4:A5");
  ws.getCell("A4").value = "접수 건수";
  styleHeader(ws.getCell("A4"));
  styleHeader(ws.getCell("A5"));

  ws.mergeCells("B4:C4");
  ws.getCell("B4").value = "처리";
  styleHeader(ws.getCell("B4"));
  styleHeader(ws.getCell("C4"));
  ws.getCell("B5").value = "건수";
  ws.getCell("C5").value = "처리율";
  styleHeader(ws.getCell("B5"));
  styleHeader(ws.getCell("C5"));

  ws.mergeCells("D4:E4");
  ws.getCell("D4").value = "미처리";
  styleHeader(ws.getCell("D4"));
  styleHeader(ws.getCell("E4"));
  ws.getCell("D5").value = "건수";
  ws.getCell("E5").value = "처리율";
  styleHeader(ws.getCell("D5"));
  styleHeader(ws.getCell("E5"));

  const ov = report.overview;
  const overviewVals = [
    ov.receivedCount,
    ov.doneCount,
    pct(ov.doneRate),
    ov.unprocessedCount,
    pct(ov.unprocessedRate),
  ];
  overviewVals.forEach((v, i) => {
    const cell = ws.getCell(6, i + 1);
    cell.value = v;
    styleBody(cell);
  });

  // —— 처리기간별 현황 ——
  ws.getCell("A8").value = "처리기간별 현황";
  ws.getCell("A8").font = { name: "맑은 고딕", size: 11, bold: true };
  ws.getCell("A8").fill = SECTION_FILL;
  border(ws.getCell("A8"));

  PERIOD_ORDER.forEach((key, idx) => {
    const c = 1 + idx * 2;
    ws.mergeCells(9, c, 9, c + 1);
    const h = ws.getCell(9, c);
    h.value = PERIOD_BUCKET_LABEL[key];
    styleHeader(h);
    styleHeader(ws.getCell(9, c + 1));

    const v = ws.getCell(10, c);
    v.value = report.byPeriod[key];
    styleBody(v);
    styleBody(ws.getCell(10, c + 1));
    ws.mergeCells(10, c, 10, c + 1);
  });

  // —— 접수경로별 / 분야별 / 실국별 ——
  let nextRow = 12;
  nextRow = writeDimBlock(ws, nextRow, "접수경로별 현황", report.byRoute);
  nextRow = writeDimBlock(ws, nextRow, "분야별 현황", report.byField);
  // 실국은 6열씩 3단으로 나눠 표시 (원본과 유사)
  const bureaus = report.byBureau;
  const chunk = 6;
  for (let i = 0; i < bureaus.length; i += chunk) {
    const slice = bureaus.slice(i, i + chunk);
    const sectionTitle = i === 0 ? "실국별 현황" : "실국별 현황 (계속)";
    nextRow = writeDimBlock(ws, nextRow, sectionTitle, slice);
  }
}

export async function exportSummaryExcel(report: SummaryReport): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "통합민원정보";
  wb.created = new Date();
  addSummarySheet(wb, report);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(blob, `생활민원_처리현황_총괄표_${stamp}.xlsx`);
}
