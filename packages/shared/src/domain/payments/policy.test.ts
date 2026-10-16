import { describe, expect, it } from "vitest";
import { evaluatePaymentPolicy, type PaymentPolicyInput } from "./policy.js";

const USD = (minor: number) => ({ amountMinor: minor, currency: "USD" as const });

/** A snapshot in which every capture condition holds. */
function validCaptureInput(): PaymentPolicyInput {
  return {
    action: "CAPTURE",
    payment: {
      id: "pay_1",
      status: "AUTHORIZED",
      amount: USD(10000),
      capturedAmountMinor: null,
      providerAuthorizationId: "fake_auth_1",
    },
    agreement: {
      id: "agreement_1",
      status: "ACTIVE",
      amount: USD(10000),
      contractVersion: 1,
      agreementHash: "agreementhash",
    },
    contract: {
      id: "work_contract_1",
      currentVersion: 1,
      currentHash: "contracthash",
      budget: USD(15000),
    },
    acceptanceDecision: {
      outcome: "PASS",
      contractVersion: 1,
      contractHash: "contracthash",
    },
    blockingCase: null,
    hasSucceededCapture: false,
    systemPaymentPaused: false,
  };
}

function reasonFor(input: PaymentPolicyInput): string {
  return evaluatePaymentPolicy(input).reasonCode;
}

describe("payment policy (P1)", () => {
  it("ALLOWs a capture when every condition holds", () => {
    const decision = evaluatePaymentPolicy(validCaptureInput());
    expect(decision.result).toBe("ALLOW");
    expect(decision.checks.every((c) => c.result !== "FAIL")).toBe(true);
  });

  it("DENYs when verification did not pass", () => {
    const input = validCaptureInput();
    input.acceptanceDecision = {
      outcome: "FAIL",
      contractVersion: 1,
      contractHash: "contracthash",
    };
    expect(evaluatePaymentPolicy(input).result).toBe("DENY");
    expect(reasonFor(input)).toBe("verification.passed");
  });

  it("DENYs when there is no acceptance decision", () => {
    const input = validCaptureInput();
    input.acceptanceDecision = null;
    expect(reasonFor(input)).toBe("verification.decision_present");
  });

  it("DENYs when the decision is bound to a stale contract version", () => {
    const input = validCaptureInput();
    input.contract.currentVersion = 2;
    input.contract.currentHash = "newhash";
    expect(evaluatePaymentPolicy(input).result).toBe("DENY");
    expect(reasonFor(input)).toBe("contract.agreement_current");
  });

  it("DENYs when the decision is bound to a different contract hash", () => {
    const input = validCaptureInput();
    input.acceptanceDecision = {
      outcome: "PASS",
      contractVersion: 1,
      contractHash: "tampered",
    };
    expect(reasonFor(input)).toBe("verification.hash_matches");
  });

  it("DENYs when an open case blocks capture", () => {
    const input = validCaptureInput();
    input.blockingCase = { id: "case_1", category: "WORK_DISPUTE" };
    expect(reasonFor(input)).toBe("case.no_blocker");
  });

  it("DENYs when the payment is not authorized", () => {
    const input = validCaptureInput();
    input.payment.status = "PENDING";
    expect(reasonFor(input)).toBe("payment.authorized");
  });

  it("DENYs when a successful capture already exists", () => {
    const input = validCaptureInput();
    input.hasSucceededCapture = true;
    expect(reasonFor(input)).toBe("capture.not_already_done");
  });

  it("DENYs when the amount exceeds the contract budget", () => {
    const input = validCaptureInput();
    input.payment.amount = USD(20000);
    input.agreement.amount = USD(20000);
    expect(reasonFor(input)).toBe("amount.within_budget");
  });

  it("DENYs when the kill switch is on", () => {
    const input = validCaptureInput();
    input.systemPaymentPaused = true;
    expect(reasonFor(input)).toBe("system.kill_switch");
  });

  it("produces the same decision for the same facts (determinism)", () => {
    const a = evaluatePaymentPolicy(validCaptureInput());
    const b = evaluatePaymentPolicy(validCaptureInput());
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a.result).toBe(b.result);
  });

  it("changes the inputs hash when a relevant fact changes", () => {
    const a = evaluatePaymentPolicy(validCaptureInput());
    const modified = validCaptureInput();
    modified.payment.amount = USD(9000);
    const b = evaluatePaymentPolicy(modified);
    expect(a.inputsHash).not.toBe(b.inputsHash);
  });

  it("AUTHORIZEs a pending payment within budget", () => {
    const input = validCaptureInput();
    input.action = "AUTHORIZE";
    input.payment.status = "PENDING";
    input.payment.providerAuthorizationId = null;
    expect(evaluatePaymentPolicy(input).result).toBe("ALLOW");
  });

  it("AUTHORIZEs while the agreement is still PENDING_AUTHORIZATION", () => {
    // The agreement is created as PENDING_AUTHORIZATION and only becomes
    // AUTHORIZED after this call succeeds; the policy must not deadlock.
    const input = validCaptureInput();
    input.action = "AUTHORIZE";
    input.payment.status = "PENDING";
    input.payment.providerAuthorizationId = null;
    input.agreement.status = "PENDING_AUTHORIZATION";
    expect(evaluatePaymentPolicy(input).result).toBe("ALLOW");
  });

  it("DENYs capture while the agreement is still PENDING_AUTHORIZATION", () => {
    const input = validCaptureInput();
    input.agreement.status = "PENDING_AUTHORIZATION";
    expect(reasonFor(input)).toBe("agreement.active");
  });
});
