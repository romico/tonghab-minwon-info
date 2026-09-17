import { useRef, useState } from "react";
import {
  DEPARTMENTS,
  FIELD_OPTIONS,
  RECEIPT_ROUTES,
  syncPhotoFields,
  type FieldCode,
  type ProcessStatus,
} from "@/schema";
import {
  fieldLabelOf,
  parseHwpxFiles,
  type HwpxImportDraft,
} from "@/import/hwpxParser";
import { PhotoGallery } from "@/components/PhotoGallery";
import { useComplaintStore } from "@/store/ComplaintStore";

type ProgressState = {
  phase: "parse" | "register";
  current: number;
  total: number;
  detail: string;
};

export function HwpxImportPanel() {
  const { addComplaints } = useComplaintStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<HwpxImportDraft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "error">("ok");
  const [progress, setProgress] = useState<ProgressState | null>(null);

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    setProgress({
      phase: "parse",
      current: 0,
      total: files.length,
      detail: "파일 분석 준비…",
    });
    try {
      const result = await parseHwpxFiles(files, (done, total, fileName) => {
        setProgress({
          phase: "parse",
          current: done,
          total,
          detail: done >= total ? "분석 완료" : `분석 중 · ${fileName}`,
        });
      });
      setDrafts(result.drafts);
      setErrors(result.errors);
      if (result.drafts.length === 0 && result.errors.length === 0) {
        setMessageTone("error");
        setMessage("파싱된 항목이 없습니다.");
      }
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateDraft(index: number, patch: Partial<HwpxImportDraft>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }

  async function registerSelected() {
    const selected = drafts.filter((d) => d.selected);
    if (selected.length === 0) {
      setMessageTone("error");
      setMessage("등록할 항목을 선택하세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setProgress({
      phase: "register",
      current: 0,
      total: selected.length,
      detail: "등록 준비…",
    });
    try {
      const count = await addComplaints(
        selected.map(
          ({
            sourceFileName: _s,
            parseWarnings: _w,
            selected: _sel,
            ...input
          }) => input,
        ),
        (done, total) => {
          setProgress({
            phase: "register",
            current: done,
            total,
            detail:
              done >= total
                ? "등록 완료"
                : `등록 중 · ${done}/${total}건`,
          });
        },
      );
      setMessageTone("ok");
      setMessage(`${count}건을 관리대장에 등록했습니다.`);
      setDrafts([]);
      setErrors([]);
    } catch (err) {
      console.error(err);
      setMessageTone("error");
      setMessage(
        err instanceof Error ? err.message : "등록에 실패했습니다.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h2>민원카드 가져오기</h2>
        <div className="toolbar">
          <input
            ref={inputRef}
            type="file"
            accept=".hwpx,application/hwp+zip"
            multiple
            hidden
            onChange={(e) => void onFilesSelected(e.target.files)}
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy && progress?.phase === "parse"
              ? "분석 중…"
              : "민원파일 선택"}
          </button>
          {drafts.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void registerSelected()}
            >
              {busy && progress?.phase === "register"
                ? "등록 중…"
                : `선택 항목 등록 (${drafts.filter((d) => d.selected).length})`}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--muted)" }}>
        시민불편 관리카드 양식을 선택하면 제목·일자·위치·부서와
        첨부 이미지(여러 장)를 모두 추출합니다. 미리보기에서 사진 역할(현장/처리전·후)을 바꿀 수 있습니다.
        여러 파일은 한 건씩 등록되어 용량 제한을 피합니다.
      </div>

      {progress && (
        <div className="hwpx-progress" aria-live="polite">
          <div className="hwpx-progress-meta">
            <span>
              {progress.phase === "parse" ? "파일 분석" : "관리대장 등록"}
            </span>
            <span>
              {progress.current}/{progress.total} · {progressPct}%
            </span>
          </div>
          <div
            className="hwpx-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label={progress.detail}
          >
            <div
              className="hwpx-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="hwpx-progress-detail">{progress.detail}</div>
        </div>
      )}

      {message && (
        <div
          style={{
            padding: "0 18px 12px",
            color: messageTone === "ok" ? "var(--ok)" : "var(--accent)",
            fontWeight: 620,
          }}
        >
          {message}
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ padding: "0 18px 12px", color: "var(--accent)" }}>
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="panel-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={drafts.every((d) => d.selected)}
                    disabled={busy}
                    onChange={(e) =>
                      setDrafts((prev) =>
                        prev.map((d) => ({ ...d, selected: e.target.checked })),
                      )
                    }
                  />
                </th>
                <th>파일</th>
                <th>미리보기</th>
                <th>접수경로</th>
                <th>접수일</th>
                <th>민원인</th>
                <th>분야</th>
                <th>내용</th>
                <th>위치</th>
                <th>처리부서</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, i) => (
                <tr key={`${d.sourceFileName}-${i}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={d.selected}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, { selected: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <div>{d.sourceFileName}</div>
                    {d.parseWarnings.map((w) => (
                      <div key={w} className="muted" style={{ fontSize: 11 }}>
                        {w}
                      </div>
                    ))}
                  </td>
                  <td>
                    <PhotoGallery
                      photos={d.photos ?? []}
                      size={56}
                      editable={!busy}
                      onChangeRole={(photoId, role) => {
                        const photos = (d.photos ?? []).map((p) =>
                          p.id === photoId ? { ...p, role } : p,
                        );
                        updateDraft(i, syncPhotoFields(photos));
                      }}
                      onRemove={(photoId) => {
                        const photos = (d.photos ?? []).filter(
                          (p) => p.id !== photoId,
                        );
                        updateDraft(i, syncPhotoFields(photos));
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={d.receiptRouteCode}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, { receiptRouteCode: e.target.value })
                      }
                    >
                      {RECEIPT_ROUTES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={d.receivedAt}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, {
                          receivedAt: e.target.value,
                          notifiedAt: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={d.complainantName}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, { complainantName: e.target.value })
                      }
                      style={{ width: 88 }}
                    />
                    <div className="muted" style={{ fontSize: 11 }}>
                      {d.complainantPhone}
                    </div>
                  </td>
                  <td>
                    <select
                      value={d.fieldCode}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, {
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
                  </td>
                  <td>
                    <textarea
                      value={d.content}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, { content: e.target.value })
                      }
                      style={{ width: 220, minHeight: 64 }}
                    />
                  </td>
                  <td>
                    <input
                      value={d.location ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, { location: e.target.value })
                      }
                      style={{ width: 140 }}
                    />
                  </td>
                  <td>
                    <select
                      value={d.departmentId}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, { departmentId: e.target.value })
                      }
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={d.processStatus ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        updateDraft(i, {
                          processStatus: (e.target.value ||
                            null) as ProcessStatus | null,
                        })
                      }
                    >
                      <option value="SCHEDULED">처리예정</option>
                      <option value="DONE">처리완료</option>
                      <option value="IMPOSSIBLE">처리불가</option>
                    </select>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {fieldLabelOf(d.fieldCode)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
