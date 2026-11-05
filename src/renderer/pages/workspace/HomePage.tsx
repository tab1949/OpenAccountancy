import { useTranslation } from "react-i18next";
import type { ShellContextState } from "@renderer/pages/types";

export function HomePage({ shellState, recentBooksets }: ShellContextState): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="page-grid">
      <div className="panel hero-panel">
        <h1>{t("home.title", { appName: shellState.appName })}</h1>
        <p>{t("home.description")}</p>
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
