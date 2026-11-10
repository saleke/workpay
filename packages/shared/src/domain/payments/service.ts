/**
 * Payment service (Components 6 and 9). This is the most safety-critical code
 * in WorkPay, so the flow is deliberately explicit.
 *
 * Two invariants shape every function here:
 *
 *  - P4: a database transaction is never held open across a network call. The
 *    policy decision is computed and persisted first, then the gateway is
 *    called on its own, then the result is persisted in a fresh transaction.
 *
 *  - No LLM output ever reaches a gateway call. The amount comes only from the
 *    commercial agreement, and the only object that can trigger a capture is a
 *    payment command created by an ALLOW capture decision.
 *
 * The database is authoritative. `payment_operations` is append-only, and a
 * partial unique index allows at most one SUCCEEDED capture per payment, so a
 * retry (or a race) cannot double-spend.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { withTransaction } from "../../db/client.js";
import { cases } from "../../db/schema/cases.js";
import { workContracts } from "../../db/schema/contracts.js";
import { contractChangeRequests } from "../../db/schema/contract-changes.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import {
  paymentCommands,
  paymentDecisions,
  paymentOperations,
  paymentPolicyChecks,
  paymentReleaseApprovals,
  payments,
} from "../../db/schema/payments.js";
import { paypalIdentityLinks, providerPaypalAccounts } from "../../db/schema/paypal.js";
import { tasks } from "../../db/schema/tasks.js";
import { workExecutions } from "../../db/schema/execution.js";
import { workReviewAssessments, workReviews } from "../../db/schema/work-reviews.js";
import { appendEvent } from "../../events/outbox.js";
import { getPaymentGateway } from "../../integrations/payments/index.js";
import { isPayPalMode, paymentModeEnvironment } from "../../integrations/payments/config.js";
import { paypalRequestId } from "../../integrations/payments/idempotency.js";
import { getEnv } from "../../platform/env.js";
import { hashObject } from "../../platform/hashing.js";
import { logger } from "../../platform/logger.js";
import { money, type Money } from "../../platform/money.js";
import { newId } from "../../platform/ids.js";
import {
  authorizationError,
  conflict,
  externalUnknown,
  notFound,
  policyDenied,
} from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { assignExecution } from "../execution/service.js";
import { transitionTask } from "../tasks/service.js";
import { resolvePaymentParticipants } from "./mode.js";
import {
  evaluatePaymentPolicy,
  type PaymentAction,
  type PaymentPolicyInput,
  type PolicyDecision,
} from "./policy.js";

/** Create the payment for an agreement, or return the existing one. */
export async function ensurePaymentForAgreement(
  tx: Database,
  options: { taskId: string; agreementId: string; actor: Actor; correlationId: string },
) {
  const [existing] = await tx
    .select()
    .from(payments)
    .where(eq(payments.taskId, options.taskId))
    .limit(1);
  const participants = await resolvePaymentParticipants(tx, options.taskId, options.agreementId);
  if (existing) {
    if (
      existing.agreementId !== participants.agreement.id ||
      (existing.mode === "FAKE"
        ? participants.mode !== "FAKE"
        : !isPayPalMode(existing.mode) || !isPayPalMode(participants.mode)) ||
      existing.buyerUserId !== participants.buyer.id ||
      existing.providerId !== participants.provider.id
    ) {
      throw conflict("The existing payment is bound to different participants, terms, or mode.");
    }
    return existing;
  }

  let payerIdSnapshot: string | null = null;
  let sellerMerchantIdSnapshot: string | null = null;
  if (isPayPalMode(participants.mode)) {
    const environment = paymentModeEnvironment(participants.mode);
    const [identityLink] = await tx
      .select()
      .from(paypalIdentityLinks)
      .where(
        and(
          eq(paypalIdentityLinks.userId, participants.buyer.id),
          eq(paypalIdentityLinks.environment, environment),
          eq(paypalIdentityLinks.status, "LINKED"),
        ),
      )
      .limit(1);
    if (!identityLink?.accountVerified || !identityLink.emailVerified) {
      throw conflict(
        `Link and verify the buyer's PayPal ${environment.toLowerCase()} account first.`,
      );
    }
    const [sellerAccount] = await tx
      .select()
      .from(providerPaypalAccounts)
      .where(
        and(
          eq(providerPaypalAccounts.providerId, participants.provider.id),
          eq(providerPaypalAccounts.environment, environment),
          eq(providerPaypalAccounts.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (
      !sellerAccount?.merchantId ||
      !sellerAccount.paymentsReceivable ||
      !sellerAccount.primaryEmailConfirmed ||
      !sellerAccount.consentStatus
    ) {
      throw conflict(
        `The professional must complete PayPal ${environment.toLowerCase()} seller onboarding first.`,
      );
    }
    payerIdSnapshot = identityLink.payerId;
    sellerMerchantIdSnapshot = sellerAccount.merchantId;
    if (payerIdSnapshot === sellerMerchantIdSnapshot) {
      throw conflict("The buyer and professional must use different PayPal accounts.");
    }
  }

  // The amount is copied from the agreement, never from a request body.
  const [payment] = await tx
    .insert(payments)
    .values({
      id: newId("pay"),
      taskId: options.taskId,
      agreementId: participants.agreement.id,
      mode: participants.mode,
      buyerUserId: participants.buyer.id,
      providerId: participants.provider.id,
      payerIdSnapshot,
      sellerMerchantIdSnapshot,
      amountMinor: participants.agreement.agreedPriceMinor,
      currency: participants.agreement.currency,
      status: "PENDING",
    })
    .returning();
  if (!payment) throw new Error("Payment insert returned no row");
  return payment;
}

/**
 * Gather every fact the policy engine needs and evaluate it. Pure database
 * reads plus the pure policy function; no network.
 */
async function evaluateAndRecord(
  tx: Database,
  options: {
    paymentId: string;
    action: PaymentAction;
    actor: Actor;
    correlationId: string;
    paymentStatusOverride?: string;
  },
): Promise<{
  decision: PolicyDecision;
  decisionId: string;
  payment: typeof payments.$inferSelect;
  agreementContractVersion: number;
}> {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, options.paymentId))
    .for("update")
    .limit(1);
  if (!payment) throw notFound("Payment");

  const [task] = await tx.select().from(tasks).where(eq(tasks.id, payment.taskId)).limit(1);
  if (!task) throw notFound("Task");

  const [agreement] = await tx
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.id, payment.agreementId))
    .limit(1);
  if (!agreement) throw notFound("Agreement");
  const participants = await resolvePaymentParticipants(tx, payment.taskId, payment.agreementId);
  if (
    (payment.mode === "FAKE"
      ? participants.mode !== "FAKE"
      : !isPayPalMode(payment.mode) || !isPayPalMode(participants.mode)) ||
    participants.buyer.id !== payment.buyerUserId ||
    participants.provider.id !== payment.providerId
  ) {
    throw policyDenied(
      "payment.binding_current",
      "The payment no longer matches the current account classes or participants.",
    );
  }

  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(and(eq(workContracts.taskId, payment.taskId), eq(workContracts.status, "ACTIVE")))
    .orderBy(desc(workContracts.version))
    .limit(1);
  if (!contract) throw notFound("Contract");

  const [latestWorkReview] = await tx
    .select()
    .from(workReviews)
    .where(and(eq(workReviews.taskId, payment.taskId), eq(workReviews.status, "FINAL_ACCEPTED")))
    .orderBy(desc(workReviews.decidedAt))
    .limit(1);
  const [workReviewAssessmentCount] = latestWorkReview
    ? await tx
        .select({ count: count() })
        .from(workReviewAssessments)
        .where(eq(workReviewAssessments.reviewId, latestWorkReview.id))
    : [];
  const [releaseApproval] = await tx
    .select()
    .from(paymentReleaseApprovals)
    .where(eq(paymentReleaseApprovals.paymentId, payment.id))
    .limit(1);

  const [blockingCase] = await tx
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.taskId, payment.taskId),
        eq(cases.blocksPaymentCapture, true),
        inArray(cases.status, ["OPEN", "AWAITING_RESPONSE", "UNDER_REVIEW"]),
      ),
    )
    .limit(1);

  const [pendingContractChange] = await tx
    .select({ id: contractChangeRequests.id })
    .from(contractChangeRequests)
    .where(
      and(
        eq(contractChangeRequests.taskId, payment.taskId),
        inArray(contractChangeRequests.status, [
          "ACCEPTED_PENDING_ACTIVATION",
          "ACTIVATING",
          "ACTIVATION_RECONCILIATION_REQUIRED",
          "CANCELLATION_PENDING",
        ]),
      ),
    )
    .limit(1);

  const [succeededCapture] = await tx
    .select({ id: paymentOperations.id })
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.paymentId, payment.id),
        eq(paymentOperations.action, "CAPTURE"),
        eq(paymentOperations.status, "SUCCEEDED"),
      ),
    )
    .limit(1);

  const blockingCaseOpen = blockingCase
    ? { id: blockingCase.id, category: blockingCase.category }
    : null;

  let paymentAccounts: PaymentPolicyInput["paymentAccounts"] = null;
  if (isPayPalMode(payment.mode)) {
    const environment = paymentModeEnvironment(payment.mode);
    const [[identityLink], [sellerAccount]] = await Promise.all([
      tx
        .select()
        .from(paypalIdentityLinks)
        .where(
          and(
            eq(paypalIdentityLinks.userId, payment.buyerUserId),
            eq(paypalIdentityLinks.environment, environment),
            eq(paypalIdentityLinks.status, "LINKED"),
          ),
        )
        .limit(1),
      tx
        .select()
        .from(providerPaypalAccounts)
        .where(
          and(
            eq(providerPaypalAccounts.providerId, payment.providerId),
            eq(providerPaypalAccounts.environment, environment),
            eq(providerPaypalAccounts.status, "ACTIVE"),
          ),
        )
        .limit(1),
    ]);
    paymentAccounts = {
      payerLinked: Boolean(identityLink?.accountVerified && identityLink.emailVerified),
      sellerReady: Boolean(
        sellerAccount?.paymentsReceivable &&
        sellerAccount.primaryEmailConfirmed &&
        sellerAccount.consentStatus,
      ),
      payerIdCurrent: identityLink?.payerId === payment.payerIdSnapshot,
      sellerMerchantIdCurrent: sellerAccount?.merchantId === payment.sellerMerchantIdSnapshot,
    };
  }

  const input: PaymentPolicyInput = {
    action: options.action,
    task: { status: task.status, ownerUserId: task.userId },
    payment: {
      id: payment.id,
      mode: payment.mode,
      status: options.paymentStatusOverride ?? payment.status,
      amount: money(payment.amountMinor, payment.currency as Money["currency"]),
      capturedAmountMinor: payment.capturedAmountMinor ?? null,
      providerAuthorizationId: payment.providerAuthorizationId ?? null,
      payerIdSnapshot: payment.payerIdSnapshot,
      sellerMerchantIdSnapshot: payment.sellerMerchantIdSnapshot,
      authorizationValid:
        payment.authorizationExpiresAt !== null && payment.authorizationExpiresAt > new Date(),
    },
    paymentAccounts,
    agreement: {
      id: agreement.id,
      status: agreement.status,
      amount: money(agreement.agreedPriceMinor, agreement.currency as Money["currency"]),
      contractVersion: agreement.contractVersion,
      agreementHash: agreement.agreementHash,
    },
    contract: {
      id: contract.id,
      currentVersion: contract.version,
      currentHash: contract.contractHash,
      budget: money(contract.budgetMinor, contract.currency as Money["currency"]),
    },
    workReviewDecision: latestWorkReview
      ? {
          id: latestWorkReview.id,
          kind: latestWorkReview.kind,
          status: latestWorkReview.status,
          contractVersion: latestWorkReview.contractVersion,
          contractHash: latestWorkReview.contractHash,
          decisionByUserId: latestWorkReview.decisionByUserId,
          decisionRole: latestWorkReview.decisionRole as "CLIENT" | "AGREED_REVIEWER" | null,
          requirementCount: Array.isArray(latestWorkReview.requirementKeys)
            ? latestWorkReview.requirementKeys.filter((key) => typeof key === "string").length
            : 0,
          assessmentCount: workReviewAssessmentCount?.count ?? 0,
        }
      : null,
    releaseApproval: releaseApproval
      ? {
          reviewId: releaseApproval.reviewId,
          buyerUserId: releaseApproval.buyerUserId,
          amount: money(
            releaseApproval.amountMinor,
            releaseApproval.currency as Money["currency"],
          ),
          contractVersion: releaseApproval.contractVersion,
          contractHash: releaseApproval.contractHash,
        }
      : null,
    blockingCase: blockingCaseOpen,
    hasSucceededCapture: Boolean(succeededCapture),
    pendingContractChange: pendingContractChange ?? null,
    systemPaymentPaused: getEnv().SYSTEM_PAYMENT_PAUSE,
  };

  const decision = evaluatePaymentPolicy(input);

  const decisionId = newId("pdec");
  await tx.insert(paymentDecisions).values({
    id: decisionId,
    paymentId: payment.id,
    taskId: payment.taskId,
    action: options.action,
    result: decision.result,
    reasonCode: decision.reasonCode,
    policyVersion: decision.policyVersion,
    inputsHash: decision.inputsHash,
    detail: { checks: decision.checks },
  });
  await tx.insert(paymentPolicyChecks).values(
    decision.checks.map((check, i) => ({
      id: newId("pcheck"),
      decisionId,
      checkId: check.checkId,
      result: check.result,
      message: check.message,
      detail: check.detail ?? null,
      position: i,
    })),
  );

  await appendEvent(tx, {
    type: "PAYMENT_POLICY_EVALUATED",
    aggregateId: payment.id,
    taskId: payment.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: payment.taskId,
      paymentId: payment.id,
      decisionId,
      action: options.action,
      result: decision.result,
      reasonCode: decision.reasonCode,
      policyVersion: decision.policyVersion,
    },
  });

  return { decision, decisionId, payment, agreementContractVersion: agreement.contractVersion };
}

