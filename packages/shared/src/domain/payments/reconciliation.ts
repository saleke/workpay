import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withTransaction } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import {
  paymentCommands,
  paymentDecisions,
  paymentOperations,
  paymentOrders,
  payments,
  webhookEvents,
} from "../../db/schema/payments.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { getPayPalClient } from "../../integrations/payments/index.js";
import { isPayPalMode } from "../../integrations/payments/config.js";
import { paypalRequestId } from "../../integrations/payments/idempotency.js";
import { conflict, externalUnknown, notFound } from "../../platform/errors.js";
import { hashObject } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import { money, type Money } from "../../platform/money.js";
import { systemActor, toEventActor } from "../context.js";
import { assignExecution } from "../execution/service.js";
import { transitionTask } from "../tasks/service.js";

type WebhookContext = {
  id: string;
  eventType: string;
  resourceId: string | null;
  orderId: string | null;
};

export async function reconcilePayPalPayment(options: {
  paymentId: string;
  correlationId: string;
  webhookReceiptId?: string;
}) {
  const prepared = await withTransaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, options.paymentId))
      .limit(1);
    if (!payment) throw notFound("Payment");
    if (!isPayPalMode(payment.mode)) throw conflict("Only PayPal payments can be reconciled.");
    const [[order], [command], receiptRows] = await Promise.all([
      tx
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.paymentId, payment.id))
        .orderBy(desc(paymentOrders.generation))
        .limit(1),
      tx
        .select()
        .from(paymentCommands)
        .where(eq(paymentCommands.paymentId, payment.id))
        .orderBy(desc(paymentCommands.createdAt))
        .limit(1),
      options.webhookReceiptId
        ? tx
            .select()
            .from(webhookEvents)
            .where(eq(webhookEvents.id, options.webhookReceiptId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const receipt = receiptRows[0] ?? null;
    if (
      receipt &&
      (!receipt.verified || receipt.paymentId !== payment.id || receipt.mode !== payment.mode)
    ) {
      throw conflict("The webhook receipt is not bound to this payment and environment.");
    }
    return {
      payment,
      order: order ?? null,
      command: command ?? null,
      webhook: receipt ? webhookContext(receipt) : null,
    };
  });

  const expectedAmount = money(
    prepared.payment.amountMinor,
    prepared.payment.currency as Money["currency"],
  );
  const eventType = prepared.webhook?.eventType ?? null;

  try {
    if (eventType?.includes("REFUND") || eventType?.startsWith("CUSTOMER.DISPUTE.")) {
      await markWebhook(
        prepared.webhook,
        "REQUIRES_REVIEW",
        `Financial event ${eventType} requires an explicit refund/dispute workflow.`,
      );
      return { status: prepared.payment.status, requiresReview: true };
    }
    if (eventType?.startsWith("PAYMENT.CAPTURE.") && !prepared.command) {
      await markWebhook(
        prepared.webhook,
        "REQUIRES_REVIEW",
        "PayPal reported a capture without a policy-backed local capture command.",
      );
      return { status: prepared.payment.status, requiresReview: true };
    }

    if (eventType === "PAYMENT.AUTHORIZATION.VOIDED") {
      await reconcileAuthorizationTerminal({
        payment: prepared.payment,
        resourceId: prepared.webhook?.resourceId,
        targetStatus: "VOIDED",
        correlationId: options.correlationId,
      });
      await markWebhook(prepared.webhook, "PROCESSED");
    } else if (eventType === "PAYMENT.AUTHORIZATION.DENIED") {
      await reconcileAuthorizationTerminal({
        payment: prepared.payment,
        resourceId: prepared.webhook?.resourceId,
        targetStatus: "FAILED",
        correlationId: options.correlationId,
      });
      await markWebhook(prepared.webhook, "PROCESSED");
    } else if (eventType === "PAYMENT.CAPTURE.DENIED") {
      if (!prepared.command) throw conflict("Capture webhook has no local capture command.");
      await reconcileCaptureDenied({
        payment: prepared.payment,
        command: prepared.command,
        captureId: prepared.webhook?.resourceId,
        correlationId: options.correlationId,
      });
      await markWebhook(prepared.webhook, "PROCESSED");
    } else if (
      prepared.command &&
      (eventType?.startsWith("PAYMENT.CAPTURE.") ||
        ["CAPTURE_REQUESTED", "UNKNOWN", "CAPTURED"].includes(prepared.payment.status))
    ) {
      await reconcileCapture({
        payment: prepared.payment,
        order: prepared.order,
        command: prepared.command,
        webhook: prepared.webhook,
        amount: expectedAmount,
        correlationId: options.correlationId,
      });
      await markWebhook(prepared.webhook, "PROCESSED");
    } else if (
      prepared.order?.externalOrderId &&
      (eventType?.startsWith("PAYMENT.AUTHORIZATION.") ||
        ["AUTHORIZATION_REQUESTED", "ORDER_APPROVED", "UNKNOWN", "AUTHORIZED"].includes(
          prepared.payment.status,
        ))
    ) {
      await reconcileAuthorization({
        payment: prepared.payment,
        order: prepared.order,
        amount: expectedAmount,
        correlationId: options.correlationId,
      });
      await markWebhook(prepared.webhook, "PROCESSED");
    } else if (prepared.webhook) {
      await markWebhook(prepared.webhook, "PROCESSED");
    }
  } catch (error) {
    await markWebhook(
      prepared.webhook,
      "PENDING_RECONCILIATION",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  const [updated] = await withTransaction((tx) =>
    tx.select().from(payments).where(eq(payments.id, options.paymentId)).limit(1),
  );
  return { status: updated?.status ?? prepared.payment.status };
}

function webhookContext(receipt: typeof webhookEvents.$inferSelect): WebhookContext {
  const payload = receipt.payload as {
    resource?: {
      id?: string;
      supplementary_data?: {
        related_ids?: { order_id?: string };
      };
    };
  };
  return {
    id: receipt.id,
    eventType: receipt.eventType,
    resourceId: payload.resource?.id ?? null,
    orderId: payload.resource?.supplementary_data?.related_ids?.order_id ?? null,
  };
}

async function markWebhook(
  webhook: WebhookContext | null,
  status: "PROCESSED" | "PENDING_RECONCILIATION" | "REQUIRES_REVIEW",
  lastError: string | null = null,
) {
  if (!webhook) return;
  await withTransaction((tx) =>
    tx
      .update(webhookEvents)
      .set({
        processingStatus: status,
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError,
        processedAt: status === "PROCESSED" ? new Date() : null,
      })
      .where(eq(webhookEvents.id, webhook.id)),
  );
}

async function reconcileAuthorization(input: {
  payment: typeof payments.$inferSelect;
  order: typeof paymentOrders.$inferSelect;
  amount: Money;
  correlationId: string;
}) {
  if (!isPayPalMode(input.payment.mode)) throw conflict("Payment mode is not PayPal.");
  if (!input.order.externalOrderId) throw conflict("PayPal order has no provider identifier.");
  const client = getPayPalClient(input.payment.mode);
  const order = await client.getOrder(
    input.order.externalOrderId,
    input.payment.sellerMerchantIdSnapshot!,
  );
  if (!order.authorizationId) throw externalUnknown("PayPal has not created an authorization yet.");
  const authorization = await client.getAuthorization(
    order.authorizationId,
    input.payment.sellerMerchantIdSnapshot!,
  );
  if (
    order.status !== "COMPLETED" ||
    order.authorizationStatus !== "CREATED" ||
    order.payerId !== input.payment.payerIdSnapshot ||
    order.payeeMerchantId !== input.payment.sellerMerchantIdSnapshot ||
    order.referenceId !== input.order.id ||
    order.customId !== input.payment.id ||
    order.invoiceId !== input.order.id ||
    order.amount?.amountMinor !== input.amount.amountMinor ||
    order.amount.currency !== input.amount.currency ||
    authorization.id !== order.authorizationId ||
    authorization.status !== "CREATED" ||
    authorization.amount?.amountMinor !== input.amount.amountMinor ||
    authorization.amount.currency !== input.amount.currency ||
    authorization.orderId !== input.order.externalOrderId ||
    (authorization.payeeMerchantId !== null &&
      authorization.payeeMerchantId !== input.payment.sellerMerchantIdSnapshot) ||
    !authorization.expiresAt ||
    authorization.expiresAt <= new Date()
  ) {
    throw conflict("PayPal authorization reconciliation returned mismatched economic data.");
  }
  await finalizeReconciledAuthorization({
    payment: input.payment,
    order: input.order,
    authorizationId: authorization.id,
    authorizationExpiresAt: authorization.expiresAt,
    amount: input.amount,
    correlationId: input.correlationId,
  });
}

async function reconcileCapture(input: {
  payment: typeof payments.$inferSelect;
  order: typeof paymentOrders.$inferSelect | null;
  command: typeof paymentCommands.$inferSelect;
  webhook: WebhookContext | null;
  amount: Money;
  correlationId: string;
}) {
  if (!isPayPalMode(input.payment.mode)) throw conflict("Payment mode is not PayPal.");
  if (!input.order?.externalOrderId || !input.payment.providerAuthorizationId) {
    throw conflict("Capture reconciliation is missing its PayPal order or authorization.");
  }
  const [decision] = await withTransaction((tx) =>
    tx
      .select()
      .from(paymentDecisions)
      .where(eq(paymentDecisions.id, input.command.decisionId))
      .limit(1),
  );
  if (
    !decision ||
    decision.result !== "ALLOW" ||
    !["pay-policy-v2", "pay-policy-v3", "pay-policy-v4"].includes(decision.policyVersion)
  ) {
    throw conflict("The local capture command is not backed by a current ALLOW decision.");
  }
  const client = getPayPalClient(input.payment.mode);
  const order = await client.getOrder(
    input.order.externalOrderId,
    input.payment.sellerMerchantIdSnapshot!,
  );
  const captureId =
    (input.webhook?.eventType.startsWith("PAYMENT.CAPTURE.") ? input.webhook.resourceId : null) ??
    input.payment.providerCaptureId ??
    order.captureId;
  if (!captureId) throw externalUnknown("PayPal has not exposed the capture identifier yet.");
  const capture = await client.getCapture(captureId, input.payment.sellerMerchantIdSnapshot!);
  if (
    capture.status !== "COMPLETED" ||
    capture.amount?.amountMinor !== input.amount.amountMinor ||
    capture.amount.currency !== input.amount.currency ||
    capture.orderId !== input.order.externalOrderId ||
    capture.authorizationId !== input.payment.providerAuthorizationId ||
    (capture.payeeMerchantId !== null &&
      capture.payeeMerchantId !== input.payment.sellerMerchantIdSnapshot) ||
    order.payerId !== input.payment.payerIdSnapshot ||
    order.payeeMerchantId !== input.payment.sellerMerchantIdSnapshot ||
    order.referenceId !== input.order.id ||
    order.customId !== input.payment.id ||
    order.invoiceId !== input.order.id ||
    order.captureId !== capture.id ||
    order.captureStatus !== "COMPLETED"
  ) {
    throw conflict("PayPal capture reconciliation returned mismatched economic data.");
  }
  await finalizeReconciledCapture({
    payment: input.payment,
    command: input.command,
    captureId: capture.id,
    amount: input.amount,
    correlationId: input.correlationId,
  });
}

async function finalizeReconciledAuthorization(input: {
  payment: typeof payments.$inferSelect;
  order: typeof paymentOrders.$inferSelect;
  authorizationId: string;
  authorizationExpiresAt: Date;
  amount: Money;
  correlationId: string;
}) {
  await withTransaction(async (tx) => {
    const operationKey = paypalRequestId("reconcile-authorization", input.authorizationId);
    const [operation] = await tx
      .insert(paymentOperations)
      .values({
        id: newId("poper"),
        paymentId: input.payment.id,
        taskId: input.payment.taskId,
        action: "AUTHORIZE",
        status: "SUCCEEDED",
        amountMinor: input.amount.amountMinor,
        currency: input.amount.currency,
        idempotencyKey: operationKey,
        providerOperationId: input.authorizationId,
        requestHash: hashObject({
          mode: input.payment.mode,
          externalOrderId: input.order.externalOrderId,
          localOrderId: input.order.id,
          payeeMerchantId: input.payment.sellerMerchantIdSnapshot,
          amount: input.amount,
          reconciliationKey: operationKey,
        }),
        rawResponse: { reconciled: true },
      })
      .onConflictDoNothing()
      .returning({ id: paymentOperations.id });
    if (!operation) return;
    const [updatedPayment] = await tx
      .update(payments)
      .set({
        status: "AUTHORIZED",
        providerAuthorizationId: input.authorizationId,
        authorizedAt: new Date(),
        authorizationExpiresAt: input.authorizationExpiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, input.payment.id),
          inArray(payments.status, ["AUTHORIZATION_REQUESTED", "ORDER_APPROVED", "UNKNOWN"]),
        ),
      )
      .returning({ id: payments.id });
    if (!updatedPayment) throw conflict("Payment is no longer eligible for authorization.");
    await tx
      .update(paymentOrders)
      .set({ status: "AUTHORIZED", authorizedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(paymentOrders.id, input.order.id),
          inArray(paymentOrders.status, ["AUTHORIZATION_REQUESTED", "UNKNOWN"]),
        ),
      );
    await tx
      .update(commercialAgreements)
      .set({ status: "AUTHORIZED", updatedAt: new Date() })
      .where(eq(commercialAgreements.id, input.payment.agreementId));
    const [existingExecution] = await tx
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.taskId, input.payment.taskId))
      .limit(1);
    if (!existingExecution) {
      const [agreement] = await tx
        .select()
        .from(commercialAgreements)
        .where(eq(commercialAgreements.id, input.payment.agreementId))
        .limit(1);
      if (!agreement) throw notFound("Agreement");
      const [contract] = await tx
        .select()
        .from(workContracts)
        .where(eq(workContracts.id, agreement.contractId))
        .limit(1);
      if (!contract || contract.status !== "ACTIVE") throw conflict("Contract is not active.");
      await assignExecution(tx, {
        taskId: input.payment.taskId,
        contractId: contract.id,
        contractVersion: contract.version,
        contractHash: contract.contractHash,
        agreementId: agreement.id,
        providerId: agreement.providerId,
      });
    }
    await appendEvent(tx, {
      type: "PAYMENT_AUTHORIZED",
      aggregateId: input.payment.id,
      taskId: input.payment.taskId,
      actor: toEventActor(systemActor()),
      correlationId: input.correlationId,
      payload: {
        taskId: input.payment.taskId,
        paymentId: input.payment.id,
        amount: input.amount,
        paypalAuthorizationId: input.authorizationId,
        simulated: false,
      },
    });
  });
}

