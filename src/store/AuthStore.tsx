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
  apiLogin,
  apiLogout,
  apiMe,
  apiRefreshSession,
  type AuthSession,
  type AuthUser,
} from "@/api/auth";
import { ApiError } from "@/api/client";

interface AuthValue {
  user: AuthUser | null;
  expiresAt: string | null;
  ttlMinutes: number | null;
  authLoading: boolean;
  authError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  applySession: (session: AuthSession) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const applySession = useCallback((session: AuthSession) => {
    setUser(session.user);
    setExpiresAt(session.expiresAt);
    setTtlMinutes(session.ttlMinutes);
    setAuthError(null);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setExpiresAt(null);
    setTtlMinutes(null);
  }, []);

  const refresh = useCallback(async () => {
    const session = await apiRefreshSession();
    applySession(session);
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAuthLoading(true);
      try {
        const session = await apiMe();
        if (!cancelled) applySession(session);
      } catch (err) {
        if (!cancelled) {
          clearSession();
          if (!(err instanceof ApiError && err.status === 401)) {
            setAuthError(
              err instanceof Error ? err.message : "인증 확인 실패",
            );
          }
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  // 만료 60초 전 자동 갱신
  useEffect(() => {
    if (refreshTimer.current != null) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (!user || !expiresAt) return;

    const ms = new Date(expiresAt).getTime() - Date.now() - 60_000;
    const delay = Math.max(5_000, ms);
    refreshTimer.current = window.setTimeout(() => {
      void refresh().catch(() => {
        clearSession();
      });
    }, delay);

    return () => {
      if (refreshTimer.current != null) {
        window.clearTimeout(refreshTimer.current);
      }
    };
  }, [user, expiresAt, refresh, clearSession]);

  // 사용자 활동 시 남은 시간이 절반 이하면 갱신
  useEffect(() => {
    if (!user || !expiresAt || !ttlMinutes) return;

    const onActivity = () => {
      const remainMs = new Date(expiresAt).getTime() - Date.now();
      const half = (ttlMinutes * 60_000) / 2;
      if (remainMs > 0 && remainMs < half) {
        void refresh().catch(() => clearSession());
      }
    };

    window.addEventListener("click", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [user, expiresAt, ttlMinutes, refresh, clearSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const session = await apiLogin(username, password);
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      expiresAt,
      ttlMinutes,
      authLoading,
      authError,
      login,
      logout,
      refresh,
      applySession,
    }),
    [
      user,
      expiresAt,
      ttlMinutes,
      authLoading,
      authError,
      login,
      logout,
      refresh,
      applySession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
