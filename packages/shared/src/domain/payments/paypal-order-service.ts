import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { withTransaction } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { paypalIdentityLinks, providerPaypalAccounts } from "../../db/schema/paypal.js";
import { paymentOperations, paymentOrders, payments } from "../../db/schema/payments.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { getPayPalClient } from "../../integrations/payments/index.js";
import { isPayPalMode, paymentModeEnvironment } from "../../integrations/payments/config.js";
import { paypalRequestId } from "../../integrations/payments/idempotency.js";
import { authorizationError, conflict, externalUnknown, notFound } from "../../platform/errors.js";
import { hashObject, sha256Hex } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import { money, type Money } from "../../platform/money.js";
import { toEventActor } from "../context.js";
import { assignExecution } from "../execution/service.js";
import type { Actor } from "../identity/authorize.js";
import { transitionTask } from "../tasks/service.js";
import { ensurePaymentForAgreement, evaluatePaymentAction } from "./service.js";

function assertOwner(
  task: typeof tasks.$inferSelect,
  actor: Actor,
): asserts actor is Actor & {
  kind: "USER";
  id: string;
} {
  if (actor.kind !== "USER" || actor.id !== task.userId) {
    throw authorizationError("Only the task owner can approve this PayPal payment.");
  }
}

export async function createPayPalOrderForTask(options: {
  taskId: string;
  actor: Actor;
  correlationId: string;
  appUrl: string;
}) {
  const approvalState = randomBytes(32).toString("base64url");
  const prepared = await withTransaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, options.taskId))
      .for("update")
      .limit(1);
    if (!task) throw notFound("Task");
    assertOwner(task, options.actor);
    if (!["AGREEMENT_READY", "PAYMENT_AUTHORIZATION"].includes(task.status)) {
      throw conflict("The task is not ready for PayPal approval.", { taskStatus: task.status });
    }
    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.taskId, task.id))
      .orderBy(desc(commercialAgreements.createdAt))
      .limit(1);
    if (!agreement) throw conflict("Both parties must agree commercial terms first.");
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
      throw conflict("The agreement is not bound to the current active contract.");
    }
    const payment = await ensurePaymentForAgreement(tx, {
      taskId: task.id,
      agreementId: agreement.id,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (!isPayPalMode(payment.mode)) {
      throw conflict("Evaluator accounts use the simulated authorization flow.");
    }
    const [existingOrder] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.paymentId, payment.id))
      .orderBy(desc(paymentOrders.generation))
      .limit(1);
    if (
      existingOrder?.status === "AWAITING_APPROVAL" &&
      existingOrder.approvalUrl &&
      existingOrder.expiresAt > new Date()
    ) {
      return { reused: true as const, payment, agreement, contract, order: existingOrder };
    }
    if (
      existingOrder &&
      ["CREATE_REQUESTED", "UNKNOWN", "AUTHORIZATION_REQUESTED"].includes(existingOrder.status) &&
      existingOrder.expiresAt > new Date()
    ) {
      throw externalUnknown(
        "A PayPal order operation is already in progress and must be reconciled.",
      );
    }
    if (payment.status === "AUTHORIZED") {
      throw conflict("This task already has an authorized PayPal payment.");
    }
    const generationRows = await tx
      .select({ generation: max(paymentOrders.generation) })
      .from(paymentOrders)
      .where(eq(paymentOrders.paymentId, payment.id));
    const generation = generationRows[0]?.generation;
    const nextGeneration = (generation ?? 0) + 1;
    const orderId = newId("porder");
    const requestId = paypalRequestId("paypal-order-create", `${payment.id}:${nextGeneration}`);
    const [order] = await tx
      .insert(paymentOrders)
      .values({
        id: orderId,
        paymentId: payment.id,
        mode: payment.mode,
        generation: nextGeneration,
        requestId,
        approvalStateHash: sha256Hex(approvalState),
        payerIdSnapshot: payment.payerIdSnapshot!,
        sellerMerchantIdSnapshot: payment.sellerMerchantIdSnapshot!,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        status: "CREATE_REQUESTED",
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      })
      .returning();
    if (!order) throw new Error("Payment order insert returned no row.");
    await tx
      .update(payments)
      .set({ status: "ORDER_CREATE_REQUESTED", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    if (task.status === "AGREEMENT_READY") {
      await transitionTask(tx, {
        taskId: task.id,
        to: "PAYMENT_AUTHORIZATION",
        actor: options.actor,
        correlationId: options.correlationId,
      });
    }
    return { reused: false as const, payment, agreement, contract, order };
  });

  if (prepared.reused) {
    return {
      paymentId: prepared.payment.id,
      orderId: prepared.order.externalOrderId,
      approvalUrl: prepared.order.approvalUrl,
      mode: prepared.payment.mode,
      reused: true,
    };
  }
  const policy = await evaluatePaymentAction({
    paymentId: prepared.payment.id,
    action: "AUTHORIZE",
    actor: options.actor,
    correlationId: options.correlationId,
    paymentStatusOverride: "PENDING",
  });
  if (policy.decision.result === "DENY") {
    await withTransaction(async (tx) => {
      await tx
        .update(paymentOrders)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(
          and(
            eq(paymentOrders.id, prepared.order.id),
            eq(paymentOrders.status, "CREATE_REQUESTED"),
          ),
        );
      await tx
        .update(payments)
        .set({ status: "PENDING", updatedAt: new Date() })
        .where(
          and(
            eq(payments.id, prepared.payment.id),
            eq(payments.status, "ORDER_CREATE_REQUESTED"),
          ),
        );
    });
    throw conflict(`Payment policy denied PayPal order creation: ${policy.decision.reasonCode}`);
  }
  const appUrl = options.appUrl.replace(/\/$/, "");
  const state = approvalState;
  const returnUrl = `${appUrl}/api/v1/tasks/${encodeURIComponent(options.taskId)}/payment/paypal/return?state=${encodeURIComponent(state)}`;
  const cancelUrl = `${appUrl}/api/v1/tasks/${encodeURIComponent(options.taskId)}/payment/paypal/cancel?state=${encodeURIComponent(state)}`;
  if (!isPayPalMode(prepared.payment.mode)) throw conflict("PayPal payment mode changed.");
  const result = await getPayPalClient(prepared.payment.mode).createOrder({
    localOrderId: prepared.order.id,
    paymentId: prepared.payment.id,
    amount: money(prepared.payment.amountMinor, prepared.payment.currency as Money["currency"]),
    description: prepared.contract.title,
    payeeMerchantId: prepared.payment.sellerMerchantIdSnapshot!,
    returnUrl,
    cancelUrl,
    idempotencyKey: prepared.order.requestId,
  });
  if (result.status !== "SUCCESS" || !result.orderId || !result.approvalUrl) {
    await withTransaction(async (tx) => {
      await tx
        .update(paymentOrders)
        .set({
          status: result.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          updatedAt: new Date(),
        })
        .where(eq(paymentOrders.id, prepared.order.id));
      await tx
        .update(payments)
        .set({ status: result.status === "DECLINED" ? "FAILED" : "UNKNOWN", updatedAt: new Date() })
        .where(eq(payments.id, prepared.payment.id));
    });
    if (result.status === "UNKNOWN") {
      throw externalUnknown("PayPal order creation has an unknown outcome.");
    }
    throw conflict(result.errorMessage ?? "PayPal declined order creation.");
  }
  await withTransaction(async (tx) => {
    const [updatedOrder] = await tx
      .update(paymentOrders)
      .set({
        externalOrderId: result.orderId,
        approvalUrl: result.approvalUrl,
        status: "AWAITING_APPROVAL",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentOrders.id, prepared.order.id),
          eq(paymentOrders.status, "CREATE_REQUESTED"),
        ),
      )
      .returning({ id: paymentOrders.id });
    const [updatedPayment] = await tx
      .update(payments)
      .set({
        providerOrderId: result.orderId,
        status: "AWAITING_BUYER_APPROVAL",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, prepared.payment.id),
          eq(payments.status, "ORDER_CREATE_REQUESTED"),
        ),
      )
      .returning({ id: payments.id });
    if (!updatedOrder || !updatedPayment) {
      throw externalUnknown("PayPal created an order after the local payment changed.");
    }
  });
  return {
    paymentId: prepared.payment.id,
    orderId: result.orderId,
    approvalUrl: result.approvalUrl,
    mode: prepared.payment.mode,
    reused: false,
  };
}

