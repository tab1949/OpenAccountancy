import type { JSX } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AuthSession } from "@common/contracts";
import { PlaceholderPage } from "@renderer/components/PlaceholderPage";
import { allNavItems } from "@renderer/config/navigation";
import { canAccessPath } from "./permissions";
import { UserManagementPage } from "./UserManagementPage";
import { BookkeepingPage } from "./BookkeepingPage";
import { VoucherFillPage } from "./VoucherFillPage";
import { VoucherQueryPage } from "./VoucherQueryPage";
import { BooksetSettingsPage } from "./BooksetSettingsPage";
import { ChartAccountsPage } from "./ChartAccountsPage";
import { LedgerPage } from "./LedgerPage";
import { CarryForwardPage } from "./CarryForwardPage";
import type { LedgerKind } from "../../../common/contracts";
import type { BooksetOperationType } from "@renderer/components/BooksetOperationModal";
import type { ShellContextState } from "../types";

export function RoutedModulePage({
  authSession,
  onOpenBooksetOperation,
  refreshShellData
}: { authSession: AuthSession; onOpenBooksetOperation: (operation: BooksetOperationType) => void; refreshShellData: ShellContextState["refreshShellData"] }): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();

  if (!canAccessPath(authSession, location.pathname)) {
    return <PlaceholderPage title="无访问权限" description="当前账户没有访问该模块的授权，请联系管理员调整权限。" />;
  }

  if (location.pathname === "/app/settings/security") {
    return <UserManagementPage authSession={authSession} />;
  }

  if (location.pathname === "/app/settings/bookset") {
    return <BooksetSettingsPage authSession={authSession} onOpenBooksetOperation={onOpenBooksetOperation} refreshShellData={refreshShellData} />;
  }

  if (location.pathname === "/app/settings/system") {
    return <PlaceholderPage title={t("nav.item.settingsSystem")} description={t("nav.desc.settingsSystem")} />;
  }

  if (location.pathname === "/app/voucher/fill") {
    return <VoucherFillPage />;
  }

  if (location.pathname === "/app/ledger/accounts") {
    return <ChartAccountsPage />;
  }
  if (location.pathname === "/app/period-end/account-balance") {
    return <LedgerPage key="closing-account-balance" kind="trial-balance" closingReport="account-balance" />;
  }
  if (location.pathname === "/app/period-end/trial-balance") {
    return <LedgerPage key="closing-trial-balance" kind="trial-balance" closingReport="trial-balance" />;
  }
  if (location.pathname === "/app/period-end/account-summary") {
    return <LedgerPage key="closing-account-summary" kind="trial-balance" closingReport="account-summary" />;
  }
  if (["/app/period-end/carry-custom", "/app/period-end/carry-cogs", "/app/period-end/carry-pl"].includes(location.pathname)) {
    return <CarryForwardPage />;
  }
  if (location.pathname === "/app/cashier/cash-journal") {
    return <LedgerPage key="cash-journal" kind="journal" cashierJournal="cash" />;
  }
  if (location.pathname === "/app/cashier/bank-journal") {
    return <LedgerPage key="bank-journal" kind="journal" cashierJournal="bank" />;
  }
  const ledgerKind = location.pathname.match(/^\/app\/ledger\/(general|subsidiary|journal|trial-balance)$/)?.[1] as LedgerKind | undefined;
  if (ledgerKind) return <LedgerPage key={ledgerKind} kind={ledgerKind} />;

  if (location.pathname === "/app/voucher/query") {
    return <VoucherQueryPage />;
  }

  if (location.pathname === "/app/period-end/bookkeeping") {
    return <BookkeepingPage />;
  }

  const match = allNavItems.find((item) => location.pathname === item.path);
  if (!match) {
    return <PlaceholderPage title={t("common.unknownModule")} description={t("common.routeNotRegistered")} />;
  }

  return <PlaceholderPage title={t(match.labelKey)} description={t(match.descriptionKey)} />;
}
