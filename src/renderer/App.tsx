import { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AppShellState, RecentBookset, SystemEntryState } from "@common/contracts";
import { PlaceholderPage } from "@renderer/components/PlaceholderPage";
import { allNavItems, navSections } from "@renderer/config/navigation";

interface ShellContextState {
  shellState: AppShellState;
  recentBooksets: RecentBookset[];
  refreshShellData: () => Promise<void>;
}

const defaultEntryState: SystemEntryState = {
  hasDatabase: true,
  mode: "login"
};

const defaultShellState: AppShellState = {
  appName: "OpenAccountancy",
  version: "0.0.0",
  hasOpenedBookset: false,
  activeBooksetLabel: "未打开账套",
  todoItems: []
};

function EntryRoute({ mode }: { mode: SystemEntryState["mode"] }): JSX.Element {
  const target = mode === "init" ? "/auth/init" : "/auth/login";
  return <Navigate to={target} replace />;
}

function AuthStatus({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const dbStateText = hasDatabase ? t("auth.status.dbDetected") : t("auth.status.dbMissing");

  return (
    <div className="auth-state-row">
      <span className={`db-state ${hasDatabase ? "db-state-ok" : "db-state-warning"}`}>{dbStateText}</span>
    </div>
  );
}

function LoginFlowPage({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="auth-shell">
      <section className="panel auth-panel">
        <h1>{t("auth.login.title")}</h1>
        <p>{t("auth.login.description")}</p>
        <AuthStatus hasDatabase={hasDatabase} />
        <div className="form-grid">
          <label>
            {t("auth.username")}
            <input type="text" placeholder="请输入用户名" />
          </label>
          <label>
            {t("auth.password")}
            <input type="password" placeholder="请输入密码" />
          </label>
        </div>
        <p className="auth-hint auth-hint-warning">今日最多尝试 5 次，当前剩余 5 次。</p>
        <div className="auth-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/app/home")}>
            {t("auth.login.cta")}
          </button>
          {hasDatabase ? <Link to="/auth/recover">{t("auth.recoverAccount")}</Link> : null}
          <Link to="/auth/init">{t("auth.initializeSystem")}</Link>
        </div>
      </section>
    </main>
  );
}

function InitWizardPage({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="auth-shell">
      <section className="panel auth-panel auth-panel-wide">
        <h1>{t("auth.init.title")}</h1>
        <p>{t("auth.init.description")}</p>
        <AuthStatus hasDatabase={hasDatabase} />

        <ol className="auth-step-list">
          <li className="auth-step-item auth-step-item-active">1. 设置数据库路径</li>
          <li className="auth-step-item">2. 设置管理员账户</li>
          <li className="auth-step-item">3. 设置密保问题</li>
        </ol>

        <div className="form-grid">
          <label>
            数据库存储路径
            <input type="text" placeholder="例如：D:\\OpenAccountancyData\\openaccountancy.db" />
          </label>
          <label>
            管理员用户名
            <input type="text" placeholder="请输入管理员用户名" />
          </label>
          <label>
            管理员密码
            <input type="password" placeholder="请输入管理员密码" />
          </label>
        </div>

        <div className="security-qa-grid">
          <label>
            密保问题 1
            <input type="text" placeholder="请输入自定义问题" />
            <input type="text" placeholder="请输入答案" />
          </label>
          <label>
            密保问题 2
            <input type="text" placeholder="请输入自定义问题" />
            <input type="text" placeholder="请输入答案" />
          </label>
          <label>
            密保问题 3
            <input type="text" placeholder="请输入自定义问题" />
            <input type="text" placeholder="请输入答案" />
          </label>
        </div>

        <div className="auth-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/app/home")}>
            {t("auth.init.cta")}
          </button>
          <Link to="/auth/login">{t("common.login")}</Link>
        </div>
      </section>
    </main>
  );
}

