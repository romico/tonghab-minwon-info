import { Link, Navigate, useParams } from "react-router-dom";
import { LegalDocBody } from "@/components/LegalDocBody";
import { LEGAL_NAV, SITE_URL, isLegalDocId } from "@/legal/documents";
import { useAuth } from "@/store/AuthStore";

export function LegalDocPage() {
  const { docId = "" } = useParams();
  const { user } = useAuth();
  const backTo = user ? "/settings" : "/login";
  const backLabel = user ? "설정으로 돌아가기" : "로그인으로 돌아가기";

  if (!isLegalDocId(docId)) {
    return <Navigate to={backTo} replace />;
  }

  return (
    <div className="legal-page">
      <header className="legal-top">
        <div className="legal-top-inner">
          <Link to={backTo} className="legal-back">
            ← {backLabel}
          </Link>
          <div className="legal-top-center">
            <span className="legal-top-kicker">민원 AX</span>
            <span className="legal-top-title">정보 · 고지</span>
          </div>
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="legal-top-site"
          >
            소개 사이트 ↗
          </a>
        </div>
      </header>

      <div className="legal-shell">
        <nav className="legal-tabs" aria-label="고지 문서">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.id}
              to={`/legal/${item.id}`}
              className={`legal-tab${item.id === docId ? " is-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="legal-paper">
          <LegalDocBody docId={docId} />
        </main>
      </div>
    </div>
  );
}
