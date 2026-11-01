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

/**
 * ISO 4217 currency code validated at runtime. USD remains the default, but
 * confirmed task budgets are preserved in their stated currency.
 */
export type Currency = string;

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
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}

export function isSupportedCurrency(currency: string): currency is Currency {
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency });
    return true;
  } catch {
    return false;
  }
}

export function currencyFractionDigits(currency: Currency): number {
  if (!isSupportedCurrency(currency)) throw new Error(`Unsupported currency: ${currency}`);
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
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
  assertIntegerMinor(value.amountMinor, value.currency);
  const fractionDigits = currencyFractionDigits(value.currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency,
  }).format(value.amountMinor / 10 ** fractionDigits);
}

/**
 * Parse a human-entered decimal string ("150", "150.5", "$135.00") into
 * integer minor units. Used only at the API input boundary for buyer-supplied
 * budgets. Rejects anything that is not an exact number of minor units.
 */
export function parseMoneyInput(input: string, currency: Currency = "USD"): Money {
  const fractionDigits = currencyFractionDigits(currency);
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "") throw new Error("Empty money input");
  const amountPattern =
    fractionDigits === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(\\.\\d{1,${fractionDigits}})?$`);
  if (!amountPattern.test(cleaned)) {
    throw new Error(`Invalid money input: ${input}`);
  }
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole, fraction = ""] = unsigned.split(".");
  const fractionPadded = (fraction + "0".repeat(fractionDigits)).slice(0, fractionDigits);
  const minor = Number(whole) * 10 ** fractionDigits + Number(fractionPadded || "0");
  if (!Number.isSafeInteger(minor)) throw new Error(`Money input out of range: ${input}`);
  if (negative) throw new Error("Money amounts must not be negative");
  return money(minor, currency);
}
