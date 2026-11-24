import type { ChartAccount } from "./contracts";

const separators = /[-－—（(）)]/;

export function parseDetailHierarchy(value: string): string[] | null {
  const text = value.trim();
  if (!separators.test(text)) return null;
  const brackets: string[] = [];
  for (const char of text) {
    if (char === "(" || char === "（") brackets.push(char);
    if (char === ")" || char === "）") {
      if (brackets.pop() !== (char === ")" ? "(" : "（")) return null;
    }
  }
  if (brackets.length || /[-－—]\s*[-－—）)]|[（(]\s*[）)]|^[-－—（(]|[-－—]\s*$/.test(text)) return null;
  const parts = text.split(/[-－—（(）)]+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : null;
}

export function detailHierarchySuggestions(accounts: ChartAccount[], rootCode: string, value: string): string[] {
  const pieces = value.split(/[-－—（(）)]+/).map((part) => part.trim());
  const hasSeparator = separators.test(value);
  const prefix = hasSeparator ? pieces.slice(0, -1) : [];
  const keyword = (hasSeparator ? pieces[pieces.length - 1] : value).toLocaleLowerCase();
  if (prefix.some((part) => !part)) return [];
  let parents = [rootCode];
  for (const name of prefix) {
    parents = accounts.filter((account) => account.parentCode !== null && parents.includes(account.parentCode) && account.name === name)
      .map((account) => account.code);
  }
  return [...new Set(accounts
    .filter((account) => account.parentCode !== null && parents.includes(account.parentCode) && account.name.toLocaleLowerCase().includes(keyword))
    .map((account) => [...prefix, account.name].join("-")))];
}