function RecoverFlowPage({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="auth-shell">
      <section className="panel auth-panel auth-panel-wide">
        <h1>{t("auth.recover.title")}</h1>
        <p>{t("auth.recover.description")}</p>
        <AuthStatus hasDatabase={hasDatabase} />

        {!hasDatabase ? (
          <p className="auth-hint auth-hint-warning">当前未检测到数据库文件，无法执行账户找回。</p>
        ) : (
          <>
            <div className="form-grid">
              <label>
                密保问题 1：请填写答案
                <input type="text" placeholder="请输入答案" />
              </label>
              <label>
                密保问题 2：请填写答案
                <input type="text" placeholder="请输入答案" />
              </label>
              <label>
                密保问题 3：请填写答案
                <input type="text" placeholder="请输入答案" />
              </label>
              <label>
                校验通过后显示用户名
                <input type="text" placeholder="account_admin" disabled />
              </label>
              <label>
                设置新密码
                <input type="password" placeholder="请输入新密码" />
              </label>
            </div>
            <p className="auth-hint">密保答案与密码将以 SHA512 形式存储（业务逻辑待接入）。</p>
          </>
        )}

        <div className="auth-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate("/auth/login")}>
            {t("auth.recover.cta")}
          </button>
          <Link to="/auth/init">{t("auth.initializeSystem")}</Link>
        </div>
      </section>
    </main>
  );
}

interface ToolbarMenuItem {
  key: string;
  label: string;
}

