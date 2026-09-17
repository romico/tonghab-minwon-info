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
import { resolveImportInput } from "@/import/importMatch";
import {
  buildDailyReport,
  buildDepartmentStatus,
  buildSummaryReport,
  normalizeComplaint,
  stripComplaintMedia,
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

export type ImportJobStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export type ImportJobState = {
  status: ImportJobStatus;
  current: number;
  total: number;
  created: number;
  updated: number;
  detail: string;
  message: string | null;
  error: string | null;
  startedAt: number | null;
};

const IDLE_IMPORT_JOB: ImportJobState = {
  status: "idle",
  current: 0,
  total: 0,
  created: 0,
  updated: 0,
  detail: "",
  message: null,
  error: null,
  startedAt: null,
};

interface StoreValue {
  complaints: Complaint[];
  filteredComplaints: Complaint[];
  /** SQLite API 최초 로딩 */
  storeLoading: boolean;
  storeError: string | null;
  refreshComplaints: () => Promise<void>;
  reportDate: string;
  setReportDate: (date: string) => void;
  periodFrom: string;
  periodTo: string;
  setPeriodFrom: (date: string) => void;
  setPeriodTo: (date: string) => void;
  clearPeriod: () => void;
  periodLoading: boolean;
  upsertComplaint: (input: ComplaintInput) => Promise<void>;
  addComplaints: (
    inputs: ComplaintInput[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{ count: number; created: number; updated: number }>;
  /** 페이지 이동과 무관하게 건별 등록을 이어가는 백그라운드 job */
  importJob: ImportJobState;
  startImportJob: (inputs: ComplaintInput[]) => boolean;
  cancelImportJob: () => void;
  dismissImportJob: () => void;
  deleteComplaint: (id: string) => Promise<void>;
  resetSeed: (password: string, totpCode?: string) => Promise<void>;
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
  const [importJob, setImportJob] = useState<ImportJobState>(IDLE_IMPORT_JOB);
  const periodLoadTimer = useRef<number | null>(null);
  const complaintsRef = useRef<Complaint[]>([]);
  const importRunningRef = useRef(false);
  const importCancelRef = useRef(false);
  complaintsRef.current = complaints;

  const applySavedComplaint = useCallback((item: Complaint) => {
    setComplaints((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      const next = exists
        ? prev.map((c) => (c.id === item.id ? item : c))
        : [...prev, item];
      complaintsRef.current = next;
      return next;
    });
  }, []);

  const registerOneComplaint = useCallback(
    async (input: ComplaintInput) => {
      const resolved = resolveImportInput(complaintsRef.current, input);
      const items = await apiAddComplaints([resolved.input]);
      const raw = items[0];
      if (!raw?.id) {
        throw new Error("등록 응답에 민원 ID가 없습니다.");
      }
      // 목록 상태에는 사진 본문을 넣지 않아 대량 등록 시 메모리 폭주를 막는다.
      const item = stripComplaintMedia(normalizeComplaint(raw));
      applySavedComplaint(item);
      return { item, action: resolved.action as "create" | "update" };
    },
    [applySavedComplaint],
  );

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

  const refreshComplaints = useCallback(async () => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const list = await apiListComplaints();
      setComplaints(list);
    } catch (err) {
      setStoreError(
        err instanceof Error
          ? err.message
          : "데이터를 새로고침하지 못했습니다.",
      );
      throw err;
    } finally {
      setStoreLoading(false);
    }
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
    applySavedComplaint(item);
  }, [applySavedComplaint]);

  const addComplaints = useCallback(
    async (
      inputs: ComplaintInput[],
      onProgress?: (done: number, total: number) => void,
    ) => {
      let created = 0;
      let updated = 0;
      const saved: Complaint[] = [];
      for (let i = 0; i < inputs.length; i++) {
        const { item, action } = await registerOneComplaint(inputs[i]!);
        saved.push(item);
        if (action === "update") updated += 1;
        else created += 1;
        onProgress?.(i + 1, inputs.length);
      }
      return { count: saved.length, created, updated };
    },
    [registerOneComplaint],
  );

  const dismissImportJob = useCallback(() => {
    if (importRunningRef.current) return;
    setImportJob(IDLE_IMPORT_JOB);
  }, []);

  const cancelImportJob = useCallback(() => {
    if (!importRunningRef.current) return;
    importCancelRef.current = true;
    setImportJob((prev) =>
      prev.status === "running"
        ? { ...prev, detail: "취소 요청… 현재 건 처리 후 중단합니다." }
        : prev,
    );
  }, []);

  const startImportJob = useCallback(
    (inputs: ComplaintInput[]) => {
      if (importRunningRef.current) return false;
      if (inputs.length === 0) return false;

      importRunningRef.current = true;
      importCancelRef.current = false;
      const startedAt = Date.now();
      setImportJob({
        status: "running",
        current: 0,
        total: inputs.length,
        created: 0,
        updated: 0,
        detail: "등록 준비…",
        message: null,
        error: null,
        startedAt,
      });

      void (async () => {
        let created = 0;
        let updated = 0;
        let done = 0;
        try {
          for (let i = 0; i < inputs.length; i++) {
            if (importCancelRef.current) {
              const parts = [`${done}/${inputs.length}건 반영 후 취소`];
              if (created > 0) parts.push(`신규 ${created}`);
              if (updated > 0) parts.push(`갱신 ${updated}`);
              setImportJob({
                status: "cancelled",
                current: done,
                total: inputs.length,
                created,
                updated,
                detail: "등록 취소됨",
                message: parts.join(" · "),
                error: null,
                startedAt,
              });
              return;
            }

            const { action } = await registerOneComplaint(inputs[i]!);
            if (action === "update") updated += 1;
            else created += 1;
            done = i + 1;
            const remaining = inputs.length - done;
            setImportJob({
              status: "running",
              current: done,
              total: inputs.length,
              created,
              updated,
              detail:
                remaining > 0
                  ? `남은 ${remaining}건`
                  : "마지막 건 반영 완료",
              message: null,
              error: null,
              startedAt,
            });
          }

          const parts = [`총 ${inputs.length}건 처리`];
          if (created > 0) parts.push(`신규 ${created}`);
          if (updated > 0) parts.push(`갱신 ${updated}`);
          try {
            const list = await apiListComplaints();
            setComplaints(list);
            complaintsRef.current = list;
          } catch (refreshErr) {
            console.warn("등록 후 목록 새로고침 실패", refreshErr);
          }
          const visible = complaintsRef.current.length;
          setImportJob({
            status: "done",
            current: inputs.length,
            total: inputs.length,
            created,
            updated,
            detail: "등록 완료",
            message: `${parts.join(" · ")} · 대장 ${visible}건 확인됨`,
            error: null,
            startedAt,
          });
        } catch (err) {
          console.error(err);
          setImportJob({
            status: "error",
            current: done,
            total: inputs.length,
            created,
            updated,
            detail: "등록 중단",
            message: null,
            error:
              err instanceof Error
                ? err.message
                : "백그라운드 등록에 실패했습니다.",
            startedAt,
          });
        } finally {
          importRunningRef.current = false;
          importCancelRef.current = false;
        }
      })();

      return true;
    },
    [registerOneComplaint],
  );

  const deleteComplaint = useCallback(async (id: string) => {
    await apiDeleteComplaint(id);
    setComplaints((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const resetSeed = useCallback(async (password: string, totpCode?: string) => {
    const items = await apiResetSeed(password, totpCode);
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
      refreshComplaints,
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
      importJob,
      startImportJob,
      cancelImportJob,
      dismissImportJob,
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
      refreshComplaints,
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
      importJob,
      startImportJob,
      cancelImportJob,
      dismissImportJob,
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
