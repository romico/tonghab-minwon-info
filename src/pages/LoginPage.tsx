import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/store/AuthStore";

export function LoginPage() {
  const { user, authLoading, login, completeTotpLogin } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const challenge = await login(username, password);
      if (challenge && "requiresTotp" in challenge) {
        setChallengeToken(challenge.challengeToken);
        setTotpCode("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitTotp(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeTotpLogin(challengeToken, totpCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "2단계 인증 실패");
    } finally {
      setSubmitting(false);
    }
  }

  function backToPassword() {
    setChallengeToken(null);
    setTotpCode("");
    setError(null);
  }

  return (
    <div className="login-shell">
      {!challengeToken ? (
        <form className="login-card" onSubmit={(e) => void onSubmitPassword(e)}>
          <div className="login-brand">
            <span className="brand-kicker">Jeonju AX</span>
            <h1>통합민원정보</h1>
            <p>관리자 로그인 후 이용할 수 있습니다.</p>
          </div>
          <label className="field">
            아이디
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field">
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || authLoading}
          >
            {submitting ? "로그인 중…" : "로그인"}
          </button>
          <p className="login-hint">
            초기 계정: admin / admin (설정에서 변경). 로그인 시 개인정보 DB
            암호화가 잠금 해제됩니다.
          </p>
        </form>
      ) : (
        <form className="login-card" onSubmit={(e) => void onSubmitTotp(e)}>
          <div className="login-brand">
            <span className="brand-kicker">2단계 인증</span>
            <h1>인증 코드 입력</h1>
            <p>
              인증 앱의 6자리 코드 또는 복구 코드를 입력하세요.
            </p>
          </div>
          <label className="field">
            인증 코드
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
              placeholder="000000"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "확인 중…" : "확인"}
          </button>
          <button
            type="button"
            className="btn login-back"
            onClick={backToPassword}
            disabled={submitting}
          >
            뒤로
          </button>
        </form>
      )}
    </div>
  );
}