export interface PolicyOutcome {
  decision: PolicyDecision;
  decisionId: string;
  /** Present only when a capture command was created (ALLOW on capture). */
  captureCommandId?: string;
}

export async function evaluatePaymentAction(options: {
  paymentId: string;
  action: PaymentAction;
  actor: Actor;
  correlationId: string;
  paymentStatusOverride?: string;
}): Promise<PolicyOutcome> {
  const result = await withTransaction((tx) => evaluateAndRecord(tx, options));
  return { decision: result.decision, decisionId: result.decisionId };
}

/**
 * Authorize the payment with the gateway.
 *
 * 1. Evaluate and persist the AUTHORIZE decision (transaction 1).
 * 2. If ALLOW, call the gateway with a stable idempotency key (no transaction).
 * 3. Persist the operation and update the payment (transaction 2).
 */
export async function authorizePayment(options: {
  paymentId: string;
  actor: Actor;
  correlationId: string;
}): Promise<PolicyOutcome> {
  const { decision, decisionId, payment, agreementContractVersion } = await withTransaction((tx) =>
    evaluateAndRecord(tx, {
      paymentId: options.paymentId,
      action: "AUTHORIZE",
      actor: options.actor,
      correlationId: options.correlationId,
    }),
  );

  if (decision.result === "DENY") {
    return { decision, decisionId };
  }
  if (payment.mode !== "FAKE") {
    throw conflict("PayPal payments require explicit buyer approval before authorization.");
  }

  const amount = money(payment.amountMinor, payment.currency as Money["currency"]);
  const idempotencyKey = paypalRequestId(
    "payment-authorize",
    `${payment.id}:v${agreementContractVersion}`,
  );

  await withTransaction(async (tx) => {
    await tx
      .update(payments)
      .set({ status: "AUTHORIZATION_REQUESTED", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await appendEvent(tx, {
      type: "PAYMENT_AUTHORIZATION_REQUESTED",
      aggregateId: payment.id,
      taskId: payment.taskId,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: payment.taskId,
        paymentId: payment.id,
        amount: { amountMinor: amount.amountMinor, currency: amount.currency },
        simulated: payment.mode === "FAKE",
      },
    });
  });

  // Network call, deliberately outside any transaction (P4).
  const gateway = getPaymentGateway(payment.mode);
  const result = await gateway.authorize({
    orderId: payment.id,
    amount,
    description: `WorkPay task ${payment.taskId}`,
    idempotencyKey,
  });

  await withTransaction(async (tx) => {
    await tx.insert(paymentOperations).values({
      id: newId("poper"),
      paymentId: payment.id,
      taskId: payment.taskId,
      action: "AUTHORIZE",
      status:
        result.status === "SUCCESS"
          ? "SUCCEEDED"
          : result.status === "DECLINED"
            ? "FAILED"
            : "UNKNOWN",
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      idempotencyKey,
      providerOperationId: result.authorizationId ?? null,
      requestHash: hashObject({ orderId: payment.id, amount, idempotencyKey }),
      rawResponse: result as unknown as Record<string, unknown>,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
    });

    if (result.status === "SUCCESS") {
      await tx
        .update(payments)
        .set({
          status: "AUTHORIZED",
          providerAuthorizationId: result.authorizationId ?? null,
          providerOrderId: result.providerOrderId ?? null,
          authorizedAt: new Date(),
          authorizationExpiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      await tx
        .update(commercialAgreements)
        .set({ status: "AUTHORIZED", updatedAt: new Date() })
        .where(eq(commercialAgreements.id, payment.agreementId));
      await appendEvent(tx, {
        type: "PAYMENT_AUTHORIZED",
        aggregateId: payment.id,
        taskId: payment.taskId,
        actor: toEventActor(options.actor),
        correlationId: options.correlationId,
        payload: {
          taskId: payment.taskId,
          paymentId: payment.id,
          amount: { amountMinor: amount.amountMinor, currency: amount.currency },
          paypalAuthorizationId: result.authorizationId ?? null,
          simulated: payment.mode === "FAKE",
        },
      });
    } else if (result.status === "DECLINED") {
      await tx
        .update(payments)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      await appendEvent(tx, {
        type: "PAYMENT_AUTHORIZATION_FAILED",
        aggregateId: payment.id,
        taskId: payment.taskId,
        actor: toEventActor(options.actor),
        correlationId: options.correlationId,
        payload: {
          taskId: payment.taskId,
          paymentId: payment.id,
          reason: result.errorMessage ?? "declined",
        },
      });
    } else {
      // UNKNOWN: leave the payment in a reconcilable state. Do not guess.
      await tx
        .update(payments)
        .set({ status: "UNKNOWN", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
  });

  return { decision, decisionId };
}

/**
 * Authorize a task payment and create the assignment once both parties have
 * agreed on the commercial terms. This is the explicit buyer authorization path
 * and it must remain gated by task state and agreement integrity checks.
 */
export async function simulateAuthorizationAndAssign(options: {
  taskId: string;
  actor: Actor;
  correlationId: string;
}): Promise<{ paymentId: string; executionId: string; alreadyPrepared: boolean }> {
  const prepared = await withTransaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, options.taskId))
      .for("update")
      .limit(1);
    if (!task || options.actor.kind !== "USER" || options.actor.id !== task.userId) {
      throw authorizationError("Only the task owner may authorize the payment.");
    }

    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.taskId, task.id))
      .for("update")
      .limit(1);
    if (!agreement) throw conflict("Both parties must agree commercial terms first.");
    const participants = await resolvePaymentParticipants(tx, task.id, agreement.id);
    if (participants.mode !== "FAKE") {
      throw conflict("Authenticated member accounts must approve the PayPal order instead.");
    }

    const [contract] = await tx
      .select()
      .from(workContracts)
      .where(eq(workContracts.id, agreement.contractId))
      .limit(1);
    if (
      !contract ||
      contract.status !== "ACTIVE" ||
      contract.version !== agreement.contractVersion
    ) {
      throw conflict("The commercial agreement is not bound to the current active contract.");
    }

    const [existingExecution] = await tx
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.taskId, task.id))
      .limit(1);
    const [existingPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.taskId, task.id))
      .limit(1);
    if (existingExecution && existingPayment?.status === "AUTHORIZED") {
      return {
        agreement,
        contract,
        paymentId: existingPayment.id,
        executionId: existingExecution.id,
        alreadyPrepared: true,
        needsAuthorization: false,
      };
    }
    if (existingExecution) {
      throw conflict("A work assignment already exists without a confirmed authorization outcome.");
    }
    if (task.status !== "AGREEMENT_READY") {
      throw conflict("The task is not ready for payment-policy validation.", {
        taskStatus: task.status,
      });
    }

    await transitionTask(tx, {
      taskId: task.id,
      to: "PAYMENT_AUTHORIZATION",
      actor: options.actor,
      correlationId: options.correlationId,
    });
    const payment = await ensurePaymentForAgreement(tx, {
      taskId: task.id,
      agreementId: agreement.id,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    return {
      agreement,
      contract,
      paymentId: payment.id,
      executionId: null,
      alreadyPrepared: false,
      needsAuthorization: payment.status !== "AUTHORIZED",
    };
  });

  if (prepared.alreadyPrepared && prepared.executionId) {
    return {
      paymentId: prepared.paymentId,
      executionId: prepared.executionId,
      alreadyPrepared: true,
    };
  }

  if (prepared.needsAuthorization) {
    const outcome = await authorizePayment({
      paymentId: prepared.paymentId,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (outcome.decision.result === "DENY") {
      await withTransaction(async (tx) => {
        const [task] = await tx
          .select()
          .from(tasks)
          .where(eq(tasks.id, options.taskId))
          .for("update")
          .limit(1);
        if (task?.status === "PAYMENT_AUTHORIZATION") {
          await transitionTask(tx, {
            taskId: task.id,
            to: "AGREEMENT_READY",
            actor: options.actor,
            correlationId: options.correlationId,
          });
        }
      });
      throw policyDenied(outcome.decision.reasonCode, "The payment policy refused authorization.");
    }
  }

  return withTransaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, prepared.paymentId))
      .for("update")
      .limit(1);
    if (!payment) throw notFound("Payment");
    if (payment.status === "UNKNOWN" || payment.status === "AUTHORIZATION_REQUESTED") {
      throw externalUnknown(
        "The authorization outcome is uncertain and must be reconciled before assignment.",
        { paymentId: payment.id },
      );
    }
    if (payment.status !== "AUTHORIZED") {
      throw conflict("The authorization did not complete successfully.", {
        paymentStatus: payment.status,
      });
    }
    const [existingExecution] = await tx
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.taskId, options.taskId))
      .limit(1);
    if (existingExecution) {
      return {
        paymentId: payment.id,
        executionId: existingExecution.id,
        alreadyPrepared: true,
      };
    }
    const execution = await assignExecution(tx, {
      taskId: options.taskId,
      contractId: prepared.contract.id,
      contractVersion: prepared.contract.version,
      contractHash: prepared.contract.contractHash,
      agreementId: prepared.agreement.id,
      providerId: prepared.agreement.providerId,
    });
    return {
      paymentId: payment.id,
      executionId: execution.id,
      alreadyPrepared: false,
    };
  });
}

