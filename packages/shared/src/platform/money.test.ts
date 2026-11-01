import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, money, parseMoneyInput, withinBudget } from "./money.js";

describe("money", () => {
  it("represents money as integer minor units", () => {
    expect(money(13500)).toEqual({ amountMinor: 13500, currency: "USD" });
  });

  it("rejects non-integer minor units", () => {
    expect(() => money(10.5)).toThrow();
  });

  it("rejects negative amounts (invariant M2)", () => {
    expect(() => money(-1)).toThrow();
  });

  it("adds amounts of the same currency", () => {
    expect(addMoney(money(1000), money(250)).amountMinor).toBe(1250);
  });

  it("compares against a budget ceiling", () => {
    expect(withinBudget(money(9999), money(10000))).toBe(true);
    expect(withinBudget(money(10001), money(10000))).toBe(false);
  });

  it("formats for display only", () => {
    expect(formatMoney(money(13500))).toBe("$135.00");
    expect(formatMoney(money(5))).toBe("$0.05");
  });

  it("preserves supported non-USD currencies and their minor units", () => {
    expect(money(1_000_000, "NGN")).toEqual({ amountMinor: 1_000_000, currency: "NGN" });
    expect(formatMoney(money(1_000_000, "NGN"))).toMatch(/NGN.*10,000\.00/);
    expect(parseMoneyInput("10000", "NGN")).toEqual({
      amountMinor: 1_000_000,
      currency: "NGN",
    });
  });

  it("parses human input into exact minor units", () => {
    expect(parseMoneyInput("$135.00").amountMinor).toBe(13500);
    expect(parseMoneyInput("150").amountMinor).toBe(15000);
    expect(parseMoneyInput("150.5").amountMinor).toBe(15050);
  });

  it("rejects sub-cent precision and negatives", () => {
    expect(() => parseMoneyInput("1.234")).toThrow();
    expect(() => parseMoneyInput("-5")).toThrow();
  });
});
