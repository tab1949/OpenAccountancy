import type { VoucherLineInput } from "./contracts";

export function voucherSummarySuggestions(lines: VoucherLineInput[], lineNo: number): string[] {
  const keyword = (lines.find((line) => line.lineNo === lineNo)?.summary ?? "").trim().toLocaleLowerCase();
  return [...new Set(lines.filter((line) => line.lineNo !== lineNo)
    .map((line) => line.summary.trim())
    .filter((summary) => summary && summary.toLocaleLowerCase().includes(keyword)))];
}