async function finalizeReconciledCapture(input: {
  payment: typeof payments.$inferSelect;
  command: typeof paymentCommands.$inferSelect;
  captureId: string;
  amount: Money;
  correlationId: string;
}) {
  await withTransaction(async (tx) => {
    const operationKey = paypalRequestId("reconcile-capture", input.captureId);
    const [operation] = await tx
      .insert(paymentOperations)
      .values({
        id: newId("poper"),
        paymentId: input.payment.id,
        taskId: input.payment.taskId,
        action: "CAPTURE",
        status: "SUCCEEDED",
        amountMinor: input.amount.amountMinor,
        currency: input.amount.currency,
        idempotencyKey: operationKey,
        providerOperationId: input.captureId,
        requestHash: hashObject({
          mode: input.payment.mode,
          commandId: input.command.id,
          authorizationId: input.payment.providerAuthorizationId,
          payeeMerchantId: input.payment.sellerMerchantIdSnapshot,
          amount: input.amount,
          reconciliationKey: operationKey,
        }),
        rawResponse: { reconciled: true },
      })
      .onConflictDoNothing()
      .returning({ id: paymentOperations.id });
    if (!operation) return;
    const [updatedPayment] = await tx
      .update(payments)
      .set({
        status: "CAPTURED",
        providerCaptureId: input.captureId,
        capturedAmountMinor: input.amount.amountMinor,
        capturedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, input.payment.id),
          inArray(payments.status, ["CAPTURE_REQUESTED", "UNKNOWN"]),
        ),
      )
      .returning({ id: payments.id });
    if (!updatedPayment) throw conflict("Payment is no longer eligible for capture finalization.");
    await tx
      .update(paymentCommands)
      .set({ consumed: true, consumedAt: input.command.consumedAt ?? new Date() })
      .where(eq(paymentCommands.id, input.command.id));
    await tx
      .update(commercialAgreements)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(commercialAgreements.id, input.payment.agreementId));
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, input.payment.taskId))
      .for("update")
      .limit(1);
    if (task?.status === "PAYMENT_RELEASE") {
      await transitionTask(tx, {
        taskId: task.id,
        to: "COMPLETED",
        actor: systemActor(),
        correlationId: input.correlationId,
        patch: { completedAt: new Date() },
      });
    }
    await appendEvent(tx, {
      type: "PAYMENT_CAPTURED",
      aggregateId: input.payment.id,
      taskId: input.payment.taskId,
      actor: toEventActor(systemActor()),
      correlationId: input.correlationId,
      payload: {
        taskId: input.payment.taskId,
        paymentId: input.payment.id,
        amount: input.amount,
        paypalCaptureId: input.captureId,
        simulated: false,
      },
    });
  });
}

