import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface PlaceholderPageProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="panel page-panel">
      <header>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="placeholder-block">
        <h2>{t("placeholder.frameworkReady")}</h2>
        <p>{t("placeholder.description")}</p>
      </div>
      {children}
    </section>
  );
}
