/**
 * Payment policy engine (Component 9, invariant P1).
 *
 * This is a pure, deterministic function. It takes a snapshot of the facts that
 * matter and returns ALLOW or DENY with a per-check record. No LLM, no network,
 * no clock, nothing that could make the same facts produce a different answer.
 *
 * P1: a capture is allowed only when every condition holds. The conditions are
 * expressed as named checks so a denial is explainable and auditable, and so the
 * UI can show exactly which condition blocked the money.
 *
 * The caller is responsible for loading the facts, persisting the decision, and
 * only then acting on it. A DENY is never retried; it is a statement about
 * state, not a transient failure.
 */
import { hashObject } from "../../platform/hashing.js";
import { money, type Money } from "../../platform/money.js";

export const POLICY_VERSION = "pay-policy-v4";

export type PaymentAction = "AUTHORIZE" | "CAPTURE" | "VOID" | "REFUND";
export type PolicyResult = "ALLOW" | "DENY";
export type CheckResult = "PASS" | "FAIL" | "NOT_APPLICABLE";

export interface PolicyCheck {
  checkId: string;
  result: CheckResult;
  message: string;
  detail?: Record<string, unknown>;
}

export interface PaymentPolicyInput {
  action: PaymentAction;
  task: {
    status: string;
    ownerUserId: string;
  };
  /** Payment facts. */
  payment: {
    id: string;
    mode: "FAKE" | "PAYPAL_SANDBOX" | "PAYPAL_LIVE";
    status: string;
    amount: Money;
    capturedAmountMinor: number | null;
    providerAuthorizationId: string | null;
    payerIdSnapshot: string | null;
    sellerMerchantIdSnapshot: string | null;
    authorizationValid: boolean;
  };
  paymentAccounts: {
    payerLinked: boolean;
    sellerReady: boolean;
    payerIdCurrent: boolean;
    sellerMerchantIdCurrent: boolean;
  } | null;
  /** Commercial agreement facts. */
  agreement: {
    id: string;
    status: string;
    amount: Money;
    contractVersion: number;
    agreementHash: string;
  };
  /** Current contract facts. */
  contract: {
    id: string;
    currentVersion: number;
    currentHash: string;
    budget: Money;
  };
  /** Current final review decision. */
  workReviewDecision?: {
    id: string;
    kind: "CHECKPOINT" | "FINAL";
    status: string;
    contractVersion: number;
    contractHash: string;
    decisionByUserId: string | null;
    decisionRole: "CLIENT" | "AGREED_REVIEWER" | null;
    requirementCount: number;
    assessmentCount: number;
  } | null;
  releaseApproval?: {
    reviewId: string;
    buyerUserId: string;
    amount: Money;
    contractVersion: number;
    contractHash: string;
  } | null;
  /** An open case that blocks capture, if any. */
  blockingCase?: { id: string; category: string } | null;
  /** True when a SUCCEEDED capture already exists for this payment. */
  hasSucceededCapture?: boolean;
  /** Accepted contract changes must be activated before capture can proceed. */
  pendingContractChange?: { id: string } | null;
  /** Global emergency kill switch. */
  systemPaymentPaused?: boolean;
}

export interface PolicyDecision {
  action: PaymentAction;
  result: PolicyResult;
  reasonCode: string;
  checks: PolicyCheck[];
  policyVersion: string;
  inputsHash: string;
}

function pass(checkId: string, message: string, detail?: Record<string, unknown>): PolicyCheck {
  return detail
    ? { checkId, result: "PASS", message, detail }
    : { checkId, result: "PASS", message };
}
function fail(checkId: string, message: string, detail?: Record<string, unknown>): PolicyCheck {
  return detail
    ? { checkId, result: "FAIL", message, detail }
    : { checkId, result: "FAIL", message };
}
function na(checkId: string, message: string): PolicyCheck {
  return { checkId, result: "NOT_APPLICABLE", message };
}

function sameMoney(a: Money, b: Money): boolean {
  return a.amountMinor === b.amountMinor && a.currency === b.currency;
}

/**
 * Agreement states from which each action may proceed. An agreement is created
 * as PENDING_AUTHORIZATION, so that is the state an authorization must be
 * allowed to move out of; a capture, by contrast, requires the payment to have
 * already been authorized (AUTHORIZED) or the work to be underway (ACTIVE).
 */
const AUTHORIZABLE_AGREEMENT_STATUSES = ["PENDING_AUTHORIZATION", "AUTHORIZED", "ACTIVE"];
const CAPTURABLE_AGREEMENT_STATUSES = ["AUTHORIZED", "ACTIVE"];

