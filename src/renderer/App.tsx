import { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AppShellState, AuthSession, RecentBookset, SystemEntryState } from "../common/contracts";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { allNavItems, navSections } from "./config/navigation";
import { EntryRoute } from "./pages/auth/EntryRoute";
import { InitWizardPage } from "./pages/auth/InitWizardPage";
import { LoginFlowPage } from "./pages/auth/LoginFlowPage";
import { RecoverFlowPage } from "./pages/auth/RecoverFlowPage";
import type { ShellContextState } from "./pages/types";
import { HomePage } from "./pages/workspace/HomePage";
import { canAccessPath } from "./pages/workspace/permissions";
import { RoutedModulePage } from "./pages/workspace/RoutedModulePage";

interface ToolbarMenuItem {
  key: string;
  label: string;
  onClick?: () => void;
}

const defaultEntryState: SystemEntryState = {
  hasDatabase: true,
  mode: "login",
  initialized: false
};

const defaultShellState: AppShellState = {
  appName: "OpenAccountancy",
  version: "0.0.0",
  hasOpenedBookset: false,
  activeBooksetLabel: "未打开账套",
  todoItems: []
};

const defaultAuthSession: AuthSession = {
  isAuthenticated: false,
  userId: null,
  userName: "",
  displayName: "",
  role: null,
  permissions: []
};

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
            <button
              type="button"
              role="menuitem"
              className="toolbar-menu-item-btn"
              onClick={() => {
                item.onClick?.();
                onClose();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShellLayout({
  shellState,
  recentBooksets,
  refreshShellData,
  authSession,
  onLogout
}: ShellContextState & { onLogout: () => Promise<void> }): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const toolbarRef = useRef<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"bookset" | "settings" | "help" | "user" | null>(null);

  const todoCount = shellState.todoItems.length;
  const [selectedPrimaryKey, setSelectedPrimaryKey] = useState<string>(navSections[0]?.key ?? "");

  const activeItemLabel = useMemo(() => {
    if (location.pathname === "/app/home") {
      return t("common.home");
    }

    if (location.pathname === "/app/settings/security") {
      return t("nav.item.settingsAccount");
    }

    if (location.pathname === "/app/settings/system") {
      return t("nav.item.settingsSystem");
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
      return;
    }

    if (location.pathname.startsWith("/app/settings/")) {
      setSelectedPrimaryKey("settings");
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

  const settingsMenuItems: ToolbarMenuItem[] = [
    { key: "settings-security", label: "账户安全", onClick: () => navigate("/app/settings/security") },
    { key: "settings-system", label: "系统设置", onClick: () => navigate("/app/settings/system") }
  ];

  const userMenuItems: ToolbarMenuItem[] = [
    {
      key: "logout",
      label: t("common.logout"),
      onClick: () => {
        void onLogout().then(() => navigate("/auth/login"));
      }
    }
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
          <ToolbarDropdown
            menuId="settings"
            label={t("common.settings")}
            items={settingsMenuItems}
            isOpen={openMenu === "settings"}
            onToggle={() => setOpenMenu((prev) => (prev === "settings" ? null : "settings"))}
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
          <button className="btn btn-small" type="button" onClick={() => void openMockBookset()}>
            {t("shell.openMockBookset")}
          </button>
          <button className="btn btn-small" type="button" onClick={() => void closeBookset()}>
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
            label={`${authSession.displayName || authSession.userName || t("common.user")}`}
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
                    if (!canAccessPath(authSession, item.path)) {
                      return null;
                    }

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
          <Outlet context={{ shellState, recentBooksets, refreshShellData, authSession } satisfies ShellContextState} />
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
  const [authSession, setAuthSession] = useState<AuthSession>(defaultAuthSession);
  const [shellState, setShellState] = useState<AppShellState>(defaultShellState);
  const [recentBooksets, setRecentBooksets] = useState<RecentBookset[]>([]);

  const refreshEntryState = async (): Promise<void> => {
    const state = await window.openAccountancy.getSystemEntryState();
    setEntryState(state);
    setEntryReady(true);
  };

  const refreshAuthSession = async (): Promise<void> => {
    const session = await window.openAccountancy.getAuthSession();
    setAuthSession(session);
  };

  const refreshShellData = async (): Promise<void> => {
    if (!authSession.isAuthenticated) {
      setShellState(defaultShellState);
      setRecentBooksets([]);
      return;
    }

    const [state, recents] = await Promise.all([
      window.openAccountancy.getShellState(),
      window.openAccountancy.getRecentBooksets()
    ]);

    setShellState(state);
    setRecentBooksets(recents);
  };

  const onLogout = async (): Promise<void> => {
    await window.openAccountancy.logout();
    await refreshAuthSession();
    setShellState(defaultShellState);
    setRecentBooksets([]);
  };

  useEffect(() => {
    void Promise.all([refreshEntryState(), refreshAuthSession()]);
  }, []);

  useEffect(() => {
    void refreshShellData();
  }, [authSession.isAuthenticated]);

  if (!entryReady) {
    return <main className="auth-shell"><section className="panel auth-panel"><p>{t("common.loading")}</p></section></main>;
  }

  const shellContext: ShellContextState = {
    shellState,
    recentBooksets,
    refreshShellData,
    authSession
  };

  return (
    <Routes>
      <Route path="/" element={<EntryRoute mode={entryState.mode} />} />
      <Route
        path="/auth/login"
        element={
          <LoginFlowPage
            hasDatabase={entryState.hasDatabase}
            onLoginSuccess={async () => {
              await refreshAuthSession();
            }}
          />
        }
      />
      <Route path="/auth/init" element={<InitWizardPage hasDatabase={entryState.hasDatabase} />} />
      <Route path="/auth/recover" element={<RecoverFlowPage hasDatabase={entryState.hasDatabase} />} />

      <Route
        path="/app"
        element={
          authSession.isAuthenticated ? (
            <ShellLayout {...shellContext} onLogout={onLogout} />
          ) : (
            <Navigate to="/auth/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomePage {...shellContext} />} />
        <Route path="settings/security" element={<RoutedModulePage authSession={authSession} />} />
        <Route path="settings/system" element={<RoutedModulePage authSession={authSession} />} />
        {allNavItems.map((item) => (
          <Route key={item.key} path={item.path.replace("/app/", "")} element={<RoutedModulePage authSession={authSession} />} />
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
