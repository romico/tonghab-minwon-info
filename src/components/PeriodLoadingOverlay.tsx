/** 기간 검색 재집계 중 표시하는 오버레이 + 스켈레톤 */
export function PeriodLoadingOverlay() {
  return (
    <div className="period-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="period-loading-panel">
        <div className="period-spinner" aria-hidden />
        <p className="period-loading-text">데이터를 불러오는 중…</p>
      </div>
      <div className="period-skeleton" aria-hidden>
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-sub" />
        <div className="skeleton-table">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-row">
              <span className="skeleton-cell short" />
              <span className="skeleton-cell" />
              <span className="skeleton-cell mid" />
              <span className="skeleton-cell" />
              <span className="skeleton-cell short" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
