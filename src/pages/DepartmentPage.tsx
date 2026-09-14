import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DEPARTMENTS,
  FIELD_OPTIONS,
  PROCESS_STATUS_LABEL,
  PROCESS_STATUS_OPTIONS,
  formatPct,
  type ProcessStatus,
} from "@/schema";
import { useComplaintStore } from "@/store/ComplaintStore";

type StatusFilter = "ALL" | ProcessStatus | "NONE";

function parseStatusFilter(raw: string | null): StatusFilter {
  if (!raw || raw === "ALL") return "ALL";
  if (raw === "NONE") return "NONE";
  if (raw === "DONE" || raw === "SCHEDULED" || raw === "IMPOSSIBLE") return raw;
  return "ALL";
}

function statusBadge(status: ProcessStatus | null) {
  if (!status) return <span className="badge">미정</span>;
  const cls =
    status === "DONE" ? "done" : status === "SCHEDULED" ? "pending" : "impossible";
  return <span className={`badge ${cls}`}>{PROCESS_STATUS_LABEL[status]}</span>;
}

function FilterIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="filter-icon"
    >
      <path
        d="M3 5.5h18l-6.5 7.2V19l-5 2v-8.3L3 5.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DepartmentPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { filteredComplaints, departmentStatus } = useComplaintStore();
  const [exporting, setExporting] = useState(false);

  const deptFilter = searchParams.get("dept") || "ALL";
  const statusFilter = parseStatusFilter(searchParams.get("status"));

  function setDeptFilter(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "ALL") next.delete("dept");
    else next.set("dept", value);
    setSearchParams(next, { replace: true });
  }

  function setStatusFilter(value: StatusFilter) {
    const next = new URLSearchParams(searchParams);
    if (value === "ALL") next.delete("status");
    else next.set("status", value);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  function openEdit(complaintId: string) {
    const returnTo = `/departments${
      searchParams.toString() ? `?${searchParams.toString()}` : ""
    }`;
    navigate(`/ledger?edit=${encodeURIComponent(complaintId)}`, {
      state: { returnTo },
    });
  }

  async function onExportExcel() {
    setExporting(true);
    try {
      const { exportDepartmentExcel } = await import("@/export/departmentExcel");
      // 원본 양식: 전체 127개 부서 + 계 (필터와 무관하게 전체 집계)
      await exportDepartmentExcel(departmentStatus);
    } catch (err) {
      console.error(err);
      window.alert("엑셀 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  const deptName = useMemo(
    () => Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name])),
    [],
  );

  const activeDepts = useMemo(
    () => departmentStatus.filter((r) => r.complaintCount > 0),
    [departmentStatus],
  );

  const filteredComplaintsByDept = useMemo(() => {
    return filteredComplaints.filter((c) => {
      if (deptFilter !== "ALL" && c.departmentId !== deptFilter) return false;
      if (statusFilter === "ALL") return true;
      if (statusFilter === "NONE") return c.processStatus == null;
      return c.processStatus === statusFilter;
    });
  }, [filteredComplaints, deptFilter, statusFilter]);

  const filteredDeptRows = useMemo(() => {
    let rows = departmentStatus;
    if (deptFilter !== "ALL") {
      rows = rows.filter((r) => r.departmentId === deptFilter);
    }
    if (statusFilter !== "ALL") {
      const byDept = new Map<
        string,
        { count: number; done: number; unprocessed: number }
      >();
      for (const c of filteredComplaintsByDept) {
        const cur = byDept.get(c.departmentId) ?? {
          count: 0,
          done: 0,
          unprocessed: 0,
        };
        cur.count += 1;
        if (c.processStatus === "DONE") cur.done += 1;
        if (
          c.processStatus === "SCHEDULED" ||
          c.processStatus === "IMPOSSIBLE"
        ) {
          cur.unprocessed += 1;
        }
        byDept.set(c.departmentId, cur);
      }
      rows = DEPARTMENTS.filter(
        (d) => byDept.has(d.id) || deptFilter === d.id,
      ).map((d) => {
        const agg = byDept.get(d.id) ?? {
          count: 0,
          done: 0,
          unprocessed: 0,
        };
        return {
          departmentId: d.id,
          departmentName: d.name,
          bureauId: d.bureauId,
          complaintCount: agg.count,
          doneCount: agg.done,
          unprocessedCount: agg.unprocessed,
          processRate: agg.count === 0 ? 0 : agg.done / agg.count,
        };
      });
      if (deptFilter === "ALL") {
        rows = rows.filter((r) => r.complaintCount > 0);
      }
    }
    return rows;
  }, [departmentStatus, deptFilter, statusFilter, filteredComplaintsByDept]);

  const total = filteredComplaintsByDept.reduce(
    (acc, c) => ({
      complaintCount: acc.complaintCount + 1,
      doneCount: acc.doneCount + (c.processStatus === "DONE" ? 1 : 0),
      unprocessedCount:
        acc.unprocessedCount +
        (c.processStatus === "SCHEDULED" || c.processStatus === "IMPOSSIBLE"
          ? 1
          : 0),
    }),
    { complaintCount: 0, doneCount: 0, unprocessedCount: 0 },
  );

  const displayDeptRows =
    statusFilter === "ALL" && deptFilter === "ALL"
      ? departmentStatus
      : filteredDeptRows;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>부서별현황</h1>
          <p>부서에 통보된 민원의 처리 상태와 담당자를 한눈에 확인합니다.</p>
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

      <div className="filter-bar">
        <FilterIcon />
        <label className="field filter-field">
          <span className="sr-only">부서</span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="부서 필터"
          >
            <option value="ALL">전체 부서</option>
            {activeDepts.length > 0 && (
              <optgroup label="민원 발생 부서">
                {activeDepts.map((d) => (
                  <option key={d.departmentId} value={d.departmentId}>
                    {d.departmentName} ({d.complaintCount})
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="전체 부서 목록">
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="field filter-field">
          <span className="sr-only">상태</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="상태 필터"
          >
            <option value="ALL">전체 상태</option>
            {PROCESS_STATUS_OPTIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
            <option value="NONE">미정</option>
          </select>
        </label>
        {(deptFilter !== "ALL" || statusFilter !== "ALL") && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>
            필터 초기화
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">민원건수</div>
          <div className="stat-value accent">{total.complaintCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">완료</div>
          <div className="stat-value">{total.doneCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">미처리</div>
          <div className="stat-value">{total.unprocessedCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">처리율</div>
          <div className="stat-value">
            {formatPct(
              total.complaintCount === 0
                ? 0
                : total.doneCount / total.complaintCount,
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>통보 민원 · 처리상태 · 담당자</h2>
          <span className="badge">{filteredComplaintsByDept.length}건</span>
        </div>
        <div className="panel-body">
          {filteredComplaintsByDept.length === 0 ? (
            <div className="empty">조건에 맞는 민원이 없습니다.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="num">연번</th>
                  <th>처리부서</th>
                  <th>분야</th>
                  <th>민원내용</th>
                  <th>통보일</th>
                  <th>처리구분</th>
                  <th>담당자</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredComplaintsByDept.map((c, i) => (
                  <tr key={c.id}>
                    <td className="num">{i + 1}</td>
                    <td>{deptName[c.departmentId]}</td>
                    <td>
                      {FIELD_OPTIONS.find((f) => f.code === c.fieldCode)?.label}
                    </td>
                    <td className="content-cell" title={c.content}>
                      {c.content}
                    </td>
                    <td>{c.notifiedAt ?? "—"}</td>
                    <td>{statusBadge(c.processStatus)}</td>
                    <td>{c.assigneeName || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => openEdit(c.id)}
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>부서별 처리 현황</h2>
          <span className="badge">
            {deptFilter === "ALL" && statusFilter === "ALL"
              ? `발생 부서 ${activeDepts.length} / 전체 127`
              : `표시 ${displayDeptRows.filter((r) => r.complaintCount > 0).length}개 부서`}
          </span>
        </div>
        <div className="panel-body">
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">연번</th>
                <th>처리부서</th>
                <th className="num">민원건수</th>
                <th className="num">완료</th>
                <th className="num">미처리</th>
                <th className="num">처리율</th>
              </tr>
            </thead>
            <tbody>
              <tr className="total">
                <td />
                <td>계</td>
                <td className="num">{total.complaintCount}</td>
                <td className="num">{total.doneCount}</td>
                <td className="num">{total.unprocessedCount}</td>
                <td className="num">
                  {formatPct(
                    total.complaintCount === 0
                      ? 0
                      : total.doneCount / total.complaintCount,
                  )}
                </td>
              </tr>
              {displayDeptRows.map((row, i) => (
                <tr
                  key={row.departmentId}
                  className={row.complaintCount > 0 ? "hot" : undefined}
                >
                  <td className="num">{i + 1}</td>
                  <td>{row.departmentName}</td>
                  <td className="num">{row.complaintCount}</td>
                  <td className="num">{row.doneCount}</td>
                  <td className="num">{row.unprocessedCount}</td>
                  <td className="num">{formatPct(row.processRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
