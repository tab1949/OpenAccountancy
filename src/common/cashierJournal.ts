import type { CashierJournal } from "./contracts";

export const cashierJournals: Record<CashierJournal, { title: string; accountCode: string }> = {
  cash: { title: "现金日记账", accountCode: "1001" },
  bank: { title: "银行存款日记账", accountCode: "1002" }
};
