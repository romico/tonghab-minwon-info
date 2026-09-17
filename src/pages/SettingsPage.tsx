import { useEffect, useState, type FormEvent } from "react";
import {
  apiChangePassword,
  apiGetSettings,
  apiTotpConfirm,
  apiTotpDisable,
  apiTotpSetup,
  apiUpdateSettings,
} from "@/api/auth";
import {
  apiApplyUpdate,
  apiCheckUpdate,
  apiGetVersion,
  type UpdateCheckResult,
} from "@/api/updates";
import { useAuth } from "@/store/AuthStore";
import { useComplaintStore } from "@/store/ComplaintStore";

export function SettingsPage() {
  const { refresh, ttlMinutes, expiresAt, user, vault } = useAuth();
  const { resetSeed } = useComplaintStore();
  const [sessionTtlMinutes, setSessionTtlMinutes] = useState(30);
  const [minTtl, setMinTtl] = useState(10);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [savingTtl, setSavingTtl] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [pwTotpCode, setPwTotpCode] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [dbConfirmOpen, setDbConfirmOpen] = useState(false);
  const [dbPassword, setDbPassword] = useState("");
  const [dbTotpCode, setDbTotpCode] = useState("");
  const [dbMsg, setDbMsg] = useState<string | null>(null);
  const [dbErr, setDbErr] = useState<string | null>(null);
  const [resettingDb, setResettingDb] = useState(false);

  const [totpEnabled, setTotpEnabled] = useState(false);
  const [recoveryLeft, setRecoveryLeft] = useState(0);
  const [totpMsg, setTotpMsg] = useState<string | null>(null);
  const [totpErr, setTotpErr] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

  useEffect(() => {
    void apiGetSettings()
      .then((s) => {
        setSessionTtlMinutes(s.sessionTtlMinutes);
        setMinTtl(s.minSessionTtlMinutes);
        if (s.totp) {
          setTotpEnabled(s.totp.enabled);
          setRecoveryLeft(s.totp.recoveryCodesRemaining);
        }
      })
      .catch((err: unknown) => {
        setSettingsErr(err instanceof Error ? err.message : "설정 로드 실패");
      });
    void apiGetVersion()
      .then((v) => setAppVersion(v.version))
      .catch(() => setAppVersion(null));
  }, []);

  async function onCheckUpdate() {
    setUpdateMsg(null);
    setUpdateErr(null);
    setCheckingUpdate(true);
    try {
      const result = await apiCheckUpdate();
      setUpdateInfo(result);
      setAppVersion(result.currentVersion);
      if (result.error) {
        setUpdateErr(result.error);
      } else if (result.updateAvailable) {
        setUpdateMsg(
          `새 버전 ${result.latestVersion}을(를) 사용할 수 있습니다.`,
        );
      } else {
        setUpdateMsg("이미 최신 버전입니다.");
      }
    } catch (err) {
      setUpdateErr(err instanceof Error ? err.message : "업데이트 확인 실패");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function onApplyUpdate() {
    if (!updateInfo?.updateAvailable) return;
    setUpdateMsg(null);
    setUpdateErr(null);
    setApplyingUpdate(true);
    try {
      const result = await apiApplyUpdate({
        downloadUrl: updateInfo.downloadUrl ?? undefined,
        targetVersion: updateInfo.latestVersion ?? undefined,
        sha256: updateInfo.sha256 ?? undefined,
      });
      setUpdateConfirmOpen(false);
      setUpdateMsg(result.message);
      const started = Date.now();
      const poll = window.setInterval(() => {
        void fetch("/api/health")
          .then((r) => {
            if (r.ok && Date.now() - started > 2500) {
              window.clearInterval(poll);
              window.location.reload();
            }
          })
          .catch(() => {
            /* still restarting */
          });
      }, 1500);
      window.setTimeout(() => window.clearInterval(poll), 120_000);
    } catch (err) {
      setUpdateErr(err instanceof Error ? err.message : "업데이트 적용 실패");
      setApplyingUpdate(false);
    }
  }

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
      if (totpEnabled && !pwTotpCode.trim()) {
        setPwErr("2단계 인증 코드를 입력하세요.");
        setSavingPw(false);
        return;
      }
      await apiChangePassword(
        currentPassword,
        newPassword,
        totpEnabled ? pwTotpCode.trim() : undefined,
      );
      await refresh();
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setPwTotpCode("");
      setPwMsg(
        "비밀번호를 변경했습니다. 개인정보 암호 키도 함께 갱신되었고, 다른 세션은 종료되었습니다.",
      );
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setSavingPw(false);
    }
  }

  async function onBeginTotp() {
    setTotpMsg(null);
    setTotpErr(null);
    setRecoveryCodes(null);
    setTotpBusy(true);
    try {
      const setup = await apiTotpSetup();
      setSetupSecret(setup.secret);
      setSetupUrl(setup.otpauthUrl);
      setSetupQr(setup.qrDataUrl);
      setSetupCode("");
    } catch (err) {
      setTotpErr(err instanceof Error ? err.message : "설정 시작 실패");
    } finally {
      setTotpBusy(false);
    }
  }

  async function onConfirmTotp(e: FormEvent) {
    e.preventDefault();
    setTotpMsg(null);
    setTotpErr(null);
    setTotpBusy(true);
    try {
      const result = await apiTotpConfirm(setupCode);
      setRecoveryCodes(result.recoveryCodes);
      setTotpEnabled(true);
      setRecoveryLeft(result.recoveryCodes.length);
      setSetupSecret(null);
      setSetupUrl(null);
      setSetupQr(null);
      setSetupCode("");
      setTotpMsg(
        "2단계 인증이 활성화되었습니다. 복구 코드를 안전한 곳에 보관하세요.",
      );
      await refresh();
    } catch (err) {
      setTotpErr(err instanceof Error ? err.message : "활성화 실패");
    } finally {
      setTotpBusy(false);
    }
  }

  async function onDisableTotp(e: FormEvent) {
    e.preventDefault();
    setTotpMsg(null);
    setTotpErr(null);
    setTotpBusy(true);
    try {
      await apiTotpDisable(disablePassword, disableCode);
      setTotpEnabled(false);
      setRecoveryLeft(0);
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes(null);
      setTotpMsg("2단계 인증을 해제했습니다.");
      await refresh();
    } catch (err) {
      setTotpErr(err instanceof Error ? err.message : "해제 실패");
    } finally {
      setTotpBusy(false);
    }
  }

  function openDbConfirm() {
    setDbMsg(null);
    setDbErr(null);
    setDbPassword("");
    setDbTotpCode("");
    setDbConfirmOpen(true);
  }

  function closeDbConfirm() {
    if (resettingDb) return;
    setDbConfirmOpen(false);
    setDbPassword("");
    setDbTotpCode("");
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
    if (totpEnabled && !dbTotpCode.trim()) {
      setDbErr("2단계 인증 코드를 입력하세요.");
      return;
    }
    setResettingDb(true);
    try {
      await resetSeed(
        dbPassword,
        totpEnabled ? dbTotpCode.trim() : undefined,
      );
      setDbConfirmOpen(false);
      setDbPassword("");
      setDbTotpCode("");
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
          <p>
            버전 업데이트, 세션, 보안(암호화·2FA), 비밀번호, DB 초기화를
            관리합니다.
          </p>
        </div>
        {user && <span className="badge">{user.username}</span>}
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>버전 및 업데이트</h2>
          <span className="badge">
            {appVersion ? `v${appVersion}` : "확인 중…"}
          </span>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            새 버전이 있으면 확인하고 적용할 수 있습니다. 적용 시 민원 데이터(
            <code>data</code> 폴더)는 그대로 유지됩니다.
          </p>
          {updateErr && <p className="settings-alert is-error">{updateErr}</p>}
          {updateMsg && <p className="settings-alert is-ok">{updateMsg}</p>}

          <div className="settings-status">
            <div className="settings-stat">
              <span className="settings-stat-label">현재 버전</span>
              <strong className="settings-stat-value settings-stat-value-sm">
                {updateInfo?.currentVersion ?? appVersion ?? "—"}
              </strong>
            </div>
            <div className="settings-stat">
              <span className="settings-stat-label">최신 버전</span>
              <strong className="settings-stat-value settings-stat-value-sm">
                {updateInfo?.latestVersion ?? "—"}
              </strong>
            </div>
            <div className="settings-stat">
              <span className="settings-stat-label">상태</span>
              <strong className="settings-stat-value settings-stat-value-sm">
                {updateInfo == null
                  ? "미확인"
                  : updateInfo.updateAvailable
                    ? "업데이트 가능"
                    : updateInfo.error
                      ? "확인 실패"
                      : "최신"}
              </strong>
            </div>
          </div>
          {updateInfo?.releaseNotes && (
            <details className="settings-update-notes">
              <summary>변경 내용</summary>
              <pre>{updateInfo.releaseNotes}</pre>
            </details>
          )}
          <div className="settings-actions">
            <button
              type="button"
              className="btn"
              disabled={checkingUpdate || applyingUpdate}
              onClick={() => void onCheckUpdate()}
            >
              {checkingUpdate ? "확인 중…" : "최신 버전 확인"}
            </button>
            {updateInfo?.updateAvailable &&
              updateInfo.canApply &&
              Boolean(updateInfo.sha256) && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={applyingUpdate || checkingUpdate}
                onClick={() => setUpdateConfirmOpen(true)}
              >
                {applyingUpdate ? "적용 중…" : "지금 업데이트"}
              </button>
            )}
            {updateInfo?.updateAvailable &&
              !updateInfo.canApply &&
              updateInfo.downloadUrl && (
                <a
                  className="btn btn-primary"
                  href={updateInfo.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  ZIP 다운로드
                </a>
              )}
          </div>
          {updateInfo?.updateAvailable && !updateInfo.canApply && (
            <p className="settings-help">
              이 PC에서는 자동 적용이 지원되지 않습니다(개발 환경 등). 포터블 ZIP을
              받아 data 폴더를 유지한 채 교체하세요.
            </p>
          )}
        </div>
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>데이터 보호</h2>
          <span className="badge">
            {vault?.enabled
              ? vault.unlocked
                ? "암호화·잠금 해제"
                : "잠김"
              : "미활성"}
          </span>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            민원인 성명·연락처·사진은 DB에 AES-256-GCM으로 저장됩니다. 키는
            로그인 비밀번호에서 파생되며, 서버 메모리에만 유지됩니다. 비밀번호를
            분실하면 개인정보를 복구할 수 없습니다.
          </p>
          <div className="settings-status">
            <div className="settings-stat">
              <span className="settings-stat-label">저장 암호화</span>
              <strong className="settings-stat-value settings-stat-value-sm">
                {vault?.enabled ? "사용 중" : "다음 로그인 시 활성화"}
              </strong>
            </div>
            <div className="settings-stat">
              <span className="settings-stat-label">잠금 상태</span>
              <strong className="settings-stat-value settings-stat-value-sm">
                {vault?.unlocked ? "해제됨" : "잠김"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>2단계 인증 (TOTP)</h2>
          <span className="badge">{totpEnabled ? "활성" : "비활성"}</span>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            Google Authenticator, Microsoft Authenticator 등 인증 앱의 일회용
            코드를 로그인에 추가합니다. 복구 코드 남은 수: {recoveryLeft}개
          </p>
          {totpErr && <p className="settings-alert is-error">{totpErr}</p>}
          {totpMsg && <p className="settings-alert is-ok">{totpMsg}</p>}

          {recoveryCodes && (
            <div className="settings-recovery">
              <p className="settings-help">
                아래 복구 코드는 다시 표시되지 않습니다. 안전한 곳에 저장하세요.
              </p>
              <ul className="settings-recovery-list">
                {recoveryCodes.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!totpEnabled && !setupSecret && (
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={totpBusy}
                onClick={() => void onBeginTotp()}
              >
                {totpBusy ? "준비 중…" : "2단계 인증 설정 시작"}
              </button>
            </div>
          )}

          {!totpEnabled && setupSecret && (
            <form
              className="settings-form settings-form-password"
              onSubmit={(e) => void onConfirmTotp(e)}
            >
              <p className="settings-help settings-field-full">
                인증 앱에서 QR 코드를 스캔하세요. 스캔이 안 되면 아래 비밀 키를
                수동 입력할 수 있습니다.
              </p>
              {setupQr && (
                <div className="settings-totp-qr settings-field-full">
                  <img src={setupQr} alt="2단계 인증 QR 코드" width={240} height={240} />
                </div>
              )}
              <label className="field settings-field settings-field-full">
                비밀 키 (수동 입력용)
                <input
                  readOnly
                  value={setupSecret}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              {setupUrl && (
                <details className="settings-field-full settings-totp-details">
                  <summary>고급: otpauth URL</summary>
                  <label className="field">
                    otpauth URL
                    <input
                      readOnly
                      value={setupUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                </details>
              )}
              <label className="field settings-field settings-field-full">
                앱에 표시된 6자리 코드
                <input
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </label>
              <div className="settings-actions settings-field-full">
                <button
                  type="button"
                  className="btn"
                  disabled={totpBusy}
                  onClick={() => {
                    setSetupSecret(null);
                    setSetupUrl(null);
                    setSetupQr(null);
                    setSetupCode("");
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={totpBusy}
                >
                  {totpBusy ? "확인 중…" : "활성화"}
                </button>
              </div>
            </form>
          )}

          {totpEnabled && (
            <form
              className="settings-form settings-form-password"
              onSubmit={(e) => void onDisableTotp(e)}
            >
              <p className="settings-help settings-field-full">
                해제하려면 비밀번호와 현재 OTP(또는 복구 코드)가 필요합니다.
              </p>
              <label className="field settings-field">
                비밀번호
                <input
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  required
                />
              </label>
              <label className="field settings-field">
                OTP / 복구 코드
                <input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  required
                />
              </label>
              <div className="settings-actions settings-field-full">
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={totpBusy}
                >
                  {totpBusy ? "처리 중…" : "2단계 인증 해제"}
                </button>
              </div>
            </form>
          )}
        </div>
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
              갱신됩니다. API 서버를 재시작하면 보안상 다시 로그인해야 합니다.
            </p>
            {settingsErr && (
              <p className="settings-alert is-error">{settingsErr}</p>
            )}
            {settingsMsg && (
              <p className="settings-alert is-ok">{settingsMsg}</p>
            )}
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
            변경 시 개인정보 암호화 키도 함께 재설정됩니다. 현재 세션은
            유지되고, 다른 기기·브라우저의 세션은 종료됩니다.
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
            {totpEnabled && (
              <label className="field settings-field settings-field-full">
                2단계 인증 코드
                <input
                  value={pwTotpCode}
                  onChange={(e) => setPwTotpCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="OTP 6자리 또는 복구 코드"
                />
              </label>
            )}
            <p className="settings-help settings-field-full">
              새 비밀번호는 4자 이상이어야 합니다.
              {totpEnabled
                ? " 2단계 인증이 켜져 있어 OTP(또는 복구 코드)가 필요합니다."
                : ""}
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
            저장된 민원 데이터·보고 스냅샷·감사 로그를 모두 삭제하고 샘플
            민원으로 되돌립니다. 계정·2FA·세션 설정·암호화 설정은 유지되며,
            샘플 데이터는 다시 암호화되어 저장됩니다.
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
              이 작업은 되돌릴 수 없습니다. 민원·보고 스냅샷·감사 로그가
              삭제되고 샘플 민원으로 복원됩니다. 계속하려면 관리자 비밀번호
              {totpEnabled ? "와 2단계 인증 코드" : ""}를 입력하세요.
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
              {totpEnabled && (
                <label className="field">
                  2단계 인증 코드
                  <input
                    value={dbTotpCode}
                    onChange={(e) => setDbTotpCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="OTP 6자리 또는 복구 코드"
                  />
                </label>
              )}
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

      {updateConfirmOpen && updateInfo && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={() => !applyingUpdate && setUpdateConfirmOpen(false)}
        >
          <div
            className="settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-apply-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="update-apply-title">업데이트 적용 확인</h3>
            <p>
              v{updateInfo.currentVersion} → v{updateInfo.latestVersion}으로
              업데이트합니다. 파일이 올바른지 검증한 뒤 서버가 잠시 다시
              시작되며, 민원 데이터는 유지됩니다.
            </p>
            <div className="settings-confirm-actions">
              <button
                type="button"
                className="btn"
                disabled={applyingUpdate}
                onClick={() => setUpdateConfirmOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={applyingUpdate}
                onClick={() => void onApplyUpdate()}
              >
                {applyingUpdate ? "다운로드·적용 중…" : "업데이트 실행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
