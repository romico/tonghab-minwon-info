import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { apiGetComplaint } from "@/api/complaints";
import {
  DEPARTMENTS,
  FIELD_OPTIONS,
  PROCESS_STATUS_LABEL,
  PROCESS_STATUS_OPTIONS,
  RECEIPT_ROUTES,
  complaintMediaLoaded,
  syncPhotoFields,
  type Complaint,
  type ComplaintInput,
  type FieldCode,
  type ProcessStatus,
} from "@/schema";
import { HwpxImportPanel } from "@/components/HwpxImportPanel";
import { MaskedPersonalInfo } from "@/components/MaskedPersonalInfo";
import { PhotoGallery } from "@/components/PhotoGallery";
import { useComplaintStore } from "@/store/ComplaintStore";
import { useSnapshotMask } from "@/store/SnapshotMaskStore";
import { maskName, maskPhone } from "@/lib/privacy";

const LEDGER_PAGE_SIZE = 20;

type LedgerLocationState = {
  returnTo?: string;
};

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function complaintSearchHaystack(
  c: Complaint,
  deptName: Record<string, string>,
): string {
  const fieldLabel =
    FIELD_OPTIONS.find((f) => f.code === c.fieldCode)?.label ?? "";
  const statusLabel = c.processStatus
    ? PROCESS_STATUS_LABEL[c.processStatus]
    : "";
  return [
    c.id,
    c.content,
    c.location,
    c.complainantName,
    c.complainantPhone,
    c.assigneeName,
    c.receiptRouteCode,
    c.remark,
    c.pendingReason,
    c.receivedAt,
    c.notifiedAt,
    c.completedOrDueAt,
    deptName[c.departmentId],
    fieldLabel,
    statusLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesLedgerSearch(
  c: Complaint,
  query: string,
  deptName: Record<string, string>,
): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  const tokens = normalized.split(" ").filter(Boolean);
  const haystack = complaintSearchHaystack(c, deptName);
  return tokens.every((token) => haystack.includes(token));
}

const emptyForm = (): ComplaintInput => ({
  receiptRouteCode: "시민불편(우아2동)",
  receivedAt: new Date().toISOString().slice(0, 10),
  notifiedAt: new Date().toISOString().slice(0, 10),
  complainantName: "익명",
  complainantPhone: "",
  fieldCode: "CLEAN",
  content: "",
  location: "",
  photoReceiptUrl: null,
  processStatus: "SCHEDULED",
  completedOrDueAt: null,
  pendingReason: "",
  departmentId: DEPARTMENTS.find((d) => d.name === "덕진구 청소위생과")!.id,
  assigneeName: "",
  photoBeforeUrl: null,
  photoAfterUrl: null,
  photos: [],
  remark: "",
  importKey: null,
});

function statusBadge(status: ProcessStatus | null) {
  if (!status) return <span className="badge">미정</span>;
  const cls =
    status === "DONE" ? "done" : status === "SCHEDULED" ? "pending" : "impossible";
  return <span className={`badge ${cls}`}>{PROCESS_STATUS_LABEL[status]}</span>;
}

export function LedgerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const forceMask = useSnapshotMask();
  const {
    complaints,
    filteredComplaints,
    upsertComplaint,
    deleteComplaint,
  } = useComplaintStore();
  const [editing, setEditing] = useState<ComplaintInput | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMask, setExportMask] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Complaint | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [fieldFilter, setFieldFilter] = useState<FieldCode | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<ProcessStatus | "ALL">(
    () => {
      const s = searchParams.get("status");
      if (s === "DONE" || s === "SCHEDULED" || s === "IMPOSSIBLE") return s;
      return "ALL";
    },
  );
  const [deptFilter, setDeptFilter] = useState(
    () => searchParams.get("dept") || "ALL",
  );
  const [listPage, setListPage] = useState(1);
  const editPanelRef = useRef<HTMLDivElement>(null);
  const openedEditId = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const deptName = useMemo(
    () => Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name])),
    [],
  );

  const displayComplaints = useMemo(() => {
    return filteredComplaints.filter((c) => {
      if (fieldFilter !== "ALL" && c.fieldCode !== fieldFilter) return false;
      if (statusFilter !== "ALL" && c.processStatus !== statusFilter) {
        return false;
      }
      if (deptFilter !== "ALL" && c.departmentId !== deptFilter) return false;
      return matchesLedgerSearch(c, searchQuery, deptName);
    });
  }, [
    filteredComplaints,
    fieldFilter,
    statusFilter,
    deptFilter,
    searchQuery,
    deptName,
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(displayComplaints.length / LEDGER_PAGE_SIZE),
  );
  const safePage = Math.min(listPage, pageCount);
  const pageStart = (safePage - 1) * LEDGER_PAGE_SIZE;
  const pagedComplaints = displayComplaints.slice(
    pageStart,
    pageStart + LEDGER_PAGE_SIZE,
  );

  useEffect(() => {
    setListPage(1);
  }, [fieldFilter, statusFilter, deptFilter, searchQuery]);

  useEffect(() => {
    if (listPage > pageCount) setListPage(pageCount);
  }, [listPage, pageCount]);

  const hasActiveSearch =
    normalizeSearchText(searchQuery).length > 0 ||
    fieldFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    deptFilter !== "ALL";

  useEffect(() => {
    const s = searchParams.get("status");
    if (s === "DONE" || s === "SCHEDULED" || s === "IMPOSSIBLE") {
      setStatusFilter(s);
    } else {
      setStatusFilter("ALL");
    }
    setDeptFilter(searchParams.get("dept") || "ALL");
    const q = searchParams.get("q") ?? "";
    setSearchInput(q);
    setSearchQuery(q);
  }, [searchParams]);

  function syncListParams(nextStatus: ProcessStatus | "ALL", nextDept: string) {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === "ALL") next.delete("status");
    else next.set("status", nextStatus);
    if (nextDept === "ALL") next.delete("dept");
    else next.set("dept", nextDept);
    setSearchParams(next, { replace: true });
  }

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    const nextQuery = searchInput;
    setSearchQuery(nextQuery);
    const next = new URLSearchParams(searchParams);
    const trimmed = nextQuery.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setFieldFilter("ALL");
    setStatusFilter("ALL");
    setDeptFilter("ALL");
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("status");
    next.delete("dept");
    setSearchParams(next, { replace: true });
    searchInputRef.current?.focus();
  }

  function closeEditAndReturn() {
    setEditing(null);
    const target = returnTo;
    setReturnTo(null);
    openedEditId.current = null;
    if (searchParams.has("edit")) {
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
    if (target) {
      navigate(target);
    }
  }

  function scrollToEditPanelHead() {
    window.setTimeout(() => {
      const head = editPanelRef.current;
      if (!head) return;
      head.scrollIntoView({ behavior: "smooth", block: "start" });
      head.focus({ preventScroll: true });
    }, 0);
  }

  function startCreate() {
    setReturnTo(null);
    openedEditId.current = null;
    setEditing(emptyForm());
    scrollToEditPanelHead();
  }

  async function startEdit(c: Complaint, backTo?: string | null) {
    setReturnTo(backTo ?? null);
    openedEditId.current = c.id;
    setEditing({ ...c });
    scrollToEditPanelHead();
    if (complaintMediaLoaded(c)) return;
    try {
      const full = await apiGetComplaint(c.id);
      if (openedEditId.current === c.id) {
        setEditing({ ...full });
      }
    } catch (err) {
      console.error(err);
    }
  }

  // 부서별현황 등에서 ?edit=id 로 진입 시 수정 폼 오픈
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) {
      openedEditId.current = null;
      return;
    }
    if (openedEditId.current === editId) return;

    const found = complaints.find((c) => c.id === editId);
    if (!found) {
      window.alert("해당 민원을 찾을 수 없습니다.");
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
      return;
    }

    const state = location.state as LedgerLocationState | null;
    void startEdit(found, state?.returnTo ?? "/departments");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per edit id
  }, [searchParams, complaints, location.state]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editing.content.trim()) return;
    try {
      await upsertComplaint({
        ...editing,
        complainantPhone: editing.complainantPhone || null,
        location: editing.location || null,
        pendingReason: editing.pendingReason || null,
        assigneeName: editing.assigneeName || null,
        remark: editing.remark || null,
        notifiedAt: editing.notifiedAt || null,
        completedOrDueAt: editing.completedOrDueAt || null,
        ...syncPhotoFields(editing.photos ?? []),
      });
      closeEditAndReturn();
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : "저장에 실패했습니다.",
      );
    }
  }

  function onCancelEdit() {
    closeEditAndReturn();
  }

  function requestDelete(c: Complaint) {
    setDeleteErr(null);
    setDeleteTarget(c);
  }

  function cancelDelete() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteErr(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      await deleteComplaint(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      setDeleteErr(
        err instanceof Error ? err.message : "삭제에 실패했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function onExportExcel() {
    if (displayComplaints.length === 0) {
      window.alert(
        hasActiveSearch
          ? "검색 결과에 내보낼 민원이 없습니다."
          : "내보낼 민원이 없습니다.",
      );
      return;
    }
    setExporting(true);
    try {
      const { apiHydrateComplaintMedia } = await import("@/api/complaints");
      const { exportLedgerExcel } = await import("@/export/ledgerExcel");
      const withPhotos = await apiHydrateComplaintMedia(displayComplaints);
      await exportLedgerExcel(withPhotos, {
        maskPersonalInfo: exportMask,
        includeImages: true,
      });
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
          <h1>관리대장</h1>
          <p>생활민원 원천 입력. 민원카드를 가져오거나 직접 등록할 수 있습니다.</p>
        </div>
        <div className="toolbar">
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={exportMask}
              onChange={(e) => setExportMask(e.target.checked)}
            />
            <span style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>
              개인정보 마스킹 후 내보내기
            </span>
          </label>
          <button
            type="button"
            className="btn"
            disabled={exporting || displayComplaints.length === 0}
            onClick={() => void onExportExcel()}
          >
            {exporting ? "내보내는 중…" : "엑셀 다운로드"}
          </button>
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            민원 등록
          </button>
        </div>
      </div>

      <HwpxImportPanel />

      {editing && (
        <div className="panel ledger-edit-panel" style={{ marginBottom: 20 }}>
          <div
            className="panel-head"
            id="ledger-edit-panel-head"
            ref={editPanelRef}
            tabIndex={-1}
          >
            <h2>
              {editing.id ? `민원 수정 #${editing.id}` : "민원 등록"}
              {returnTo ? (
                <span className="muted" style={{ marginLeft: 10, fontSize: 12, fontWeight: 500 }}>
                  · 저장/취소 시 이전 화면으로 복귀
                </span>
              ) : null}
            </h2>
          </div>
          <form onSubmit={onSubmit}>
            <div className="form-grid">
              <label className="field">
                접수경로
                <select
                  value={editing.receiptRouteCode}
                  onChange={(e) =>
                    setEditing({ ...editing, receiptRouteCode: e.target.value })
                  }
                >
                  {RECEIPT_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                접수일
                <input
                  type="date"
                  value={editing.receivedAt}
                  onChange={(e) =>
                    setEditing({ ...editing, receivedAt: e.target.value })
                  }
                  required
                />
              </label>
              <label className="field">
                처리부서 통보일
                <input
                  type="date"
                  value={editing.notifiedAt ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      notifiedAt: e.target.value || null,
                    })
                  }
                />
              </label>
              <label className="field">
                민원인
                <input
                  value={
                    forceMask
                      ? maskName(editing.complainantName)
                      : editing.complainantName
                  }
                  onChange={(e) =>
                    setEditing({ ...editing, complainantName: e.target.value })
                  }
                  required
                  readOnly={forceMask}
                />
              </label>
              <label className="field">
                연락처
                <input
                  value={
                    forceMask
                      ? maskPhone(editing.complainantPhone) || ""
                      : (editing.complainantPhone ?? "")
                  }
                  onChange={(e) =>
                    setEditing({ ...editing, complainantPhone: e.target.value })
                  }
                  readOnly={forceMask}
                />
              </label>
              <label className="field">
                분야
                <select
                  value={editing.fieldCode}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      fieldCode: e.target.value as FieldCode,
                    })
                  }
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field span-3">
                민원내용
                <textarea
                  value={editing.content}
                  onChange={(e) =>
                    setEditing({ ...editing, content: e.target.value })
                  }
                  required
                />
              </label>
              <label className="field span-2">
                위치
                <input
                  value={editing.location ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, location: e.target.value })
                  }
                />
              </label>
              <label className="field">
                처리구분
                <select
                  value={editing.processStatus ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      processStatus: (e.target.value || null) as ProcessStatus | null,
                    })
                  }
                >
                  <option value="">미정</option>
                  {PROCESS_STATUS_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                처리완료일(예정일)
                <input
                  type="date"
                  value={editing.completedOrDueAt ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      completedOrDueAt: e.target.value || null,
                    })
                  }
                />
              </label>
              <label className="field">
                미처리 사유
                <input
                  value={editing.pendingReason ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, pendingReason: e.target.value })
                  }
                />
              </label>
              <label className="field">
                처리부서
                <select
                  value={editing.departmentId}
                  onChange={(e) =>
                    setEditing({ ...editing, departmentId: e.target.value })
                  }
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                담당자
                <input
                  value={editing.assigneeName ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, assigneeName: e.target.value })
                  }
                />
              </label>
              <label className="field span-2">
                비고
                <input
                  value={editing.remark ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, remark: e.target.value })
                  }
                />
              </label>
              <div className="field span-3">
                <span>첨부 사진</span>
                <div className="edit-photos">
                  {(editing.photos ?? []).length === 0 ? (
                    <span className="muted">등록된 사진이 없습니다.</span>
                  ) : (
                    <>
                      <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
                        사진을 클릭한 뒤 역할(현장 / 처리 전 / 처리 후 / 기타)을 변경하거나
                        제외할 수 있습니다.
                      </p>
                      <PhotoGallery
                        photos={editing.photos ?? []}
                        size={72}
                        editable
                        onChangeRole={(photoId, role) => {
                          const photos = (editing.photos ?? []).map((p) =>
                            p.id === photoId
                              ? {
                                  ...p,
                                  role,
                                  label:
                                    role === "receipt"
                                      ? "현장사진"
                                      : role === "before"
                                        ? "처리 전"
                                        : role === "after"
                                          ? "처리 후"
                                          : p.label || "기타",
                                }
                              : p,
                          );
                          setEditing({
                            ...editing,
                            ...syncPhotoFields(photos),
                          });
                        }}
                        onRemove={(photoId) => {
                          const photos = (editing.photos ?? []).filter(
                            (p) => p.id !== photoId,
                          );
                          setEditing({
                            ...editing,
                            ...syncPhotoFields(photos),
                          });
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onCancelEdit}
              >
                {returnTo ? "취소 후 돌아가기" : "취소"}
              </button>
              <button type="submit" className="btn btn-primary">
                {returnTo ? "저장 후 돌아가기" : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>생활민원 관리 대장</h2>
          <span className="badge">
            {hasActiveSearch
              ? `검색 ${displayComplaints.length}건 / 전체 ${filteredComplaints.length}건`
              : `${filteredComplaints.length}건`}
          </span>
        </div>

        <form className="ledger-search" onSubmit={applySearch}>
          <div className="ledger-search-main">
            <label className="sr-only" htmlFor="ledger-search-q">
              원장 검색어
            </label>
            <input
              ref={searchInputRef}
              id="ledger-search-q"
              type="search"
              className="ledger-search-input"
              placeholder="민원내용, 위치, 민원인, 담당자, 부서, 접수경로…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary">
              검색
            </button>
            {hasActiveSearch && (
              <button
                type="button"
                className="btn"
                onClick={clearSearch}
              >
                초기화
              </button>
            )}
          </div>
          <div className="ledger-search-filters">
            <label className="field ledger-search-field">
              분야
              <select
                value={fieldFilter}
                onChange={(e) =>
                  setFieldFilter(e.target.value as FieldCode | "ALL")
                }
              >
                <option value="ALL">전체</option>
                {FIELD_OPTIONS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field ledger-search-field">
              처리구분
              <select
                value={statusFilter}
                onChange={(e) => {
                  const next = e.target.value as ProcessStatus | "ALL";
                  setStatusFilter(next);
                  syncListParams(next, deptFilter);
                }}
              >
                <option value="ALL">전체</option>
                {PROCESS_STATUS_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field ledger-search-field">
              처리부서
              <select
                value={deptFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setDeptFilter(next);
                  syncListParams(statusFilter, next);
                }}
              >
                <option value="ALL">전체</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="ledger-search-hint">
              여러 단어는 모두 포함된 건만 표시합니다. 상단 기간 필터와 함께
              적용됩니다.
            </p>
          </div>
        </form>

        <div className="panel-body">
          {filteredComplaints.length === 0 ? (
            <div className="empty">등록된 민원이 없습니다.</div>
          ) : displayComplaints.length === 0 ? (
            <div className="empty">
              검색 조건에 맞는 민원이 없습니다.
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                onClick={clearSearch}
              >
                검색 초기화
              </button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>연번</th>
                  <th>사진</th>
                  <th>접수경로</th>
                  <th>접수일</th>
                  <th>통보일</th>
                  <th>민원인</th>
                  <th>분야</th>
                  <th>민원내용</th>
                  <th>위치</th>
                  <th>처리구분</th>
                  <th>처리부서</th>
                  <th>담당자</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedComplaints.map((c, i) => (
                  <tr key={c.id}>
                    <td className="num">{pageStart + i + 1}</td>
                    <td>
                      <PhotoGallery photos={c.photos ?? []} size={56} />
                    </td>
                    <td>{c.receiptRouteCode}</td>
                    <td>{c.receivedAt}</td>
                    <td>{c.notifiedAt ?? "—"}</td>
                    <td>
                      <MaskedPersonalInfo
                        name={c.complainantName}
                        phone={c.complainantPhone}
                      />
                    </td>
                    <td>
                      {FIELD_OPTIONS.find((f) => f.code === c.fieldCode)?.label}
                    </td>
                    <td className="content-cell" title={c.content}>
                      {c.content}
                    </td>
                    <td>{c.location ?? "—"}</td>
                    <td>{statusBadge(c.processStatus)}</td>
                    <td>{deptName[c.departmentId]}</td>
                    <td>
                      {forceMask
                        ? maskName(c.assigneeName)
                        : (c.assigneeName ?? "—")}
                    </td>
                    <td>
                      <div className="toolbar">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void startEdit(c)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => requestDelete(c)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {displayComplaints.length > 0 && (
          <div className="audit-pager ledger-pager">
            <button
              type="button"
              className="btn"
              disabled={safePage <= 1}
              onClick={() => setListPage((p) => Math.max(1, p - 1))}
            >
              이전
            </button>
            <span className="audit-pager-status">
              {safePage} / {pageCount} 페이지
              <span className="ledger-pager-range">
                {" "}
                · {pageStart + 1}–
                {Math.min(pageStart + LEDGER_PAGE_SIZE, displayComplaints.length)}
                /{displayComplaints.length}건
              </span>
            </span>
            <button
              type="button"
              className="btn"
              disabled={safePage >= pageCount}
              onClick={() => setListPage((p) => Math.min(pageCount, p + 1))}
            >
              다음
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={cancelDelete}
        >
          <div
            className="settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ledger-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="ledger-delete-title">민원 삭제 확인</h3>
            <p>
              아래 민원을 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.
            </p>
            <p className="ledger-delete-preview" title={deleteTarget.content}>
              {deleteTarget.content?.trim() || deleteTarget.id}
            </p>
            {deleteErr && (
              <p className="settings-alert is-error">{deleteErr}</p>
            )}
            <div className="settings-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={cancelDelete}
                disabled={deleting}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                autoFocus
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
