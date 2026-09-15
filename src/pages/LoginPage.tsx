import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/store/AuthStore";

export function LoginPage() {
  const { user, authLoading, login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={(e) => void onSubmit(e)}>
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
        <p className="login-hint">초기 계정: admin / admin (설정에서 변경)</p>
      </form>
    </div>
  );
}
