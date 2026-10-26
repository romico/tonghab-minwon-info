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
  apiLoginTotp,
  apiLogout,
  apiMe,
  apiRefreshSession,
  type AuthSession,
  type AuthUser,
  type LoginTotpChallenge,
  type VaultStatus,
} from "@/api/auth";
import { ApiError, setUnauthorizedHandler } from "@/api/client";

interface AuthValue {
  user: AuthUser | null;
  expiresAt: string | null;
  ttlMinutes: number | null;
  vault: VaultStatus | null;
  authLoading: boolean;
  authError: string | null;
  authWarning: string | null;
  /** 비밀번호 단계. 2FA 필요 시 challenge 반환 */
  login: (
    username: string,
    password: string,
  ) => Promise<LoginTotpChallenge | void>;
  completeTotpLogin: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  applySession: (session: AuthSession) => void;
  clearAuthWarning: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number | null>(null);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authWarning, setAuthWarning] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  const applySession = useCallback((session: AuthSession) => {
    setUser(session.user);
    setExpiresAt(session.expiresAt);
    setTtlMinutes(session.ttlMinutes);
    setVault(session.vault ?? null);
    setAuthError(null);
    if (session.warning) setAuthWarning(session.warning);
  }, []);

  const clearAuthWarning = useCallback(() => setAuthWarning(null), []);

  const clearSession = useCallback(() => {
    setUser(null);
    setExpiresAt(null);
    setTtlMinutes(null);
    setVault(null);
    setAuthWarning(null);
  }, []);

  const expireSession = useCallback(() => {
    if (!userRef.current) return;
    setAuthError("세션이 만료되었습니다. 다시 로그인해 주세요.");
    clearSession();
  }, [clearSession]);

  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    const job = (async () => {
      const session = await apiRefreshSession();
      applySession(session);
    })().finally(() => {
      refreshPromise.current = null;
    });
    refreshPromise.current = job;
    return job;
  }, [applySession]);

  useEffect(() => {
    setUnauthorizedHandler(expireSession);
    return () => setUnauthorizedHandler(null);
  }, [expireSession]);

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

  useEffect(() => {
    if (refreshTimer.current != null) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (!user || !expiresAt) return;

    const ms = new Date(expiresAt).getTime() - Date.now() - 60_000;
    const delay = Math.max(5_000, ms);
    refreshTimer.current = window.setTimeout(() => {
      void refresh().catch((err) => {
        if (err instanceof ApiError && err.status === 401) expireSession();
        else clearSession();
      });
    }, delay);

    return () => {
      if (refreshTimer.current != null) {
        window.clearTimeout(refreshTimer.current);
      }
    };
  }, [user, expiresAt, refresh, clearSession, expireSession]);

  useEffect(() => {
    if (!user || !expiresAt) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;
      if (new Date(expiresAt).getTime() > Date.now()) return;
      void refresh().catch((err) => {
        if (stopped) return;
        if (err instanceof ApiError && err.status === 401) expireSession();
        else clearSession();
      });
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user, expiresAt, refresh, clearSession, expireSession]);

  useEffect(() => {
    if (!user || !expiresAt || !ttlMinutes) return;

    const onActivity = () => {
      const remainMs = new Date(expiresAt).getTime() - Date.now();
      const half = (ttlMinutes * 60_000) / 2;
      if (remainMs < half) {
        void refresh().catch((err) => {
          if (err instanceof ApiError && err.status === 401) expireSession();
          else clearSession();
        });
      }
    };

    window.addEventListener("click", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [user, expiresAt, ttlMinutes, refresh, clearSession, expireSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await apiLogin(username, password);
      if ("requiresTotp" in result && result.requiresTotp === true) {
        return result;
      }
      applySession(result as AuthSession);
    },
    [applySession],
  );

  const completeTotpLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const session = await apiLoginTotp(challengeToken, code);
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
      vault,
      authLoading,
      authError,
      authWarning,
      login,
      completeTotpLogin,
      logout,
      refresh,
      applySession,
      clearAuthWarning,
    }),
    [
      user,
      expiresAt,
      ttlMinutes,
      vault,
      authLoading,
      authError,
      authWarning,
      login,
      completeTotpLogin,
      logout,
      refresh,
      applySession,
      clearAuthWarning,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
