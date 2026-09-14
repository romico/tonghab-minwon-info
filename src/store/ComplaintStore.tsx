import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiAddComplaints,
  apiDeleteComplaint,
  apiListComplaints,
  apiReplaceComplaints,
  apiResetSeed,
  apiUpsertComplaint,
} from "@/api/complaints";
import {
  buildDailyReport,
  buildDepartmentStatus,
  buildSummaryReport,
  normalizeComplaint,
  type Complaint,
  type ComplaintInput,
  type DailyReport,
  type DepartmentStatusRow,
  type SummaryReport,
} from "@/schema";

const STORAGE_KEY = "tonghab-minwon-complaints";
const MIGRATED_KEY = "tonghab-minwon-sqlite-migrated";
const REPORT_DATE_KEY = "tonghab-minwon-report-date";
const PERIOD_FROM_KEY = "tonghab-minwon-period-from";
const PERIOD_TO_KEY = "tonghab-minwon-period-to";

function loadReportDate(): string {
  return (
    localStorage.getItem(REPORT_DATE_KEY) ??
    new Date().toISOString().slice(0, 10)
  );
}

function loadPeriod(key: string): string {
  return localStorage.getItem(key) ?? "";
}

function readLegacyLocalComplaints(): Complaint[] | null {
  if (localStorage.getItem(MIGRATED_KEY)) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Complaint[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((c) => normalizeComplaint(c));
  } catch {
    return null;
  }
}

function inNotifiedPeriod(
  c: Complaint,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;
  if (!c.notifiedAt) return false;
  if (from && c.notifiedAt < from) return false;
  if (to && c.notifiedAt > to) return false;
  return true;
}

interface StoreValue {
  complaints: Complaint[];
  filteredComplaints: Complaint[];
  /** SQLite API 최초 로딩 */
  storeLoading: boolean;
  storeError: string | null;
  reportDate: string;
  setReportDate: (date: string) => void;
  periodFrom: string;
  periodTo: string;
  setPeriodFrom: (date: string) => void;
  setPeriodTo: (date: string) => void;
  clearPeriod: () => void;
  periodLoading: boolean;
  upsertComplaint: (input: ComplaintInput) => Promise<void>;
  addComplaints: (inputs: ComplaintInput[]) => Promise<number>;
  deleteComplaint: (id: string) => Promise<void>;
  resetSeed: () => Promise<void>;
  departmentStatus: DepartmentStatusRow[];
  summary: SummaryReport;
  daily: DailyReport;
}

const StoreContext = createContext<StoreValue | null>(null);

export function ComplaintProvider({ children }: { children: ReactNode }) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [reportDate, setReportDateState] = useState(loadReportDate);
  const [periodFrom, setPeriodFromState] = useState(() =>
    loadPeriod(PERIOD_FROM_KEY),
  );
  const [periodTo, setPeriodToState] = useState(() => loadPeriod(PERIOD_TO_KEY));
  const [periodLoading, setPeriodLoading] = useState(false);
  const periodLoadTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStoreLoading(true);
      setStoreError(null);
      try {
        let list = await apiListComplaints();
        const legacy = readLegacyLocalComplaints();
        if (legacy && legacy.length > 0) {
          list = await apiReplaceComplaints(legacy);
          localStorage.setItem(MIGRATED_KEY, "1");
          localStorage.removeItem(STORAGE_KEY);
        }
        if (!cancelled) setComplaints(list);
      } catch (err) {
        if (!cancelled) {
          setStoreError(
            err instanceof Error
              ? err.message
              : "SQLite API에 연결할 수 없습니다. npm run dev 로 서버를 켜 주세요.",
          );
        }
      } finally {
        if (!cancelled) setStoreLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runPeriodUpdate = useCallback((apply: () => void) => {
    if (periodLoadTimer.current != null) {
      window.clearTimeout(periodLoadTimer.current);
      periodLoadTimer.current = null;
    }
    setPeriodLoading(true);
    periodLoadTimer.current = window.setTimeout(() => {
      apply();
      periodLoadTimer.current = window.setTimeout(() => {
        setPeriodLoading(false);
        periodLoadTimer.current = null;
      }, 180);
    }, 40);
  }, []);

  const setReportDate = useCallback((date: string) => {
    setReportDateState(date);
    localStorage.setItem(REPORT_DATE_KEY, date);
  }, []);

  const setPeriodFrom = useCallback(
    (date: string) => {
      runPeriodUpdate(() => {
        setPeriodFromState(date);
        if (date) localStorage.setItem(PERIOD_FROM_KEY, date);
        else localStorage.removeItem(PERIOD_FROM_KEY);
      });
    },
    [runPeriodUpdate],
  );

  const setPeriodTo = useCallback(
    (date: string) => {
      runPeriodUpdate(() => {
        setPeriodToState(date);
        if (date) localStorage.setItem(PERIOD_TO_KEY, date);
        else localStorage.removeItem(PERIOD_TO_KEY);
      });
    },
    [runPeriodUpdate],
  );

  const clearPeriod = useCallback(() => {
    runPeriodUpdate(() => {
      setPeriodFromState("");
      setPeriodToState("");
      localStorage.removeItem(PERIOD_FROM_KEY);
      localStorage.removeItem(PERIOD_TO_KEY);
    });
  }, [runPeriodUpdate]);

  const filteredComplaints = useMemo(
    () =>
      complaints.filter((c) => inNotifiedPeriod(c, periodFrom, periodTo)),
    [complaints, periodFrom, periodTo],
  );

  const upsertComplaint = useCallback(async (input: ComplaintInput) => {
    const item = await apiUpsertComplaint(input);
    setComplaints((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      return exists
        ? prev.map((c) => (c.id === item.id ? item : c))
        : [...prev, item];
    });
  }, []);

  const addComplaints = useCallback(async (inputs: ComplaintInput[]) => {
    const items = await apiAddComplaints(inputs);
    setComplaints((prev) => [...prev, ...items]);
    return items.length;
  }, []);

  const deleteComplaint = useCallback(async (id: string) => {
    await apiDeleteComplaint(id);
    setComplaints((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const resetSeed = useCallback(async () => {
    const items = await apiResetSeed();
    setComplaints(items);
  }, []);

  const departmentStatus = useMemo(
    () => buildDepartmentStatus(filteredComplaints),
    [filteredComplaints],
  );
  const summary = useMemo(
    () => buildSummaryReport(filteredComplaints, reportDate),
    [filteredComplaints, reportDate],
  );
  const daily = useMemo(
    () => buildDailyReport(filteredComplaints, reportDate),
    [filteredComplaints, reportDate],
  );

  const value = useMemo(
    () => ({
      complaints,
      filteredComplaints,
      storeLoading,
      storeError,
      reportDate,
      setReportDate,
      periodFrom,
      periodTo,
      setPeriodFrom,
      setPeriodTo,
      clearPeriod,
      periodLoading,
      upsertComplaint,
      addComplaints,
      deleteComplaint,
      resetSeed,
      departmentStatus,
      summary,
      daily,
    }),
    [
      complaints,
      filteredComplaints,
      storeLoading,
      storeError,
      reportDate,
      setReportDate,
      periodFrom,
      periodTo,
      setPeriodFrom,
      setPeriodTo,
      clearPeriod,
      periodLoading,
      upsertComplaint,
      addComplaints,
      deleteComplaint,
      resetSeed,
      departmentStatus,
      summary,
      daily,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useComplaintStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("ComplaintProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
