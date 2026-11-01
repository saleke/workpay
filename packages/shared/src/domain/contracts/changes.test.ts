import { describe, expect, it } from "vitest";
import { applyContractChange, planPaymentAdjustment, type ContractChangeTerms } from "./changes.js";

const base: ContractChangeTerms = {
  title: "Website",
  summary: "Build a small website.",
  requirements: [{ key: "responsive", statement: "Works on mobile.", acceptanceRelevant: true }],
  included: ["Homepage"],
  excluded: ["Hosting"],
  acceptanceRules: [{ requirementKey: "responsive", method: "HUMAN_REVIEW" }],
  budget: { amountMinor: 10_000, currency: "USD" },
  agreedPriceMinor: 9_000,
  deadline: null,
};

describe("contract change proposals", () => {
  it("creates a complete replacement snapshot and new hash", () => {
    const changed = applyContractChange(
      base,
      { budgetMinor: 12_500, included: ["Homepage", "Contact page"] },
      "task_1",
    );
    expect(changed.terms.budget).toEqual({ amountMinor: 12_500, currency: "USD" });
    expect(changed.terms.excluded).toEqual(["Hosting"]);
    expect(changed.hash).not.toBe(
      applyContractChange(base, { summary: "An interim summary." }, "task_1").hash,
    );
  });

  it("rejects a proposal that does not change the agreed terms", () => {
    expect(() => applyContractChange(base, { budgetMinor: 10_000 }, "task_1")).toThrow(
      "must alter at least one agreed term",
    );
  });

  it("hashes the negotiated price separately from the contract budget", () => {
    const changed = applyContractChange(base, { agreedPriceMinor: 8_500 }, "task_1");
    expect(changed.terms.budget.amountMinor).toBe(10_000);
    expect(changed.terms.agreedPriceMinor).toBe(8_500);
    expect(changed.contractHash).toBe(
      applyContractChange(base, { agreedPriceMinor: 8_000 }, "task_1").contractHash,
    );
    expect(changed.hash).not.toBe(
      applyContractChange(base, { agreedPriceMinor: 8_000 }, "task_1").hash,
    );
  });

  it("rejects a negotiated price higher than the buyer's ceiling", () => {
    expect(() => applyContractChange(base, { agreedPriceMinor: 10_001 }, "task_1")).toThrow(
      "cannot exceed the buyer's budget ceiling",
    );
  });

  it("keeps an undecided price separate from the budget ceiling", () => {
    const undecided = { ...base, agreedPriceMinor: null };
    const changed = applyContractChange(
      undecided,
      { summary: "Clarify the work without setting a price." },
      "task_1",
    );
    expect(changed.terms.budget.amountMinor).toBe(10_000);
    expect(changed.terms.agreedPriceMinor).toBeNull();
  });

  it("rejects requirements without a corresponding acceptance rule", () => {
    expect(() =>
      applyContractChange(
        base,
        { requirements: [{ key: "new", statement: "New work", acceptanceRelevant: true }] },
        "task_1",
      ),
    ).toThrow("unknown requirement");
  });
});

describe("PayPal adjustment planning", () => {
  it("replaces an authorization rather than pretending it can be resized", () => {
    expect(
      planPaymentAdjustment(
        {
          id: "pay_1",
          status: "AUTHORIZED",
          amountMinor: 10_000,
          capturedAmountMinor: null,
        },
        12_000,
      ),
    ).toEqual({
      action: "VOID_AND_REAUTHORIZE",
      paymentId: "pay_1",
      targetAmountMinor: 12_000,
    });
  });

  it("authorizes only the difference after a higher price is agreed post-capture", () => {
    expect(
      planPaymentAdjustment(
        {
          id: "pay_1",
          status: "CAPTURED",
          amountMinor: 10_000,
          capturedAmountMinor: 9_000,
        },
        11_000,
      ),
    ).toEqual({
      action: "AUTHORIZE_DELTA",
      paymentId: "pay_1",
      deltaAmountMinor: 2_000,
      targetAmountMinor: 11_000,
    });
  });

  it("never issues an automatic refund for a lower post-capture price", () => {
    expect(
      planPaymentAdjustment(
        {
          id: "pay_1",
          status: "CAPTURED",
          amountMinor: 10_000,
          capturedAmountMinor: 10_000,
        },
        8_000,
      ),
    ).toEqual({
      action: "REFUND_DELTA_REQUIRES_REVIEW",
      paymentId: "pay_1",
      refundAmountMinor: 2_000,
      targetAmountMinor: 8_000,
    });
  });

  it("requires PayPal reconciliation when the previous outcome is unknown", () => {
    expect(
      planPaymentAdjustment(
        {
          id: "pay_1",
          status: "UNKNOWN",
          amountMinor: 10_000,
          capturedAmountMinor: null,
        },
        12_000,
      ).action,
    ).toBe("RECONCILIATION_REQUIRED");
  });

  it("uses the lower agreed total when the payment has not yet been authorized", () => {
    expect(
      planPaymentAdjustment(
        {
          id: "pay_1",
          status: "PENDING",
          amountMinor: 10_000,
          capturedAmountMinor: null,
        },
        8_000,
      ),
    ).toEqual({ action: "AUTHORIZE_NEW_TOTAL", targetAmountMinor: 8_000 });
  });
});
