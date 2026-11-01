import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withTransaction } from "../../db/client.js";
import {
  acceptanceRules,
  contractRequirements,
  scopeItems,
  workContracts,
} from "../../db/schema/contracts.js";
import { taskConversations } from "../../db/schema/conversations.js";
import { events, outboxEvents } from "../../db/schema/infra.js";
import { reviewerConflicts, reviewerProfiles } from "../../db/schema/reviewers.js";
import { providers } from "../../db/schema/providers.js";
import { hasTestDatabase, resetDatabase, closeTestDb, createProvider, createUser } from "../../testing/index.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money } from "../../platform/money.js";
import type { Actor } from "../identity/authorize.js";
import { createTask } from "../tasks/service.js";
import {
  decideIndependentReviewEngagement,
  listReviewerEngagements,
  proposeIndependentReview,
  submitIndependentReviewReport,
} from "./independent-review-service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("independent review engagement (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("binds consent to the accepted contract and prevents post-engagement decline", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const providerUser = await createUser(db, { role: "provider", name: "Professional" });
    const reviewerUser = await createUser(db, { role: "admin_reviewer", name: "Reviewer" });
    const provider = await createProvider(db);
    await db.update(providers).set({ userId: providerUser.id }).where(eq(providers.id, provider.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const professional: Actor = { kind: "USER", id: providerUser.id, role: "provider" };
    const reviewer: Actor = {
      kind: "REVIEWER",
      id: reviewerUser.id,
      role: "admin_reviewer",
    };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Review a data analysis",
        rawRequest: "Independently review this data analysis for correctness.",
        budget: money(25_000, "USD"),
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
      title: "Data analysis review",
      summary: "Check the analysis and its conclusions against the supplied data.",
      contractHash,
      budgetMinor: 25_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    await db.insert(contractRequirements).values({
      id: newId("req"),
      contractId,
      key: "analysis_correctness",
      statement: "Conclusions must be supported by correctly analyzed data.",
      acceptanceRelevant: true,
    });
    await db.insert(scopeItems).values([
      {
        id: newId("scope"),
        contractId,
        type: "INCLUDED",
        statement: "Check calculations and conclusions.",
        position: 0,
      },
      {
        id: newId("scope"),
        contractId,
        type: "EXCLUDED",
        statement: "Do not create a new analysis.",
        position: 1,
      },
    ]);
    await db.insert(acceptanceRules).values({
      id: newId("accrule"),
      contractId,
      requirementKey: "analysis_correctness",
      method: "HUMAN_REVIEW",
      instructions: "Verify calculations and explain any material error.",
      position: 0,
    });
    await db.insert(taskConversations).values({
      id: newId("conv"),
      taskId: task.id,
      buyerUserId: buyerUser.id,
      providerId: provider.id,
      providerUserId: providerUser.id,
      status: "OPEN",
      messageCounter: 0,
      contactApprovedAt: new Date(),
      contactApprovedContractVersion: 1,
      contactApprovedContractHash: contractHash,
      currentContractVersion: 1,
      currentContractHash: contractHash,
      currentContractSnapshot: {},
      contractSnapshot: {},
    });
    const [conversation] = await db
      .select()
      .from(taskConversations)
      .where(eq(taskConversations.taskId, task.id))
      .limit(1);
    if (!conversation) throw new Error("conversation fixture was not inserted");

    const [reviewerProfile] = await db
      .insert(reviewerProfiles)
      .values({
        id: newId("reviewer"),
        userId: reviewerUser.id,
        displayName: "Independent reviewer",
        isListed: true,
        available: true,
        summary: "Independent review of analytical work.",
        conflictDisclosureConfirmed: true,
      })
      .returning();
    if (!reviewerProfile) throw new Error("reviewer profile fixture was not inserted");

    await expect(
      withTransaction((tx) =>
        proposeIndependentReview(tx, {
          conversationId: conversation.id,
          actor: buyer,
          correlationId,
          proposal: {
            reviewerUserId: reviewerUser.id,
            expectedContractVersion: 1,
            expectedContractHash: "b".repeat(64),
            requirementKeys: ["analysis_correctness"],
            domains: ["data-analysis"],
            feeMinor: null,
            feeCurrency: "USD",
            feePayer: "DIRECT",
          },
        }),
      ),
    ).rejects.toThrow("not bound to the current contract version");

    const proposal = await withTransaction((tx) =>
      proposeIndependentReview(tx, {
        conversationId: conversation.id,
        actor: buyer,
        correlationId,
        proposal: {
          reviewerUserId: reviewerUser.id,
          expectedContractVersion: 1,
          expectedContractHash: contractHash,
          requirementKeys: ["analysis_correctness"],
          domains: ["data-analysis"],
          feeMinor: null,
          feeCurrency: "USD",
          feePayer: "DIRECT",
        },
      }),
    );

    await withTransaction((tx) =>
      decideIndependentReviewEngagement(tx, {
        engagementId: proposal.id,
        conversationId: conversation.id,
        actor: professional,
        decision: "accept",
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      decideIndependentReviewEngagement(tx, {
        engagementId: proposal.id,
        conversationId: conversation.id,
        actor: professional,
        decision: "accept",
        correlationId,
      }),
    );
    const [newConflict] = await db
      .insert(reviewerConflicts)
      .values({
        id: newId("rconf"),
        profileId: reviewerProfile.id,
        conflictedUserId: buyerUser.id,
      })
      .returning();
    if (!newConflict) throw new Error("reviewer conflict fixture was not inserted");
    await expect(
      withTransaction((tx) =>
        decideIndependentReviewEngagement(tx, {
          engagementId: proposal.id,
          conversationId: conversation.id,
          actor: reviewer,
          decision: "accept",
          confirmNoConflict: true,
          correlationId,
        }),
      ),
    ).rejects.toThrow("disclosed conflict now prevents accepting");
    await db.delete(reviewerConflicts).where(eq(reviewerConflicts.id, newConflict.id));

    const engaged = await withTransaction((tx) =>
      decideIndependentReviewEngagement(tx, {
        engagementId: proposal.id,
        conversationId: conversation.id,
        actor: reviewer,
        decision: "accept",
        confirmNoConflict: true,
        correlationId,
      }),
    );

    expect(engaged.status).toBe("ENGAGED");
    await expect(
      withTransaction((tx) =>
        submitIndependentReviewReport(tx, {
          engagementId: proposal.id,
          conversationId: conversation.id,
          actor: reviewer,
          correlationId,
          report: {
            submissionId: newId("sub"),
            contractVersion: 1,
            contractHash: "b".repeat(64),
            rationale: "The report is intentionally bound to a stale contract hash.",
            findings: [
              {
                requirementKey: "analysis_correctness",
                outcome: "PASS",
                rationale: "The requirement is met based on evidence.",
                evidence: [{ description: "A sample of the calculations was checked." }],
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow("exact contract version accepted for review");
    const inbox = await listReviewerEngagements(db, reviewerUser.id);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.contractContext).toMatchObject({
      title: "Data analysis review",
      summary: "Check the analysis and its conclusions against the supplied data.",
      requirements: [
        {
          key: "analysis_correctness",
          statement: "Conclusions must be supported by correctly analyzed data.",
          reviewInstructions: [
            {
              method: "HUMAN_REVIEW",
              instructions: "Verify calculations and explain any material error.",
            },
          ],
        },
      ],
      included: ["Check calculations and conclusions."],
      excluded: ["Do not create a new analysis."],
    });

    await expect(
      withTransaction((tx) =>
        decideIndependentReviewEngagement(tx, {
          engagementId: proposal.id,
          conversationId: conversation.id,
          actor: buyer,
          decision: "decline",
          correlationId,
        }),
      ),
    ).rejects.toThrow("An accepted review cannot be withdrawn");

    const reviewEvents = await db
      .select()
      .from(events)
      .where(eq(events.aggregateId, proposal.id));
    const acceptedEvents = reviewEvents.filter(
      (event) => event.type === "INDEPENDENT_REVIEW_PARTY_ACCEPTED",
    );
    expect(acceptedEvents).toHaveLength(1);
    const reviewEventIds = reviewEvents.map((event) => event.id);
    const matchingOutbox = reviewEventIds.length
      ? await db.select().from(outboxEvents)
      : [];
    expect(matchingOutbox.filter((event) => reviewEventIds.includes(event.eventId))).toHaveLength(
      reviewEventIds.length,
    );
  });
});
