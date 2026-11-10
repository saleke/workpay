import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withTransaction } from "../../db/client.js";
import { taskConversations } from "../../db/schema/conversations.js";
import { contractRequirements, workContracts } from "../../db/schema/contracts.js";
import { providerAcceptances, workExecutions } from "../../db/schema/execution.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { availability, providers, providerSelections } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import { workCommitments } from "../../db/schema/work-commitments.js";
import {
  FakePayPal,
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
import {
  approvePaymentReleaseForTask,
  releasePaymentForTask,
  simulateAuthorizationAndAssign,
} from "../payments/service.js";
import { createTask } from "../tasks/service.js";
import { respondToTaskConversation, startTaskConversation } from "../conversations/service.js";
import {
  confirmWorkCommitment,
  proposeWorkCommitment,
  respondToWorkCommitment,
} from "./service.js";
import { startWork } from "../execution/service.js";
import {
  addWorkReviewItem,
  decideWorkReview,
  openWorkReview,
  recordWorkReviewAssessment,
  respondToReviewResolution,
  respondToWorkReviewRequest,
} from "../reviews/service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("mutual work commitment (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
    setPaymentGateway(new FakePayPal());
  });

  afterAll(async () => {
    resetPaymentGateways();
    await closeTestDb();
  });

  it("requires provider acceptance and one final client choice across competing conversations", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Client" });
    const providerAUser = await createUser(db, { role: "provider", name: "Professional A" });
    const providerBUser = await createUser(db, { role: "provider", name: "Professional B" });
    const providerA = await createProvider(db, { displayName: "Professional A" });
    const providerB = await createProvider(db, { displayName: "Professional B" });
    await db
      .update(providers)
      .set({ userId: providerAUser.id, bio: "Professional A profile" })
      .where(eq(providers.id, providerA.id));
    await db
      .update(providers)
      .set({ userId: providerBUser.id, bio: "Professional B profile" })
      .where(eq(providers.id, providerB.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Mutual commitment task",
        rawRequest: "Deliver the approved report.",
        budget: money(12_000, "USD"),
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
      title: "Approved report",
      summary: "Prepare and deliver the approved report.",
      contractHash,
      budgetMinor: 12_000,
      currency: "USD",
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    await db.insert(contractRequirements).values([
      {
        id: newId("creq"),
        contractId,
        key: "navigation",
        statement: "The site navigation reaches every agreed page.",
        acceptanceRelevant: true,
      },
      {
        id: newId("creq"),
        contractId,
        key: "mobile",
        statement: "The agreed pages remain usable on a mobile viewport.",
        acceptanceRelevant: true,
      },
    ]);
    await db.update(tasks).set({ status: "PROVIDER_SEARCH" }).where(eq(tasks.id, task.id));
    await db.insert(providerSelections).values({
      id: newId("sel"),
      taskId: task.id,
      contractId,
      providerId: null,
      status: "CANDIDATES_AVAILABLE",
      candidates: [
        { providerId: providerA.id, displayName: providerA.displayName, eligible: true },
        { providerId: providerB.id, displayName: providerB.displayName, eligible: true },
      ],
      reason: "Two eligible professionals",
    });

    const startConversation = (providerId: string) =>
      withTransaction((tx) =>
        startTaskConversation(tx, {
          taskId: task.id,
          buyerUserId: buyerUser.id,
          providerId,
          expectedContractVersion: 1,
          expectedContractHash: contractHash,
          initialMessage: "Would you review this work?",
          clientMessageId: newId("cmsg"),
          actor: buyer,
          correlationId,
        }),
      );
    const conversationA = await startConversation(providerA.id);
    const conversationB = await startConversation(providerB.id);
    await withTransaction((tx) =>
      respondToTaskConversation(tx, {
        conversationId: conversationA.conversationId,
        providerUserId: providerAUser.id,
        response: "accept",
        actor: { kind: "USER", id: providerAUser.id, role: "provider" },
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToTaskConversation(tx, {
        conversationId: conversationB.conversationId,
        providerUserId: providerBUser.id,
        response: "accept",
        actor: { kind: "USER", id: providerBUser.id, role: "provider" },
        correlationId,
      }),
    );

    const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const proposalA = await withTransaction((tx) =>
      proposeWorkCommitment(tx, {
        conversationId: conversationA.conversationId,
        buyerUserId: buyerUser.id,
        amountMinor: 9_000,
        currency: "USD",
        deliveryDeadline: deadline,
        actor: buyer,
        correlationId,
      }),
    );
    const proposalB = await withTransaction((tx) =>
      proposeWorkCommitment(tx, {
        conversationId: conversationB.conversationId,
        buyerUserId: buyerUser.id,
        amountMinor: 9_500,
        currency: "USD",
        deliveryDeadline: deadline,
        actor: buyer,
        correlationId,
      }),
    );
    expect(await db.select().from(commercialAgreements)).toHaveLength(0);

    await expect(
      withTransaction((tx) =>
        respondToWorkCommitment(tx, {
          commitmentId: proposalA.id,
          providerUserId: providerBUser.id,
          response: "ACCEPT",
          actor: { kind: "USER", id: providerBUser.id, role: "provider" },
          correlationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await withTransaction((tx) =>
      respondToWorkCommitment(tx, {
        commitmentId: proposalA.id,
        providerUserId: providerAUser.id,
        response: "ACCEPT",
        actor: { kind: "USER", id: providerAUser.id, role: "provider" },
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToWorkCommitment(tx, {
        commitmentId: proposalB.id,
        providerUserId: providerBUser.id,
        response: "ACCEPT",
        actor: { kind: "USER", id: providerBUser.id, role: "provider" },
        correlationId,
      }),
    );
    expect(await db.select().from(commercialAgreements)).toHaveLength(0);

    const confirmations = await Promise.allSettled([
      withTransaction((tx) =>
        confirmWorkCommitment(tx, {
          commitmentId: proposalA.id,
          buyerUserId: buyerUser.id,
          actor: buyer,
          correlationId,
        }),
      ),
      withTransaction((tx) =>
        confirmWorkCommitment(tx, {
          commitmentId: proposalB.id,
          buyerUserId: buyerUser.id,
          actor: buyer,
          correlationId,
        }),
      ),
    ]);
    expect(confirmations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(confirmations.filter((result) => result.status === "rejected")).toHaveLength(1);

    const commitments = await db
      .select()
      .from(workCommitments)
      .where(eq(workCommitments.taskId, task.id));
    expect(commitments.filter((item) => item.status === "CONFIRMED")).toHaveLength(1);
    expect(commitments.filter((item) => item.status === "NOT_SELECTED")).toHaveLength(1);
    const confirmed = commitments.find((item) => item.status === "CONFIRMED")!;
    const [agreement] = await db
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.taskId, task.id));
    expect(agreement).toMatchObject({
      workCommitmentId: confirmed.id,
      providerId: confirmed.providerId,
      agreedPriceMinor: confirmed.amountMinor,
      status: "PENDING_AUTHORIZATION",
    });
    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updatedTask?.status).toBe("AGREEMENT_READY");
    const conversations = await db
      .select()
      .from(taskConversations)
      .where(eq(taskConversations.taskId, task.id));
    expect(conversations.find((item) => item.id === confirmed.conversationId)?.status).toBe("OPEN");
    expect(conversations.find((item) => item.id !== confirmed.conversationId)?.status).toBe(
      "CLOSED",
    );

    const assignment = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.id, assignment.executionId));
    expect(execution?.status).toBe("ACCEPTED");
    const [providerAcceptance] = await db
      .select()
      .from(providerAcceptances)
      .where(eq(providerAcceptances.executionId, assignment.executionId));
    expect(providerAcceptance?.acceptedContractHash).toBe(contractHash);
    const [selectedAvailability] = await db
      .select()
      .from(availability)
      .where(eq(availability.providerId, confirmed.providerId));
    expect(selectedAvailability?.activeAssignments).toBe(1);

    const selectedProviderUser =
      confirmed.providerId === providerA.id ? providerAUser : providerBUser;
    const selectedProviderActor: Actor = {
      kind: "USER",
      id: selectedProviderUser.id,
      role: "provider",
    };
    await withTransaction((tx) =>
      startWork(tx, {
        executionId: assignment.executionId,
        providerId: confirmed.providerId,
        actor: selectedProviderActor,
        correlationId,
      }),
    );

    const checkpoint = await withTransaction((tx) =>
      openWorkReview(tx, {
        taskId: task.id,
        buyerUserId: buyerUser.id,
        kind: "CHECKPOINT",
        title: "Navigation checkpoint",
        openingNote: "Prepare the current navigation flow for a focused client review.",
        requirementKeys: ["navigation"],
        responseWindowDays: 5,
        actor: buyer,
        correlationId,
      }),
    );
    await expect(
      withTransaction((tx) =>
        decideWorkReview(tx, {
          reviewId: checkpoint.id,
          decision: "ACCEPT_CHECKPOINT",
          reason: "This should not be accepted before the professional responds.",
          riskAcknowledged: false,
          actor: buyer,
          correlationId,
        }),
      ),
    ).rejects.toThrow("review package is not ready");
    const otherProviderActor: Actor = {
      kind: "USER",
      id: selectedProviderUser.id === providerAUser.id ? providerBUser.id : providerAUser.id,
      role: "provider",
    };
    await expect(
      withTransaction((tx) =>
        respondToWorkReviewRequest(tx, {
          reviewId: checkpoint.id,
          action: "SEND_PACKAGE",
          summary: "A different professional cannot send this package.",
          actor: otherProviderActor,
          correlationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
    await withTransaction((tx) =>
      addWorkReviewItem(tx, {
        reviewId: checkpoint.id,
        actor: selectedProviderActor,
        type: "LINK",
        label: "Staging site",
        url: "https://example.test/staging",
        note: "Use the main navigation on desktop and mobile.",
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToWorkReviewRequest(tx, {
        reviewId: checkpoint.id,
        action: "SEND_PACKAGE",
        summary: "Navigation is available on the staging site for this checkpoint.",
        actor: selectedProviderActor,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      recordWorkReviewAssessment(tx, {
        reviewId: checkpoint.id,
        requirementKey: "navigation",
        status: "MET",
        rationale: "Every agreed page was reached from the primary navigation.",
        actor: buyer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      decideWorkReview(tx, {
        reviewId: checkpoint.id,
        decision: "ACCEPT_CHECKPOINT",
        reason: "The navigation checkpoint is complete and work can continue.",
        riskAcknowledged: false,
        actor: buyer,
        correlationId,
      }),
    );

    const finalReview = await withTransaction((tx) =>
      openWorkReview(tx, {
        taskId: task.id,
        buyerUserId: buyerUser.id,
        kind: "FINAL",
        title: "Final website review",
        openingNote: "Prepare the complete staging site for final review against the agreement.",
        requirementKeys: [],
        responseWindowDays: 5,
        actor: buyer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      addWorkReviewItem(tx, {
        reviewId: finalReview.id,
        actor: selectedProviderActor,
        type: "NOTE",
        note: "The final staging build includes the agreed navigation and mobile layout.",
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToWorkReviewRequest(tx, {
        reviewId: finalReview.id,
        action: "SEND_PACKAGE",
        summary: "The final staging build is ready for the client's review.",
        actor: selectedProviderActor,
        correlationId,
      }),
    );
    for (const requirementKey of ["navigation", "mobile"]) {
      await withTransaction((tx) =>
        recordWorkReviewAssessment(tx, {
          reviewId: finalReview.id,
          requirementKey,
          status: requirementKey === "mobile" ? "UNCLEAR" : "MET",
          rationale:
            requirementKey === "mobile"
              ? "One older mobile browser remains untested."
              : "Navigation was reviewed on the final staging build.",
          actor: buyer,
          correlationId,
        }),
      );
    }
    await expect(
      withTransaction((tx) =>
        decideWorkReview(tx, {
          reviewId: finalReview.id,
          decision: "ACCEPT_FINAL",
          reason: "The staging build is acceptable with the recorded browser uncertainty.",
          riskAcknowledged: false,
          actor: buyer,
          correlationId,
        }),
      ),
    ).rejects.toThrow("Explicitly acknowledge");
    await withTransaction((tx) =>
      decideWorkReview(tx, {
        reviewId: finalReview.id,
        decision: "EXPRESS_DISSATISFACTION",
        reason:
          "The older mobile browser remains untested, so I am not ready to accept the final work.",
        riskAcknowledged: false,
        dissatisfactionRemedy: "PAID_REVIEW",
        actor: buyer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToReviewResolution(tx, {
        reviewId: finalReview.id,
        response: "DISAGREE",
        note:
          "The current agreement does not require that older browser, so I request review against the exact scope.",
        actor: selectedProviderActor,
        correlationId,
      }),
    );
    const [disputedTask] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(disputedTask?.status).toBe("DISPUTED");
    await withTransaction((tx) =>
      decideWorkReview(tx, {
        reviewId: finalReview.id,
        decision: "ACCEPT_FINAL",
        reason: "The final staging build meets the agreed constraints.",
        riskAcknowledged: true,
        actor: buyer,
        correlationId,
      }),
    );
    await approvePaymentReleaseForTask({
      taskId: task.id,
      expectedPaymentId: assignment.paymentId,
      expectedAmountMinor: confirmed.amountMinor,
      expectedCurrency: "USD",
      actor: buyer,
      correlationId,
    });
    const released = await releasePaymentForTask({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    expect(released).toMatchObject({ captured: true, status: "CAPTURED" });
  });
});
