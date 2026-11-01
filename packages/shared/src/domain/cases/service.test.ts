import { describe, expect, it } from "vitest";
import { AppError } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { assertCaseResolutionAllowed } from "./service.js";

const platformReviewer: Actor = {
  kind: "REVIEWER",
  id: "reviewer_1",
  role: "admin_reviewer",
};
const system: Actor = { kind: "SYSTEM", id: null };

describe("case resolution authority", () => {
  it("allows only system reconciliation to close operational exceptions", () => {
    expect(() =>
      assertCaseResolutionAllowed(
        "EXCEPTION",
        "PAYMENT_EXCEPTION",
        "NO_ACTION",
        system,
      ),
    ).not.toThrow();
    expect(() =>
      assertCaseResolutionAllowed("EXCEPTION", "TECHNICAL_FAILURE", "NO_ACTION", system),
    ).not.toThrow();
  });

  it("does not let a platform reviewer release or refund money", () => {
    expect(() =>
      assertCaseResolutionAllowed(
        "EXCEPTION",
        "PAYMENT_EXCEPTION",
        "RELEASE_PAYMENT",
        platformReviewer,
      ),
    ).toThrow(AppError);
    expect(() =>
      assertCaseResolutionAllowed(
        "EXCEPTION",
        "PAYMENT_EXCEPTION",
        "REFUND_PAYMENT",
        platformReviewer,
      ),
    ).toThrow(AppError);
  });

  it.each(["DISPUTE", "HUMAN_REVIEW"] as const)(
    "does not allow WorkPay to resolve a %s case",
    (caseType) => {
      expect(() =>
        assertCaseResolutionAllowed(caseType, "PAYMENT_EXCEPTION", "NO_ACTION", system),
      ).toThrow(AppError);
    },
  );

  it.each([
    "VERIFICATION_UNCERTAIN",
    "WORK_DISPUTE",
    "CONTRACT_DISPUTE",
    "SCOPE_CHANGE",
    "DEADLINE_DISPUTE",
    "PAYMENT_DISPUTE",
    "PROVIDER_CLAIM",
    "BUYER_COMPLAINT",
  ] as const)("does not allow WorkPay to resolve %s cases, even when mislabeled", (category) => {
    expect(() =>
      assertCaseResolutionAllowed("EXCEPTION", category, "NO_ACTION", system),
    ).toThrow(AppError);
  });

  it.each([
    "UPHOLD_SYSTEM_DECISION",
    "OVERRIDE_VERIFICATION",
    "REQUIRE_REVISION",
    "REQUIRE_NEW_EVIDENCE",
    "AMEND_CONTRACT",
    "CANCEL_TASK",
    "RELEASE_PAYMENT",
    "REFUND_PAYMENT",
    "VOID_PAYMENT",
  ] as const)("does not allow platform exceptions to decide or execute %s", (outcome) => {
    expect(() =>
      assertCaseResolutionAllowed("EXCEPTION", "PAYMENT_EXCEPTION", outcome, system),
    ).toThrow(AppError);
  });

  it("rejects every human actor", () => {
    const buyer: Actor = { kind: "USER", id: "buyer_1", role: "buyer" };
    expect(() =>
      assertCaseResolutionAllowed("EXCEPTION", "PAYMENT_EXCEPTION", "NO_ACTION", buyer),
    ).toThrow(AppError);
    expect(() =>
      assertCaseResolutionAllowed(
        "EXCEPTION",
        "PAYMENT_EXCEPTION",
        "NO_ACTION",
        platformReviewer,
      ),
    ).toThrow(AppError);
  });
});