export async function authorizeApprovedPayPalOrder(options: {
  taskId: string;
  externalOrderId: string;
  approvalState: string;
  actor: Actor;
  correlationId: string;
}) {
  const prepared = await withTransaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, options.taskId))
      .for("update")
      .limit(1);
    if (!task) throw notFound("Task");
    assertOwner(task, options.actor);
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.externalOrderId, options.externalOrderId),
          eq(paymentOrders.approvalStateHash, sha256Hex(options.approvalState)),
        ),
      )
      .for("update")
      .limit(1);
    if (!order || order.expiresAt <= new Date())
      throw conflict("PayPal approval is invalid or expired.");
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, order.paymentId), eq(payments.taskId, task.id)))
      .for("update")
      .limit(1);
    if (!payment || !isPayPalMode(payment.mode)) throw notFound("PayPal payment");
    const [latestOrder] = await tx
      .select({ id: paymentOrders.id })
      .from(paymentOrders)
      .where(eq(paymentOrders.paymentId, payment.id))
      .orderBy(desc(paymentOrders.generation))
      .limit(1);
    if (
      latestOrder?.id !== order.id ||
      order.mode !== payment.mode ||
      payment.providerOrderId !== order.externalOrderId
    ) {
      throw conflict("This PayPal approval is not for the current payment order.");
    }
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
      throw conflict("A linked PayPal account changed or is no longer eligible.");
    }
    if (payment.status === "AUTHORIZED" && order.status === "AUTHORIZED") {
      return { task, order, payment, alreadyAuthorized: true };
    }
    if (payment.status !== "AWAITING_BUYER_APPROVAL" || order.status !== "AWAITING_APPROVAL") {
      throw conflict("The payment is not awaiting PayPal approval.", {
        paymentStatus: payment.status,
        orderStatus: order.status,
      });
    }
    return { task, order, payment, alreadyAuthorized: false };
  });
  if (prepared.alreadyAuthorized) return assignAuthorizedExecution(prepared, options);

  if (!isPayPalMode(prepared.payment.mode)) throw conflict("PayPal payment mode changed.");
  const client = getPayPalClient(prepared.payment.mode);
  const details = await client.getOrder(
    options.externalOrderId,
    prepared.payment.sellerMerchantIdSnapshot!,
  );
  const expectedAmount = money(
    prepared.payment.amountMinor,
    prepared.payment.currency as Money["currency"],
  );
  if (
    details.status !== "APPROVED" ||
    details.payerId !== prepared.payment.payerIdSnapshot ||
    details.payeeMerchantId !== prepared.payment.sellerMerchantIdSnapshot ||
    details.referenceId !== prepared.order.id ||
    details.customId !== prepared.payment.id ||
    details.invoiceId !== prepared.order.id ||
    details.amount?.amountMinor !== expectedAmount.amountMinor ||
    details.amount.currency !== expectedAmount.currency
  ) {
    throw conflict("PayPal approval does not match this buyer, seller, amount, or local order.");
  }
  const policy = await evaluatePaymentAction({
    paymentId: prepared.payment.id,
    action: "AUTHORIZE",
    actor: options.actor,
    correlationId: options.correlationId,
    paymentStatusOverride: "PENDING",
  });
  if (policy.decision.result === "DENY") {
    throw conflict(`Payment policy denied authorization: ${policy.decision.reasonCode}`);
  }
  const claimed = await withTransaction(async (tx) => {
    const [currentPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, prepared.payment.id))
      .for("update")
      .limit(1);
    const [currentOrder] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, prepared.order.id))
      .for("update")
      .limit(1);
    if (
      currentPayment?.status === "AUTHORIZED" &&
      currentOrder?.status === "AUTHORIZED" &&
      currentPayment.providerOrderId === currentOrder.externalOrderId
    ) {
      return false;
    }
    if (
      !currentPayment ||
      !currentOrder ||
      currentPayment.status !== "AWAITING_BUYER_APPROVAL" ||
      currentOrder.status !== "AWAITING_APPROVAL" ||
      currentPayment.providerOrderId !== currentOrder.externalOrderId
    ) {
      throw conflict("The PayPal order was cancelled, replaced, or is already being processed.");
    }
    const [updatedOrder] = await tx
      .update(paymentOrders)
      .set({ status: "AUTHORIZATION_REQUESTED", approvedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(paymentOrders.id, currentOrder.id),
          eq(paymentOrders.status, "AWAITING_APPROVAL"),
        ),
      )
      .returning({ id: paymentOrders.id });
    const [updatedPayment] = await tx
      .update(payments)
      .set({ status: "AUTHORIZATION_REQUESTED", updatedAt: new Date() })
      .where(
        and(
          eq(payments.id, currentPayment.id),
          eq(payments.status, "AWAITING_BUYER_APPROVAL"),
        ),
      )
      .returning({ id: payments.id });
    if (!updatedOrder || !updatedPayment) {
      throw externalUnknown("PayPal authorization completed after the local order changed.");
    }
    return true;
  });
  if (!claimed) return assignAuthorizedExecution(prepared, options);
  const requestId = paypalRequestId("paypal-order-authorize", prepared.order.id);
  const result = await client.authorizeApprovedOrder({
    orderId: prepared.order.externalOrderId!,
    payeeMerchantId: prepared.payment.sellerMerchantIdSnapshot!,
    idempotencyKey: requestId,
  });
  if (result.status !== "SUCCESS" || !result.authorizationId) {
    await withTransaction(async (tx) => {
      await tx
        .insert(paymentOperations)
        .values({
          id: newId("poper"),
          paymentId: prepared.payment.id,
          taskId: prepared.task.id,
          action: "AUTHORIZE",
          status: result.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          amountMinor: prepared.payment.amountMinor,
          currency: prepared.payment.currency,
          idempotencyKey: requestId,
          requestHash: hashObject({
            mode: prepared.payment.mode,
            externalOrderId: prepared.order.externalOrderId,
            localOrderId: prepared.order.id,
            payeeMerchantId: prepared.payment.sellerMerchantIdSnapshot,
            amount: expectedAmount,
            idempotencyKey: requestId,
          }),
          rawResponse: result as unknown as Record<string, unknown>,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
        })
        .onConflictDoNothing();
      await tx
        .update(paymentOrders)
        .set({ status: result.status === "DECLINED" ? "FAILED" : "UNKNOWN", updatedAt: new Date() })
        .where(eq(paymentOrders.id, prepared.order.id));
      await tx
        .update(payments)
        .set({ status: result.status === "DECLINED" ? "FAILED" : "UNKNOWN", updatedAt: new Date() })
        .where(eq(payments.id, prepared.payment.id));
    });
    if (result.status === "UNKNOWN") throw externalUnknown("PayPal authorization is unknown.");
    throw conflict(result.errorMessage ?? "PayPal declined authorization.");
  }
  if (
    result.payerId !== prepared.payment.payerIdSnapshot ||
    result.payeeMerchantId !== prepared.payment.sellerMerchantIdSnapshot ||
    result.providerOrderId !== prepared.order.externalOrderId ||
    result.providerStatus !== "COMPLETED" ||
    result.referenceId !== prepared.order.id ||
    result.customId !== prepared.payment.id ||
    result.invoiceId !== prepared.order.id ||
    result.authorizationStatus !== "CREATED" ||
    !result.authorizationExpiresAt ||
    result.authorizationExpiresAt <= new Date() ||
    result.amount?.amountMinor !== expectedAmount.amountMinor ||
    result.amount.currency !== expectedAmount.currency
  ) {
    await withTransaction(async (tx) => {
      await tx
        .insert(paymentOperations)
        .values({
          id: newId("poper"),
          paymentId: prepared.payment.id,
          taskId: prepared.task.id,
          action: "AUTHORIZE",
          status: "UNKNOWN",
          amountMinor: prepared.payment.amountMinor,
          currency: prepared.payment.currency,
          idempotencyKey: paypalRequestId("authorization-mismatch", prepared.order.id),
          providerOperationId: result.authorizationId,
          requestHash: hashObject({
            mode: prepared.payment.mode,
            externalOrderId: prepared.order.externalOrderId,
            localOrderId: prepared.order.id,
            payeeMerchantId: prepared.payment.sellerMerchantIdSnapshot,
            amount: expectedAmount,
            idempotencyKey: requestId,
          }),
          rawResponse: result as unknown as Record<string, unknown>,
          errorCode: "ECONOMIC_BINDING_MISMATCH",
          errorMessage: "PayPal authorization returned mismatched economic data.",
        })
        .onConflictDoNothing();
      await tx
        .update(paymentOrders)
        .set({ status: "UNKNOWN", updatedAt: new Date() })
        .where(
          and(
            eq(paymentOrders.id, prepared.order.id),
            eq(paymentOrders.status, "AUTHORIZATION_REQUESTED"),
          ),
        );
      await tx
        .update(payments)
        .set({ status: "UNKNOWN", updatedAt: new Date() })
        .where(
          and(
            eq(payments.id, prepared.payment.id),
            eq(payments.status, "AUTHORIZATION_REQUESTED"),
          ),
        );
    });
    throw conflict("PayPal authorization returned unexpected payer, seller, or amount data.");
  }
  await withTransaction(async (tx) => {
    const successOperationKey = paypalRequestId("authorization-success", result.authorizationId!);
    const [operation] = await tx
      .insert(paymentOperations)
      .values({
        id: newId("poper"),
        paymentId: prepared.payment.id,
        taskId: prepared.task.id,
        action: "AUTHORIZE",
        status: "SUCCEEDED",
        amountMinor: prepared.payment.amountMinor,
        currency: prepared.payment.currency,
        idempotencyKey: successOperationKey,
        providerOperationId: result.authorizationId,
        requestHash: hashObject({
          mode: prepared.payment.mode,
          externalOrderId: prepared.order.externalOrderId,
          localOrderId: prepared.order.id,
          payeeMerchantId: prepared.payment.sellerMerchantIdSnapshot,
          amount: expectedAmount,
          idempotencyKey: requestId,
        }),
        rawResponse: result as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: paymentOperations.id });
    if (!operation) {
      const [current] = await tx
        .select({ status: payments.status, authorizationId: payments.providerAuthorizationId })
        .from(payments)
        .where(eq(payments.id, prepared.payment.id))
        .limit(1);
      if (current?.status === "AUTHORIZED" && current.authorizationId === result.authorizationId) {
        return;
      }
      throw externalUnknown("PayPal authorization was finalized concurrently; reconcile it.");
    }
    const [updatedOrder] = await tx
      .update(paymentOrders)
      .set({ status: "AUTHORIZED", authorizedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(paymentOrders.id, prepared.order.id),
          inArray(paymentOrders.status, ["AUTHORIZATION_REQUESTED", "UNKNOWN"]),
        ),
      )
      .returning({ id: paymentOrders.id });
    const [updatedPayment] = await tx
      .update(payments)
      .set({
        status: "AUTHORIZED",
        providerAuthorizationId: result.authorizationId,
        authorizedAt: new Date(),
        authorizationExpiresAt: result.authorizationExpiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payments.id, prepared.payment.id),
          inArray(payments.status, ["AUTHORIZATION_REQUESTED", "UNKNOWN"]),
        ),
      )
      .returning({ id: payments.id });
    if (!updatedOrder || !updatedPayment) {
      throw externalUnknown("PayPal authorization completed after the local payment changed.");
    }
    await tx
      .update(commercialAgreements)
      .set({ status: "AUTHORIZED", updatedAt: new Date() })
      .where(eq(commercialAgreements.id, prepared.payment.agreementId));
    await appendEvent(tx, {
      type: "PAYMENT_AUTHORIZED",
      aggregateId: prepared.payment.id,
      taskId: prepared.task.id,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: prepared.task.id,
        paymentId: prepared.payment.id,
        amount: { amountMinor: expectedAmount.amountMinor, currency: expectedAmount.currency },
        paypalAuthorizationId: result.authorizationId!,
        simulated: false,
      },
    });
  });
  return assignAuthorizedExecution(prepared, options);
}

