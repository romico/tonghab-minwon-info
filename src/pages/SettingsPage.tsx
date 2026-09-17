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
  apiArchiveDelete,
  apiArchiveRestore,
  apiArchiveRollover,
  apiCompactStorage,
  apiGetArchiveInfo,
  apiGetStorage,
  formatBytes,
  type ArchiveInfo,
  type DbStorageInfo,
} from "@/api/storage";
import {
  apiApplyUpdate,
  apiCheckUpdate,
  apiGetVersion,
  type UpdateCheckResult,
} from "@/api/updates";
import { useAuth } from "@/store/AuthStore";
import { useComplaintStore } from "@/store/ComplaintStore";

export function SettingsPage() {
  const { refresh, ttlMinutes, expiresAt, user, vault, logout } = useAuth();
  const { resetSeed, refreshComplaints } = useComplaintStore();
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

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveLabel, setArchiveLabel] = useState(() =>
    String(new Date().getFullYear()),
  );
  const [archivePassword, setArchivePassword] = useState("");
  const [archiveTotpCode, setArchiveTotpCode] = useState("");
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);
  const [archiveErr, setArchiveErr] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreFileName, setRestoreFileName] = useState<string | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<ArchiveInfo | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreVaultPassword, setRestoreVaultPassword] = useState("");
  const [restoreTotpCode, setRestoreTotpCode] = useState("");
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreInfoLoading, setRestoreInfoLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteFileName, setDeleteFileName] = useState<string | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<ArchiveInfo | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteTotpCode, setDeleteTotpCode] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteInfoLoading, setDeleteInfoLoading] = useState(false);

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

  const [storage, setStorage] = useState<DbStorageInfo | null>(null);
  const [storageErr, setStorageErr] = useState<string | null>(null);
  const [storageMsg, setStorageMsg] = useState<string | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [compacting, setCompacting] = useState(false);

  async function loadStorage() {
    setStorageLoading(true);
    setStorageErr(null);
    try {
      setStorage(await apiGetStorage());
    } catch (err) {
      setStorageErr(
        err instanceof Error ? err.message : "저장소 정보를 불러오지 못했습니다.",
      );
    } finally {
      setStorageLoading(false);
    }
  }

  async function onCompactStorage() {
    setCompacting(true);
    setStorageErr(null);
    setStorageMsg(null);
    try {
      const result = await apiCompactStorage();
      setStorage(result.storage);
      const saved = result.beforeBytes - result.afterBytes;
      if (saved <= 1024 * 64) {
        setStorageMsg(
          `회수할 빈 공간이 거의 없습니다 (${formatBytes(result.beforeBytes)} → ${formatBytes(result.afterBytes)}). ` +
            `현재 민원 ${result.storage.complaintCount.toLocaleString("ko-KR")}건이 그대로 저장되어 용량을 쓰고 있습니다. ` +
            `용량을 크게 줄이려면 아래 「아카이브 전환」으로 민원을 보관한 뒤 비우세요.`,
        );
      } else {
        setStorageMsg(
          `용량 회수 완료: ${formatBytes(result.beforeBytes)} → ${formatBytes(result.afterBytes)} (약 ${formatBytes(saved)} 감소)`,
        );
      }
    } catch (err) {
      setStorageErr(
        err instanceof Error ? err.message : "용량 회수에 실패했습니다.",
      );
    } finally {
      setCompacting(false);
    }
  }

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
    void loadStorage();
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

  function openArchiveConfirm() {
    setArchiveMsg(null);
    setArchiveErr(null);
    setArchivePassword("");
    setArchiveTotpCode("");
    setArchiveLabel(String(new Date().getFullYear()));
    setArchiveConfirmOpen(true);
  }

  function closeArchiveConfirm() {
    if (archiving) return;
    setArchiveConfirmOpen(false);
    setArchivePassword("");
    setArchiveTotpCode("");
    setArchiveErr(null);
  }

  async function onArchiveRollover(e: FormEvent) {
    e.preventDefault();
    setArchiveMsg(null);
    setArchiveErr(null);
    if (!archivePassword) {
      setArchiveErr("비밀번호를 입력하세요.");
      return;
    }
    if (totpEnabled && !archiveTotpCode.trim()) {
      setArchiveErr("2단계 인증 코드를 입력하세요.");
      return;
    }
    if (!archiveLabel.trim()) {
      setArchiveErr("보관 라벨을 입력하세요.");
      return;
    }
    setArchiving(true);
    try {
      const result = await apiArchiveRollover(archivePassword, {
        label: archiveLabel.trim(),
        totpCode: totpEnabled ? archiveTotpCode.trim() : undefined,
      });
      setArchiveConfirmOpen(false);
      setArchivePassword("");
      setArchiveTotpCode("");
      setStorage(result.storage);
      await refreshComplaints();
      setArchiveMsg(
        `보관 완료: ${result.archiveFileName} (민원 ${result.archivedComplaintCount.toLocaleString("ko-KR")}건). ` +
          `활성 DB ${formatBytes(result.beforeBytes)} → ${formatBytes(result.afterBytes)}. ` +
          `스냅샷·감사 로그·계정은 유지되었습니다.`,
      );
    } catch (err) {
      setArchiveErr(
        err instanceof Error ? err.message : "아카이브 전환에 실패했습니다.",
      );
    } finally {
      setArchiving(false);
    }
  }

  async function openRestoreConfirm(fileName: string) {
    setArchiveMsg(null);
    setArchiveErr(null);
    setRestoreErr(null);
    setRestorePassword("");
    setRestoreVaultPassword("");
    setRestoreTotpCode("");
    setRestoreMode("merge");
    setRestoreFileName(fileName);
    setRestoreInfo(null);
    setRestoreConfirmOpen(true);
    setRestoreInfoLoading(true);
    try {
      setRestoreInfo(await apiGetArchiveInfo(fileName));
    } catch (err) {
      setRestoreErr(
        err instanceof Error ? err.message : "보관본 정보를 불러오지 못했습니다.",
      );
    } finally {
      setRestoreInfoLoading(false);
    }
  }

  function closeRestoreConfirm() {
    if (restoring) return;
    setRestoreConfirmOpen(false);
    setRestoreFileName(null);
    setRestoreInfo(null);
    setRestorePassword("");
    setRestoreVaultPassword("");
    setRestoreTotpCode("");
    setRestoreErr(null);
  }

  async function onRestoreArchive(e: FormEvent) {
    e.preventDefault();
    setRestoreErr(null);
    setArchiveMsg(null);
    if (!restoreFileName) return;
    if (!restorePassword) {
      setRestoreErr("현재 비밀번호를 입력하세요.");
      return;
    }
    if (totpEnabled && !restoreTotpCode.trim()) {
      setRestoreErr("2단계 인증 코드를 입력하세요.");
      return;
    }
    if (
      restoreMode === "merge" &&
      restoreInfo?.vaultEnabled &&
      !restoreVaultPassword
    ) {
      setRestoreErr(
        "보관본이 암호화되어 있습니다. 아카이브 시점 비밀번호를 입력하세요.",
      );
      return;
    }
    setRestoring(true);
    try {
      const result = await apiArchiveRestore({
        password: restorePassword,
        fileName: restoreFileName,
        mode: restoreMode,
        archivePassword:
          restoreMode === "merge" && restoreInfo?.vaultEnabled
            ? restoreVaultPassword
            : undefined,
        totpCode: totpEnabled ? restoreTotpCode.trim() : undefined,
      });
      setRestoreConfirmOpen(false);
      setRestorePassword("");
      setRestoreVaultPassword("");
      setRestoreTotpCode("");
      setStorage(result.storage);

      if (result.mode === "replace") {
        setArchiveMsg(
          `통째 교체 완료: ${result.archiveFileName}. 이전 활성은 ${result.backupFileName}에 백업되었습니다. 보관 시점 계정으로 다시 로그인해 주세요.`,
        );
        await logout();
        return;
      }

      await refreshComplaints();
      setArchiveMsg(
        `민원 병합 완료: ${result.archiveFileName} (${result.imported.toLocaleString("ko-KR")}건` +
          (result.vaultReencrypted ? ", Vault 재암호화" : "") +
          `). 계정·스냅샷·감사 로그는 유지되었습니다.`,
      );
    } catch (err) {
      setRestoreErr(
        err instanceof Error ? err.message : "보관본 복원에 실패했습니다.",
      );
    } finally {
      setRestoring(false);
    }
  }

  async function openDeleteConfirm(fileName: string) {
    setArchiveMsg(null);
    setArchiveErr(null);
    setDeleteErr(null);
    setDeletePassword("");
    setDeleteTotpCode("");
    setDeleteFileName(fileName);
    setDeleteInfo(null);
    setDeleteConfirmOpen(true);
    setDeleteInfoLoading(true);
    try {
      setDeleteInfo(await apiGetArchiveInfo(fileName));
    } catch (err) {
      setDeleteErr(
        err instanceof Error ? err.message : "보관본 정보를 불러오지 못했습니다.",
      );
    } finally {
      setDeleteInfoLoading(false);
    }
  }

  function closeDeleteConfirm() {
    if (deleting) return;
    setDeleteConfirmOpen(false);
    setDeleteFileName(null);
    setDeleteInfo(null);
    setDeletePassword("");
    setDeleteTotpCode("");
    setDeleteErr(null);
  }

  async function onDeleteArchive(e: FormEvent) {
    e.preventDefault();
    setDeleteErr(null);
    setArchiveMsg(null);
    if (!deleteFileName) return;
    if (!deletePassword) {
      setDeleteErr("비밀번호를 입력하세요.");
      return;
    }
    if (totpEnabled && !deleteTotpCode.trim()) {
      setDeleteErr("2단계 인증 코드를 입력하세요.");
      return;
    }
    setDeleting(true);
    try {
      const result = await apiArchiveDelete({
        password: deletePassword,
        fileName: deleteFileName,
        totpCode: totpEnabled ? deleteTotpCode.trim() : undefined,
      });
      setDeleteConfirmOpen(false);
      setDeletePassword("");
      setDeleteTotpCode("");
      setStorage(result.storage);
      setArchiveMsg(
        `보관본 삭제 완료: ${result.archiveFileName} (민원 ${result.complaintCount.toLocaleString("ko-KR")}건 · ${formatBytes(result.bytes)}). 이 작업은 되돌릴 수 없습니다.`,
      );
    } catch (err) {
      setDeleteErr(
        err instanceof Error ? err.message : "보관본 삭제에 실패했습니다.",
      );
    } finally {
      setDeleting(false);
    }
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
      setDbMsg(
        "DB를 초기화하고 샘플 데이터로 복원했습니다. 용량이 줄었는지 「용량 새로고침」으로 확인하세요.",
      );
      void loadStorage();
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
          <h2>데이터베이스 위치</h2>
          <span className="badge">
            {storageLoading
              ? "확인 중…"
              : storage
                ? formatBytes(storage.totalBytes)
                : "—"}
          </span>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            현재 앱이 사용 중인 SQLite 파일 경로와 용량입니다. 「용량 회수」는
            삭제 후 남은 빈 페이지만 줄입니다. 민원 건수가 많으면 파일 크기는
            거의 줄지 않으며, 크게 줄이려면 「아카이브 전환」으로 민원을 보관한 뒤
            비우세요.
          </p>
          {storageErr && (
            <p className="settings-alert is-error">{storageErr}</p>
          )}
          {storageMsg && (
            <p className="settings-alert is-ok">{storageMsg}</p>
          )}
          {storage && storage.complaintCount > 10 && (
            <p className="settings-alert is-error">
              민원 {storage.complaintCount.toLocaleString("ko-KR")}건이 저장되어
              있습니다 ({formatBytes(storage.dbBytes)}). 초기 회수만으로는
              이 용량이 줄지 않습니다.
            </p>
          )}
          {storage && (
            <>
              <div className="settings-status">
                <div className="settings-stat">
                  <span className="settings-stat-label">민원 건수</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {storage.complaintCount.toLocaleString("ko-KR")}건
                  </strong>
                </div>
                <div className="settings-stat">
                  <span className="settings-stat-label">DB 파일</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {formatBytes(storage.dbBytes)}
                  </strong>
                </div>
                <div className="settings-stat">
                  <span className="settings-stat-label">WAL+SHM</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {formatBytes(storage.walBytes + storage.shmBytes)}
                  </strong>
                </div>
                <div className="settings-stat">
                  <span className="settings-stat-label">회수 가능(빈공간)</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {formatBytes(storage.freelistBytes)}
                  </strong>
                </div>
                <div className="settings-stat">
                  <span className="settings-stat-label">사진 데이터</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {formatBytes(storage.photoPayloadBytes)}
                  </strong>
                </div>
                <div className="settings-stat">
                  <span className="settings-stat-label">텍스트 등</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {formatBytes(
                      Math.max(
                        0,
                        storage.complaintPayloadBytes - storage.photoPayloadBytes,
                      ),
                    )}
                  </strong>
                </div>
                <div className="settings-stat">
                  <span className="settings-stat-label">data 폴더</span>
                  <strong className="settings-stat-value settings-stat-value-sm">
                    {formatBytes(storage.dataDirBytes)}
                  </strong>
                </div>
              </div>
              {storage.complaintPayloadBytes > 0 && (
                <p className="settings-help" style={{ marginTop: 8 }}>
                  민원 본문 JSON 중 사진(base64) 약{" "}
                  {Math.round(
                    (storage.photoPayloadBytes /
                      storage.complaintPayloadBytes) *
                      100,
                  )}
                  % · 이미지 {storage.photoCount.toLocaleString("ko-KR")}장
                </p>
              )}

              <dl className="storage-meta">
                <div>
                  <dt>DB 파일 경로</dt>
                  <dd>
                    <code className="storage-path">{storage.dbPath}</code>
                  </dd>
                </div>
                <div>
                  <dt>데이터 폴더</dt>
                  <dd>
                    <code className="storage-path">{storage.dataDir}</code>
                  </dd>
                </div>
              </dl>

              {storage.dataDirFiles.length > 0 && (
                <div className="storage-files">
                  <div className="storage-files-title">폴더 내 파일</div>
                  <ul>
                    {storage.dataDirFiles.map((f) => (
                      <li key={f.name}>
                        <span>{f.name}</span>
                        <span>{formatBytes(f.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="settings-actions">
            <button
              type="button"
              className="btn"
              disabled={storageLoading || compacting}
              onClick={() => void loadStorage()}
            >
              {storageLoading ? "새로고침 중…" : "용량 새로고침"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={storageLoading || compacting}
              onClick={() => void onCompactStorage()}
            >
              {compacting ? "회수 중…" : "용량 회수 (VACUUM)"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel settings-panel">
        <div className="panel-head">
          <h2>아카이브 · 복원</h2>
          <span className="badge">운영</span>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            관리연도·분기 마감 시 현재 DB를{" "}
            <code>data/archives/</code>에 보관한 뒤 활성 민원만 비웁니다.
            보고 스냅샷·감사 로그·계정·2FA·암호화 설정은 유지됩니다. 복원은
            기본적으로 민원만 병합하며, 통째 교체는 로그인·2FA가 보관 시점으로
            되돌아갑니다.
          </p>
          {archiveMsg && (
            <p className="settings-alert is-ok">{archiveMsg}</p>
          )}
          {archiveErr &&
            !archiveConfirmOpen &&
            !restoreConfirmOpen &&
            !deleteConfirmOpen && (
            <p className="settings-alert is-error">{archiveErr}</p>
          )}
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={openArchiveConfirm}
              disabled={archiving || restoring || deleting}
            >
              아카이브 전환…
            </button>
          </div>

          {storage && storage.archives.length > 0 && (
            <div className="storage-files" style={{ marginTop: "1rem" }}>
              <div className="storage-files-title">
                보관본 ({storage.archivesDir})
              </div>
              <ul>
                {storage.archives.map((f) => (
                  <li key={f.name}>
                    <span>
                      {f.name}
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.85em",
                          opacity: 0.75,
                        }}
                      >
                        {formatBytes(f.bytes)} ·{" "}
                        {new Date(f.mtimeMs).toLocaleString("ko-KR")}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "flex",
                        gap: "0.35rem",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        className="btn"
                        disabled={archiving || restoring || deleting}
                        onClick={() => void openRestoreConfirm(f.name)}
                      >
                        복원…
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={archiving || restoring || deleting}
                        onClick={() => void openDeleteConfirm(f.name)}
                      >
                        삭제…
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {storage && storage.archives.length === 0 && (
            <p className="settings-lead" style={{ marginTop: "0.75rem" }}>
              아직 보관본이 없습니다. 아카이브 전환 후 여기에 목록이 표시됩니다.
            </p>
          )}
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

      {archiveConfirmOpen && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={closeArchiveConfirm}
        >
          <div
            className="settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-rollover-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="archive-rollover-title">아카이브 전환 확인</h3>
            <p>
              현재 DB를 보관한 뒤 활성 민원만 비웁니다. 스냅샷·감사 로그·계정은
              유지되며 샘플 민원은 넣지 않습니다. 민원{" "}
              {storage
                ? storage.complaintCount.toLocaleString("ko-KR")
                : "—"}
              건이 보관됩니다.
            </p>
            <form onSubmit={(e) => void onArchiveRollover(e)}>
              <label className="field">
                보관 라벨
                <input
                  value={archiveLabel}
                  onChange={(e) => setArchiveLabel(e.target.value)}
                  required
                  placeholder="예: 2026 또는 2026Q1"
                  autoFocus
                />
              </label>
              <label className="field">
                비밀번호
                <input
                  type="password"
                  autoComplete="current-password"
                  value={archivePassword}
                  onChange={(e) => setArchivePassword(e.target.value)}
                  required
                />
              </label>
              {totpEnabled && (
                <label className="field">
                  2단계 인증 코드
                  <input
                    value={archiveTotpCode}
                    onChange={(e) => setArchiveTotpCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="OTP 6자리 또는 복구 코드"
                  />
                </label>
              )}
              {archiveErr && (
                <p className="settings-alert is-error">{archiveErr}</p>
              )}
              <div className="settings-confirm-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={closeArchiveConfirm}
                  disabled={archiving}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={archiving}
                >
                  {archiving ? "보관 중…" : "아카이브 실행"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restoreConfirmOpen && restoreFileName && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={closeRestoreConfirm}
        >
          <div
            className="settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-restore-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="archive-restore-title">보관본 복원</h3>
            <p>
              <code>{restoreFileName}</code>
              {restoreInfoLoading
                ? " · 정보 불러오는 중…"
                : restoreInfo
                  ? ` · 민원 ${restoreInfo.complaintCount.toLocaleString("ko-KR")}건 · ${formatBytes(restoreInfo.bytes)}${restoreInfo.vaultEnabled ? " · 암호화됨" : ""}`
                  : ""}
            </p>
            <form onSubmit={(e) => void onRestoreArchive(e)}>
              <fieldset className="field" style={{ border: 0, padding: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                  복원 방식
                </legend>
                <label
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                    marginBottom: "0.35rem",
                  }}
                >
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={restoreMode === "merge"}
                    onChange={() => setRestoreMode("merge")}
                  />
                  <span>
                    민원만 병합 (권장) — 계정·2FA·스냅샷·감사 유지
                    {restoreInfo?.vaultEnabled
                      ? ". 보관 시점 비밀번호로 재암호화"
                      : ""}
                  </span>
                </label>
                <label
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                  }}
                >
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={restoreMode === "replace"}
                    onChange={() => setRestoreMode("replace")}
                  />
                  <span>
                    통째 교체 (위험) — 로그인·2FA·Vault가 보관 시점으로 되돌아가며
                    재로그인 필요. 현재 활성은 자동 백업됩니다.
                  </span>
                </label>
              </fieldset>
              <label className="field">
                현재 비밀번호
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  required
                />
              </label>
              {restoreMode === "merge" && restoreInfo?.vaultEnabled && (
                <label className="field">
                  보관본 비밀번호 (아카이브 시점)
                  <input
                    type="password"
                    autoComplete="off"
                    value={restoreVaultPassword}
                    onChange={(e) => setRestoreVaultPassword(e.target.value)}
                    required
                    placeholder="비번 변경 전이면 현재와 동일"
                  />
                </label>
              )}
              {totpEnabled && (
                <label className="field">
                  2단계 인증 코드
                  <input
                    value={restoreTotpCode}
                    onChange={(e) => setRestoreTotpCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="OTP 6자리 또는 복구 코드"
                  />
                </label>
              )}
              {restoreErr && (
                <p className="settings-alert is-error">{restoreErr}</p>
              )}
              <div className="settings-confirm-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={closeRestoreConfirm}
                  disabled={restoring}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className={
                    restoreMode === "replace" ? "btn btn-danger" : "btn btn-primary"
                  }
                  disabled={restoring || restoreInfoLoading}
                >
                  {restoring
                    ? "복원 중…"
                    : restoreMode === "replace"
                      ? "통째 교체 실행"
                      : "민원 병합 실행"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmOpen && deleteFileName && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={closeDeleteConfirm}
        >
          <div
            className="settings-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="archive-delete-title">보관본 삭제 확인</h3>
            <p>
              <code>{deleteFileName}</code>을(를) 디스크에서 영구 삭제합니다.
              {deleteInfoLoading
                ? " 정보 불러오는 중…"
                : deleteInfo
                  ? ` 민원 ${deleteInfo.complaintCount.toLocaleString("ko-KR")}건 · ${formatBytes(deleteInfo.bytes)}.`
                  : ""}{" "}
              되돌릴 수 없습니다. 계속하려면 비밀번호
              {totpEnabled ? "와 2단계 인증 코드" : ""}를 입력하세요.
            </p>
            <form onSubmit={(e) => void onDeleteArchive(e)}>
              <label className="field">
                비밀번호
                <input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </label>
              {totpEnabled && (
                <label className="field">
                  2단계 인증 코드
                  <input
                    value={deleteTotpCode}
                    onChange={(e) => setDeleteTotpCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="OTP 6자리 또는 복구 코드"
                  />
                </label>
              )}
              {deleteErr && (
                <p className="settings-alert is-error">{deleteErr}</p>
              )}
              <div className="settings-confirm-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={closeDeleteConfirm}
                  disabled={deleting}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={deleting || deleteInfoLoading}
                >
                  {deleting ? "삭제 중…" : "영구 삭제"}
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
