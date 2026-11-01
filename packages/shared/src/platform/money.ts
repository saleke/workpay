/**
 * Money is the only representation of monetary value in WorkPay.
 *
 * Invariant M1 (ENGINEERING_PLAN section 3): money is an integer number of
 * minor units plus an explicit currency. Floating point is forbidden anywhere
 * (DB, API, UI math, PayPal payloads). `amountMinor` is always an integer.
 *
 * Invariant M2: `amountMinor >= 0`. Amounts come only from the
 * contract/agreement, never from the LLM and never from the browser.
 */

export const CURRENCIES = ["USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  /** Integer minor units. $135.00 => 13500 (USD cents). */
  readonly amountMinor: number;
  readonly currency: Currency;
}

export function money(amountMinor: number, currency: Currency = "USD"): Money {
  assertIntegerMinor(amountMinor, currency);
  return { amountMinor, currency };
}

export const ZERO_USD: Money = money(0, "USD");

export function isIntegerMinor(amountMinor: number): boolean {
  return Number.isSafeInteger(amountMinor);
}

function assertIntegerMinor(amountMinor: number, currency: Currency): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(
      `Money.amountMinor must be a safe integer in minor units, got ${String(amountMinor)}`,
    );
  }
  if (amountMinor < 0) {
    throw new Error(`Money.amountMinor must be >= 0, got ${amountMinor}`);
  }
  if (!CURRENCIES.includes(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinor - b.amountMinor;
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/** True when `a` is within the ceiling represented by `b` (a <= b). */
export function withinBudget(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.amountMinor <= b.amountMinor;
}

/** Human display ONLY. Never use the result for further money math. */
export function formatMoney(value: Money): string {
  const sign = value.amountMinor < 0 ? "-" : "";
  const abs = Math.abs(value.amountMinor);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  const symbol = value.currency === "USD" ? "$" : "";
  return `${sign}${symbol}${major}.${String(minor).padStart(2, "0")}`;
}

/**
 * Parse a human-entered decimal string ("150", "150.5", "$135.00") into
 * integer minor units. Used only at the API input boundary for buyer-supplied
 * budgets. Rejects anything that is not an exact number of minor units.
 */
export function parseMoneyInput(input: string, currency: Currency = "USD"): Money {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "") throw new Error("Empty money input");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid money input: ${input}`);
  }
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole, fraction = ""] = unsigned.split(".");
  const fractionPadded = (fraction + "00").slice(0, 2);
  const minor = Number(whole) * 100 + Number(fractionPadded);
  if (!Number.isSafeInteger(minor)) throw new Error(`Money input out of range: ${input}`);
  if (negative) throw new Error("Money amounts must not be negative");
  return money(minor, currency);
}
