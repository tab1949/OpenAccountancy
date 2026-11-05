import { useTranslation } from "react-i18next";

export function AuthStatus({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const dbStateText = hasDatabase ? t("auth.status.dbDetected") : t("auth.status.dbMissing");

  return (
    <div className="auth-state-row">
      <span className={`db-state ${hasDatabase ? "db-state-ok" : "db-state-warning"}`}>{dbStateText}</span>
    </div>
  );
}
