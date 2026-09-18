import { useState, type FormEvent } from "react";
import { apiChangePassword } from "@/api/auth";
import { useAuth } from "@/store/AuthStore";

export function ForceChangePasswordPage() {
  const { user, applySession, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== newPassword2) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (newPassword === "admin") {
      setError("기본 비밀번호(admin)는 사용할 수 없습니다.");
      return;
    }
    if (user?.totpEnabled && !totpCode.trim()) {
      setError("2단계 인증 코드를 입력하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await apiChangePassword(
        currentPassword,
        newPassword,
        user?.totpEnabled ? totpCode.trim() : undefined,
      );
      applySession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 변경 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={(e) => void onSubmit(e)}>
        <div className="login-brand">
          <span className="brand-kicker">보안</span>
          <h1>비밀번호 변경 필수</h1>
          <p>
            기본 계정(<code>admin</code> / <code>admin</code>)은 최초 로그인 후
            반드시 변경해야 합니다. 변경이 끝나기 전에는 다른 기능을 사용할 수
            없습니다.
          </p>
        </div>
        <label className="field">
          현재 비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
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
        <label className="field">
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
        {user?.totpEnabled && (
          <label className="field">
            2단계 인증 코드
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
              placeholder="000000"
            />
          </label>
        )}
        {error && <p className="login-error">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? "변경 중…" : "비밀번호 변경 후 시작"}
        </button>
        <button
          type="button"
          className="btn login-back"
          onClick={() => void logout()}
          disabled={submitting}
        >
          로그아웃
        </button>
        <p className="login-hint">새 비밀번호는 4자 이상이며 admin 은 사용할 수 없습니다.</p>
      </form>
    </div>
  );
}
