import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { formatPct, type DepartmentStatusRow } from "@/schema";

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

function styleCell(
  cell: ExcelJS.Cell,
  opts?: { header?: boolean; total?: boolean; hot?: boolean; num?: boolean },
) {
  cell.font = {
    name: "맑은 고딕",
    size: opts?.header ? 10 : 10,
    bold: Boolean(opts?.header || opts?.total),
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: opts?.num || opts?.header ? "center" : "left",
    wrapText: true,
  };
  cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  if (opts?.header) cell.fill = HEADER_FILL;
  else if (opts?.total) cell.fill = TOTAL_FILL;
  else if (opts?.hot) cell.fill = HOT_FILL;
}

/**
 * 원본 「부서별 처리 현황」 양식으로 엑셀 생성.
 * 시트명: (부서별현황)
 */
export async function exportDepartmentExcel(
  rows: DepartmentStatusRow[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "통합민원정보";
  wb.created = new Date();

  const ws = wb.addWorksheet("(부서별현황)", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;

  // 제목
  ws.mergeCells("A1:F1");
  const title = ws.getCell("A1");
  title.value = "부서별 처리 현황";
  title.font = { name: "맑은 고딕", size: 16, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  // 헤더
  const headers = ["연번", "처리부서", "민원건수", "완료", "미처리", "처리율"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    styleCell(cell, { header: true, num: i !== 1 });
  });
  ws.getRow(3).height = 22;

  const total = rows.reduce(
    (acc, r) => ({
      complaintCount: acc.complaintCount + r.complaintCount,
      doneCount: acc.doneCount + r.doneCount,
      unprocessedCount: acc.unprocessedCount + r.unprocessedCount,
    }),
    { complaintCount: 0, doneCount: 0, unprocessedCount: 0 },
  );
  const totalRate =
    total.complaintCount === 0 ? 0 : total.doneCount / total.complaintCount;

  // 계 행
  const totalValues: (string | number)[] = [
    "",
    "계",
    total.complaintCount,
    total.doneCount,
    total.unprocessedCount,
    formatPct(totalRate),
  ];
  totalValues.forEach((v, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = v;
    styleCell(cell, { total: true, num: i !== 1 });
  });

  // 부서 행 (연번 1…N)
  rows.forEach((row, idx) => {
    const r = 5 + idx;
    const hot = row.complaintCount > 0;
    const values: (string | number)[] = [
      idx + 1,
      row.departmentName,
      row.complaintCount,
      row.doneCount,
      row.unprocessedCount,
      formatPct(row.processRate),
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      styleCell(cell, { hot, num: i !== 1 });
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(blob, `부서별_처리현황_${stamp}.xlsx`);
}
