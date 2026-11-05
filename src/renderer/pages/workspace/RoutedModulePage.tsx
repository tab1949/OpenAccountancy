import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AuthSession } from "@common/contracts";
import { PlaceholderPage } from "@renderer/components/PlaceholderPage";
import { allNavItems } from "@renderer/config/navigation";
import { canAccessPath } from "./permissions";
import { UserManagementPage } from "./UserManagementPage";

export function RoutedModulePage({ authSession }: { authSession: AuthSession }): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();

  if (!canAccessPath(authSession, location.pathname)) {
    return <PlaceholderPage title="无访问权限" description="当前账户没有访问该模块的授权，请联系管理员调整权限。" />;
  }

  if (location.pathname === "/app/settings/security") {
    return <UserManagementPage authSession={authSession} />;
  }

  if (location.pathname === "/app/settings/system") {
    return <PlaceholderPage title={t("nav.item.settingsSystem")} description={t("nav.desc.settingsSystem")} />;
  }

  const match = allNavItems.find((item) => location.pathname === item.path);
  if (!match) {
    return <PlaceholderPage title={t("common.unknownModule")} description={t("common.routeNotRegistered")} />;
  }

  return <PlaceholderPage title={t(match.labelKey)} description={t(match.descriptionKey)} />;
}
