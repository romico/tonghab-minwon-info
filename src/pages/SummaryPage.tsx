import { useState } from "react";
import { PERIOD_BUCKET_LABEL, formatPct, type PeriodBucketKey } from "@/schema";
import { useComplaintStore } from "@/store/ComplaintStore";

const PERIOD_ORDER: PeriodBucketKey[] = [
  "D1_3",
  "D4_5",
  "D6_7",
  "D8_10",
  "D_OVER_10",
  "SCHEDULED",
  "IMPOSSIBLE",
];

function DimSection({
  title,
  items,
}: {
  title: string;
  items: {
    key: string;
    label: string;
    receivedCount: number;
    receivedRatio: number;
    unprocessedCount: number;
    unprocessedRatio: number;
  }[];
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <div className="dim-grid">
        {items.map((item) => (
          <div className="dim-card" key={item.key}>
            <h4>{item.label}</h4>
            <dl>
              <dt>접수</dt>
              <dd>
                {item.receivedCount} ({formatPct(item.receivedRatio)})
              </dd>
              <dt>미처리</dt>
              <dd>
                {item.unprocessedCount} (
                {formatPct(
                  item.receivedCount === 0
                    ? 0
                    : item.unprocessedCount / item.receivedCount,
                )}
                )
              </dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SummaryPage() {
  const { summary } = useComplaintStore();
  const { overview, byPeriod, byRoute, byField, byBureau } = summary;
  const [exporting, setExporting] = useState(false);

  async function onExportExcel() {
    setExporting(true);
    try {
      const { exportSummaryExcel } = await import("@/export/summaryExcel");
      await exportSummaryExcel(summary);
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
          <h1>총괄표</h1>
          <p>처리개요·기간·접수경로·분야·실국별 현황을 관리대장에서 집계합니다.</p>
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

      <div className="panel">
        <div className="panel-head">
          <h2>처리개요</h2>
        </div>
        <div className="stats" style={{ margin: 16 }}>
          <div className="stat">
            <div className="stat-label">접수 건수</div>
            <div className="stat-value accent">{overview.receivedCount}</div>
          </div>
          <div className="stat">
            <div className="stat-label">처리 건수</div>
            <div className="stat-value">{overview.doneCount}</div>
          </div>
          <div className="stat">
            <div className="stat-label">처리율</div>
            <div className="stat-value">{formatPct(overview.doneRate)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">미처리 건수</div>
            <div className="stat-value">{overview.unprocessedCount}</div>
          </div>
          <div className="stat">
            <div className="stat-label">미처리율</div>
            <div className="stat-value">
              {formatPct(overview.unprocessedRate)}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>처리기간별 현황</h2>
        </div>
        <div className="panel-body">
          <table className="data-table">
            <thead>
              <tr>
                {PERIOD_ORDER.map((k) => (
                  <th key={k} className="num">
                    {PERIOD_BUCKET_LABEL[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {PERIOD_ORDER.map((k) => (
                  <td key={k} className="num">
                    {byPeriod[k]}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DimSection title="접수경로별 현황" items={byRoute} />
      <DimSection title="분야별 현황" items={byField} />
      <DimSection title="실국별 현황" items={byBureau} />
    </>
  );
}
