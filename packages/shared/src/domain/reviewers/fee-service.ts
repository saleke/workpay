import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { withTransaction } from "../../db/client.js";
import { independentReviewEngagements } from "../../db/schema/independent-reviews.js";
import { reviewFeeOperations, reviewFeePayments } from "../../db/schema/review-fees.js";
import { appendEvent } from "../../events/outbox.js";
import { getPayPalClient } from "../../integrations/payments/index.js";
import { isPayPalMode } from "../../integrations/payments/config.js";
import { paypalRequestId } from "../../integrations/payments/idempotency.js";
import { authorizationError, conflict, externalUnknown, notFound } from "../../platform/errors.js";
import { sha256Hex } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import { money, type Money } from "../../platform/money.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";

async function lockFeeContext(tx: Database, engagementId: string, payerUserId: string) {
  const [engagement] = await tx
    .select()
    .from(independentReviewEngagements)
    .where(eq(independentReviewEngagements.id, engagementId))
    .for("update")
    .limit(1);
  if (!engagement) throw notFound("Review engagement");
  const [payment] = await tx
    .select()
    .from(reviewFeePayments)
    .where(
      and(
        eq(reviewFeePayments.engagementId, engagement.id),
        eq(reviewFeePayments.payerUserId, payerUserId),
      ),
    )
    .for("update")
    .limit(1);
  if (!payment) throw notFound("Review fee payment");
  return { engagement, payment };
}

async function finalizeEngagementIfPaid(
  tx: Database,
  engagement: typeof independentReviewEngagements.$inferSelect,
  actor: Actor,
  correlationId: string,
) {
  const [unpaid] = await tx
    .select({ id: reviewFeePayments.id })
    .from(reviewFeePayments)
    .where(
      and(eq(reviewFeePayments.engagementId, engagement.id), ne(reviewFeePayments.status, "PAID")),
    )
    .limit(1);
  if (unpaid) return false;
  const [updated] = await tx
    .update(independentReviewEngagements)
    .set({ status: "ENGAGED", feeStatus: "PAID", feePaidAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(independentReviewEngagements.id, engagement.id),
        eq(independentReviewEngagements.status, "AWAITING_FEE_AUTHORIZATION"),
      ),
    )
    .returning();
  if (!updated) return engagement.status === "ENGAGED";
  await appendEvent(tx, {
    type: "INDEPENDENT_REVIEW_ENGAGED",
    aggregateId: updated.id,
    taskId: updated.taskId,
    actor: toEventActor(actor),
    correlationId,
    payload: {
      taskId: updated.taskId,
      engagementId: updated.id,
      contractVersion: updated.contractVersion,
      reviewerUserId: updated.reviewerUserId,
    },
  });
  return true;
}

async function markReviewFeePaid(
  tx: Database,
  input: {
    engagement: typeof independentReviewEngagements.$inferSelect;
    payment: typeof reviewFeePayments.$inferSelect;
    authorizationId: string;
    captureId: string;
    actor: Actor;
    correlationId: string;
    simulated: boolean;
    rawResponse?: Record<string, unknown>;
  },
) {
  const amount = money(input.payment.amountMinor, input.payment.currency as Money["currency"]);
  const captureOperationKey = paypalRequestId("review-fee-capture-success", input.captureId);
  const [operation] = await tx
    .insert(reviewFeeOperations)
    .values({
      id: newId("rfop"),
      reviewFeePaymentId: input.payment.id,
      action: "CAPTURE",
      status: "SUCCEEDED",
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      idempotencyKey: captureOperationKey,
      providerOperationId: input.captureId,
      rawResponse: input.rawResponse ?? { simulated: input.simulated },
    })
    .onConflictDoNothing()
    .returning({ id: reviewFeeOperations.id });
  if (!operation) {
    const [current] = await tx
      .select({ status: reviewFeePayments.status })
      .from(reviewFeePayments)
      .where(eq(reviewFeePayments.id, input.payment.id))
      .limit(1);
    return current?.status === "PAID";
  }
  const [paid] = await tx
    .update(reviewFeePayments)
    .set({
      status: "PAID",
      providerAuthorizationId: input.authorizationId,
      providerCaptureId: input.captureId,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(reviewFeePayments.id, input.payment.id), ne(reviewFeePayments.status, "PAID")))
    .returning({ id: reviewFeePayments.id });
  if (!paid) return true;
  await appendEvent(tx, {
    type: "REVIEW_FEE_PAID",
    aggregateId: input.payment.id,
    taskId: input.engagement.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: input.engagement.taskId,
      engagementId: input.engagement.id,
      reviewFeePaymentId: input.payment.id,
      payerUserId: input.payment.payerUserId,
      reviewerUserId: input.engagement.reviewerUserId,
      amount,
      simulated: input.simulated,
    },
  });
  await finalizeEngagementIfPaid(tx, input.engagement, input.actor, input.correlationId);
  return true;
}

