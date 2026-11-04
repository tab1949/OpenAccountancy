import type { OpenAccountancyApi } from "@common/contracts";

declare global {
  interface Window {
    openAccountancy: OpenAccountancyApi;
  }
}

export {};
