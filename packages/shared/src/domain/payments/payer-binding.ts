import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { paypalIdentityLinks, providerPaypalAccounts } from "../../db/schema/paypal.js";
import { payments } from "../../db/schema/payments.js";
import { reviewFeePayments } from "../../db/schema/review-fees.js";
import type { PayPalEnvironment } from "../../integrations/payments/config.js";
import { conflict } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";

export async function bindApprovedPayPalPayer(
  tx: Database,
  input: {
    userId: string;
    environment: PayPalEnvironment;
    payerId: string;
    email: string;
    sellerMerchantId: string;
    source: { kind: "PAYMENT"; id: string } | { kind: "REVIEW_FEE_PAYMENT"; id: string };
  },
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${input.environment}:user:${input.userId}`}))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${input.environment}:${input.payerId}`}))`,
  );
  const [currentLink] = await tx
    .select({ payerId: paypalIdentityLinks.payerId })
    .from(paypalIdentityLinks)
    .where(
      and(
        eq(paypalIdentityLinks.userId, input.userId),
        eq(paypalIdentityLinks.environment, input.environment),
      ),
    )
    .limit(1);
  const [payerOwner] = await tx
    .select({ userId: paypalIdentityLinks.userId })
    .from(paypalIdentityLinks)
    .where(
      and(
        eq(paypalIdentityLinks.environment, input.environment),
        eq(paypalIdentityLinks.payerId, input.payerId),
      ),
    )
    .limit(1);
  const [sellerConflict] = await tx
    .select({ id: providerPaypalAccounts.id })
    .from(providerPaypalAccounts)
    .where(
      and(
        eq(providerPaypalAccounts.environment, input.environment),
        eq(providerPaypalAccounts.merchantId, input.payerId),
      ),
    )
    .limit(1);
  if (payerOwner && payerOwner.userId !== input.userId) {
    throw conflict("This PayPal payer account is already linked to another Tenfo member.");
  }
  if (sellerConflict || input.payerId === input.sellerMerchantId) {
    throw conflict("The buyer and professional must use different PayPal accounts.");
  }
  if (currentLink && currentLink.payerId !== input.payerId) {
    const mode = input.environment === "LIVE" ? "PAYPAL_LIVE" : "PAYPAL_SANDBOX";
    const [activePayment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.buyerUserId, input.userId),
          eq(payments.mode, mode),
          notInArray(payments.status, ["CAPTURED", "VOIDED", "REFUNDED", "FAILED"]),
          input.source.kind === "PAYMENT" ? ne(payments.id, input.source.id) : undefined,
        ),
      )
      .limit(1);
    const [activeReviewFee] = await tx
      .select({ id: reviewFeePayments.id })
      .from(reviewFeePayments)
      .where(
        and(
          eq(reviewFeePayments.payerUserId, input.userId),
          eq(reviewFeePayments.mode, mode),
          notInArray(reviewFeePayments.status, ["PAID", "FAILED", "CANCELLED"]),
          input.source.kind === "REVIEW_FEE_PAYMENT"
            ? ne(reviewFeePayments.id, input.source.id)
            : undefined,
        ),
      )
      .limit(1);
    if (activePayment || activeReviewFee) {
      throw conflict(
        "Finish or cancel active PayPal payments before using a different payer account.",
      );
    }
  }
  const [link] = await tx
    .insert(paypalIdentityLinks)
    .values({
      id: newId("plink"),
      userId: input.userId,
      environment: input.environment,
      payerId: input.payerId,
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      accountVerified: true,
      scopes: ["checkout_order_approval"],
      status: "LINKED",
      revokedAt: null,
      linkedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [paypalIdentityLinks.userId, paypalIdentityLinks.environment],
      set: {
        payerId: input.payerId,
        email: input.email.trim().toLowerCase(),
        emailVerified: true,
        accountVerified: true,
        scopes: ["checkout_order_approval"],
        status: "LINKED",
        revokedAt: null,
        linkedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!link) throw conflict("The approved PayPal payer could not be linked.");
  return link;
}
