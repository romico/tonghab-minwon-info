import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "tm-docs-snapshot";

function readFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(window.location.search);
  return q.get("docsSnapshot") === "1";
}

const SnapshotMaskContext = createContext(false);

/** 문서·공개용 화면 캡처 시 개인정보 원본 노출을 막는다. */
export function SnapshotMaskProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const on = readFlag();
    if (on) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      document.body.classList.add("docs-snapshot");
      setActive(true);
    }
    return () => {
      document.body.classList.remove("docs-snapshot");
    };
  }, []);

  const value = useMemo(() => active, [active]);
  return (
    <SnapshotMaskContext.Provider value={value}>
      {children}
    </SnapshotMaskContext.Provider>
  );
}

export function useSnapshotMask(): boolean {
  return useContext(SnapshotMaskContext);
}

export function enableDocsSnapshotMask(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
  document.body.classList.add("docs-snapshot");
}
