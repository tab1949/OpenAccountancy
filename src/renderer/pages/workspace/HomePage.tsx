import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BooksetOperationType } from "@renderer/components/BooksetOperationModal";
import type { ShellContextState } from "@renderer/pages/types";

export function HomePage({
  shellState,
  recentBooksets,
  onOpenBooksetOperation,
  refreshShellData
}: ShellContextState & { onOpenBooksetOperation: (operation: BooksetOperationType) => void }): JSX.Element {
  const { t } = useTranslation();
  const [openingBooksetId, setOpeningBooksetId] = useState<number | null>(null);
  const [switchMessage, setSwitchMessage] = useState("");

  const openRecentBookset = async (booksetId: number): Promise<void> => {
    setSwitchMessage("");
    setOpeningBooksetId(booksetId);

    try {
      if (shellState.hasOpenedBookset) {
        const closeResult = await window.openAccountancy.closeBookset();
        if (!closeResult.ok && closeResult.message !== "当前没有已打开的账套。") {
          setSwitchMessage(closeResult.message);
          return;
        }
      }

      const openResult = await window.openAccountancy.openBookset({ booksetId });
      if (!openResult.ok) {
        setSwitchMessage(openResult.message);
        return;
      }

      await refreshShellData();
    } finally {
      setOpeningBooksetId(null);
    }
  };

  return (
    <section className="page-grid">
      <div className="panel hero-panel">
        <h1>{t("home.title", { appName: shellState.appName })}</h1>
        <p>{t("home.description")}</p>
        <div className="hero-actions">
          <button className="btn btn-primary" type="button" onClick={() => onOpenBooksetOperation("open")}>{t("home.openBookset")}</button>
          <button className="btn" type="button" onClick={() => onOpenBooksetOperation("create")}>{t("home.createBookset")}</button>
          <button className="btn" type="button" onClick={() => onOpenBooksetOperation("close")}>{t("home.closeBookset")}</button>
          <button className="btn" type="button" onClick={() => onOpenBooksetOperation("import")}>{t("home.importBookset")}</button>
          <button className="btn" type="button" onClick={() => onOpenBooksetOperation("export")}>{t("home.exportBookset")}</button>
          <button className="btn" type="button" onClick={() => onOpenBooksetOperation("backup")}>{t("home.backupBookset")}</button>
          <button className="btn" type="button" onClick={() => onOpenBooksetOperation("restore")}>{t("home.restoreBackup")}</button>
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
                  <button
                    type="button"
                    className="recent-bookset-item-btn"
                    disabled={openingBooksetId !== null}
                    onClick={() => void openRecentBookset(bookset.id)}
                  >
                    <strong>{bookset.name}</strong>
                    <span>{bookset.period}</span>
                    <small>
                      {openingBooksetId === bookset.id
                        ? "正在切换账套..."
                        : new Date(bookset.lastOpenedAt).toLocaleString()}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {switchMessage ? <p className="auth-hint">{switchMessage}</p> : null}
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
