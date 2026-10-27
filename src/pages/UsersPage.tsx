import { useCallback, useEffect, useMemo, useState } from "react";
import type { Permission } from "@/api/auth";
import {
  apiCreateUser,
  apiListUsers,
  apiPermissionCatalog,
  apiResetUserPassword,
  apiUpdateUser,
  type ManagedUser,
} from "@/api/users";
import { ApiError } from "@/api/client";

function PermissionPicker({
  catalog,
  value,
  onChange,
}: {
  catalog: Array<{ id: Permission; label: string }>;
  value: Permission[];
  onChange: (next: Permission[]) => void;
}) {
  const menuPerms = catalog.filter((p) => p.id.startsWith("menu."));
  const actionPerms = catalog.filter((p) => !p.id.startsWith("menu."));

  function toggle(id: Permission) {
    onChange(
      value.includes(id) ? value.filter((p) => p !== id) : [...value, id],
    );
  }

  return (
    <div className="perm-picker">
      <div className="perm-group">
        <h3 className="perm-group-title">메뉴</h3>
        <div className="perm-grid">
          {menuPerms.map((p) => (
            <label key={p.id} className="check-row">
              <input
                type="checkbox"
                checked={value.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="perm-group">
        <h3 className="perm-group-title">동작</h3>
        <div className="perm-grid">
          {actionPerms.map((p) => (
            <label key={p.id} className="check-row">
              <input
                type="checkbox"
                checked={value.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [catalog, setCatalog] = useState<
    Array<{ id: Permission; label: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [newPerms, setNewPerms] = useState<Permission[]>([]);

  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [list, cat] = await Promise.all([
        apiListUsers(),
        apiPermissionCatalog(),
      ]);
      setUsers(list);
      setCatalog(cat);
      setEditing((prev) => {
        if (!prev) return null;
        return list.find((u) => u.id === prev.id) ?? null;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, busy]);

  const activeCount = useMemo(
    () => users.filter((u) => u.isActive).length,
    [users],
  );

  function openEdit(user: ManagedUser) {
    setEditing({ ...user, permissions: [...user.permissions] });
    setModalError(null);
    setResetPassword("");
    setResetPassword2("");
    setOkMsg(null);
  }

  function closeModal() {
    if (busy) return;
    setEditing(null);
    setModalError(null);
    setResetPassword("");
    setResetPassword2("");
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiCreateUser({
        username,
        displayName: displayName || username,
        password,
        permissions: newPerms,
      });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setNewPerms([]);
      setOkMsg(
        "계정을 만들었습니다. 최초 로그인 시 비밀번호 변경이 필요합니다.",
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEditing() {
    if (!editing) return;
    setBusy(true);
    setModalError(null);
    setOkMsg(null);
    try {
      await apiUpdateUser(editing.id, {
        displayName: editing.displayName,
        isActive: editing.isActive,
        permissions: editing.permissions,
      });
      setOkMsg(`${editing.username} 설정을 저장했습니다.`);
      await reload();
      setEditing(null);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword() {
    if (!editing) return;
    if (resetPassword.length < 4) {
      setModalError("새 비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (resetPassword === "admin") {
      setModalError("기본 비밀번호(admin)는 사용할 수 없습니다.");
      return;
    }
    if (resetPassword !== resetPassword2) {
      setModalError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setModalError(null);
    setOkMsg(null);
    try {
      await apiResetUserPassword(editing.id, resetPassword);
      setOkMsg(
        `${editing.username} 비밀번호를 재설정했습니다. 다음 로그인 때 변경이 필요합니다.`,
      );
      setResetPassword("");
      setResetPassword2("");
      await reload();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page users-page">
      <header className="page-header">
        <div>
          <h1>계정·권한</h1>
          <p>사용자를 추가하고 메뉴·동작 권한을 지정합니다.</p>
        </div>
        <span className="badge">
          활성 {activeCount}/{users.length}
        </span>
      </header>

      {error && <p className="form-error">{error}</p>}
      {okMsg && <p className="form-ok">{okMsg}</p>}

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>새 계정</h2>
        </div>
        <div className="panel-body settings-panel-body">
          <p className="settings-lead">
            초기 비밀번호는 4자 이상이며, 첫 로그인 때 변경을 강제합니다. 권한은
            메뉴 노출과 API 동작을 함께 제한합니다.
          </p>
          <form className="users-create-form" onSubmit={onCreate}>
            <div className="form-grid users-form-grid">
              <label className="field">
                아이디
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="영문·숫자·._-"
                  autoComplete="off"
                />
              </label>
              <label className="field">
                표시 이름
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="예: 민원담당"
                  autoComplete="off"
                />
              </label>
              <label className="field">
                초기 비밀번호
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <PermissionPicker
              catalog={catalog}
              value={newPerms}
              onChange={setNewPerms}
            />
            <div className="row-actions">
              <button type="submit" className="btn primary" disabled={busy}>
                계정 만들기
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>등록된 계정</h2>
          <span className="badge">{users.length}명</span>
        </div>
        <div className="panel-body">
          {users.length === 0 ? (
            <div className="empty">등록된 계정이 없습니다.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table users-table">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>표시 이름</th>
                    <th>상태</th>
                    <th>2FA</th>
                    <th>비밀번호</th>
                    <th>권한</th>
                    <th>등록일</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={`users-row${u.isActive ? "" : " is-inactive"}`}
                      onClick={() => openEdit(u)}
                    >
                      <td>
                        <strong>{u.username}</strong>
                      </td>
                      <td>{u.displayName}</td>
                      <td>
                        <span
                          className={`badge${u.isActive ? " done" : ""}`}
                        >
                          {u.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td>{u.totpEnabled ? "사용" : "미사용"}</td>
                      <td>
                        {u.mustChangePassword ? (
                          <span className="badge pending">변경 필요</span>
                        ) : (
                          "정상"
                        )}
                      </td>
                      <td className="num">{u.permissions.length}</td>
                      <td>{formatCreatedAt(u.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(u);
                          }}
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editing && (
        <div
          className="settings-confirm-backdrop"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="settings-confirm-dialog users-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="users-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="users-edit-title">계정 수정 · {editing.username}</h3>
            <p>
              표시 이름·활성·권한을 저장하거나, 임시 비밀번호로 재설정할 수
              있습니다. 재설정 후 해당 계정은 다시 로그인해야 하며 비밀번호
              변경이 강제됩니다.
            </p>

            {modalError && (
              <p className="settings-alert is-error">{modalError}</p>
            )}

            <div className="form-grid users-form-grid users-edit-fields">
              <label className="field span-2">
                표시 이름
                <input
                  value={editing.displayName}
                  onChange={(e) =>
                    setEditing({ ...editing, displayName: e.target.value })
                  }
                />
              </label>
              <label className="check-row user-active-toggle field">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) =>
                    setEditing({ ...editing, isActive: e.target.checked })
                  }
                />
                <span>활성</span>
              </label>
            </div>

            <PermissionPicker
              catalog={catalog}
              value={editing.permissions}
              onChange={(permissions) =>
                setEditing({ ...editing, permissions })
              }
            />

            <div className="users-reset-box">
              <h4>비밀번호 재설정</h4>
              <p className="muted">
                임시 비밀번호를 알려 준 뒤, 대상이 로그인하면 즉시 변경하도록
                안내하세요.
              </p>
              <div className="form-grid users-form-grid">
                <label className="field">
                  임시 비밀번호
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    minLength={4}
                    autoComplete="new-password"
                  />
                </label>
                <label className="field">
                  비밀번호 확인
                  <input
                    type="password"
                    value={resetPassword2}
                    onChange={(e) => setResetPassword2(e.target.value)}
                    minLength={4}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy || !resetPassword}
                onClick={() => void onResetPassword()}
              >
                비밀번호 재설정
              </button>
            </div>

            <div className="settings-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={closeModal}
                disabled={busy}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void saveEditing()}
              >
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
