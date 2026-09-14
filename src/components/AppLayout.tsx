import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PeriodLoadingOverlay } from "@/components/PeriodLoadingOverlay";
import { useAuth } from "@/store/AuthStore";
import { useComplaintStore } from "@/store/ComplaintStore";

const LINKS = [
  { to: "/ledger", step: "1", label: "관리대장" },
  { to: "/departments", step: "2", label: "부서별현황" },
  { to: "/summary", step: "3", label: "총괄표" },
  { to: "/daily", step: "4", label: "일일보고" },
  { to: "/audit", step: "A", label: "감사로그" },
  { to: "/settings", step: "S", label: "설정" },
];

const HIDE_PERIOD_PATHS = new Set(["/audit", "/settings"]);

export function AppLayout() {
  const location = useLocation();
  const { user, logout, expiresAt } = useAuth();
  const {
    periodFrom,
    periodTo,
    setPeriodFrom,
    setPeriodTo,
    clearPeriod,
    periodLoading,
    storeLoading,
    storeError,
    filteredComplaints,
    complaints,
  } = useComplaintStore();

  const [navOpen, setNavOpen] = useState(false);
  const periodActive = Boolean(periodFrom || periodTo);
  const busy = periodLoading || storeLoading;
  const showPeriodFilters = !HIDE_PERIOD_PATHS.has(location.pathname);

  const countLabel = storeError
    ? "API 연결 실패"
    : storeLoading
      ? "불러오는 중…"
      : periodLoading
        ? "기간 적용 중…"
        : periodActive
          ? `기간 ${filteredComplaints.length}/${complaints.length}건`
          : `${complaints.length}건`;

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("nav-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("nav-open");
    };
  }, [navOpen]);

  return (
    <div className={`app-shell${navOpen ? " is-nav-open" : ""}`}>
      <header className="mobile-bar">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          onClick={() => setNavOpen((v) => !v)}
        >
          <span className="sr-only">{navOpen ? "메뉴 닫기" : "메뉴 열기"}</span>
          <span className="burger" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </button>
        <div className="mobile-bar-brand">
          <span className="brand-title">통합민원정보</span>
          <span className="mobile-bar-meta">
            {user?.username} · {countLabel}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost mobile-logout"
          onClick={() => void logout()}
        >
          로그아웃
        </button>
      </header>

      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          <span className="brand-kicker">Jeonju AX</span>
          <span className="brand-title">통합민원정보</span>
        </div>
        <nav className="nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <span className="nav-step">{link.step}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flow-hint">
          <div className="flow-user">
            {user?.username}
            {expiresAt
              ? ` · ~${new Date(expiresAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </div>
          <div>{countLabel}</div>
          <button
            type="button"
            className="btn btn-ghost sidebar-logout"
            onClick={() => void logout()}
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="main">
        {showPeriodFilters && (
          <div className="page-header global-filters">
            <div className="toolbar period-search">
              <span className="period-label">보고일 기준</span>
              <label className="field period-field">
                시작일
                <input
                  type="date"
                  value={periodFrom}
                  max={periodTo || undefined}
                  disabled={busy}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  title="처리부서 통보일 시작"
                />
              </label>
              <span className="period-tilde" aria-hidden>
                ~
              </span>
              <label className="field period-field">
                종료일
                <input
                  type="date"
                  value={periodTo}
                  min={periodFrom || undefined}
                  disabled={busy}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  title="처리부서 통보일 종료"
                />
              </label>
              {periodActive && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={clearPeriod}
                >
                  기간 초기화
                </button>
              )}
              {busy && <span className="period-inline-spinner" aria-hidden />}
            </div>
          </div>
        )}

        {storeError && (
          <div
            className="panel"
            style={{ marginBottom: 16, borderColor: "var(--accent)" }}
          >
            <div className="panel-head">
              <h2>데이터베이스 연결 오류</h2>
            </div>
            <p style={{ margin: "0 16px 16px", color: "var(--muted)" }}>
              {storeError}
              <br />
              터미널에서 <code>npm run dev</code> 로 Express(SQLite) + Vite를
              함께 실행하세요.
            </p>
          </div>
        )}

        <div className="main-content" aria-busy={busy || undefined}>
          <div className={busy ? "main-content-dimmed" : undefined}>
            <Outlet />
          </div>
          {busy && showPeriodFilters && <PeriodLoadingOverlay />}
        </div>
      </main>
    </div>
  );
}
