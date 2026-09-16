import { useState } from "react";
import { SnapshotFreezeBar } from "@/components/SnapshotFreezeBar";
import {
  DAILY_ROUTE_GROUPS,
  DONGS,
  FIELD_OPTIONS,
  fieldLabel,
  formatTriplet,
  routeGroupLabel,
  type FieldCode,
  type RouteGroup,
} from "@/schema";
import { useComplaintStore } from "@/store/ComplaintStore";

const ROW_KEYS = ["TOTAL", ...DAILY_ROUTE_GROUPS] as const;
const COL_KEYS = ["TOTAL", ...FIELD_OPTIONS.map((f) => f.code)] as const;

export function DailyPage() {
  const { daily, reportDate } = useComplaintStore();
  const { cells } = daily.matrix;
  const [exporting, setExporting] = useState(false);

  const wansan = DONGS.filter((d) => d.district === "WANSAN");
  const deokjin = DONGS.filter((d) => d.district === "DEOKJIN");
  const countOf = (code: string) =>
    daily.dongStats.find((d) => d.dongCode === code)?.count ?? 0;

  async function onExportExcel() {
    setExporting(true);
    try {
      const { exportDailyExcel } = await import("@/export/dailyExcel");
      await exportDailyExcel(daily);
    } catch (err) {
      console.error(err);
      window.alert("엑셀 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>일일보고</h1>
          <p>
            보고일 {reportDate} 기준 경로×분야 매트릭스와 동별 시민불편
            현황입니다. 바로 아래 카드에서 스냅샷을 확정하세요.
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => void onExportExcel()}
          >
            {exporting ? "내보내는 중…" : "엑셀 다운로드"}
          </button>
        </div>
      </div>

      <SnapshotFreezeBar />

      <div className="panel">
        <div className="panel-head">
          <h2>생활민원 일일현황</h2>
          <span className="badge">일접수 / 처리누적 / 접수누적</span>
        </div>
        <div className="panel-body matrix-wrap">
          <table className="data-table matrix">
            <thead>
              <tr>
                <th rowSpan={2}>구분</th>
                {COL_KEYS.map((col) => (
                  <th
                    key={col}
                    className="group"
                    colSpan={col === "TOTAL" ? 3 : 3}
                  >
                    {fieldLabel(col as FieldCode | "TOTAL")}
                  </th>
                ))}
              </tr>
              <tr>
                {COL_KEYS.map((col) => (
                  <th key={`${col}-sub`} colSpan={3} className="num group">
                    <span
                      style={{
                        display: "inline-grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        width: "100%",
                        gap: 4,
                      }}
                    >
                      <span>일접수</span>
                      <span>처리누적</span>
                      <span>접수누적</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_KEYS.map((row) => (
                <tr key={row} className={row === "TOTAL" ? "total" : undefined}>
                  <td>{routeGroupLabel(row as RouteGroup | "TOTAL")}</td>
                  {COL_KEYS.map((col) => {
                    const m = cells[row]?.[col] ?? {
                      dailyReceived: 0,
                      cumulativeDone: 0,
                      cumulativeReceived: 0,
                    };
                    return (
                      <td
                        key={`${row}-${col}`}
                        colSpan={3}
                        className="num group"
                      >
                        <span
                          style={{
                            display: "inline-grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            width: "100%",
                            gap: 4,
                          }}
                        >
                          <span>{m.dailyReceived}</span>
                          <span>{m.cumulativeDone}</span>
                          <span>{m.cumulativeReceived}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>입력자료</h2>
          <span className="badge">일접수/처리누적/접수누적</span>
        </div>
        <div className="panel-body matrix-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>구분</th>
                {COL_KEYS.map((col) => (
                  <th key={col} className="num">
                    {fieldLabel(col as FieldCode | "TOTAL")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_KEYS.map((row) => (
                <tr key={row} className={row === "TOTAL" ? "total" : undefined}>
                  <td>{routeGroupLabel(row as RouteGroup | "TOTAL")}</td>
                  {COL_KEYS.map((col) => {
                    const m = cells[row]?.[col] ?? {
                      dailyReceived: 0,
                      cumulativeDone: 0,
                      cumulativeReceived: 0,
                    };
                    return (
                      <td key={`${row}-${col}`} className="num">
                        {formatTriplet(m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>동별 시민불편 현황</h2>
        </div>
        <div className="dong-grid">
          <div className="dong-col">
            <h3>
              완산구 ({wansan.length}개동) · {daily.wansanTotal}건
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>동</th>
                  <th className="num">건수</th>
                </tr>
              </thead>
              <tbody>
                {wansan.map((d) => (
                  <tr
                    key={d.code}
                    className={countOf(d.code) > 0 ? "hot" : undefined}
                  >
                    <td>{d.code}</td>
                    <td className="num">{countOf(d.code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dong-col">
            <h3>
              덕진구 ({deokjin.length}개동) · {daily.deokjinTotal}건
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>동</th>
                  <th className="num">건수</th>
                </tr>
              </thead>
              <tbody>
                {deokjin.map((d) => (
                  <tr
                    key={d.code}
                    className={countOf(d.code) > 0 ? "hot" : undefined}
                  >
                    <td>{d.code}</td>
                    <td className="num">{countOf(d.code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