/** Checks shared by authorization and capture. */
function commonChecks(input: PaymentPolicyInput): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  checks.push(
    input.systemPaymentPaused
      ? fail("system.kill_switch", "Payments are paused by the emergency kill switch")
      : pass("system.kill_switch", "Payment system is active"),
  );

  const allowedAgreementStatuses =
    input.action === "AUTHORIZE" ? AUTHORIZABLE_AGREEMENT_STATUSES : CAPTURABLE_AGREEMENT_STATUSES;
  checks.push(
    allowedAgreementStatuses.includes(input.agreement.status)
      ? pass("agreement.active", `Agreement is ${input.agreement.status}`)
      : fail(
          "agreement.active",
          `Agreement cannot ${input.action.toLowerCase()} from status ${input.agreement.status}`,
          { allowed: allowedAgreementStatuses, actual: input.agreement.status },
        ),
  );
  checks.push(
    input.payment.amount.amountMinor <= input.contract.budget.amountMinor
      ? pass("amount.within_budget", "Payment is within the contract budget")
      : fail("amount.within_budget", "Payment exceeds the contract budget", {
          paymentMinor: input.payment.amount.amountMinor,
          budgetMinor: input.contract.budget.amountMinor,
        }),
  );
  checks.push(
    input.pendingContractChange
      ? fail(
          "contract.change_activation_pending",
          "An agreed contract change must be activated before payment can proceed",
          { changeRequestId: input.pendingContractChange.id },
        )
      : pass(
          "contract.change_activation_pending",
          "No agreed contract change is awaiting activation",
        ),
  );
  return checks;
}

function authorizeChecks(input: PaymentPolicyInput): PolicyCheck[] {
  const checks = commonChecks(input);
  if (input.payment.mode === "FAKE") {
    checks.push(na("paypal.accounts_current", "PayPal linking does not apply to demo payments"));
  } else if (!input.paymentAccounts) {
    checks.push(fail("paypal.accounts_current", "PayPal account readiness could not be loaded"));
  } else {
    // Buyer identity is established by PayPal when the buyer approves the
    // order. Before that redirect, only seller readiness can be proven.
    const accountsCurrent =
      input.paymentAccounts.sellerReady && input.paymentAccounts.sellerMerchantIdCurrent;
    checks.push(
      accountsCurrent
        ? pass("paypal.accounts_current", "The professional PayPal account is eligible")
        : fail(
            "paypal.accounts_current",
            "The professional PayPal account is missing, stale, or restricted",
            {
              ...input.paymentAccounts,
            },
          ),
    );
  }
  checks.push(
    input.payment.status === "PENDING"
      ? pass("payment.pending", "Payment is awaiting authorization")
      : fail("payment.pending", `Payment cannot be authorized from status ${input.payment.status}`),
  );
  checks.push(
    sameMoney(input.payment.amount, input.agreement.amount)
      ? pass("amount.matches_agreement", "Amount matches the agreement")
      : fail("amount.matches_agreement", "Amount does not match the agreement", {
          paymentMinor: input.payment.amount.amountMinor,
          agreementMinor: input.agreement.amount.amountMinor,
        }),
  );
  return checks;
}

