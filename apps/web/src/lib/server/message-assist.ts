const DATE_PATTERN = /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,4}\/\d{1,2}\/\d{1,4})\b/g;
const MONEY_PATTERN =
  /(?:(USD|EUR|GBP|NGN|\$|€|£|₦)\s*((?:\d[\d,]*(?:\.\d+)?|\.\d+))|((?:\d[\d,]*(?:\.\d+)?|\.\d+))\s*(USD|EUR|GBP|NGN|dollars?|euros?|pounds?|naira))/gi;
const QUANTITY_PATTERN =
  /([-+]?(?:\d[\d,]*(?:\.\d+)?|\.\d+))\s*(%|hours?|hrs?|days?|weeks?|months?|years?|files?|items?|pages?|records?|rows?|videos?|images?|words?|minutes?|mins?|seconds?|secs?|kb|mb|gb)\b/gi;
const NUMBER_PATTERN = /[-+]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)/g;
const CONTEXT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "due",
  "for",
  "in",
  "is",
  "are",
  "cost",
  "costs",
  "on",
  "or",
  "the",
  "to",
]);

function normalizedNumber(value: string): string {
  const commaCount = (value.match(/,/g) ?? []).length;
  const normalized =
    commaCount === 1 && !value.includes(".") && !/,\d{3}$/.test(value)
      ? value.replace(",", ".")
      : value.replaceAll(",", "");
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : value.toLowerCase();
}

function normalizedCurrency(value: string): string {
  const currency = value.toUpperCase();
  if (currency === "$" || /^DOLLARS?$/.test(currency)) return "USD";
  if (currency === "€" || /^EUROS?$/.test(currency)) return "EUR";
  if (currency === "£" || /^POUNDS?$/.test(currency)) return "GBP";
  if (currency === "₦" || currency === "NAIRA") return "NGN";
  return currency;
}

function nextContext(value: string, offset: number): string {
  const words = value.slice(offset).match(/[\p{L}][\p{L}\p{N}_-]*/gu) ?? [];
  return (
    words
      .slice(0, 4)
      .map((word) => word.toLocaleLowerCase())
      .find((word) => !CONTEXT_STOP_WORDS.has(word)) ?? ""
  );
}

function previousContext(value: string, offset: number): string {
  const words = value.slice(0, offset).match(/[\p{L}][\p{L}\p{N}_-]*/gu) ?? [];
  return (
    words
      .slice(-4)
      .reverse()
      .map((word) => word.toLocaleLowerCase())
      .find((word) => !CONTEXT_STOP_WORDS.has(word)) ?? ""
  );
}

function maskRange(masked: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) masked[index] = " ";
}

export function numericDetailSignatures(value: string): string[] {
  const signatures: string[] = [];
  const masked = value.split("");

  for (const match of value.matchAll(DATE_PATTERN)) {
    const start = match.index ?? 0;
    signatures.push(`date:${match[0]}`);
    maskRange(masked, start, start + match[0].length);
  }

  for (const match of value.matchAll(MONEY_PATTERN)) {
    const start = match.index ?? 0;
    const currency = normalizedCurrency(match[1] ?? match[4] ?? "");
    const amount = normalizedNumber(match[2] ?? match[3] ?? "");
    const context = previousContext(value, start) || nextContext(value, start + match[0].length);
    signatures.push(`money:${currency}:${amount}:${context}`);
    maskRange(masked, start, start + match[0].length);
  }

  const withoutDatesOrMoney = masked.join("");
  for (const match of withoutDatesOrMoney.matchAll(QUANTITY_PATTERN)) {
    const start = match.index ?? 0;
    signatures.push(`quantity:${normalizedNumber(match[1] ?? "")}${match[2]?.toLowerCase() ?? ""}`);
    maskRange(masked, start, start + match[0].length);
  }

  const remaining = masked.join("");
  for (const match of remaining.matchAll(NUMBER_PATTERN)) {
    signatures.push(`number:${normalizedNumber(match[0])}`);
  }
  return signatures;
}

export function numericDetailsPreserved(source: string, output: string): boolean {
  const expected = numericDetailSignatures(source);
  const actual = numericDetailSignatures(output);
  return (
    expected.length === actual.length &&
    expected.every((signature, index) => signature === actual[index])
  );
}
