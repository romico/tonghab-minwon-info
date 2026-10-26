import ExcelJS from "exceljs";
import { parseLedgerExcel } from "./ledgerExcelImport.ts";
import { DEPARTMENT_BY_NAME } from "../schema/master.ts";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("(관리대장)");
ws.getCell("A3").value = "연번";
ws.getCell("A5").value = 1;
ws.getCell("B5").value = "시민불편(우아2동)";
ws.getCell("C5").value = "2026.9.9";
ws.getCell("D5").value = "2026.9.11";
ws.getCell("E5").value = "익명";
ws.getCell("F5").value = "010-0000-0005";
ws.getCell("G5").value = "교통,가로정비";
ws.getCell("H5").value = "장기방치된 차량 처리 요청";
ws.getCell("I5").value = "아중중앙로 oo 맞은편";
ws.getCell("K5").value = "처리불가";
ws.getCell("L5").value = "2026.9.20";
ws.getCell("M5").value = "처리불가";
ws.getCell("N5").value = "덕진구 산업교통과";
ws.getCell("O5").value = "이땡땡";
ws.getCell("R5").value = "비고-테스트";

const imageId = wb.addImage({ base64: png, extension: "png" });
ws.addImage(imageId, {
  tl: { col: 9.1, row: 4.1 },
  ext: { width: 40, height: 30 },
  editAs: "oneCell",
});

const buf = await wb.xlsx.writeBuffer();
const bytes = new Uint8Array(buf as ArrayBuffer);
const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const parsed = await parseLedgerExcel(copy);
if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
if (parsed.items.length !== 1) throw new Error(`rows ${parsed.items.length}`);
const item = parsed.items[0]!;
if (item.receivedAt !== "2026-09-09") throw new Error(item.receivedAt);
if (item.notifiedAt !== "2026-09-11") throw new Error(String(item.notifiedAt));
if (item.fieldCode !== "TRAFFIC") throw new Error(item.fieldCode);
if (item.processStatus !== "IMPOSSIBLE") throw new Error(String(item.processStatus));
if (item.completedOrDueAt !== "2026-09-20") throw new Error(String(item.completedOrDueAt));
if (item.departmentId !== DEPARTMENT_BY_NAME["덕진구 산업교통과"]!.id) {
  throw new Error(item.departmentId);
}
if (item.remark !== "비고-테스트") throw new Error(String(item.remark));
if (!item.photos.some((photo) => photo.role === "receipt" && photo.url.startsWith("data:image/png"))) {
  throw new Error(`photos ${JSON.stringify(item.photos.map((p) => p.role))}`);
}
console.log("ok ledger import", item.photos.length);
