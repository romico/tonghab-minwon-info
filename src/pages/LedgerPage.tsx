import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  DEPARTMENTS,
  FIELD_OPTIONS,
  PROCESS_STATUS_LABEL,
  PROCESS_STATUS_OPTIONS,
  RECEIPT_ROUTES,
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

type LedgerLocationState = {
  returnTo?: string;
};

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
  const {
    complaints,
    filteredComplaints,
    upsertComplaint,
    deleteComplaint,
    resetSeed,
  } = useComplaintStore();
  const [editing, setEditing] = useState<ComplaintInput | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMask, setExportMask] = useState(false);
  const editPanelRef = useRef<HTMLDivElement>(null);
  const openedEditId = useRef<string | null>(null);

  const deptName = useMemo(
    () => Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name])),
    [],
  );

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

  function startCreate() {
    setReturnTo(null);
    openedEditId.current = null;
    setEditing(emptyForm());
  }

  function startEdit(c: Complaint, backTo?: string | null) {
    setReturnTo(backTo ?? null);
    openedEditId.current = c.id;
    setEditing({ ...c });
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
    startEdit(found, state?.returnTo ?? "/departments");
    requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  async function onExportExcel() {
    if (filteredComplaints.length === 0) {
      window.alert("내보낼 민원이 없습니다.");
      return;
    }
    setExporting(true);
    try {
      const { exportLedgerExcel } = await import("@/export/ledgerExcel");
      await exportLedgerExcel(filteredComplaints, {
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
            disabled={exporting || filteredComplaints.length === 0}
            onClick={() => void onExportExcel()}
          >
            {exporting ? "내보내는 중…" : "엑셀 다운로드"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void resetSeed().catch((err: unknown) => {
                console.error(err);
                window.alert(
                  err instanceof Error ? err.message : "샘플 복원에 실패했습니다.",
                );
              });
            }}
          >
            샘플 복원
          </button>
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            민원 등록
          </button>
        </div>
      </div>

      <HwpxImportPanel />

      {editing && (
        <div className="panel" style={{ marginBottom: 20 }} ref={editPanelRef}>
          <div className="panel-head">
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
                  value={editing.complainantName}
                  onChange={(e) =>
                    setEditing({ ...editing, complainantName: e.target.value })
                  }
                  required
                />
              </label>
              <label className="field">
                연락처
                <input
                  value={editing.complainantPhone ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, complainantPhone: e.target.value })
                  }
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
          <span className="badge">{filteredComplaints.length}건</span>
        </div>
        <div className="panel-body">
          {filteredComplaints.length === 0 ? (
            <div className="empty">등록된 민원이 없습니다.</div>
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
                {filteredComplaints.map((c, i) => (
                  <tr key={c.id}>
                    <td className="num">{i + 1}</td>
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
                    <td>{c.assigneeName ?? "—"}</td>
                    <td>
                      <div className="toolbar">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => startEdit(c)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            void deleteComplaint(c.id).catch((err: unknown) => {
                              console.error(err);
                              window.alert(
                                err instanceof Error
                                  ? err.message
                                  : "삭제에 실패했습니다.",
                              );
                            });
                          }}
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
      </div>
    </>
  );
}