/**
 * Request capture: evaluate policy and, on ALLOW, create the capture command.
 * The command is the only thing that can trigger a gateway capture.
 */
export async function requestCapture(options: {
  paymentId: string;
  actor: Actor;
  correlationId: string;
}): Promise<PolicyOutcome> {
  return withTransaction(async (tx) => {
    const { decision, decisionId, payment } = await evaluateAndRecord(tx, {
      paymentId: options.paymentId,
      action: "CAPTURE",
      actor: options.actor,
      correlationId: options.correlationId,
    });

    if (decision.result === "DENY") {
      return { decision, decisionId };
    }

    const amount = money(payment.amountMinor, payment.currency as Money["currency"]);
    const captureCommandId = newId("pcmd");
    const idempotencyKey = paypalRequestId("payment-capture", payment.id);
    await tx.insert(paymentCommands).values({
      id: captureCommandId,
      paymentId: payment.id,
      taskId: payment.taskId,
      decisionId,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      idempotencyKey,
    });
    await tx
      .update(payments)
      .set({ status: "CAPTURE_REQUESTED", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await appendEvent(tx, {
      type: "CAPTURE_COMMAND_CREATED",
      aggregateId: payment.id,
      taskId: payment.taskId,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: payment.taskId,
        paymentId: payment.id,
        captureCommandId,
        amount: { amountMinor: amount.amountMinor, currency: amount.currency },
      },
    });

    return { decision, decisionId, captureCommandId };
  });
}

/**
 * Execute a capture command against the gateway.
 *
 * The command carries the idempotency key, so calling this twice for the same
 * command is safe: the gateway returns the original result and the operation
 * row's unique idempotency key prevents a second insert.
 */
export async function executeCapture(options: {
  captureCommandId: string;
  actor: Actor;
  correlationId: string;
}): Promise<{ status: string; captureId?: string }> {
  const prepared = await withTransaction(async (tx) => {
    const [command] = await tx
      .select()
      .from(paymentCommands)
      .where(eq(paymentCommands.id, options.captureCommandId))
      .for("update")
      .limit(1);
    if (!command) throw notFound("Capture command");
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, command.paymentId))
      .for("update")
      .limit(1);
    if (!payment) throw notFound("Payment");
    const [operation] = await tx
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.idempotencyKey, command.idempotencyKey))
      .limit(1);
    if (operation?.status === "SUCCEEDED") {
      return {
        alreadyCaptured: true as const,
        captureId: operation.providerOperationId ?? undefined,
      };
    }
    if (operation) {
      throw externalUnknown("A prior capture attempt requires reconciliation before retrying.");
    }
    if (command.consumed) throw conflict("The capture command was already consumed.");
    if (getEnv().SYSTEM_PAYMENT_PAUSE) {
      throw policyDenied("system.kill_switch", "Payments are paused.");
    }
    const [task] = await tx
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, payment.taskId))
      .limit(1);
    if (task?.status !== "PAYMENT_RELEASE") {
      throw policyDenied(
        "task.payment_release",
        "The task is no longer at the payment release gate.",
      );
    }
    const [blockingCase] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.taskId, payment.taskId),
          eq(cases.blocksPaymentCapture, true),
          inArray(cases.status, ["OPEN", "AWAITING_RESPONSE", "UNDER_REVIEW"]),
        ),
      )
      .limit(1);
    if (blockingCase) {
      throw policyDenied("case.no_blocker", "An open case blocks payment release.");
    }
    if (payment.status !== "CAPTURE_REQUESTED" || !payment.providerAuthorizationId) {
      throw conflict("Payment does not have an active capture request.");
    }
    if (!payment.authorizationExpiresAt || payment.authorizationExpiresAt <= new Date()) {
      throw policyDenied("authorization.valid", "The PayPal authorization is expired.");
    }
    if (isPayPalMode(payment.mode)) {
      const environment = paymentModeEnvironment(payment.mode);
      const [[identityLink], [sellerAccount]] = await Promise.all([
        tx
          .select()
          .from(paypalIdentityLinks)
          .where(
            and(
              eq(paypalIdentityLinks.userId, payment.buyerUserId),
              eq(paypalIdentityLinks.environment, environment),
              eq(paypalIdentityLinks.status, "LINKED"),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(providerPaypalAccounts)
          .where(
            and(
              eq(providerPaypalAccounts.providerId, payment.providerId),
              eq(providerPaypalAccounts.environment, environment),
              eq(providerPaypalAccounts.status, "ACTIVE"),
            ),
          )
          .limit(1),
      ]);
      if (
        identityLink?.payerId !== payment.payerIdSnapshot ||
        sellerAccount?.merchantId !== payment.sellerMerchantIdSnapshot ||
        !sellerAccount.paymentsReceivable ||
        !sellerAccount.primaryEmailConfirmed ||
        !sellerAccount.consentStatus
      ) {
        throw policyDenied(
          "paypal.accounts_current",
          "A linked PayPal account is no longer eligible.",
        );
      }
    }
    const [claimedCommand] = await tx
      .update(paymentCommands)
      .set({ consumed: true, consumedAt: new Date() })
      .where(and(eq(paymentCommands.id, command.id), eq(paymentCommands.consumed, false)))
      .returning();
    if (!claimedCommand) {
      throw externalUnknown("The capture command is already being executed or reconciled.");
    }
    return { alreadyCaptured: false as const, command: claimedCommand, payment };
  });
  if (prepared.alreadyCaptured) {
    return {
      status: "SUCCESS",
      ...(prepared.captureId ? { captureId: prepared.captureId } : {}),
    };
  }
  const { command, payment } = prepared;

  const amount = money(command.amountMinor, command.currency as Money["currency"]);
  const gateway = getPaymentGateway(payment.mode);
  const gatewayResult = await gateway.capture({
    authorizationId: payment.providerAuthorizationId!,
    amount,
    idempotencyKey: command.idempotencyKey,
    ...(payment.sellerMerchantIdSnapshot
      ? { payeeMerchantId: payment.sellerMerchantIdSnapshot }
      : {}),
  });
  const result =
    gatewayResult.status === "SUCCESS" &&
    isPayPalMode(payment.mode) &&
    (!gatewayResult.captureId ||
      gatewayResult.providerStatus !== "COMPLETED" ||
      gatewayResult.amount?.amountMinor !== amount.amountMinor ||
      gatewayResult.amount.currency !== amount.currency ||
      gatewayResult.authorizationId !== payment.providerAuthorizationId ||
      gatewayResult.orderId !== payment.providerOrderId ||
      gatewayResult.payeeMerchantId !== payment.sellerMerchantIdSnapshot)
      ? ({
          ...gatewayResult,
          status: "UNKNOWN" as const,
          errorCode: "CAPTURE_BINDING_UNCONFIRMED",
          errorMessage: "PayPal capture response did not match the authorized payment.",
        } satisfies typeof gatewayResult)
      : gatewayResult;

  await withTransaction(async (tx) => {
    const operationStatus =
      result.status === "SUCCESS"
        ? "SUCCEEDED"
        : result.status === "DECLINED"
          ? "FAILED"
          : "UNKNOWN";

    const [operation] = await tx
      .insert(paymentOperations)
      .values({
        id: newId("poper"),
        paymentId: payment.id,
        taskId: payment.taskId,
        action: "CAPTURE",
        status: operationStatus,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        idempotencyKey: command.idempotencyKey,
        providerOperationId: result.captureId ?? null,
        requestHash: hashObject({
          mode: payment.mode,
          authorizationId: payment.providerAuthorizationId,
          payeeMerchantId: payment.sellerMerchantIdSnapshot,
          amount,
          idempotencyKey: command.idempotencyKey,
        }),
        rawResponse: result as unknown as Record<string, unknown>,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: paymentOperations.id });

    // Another finalizer already owns this provider result. It alone may emit
    // events or change financial state.
    if (!operation) return;

    if (result.status === "SUCCESS") {
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: "CAPTURED",
          providerCaptureId: result.captureId ?? null,
          capturedAmountMinor: amount.amountMinor,
          capturedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(payments.id, payment.id),
            inArray(payments.status, ["CAPTURE_REQUESTED", "UNKNOWN"]),
          ),
        )
        .returning({ id: payments.id });
      if (!updatedPayment) {
        throw conflict("Payment is no longer eligible for capture finalization.");
      }
      await tx
        .update(commercialAgreements)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(commercialAgreements.id, payment.agreementId));
      await appendEvent(tx, {
        type: "PAYMENT_CAPTURED",
        aggregateId: payment.id,
        taskId: payment.taskId,
        actor: toEventActor(options.actor),
        correlationId: options.correlationId,
        payload: {
          taskId: payment.taskId,
          paymentId: payment.id,
          amount: { amountMinor: amount.amountMinor, currency: amount.currency },
          paypalCaptureId: result.captureId ?? null,
          simulated: payment.mode === "FAKE",
        },
      });
    } else if (result.status === "DECLINED") {
      const [updatedPayment] = await tx
        .update(payments)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "CAPTURE_REQUESTED")))
        .returning({ id: payments.id });
      if (updatedPayment) {
        await appendEvent(tx, {
          type: "PAYMENT_CAPTURE_FAILED",
          aggregateId: payment.id,
          taskId: payment.taskId,
          actor: toEventActor(options.actor),
          correlationId: options.correlationId,
          payload: {
            taskId: payment.taskId,
            paymentId: payment.id,
            reason: result.errorMessage ?? "declined",
          },
        });
      }
    } else {
      await tx
        .update(payments)
        .set({
          status: "UNKNOWN",
          ...(result.captureId ? { providerCaptureId: result.captureId } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "CAPTURE_REQUESTED")));
      logger.warn(
        { paymentId: payment.id, captureCommandId: command.id },
        "capture returned UNKNOWN; reconciliation required",
      );
    }
  });

  return { status: result.status, ...(result.captureId ? { captureId: result.captureId } : {}) };
}

