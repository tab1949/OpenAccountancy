import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enUS from "./locales/en-US";
import zhCN from "./locales/zh-CN";
import zhHK from "./locales/zh-HK";

export const SUPPORTED_LOCALES = ["zh-CN", "en-US", "zh-HK"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Current phase only enables zh-CN while preserving additional locale resources.
const ACTIVE_LOCALE: SupportedLocale = "zh-CN";

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
    "zh-HK": { translation: zhHK }
  },
  lng: ACTIVE_LOCALE,
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
