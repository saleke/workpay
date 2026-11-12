import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withTransaction } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import {
  paymentCommands,
  paymentDecisions,
  paymentOrders,
  payments,
} from "../../db/schema/payments.js";
import { paypalIdentityLinks, providerPaypalAccounts } from "../../db/schema/paypal.js";
import { providers } from "../../db/schema/providers.js";
import { users } from "../../db/schema/identity.js";
import { tasks } from "../../db/schema/tasks.js";
import { workReviewAssessments, workReviews } from "../../db/schema/work-reviews.js";
import {
  FakePayPal,
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
import {
  authorizeApprovedPayPalOrder,
  cancelPayPalOrder,
  createPayPalOrderForTask,
} from "../payments/paypal-order-service.js";
import { bindApprovedPayPalPayer } from "../payments/payer-binding.js";
import { reconcilePayPalPayment } from "../payments/reconciliation.js";
import {
  approvePaymentReleaseForTask,
  ensurePaymentForAgreement,
  releasePaymentForTask,
  simulateAuthorizationAndAssign,
} from "../payments/service.js";
import { approveContract } from "../contracts/service.js";
import { acceptAssignment } from "./service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("provider execution authorization (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
    setPaymentGateway(new FakePayPal());
  });

  afterAll(async () => {
    resetPaymentGateways();
    await closeTestDb();
  });

  it("does not let one professional accept another professional's assignment", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const assignedUser = await createUser(db, { role: "provider", name: "Assigned" });
    const otherUser = await createUser(db, { role: "provider", name: "Other" });
    const assignedProvider = await createProvider(db, { displayName: "Assigned professional" });
    const otherProvider = await createProvider(db, { displayName: "Other professional" });
    await db
      .update(providers)
      .set({ userId: assignedUser.id })
      .where(eq(providers.id, assignedProvider.id));
    await db
      .update(providers)
      .set({ userId: otherUser.id })
      .where(eq(providers.id, otherProvider.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "a".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: assignedProvider.id,
      contractVersion: 1,
      status: "AUTHORIZED",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "b".repeat(64),
    });
    const executionId = newId("exec");
    await db.insert(workExecutions).values({
      id: executionId,
      taskId: task.id,
      contractId,
      agreementId,
      providerId: assignedProvider.id,
      status: "ASSIGNED",
      contractVersion: 1,
      contractHash,
    });

    const otherActor: Actor = { kind: "USER", id: otherUser.id, role: "provider" };
    await expect(
      withTransaction((tx) =>
        acceptAssignment(tx, {
          executionId,
          providerId: assignedProvider.id,
          actor: otherActor,
          correlationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });

    const [unchanged] = await db
      .select({ status: workExecutions.status })
      .from(workExecutions)
      .where(eq(workExecutions.id, executionId));
    expect(unchanged?.status).toBe("ASSIGNED");

    const assignedActor: Actor = {
      kind: "USER",
      id: assignedUser.id,
      role: "provider",
    };
    const accepted = await withTransaction((tx) =>
      acceptAssignment(tx, {
        executionId,
        providerId: assignedProvider.id,
        actor: assignedActor,
        correlationId,
      }),
    );
    expect(accepted.status).toBe("ACCEPTED");
  });

  it("persists sandbox mode and requires PayPal approval before member assignment", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, {
      role: "buyer",
      name: "Member buyer",
      accountClass: "MEMBER",
    });
    const providerUser = await createUser(db, {
      role: "provider",
      name: "Member provider",
      accountClass: "MEMBER",
    });
    const provider = await createProvider(db, { displayName: "Member provider" });
    await db
      .update(providers)
      .set({ userId: providerUser.id })
      .where(eq(providers.id, provider.id));
    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "PayPal task",
        rawRequest: "Test a PayPal-backed agreement.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "1".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "PayPal task",
      summary: "PayPal-backed work.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: provider.id,
      contractVersion: 1,
      status: "PENDING_AUTHORIZATION",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "2".repeat(64),
    });
    await db.insert(providerPaypalAccounts).values({
      id: newId("ppacct"),
      providerId: provider.id,
      userId: providerUser.id,
      environment: "SANDBOX",
      trackingId: "tracking_member_provider",
      merchantId: "SELLER_MEMBER",
      status: "ACTIVE",
      paymentsReceivable: true,
      primaryEmailConfirmed: true,
      consentStatus: true,
    });
    let localOrderId = "";
    let localPaymentId = "";
    let approvalState = "";
    let captureVisible = false;
    const paypal = new SandboxPayPal({
      clientId: "client",
      clientSecret: "secret",
      webhookId: "webhook",
      partnerMerchantId: "PARTNER_MEMBER",
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
          localOrderId = body.purchase_units[0].reference_id;
          localPaymentId = body.purchase_units[0].custom_id;
          approvalState =
            new URL(body.payment_source.paypal.experience_context.return_url).searchParams.get(
              "state",
            ) ?? "";
          return new Response(
            JSON.stringify({
              id: "ORDER_MEMBER",
              status: "CREATED",
              links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/approve" }],
            }),
            { status: 201 },
          );
        }
        if (target.includes("/v2/payments/captures/CAP_MEMBER")) {
          return new Response(
            JSON.stringify({
              id: "CAP_MEMBER",
              status: "COMPLETED",
              amount: { currency_code: "USD", value: "90.00" },
              payee: { merchant_id: "SELLER_MEMBER" },
              supplementary_data: {
                related_ids: {
                  order_id: "ORDER_MEMBER",
                  authorization_id: "AUTH_MEMBER",
                },
              },
            }),
            { status: 200 },
          );
        }
        const orderBody = {
          id: "ORDER_MEMBER",
          status: init?.method === "POST" || captureVisible ? "COMPLETED" : "APPROVED",
          payer: {
            payer_id: "PAYER_MEMBER",
            email_address: "buyer-paypal@example.test",
          },
          purchase_units: [
            {
              reference_id: localOrderId,
              custom_id: localPaymentId,
              invoice_id: localOrderId,
              payee: { merchant_id: "SELLER_MEMBER" },
              amount: { currency_code: "USD", value: "90.00" },
              ...(init?.method === "POST" || captureVisible
                ? {
                    payments: {
                      authorizations: [
                        {
                          id: "AUTH_MEMBER",
                          status: "CREATED",
                          expiration_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                          amount: { currency_code: "USD", value: "90.00" },
                        },
                      ],
                      ...(captureVisible
                        ? {
                            captures: [
                              {
                                id: "CAP_MEMBER",
                                status: "COMPLETED",
                                amount: { currency_code: "USD", value: "90.00" },
                              },
                            ],
                          }
                        : {}),
                    },
                  }
                : {}),
            },
          ],
        };
        return new Response(JSON.stringify(orderBody), { status: 200 });
      }) as typeof fetch,
    });
    setPaymentGateway(paypal, "PAYPAL_SANDBOX");
    const payment = await withTransaction((tx) =>
      ensurePaymentForAgreement(tx, {
        taskId: task.id,
        agreementId,
        actor: buyer,
        correlationId,
      }),
    );
    expect(payment).toMatchObject({
      mode: "PAYPAL_SANDBOX",
      buyerUserId: buyerUser.id,
      providerId: provider.id,
      payerIdSnapshot: null,
      sellerMerchantIdSnapshot: "SELLER_MEMBER",
    });
    await expect(
      db.update(payments).set({ mode: "FAKE" }).where(eq(payments.id, payment.id)),
    ).rejects.toThrow("payments.mode is immutable");
    await db.update(tasks).set({ status: "AGREEMENT_READY" }).where(eq(tasks.id, task.id));
    const order = await createPayPalOrderForTask({
      taskId: task.id,
      actor: buyer,
      correlationId,
      appUrl: "https://tenfo.test",
    });
    expect(order).toMatchObject({ mode: "PAYPAL_SANDBOX", orderId: "ORDER_MEMBER" });
    const [beforeApproval] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, payment.id));
    expect(beforeApproval?.status).toBe("AWAITING_BUYER_APPROVAL");
    const authorized = await authorizeApprovedPayPalOrder({
      taskId: task.id,
      externalOrderId: "ORDER_MEMBER",
      approvalState,
      actor: buyer,
      correlationId,
    });
    expect(authorized.paymentId).toBe(payment.id);
    const [authorizedPayment] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(authorizedPayment).toMatchObject({
      status: "AUTHORIZED",
      providerOrderId: "ORDER_MEMBER",
      providerAuthorizationId: "AUTH_MEMBER",
      payerIdSnapshot: "PAYER_MEMBER",
    });
    const [payerLink] = await db
      .select()
      .from(paypalIdentityLinks)
      .where(eq(paypalIdentityLinks.userId, buyerUser.id));
    expect(payerLink).toMatchObject({
      environment: "SANDBOX",
      payerId: "PAYER_MEMBER",
      email: "buyer-paypal@example.test",
      status: "LINKED",
    });
    await expect(
      withTransaction((tx) =>
        bindApprovedPayPalPayer(tx, {
          userId: buyerUser.id,
          environment: "SANDBOX",
          payerId: "DIFFERENT_PAYER",
          email: "other-paypal@example.test",
          sellerMerchantId: "SELLER_MEMBER",
          source: { kind: "PAYMENT", id: "pay_other" },
        }),
      ),
    ).rejects.toThrow("Finish or cancel active PayPal payments");
    await expect(
      db
        .update(payments)
        .set({ payerIdSnapshot: "DIFFERENT_PAYER" })
        .where(eq(payments.id, payment.id)),
    ).rejects.toThrow("payment payer binding is immutable");
    await expect(
      db
        .update(paymentOrders)
        .set({ payerIdSnapshot: "DIFFERENT_PAYER" })
        .where(eq(paymentOrders.paymentId, payment.id)),
    ).rejects.toThrow("payment order payer binding is immutable");
    await expect(
      cancelPayPalOrder({
        taskId: task.id,
        externalOrderId: "ORDER_MEMBER",
        approvalState,
        actor: buyer,
        correlationId,
      }),
    ).rejects.toThrow("no longer cancellable");
    const decisionId = newId("pdec");
    const commandId = newId("pcmd");
    await db.insert(paymentDecisions).values({
      id: decisionId,
      paymentId: payment.id,
      taskId: task.id,
      action: "CAPTURE",
      result: "ALLOW",
      reasonCode: "capture.allowed",
      policyVersion: "pay-policy-v2",
      inputsHash: "3".repeat(64),
    });
    await db.insert(paymentCommands).values({
      id: commandId,
      paymentId: payment.id,
      taskId: task.id,
      decisionId,
      amountMinor: 9_000,
      currency: "USD",
      idempotencyKey: "unknown-capture-member",
      consumed: true,
      consumedAt: new Date(),
    });
    await db.update(tasks).set({ status: "PAYMENT_RELEASE" }).where(eq(tasks.id, task.id));
    await db.update(payments).set({ status: "UNKNOWN" }).where(eq(payments.id, payment.id));
    captureVisible = true;
    await expect(
      reconcilePayPalPayment({ paymentId: payment.id, correlationId }),
    ).resolves.toMatchObject({ status: "CAPTURED" });
    const [reconciledPayment] = await db
      .select({ status: payments.status, captureId: payments.providerCaptureId })
      .from(payments)
      .where(eq(payments.id, payment.id));
    expect(reconciledPayment).toEqual({ status: "CAPTURED", captureId: "CAP_MEMBER" });
    setPaymentGateway(null, "PAYPAL_SANDBOX");
  });

  it("creates an assignment only after the owner explicitly authorizes the payment", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const providerUser = await createUser(db, { role: "provider", name: "Professional" });
    const provider = await createProvider(db, { displayName: "Professional" });
    await db
      .update(providers)
      .set({ userId: providerUser.id })
      .where(eq(providers.id, provider.id));
    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "c".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: provider.id,
      contractVersion: 1,
      status: "PENDING_AUTHORIZATION",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "d".repeat(64),
    });
    await db.update(tasks).set({ status: "AGREEMENT_READY" }).where(eq(tasks.id, task.id));

    const otherBuyer = await createUser(db, { role: "buyer", name: "Other buyer" });
    await expect(
      simulateAuthorizationAndAssign({
        taskId: task.id,
        actor: { kind: "USER", id: otherBuyer.id, role: "buyer" },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });

    const result = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    expect(result.alreadyPrepared).toBe(false);

    const [payment] = await db.select().from(payments).where(eq(payments.id, result.paymentId));
    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.id, result.executionId));
    const [updatedTask] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(payment?.status).toBe("AUTHORIZED");
    expect(execution?.status).toBe("ASSIGNED");
    expect(updatedTask?.status).toBe("PAYMENT_AUTHORIZATION");

    const repeated = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    expect(repeated).toMatchObject({
      paymentId: result.paymentId,
      executionId: result.executionId,
      alreadyPrepared: true,
    });
  });

  it("blocks payout release before the task reaches the approval gate", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const providerUser = await createUser(db, { role: "provider", name: "Professional" });
    const provider = await createProvider(db, { displayName: "Professional" });
    await db
      .update(providers)
      .set({ userId: providerUser.id, payoutEmail: "provider@example.com" })
      .where(eq(providers.id, provider.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "h".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: provider.id,
      contractVersion: 1,
      status: "AUTHORIZED",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "i".repeat(64),
    });
    await db.update(tasks).set({ status: "AGREEMENT_READY" }).where(eq(tasks.id, task.id));

    await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });

    await expect(
      releasePaymentForTask({
        taskId: task.id,
        actor: buyer,
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "DOMAIN_CONFLICT" });

    const [updatedTask] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(updatedTask?.status).toBe("PAYMENT_AUTHORIZATION");
  });

  it("records one simulated capture after explicit buyer approval", async () => {
    const db = getDb();
    const gateway = new FakePayPal();
    setPaymentGateway(gateway);
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const providerUser = await createUser(db, { role: "provider", name: "Professional" });
    const provider = await createProvider(db, { displayName: "Professional" });
    await db
      .update(providers)
      .set({ userId: providerUser.id, payoutEmail: "provider@example.com" })
      .where(eq(providers.id, provider.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "f".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: provider.id,
      contractVersion: 1,
      status: "AUTHORIZED",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "g".repeat(64),
    });
    await db.update(tasks).set({ status: "AGREEMENT_READY" }).where(eq(tasks.id, task.id));

    const prepared = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    expect(prepared.paymentId).toBeTruthy();

    const executionId = prepared.executionId;
    const reviewId = newId("wreview");
    await withTransaction(async (tx) => {
      await tx.insert(workReviews).values({
        id: reviewId,
        taskId: task.id,
        executionId,
        contractId,
        contractVersion: 1,
        contractHash,
        sequence: 1,
        kind: "FINAL",
        status: "FINAL_ACCEPTED",
        title: "Final report review",
        openingNote: "Review the completed report against the agreed requirement.",
        requirementKeys: ["report"],
        openedByUserId: buyerUser.id,
        providerResponseSummary: "The report is ready for final review.",
        providerRespondedAt: new Date(),
        packageHash: "a".repeat(64),
        decisionByUserId: buyerUser.id,
        decisionRole: "CLIENT",
        decisionReason: "The report meets the current agreement.",
        decidedAt: new Date(),
      });
      await tx.insert(workReviewAssessments).values({
        id: newId("wrassess"),
        reviewId,
        requirementKey: "report",
        status: "MET",
        rationale: "The completed report was reviewed.",
        assessedByUserId: buyerUser.id,
      });
      await tx
        .update(workExecutions)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(workExecutions.id, executionId));
      await tx.update(tasks).set({ status: "REVIEW_ACCEPTED" }).where(eq(tasks.id, task.id));
    });
    await approvePaymentReleaseForTask({
      taskId: task.id,
      expectedPaymentId: prepared.paymentId,
      expectedAmountMinor: 9_000,
      expectedCurrency: "USD",
      actor: buyer,
      correlationId,
    });

    const attempts = await Promise.allSettled([
      releasePaymentForTask({ taskId: task.id, actor: buyer, correlationId }),
      releasePaymentForTask({ taskId: task.id, actor: buyer, correlationId }),
    ]);
    const result = attempts.find(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof releasePaymentForTask>>> =>
        attempt.status === "fulfilled" && attempt.value.captured,
    )?.value;

    expect(result?.captured).toBe(true);
    expect(result?.status).toBe("CAPTURED");
    expect(gateway.successfulCaptureCount()).toBe(1);

    const [updatedTask] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, task.id));
    const [updatedPayment] = await db
      .select({ status: payments.status, providerCaptureId: payments.providerCaptureId })
      .from(payments)
      .where(eq(payments.taskId, task.id));
    expect(updatedTask?.status).toBe("COMPLETED");
    expect(updatedPayment?.status).toBe("CAPTURED");
    expect(updatedPayment?.providerCaptureId).toBeTruthy();
  });

  it("does not let one buyer approve another buyer's contract", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const owner = await createUser(db, { role: "buyer", name: "Owner" });
    const other = await createUser(db, { role: "buyer", name: "Other buyer" });
    const ownerActor: Actor = { kind: "USER", id: owner.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: ownerActor,
        title: "Private task",
        rawRequest: "Prepare a private deliverable.",
        budget: money(5_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "e".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "AWAITING_APPROVAL",
      title: "Private task",
      summary: "Private terms",
      contractHash,
      budgetMinor: 5_000,
      currency: "USD",
    });

    await expect(
      withTransaction((tx) =>
        approveContract(tx, {
          contractId,
          expectedHash: contractHash,
          actor: { kind: "USER", id: other.id, role: "buyer" },
          correlationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const approved = await withTransaction((tx) =>
      approveContract(tx, {
        contractId,
        expectedHash: contractHash,
        actor: ownerActor,
        correlationId,
      }),
    );
    expect(approved.status).toBe("ACTIVE");
    expect(approved.approvedBy).toBe(owner.id);
  });
});
