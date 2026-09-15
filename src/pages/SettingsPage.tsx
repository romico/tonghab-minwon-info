import { useEffect, useState, type FormEvent } from "react";
import {
  apiChangePassword,
  apiGetSettings,
  apiUpdateSettings,
} from "@/api/auth";
import { useAuth } from "@/store/AuthStore";
import { useComplaintStore } from "@/store/ComplaintStore";

export function SettingsPage() {
  const { refresh, ttlMinutes, expiresAt, user } = useAuth();
  const { resetSeed } = useComplaintStore();
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState(30);
  const [minTtl, setMinTtl] = useState(10);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [savingTtl, setSavingTtl] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [dbConfirmOpen, setDbConfirmOpen] = useState(false);
  const [dbPassword, setDbPassword] = useState("");
  const [dbMsg, setDbMsg] = useState<string | null>(null);
  const [dbErr, setDbErr] = useState<string | null>(null);
  const [resettingDb, setResettingDb] = useState(false);

  useEffect(() => {
    void apiGetSettings()
      .then((s) => {
        setSessionTtlMinutes(s.sessionTtlMinutes);
        setMinTtl(s.minSessionTtlMinutes);
      })
      .catch((err: unknown) => {
        setSettingsErr(err instanceof Error ? err.message : "설정 로드 실패");
      });
  }, []);

  async function onSaveTtl(e: FormEvent) {
    e.preventDefault();
    setSettingsMsg(null);
    setSettingsErr(null);
    setSavingTtl(true);
    try {
      const s = await apiUpdateSettings({ sessionTtlMinutes });
      setSessionTtlMinutes(s.sessionTtlMinutes);
      await refresh();
      setSettingsMsg(
        `세션 유효시간을 ${s.sessionTtlMinutes}분으로 저장했습니다.`,
      );
    } catch (err) {
      setSettingsErr(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingTtl(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    if (newPassword !== newPassword2) {
      setPwErr("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setSavingPw(true);
    try {
      await apiChangePassword(currentPassword, newPassword);
      await refresh();
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setPwMsg("비밀번호를 변경했습니다. 다른 세션은 종료되었습니다.");
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setSavingPw(false);
    }
  }

  function openDbConfirm() {
    setDbMsg(null);
    setDbErr(null);
    setDbPassword("");
    setDbConfirmOpen(true);
  }

  function closeDbConfirm() {
    if (resettingDb) return;
    setDbConfirmOpen(false);
    setDbPassword("");
    setDbErr(null);
  }

  async function onResetDb(e: FormEvent) {
    e.preventDefault();
    setDbMsg(null);
    setDbErr(null);
    if (!dbPassword) {
      setDbErr("비밀번호를 입력하세요.");
      return;
    }
    setResettingDb(true);
    try {
      await resetSeed(dbPassword);
      setDbConfirmOpen(false);
      setDbPassword("");
      setDbMsg("DB를 초기화하고 샘플 데이터로 복원했습니다.");
    } catch (err) {
      setDbErr(err instanceof Error ? err.message : "DB 초기화에 실패했습니다.");
    } finally {
      setResettingDb(false);
    }
  }

  const remainLabel = expiresAt
    ? new Date(expiresAt).toLocaleString("ko-KR")
    : "-";

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>설정</h1>
          <p>세션 유효시간, 비밀번호, DB 초기화를 관리합니다.</p>
        </div>
        {user && <span className="badge">{user.username}</span>}
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>세션</h2>
          <span className="badge">TTL {ttlMinutes ?? "-"}분</span>
        </div>
        <div className="panel-body settings-panel-body">
          <div className="settings-status">
            <div className="settings-stat">
              <span className="settings-stat-label">현재 유효시간</span>
              <strong className="settings-stat-value">
                {ttlMinutes ?? "-"}
                <span className="settings-stat-unit">분</span>
              </strong>
            </div>
            <div className="settings-stat">
              <span className="settings-stat-label">세션 만료</span>
              <strong className="settings-stat-value settings-stat-value-sm">
                {remainLabel}
              </strong>
            </div>
            <div className="settings-stat">
              <span className="settings-stat-label">최소 허용</span>
              <strong className="settings-stat-value">
                {minTtl}
                <span className="settings-stat-unit">분</span>
              </strong>
            </div>
          </div>

          <form className="settings-form" onSubmit={(e) => void onSaveTtl(e)}>
            <label className="field settings-field">
              세션 유효시간(분)
              <input
                type="number"
                min={minTtl}
                step={1}
                value={sessionTtlMinutes}
                onChange={(e) => setSessionTtlMinutes(Number(e.target.value))}
                required
              />
            </label>
            <p className="settings-help">
              최소 {minTtl}분입니다. 사용 중이거나 만료 직전이면 자동으로
              갱신됩니다.
            </p>
            {settingsErr && <p className="settings-alert is-error">{settingsErr}</p>}
            {settingsMsg && <p className="settings-alert is-ok">{settingsMsg}</p>}
            <div className="settings-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingTtl}
              >
                {savingTtl ? "저장 중…" : "세션 설정 저장"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>비밀번호 변경</h2>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            변경 후 현재 세션은 유지되고, 다른 기기·브라우저의 세션은
            종료됩니다.
          </p>
          <form
            className="settings-form settings-form-password"
            onSubmit={(e) => void onChangePassword(e)}
          >
            <label className="field settings-field settings-field-full">
              현재 비밀번호
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label className="field settings-field">
              새 비밀번호
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={4}
              />
            </label>
            <label className="field settings-field">
              새 비밀번호 확인
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                required
                minLength={4}
              />
            </label>
            <p className="settings-help settings-field-full">
              새 비밀번호는 4자 이상이어야 합니다.
            </p>
            {pwErr && <p className="settings-alert is-error">{pwErr}</p>}
            {pwMsg && <p className="settings-alert is-ok">{pwMsg}</p>}
            <div className="settings-actions settings-field-full">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingPw}
              >
                {savingPw ? "변경 중…" : "비밀번호 변경"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>DB 초기화</h2>
          <span className="badge">위험</span>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            저장된 민원 데이터를 모두 삭제하고 샘플 데이터로 되돌립니다. 감사
            로그·계정·세션 설정은 유지됩니다.
          </p>
          {dbMsg && <p className="settings-alert is-ok">{dbMsg}</p>}
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={openDbConfirm}
            >
              DB 초기화…
            </button>
          </div>
        </div>
      </div>

      {dbConfirmOpen && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={closeDbConfirm}
        >
          <div
            className="settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="db-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="db-reset-title">DB 초기화 확인</h3>
            <p>
              이 작업은 되돌릴 수 없습니다. 계속하려면 관리자 비밀번호를
              입력하세요.
            </p>
            <form onSubmit={(e) => void onResetDb(e)}>
              <label className="field">
                비밀번호
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                  required
                />
              </label>
              {dbErr && <p className="settings-alert is-error">{dbErr}</p>}
              <div className="settings-confirm-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={closeDbConfirm}
                  disabled={resettingDb}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={resettingDb}
                >
                  {resettingDb ? "초기화 중…" : "초기화 실행"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
