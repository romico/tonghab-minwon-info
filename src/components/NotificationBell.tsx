import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  apiListNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  type AppNotification,
} from "@/api/notifications";

type PanelPos = { top: number; left: number; width: number };

export function NotificationBell() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiListNotifications(30);
      setUnread(res.unread);
      setItems(res.items);
    } catch {
      /* 세션 만료 등은 AuthStore가 처리 */
    }
  }, []);

  const updatePos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(320, Math.max(260, window.innerWidth - 24));
    let left = rect.right + 12;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, rect.left);
    }
    const estimatedHeight = Math.min(420, window.innerHeight * 0.7);
    let top = rect.bottom - estimatedHeight;
    if (top < 12) top = 12;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const onResize = () => updatePos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, updatePos, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  async function onOpenItem(n: AppNotification) {
    try {
      const res = await apiMarkNotificationRead(n.id);
      setUnread(res.unread);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch {
      await refresh();
    }
    setOpen(false);
    if (n.complaintId) {
      navigate(`/ledger?edit=${encodeURIComponent(n.complaintId)}`);
    }
  }

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="notif-panel"
            role="dialog"
            aria-label="알림 목록"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
            }}
          >
            <div className="notif-panel-head">
              <div className="notif-panel-title">
                <strong>알림</strong>
                {unread > 0 && (
                  <span className="notif-panel-unread">{unread}건</span>
                )}
              </div>
              <button
                type="button"
                className="notif-mark-all"
                disabled={items.length === 0}
                onClick={() =>
                  void apiMarkAllNotificationsRead().then(() => {
                    setItems([]);
                    setUnread(0);
                  })
                }
              >
                모두 확인
              </button>
            </div>
            {items.length === 0 ? (
              <div className="notif-empty">
                <p>새 알림이 없습니다.</p>
                <span>담당자로 지정되면 여기에 표시됩니다.</span>
              </div>
            ) : (
              <ul className="notif-list">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`notif-item${n.readAt ? "" : " is-unread"}`}
                      onClick={() => void onOpenItem(n)}
                    >
                      <span className="notif-item-msg">{n.message}</span>
                      <time dateTime={n.createdAt}>
                        {new Date(n.createdAt).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`notif-bell${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="notif-bell-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `알림 ${unread}건` : "알림"}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
      >
        <span className="notif-bell-label">알림</span>
        {unread > 0 ? (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        ) : (
          <span className="notif-bell-empty-mark" aria-hidden>
            0
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
