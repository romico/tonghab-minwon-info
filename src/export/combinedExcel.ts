import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type {
  Complaint,
  DailyReport,
  DepartmentStatusRow,
  SummaryReport,
} from "@/schema";
import { addDailySheet } from "@/export/dailyExcel";
import { addDepartmentSheet } from "@/export/departmentExcel";
import { addLedgerSheet } from "@/export/ledgerExcel";
import { addSummarySheet } from "@/export/summaryExcel";

export interface CombinedExportInput {
  complaints: Complaint[];
  departmentStatus: DepartmentStatusRow[];
  summary: SummaryReport;
  daily: DailyReport;
  /** 관리대장 개인정보 마스킹. 기본 false */
  maskPersonalInfo?: boolean;
  /** 관리대장 이미지 포함. 기본 true */
  includeImages?: boolean;
}

/**
 * 관리대장 · 부서별현황 · 총괄표 · 일일보고를 한 엑셀 파일로 생성.
 */
export async function exportCombinedExcel(
  input: CombinedExportInput,
): Promise<void> {
  const {
    complaints,
    departmentStatus,
    summary,
    daily,
    maskPersonalInfo = false,
    includeImages = true,
  } = input;

  const wb = new ExcelJS.Workbook();
  wb.creator = "통합민원정보";
  wb.created = new Date();

  await addLedgerSheet(wb, complaints, { maskPersonalInfo, includeImages });
  addDepartmentSheet(wb, departmentStatus);
  addSummarySheet(wb, summary);
  addDailySheet(wb, daily);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(blob, `생활민원_통합보고서_${stamp}.xlsx`);
}