export async function executeCaptureAndComplete(options: {
  captureCommandId: string;
  actor: Actor;
  correlationId: string;
}) {
  const result = await executeCapture(options);
  if (result.status !== "SUCCESS") return result;
  await withTransaction(async (tx) => {
    const [command] = await tx
      .select({ paymentId: paymentCommands.paymentId })
      .from(paymentCommands)
      .where(eq(paymentCommands.id, options.captureCommandId))
      .limit(1);
    if (!command) throw notFound("Capture command");
    const [payment] = await tx
      .select({ taskId: payments.taskId })
      .from(payments)
      .where(eq(payments.id, command.paymentId))
      .limit(1);
    if (!payment) throw notFound("Payment");
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, payment.taskId))
      .for("update")
      .limit(1);
    if (!task || task.status === "COMPLETED") return;
    if (task.status !== "PAYMENT_RELEASE") {
      throw conflict("Captured payment cannot complete a task outside the release state.", {
        taskStatus: task.status,
      });
    }
    await transitionTask(tx, {
      taskId: task.id,
      to: "COMPLETED",
      actor: options.actor,
      correlationId: options.correlationId,
      patch: { completedAt: new Date() },
    });
    await appendEvent(tx, {
      type: "TASK_COMPLETED",
      aggregateId: task.id,
      taskId: task.id,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: { taskId: task.id },
    });
  });
  return result;
}

