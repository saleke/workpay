import { describe, expect, it } from "vitest";
import { numericDetailsPreserved } from "../../src/lib/server/message-assist";

describe("message-assist numeric grounding", () => {
  it("allows formatting changes while preserving numeric meaning", () => {
    expect(
      numericDetailsPreserved(
        "Deliver 2 files for $1,000 by 2026-12-10.",
        "Deliver 2 files for $1000 by 2026-12-10.",
      ),
    ).toBe(true);
  });

  it("rejects swapped quantities, changed signs, units, and decimals", () => {
    expect(numericDetailsPreserved("2 files at $5", "5 files at $2")).toBe(false);
    expect(numericDetailsPreserved("a -10% adjustment", "a $10 adjustment")).toBe(false);
    expect(numericDetailsPreserved("allow .5 hours", "allow 5 hours")).toBe(false);
    expect(numericDetailsPreserved("Use 1,5 hours", "Use 15 hours")).toBe(false);
    expect(numericDetailsPreserved("Due 12/10/2026", "Due 10/12/2026")).toBe(false);
    expect(numericDetailsPreserved("USD 1,000 due 2026-12-10", "EUR 1,000 due 2026-10-12")).toBe(
      false,
    );
    expect(numericDetailsPreserved("$5 setup and $10 delivery", "$10 setup and $5 delivery")).toBe(
      false,
    );
  });
});
