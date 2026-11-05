import { useEffect, useState } from "react";
import type {
  AuthSession,
  CreateUserPayload,
  PermissionCode,
  PermissionDefinition,
  SecurityQuestionView,
  UpdateUserPayload,
  UserSummary
} from "@common/contracts";
import { canManageTargetUser, hasPermission } from "./permissions";

export function UserManagementPage({ authSession }: { authSession: AuthSession }): JSX.Element {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [permissionDefs, setPermissionDefs] = useState<PermissionDefinition[]>([]);
  const [message, setMessage] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [changePasswordMessage, setChangePasswordMessage] = useState("");
  const [recoverMessage, setRecoverMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [recoverModalOpen, setRecoverModalOpen] = useState(false);
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [recoverSubmitting, setRecoverSubmitting] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [recoverQuestions, setRecoverQuestions] = useState<SecurityQuestionView[]>([]);
  const [recoverAnswers, setRecoverAnswers] = useState(["", "", ""]);
  const [recoverNewPassword, setRecoverNewPassword] = useState("");

  const [createForm, setCreateForm] = useState<CreateUserPayload>({
    userName: "",
    displayName: "",
    role: "bookkeeper",
    password: "",
    permissions: []
  });

  const [updateForm, setUpdateForm] = useState<UpdateUserPayload>({ userId: 0, permissions: [] });

  const canShowUserList = authSession.role === "admin" || authSession.role === "supervisor";
  const canCreateSupervisor = authSession.role === "admin";
  const canCreateBookkeeper = authSession.role === "admin" || hasPermission(authSession, "create_bookkeeper");
  const canOpenCreateModal = canShowUserList && (canCreateSupervisor || canCreateBookkeeper);

  const refresh = async (): Promise<void> => {
    const [nextUsers, nextDefs] = await Promise.all([
      window.openAccountancy.listUsers(),
      window.openAccountancy.getPermissionDefinitions()
    ]);
    setUsers(nextUsers);
    setPermissionDefs(nextDefs);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!createModalOpen && !changePasswordModalOpen && !recoverModalOpen) {
      return;
    }

    const onEsc = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (recoverModalOpen) {
          setRecoverModalOpen(false);
          return;
        }

        if (changePasswordModalOpen) {
          setChangePasswordModalOpen(false);
          return;
        }

        setCreateModalOpen(false);
      }
    };

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [changePasswordModalOpen, createModalOpen, recoverModalOpen]);

  useEffect(() => {
    if (!recoverModalOpen) {
      return;
    }

    void window.openAccountancy.getRecoverSecurityQuestions().then((items) => {
      setRecoverQuestions(items);
    });
  }, [recoverModalOpen]);

  const togglePermission = (
    current: PermissionCode[],
    code: PermissionCode,
    setter: (next: PermissionCode[]) => void
  ): void => {
    if (current.includes(code)) {
      setter(current.filter((item) => item !== code));
      return;
    }
    setter([...current, code]);
  };

  const selectedUser = users.find((item) => item.userId === selectedUserId) ?? null;
  const visibleUsers =
    authSession.role === "admin"
      ? users
      : users.filter((item) => item.role === "bookkeeper" && item.managedByUserId === authSession.userId);

  const canEditSelectedUser =
    selectedUser !== null &&
    (authSession.role === "admin" ||
      canManageTargetUser(authSession, { role: selectedUser.role, managedByUserId: selectedUser.managedByUserId }, "update"));
  const canDeleteSelectedUser =
    selectedUser !== null &&
    (authSession.role === "admin" ||
      canManageTargetUser(authSession, { role: selectedUser.role, managedByUserId: selectedUser.managedByUserId }, "delete"));

  const createPermissionDefs = permissionDefs.filter((permission) => {
    if (createForm.role === "supervisor") {
      return permission.code.includes("supervisor") || permission.code.includes("voucher");
    }

    return permission.code.includes("bookkeeper") || permission.code.includes("voucher");
  });

  const applyCreate = async (): Promise<void> => {
    const result = await window.openAccountancy.createUser(createForm);
    setCreateMessage(result.message);
    if (result.ok) {
      setMessage(result.message);
      setCreateForm({ userName: "", displayName: "", role: "bookkeeper", password: "", permissions: [] });
      setCreateModalOpen(false);
      await refresh();
    }
  };

  const applyUpdate = async (): Promise<void> => {
    if (!selectedUser) {
      return;
    }

    const result = await window.openAccountancy.updateUser({
      userId: selectedUser.userId,
      displayName: updateForm.displayName,
      isActive: updateForm.isActive,
      permissions: updateForm.permissions,
      password: updateForm.password
    });
    setMessage(result.message);
    if (result.ok) {
      await refresh();
    }
  };

  const applyDelete = async (): Promise<void> => {
    if (!selectedUser) {
      return;
    }

    const result = await window.openAccountancy.deleteUser({ userId: selectedUser.userId });
    setMessage(result.message);
    if (result.ok) {
      setSelectedUserId(null);
      await refresh();
    }
  };

  const applyChangePassword = async (): Promise<void> => {
    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setChangePasswordMessage("请完整填写旧密码与新密码。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordMessage("两次输入的新密码不一致。");
      return;
    }

    setChangePasswordSubmitting(true);
    try {
      const result = await window.openAccountancy.changeOwnPassword({ oldPassword, newPassword });
      setChangePasswordMessage(result.message);
      if (result.ok) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } finally {
      setChangePasswordSubmitting(false);
    }
  };

  const applyRecoverPassword = async (): Promise<void> => {
    if (recoverAnswers.some((value) => !value.trim()) || !recoverNewPassword.trim()) {
      setRecoverMessage("请填写 3 个密保答案并输入新密码。");
      return;
    }

    setRecoverSubmitting(true);
    try {
      const result = await window.openAccountancy.recoverAccount({ answers: recoverAnswers, newPassword: recoverNewPassword });
      setRecoverMessage(result.ok ? `找回成功：${result.userName ?? ""}` : result.message);
      if (result.ok) {
        setRecoverAnswers(["", "", ""]);
        setRecoverNewPassword("");
      }
    } finally {
      setRecoverSubmitting(false);
    }
  };

  return (
    <section className="panel page-panel">
      <header>
        <h1>用户管理</h1>
        <p>当前登录：{authSession.displayName || authSession.userName}（{authSession.role ?? "未登录"}）</p>
      </header>

      <div className="panel settings-password-panel">
        <h2>账户安全</h2>
        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setChangePasswordMessage("");
              setOldPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setChangePasswordModalOpen(true);
            }}
          >
            修改密码
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setRecoverMessage("");
              setRecoverAnswers(["", "", ""]);
              setRecoverNewPassword("");
              setRecoverModalOpen(true);
            }}
          >
            找回密码
          </button>
        </div>
      </div>

      {canShowUserList ? (
        <div className="panel">
          <div className="user-list-header">
            <h2>账户列表</h2>
            {canOpenCreateModal ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setCreateMessage("");
                  setCreateModalOpen(true);
                }}
              >
                创建用户
              </button>
            ) : null}
          </div>

          <div className="user-table-wrapper">
            <table className="user-table">
              <thead>
                <tr>
                  <th>选择</th>
                  <th>用户名</th>
                  <th>显示名</th>
                  <th>角色</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.userId}>
                    <td>
                      <input
                        type="radio"
                        checked={selectedUserId === user.userId}
                        onChange={() => {
                          setSelectedUserId(user.userId);
                          setUpdateForm({
                            userId: user.userId,
                            displayName: user.displayName,
                            isActive: user.isActive,
                            permissions: user.permissions,
                            password: ""
                          });
                        }}
                      />
                    </td>
                    <td>{user.userName}</td>
                    <td>{user.displayName}</td>
                    <td>{user.role}</td>
                    <td>{user.isActive ? "启用" : "禁用"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedUser ? (
            <div className="user-edit-panel">
              <h3>编辑用户：{selectedUser.userName}</h3>
              <div className="form-grid">
                <label>
                  显示名称
                  <input
                    type="text"
                    value={updateForm.displayName ?? ""}
                    onChange={(e) => setUpdateForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  />
                </label>
                <label>
                  新密码（可留空）
                  <input
                    type="password"
                    value={updateForm.password ?? ""}
                    onChange={(e) => setUpdateForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </label>
                <label>
                  启用状态
                  <select
                    value={updateForm.isActive ? "1" : "0"}
                    onChange={(e) => setUpdateForm((prev) => ({ ...prev, isActive: e.target.value === "1" }))}
                  >
                    <option value="1">启用</option>
                    <option value="0">禁用</option>
                  </select>
                </label>
              </div>

              <div className="permission-check-grid">
                {permissionDefs.map((permission) => (
                  <label key={`update-${permission.code}`} className="permission-check-item">
                    <input
                      type="checkbox"
                      checked={(updateForm.permissions ?? []).includes(permission.code)}
                      onChange={() =>
                        togglePermission(updateForm.permissions ?? [], permission.code, (next) =>
                          setUpdateForm((prev) => ({ ...prev, permissions: next }))
                        )
                      }
                    />
                    {permission.name}
                  </label>
                ))}
              </div>

              <div className="auth-actions">
                <button type="button" className="btn btn-primary" disabled={!canEditSelectedUser} onClick={() => void applyUpdate()}>
                  保存修改
                </button>
                <button type="button" className="btn" disabled={!canDeleteSelectedUser} onClick={() => void applyDelete()}>
                  删除用户
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="panel">
          <h2>用户设置</h2>
          <p>记账员账户仅显示个人安全设置与授权业务入口。</p>
        </div>
      )}

      {message ? <p className="auth-hint">{message}</p> : null}

      {createModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="创建用户" onClick={(e) => e.stopPropagation()}>
            <h2>新建账户</h2>
            <div className="form-grid">
              <label>
                用户名
                <input
                  type="text"
                  value={createForm.userName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, userName: e.target.value }))}
                />
              </label>
              <label>
                显示名称
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))}
                />
              </label>
              <label>
                角色
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, role: e.target.value as CreateUserPayload["role"], permissions: [] }))
                  }
                >
                  {canCreateSupervisor ? <option value="supervisor">账务主管</option> : null}
                  {canCreateBookkeeper ? <option value="bookkeeper">记账员</option> : null}
                </select>
              </label>
              <label>
                初始密码
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                />
              </label>
            </div>

            <div className="permission-check-grid">
              {createPermissionDefs.map((permission) => (
                <label key={`create-${permission.code}`} className="permission-check-item">
                  <input
                    type="checkbox"
                    checked={createForm.permissions.includes(permission.code)}
                    onChange={() =>
                      togglePermission(createForm.permissions, permission.code, (next) =>
                        setCreateForm((prev) => ({ ...prev, permissions: next }))
                      )
                    }
                  />
                  {permission.name}
                </label>
              ))}
            </div>

            {createMessage ? <p className="auth-hint">{createMessage}</p> : null}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!createForm.userName || !createForm.password}
                onClick={() => void applyCreate()}
              >
                创建用户
              </button>
              <button type="button" className="btn" onClick={() => setCreateModalOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {changePasswordModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setChangePasswordModalOpen(false)}>
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="修改密码" onClick={(e) => e.stopPropagation()}>
            <h2>修改密码</h2>
            <div className="form-grid">
              <label>
                旧密码
                <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
              </label>
              <label>
                新密码
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label>
                再次输入新密码
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
            </div>
            {changePasswordMessage ? <p className="auth-hint">{changePasswordMessage}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={changePasswordSubmitting} onClick={() => void applyChangePassword()}>
                {changePasswordSubmitting ? "处理中..." : "确定"}
              </button>
              <button type="button" className="btn" onClick={() => setChangePasswordModalOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {recoverModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRecoverModalOpen(false)}>
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="找回密码" onClick={(e) => e.stopPropagation()}>
            <h2>找回密码</h2>
            <div className="form-grid">
              {(recoverQuestions.length > 0
                ? recoverQuestions
                : [{ ordinal: 1, question: "密保问题" }, { ordinal: 2, question: "密保问题" }, { ordinal: 3, question: "密保问题" }]
              ).map((item, idx) => (
                <label key={`settings-recover-q-${item.ordinal}`}>
                  密保问题 {item.ordinal}：{item.question}
                  <input
                    type="text"
                    value={recoverAnswers[idx] ?? ""}
                    onChange={(e) => {
                      const next = [...recoverAnswers];
                      next[idx] = e.target.value;
                      setRecoverAnswers(next);
                    }}
                  />
                </label>
              ))}
              <label>
                设置新密码
                <input type="password" value={recoverNewPassword} onChange={(e) => setRecoverNewPassword(e.target.value)} />
              </label>
            </div>
            {recoverMessage ? <p className="auth-hint">{recoverMessage}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={recoverSubmitting} onClick={() => void applyRecoverPassword()}>
                {recoverSubmitting ? "处理中..." : "确定"}
              </button>
              <button type="button" className="btn" onClick={() => setRecoverModalOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
