import type { AccountCategory } from "./contracts";

export const accountCategories: AccountCategory[] = ["资产", "负债", "共同", "所有者权益", "成本", "损益"];

export function categoriesForStandard(standard: "ASBE_2006" | "SBE_2011"): AccountCategory[] {
  return standard === "SBE_2011" ? accountCategories.filter((category) => category !== "共同") : [...accountCategories];
}