async function reconcileAuthorizationTerminal(input: {
  payment: typeof payments.$inferSelect;
  resourceId: string | null | undefined;
  targetStatus: "FAILED" | "VOIDED";
  correlationId: string;
}) {
  if (!isPayPalMode(input.payment.mode)) throw conflict("Payment mode is not PayPal.");
  const authorizationId = input.resourceId ?? input.payment.providerAuthorizationId;
  if (!authorizationId || authorizationId !== input.payment.providerAuthorizationId) {
    throw conflict("Authorization event does not match this payment.");
  }
  const resource = await getPayPalClient(input.payment.mode).getAuthorization(
    authorizationId,
    input.payment.sellerMerchantIdSnapshot!,
  );
  const expectedProviderStatus = input.targetStatus === "VOIDED" ? "VOIDED" : "DENIED";
  if (resource.id !== authorizationId || resource.status !== expectedProviderStatus) {
    throw externalUnknown("PayPal authorization terminal state is not yet confirmed.");
  }
  await withTransaction(async (tx) => {
    const key = paypalRequestId(
      `authorization-${input.targetStatus.toLowerCase()}`,
      authorizationId,
    );
    const [operation] = await tx
      .insert(paymentOperations)
      .values({
        id: newId("poper"),
        paymentId: input.payment.id,
        taskId: input.payment.taskId,
        action: "AUTHORIZE",
        status: "FAILED",
        amountMinor: input.payment.amountMinor,
        currency: input.payment.currency,
        idempotencyKey: key,
        providerOperationId: authorizationId,
        requestHash: hashObject({ mode: input.payment.mode, authorizationId }),
        rawResponse: resource as unknown as Record<string, unknown>,
        errorCode: expectedProviderStatus,
      })
      .onConflictDoNothing()
      .returning({ id: paymentOperations.id });
    if (!operation) return;
    await tx
      .update(payments)
      .set({
        status: input.targetStatus,
        ...(input.targetStatus === "VOIDED" ? { voidedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, input.payment.id),
          inArray(payments.status, ["AUTHORIZATION_REQUESTED", "AUTHORIZED", "UNKNOWN"]),
        ),
      );
    await appendEvent(tx, {
      type: "PAYMENT_AUTHORIZATION_FAILED",
      aggregateId: input.payment.id,
      taskId: input.payment.taskId,
      actor: toEventActor(systemActor()),
      correlationId: input.correlationId,
      payload: {
        taskId: input.payment.taskId,
        paymentId: input.payment.id,
        reason: expectedProviderStatus,
      },
    });
  });
}

async function reconcileCaptureDenied(input: {
  payment: typeof payments.$inferSelect;
  command: typeof paymentCommands.$inferSelect;
  captureId: string | null | undefined;
  correlationId: string;
}) {
  if (!isPayPalMode(input.payment.mode)) throw conflict("Payment mode is not PayPal.");
  if (!input.captureId) throw externalUnknown("Capture denial did not include a resource ID.");
  const resource = await getPayPalClient(input.payment.mode).getCapture(
    input.captureId,
    input.payment.sellerMerchantIdSnapshot!,
  );
  if (
    resource.status !== "DENIED" ||
    resource.authorizationId !== input.payment.providerAuthorizationId
  ) {
    throw externalUnknown("PayPal capture denial is not yet confirmed.");
  }
  await withTransaction(async (tx) => {
    const key = paypalRequestId("capture-denied", resource.id);
    const [operation] = await tx
      .insert(paymentOperations)
      .values({
        id: newId("poper"),
        paymentId: input.payment.id,
        taskId: input.payment.taskId,
        action: "CAPTURE",
        status: "FAILED",
        amountMinor: input.payment.amountMinor,
        currency: input.payment.currency,
        idempotencyKey: key,
        providerOperationId: resource.id,
        requestHash: hashObject({
          mode: input.payment.mode,
          commandId: input.command.id,
          authorizationId: input.payment.providerAuthorizationId,
        }),
        rawResponse: resource as unknown as Record<string, unknown>,
        errorCode: "DENIED",
      })
      .onConflictDoNothing()
      .returning({ id: paymentOperations.id });
    if (!operation) return;
    await tx
      .update(payments)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(
        and(
          eq(payments.id, input.payment.id),
          inArray(payments.status, ["CAPTURE_REQUESTED", "UNKNOWN"]),
        ),
      );
    await appendEvent(tx, {
      type: "PAYMENT_CAPTURE_FAILED",
      aggregateId: input.payment.id,
      taskId: input.payment.taskId,
      actor: toEventActor(systemActor()),
      correlationId: input.correlationId,
      payload: { taskId: input.payment.taskId, paymentId: input.payment.id, reason: "DENIED" },
    });
  });
}
