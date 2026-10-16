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

export const POLICY_VERSION = "pay-policy-v1";

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
  /** Payment facts. */
  payment: {
    id: string;
    status: string;
    amount: Money;
    capturedAmountMinor: number | null;
    providerAuthorizationId: string | null;
  };
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
  /** Most recent acceptance decision bound to a contract version, if any. */
  acceptanceDecision: {
    outcome: "PASS" | "FAIL" | "UNCERTAIN";
    contractVersion: number;
    contractHash: string;
  } | null;
  /** An open case that blocks capture, if any. */
  blockingCase?: { id: string; category: string } | null;
  /** True when a SUCCEEDED capture already exists for this payment. */
  hasSucceededCapture?: boolean;
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
  return checks;
}

function authorizeChecks(input: PaymentPolicyInput): PolicyCheck[] {
  const checks = commonChecks(input);
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

  const decision = input.acceptanceDecision;
  if (!decision) {
    checks.push(fail("verification.decision_present", "No acceptance decision exists"));
    checks.push(na("verification.passed", "No decision to evaluate"));
    checks.push(na("verification.contract_current", "No decision to evaluate"));
  } else {
    checks.push(
      decision.contractVersion === input.contract.currentVersion
        ? pass("verification.contract_current", "Decision refers to the current contract version")
        : fail("verification.contract_current", "Decision refers to a stale contract version", {
            decisionVersion: decision.contractVersion,
            currentVersion: input.contract.currentVersion,
          }),
    );
    checks.push(
      decision.contractHash === input.contract.currentHash
        ? pass("verification.hash_matches", "Decision is bound to the current contract hash")
        : fail("verification.hash_matches", "Decision is bound to a different contract hash"),
    );
    checks.push(
      decision.outcome === "PASS"
        ? pass("verification.passed", "Verification passed")
        : fail("verification.passed", `Verification outcome is ${decision.outcome}`, {
            outcome: decision.outcome,
          }),
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
    inputsHash: hashObject({
      action: input.action,
      paymentId: input.payment.id,
      paymentStatus: input.payment.status,
      amountMinor: input.payment.amount.amountMinor,
      currency: input.payment.amount.currency,
      agreementId: input.agreement.id,
      agreementStatus: input.agreement.status,
      agreementAmountMinor: input.agreement.amount.amountMinor,
      agreementContractVersion: input.agreement.contractVersion,
      contractVersion: input.contract.currentVersion,
      contractHash: input.contract.currentHash,
      contractBudgetMinor: input.contract.budget.amountMinor,
      decisionOutcome: input.acceptanceDecision?.outcome ?? null,
      decisionContractVersion: input.acceptanceDecision?.contractVersion ?? null,
      blockingCaseId: input.blockingCase?.id ?? null,
      hasSucceededCapture: input.hasSucceededCapture,
      systemPaymentPaused: input.systemPaymentPaused,
    }),
  };
}

/** Convenience: build a Money from policy input parts. */
export function amount(value: number, currency = "USD"): Money {
  return money(value, currency as Money["currency"]);
}
