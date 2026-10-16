/**
 * End-to-end economic pipeline integration test.
 *
 * This is the flagship suite. It drives one full vertical slice through the
 * real services and a real PostgreSQL database:
 *
 *   create -> plan -> draft contract -> approve -> select provider -> negotiate
 *   -> accept offer -> authorize payment -> execute -> submit (flawed) ->
 *   verify FAIL -> revise -> submit (clean) -> verify PASS -> capture
 *
 * It deliberately proves the hard parts of the thesis, not the happy path:
 *
 *  - a failed verification cannot release money;
 *  - a capture requested before an acceptance decision exists is denied;
 *  - an open blocking case freezes capture until it is resolved;
 *  - a second capture attempt cannot double-spend;
 *  - every domain event has exactly one outbox row (invariant D1).
 *
 * The suite is gated on RUN_DB_TESTS=1 and a DATABASE_URL so `pnpm test` stays
 * green with no database (CI, fresh clone). It never touches the network: the
 * fake AI, fake payment gateway and local object storage are injected.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { getDb, withTransaction } from "../db/client.js";
import { events, outboxEvents } from "../db/schema/infra.js";
import { paymentOperations } from "../db/schema/payments.js";
import { getEnv } from "../platform/env.js";
import { newCorrelationId } from "../platform/ids.js";
import { money } from "../platform/money.js";
import {
  hasTestDatabase,
  resetDatabase,
  closeTestDb,
  createProvider,
  createUser,
} from "../testing/index.js";
import { setAIClient, FakeAI } from "../integrations/ai/index.js";
import { setObjectStorage } from "../integrations/storage/index.js";
import { LocalObjectStorage } from "../integrations/storage/local.js";
import { setPaymentGateway, FakePayPal } from "../integrations/payments/index.js";
import type { Actor } from "./identity/authorize.js";
import { createTask, getTaskById, transitionTask } from "./tasks/service.js";
import { approveContract, getActiveContractForTask } from "./contracts/service.js";
import { submitProviderOffer } from "./negotiation/service.js";
import { captureIfAllowed, getPaymentForTask } from "./payments/service.js";
import { acceptAssignment, createSubmission, startWork, submitWork } from "./execution/service.js";
import { openCase, resolveCase } from "./cases/service.js";
import {
  agentAcceptOffer,
  agentAuthorizeAndAssign,
  agentPlanAndDraftContract,
  agentSelectProviderAndNegotiate,
  agentSendOffer,
  agentVerifySubmission,
  ensureAgent,
} from "./agent/orchestrator.js";

// Load .env (walking up from cwd) only when the suite is opted in, so the flag
// itself decides whether a database is required.
if (process.env.RUN_DB_TESTS === "1") getEnv();

const describeDb = hasTestDatabase() ? describe : describe.skip;

const FLAWED_CSV = [
  "id,name,email,joined_at",
  "1,Alice,alice@example.com,2024-01-01",
  "2,,alice@example.com,2024-01-02",
  "",
].join("\n");

const CLEAN_CSV = [
  "id,name,email,joined_at",
  "1,Alice,alice@example.com,2024-01-01",
  "2,Bob,bob@example.com,2024-01-02",
  "3,Carol,carol@example.com,2024-01-03",
  "",
].join("\n");

describeDb("economic pipeline (integration)", () => {
  let storageDir: string;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "workpay-it-"));
    setAIClient(new FakeAI());
    setPaymentGateway(new FakePayPal());
    setObjectStorage(
      new LocalObjectStorage({ baseDir: storageDir, publicBaseUrl: "http://localhost:3000" }),
    );
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDb();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("runs commit -> execute -> prove -> settle on the real database", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();

    const buyerRow = await createUser(db, { role: "buyer", name: "Buyer" });
    const reviewerRow = await createUser(db, { role: "admin_reviewer", name: "Reviewer" });
    const provider = await createProvider(db, {
      tags: ["data_cleaning", "spreadsheet"],
    });

    const buyer: Actor = { kind: "USER", id: buyerRow.id, role: "buyer" };
    const providerActor: Actor = { kind: "PROVIDER", id: provider.id };
    const reviewer: Actor = { kind: "REVIEWER", id: reviewerRow.id, role: "admin_reviewer" };
    const system: Actor = { kind: "SYSTEM", id: null };

    // 1. The buyer states intent. The original request is preserved verbatim.
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Clean this customer CSV",
        rawRequest: "Please clean my 5,000-row customer CSV and dedupe the emails.",
        budget: money(15000, "USD"),
        correlationId,
      }),
    );

    // 2. The agent plans and drafts the contract for buyer review.
    const { actor: agentActor } = await ensureAgent({ taskId: task.id, userId: buyerRow.id });
    const drafted = await agentPlanAndDraftContract({
      taskId: task.id,
      actor: agentActor,
      correlationId,
    });
    expect(drafted.ok).toBe(true);

    const contract = await getActiveContractForTask(db, task.id);
    if (!contract) throw new Error("expected a contract to be drafted");
    expect(contract.status).toBe("AWAITING_APPROVAL");

    // 3. The buyer approves; the task advances to APPROVED.
    await withTransaction((tx) =>
      approveContract(tx, { contractId: contract.id, actor: buyer, correlationId }),
    );
    expect((await getTaskById(db, task.id))?.status).toBe("APPROVED");

    // 4. Provider selection and a bounded negotiation.
    const selection = await agentSelectProviderAndNegotiate({
      taskId: task.id,
      actor: agentActor,
      correlationId,
    });
    expect(selection.ok).toBe(true);
    if (!selection.ok) throw new Error("expected a provider to be selected");
    expect(selection.providerId).toBe(provider.id);

    const buyerOffer = await agentSendOffer({
      taskId: task.id,
      negotiationId: selection.negotiationId,
      actor: agentActor,
      correlationId,
    });
    expect(buyerOffer.ok).toBe(true);

    const providerOffer = await withTransaction((tx) =>
      submitProviderOffer(tx, {
        negotiationId: selection.negotiationId,
        actor: providerActor,
        correlationId,
        priceMinor: 13500,
        deliveryDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        message: "I can clean the dataset for $135.",
      }),
    );

    const accepted = await agentAcceptOffer({
      taskId: task.id,
      offerId: providerOffer.offerId,
      actor: agentActor,
      correlationId,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error("expected the offer to be accepted");

    // 5. Authorize payment and assign execution. Money is protected, not moved.
    const assignment = await agentAuthorizeAndAssign({
      taskId: task.id,
      agreementId: accepted.agreement.agreementId,
      contractId: contract.id,
      providerId: provider.id,
      actor: agentActor,
      correlationId,
    });
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) throw new Error("expected payment authorization to succeed");
    const executionId = assignment.executionId;

    const payment = await getPaymentForTask(db, task.id);
    if (!payment) throw new Error("expected a payment to exist");
    expect(payment.status).toBe("AUTHORIZED");
    expect(payment.amountMinor).toBe(13500);

    // Capture before any acceptance decision exists must be denied.
    const premature = await captureIfAllowed({
      paymentId: payment.id,
      actor: system,
      correlationId,
    });
    expect(premature.captured).toBe(false);
    expect(premature.decision.result).toBe("DENY");
    expect(premature.decision.reasonCode).toBe("verification.decision_present");

    // 6. The provider accepts and starts the work.
    await withTransaction((tx) =>
      acceptAssignment(tx, {
        executionId,
        providerId: provider.id,
        actor: providerActor,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      startWork(tx, { executionId, providerId: provider.id, actor: providerActor, correlationId }),
    );

    // 7. First submission is intentionally flawed (duplicate email, empty name).
    const firstSubmission = await withTransaction((tx) =>
      createSubmission(tx, {
        executionId,
        providerId: provider.id,
        actor: providerActor,
        correlationId,
        notes: "First attempt at cleaning the dataset.",
        artifacts: [
          {
            type: "PRIMARY_DELIVERABLE",
            filename: "output.csv",
            contentType: "text/csv",
            bytes: new TextEncoder().encode(FLAWED_CSV),
          },
        ],
      }),
    );
    await withTransaction((tx) =>
      submitWork(tx, {
        submissionId: firstSubmission.id,
        providerId: provider.id,
        actor: providerActor,
        correlationId,
      }),
    );

    // 8. Verification fails and the payment stays protected.
    const failed = await agentVerifySubmission({
      taskId: task.id,
      submissionId: firstSubmission.id,
      actor: agentActor,
      correlationId,
    });
    expect(failed.outcome).toBe("FAIL");
    expect((await getTaskById(db, task.id))?.status).toBe("REVISION_REQUIRED");

    const afterFail = await captureIfAllowed({
      paymentId: payment.id,
      actor: system,
      correlationId,
    });
    expect(afterFail.captured).toBe(false);

    // 9. The provider resumes work and resubmits a clean deliverable.
    await withTransaction((tx) =>
      startWork(tx, { executionId, providerId: provider.id, actor: providerActor, correlationId }),
    );
    const secondSubmission = await withTransaction((tx) =>
      createSubmission(tx, {
        executionId,
        providerId: provider.id,
        actor: providerActor,
        correlationId,
        notes: "Removed the duplicate and test rows; the dataset is now clean.",
        artifacts: [
          {
            type: "PRIMARY_DELIVERABLE",
            filename: "output.csv",
            contentType: "text/csv",
            bytes: new TextEncoder().encode(CLEAN_CSV),
          },
        ],
      }),
    );
    await withTransaction((tx) =>
      submitWork(tx, {
        submissionId: secondSubmission.id,
        providerId: provider.id,
        actor: providerActor,
        correlationId,
      }),
    );

    // 10. Verification passes; the task becomes eligible for payment release.
    const passed = await agentVerifySubmission({
      taskId: task.id,
      submissionId: secondSubmission.id,
      actor: agentActor,
      correlationId,
    });
    expect(passed.outcome).toBe("PASS");
    expect((await getTaskById(db, task.id))?.status).toBe("PAYMENT_RELEASE");

    // 11. An open blocking case freezes capture until it is resolved.
    const blockingCase = await withTransaction((tx) =>
      openCase(tx, {
        taskId: task.id,
        type: "DISPUTE",
        category: "WORK_DISPUTE",
        title: "Buyer dispute",
        description: "The buyer disputes the result.",
        blocksPaymentCapture: true,
        actor: buyer,
        correlationId,
      }),
    );
    const blocked = await captureIfAllowed({ paymentId: payment.id, actor: system, correlationId });
    expect(blocked.captured).toBe(false);
    expect(blocked.decision.reasonCode).toBe("case.no_blocker");

    await withTransaction((tx) =>
      resolveCase(tx, {
        caseId: blockingCase.id,
        outcome: "RELEASE_PAYMENT",
        rationale: "Reviewed the evidence; the deliverable satisfies the contract.",
        actor: reviewer,
        correlationId,
      }),
    );

    // 12. Capture succeeds, and a second attempt cannot double-spend.
    const captured = await captureIfAllowed({
      paymentId: payment.id,
      actor: system,
      correlationId,
    });
    expect(captured.captured).toBe(true);

    const secondCaptureAttempt = await captureIfAllowed({
      paymentId: payment.id,
      actor: system,
      correlationId,
    });
    expect(secondCaptureAttempt.captured).toBe(false);

    const succeededCaptures = await db
      .select()
      .from(paymentOperations)
      .where(
        and(
          eq(paymentOperations.paymentId, payment.id),
          eq(paymentOperations.action, "CAPTURE"),
          eq(paymentOperations.status, "SUCCEEDED"),
        ),
      );
    expect(succeededCaptures).toHaveLength(1);

    const settled = await getPaymentForTask(db, task.id);
    expect(settled?.status).toBe("CAPTURED");
    expect(settled?.capturedAmountMinor).toBe(13500);

    // 13. The task is completed only after settlement.
    await withTransaction((tx) =>
      transitionTask(tx, { taskId: task.id, to: "COMPLETED", actor: system, correlationId }),
    );
    expect((await getTaskById(db, task.id))?.status).toBe("COMPLETED");

    // 14. Invariant D1: every domain event has exactly one outbox row.
    const [eventRow] = await db.select({ eventCount: sql<number>`count(*)::int` }).from(events);
    const [outboxRow] = await db
      .select({ outboxCount: sql<number>`count(*)::int` })
      .from(outboxEvents);
    const eventCount = eventRow?.eventCount ?? 0;
    const outboxCount = outboxRow?.outboxCount ?? 0;
    expect(eventCount).toBeGreaterThan(0);
    expect(outboxCount).toBe(eventCount);
  });
});
