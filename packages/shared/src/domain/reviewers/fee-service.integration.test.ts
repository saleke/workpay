import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withTransaction } from "../../db/client.js";
import { taskConversations } from "../../db/schema/conversations.js";
import { workContracts } from "../../db/schema/contracts.js";
import { independentReviewEngagements } from "../../db/schema/independent-reviews.js";
import { paypalIdentityLinks, providerPaypalAccounts } from "../../db/schema/paypal.js";
import { reviewFeeOperations, reviewFeePayments } from "../../db/schema/review-fees.js";
import { providers } from "../../db/schema/providers.js";
import {
  SandboxPayPal,
  resetPaymentGateways,
  setPaymentGateway,
} from "../../integrations/payments/index.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money } from "../../platform/money.js";
import {
  closeTestDb,
  createProvider,
  createUser,
  hasTestDatabase,
  resetDatabase,
} from "../../testing/index.js";
import type { Actor } from "../identity/authorize.js";
import { createTask } from "../tasks/service.js";
import { completeReviewFeePayPal, createReviewFeeOrder } from "./fee-service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("PayPal review fee (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
    resetPaymentGateways();
  });

  afterAll(async () => {
    resetPaymentGateways();
    await closeTestDb();
  });

  it("binds payer, reviewer, amount, authorization, and capture before engaging the reviewer", async () => {
    const db = getDb();
    const buyerUser = await createUser(db, { role: "buyer", accountClass: "MEMBER" });
    const providerUser = await createUser(db, { role: "provider", accountClass: "MEMBER" });
    const reviewerUser = await createUser(db, {
      role: "admin_reviewer",
      accountClass: "MEMBER",
    });
    const provider = await createProvider(db);
    const reviewerProvider = await createProvider(db, { displayName: "Paid reviewer" });
    await db
      .update(providers)
      .set({ userId: providerUser.id })
      .where(eq(providers.id, provider.id));
    await db
      .update(providers)
      .set({ userId: reviewerUser.id })
      .where(eq(providers.id, reviewerProvider.id));
    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const correlationId = newCorrelationId();
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Paid review",
        rawRequest: "Review the agreed work.",
        budget: money(30_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "b".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Paid review task",
      summary: "Review the agreed work.",
      contractHash,
      budgetMinor: 30_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const conversationId = newId("conv");
    await db.insert(taskConversations).values({
      id: conversationId,
      taskId: task.id,
      buyerUserId: buyerUser.id,
      providerId: provider.id,
      providerUserId: providerUser.id,
      status: "OPEN",
      contactApprovedAt: new Date(),
      contactApprovedContractVersion: 1,
      contactApprovedContractHash: contractHash,
      currentContractVersion: 1,
      currentContractHash: contractHash,
      currentContractSnapshot: {},
      contractSnapshot: {},
    });
    const engagementId = newId("irev");
    await db.insert(independentReviewEngagements).values({
      id: engagementId,
      taskId: task.id,
      conversationId,
      contractId,
      contractVersion: 1,
      contractHash,
      buyerUserId: buyerUser.id,
      providerUserId: providerUser.id,
      reviewerUserId: reviewerUser.id,
      reviewerProviderId: reviewerProvider.id,
      proposerUserId: buyerUser.id,
      requirementKeys: ["quality"],
      domains: ["quality"],
      brief: "Review the agreed work package and return findings to the client.",
      authority: "ADVISORY",
      feeMinor: 12_000,
      feeCurrency: "USD",
      feePayer: "BUYER",
      feeMode: "PAYPAL",
      feeStatus: "PENDING",
      status: "AWAITING_FEE_AUTHORIZATION",
      buyerAcceptedAt: new Date(),
      providerAcceptedAt: new Date(),
      reviewerAcceptedAt: new Date(),
      reviewerConflictConfirmed: true,
    });
    await db.insert(paypalIdentityLinks).values({
      id: newId("plink"),
      userId: buyerUser.id,
      environment: "SANDBOX",
      payerId: "BUYER_PAYER",
      email: "buyer-paypal@example.test",
      emailVerified: true,
      accountVerified: true,
      status: "LINKED",
    });
    await db.insert(providerPaypalAccounts).values({
      id: newId("ppacct"),
      providerId: reviewerProvider.id,
      userId: reviewerUser.id,
      environment: "SANDBOX",
      trackingId: "reviewer_tracking",
      merchantId: "REVIEWER_MERCHANT",
      status: "ACTIVE",
      paymentsReceivable: true,
      primaryEmailConfirmed: true,
      consentStatus: true,
    });
    const reviewFeePaymentId = newId("rfee");
    await db.insert(reviewFeePayments).values({
      id: reviewFeePaymentId,
      engagementId,
      payerUserId: buyerUser.id,
      reviewerProviderId: reviewerProvider.id,
      mode: "PAYPAL_SANDBOX",
      amountMinor: 12_000,
      currency: "USD",
      status: "PENDING",
      payerIdSnapshot: "BUYER_PAYER",
      sellerMerchantIdSnapshot: "REVIEWER_MERCHANT",
    });

    let approvalState = "";
    const paypal = new SandboxPayPal({
      clientId: "client",
      clientSecret: "secret",
      webhookId: "webhook",
      partnerMerchantId: "PARTNER",
      bnCode: "TENFO_TEST",
      env: "sandbox",
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.endsWith("/v1/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
            status: 200,
          });
        }
        if (target.endsWith("/v2/checkout/orders") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          approvalState =
            new URL(body.payment_source.paypal.experience_context.return_url).searchParams.get(
              "state",
            ) ?? "";
          expect(body.purchase_units[0]).toMatchObject({
            reference_id: reviewFeePaymentId,
            custom_id: `review-fee:${reviewFeePaymentId}`,
            payee: { merchant_id: "REVIEWER_MERCHANT" },
            amount: { currency_code: "USD", value: "120.00" },
          });
          return new Response(
            JSON.stringify({
              id: "REVIEW_ORDER",
              status: "CREATED",
              links: [
                { rel: "payer-action", href: "https://www.sandbox.paypal.com/approve-review" },
              ],
            }),
            { status: 201 },
          );
        }
        if (target.endsWith("/v2/checkout/orders/REVIEW_ORDER") && init?.method === "GET") {
          return new Response(
            JSON.stringify({
              id: "REVIEW_ORDER",
              status: "APPROVED",
              payer: { payer_id: "BUYER_PAYER" },
              purchase_units: [
                {
                  reference_id: reviewFeePaymentId,
                  custom_id: `review-fee:${reviewFeePaymentId}`,
                  invoice_id: reviewFeePaymentId,
                  payee: { merchant_id: "REVIEWER_MERCHANT" },
                  amount: { currency_code: "USD", value: "120.00" },
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (target.endsWith("/v2/checkout/orders/REVIEW_ORDER/authorize")) {
          return new Response(
            JSON.stringify({
              id: "REVIEW_ORDER",
              status: "COMPLETED",
              payer: { payer_id: "BUYER_PAYER" },
              purchase_units: [
                {
                  reference_id: reviewFeePaymentId,
                  custom_id: `review-fee:${reviewFeePaymentId}`,
                  invoice_id: reviewFeePaymentId,
                  payee: { merchant_id: "REVIEWER_MERCHANT" },
                  payments: {
                    authorizations: [
                      {
                        id: "REVIEW_AUTH",
                        status: "CREATED",
                        expiration_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        amount: { currency_code: "USD", value: "120.00" },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 201 },
          );
        }
        return new Response(
          JSON.stringify({
            id: "REVIEW_CAPTURE",
            status: "COMPLETED",
            amount: { currency_code: "USD", value: "120.00" },
            payee: { merchant_id: "REVIEWER_MERCHANT" },
            supplementary_data: {
              related_ids: { order_id: "REVIEW_ORDER", authorization_id: "REVIEW_AUTH" },
            },
          }),
          { status: 201 },
        );
      }) as typeof fetch,
    });
    setPaymentGateway(paypal, "PAYPAL_SANDBOX");

    const order = await createReviewFeeOrder({
      engagementId,
      payerUserId: buyerUser.id,
      actor: buyer,
      correlationId,
      appUrl: "https://tenfo.test",
    });
    expect(order).toMatchObject({ paid: false, simulated: false });
    expect(order.approvalUrl).toContain("paypal.com");
    await expect(
      completeReviewFeePayPal({
        externalOrderId: "REVIEW_ORDER",
        state: approvalState,
        payerUserId: buyerUser.id,
        actor: buyer,
        correlationId,
      }),
    ).resolves.toEqual({ paid: true });
    const [payment] = await db
      .select()
      .from(reviewFeePayments)
      .where(eq(reviewFeePayments.id, reviewFeePaymentId));
    const [engagement] = await db
      .select()
      .from(independentReviewEngagements)
      .where(eq(independentReviewEngagements.id, engagementId));
    const operations = await db
      .select()
      .from(reviewFeeOperations)
      .where(eq(reviewFeeOperations.reviewFeePaymentId, reviewFeePaymentId));
    expect(payment).toMatchObject({
      status: "PAID",
      providerAuthorizationId: "REVIEW_AUTH",
      providerCaptureId: "REVIEW_CAPTURE",
    });
    expect(engagement).toMatchObject({ status: "ENGAGED", feeStatus: "PAID" });
    expect(operations.map((operation) => [operation.action, operation.status])).toEqual(
      expect.arrayContaining([
        ["AUTHORIZE", "SUCCEEDED"],
        ["CAPTURE", "SUCCEEDED"],
      ]),
    );
  });
});
