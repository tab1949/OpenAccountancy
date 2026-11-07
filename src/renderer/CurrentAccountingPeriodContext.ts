import { createContext, useContext } from "react";
import type { CurrentAccountingPeriod, OperationResult } from "../common/contracts";

export interface CurrentAccountingPeriodContextValue {
  currentAccountingPeriod: CurrentAccountingPeriod | null;
  selectAccountingDate: (date: string) => Promise<OperationResult>;
}

export const CurrentAccountingPeriodContext = createContext<CurrentAccountingPeriodContextValue | null>(null);

export function useCurrentAccountingPeriod(): CurrentAccountingPeriodContextValue {
  const context = useContext(CurrentAccountingPeriodContext);
  if (!context) throw new Error("CurrentAccountingPeriodContext is unavailable");
  return context;
}