/**
 * Convenience orchestration used by the agent/job and the API: request then
 * execute a capture. Returns the policy decision either way.
 */
export async function captureIfAllowed(options: {
  paymentId: string;
  actor: Actor;
  correlationId: string;
}): Promise<PolicyOutcome & { captured: boolean }> {
  const outcome = await requestCapture(options);
  if (outcome.decision.result === "DENY" || !outcome.captureCommandId) {
    return { ...outcome, captured: false };
  }
  const result = await executeCaptureAndComplete({
    captureCommandId: outcome.captureCommandId,
    actor: options.actor,
    correlationId: options.correlationId,
  });
  return { ...outcome, captured: result.status === "SUCCESS" };
}

export async function approvePaymentReleaseForTask(options: {
  taskId: string;
  expectedPaymentId: string;
  expectedAmountMinor: number;
  expectedCurrency: "USD";
  actor: Actor;
  correlationId: string;
}) {
  return withTransaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, options.taskId))
      .for("update")
      .limit(1);
    if (!task) throw notFound("Task");
    if (options.actor.kind !== "USER" || options.actor.id !== task.userId) {
      throw authorizationError("Only the client can approve payment release.");
    }
    if (!["REVIEW_ACCEPTED", "PAYMENT_RELEASE"].includes(task.status)) {
      throw conflict("Final work acceptance is required before payment approval.");
    }
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.taskId, task.id))
      .for("update")
      .limit(1);
    if (!payment || payment.id !== options.expectedPaymentId) throw notFound("Payment");
    if (
      payment.amountMinor !== options.expectedAmountMinor ||
      payment.currency !== options.expectedCurrency ||
      payment.status !== "AUTHORIZED"
    ) {
      throw conflict("The authorized payment changed. Review the current amount before approving.");
    }
    const [review] = await tx
      .select()
      .from(workReviews)
      .where(and(eq(workReviews.taskId, task.id), eq(workReviews.status, "FINAL_ACCEPTED")))
      .orderBy(desc(workReviews.decidedAt))
      .limit(1);
    if (!review || review.decisionByUserId !== task.userId || review.decisionRole !== "CLIENT") {
      throw conflict("A current client final-acceptance decision is required.");
    }
    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, payment.agreementId))
      .limit(1);
    const [contract] = await tx
      .select()
      .from(workContracts)
      .where(and(eq(workContracts.id, review.contractId), eq(workContracts.status, "ACTIVE")))
      .limit(1);
    if (
      !agreement ||
      !contract ||
      agreement.contractVersion !== contract.version ||
      review.contractVersion !== contract.version ||
      review.contractHash !== contract.contractHash
    ) {
      throw conflict("The accepted review is bound to stale agreement terms.");
    }
    const [blockingCase] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.taskId, task.id),
          eq(cases.blocksPaymentCapture, true),
          inArray(cases.status, ["OPEN", "AWAITING_RESPONSE", "UNDER_REVIEW"]),
        ),
      )
      .limit(1);
    if (blockingCase) throw conflict("Resolve the blocking case before approving payment release.");
    const approvalHash = hashObject({
      paymentId: payment.id,
      taskId: task.id,
      reviewId: review.id,
      buyerUserId: task.userId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      statementVersion: "release-v1",
    });
    const [existing] = await tx
      .select()
      .from(paymentReleaseApprovals)
      .where(eq(paymentReleaseApprovals.paymentId, payment.id))
      .limit(1);
    if (existing) {
      if (existing.approvalHash !== approvalHash) {
        throw conflict("A payment release approval already exists for different terms.");
      }
      return existing;
    }
    const [approval] = await tx
      .insert(paymentReleaseApprovals)
      .values({
        id: newId("prelease"),
        paymentId: payment.id,
        taskId: task.id,
        reviewId: review.id,
        buyerUserId: task.userId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        contractVersion: contract.version,
        contractHash: contract.contractHash,
        approvalHash,
      })
      .returning();
    if (!approval) throw new Error("Payment release approval insert returned no row.");
    if (task.status === "REVIEW_ACCEPTED") {
      await transitionTask(tx, {
        taskId: task.id,
        to: "PAYMENT_RELEASE",
        actor: options.actor,
        correlationId: options.correlationId,
      });
    }
    await appendEvent(tx, {
      type: "PAYMENT_RELEASE_APPROVED",
      aggregateId: payment.id,
      taskId: task.id,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: task.id,
        paymentId: payment.id,
        reviewId: review.id,
        buyerUserId: task.userId,
        amount: { amountMinor: payment.amountMinor, currency: payment.currency },
        approvalHash,
      },
    });
    return approval;
  });
}

