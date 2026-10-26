export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/** 로그인된 상태에서 세션이 끊기면 호출된다. 로그인 실패 401은 여기 오지 않는다. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    if (res.status === 401 && data.code === "UNAUTHENTICATED") {
      onUnauthorized?.();
    }
    throw new ApiError(data.error ?? `요청 실패 (${res.status})`, res.status);
  }
  return data;
}