function captureChecks(input: PaymentPolicyInput): PolicyCheck[] {
  const checks = commonChecks(input);

  checks.push(
    input.task.status === "PAYMENT_RELEASE"
      ? pass("task.payment_release", "Task reached the explicit payment release gate")
      : fail(
          "task.payment_release",
          `Task is not at the payment release gate (${input.task.status})`,
        ),
  );

  checks.push(
    input.payment.status === "AUTHORIZED"
      ? pass("payment.authorized", "Payment is authorized")
      : fail("payment.authorized", `Payment is not authorized (status ${input.payment.status})`),
  );

  checks.push(
    input.payment.providerAuthorizationId
      ? pass("authorization.present", "A provider authorization id is present")
      : fail("authorization.present", "No provider authorization id is recorded"),
  );
  checks.push(
    input.payment.authorizationValid
      ? pass("authorization.valid", "The authorization remains valid")
      : fail("authorization.valid", "The authorization is expired or has no valid expiry"),
  );
  if (input.payment.mode === "FAKE") {
    checks.push(
      na("paypal.accounts_current", "PayPal account checks do not apply to demo payments"),
    );
  } else if (!input.paymentAccounts) {
    checks.push(fail("paypal.accounts_current", "PayPal account readiness could not be loaded"));
  } else {
    const accountsCurrent =
      input.paymentAccounts.payerLinked &&
      input.paymentAccounts.sellerReady &&
      input.paymentAccounts.payerIdCurrent &&
      input.paymentAccounts.sellerMerchantIdCurrent;
    checks.push(
      accountsCurrent
        ? pass("paypal.accounts_current", "Buyer and professional PayPal accounts remain eligible")
        : fail(
            "paypal.accounts_current",
            "A linked PayPal account is missing, stale, or restricted",
            {
              ...input.paymentAccounts,
            },
          ),
    );
  }

  checks.push(
    !input.hasSucceededCapture
      ? pass("capture.not_already_done", "No successful capture exists yet")
      : fail("capture.not_already_done", "A successful capture already exists for this payment"),
  );

  checks.push(
    sameMoney(input.payment.amount, input.agreement.amount)
      ? pass("amount.matches_agreement", "Amount matches the agreement")
      : fail("amount.matches_agreement", "Amount does not match the agreement"),
  );

  // Contract freshness: the agreement and the acceptance decision must both
  // refer to the current contract version. A contract change invalidates them.
  checks.push(
    input.agreement.contractVersion === input.contract.currentVersion
      ? pass("contract.agreement_current", "Agreement refers to the current contract version")
      : fail("contract.agreement_current", "Agreement refers to a stale contract version", {
          agreementVersion: input.agreement.contractVersion,
          currentVersion: input.contract.currentVersion,
        }),
  );

  const finalReview = input.workReviewDecision;
  if (finalReview) {
    checks.push(pass("human_review.present", "A final review decision exists"));
    checks.push(
      finalReview.kind === "FINAL" && finalReview.status === "FINAL_ACCEPTED"
        ? pass("human_review.final_accepted", "The final review accepted the work")
        : fail("human_review.final_accepted", "The latest review is not a final acceptance"),
    );
    checks.push(
      finalReview.decisionRole === "CLIENT" &&
        finalReview.decisionByUserId === input.task.ownerUserId
        ? pass("human_review.authority", "The task owner recorded the final decision")
        : fail("human_review.authority", "The final decision was not recorded by the task owner"),
    );
    checks.push(
      finalReview.contractVersion === input.contract.currentVersion &&
        finalReview.contractHash === input.contract.currentHash
        ? pass("human_review.contract_current", "Review is bound to the current agreement")
        : fail("human_review.contract_current", "Review is bound to stale terms"),
    );
    checks.push(
      finalReview.requirementCount > 0 &&
        finalReview.assessmentCount >= finalReview.requirementCount
        ? pass(
            "human_review.constraints_assessed",
            "All selected agreement constraints were assessed",
          )
        : fail(
            "human_review.constraints_assessed",
            "The final review did not assess every constraint",
          ),
    );
  } else {
    checks.push(fail("human_review.present", "No final review acceptance exists"));
  }

  const releaseApproval = input.releaseApproval;
  if (!releaseApproval) {
    checks.push(
      fail("payment_release.client_approved", "The client has not approved payment release"),
    );
  } else {
    checks.push(
      releaseApproval.buyerUserId === input.task.ownerUserId
        ? pass("payment_release.client_approved", "The task owner approved payment release")
        : fail(
            "payment_release.client_approved",
            "Payment release approval belongs to another user",
          ),
    );
    checks.push(
      sameMoney(releaseApproval.amount, input.payment.amount)
        ? pass("payment_release.amount_current", "Release approval matches the authorized amount")
        : fail("payment_release.amount_current", "Release approval amount is stale"),
    );
    checks.push(
      releaseApproval.contractVersion === input.contract.currentVersion &&
        releaseApproval.contractHash === input.contract.currentHash &&
        releaseApproval.reviewId === finalReview?.id
        ? pass(
            "payment_release.binding_current",
            "Release approval matches the final review and agreement",
          )
        : fail(
            "payment_release.binding_current",
            "Release approval is bound to stale review terms",
          ),
    );
  }

  if (input.blockingCase) {
    checks.push(
      fail("case.no_blocker", "An open case blocks capture", {
        caseId: input.blockingCase.id,
        category: input.blockingCase.category,
      }),
    );
  } else {
    checks.push(pass("case.no_blocker", "No open case blocks capture"));
  }

  return checks;
}

/**
 * Evaluate the policy. Returns ALLOW only if no check failed. The reason code is
 * the first failing check, so it names the concrete thing that must change.
 */
export function evaluatePaymentPolicy(input: PaymentPolicyInput): PolicyDecision {
  const checks =
    input.action === "CAPTURE"
      ? captureChecks(input)
      : input.action === "AUTHORIZE"
        ? authorizeChecks(input)
        : [pass("action.supported", `Action ${input.action} is always permitted as a reversal`)];

  const firstFailure = checks.find((c) => c.result === "FAIL");
  const result: PolicyResult = firstFailure ? "DENY" : "ALLOW";
  const reasonCode = firstFailure ? firstFailure.checkId : "policy.allow";

  return {
    action: input.action,
    result,
    reasonCode,
    checks,
    policyVersion: POLICY_VERSION,
    inputsHash: hashObject(input),
  };
}

/** Convenience: build a Money from policy input parts. */
export function amount(value: number, currency = "USD"): Money {
  return money(value, currency as Money["currency"]);
}
