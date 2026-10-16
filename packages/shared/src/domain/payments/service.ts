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
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { withTransaction } from "../../db/client.js";
import { cases } from "../../db/schema/cases.js";
import { workContracts } from "../../db/schema/contracts.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import {
  paymentCommands,
  paymentDecisions,
  paymentOperations,
  paymentPolicyChecks,
  payments,
} from "../../db/schema/payments.js";
import { tasks } from "../../db/schema/tasks.js";
import { acceptanceDecisions } from "../../db/schema/verification.js";
import { appendEvent } from "../../events/outbox.js";
import { getPaymentGateway } from "../../integrations/payments/index.js";
import { getEnv } from "../../platform/env.js";
import { hashObject } from "../../platform/hashing.js";
import { logger } from "../../platform/logger.js";
import { money, type Money } from "../../platform/money.js";
import { newId } from "../../platform/ids.js";
import { conflict, notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
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
  if (existing) return existing;

  const [agreement] = await tx
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.id, options.agreementId))
    .limit(1);
  if (!agreement) throw notFound("Agreement");

  // The amount is copied from the agreement, never from a request body.
  const [payment] = await tx
    .insert(payments)
    .values({
      id: newId("pay"),
      taskId: options.taskId,
      agreementId: agreement.id,
      amountMinor: agreement.agreedPriceMinor,
      currency: agreement.currency,
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
  options: { paymentId: string; action: PaymentAction; actor: Actor; correlationId: string },
): Promise<{
  decision: PolicyDecision;
  decisionId: string;
  payment: typeof payments.$inferSelect;
}> {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, options.paymentId))
    .limit(1);
  if (!payment) throw notFound("Payment");

  const [agreement] = await tx
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.id, payment.agreementId))
    .limit(1);
  if (!agreement) throw notFound("Agreement");

  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, agreement.contractId))
    .limit(1);
  if (!contract) throw notFound("Contract");

  const [latestDecision] = await tx
    .select()
    .from(acceptanceDecisions)
    .where(eq(acceptanceDecisions.taskId, payment.taskId))
    .orderBy(desc(acceptanceDecisions.createdAt))
    .limit(1);

  const [blockingCase] = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.taskId, payment.taskId), eq(cases.blocksPaymentCapture, true)))
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

  const blockingCaseOpen =
    blockingCase && ["OPEN", "AWAITING_RESPONSE", "UNDER_REVIEW"].includes(blockingCase.status)
      ? { id: blockingCase.id, category: blockingCase.category }
      : null;

  const input: PaymentPolicyInput = {
    action: options.action,
    payment: {
      id: payment.id,
      status: payment.status,
      amount: money(payment.amountMinor, payment.currency as Money["currency"]),
      capturedAmountMinor: payment.capturedAmountMinor ?? null,
      providerAuthorizationId: payment.providerAuthorizationId ?? null,
    },
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
    acceptanceDecision: latestDecision
      ? {
          outcome: latestDecision.outcome,
          contractVersion: latestDecision.contractVersion,
          contractHash: latestDecision.contractHash,
        }
      : null,
    blockingCase: blockingCaseOpen,
    hasSucceededCapture: Boolean(succeededCapture),
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

  return { decision, decisionId, payment };
}

export interface PolicyOutcome {
  decision: PolicyDecision;
  decisionId: string;
  /** Present only when a capture command was created (ALLOW on capture). */
  captureCommandId?: string;
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
  const { decision, decisionId, payment } = await withTransaction((tx) =>
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

  const amount = money(payment.amountMinor, payment.currency as Money["currency"]);
  const idempotencyKey = `auth:${payment.id}`;

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
      },
    });
  });

  // Network call, deliberately outside any transaction (P4).
  const gateway = getPaymentGateway();
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
    const idempotencyKey = `cap:${payment.id}`;
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
  const [command] = await withTransaction((tx) =>
    tx
      .select()
      .from(paymentCommands)
      .where(eq(paymentCommands.id, options.captureCommandId))
      .limit(1),
  );
  if (!command) throw notFound("Capture command");

  const [payment] = await withTransaction((tx) =>
    tx.select().from(payments).where(eq(payments.id, command.paymentId)).limit(1),
  );
  if (!payment) throw notFound("Payment");
  if (!payment.providerAuthorizationId) {
    throw conflict("Payment has no provider authorization to capture");
  }

  const amount = money(command.amountMinor, command.currency as Money["currency"]);
  const gateway = getPaymentGateway();
  const result = await gateway.capture({
    authorizationId: payment.providerAuthorizationId,
    amount,
    idempotencyKey: command.idempotencyKey,
  });

  await withTransaction(async (tx) => {
    const [existingOperation] = await tx
      .select({ id: paymentOperations.id })
      .from(paymentOperations)
      .where(eq(paymentOperations.idempotencyKey, command.idempotencyKey))
      .limit(1);
    const operationStatus =
      result.status === "SUCCESS"
        ? "SUCCEEDED"
        : result.status === "DECLINED"
          ? "FAILED"
          : "UNKNOWN";

    if (!existingOperation) {
      await tx.insert(paymentOperations).values({
        id: newId("poper"),
        paymentId: payment.id,
        taskId: payment.taskId,
        action: "CAPTURE",
        status: operationStatus,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        idempotencyKey: command.idempotencyKey,
        providerOperationId: result.captureId ?? null,
        requestHash: hashObject({ authorizationId: payment.providerAuthorizationId, amount }),
        rawResponse: result as unknown as Record<string, unknown>,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      });
    }

    if (result.status === "SUCCESS") {
      await tx
        .update(payments)
        .set({
          status: "CAPTURED",
          providerCaptureId: result.captureId ?? null,
          capturedAmountMinor: amount.amountMinor,
          capturedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      await tx
        .update(paymentCommands)
        .set({ consumed: true, consumedAt: new Date() })
        .where(eq(paymentCommands.id, command.id));
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
        },
      });
    } else if (result.status === "DECLINED") {
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
    } else {
      logger.warn(
        { paymentId: payment.id, captureCommandId: command.id },
        "capture returned UNKNOWN; reconciliation required",
      );
    }
  });

  return { status: result.status, ...(result.captureId ? { captureId: result.captureId } : {}) };
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
  const result = await executeCapture({
    captureCommandId: outcome.captureCommandId,
    actor: options.actor,
    correlationId: options.correlationId,
  });
  return { ...outcome, captured: result.status === "SUCCESS" };
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
