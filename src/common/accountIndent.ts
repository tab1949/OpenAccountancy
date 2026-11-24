export const DEFAULT_ACCOUNT_INDENT = "  ";
export const MAX_ACCOUNT_INDENT_LENGTH = 16;

export function validAccountIndent(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ACCOUNT_INDENT_LENGTH && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

export function indentAccount(value: string, level: number, indent: string): string {
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error("科目级次无效。");
  if (!validAccountIndent(indent)) throw new Error("科目缩进样式无效。");
  return indent.repeat(level - 1) + value;
}