export async function getReviewFeeStatus(db: Database, engagementId: string, userId: string) {
  const [engagement] = await db
    .select()
    .from(independentReviewEngagements)
    .where(eq(independentReviewEngagements.id, engagementId))
    .limit(1);
  if (
    !engagement ||
    ![engagement.buyerUserId, engagement.providerUserId, engagement.reviewerUserId].includes(userId)
  ) {
    throw notFound("Review engagement");
  }
  const payments = await db
    .select()
    .from(reviewFeePayments)
    .where(eq(reviewFeePayments.engagementId, engagement.id));
  return { engagement, payments };
}

export async function createReviewFeeOrder(options: {
  engagementId: string;
  payerUserId: string;
  actor: Actor;
  correlationId: string;
  appUrl: string;
}) {
  if (options.actor.kind !== "USER" || options.actor.id !== options.payerUserId) {
    throw authorizationError("Only the named payer can approve this review fee.");
  }
  const state = randomBytes(32).toString("base64url");
  const prepared = await withTransaction(async (tx) => {
    const context = await lockFeeContext(tx, options.engagementId, options.payerUserId);
    if (context.engagement.status !== "AWAITING_FEE_AUTHORIZATION") {
      if (context.payment.status === "PAID") return { ...context, alreadyPaid: true as const };
      throw conflict("This engagement is not awaiting a review fee.");
    }
    if (context.payment.status === "PAID") return { ...context, alreadyPaid: true as const };
    if (context.payment.mode === "FAKE") {
      await markReviewFeePaid(tx, {
        ...context,
        authorizationId: `fake_review_auth_${context.payment.id}`,
        captureId: `fake_review_capture_${context.payment.id}`,
        actor: options.actor,
        correlationId: options.correlationId,
        simulated: true,
      });
      return { ...context, alreadyPaid: true as const };
    }
    if (!isPayPalMode(context.payment.mode)) throw conflict("Review fee mode is invalid.");
    if (
      context.payment.status === "AWAITING_APPROVAL" &&
      context.payment.approvalUrl &&
      context.payment.expiresAt &&
      context.payment.expiresAt > new Date()
    ) {
      return { ...context, alreadyPaid: false as const, reused: true as const };
    }
    if (
      ["ORDER_REQUESTED", "AUTHORIZATION_REQUESTED", "CAPTURE_REQUESTED", "UNKNOWN"].includes(
        context.payment.status,
      )
    ) {
      throw externalUnknown("The review fee payment must be reconciled before another attempt.");
    }
    const requestId = paypalRequestId("review-fee-order", context.payment.id);
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const [claimed] = await tx
      .update(reviewFeePayments)
      .set({
        status: "ORDER_REQUESTED",
        requestId,
        approvalStateHash: sha256Hex(state),
        expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(eq(reviewFeePayments.id, context.payment.id), eq(reviewFeePayments.status, "PENDING")),
      )
      .returning();
    if (!claimed) throw conflict("The review fee payment changed concurrently.");
    return {
      engagement: context.engagement,
      payment: claimed,
      alreadyPaid: false as const,
      reused: false as const,
    };
  });
  if (prepared.alreadyPaid)
    return { paid: true, approvalUrl: null, simulated: prepared.payment.mode === "FAKE" };
  if (prepared.reused) {
    return { paid: false, approvalUrl: prepared.payment.approvalUrl, simulated: false };
  }
  const payment = prepared.payment;
  if (!isPayPalMode(payment.mode)) throw conflict("Review fee mode changed.");
  const appUrl = options.appUrl.replace(/\/$/, "");
  const returnUrl = `${appUrl}/api/v1/review-fees/paypal/return?state=${encodeURIComponent(state)}`;
  const cancelUrl = `${appUrl}/api/v1/review-fees/paypal/cancel?state=${encodeURIComponent(state)}`;
  const result = await getPayPalClient(payment.mode).createOrder({
    localOrderId: payment.id,
    paymentId: `review-fee:${payment.id}`,
    amount: money(payment.amountMinor, payment.currency as Money["currency"]),
    description: "Independent review fee",
    payeeMerchantId: payment.sellerMerchantIdSnapshot!,
    returnUrl,
    cancelUrl,
    idempotencyKey: payment.requestId!,
  });
  if (result.status !== "SUCCESS" || !result.orderId || !result.approvalUrl) {
    await withTransaction(async (tx) => {
      await tx
        .update(reviewFeePayments)
        .set({ status: result.status === "DECLINED" ? "FAILED" : "UNKNOWN", updatedAt: new Date() })
        .where(eq(reviewFeePayments.id, payment.id));
      await tx
        .update(independentReviewEngagements)
        .set({
          feeStatus: result.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          updatedAt: new Date(),
        })
        .where(eq(independentReviewEngagements.id, prepared.engagement.id));
    });
    if (result.status === "UNKNOWN")
      throw externalUnknown("The PayPal review fee order is uncertain.");
    throw conflict(result.errorMessage ?? "PayPal declined the review fee order.");
  }
  await withTransaction((tx) =>
    tx
      .update(reviewFeePayments)
      .set({
        status: "AWAITING_APPROVAL",
        externalOrderId: result.orderId,
        approvalUrl: result.approvalUrl,
        updatedAt: new Date(),
      })
      .where(
        and(eq(reviewFeePayments.id, payment.id), eq(reviewFeePayments.status, "ORDER_REQUESTED")),
      ),
  );
  return { paid: false, approvalUrl: result.approvalUrl, simulated: false };
}

export async function completeReviewFeePayPal(options: {
  externalOrderId: string;
  state: string;
  payerUserId: string;
  actor: Actor;
  correlationId: string;
}) {
  if (options.actor.kind !== "USER" || options.actor.id !== options.payerUserId) {
    throw authorizationError("Only the named payer can complete this review fee.");
  }
  const prepared = await withTransaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(reviewFeePayments)
      .where(
        and(
          eq(reviewFeePayments.externalOrderId, options.externalOrderId),
          eq(reviewFeePayments.approvalStateHash, sha256Hex(options.state)),
          eq(reviewFeePayments.payerUserId, options.payerUserId),
        ),
      )
      .for("update")
      .limit(1);
    if (!payment || !payment.expiresAt || payment.expiresAt <= new Date()) {
      throw conflict("The review fee approval is invalid or expired.");
    }
    const [engagement] = await tx
      .select()
      .from(independentReviewEngagements)
      .where(eq(independentReviewEngagements.id, payment.engagementId))
      .for("update")
      .limit(1);
    if (!engagement) throw notFound("Review engagement");
    if (payment.status === "PAID") return { engagement, payment, alreadyPaid: true as const };
    if (payment.status !== "AWAITING_APPROVAL") {
      throw conflict("The review fee is not awaiting PayPal approval.");
    }
    await tx
      .update(reviewFeePayments)
      .set({ status: "AUTHORIZATION_REQUESTED", updatedAt: new Date() })
      .where(eq(reviewFeePayments.id, payment.id));
    return { engagement, payment, alreadyPaid: false as const };
  });
  if (prepared.alreadyPaid) return { paid: true };
  const { engagement, payment } = prepared;
  if (!isPayPalMode(payment.mode)) throw conflict("Review fee mode is not PayPal.");
  const client = getPayPalClient(payment.mode);
  const expectedAmount = money(payment.amountMinor, payment.currency as Money["currency"]);
  const order = await client.getOrder(payment.externalOrderId!, payment.sellerMerchantIdSnapshot!);
  if (
    order.status !== "APPROVED" ||
    order.payerId !== payment.payerIdSnapshot ||
    order.payeeMerchantId !== payment.sellerMerchantIdSnapshot ||
    order.referenceId !== payment.id ||
    order.customId !== `review-fee:${payment.id}` ||
    order.invoiceId !== payment.id ||
    order.amount?.amountMinor !== expectedAmount.amountMinor ||
    order.amount.currency !== expectedAmount.currency
  ) {
    throw conflict(
      "PayPal review fee approval does not match the agreed payer, reviewer, or amount.",
    );
  }
  const authorizationKey = paypalRequestId("review-fee-authorize", payment.id);
  const authorization = await client.authorizeApprovedOrder({
    orderId: payment.externalOrderId!,
    payeeMerchantId: payment.sellerMerchantIdSnapshot!,
    idempotencyKey: authorizationKey,
  });
  if (
    authorization.status !== "SUCCESS" ||
    !authorization.authorizationId ||
    authorization.providerOrderId !== payment.externalOrderId ||
    authorization.providerStatus !== "COMPLETED" ||
    authorization.referenceId !== payment.id ||
    authorization.customId !== `review-fee:${payment.id}` ||
    authorization.invoiceId !== payment.id ||
    authorization.authorizationStatus !== "CREATED" ||
    !authorization.authorizationExpiresAt ||
    authorization.authorizationExpiresAt <= new Date() ||
    authorization.payerId !== payment.payerIdSnapshot ||
    authorization.payeeMerchantId !== payment.sellerMerchantIdSnapshot ||
    authorization.amount?.amountMinor !== expectedAmount.amountMinor ||
    authorization.amount.currency !== expectedAmount.currency
  ) {
    await withTransaction(async (tx) => {
      await tx
        .update(reviewFeePayments)
        .set({
          status: authorization.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          providerAuthorizationId: authorization.authorizationId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(reviewFeePayments.id, payment.id));
      await tx
        .update(independentReviewEngagements)
        .set({
          feeStatus: authorization.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          updatedAt: new Date(),
        })
        .where(eq(independentReviewEngagements.id, engagement.id));
    });
    if (authorization.status === "UNKNOWN")
      throw externalUnknown("Review fee authorization is uncertain.");
    throw conflict(authorization.errorMessage ?? "PayPal declined the review fee authorization.");
  }
  await withTransaction(async (tx) => {
    await tx
      .insert(reviewFeeOperations)
      .values({
        id: newId("rfop"),
        reviewFeePaymentId: payment.id,
        action: "AUTHORIZE",
        status: "SUCCEEDED",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        idempotencyKey: paypalRequestId(
          "review-fee-authorization-success",
          authorization.authorizationId!,
        ),
        providerOperationId: authorization.authorizationId,
        rawResponse: authorization as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing();
    await tx
      .update(reviewFeePayments)
      .set({
        status: "CAPTURE_REQUESTED",
        providerAuthorizationId: authorization.authorizationId,
        updatedAt: new Date(),
      })
      .where(eq(reviewFeePayments.id, payment.id));
  });
  const captureKey = paypalRequestId("review-fee-capture", payment.id);
  const capture = await client.capture({
    authorizationId: authorization.authorizationId,
    amount: expectedAmount,
    payeeMerchantId: payment.sellerMerchantIdSnapshot!,
    idempotencyKey: captureKey,
  });
  if (
    capture.status !== "SUCCESS" ||
    !capture.captureId ||
    capture.providerStatus !== "COMPLETED" ||
    capture.amount?.amountMinor !== expectedAmount.amountMinor ||
    capture.amount.currency !== expectedAmount.currency ||
    capture.authorizationId !== authorization.authorizationId ||
    capture.orderId !== payment.externalOrderId ||
    capture.payeeMerchantId !== payment.sellerMerchantIdSnapshot
  ) {
    await withTransaction(async (tx) => {
      await tx
        .insert(reviewFeeOperations)
        .values({
          id: newId("rfop"),
          reviewFeePaymentId: payment.id,
          action: "CAPTURE",
          status: capture.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          idempotencyKey: captureKey,
          providerOperationId: capture.captureId ?? null,
          rawResponse: capture as unknown as Record<string, unknown>,
          errorCode: capture.errorCode ?? null,
          errorMessage: capture.errorMessage ?? null,
        })
        .onConflictDoNothing();
      await tx
        .update(reviewFeePayments)
        .set({
          status: capture.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          providerCaptureId: capture.captureId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(reviewFeePayments.id, payment.id));
      await tx
        .update(independentReviewEngagements)
        .set({
          feeStatus: capture.status === "DECLINED" ? "FAILED" : "UNKNOWN",
          updatedAt: new Date(),
        })
        .where(eq(independentReviewEngagements.id, engagement.id));
    });
    if (capture.status === "UNKNOWN") throw externalUnknown("Review fee capture is uncertain.");
    throw conflict(capture.errorMessage ?? "PayPal declined the review fee capture.");
  }
  await withTransaction((tx) =>
    markReviewFeePaid(tx, {
      engagement,
      payment,
      authorizationId: authorization.authorizationId!,
      captureId: capture.captureId!,
      actor: options.actor,
      correlationId: options.correlationId,
      simulated: false,
      rawResponse: capture as unknown as Record<string, unknown>,
    }),
  );
  return { paid: true };
}

export async function cancelReviewFeeOrder(options: {
  state: string;
  externalOrderId: string;
  payerUserId: string;
  actor: Actor;
}) {
  if (options.actor.kind !== "USER" || options.actor.id !== options.payerUserId) {
    throw authorizationError();
  }
  return withTransaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(reviewFeePayments)
      .where(
        and(
          eq(reviewFeePayments.externalOrderId, options.externalOrderId),
          eq(reviewFeePayments.approvalStateHash, sha256Hex(options.state)),
          eq(reviewFeePayments.payerUserId, options.payerUserId),
          eq(reviewFeePayments.status, "AWAITING_APPROVAL"),
        ),
      )
      .for("update")
      .limit(1);
    if (!payment) throw notFound("Review fee order");
    await tx
      .update(reviewFeePayments)
      .set({
        status: "PENDING",
        externalOrderId: null,
        approvalStateHash: null,
        approvalUrl: null,
        expiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(reviewFeePayments.id, payment.id));
    return { cancelled: true };
  });
}

export async function reconcileReviewFeePayment(options: {
  reviewFeePaymentId: string;
  actor: Actor;
  correlationId: string;
}) {
  const prepared = await withTransaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(reviewFeePayments)
      .where(eq(reviewFeePayments.id, options.reviewFeePaymentId))
      .for("update")
      .limit(1);
    if (!payment) throw notFound("Review fee payment");
    if (
      options.actor.kind !== "SYSTEM" &&
      (options.actor.kind !== "USER" || options.actor.id !== payment.payerUserId)
    ) {
      throw authorizationError("Only the payer can reconcile this review fee.");
    }
    const [engagement] = await tx
      .select()
      .from(independentReviewEngagements)
      .where(eq(independentReviewEngagements.id, payment.engagementId))
      .limit(1);
    if (!engagement) throw notFound("Review engagement");
    if (payment.status === "PAID") return { payment, engagement, alreadyPaid: true as const };
    if (!isPayPalMode(payment.mode) || !payment.externalOrderId) {
      throw externalUnknown("The review fee has no PayPal order to reconcile.");
    }
    return { payment, engagement, alreadyPaid: false as const };
  });
  if (prepared.alreadyPaid) return { paid: true };
  const { payment, engagement } = prepared;
  if (!isPayPalMode(payment.mode)) throw conflict("Review fee mode is not PayPal.");
  const client = getPayPalClient(payment.mode);
  const amount = money(payment.amountMinor, payment.currency as Money["currency"]);
  const order = await client.getOrder(payment.externalOrderId!, payment.sellerMerchantIdSnapshot!);
  if (
    order.payerId !== payment.payerIdSnapshot ||
    order.payeeMerchantId !== payment.sellerMerchantIdSnapshot ||
    order.referenceId !== payment.id ||
    order.customId !== `review-fee:${payment.id}` ||
    order.invoiceId !== payment.id ||
    order.amount?.amountMinor !== amount.amountMinor ||
    order.amount.currency !== amount.currency
  ) {
    throw conflict("PayPal returned mismatched review fee data during reconciliation.");
  }
  if (order.captureId) {
    const capture = await client.getCapture(order.captureId, payment.sellerMerchantIdSnapshot!);
    if (
      capture.status !== "COMPLETED" ||
      capture.amount?.amountMinor !== amount.amountMinor ||
      capture.amount.currency !== amount.currency ||
      capture.orderId !== payment.externalOrderId ||
      (capture.payeeMerchantId !== null &&
        capture.payeeMerchantId !== payment.sellerMerchantIdSnapshot)
    ) {
      throw externalUnknown("The PayPal review fee capture is not final yet.");
    }
    const authorizationId =
      capture.authorizationId ?? order.authorizationId ?? payment.providerAuthorizationId;
    if (!authorizationId) {
      throw externalUnknown("PayPal did not return the review fee authorization binding.");
    }
    await withTransaction((tx) =>
      markReviewFeePaid(tx, {
        engagement,
        payment,
        authorizationId,
        captureId: capture.id,
        actor: options.actor,
        correlationId: options.correlationId,
        simulated: false,
        rawResponse: capture as unknown as Record<string, unknown>,
      }),
    );
    return { paid: true };
  }
  let authorizationId = order.authorizationId ?? payment.providerAuthorizationId;
  if (!authorizationId && order.status === "APPROVED") {
    const authorization = await client.authorizeApprovedOrder({
      orderId: payment.externalOrderId!,
      payeeMerchantId: payment.sellerMerchantIdSnapshot!,
      idempotencyKey: paypalRequestId("review-fee-authorize", payment.id),
    });
    if (authorization.status !== "SUCCESS" || !authorization.authorizationId) {
      throw externalUnknown("The PayPal review fee authorization is not final yet.");
    }
    authorizationId = authorization.authorizationId;
  }
  if (!authorizationId)
    throw externalUnknown("PayPal has not exposed the review fee authorization.");
  const capture = await client.capture({
    authorizationId,
    amount,
    payeeMerchantId: payment.sellerMerchantIdSnapshot!,
    idempotencyKey: paypalRequestId("review-fee-capture", payment.id),
  });
  if (
    capture.status !== "SUCCESS" ||
    !capture.captureId ||
    capture.amount?.amountMinor !== amount.amountMinor ||
    capture.amount.currency !== amount.currency ||
    capture.authorizationId !== authorizationId ||
    capture.orderId !== payment.externalOrderId ||
    capture.payeeMerchantId !== payment.sellerMerchantIdSnapshot
  ) {
    throw externalUnknown("The PayPal review fee capture is not final yet.");
  }
  await withTransaction((tx) =>
    markReviewFeePaid(tx, {
      engagement,
      payment,
      authorizationId,
      captureId: capture.captureId!,
      actor: options.actor,
      correlationId: options.correlationId,
      simulated: false,
      rawResponse: capture as unknown as Record<string, unknown>,
    }),
  );
  return { paid: true };
}