export async function releasePaymentForTask(options: {
  taskId: string;
  actor: Actor;
  correlationId: string;
}): Promise<{ paymentId: string; status: string; captured: boolean }> {
  let [task] = await withTransaction((tx) =>
    tx.select().from(tasks).where(eq(tasks.id, options.taskId)).limit(1),
  );
  if (!task) throw notFound("Task");
  if (options.actor.kind !== "USER" || options.actor.id !== task.userId) {
    throw authorizationError();
  }

  const [payment] = await withTransaction((tx) =>
    tx.select().from(payments).where(eq(payments.taskId, options.taskId)).limit(1),
  );
  if (!payment) throw notFound("Payment");
  await withTransaction(async (tx) => {
    const participants = await resolvePaymentParticipants(tx, payment.taskId, payment.agreementId);
    const classMatchesPersistedMode =
      payment.mode === "FAKE"
        ? participants.mode === "FAKE"
        : isPayPalMode(payment.mode) && isPayPalMode(participants.mode);
    if (
      !classMatchesPersistedMode ||
      participants.buyer.id !== payment.buyerUserId ||
      participants.provider.id !== payment.providerId
    ) {
      throw policyDenied(
        "payment.binding_current",
        "The payment no longer matches the current account classes or participants.",
      );
    }
  });

  if (!["PAYMENT_RELEASE", "REVIEW_ACCEPTED"].includes(task.status)) {
    throw conflict("Payment release is only allowed after the approval gate is reached.", {
      taskStatus: task.status,
      paymentStatus: payment.status,
    });
  }
  const [releaseApproval] = await withTransaction((tx) =>
    tx
      .select()
      .from(paymentReleaseApprovals)
      .where(eq(paymentReleaseApprovals.paymentId, payment.id))
      .limit(1),
  );
  if (!releaseApproval) {
    throw policyDenied(
      "payment_release.client_approved",
      "Approve the current payment release before capture.",
    );
  }

  if (task.status === "REVIEW_ACCEPTED") {
    task = await withTransaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, task!.id))
        .for("update")
        .limit(1);
      if (!current) throw notFound("Task");
      if (current.status === "REVIEW_ACCEPTED") {
        return transitionTask(tx, {
          taskId: current.id,
          to: "PAYMENT_RELEASE",
          actor: options.actor,
          correlationId: options.correlationId,
        });
      }
      if (current.status !== "PAYMENT_RELEASE") {
        throw conflict("The task left the buyer-approved release path.", {
          taskStatus: current.status,
        });
      }
      return current;
    });
  }

  if (payment.status === "CAPTURED") {
    if (task.status !== "COMPLETED") {
      await withTransaction(async (tx) => {
        await transitionTask(tx, {
          taskId: task.id,
          to: "COMPLETED",
          actor: options.actor,
          correlationId: options.correlationId,
          patch: { completedAt: new Date() },
        });
        await appendEvent(tx, {
          type: "TASK_COMPLETED",
          aggregateId: task.id,
          taskId: task.id,
          actor: toEventActor(options.actor),
          correlationId: options.correlationId,
          payload: { taskId: task.id },
        });
      });
    }
    return { paymentId: payment.id, status: payment.status, captured: true };
  }

  if (payment.status !== "AUTHORIZED" && payment.status !== "CAPTURE_REQUESTED") {
    return { paymentId: payment.id, status: payment.status, captured: false };
  }

  let captureCommandId: string;
  if (payment.status === "CAPTURE_REQUESTED") {
    const [existingCommand] = await withTransaction((tx) =>
      tx
        .select({ id: paymentCommands.id })
        .from(paymentCommands)
        .where(and(eq(paymentCommands.paymentId, payment.id), eq(paymentCommands.consumed, false)))
        .orderBy(desc(paymentCommands.createdAt))
        .limit(1),
    );
    if (!existingCommand) {
      throw externalUnknown("A capture request exists without a resumable command.");
    }
    const revalidation = await withTransaction(async (tx) => {
      const result = await evaluateAndRecord(tx, {
        paymentId: payment.id,
        action: "CAPTURE",
        actor: options.actor,
        correlationId: options.correlationId,
        paymentStatusOverride: "AUTHORIZED",
      });
      if (result.decision.result === "ALLOW") {
        await tx
          .update(paymentCommands)
          .set({ decisionId: result.decisionId })
          .where(
            and(eq(paymentCommands.id, existingCommand.id), eq(paymentCommands.consumed, false)),
          );
      }
      return result;
    });
    if (revalidation.decision.result === "DENY") {
      return {
        paymentId: payment.id,
        status: revalidation.decision.result,
        captured: false,
      };
    }
    captureCommandId = existingCommand.id;
  } else {
    const outcome = await requestCapture({
      paymentId: payment.id,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (outcome.decision.result === "DENY" || !outcome.captureCommandId) {
      return { paymentId: payment.id, status: outcome.decision.result, captured: false };
    }
    captureCommandId = outcome.captureCommandId;
  }

  const result = await executeCaptureAndComplete({
    captureCommandId,
    actor: options.actor,
    correlationId: options.correlationId,
  });

  if (result.status === "SUCCESS") {
    return { paymentId: payment.id, status: "CAPTURED", captured: true };
  }

  return { paymentId: payment.id, status: result.status ?? payment.status, captured: false };
}

export async function getPaymentForTask(db: Database, taskId: string) {
  const [payment] = await db.select().from(payments).where(eq(payments.taskId, taskId)).limit(1);
  return payment ?? null;
}

export async function getPaymentDetail(db: Database, paymentId: string) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) return null;
  const decisions = await db
    .select()
    .from(paymentDecisions)
    .where(eq(paymentDecisions.paymentId, paymentId))
    .orderBy(desc(paymentDecisions.createdAt));
  const operations = await db
    .select()
    .from(paymentOperations)
    .where(eq(paymentOperations.paymentId, paymentId))
    .orderBy(desc(paymentOperations.createdAt));
  return { payment, decisions, operations };
}

export async function getAgreement(db: Database, agreementId: string) {
  const [agreement] = await db
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.id, agreementId))
    .limit(1);
  return agreement ?? null;
}

export async function getTaskByIdForPayment(db: Database, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return task ?? null;
}