function ToolbarDropdown({
  menuId,
  label,
  items,
  isOpen,
  onToggle,
  onClose,
  alignRight
}: {
  menuId: string;
  label: string;
  items: ToolbarMenuItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  alignRight?: boolean;
}): JSX.Element {
  const buttonId = `${menuId}-trigger`;
  const popupId = `${menuId}-menu`;

  return (
    <div className="toolbar-dropdown">
      <button
        id={buttonId}
        type="button"
        className="toolbar-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={popupId}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        {label}
      </button>
      <ul
        id={popupId}
        role="menu"
        aria-labelledby={buttonId}
        className={`toolbar-menu-list ${isOpen ? "toolbar-menu-list-open" : ""} ${alignRight ? "toolbar-menu-right" : ""}`}
      >
        {items.map((item) => (
          <li key={item.key} role="none">
            <button type="button" role="menuitem" className="toolbar-menu-item-btn" onClick={onClose}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HomePage({ shellState, recentBooksets }: ShellContextState): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="page-grid">
      <div className="panel hero-panel">
        <h1>{t("home.title", { appName: shellState.appName })}</h1>
        <p>
          {t("home.description")}
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" type="button">{t("home.openBookset")}</button>
          <button className="btn" type="button">{t("home.createBookset")}</button>
          <button className="btn" type="button">{t("home.importBookset")}</button>
          <button className="btn" type="button">{t("home.restoreBackup")}</button>
        </div>
      </div>

      <div className="panel two-col-card recent-bookset-card">
        <h2>{t("home.recentBooksets")}</h2>
        <div className="recent-bookset-scroll">
          {recentBooksets.length === 0 ? (
            <p>{t("home.noRecentBookset")}</p>
          ) : (
            <ul className="list-box">
              {recentBooksets.map((bookset) => (
                <li key={bookset.id}>
                  <strong>{bookset.name}</strong>
                  <span>{bookset.period}</span>
                  <small>{new Date(bookset.lastOpenedAt).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel two-col-card">
        <h2>{t("home.quickStart")}</h2>
        <ul>
          <li>{t("home.quickStartItems.wizard")}</li>
          <li>{t("home.quickStartItems.importHistory")}</li>
          <li>{t("home.quickStartItems.voucherShortcuts")}</li>
          <li>{t("home.quickStartItems.commandSearch")}</li>
        </ul>
      </div>

      <div className="panel two-col-card">
        <h2>{t("home.announcements")}</h2>
        <ul>
          <li>{t("home.releaseNotes")}</li>
          <li>{t("home.backupReminder")}</li>
        </ul>
      </div>
    </section>
  );
}

function RoutedModulePage(): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const match = allNavItems.find((item) => location.pathname === item.path);

  if (!match) {
    return <PlaceholderPage title={t("common.unknownModule")} description={t("common.routeNotRegistered")} />;
  }

  return <PlaceholderPage title={t(match.labelKey)} description={t(match.descriptionKey)} />;
}

function ShellLayout({ shellState, recentBooksets, refreshShellData }: ShellContextState): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const toolbarRef = useRef<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"bookset" | "help" | "user" | null>(null);

  const todoCount = shellState.todoItems.length;
  const [selectedPrimaryKey, setSelectedPrimaryKey] = useState<string>(navSections[0]?.key ?? "");

  const activeItemLabel = useMemo(() => {
    if (location.pathname === "/app/home") {
      return t("common.home");
    }

    const item = allNavItems.find((navItem) => navItem.path === location.pathname);
    return item ? t(item.labelKey) : t("common.module");
  }, [location.pathname, t]);

  useEffect(() => {
    const matchedSection = navSections.find((section) =>
      section.groups.some((group) => group.items.some((item) => item.path === location.pathname))
    );

    if (matchedSection) {
      setSelectedPrimaryKey(matchedSection.key);
    }
  }, [location.pathname]);

  useEffect(() => {
    setOpenMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (!toolbarRef.current) {
        return;
      }

      const target = event.target as Node;
      if (!toolbarRef.current.contains(target)) {
        setOpenMenu(null);
      }
    };

    const handleEscClose = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscClose);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscClose);
    };
  }, []);

  const selectedSection = navSections.find((section) => section.key === selectedPrimaryKey) ?? navSections[0];

  const booksetMenuItems: ToolbarMenuItem[] = [
    { key: "new", label: t("shell.newBookset") },
    { key: "open", label: t("shell.openBookset") },
    { key: "close", label: t("shell.closeBookset") },
    ...(shellState.hasOpenedBookset ? [{ key: "switch", label: t("shell.switchBookset") }] : []),
    { key: "export", label: t("shell.exportBookset") },
    { key: "import", label: t("shell.importBookset") },
    { key: "param", label: t("shell.paramSettings") },
    ...(!shellState.hasOpenedBookset ? [{ key: "recent", label: t("shell.recentBooksetSearch") }] : [])
  ];

  const helpMenuItems: ToolbarMenuItem[] = [
    { key: "help-center", label: "帮助中心" },
    { key: "shortcut", label: "快捷键说明" },
    { key: "privacy", label: "隐私政策" }
  ];

  const userMenuItems: ToolbarMenuItem[] = [
    { key: "settings", label: t("common.settings") },
    { key: "logout", label: t("common.logout") }
  ];

  const openMockBookset = async (): Promise<void> => {
    await window.openAccountancy.openMockBookset({
      companyName: t("shell.mockCompanyName"),
      fiscalPeriod: "2026年11期-未结账"
    });
    await refreshShellData();
  };

  const closeBookset = async (): Promise<void> => {
    await window.openAccountancy.closeBookset();
    await refreshShellData();
  };

  return (
    <div className="app-shell">
      <header className="topbar" ref={toolbarRef}>
        <div className="topbar-left">
          <Link to="/app/home" className="logo-link">
            {shellState.appName}
          </Link>
          <ToolbarDropdown
            menuId="bookset"
            label={
              shellState.hasOpenedBookset
                ? t("shell.booksetMenuOpened", { label: shellState.activeBooksetLabel })
                : t("shell.booksetMenu")
            }
            items={booksetMenuItems}
            isOpen={openMenu === "bookset"}
            onToggle={() => setOpenMenu((prev) => (prev === "bookset" ? null : "bookset"))}
            onClose={() => setOpenMenu(null)}
          />
          {shellState.hasOpenedBookset ? (
            <span className="chip todo-inline">
              {t("shell.todoPanel")}（<span className="todo-count">{todoCount}</span>）
            </span>
          ) : null}
        </div>

        <div className="topbar-center">
          <input type="search" placeholder={t("shell.searchPlaceholder")} disabled />
        </div>

        <div className="topbar-right">
          <button className="btn btn-small" type="button" onClick={openMockBookset}>
            {t("shell.openMockBookset")}
          </button>
          <button className="btn btn-small" type="button" onClick={closeBookset}>
            {t("shell.closeBookset")}
          </button>
          <ToolbarDropdown
            menuId="help"
            label={t("common.help")}
            items={helpMenuItems}
            isOpen={openMenu === "help"}
            onToggle={() => setOpenMenu((prev) => (prev === "help" ? null : "help"))}
            onClose={() => setOpenMenu(null)}
          />
          <ToolbarDropdown
            menuId="user"
            label={t("common.user")}
            items={userMenuItems}
            isOpen={openMenu === "user"}
            onToggle={() => setOpenMenu((prev) => (prev === "user" ? null : "user"))}
            onClose={() => setOpenMenu(null)}
            alignRight
          />
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${shellState.hasOpenedBookset ? "" : "sidebar-disabled"}`}>
          <div className="sidebar-primary" role="tablist" aria-label="一级菜单">
            {navSections.map((section) => (
              <div
                key={section.key}
                className={`primary-nav-item ${selectedPrimaryKey === section.key ? "primary-nav-item-active" : ""} ${!shellState.hasOpenedBookset ? "primary-nav-item-disabled" : ""}`}
                role="tab"
                aria-selected={selectedPrimaryKey === section.key}
                tabIndex={shellState.hasOpenedBookset ? 0 : -1}
                onClick={() => {
                  if (!shellState.hasOpenedBookset) {
                    return;
                  }
                  setSelectedPrimaryKey(section.key);
                }}
                onKeyDown={(event) => {
                  if (!shellState.hasOpenedBookset) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPrimaryKey(section.key);
                  }
                }}
              >
                {t(section.labelKey)}
              </div>
            ))}
          </div>
          <div className="sidebar-secondary">
            {selectedSection?.groups.map((group) => (
              <section key={group.key} className="nav-section">
                <h3>{t(group.labelKey)}</h3>
                <ul>
                  {group.items.map((item) => {
                    const disabled = item.requiresBookset && !shellState.hasOpenedBookset;
                    return (
                      <li key={item.key}>
                        {disabled ? (
                          <span className="nav-disabled">{t(item.labelKey)}</span>
                        ) : (
                          <NavLink
                            to={item.path}
                            className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
                          >
                            {t(item.labelKey)}
                          </NavLink>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </aside>

        <main className="content">
          <div className="content-head">
            <h1>{activeItemLabel}</h1>
            <small>{t("common.version")} {shellState.version}</small>
          </div>
          <Outlet context={{ shellState, recentBooksets, refreshShellData } satisfies ShellContextState} />
          <div className="workspace-footer-note">{t("home.footer")}</div>
        </main>
      </div>
    </div>
  );
}

function AppRoutes(): JSX.Element {
  const { t } = useTranslation();
  const [entryState, setEntryState] = useState<SystemEntryState>(defaultEntryState);
  const [entryReady, setEntryReady] = useState(false);
  const [shellState, setShellState] = useState<AppShellState>(defaultShellState);
  const [recentBooksets, setRecentBooksets] = useState<RecentBookset[]>([]);

  const refreshEntryState = async (): Promise<void> => {
    const state = await window.openAccountancy.getSystemEntryState();
    setEntryState(state);
    setEntryReady(true);
  };

  const refreshShellData = async (): Promise<void> => {
    const [state, recents] = await Promise.all([
      window.openAccountancy.getShellState(),
      window.openAccountancy.getRecentBooksets()
    ]);

    setShellState(state);
    setRecentBooksets(recents);
  };

  useEffect(() => {
    void refreshEntryState();
    void refreshShellData();
  }, []);

  if (!entryReady) {
    return <main className="auth-shell"><section className="panel auth-panel"><p>{t("common.loading")}</p></section></main>;
  }

  const shellContext: ShellContextState = {
    shellState,
    recentBooksets,
    refreshShellData
  };

  return (
    <Routes>
      <Route path="/" element={<EntryRoute mode={entryState.mode} />} />
      <Route
        path="/auth/login"
        element={<LoginFlowPage hasDatabase={entryState.hasDatabase} />}
      />
      <Route
        path="/auth/init"
        element={<InitWizardPage hasDatabase={entryState.hasDatabase} />}
      />
      <Route
        path="/auth/recover"
        element={<RecoverFlowPage hasDatabase={entryState.hasDatabase} />}
      />

      <Route path="/app" element={<ShellLayout {...shellContext} />}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomePage {...shellContext} />} />
        {allNavItems.map((item) => (
          <Route key={item.key} path={item.path.replace("/app/", "")} element={<RoutedModulePage />} />
        ))}
        <Route path="*" element={<PlaceholderPage title={t("common.notFound")} description={t("common.unknownAppRoute")} />} />
      </Route>

      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
