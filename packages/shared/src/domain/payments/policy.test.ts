import { describe, expect, it } from "vitest";
import { evaluatePaymentPolicy, type PaymentPolicyInput } from "./policy.js";

const USD = (minor: number) => ({ amountMinor: minor, currency: "USD" as const });

/** A snapshot in which every capture condition holds. */
function validCaptureInput(): PaymentPolicyInput {
  return {
    action: "CAPTURE",
    task: { status: "PAYMENT_RELEASE", ownerUserId: "user_buyer" },
    payment: {
      id: "pay_1",
      mode: "FAKE",
      status: "AUTHORIZED",
      amount: USD(10000),
      capturedAmountMinor: null,
      providerAuthorizationId: "fake_auth_1",
      payerIdSnapshot: null,
      sellerMerchantIdSnapshot: null,
      authorizationValid: true,
    },
    paymentAccounts: null,
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
    workReviewDecision: {
      id: "wreview_1",
      kind: "FINAL",
      status: "FINAL_ACCEPTED",
      contractVersion: 1,
      contractHash: "contracthash",
      decisionByUserId: "user_buyer",
      decisionRole: "CLIENT",
      requirementCount: 3,
      assessmentCount: 3,
    },
    releaseApproval: {
      reviewId: "wreview_1",
      buyerUserId: "user_buyer",
      amount: USD(10000),
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

  it("DENYs when the final review was not accepted", () => {
    const input = validCaptureInput();
    input.workReviewDecision!.status = "CHANGES_REQUESTED";
    expect(evaluatePaymentPolicy(input).result).toBe("DENY");
    expect(reasonFor(input)).toBe("human_review.final_accepted");
  });

  it("DENYs when there is no final review decision", () => {
    const input = validCaptureInput();
    input.workReviewDecision = null;
    expect(reasonFor(input)).toBe("human_review.present");
  });

  it("DENYs when the decision is bound to a stale contract version", () => {
    const input = validCaptureInput();
    input.contract.currentVersion = 2;
    input.contract.currentHash = "newhash";
    expect(evaluatePaymentPolicy(input).result).toBe("DENY");
    expect(reasonFor(input)).toBe("contract.agreement_current");
  });

  it("DENYs when the review is bound to a different contract hash", () => {
    const input = validCaptureInput();
    input.workReviewDecision!.contractHash = "tampered";
    expect(reasonFor(input)).toBe("human_review.contract_current");
  });

  it("DENYs when a client review was not recorded by the task owner", () => {
    const input = validCaptureInput();
    input.workReviewDecision!.decisionByUserId = "user_other";
    expect(reasonFor(input)).toBe("human_review.authority");
  });

  it("DENYs when not every selected constraint was assessed", () => {
    const input = validCaptureInput();
    input.workReviewDecision!.assessmentCount = 2;
    expect(reasonFor(input)).toBe("human_review.constraints_assessed");
  });

  it("DENYs capture without explicit client payment-release approval", () => {
    const input = validCaptureInput();
    input.releaseApproval = null;
    expect(reasonFor(input)).toBe("payment_release.client_approved");
  });

  it("DENYs capture when release approval is bound to another amount", () => {
    const input = validCaptureInput();
    input.releaseApproval!.amount = USD(9_000);
    expect(reasonFor(input)).toBe("payment_release.amount_current");
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

  it("DENYs capture when the authorization expired", () => {
    const input = validCaptureInput();
    input.payment.authorizationValid = false;
    expect(reasonFor(input)).toBe("authorization.valid");
  });

  it("requires current linked PayPal accounts for PayPal captures", () => {
    const input = validCaptureInput();
    input.payment.mode = "PAYPAL_SANDBOX";
    input.payment.payerIdSnapshot = "PAYER123";
    input.payment.sellerMerchantIdSnapshot = "SELLER123";
    input.paymentAccounts = {
      payerLinked: true,
      sellerReady: true,
      payerIdCurrent: true,
      sellerMerchantIdCurrent: true,
    };
    expect(evaluatePaymentPolicy(input).result).toBe("ALLOW");
    input.paymentAccounts.sellerReady = false;
    expect(reasonFor(input)).toBe("paypal.accounts_current");
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

  it("hashes the authorization and exact review bindings", () => {
    const baseline = evaluatePaymentPolicy(validCaptureInput()).inputsHash;
    const changedAuthorization = validCaptureInput();
    changedAuthorization.payment.providerAuthorizationId = "fake_auth_2";
    const changedReview = validCaptureInput();
    changedReview.workReviewDecision!.id = "wreview_2";
    const changedAgreementCurrency = validCaptureInput();
    changedAgreementCurrency.agreement.amount = {
      amountMinor: changedAgreementCurrency.agreement.amount.amountMinor,
      currency: "EUR" as any,
    };
    expect(evaluatePaymentPolicy(changedAuthorization).inputsHash).not.toBe(baseline);
    expect(evaluatePaymentPolicy(changedReview).inputsHash).not.toBe(baseline);
    expect(evaluatePaymentPolicy(changedAgreementCurrency).inputsHash).not.toBe(baseline);
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

  it("DENYs capture while an accepted contract change awaits activation", () => {
    const input = validCaptureInput();
    input.pendingContractChange = { id: "chg_1" };
    expect(reasonFor(input)).toBe("contract.change_activation_pending");
  });
});
