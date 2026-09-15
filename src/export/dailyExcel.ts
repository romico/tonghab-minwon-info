import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  DAILY_ROUTE_GROUPS,
  DONGS,
  FIELD_OPTIONS,
  fieldLabel,
  formatTriplet,
  routeGroupLabel,
  type DailyCellMetrics,
  type DailyReport,
  type FieldCode,
  type RouteGroup,
} from "@/schema";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F0E8" },
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFAF6EF" },
};

const HOT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF1F2" },
};

const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFB0A898" },
};

const ROW_KEYS = ["TOTAL", ...DAILY_ROUTE_GROUPS] as const;
const COL_KEYS = ["TOTAL", ...FIELD_OPTIONS.map((f) => f.code)] as const;
const METRICS = ["일접수", "처리누적", "접수누적"] as const;

function border(cell: ExcelJS.Cell) {
  cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
}

function styleHeader(cell: ExcelJS.Cell) {
  cell.fill = HEADER_FILL;
  cell.font = { name: "맑은 고딕", size: 9, bold: true };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  border(cell);
}

function styleBody(
  cell: ExcelJS.Cell,
  opts?: { total?: boolean; hot?: boolean },
) {
  cell.font = {
    name: "맑은 고딕",
    size: 10,
    bold: Boolean(opts?.total),
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  border(cell);
  if (opts?.total) cell.fill = TOTAL_FILL;
  else if (opts?.hot) cell.fill = HOT_FILL;
}

function emptyMetrics(): DailyCellMetrics {
  return { dailyReceived: 0, cumulativeDone: 0, cumulativeReceived: 0 };
}

function metricValues(m: DailyCellMetrics): number[] {
  return [m.dailyReceived, m.cumulativeDone, m.cumulativeReceived];
}

/**
 * 원본 「일일보고」 양식.
 * 시트명: (일일보고)
 */
export function addDailySheet(wb: ExcelJS.Workbook, report: DailyReport): void {
  const ws = wb.addWorksheet("(일일보고)");
  // A=구분, B~V = 7그룹×3메트릭
  ws.getColumn(1).width = 12;
  for (let c = 2; c <= 22; c++) ws.getColumn(c).width = 8;

  const { cells } = report.matrix;

  // —— 1. 생활민원 일일현황 ——
  ws.mergeCells("A1:G1");
  const t1 = ws.getCell("A1");
  t1.value = `□ 생활민원 일일현황 (보고일 ${report.reportDate})`;
  t1.font = { name: "맑은 고딕", size: 12, bold: true };
  t1.alignment = { vertical: "middle" };
  ws.getRow(1).height = 22;

  // 헤더 row 2–3
  ws.getCell(2, 1).value = "구분";
  ws.mergeCells(2, 1, 3, 1);
  styleHeader(ws.getCell(2, 1));
  styleHeader(ws.getCell(3, 1));

  COL_KEYS.forEach((col, idx) => {
    const start = 2 + idx * 3;
    ws.mergeCells(2, start, 2, start + 2);
    const h = ws.getCell(2, start);
    h.value = fieldLabel(col as FieldCode | "TOTAL");
    styleHeader(h);
    styleHeader(ws.getCell(2, start + 1));
    styleHeader(ws.getCell(2, start + 2));
    METRICS.forEach((m, i) => {
      const cell = ws.getCell(3, start + i);
      cell.value = m;
      styleHeader(cell);
    });
  });
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 18;

  ROW_KEYS.forEach((rowKey, rIdx) => {
    const r = 4 + rIdx;
    const isTotal = rowKey === "TOTAL";
    const labelCell = ws.getCell(r, 1);
    labelCell.value = routeGroupLabel(rowKey as RouteGroup | "TOTAL");
    styleBody(labelCell, { total: isTotal });

    COL_KEYS.forEach((col, cIdx) => {
      const m = cells[rowKey]?.[col] ?? emptyMetrics();
      const start = 2 + cIdx * 3;
      const hot = m.cumulativeReceived > 0 || m.dailyReceived > 0;
      metricValues(m).forEach((v, i) => {
        const cell = ws.getCell(r, start + i);
        cell.value = v;
        styleBody(cell, { total: isTotal, hot: !isTotal && hot });
      });
    });
  });

  // —— 2. 입력자료 ——
  const inputTitleRow = 10;
  ws.mergeCells(inputTitleRow, 1, inputTitleRow, 7);
  const t2 = ws.getCell(inputTitleRow, 1);
  t2.value = "□ 입력자료";
  t2.font = { name: "맑은 고딕", size: 12, bold: true };

  const inputHeaderRow = 11;
  ws.getCell(inputHeaderRow, 1).value = "구분";
  styleHeader(ws.getCell(inputHeaderRow, 1));
  COL_KEYS.forEach((col, idx) => {
    const cell = ws.getCell(inputHeaderRow, 2 + idx);
    cell.value = fieldLabel(col as FieldCode | "TOTAL");
    styleHeader(cell);
  });

  ROW_KEYS.forEach((rowKey, rIdx) => {
    const r = 12 + rIdx;
    const isTotal = rowKey === "TOTAL";
    const labelCell = ws.getCell(r, 1);
    labelCell.value = routeGroupLabel(rowKey as RouteGroup | "TOTAL");
    styleBody(labelCell, { total: isTotal });

    COL_KEYS.forEach((col, cIdx) => {
      const m = cells[rowKey]?.[col] ?? emptyMetrics();
      const cell = ws.getCell(r, 2 + cIdx);
      cell.value = formatTriplet(m);
      styleBody(cell, {
        total: isTotal,
        hot: !isTotal && m.cumulativeReceived > 0,
      });
    });
  });

  // —— 3. 동별 시민불편 현황 ——
  const dongTitleRow = 18;
  ws.mergeCells(dongTitleRow, 1, dongTitleRow, 4);
  const t3 = ws.getCell(dongTitleRow, 1);
  t3.value = "□ 동별 시민불편 현황";
  t3.font = { name: "맑은 고딕", size: 12, bold: true };

  const wansan = DONGS.filter((d) => d.district === "WANSAN");
  const deokjin = DONGS.filter((d) => d.district === "DEOKJIN");
  const countOf = (code: string) =>
    report.dongStats.find((d) => d.dongCode === code)?.count ?? 0;

  const dongHeaderRow = 19;
  [
    [1, "완산구"],
    [2, "건수"],
    [3, "덕진구"],
    [4, "건수"],
  ].forEach(([col, val]) => {
    const cell = ws.getCell(dongHeaderRow, col as number);
    cell.value = val as string;
    styleHeader(cell);
  });

  const sumRow = 20;
  ws.getCell(sumRow, 1).value = `${wansan.length}개동`;
  ws.getCell(sumRow, 2).value = report.wansanTotal;
  ws.getCell(sumRow, 3).value = `${deokjin.length}개동`;
  ws.getCell(sumRow, 4).value = report.deokjinTotal;
  for (let c = 1; c <= 4; c++) {
    styleBody(ws.getCell(sumRow, c), {
      total: true,
      hot: (c === 2 && report.wansanTotal > 0) || (c === 4 && report.deokjinTotal > 0),
    });
  }

  const maxDong = Math.max(wansan.length, deokjin.length);
  for (let i = 0; i < maxDong; i++) {
    const r = 21 + i;
    const w = wansan[i];
    const d = deokjin[i];
    if (w) {
      ws.getCell(r, 1).value = w.code;
      ws.getCell(r, 2).value = countOf(w.code);
      styleBody(ws.getCell(r, 1), { hot: countOf(w.code) > 0 });
      styleBody(ws.getCell(r, 2), { hot: countOf(w.code) > 0 });
    }
    if (d) {
      ws.getCell(r, 3).value = d.code;
      ws.getCell(r, 4).value = countOf(d.code);
      styleBody(ws.getCell(r, 3), { hot: countOf(d.code) > 0 });
      styleBody(ws.getCell(r, 4), { hot: countOf(d.code) > 0 });
    }
  }

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 10;
}

export async function exportDailyExcel(report: DailyReport): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "통합민원정보";
  wb.created = new Date();
  addDailySheet(wb, report);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(blob, `생활민원_일일보고_${stamp}.xlsx`);
}
