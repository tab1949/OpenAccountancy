function digitGroupToUpper(value: number): string {
  const digits = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
  const units = ["", "拾", "佰", "仟"];
  let result = "";
  let zeroPending = false;
  for (let index = 0; index < 4; index += 1) {
    const divisor = 10 ** (3 - index);
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) {
      zeroPending ||= result.length > 0 && value % divisor !== 0;
      continue;
    }
    if (zeroPending) {
      result += "零";
      zeroPending = false;
    }
    result += `${digits[digit]}${units[3 - index]}`;
  }
  return result;
}

export function amountToUpper(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0 || amount >= 1_000_000_000_000) {
    return "金额超出大写范围";
  }
  const centsValue = Math.round(amount * 100);
  const integer = Math.floor(centsValue / 100);
  const jiao = Math.floor((centsValue % 100) / 10);
  const fen = centsValue % 10;
  if (centsValue === 0) return "人民币零元整";

  const groups = [
    { value: Math.floor(integer / 100_000_000), unit: "亿" },
    { value: Math.floor((integer % 100_000_000) / 10_000), unit: "万" },
    { value: integer % 10_000, unit: "" }
  ];
  let integerText = "";
  let zeroBetween = false;
  for (const group of groups) {
    if (group.value === 0) {
      if (integerText && integer % 10_000 !== 0) zeroBetween = true;
      continue;
    }
    if (zeroBetween || (integerText && group.value < 1000)) integerText += "零";
    integerText += `${digitGroupToUpper(group.value)}${group.unit}`;
    zeroBetween = false;
  }
  if (!integerText) integerText = "零";

  let fractionText = "";
  if (jiao > 0) fractionText += ` ${["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"][jiao]}角`;
  else if (fen > 0) fractionText += " 零";
  if (fen > 0) fractionText += `${["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"][fen]}分`;
  else if (jiao > 0) fractionText += "整";
  else fractionText = "整";
  return `人民币${integerText}元${fractionText}`.replace("元 ", "元");
}
