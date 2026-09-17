import { Link } from "react-router-dom";
import {
  LEGAL_DOCS,
  LEGAL_NAV,
  type LegalBlock,
  type LegalDocId,
  SITE_URL,
} from "@/legal/documents";

export function LegalDocBody({ docId }: { docId: LegalDocId }) {
  const doc = LEGAL_DOCS[docId];
  return (
    <article className="legal-doc">
      <header className="legal-doc-header">
        <h1>{doc.title}</h1>
        <p className="legal-doc-meta">최종 개정 {doc.updatedAt}</p>
        <p className="legal-doc-summary">{doc.summary}</p>
      </header>
      <div className="legal-doc-body">
        {doc.blocks.map((block, i) => (
          <LegalBlockView key={i} block={block} />
        ))}
      </div>
    </article>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  if (block.type === "h3") return <h3>{block.text}</h3>;
  if (block.type === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p>{block.text}</p>;
}

/** 설정·로그인용 링크 묶음 */
export function LegalNavLinks({
  className,
  onNavigate,
  includeSite = true,
}: {
  className?: string;
  onNavigate?: () => void;
  includeSite?: boolean;
}) {
  return (
    <ul className={className ?? "legal-nav-list"}>
      {includeSite && (
        <li>
          <a href={SITE_URL} target="_blank" rel="noreferrer">
            소개 사이트
          </a>
        </li>
      )}
      {LEGAL_NAV.map((item) => (
        <li key={item.id}>
          <Link to={`/legal/${item.id}`} onClick={onNavigate}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