async function assignAuthorizedExecution(
  prepared: {
    task: typeof tasks.$inferSelect;
    order: typeof paymentOrders.$inferSelect;
    payment: typeof payments.$inferSelect;
  },
  options: { actor: Actor; correlationId: string },
) {
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.taskId, prepared.task.id))
      .limit(1);
    if (existing) return { paymentId: prepared.payment.id, executionId: existing.id };
    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, prepared.payment.agreementId))
      .limit(1);
    if (!agreement) throw notFound("Agreement");
    const [contract] = await tx
      .select()
      .from(workContracts)
      .where(eq(workContracts.id, agreement.contractId))
      .limit(1);
    if (!contract || contract.status !== "ACTIVE")
      throw conflict("The agreement contract is no longer active.");
    const execution = await assignExecution(tx, {
      taskId: prepared.task.id,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      agreementId: agreement.id,
      providerId: agreement.providerId,
    });
    return { paymentId: prepared.payment.id, executionId: execution.id };
  });
}

export async function cancelPayPalOrder(options: {
  taskId: string;
  externalOrderId: string;
  approvalState: string;
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
    assertOwner(task, options.actor);
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.externalOrderId, options.externalOrderId),
          eq(paymentOrders.approvalStateHash, sha256Hex(options.approvalState)),
        ),
      )
      .for("update")
      .limit(1);
    if (!order) throw notFound("PayPal order");
    if (order.expiresAt <= new Date()) throw conflict("PayPal approval is expired.");
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, order.paymentId), eq(payments.taskId, task.id)))
      .for("update")
      .limit(1);
    if (!payment || !isPayPalMode(payment.mode)) throw notFound("PayPal payment");
    const [latestOrder] = await tx
      .select({ id: paymentOrders.id })
      .from(paymentOrders)
      .where(eq(paymentOrders.paymentId, payment.id))
      .orderBy(desc(paymentOrders.generation))
      .limit(1);
    if (
      latestOrder?.id !== order.id ||
      order.mode !== payment.mode ||
      payment.providerOrderId !== order.externalOrderId ||
      order.status !== "AWAITING_APPROVAL" ||
      payment.status !== "AWAITING_BUYER_APPROVAL"
    ) {
      throw conflict("This PayPal order is no longer cancellable.");
    }
    const [cancelledOrder] = await tx
      .update(paymentOrders)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, "AWAITING_APPROVAL")),
      )
      .returning({ id: paymentOrders.id });
    const [resetPayment] = await tx
      .update(payments)
      .set({ status: "PENDING", providerOrderId: null, updatedAt: new Date() })
      .where(
        and(
          eq(payments.id, payment.id),
          eq(payments.status, "AWAITING_BUYER_APPROVAL"),
          eq(payments.providerOrderId, order.externalOrderId!),
        ),
      )
      .returning({ id: payments.id });
    if (!cancelledOrder || !resetPayment) {
      throw conflict("This PayPal order changed while cancellation was being processed.");
    }
    if (task.status === "PAYMENT_AUTHORIZATION") {
      await transitionTask(tx, {
        taskId: task.id,
        to: "AGREEMENT_READY",
        actor: options.actor,
        correlationId: options.correlationId,
      });
    }
    return { cancelled: true };
  });
}
