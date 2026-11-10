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
import { providers } from "../../db/schema/providers.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { workExecutions } from "../../db/schema/execution.js";
import { tasks } from "../../db/schema/tasks.js";
import {
  hasTestDatabase,
  resetDatabase,
  closeTestDb,
  createProvider,
  createUser,
} from "../../testing/index.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money } from "../../platform/money.js";
import type { Actor } from "../identity/authorize.js";
import { createTask } from "../tasks/service.js";
import {
  decideIndependentReviewEngagement,
  listReviewerEngagements,
  proposeIndependentReview,
} from "./independent-review-service.js";
import {
  addWorkReviewItem,
  completePaidWorkReview,
  decideWorkReview,
  openWorkReview,
  recordWorkReviewAssessment,
  respondToWorkReviewRequest,
} from "../reviews/service.js";
import { getTaskReviewerRecommendations } from "./service.js";
import { createReviewFeeOrder } from "./fee-service.js";

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
    const reviewerProvider = await createProvider(db, { displayName: "Independent reviewer" });
    await db
      .update(providers)
      .set({ userId: providerUser.id })
      .where(eq(providers.id, provider.id));
    const reviewerWorkPreferences = {
      workAcceptanceStatus: "UNAVAILABLE",
      languages: ["English"],
      reviewService: {
        enabled: true,
        listed: true,
        availability: "AVAILABLE",
        notice: null,
        summary: "Independent review of analytical work and conclusions.",
        publicContactUrl: null,
        feeMinor: 12_000,
        typicalTurnaroundDays: 3,
        conflictDisclosureConfirmed: true,
        conflictUserIds: [] as string[],
        domains: [
          {
            domainTag: "data-analysis",
            scope: "Independent review of analysis methods, calculations, and conclusions.",
            selfAssessedLevel: 4,
            yearsExperience: 5,
            methods: ["reproducibility review"],
          },
        ],
        evidence: [],
        feeMode: "PAYPAL",
      },
    };
    await db
      .update(providers)
      .set({
        userId: reviewerUser.id,
        bio: "Independent review of analytical work.",
        workPreferences: reviewerWorkPreferences,
      })
      .where(eq(providers.id, reviewerProvider.id));

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
    const recommendations = await getTaskReviewerRecommendations(db, {
      taskId: task.id,
      userId: buyerUser.id,
      additionalDomains: ["data-analysis"],
    });
    expect(recommendations.recommendations[0]).toMatchObject({
      providerId: reviewerProvider.id,
      userId: reviewerUser.id,
      feeMode: "PAYPAL",
    });

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
            brief: "Review the calculations and conclusions against the supplied data.",
            feeMinor: 12_000,
            feeCurrency: "USD",
            feePayer: "BUYER",
            feeMode: "PAYPAL",
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
          brief: "Review the calculations and conclusions against the supplied data.",
          feeMinor: 12_000,
          feeCurrency: "USD",
          feePayer: "BUYER",
          feeMode: "PAYPAL",
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
    await db
      .update(providers)
      .set({
        workPreferences: {
          ...reviewerWorkPreferences,
          reviewService: {
            ...reviewerWorkPreferences.reviewService,
            conflictUserIds: [buyerUser.id],
          },
        },
      })
      .where(eq(providers.id, reviewerProvider.id));
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
    await db
      .update(providers)
      .set({ workPreferences: reviewerWorkPreferences })
      .where(eq(providers.id, reviewerProvider.id));

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

    expect(engaged.status).toBe("AWAITING_FEE_AUTHORIZATION");
    await expect(
      createReviewFeeOrder({
        engagementId: proposal.id,
        payerUserId: buyerUser.id,
        actor: buyer,
        correlationId,
        appUrl: "https://tenfo.test",
      }),
    ).resolves.toMatchObject({ paid: true, simulated: true });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      sourceConversationId: conversation.id,
      providerId: provider.id,
      contractVersion: 1,
      status: "ACTIVE",
      agreedPriceMinor: 20_000,
      currency: "USD",
      agreementHash: "d".repeat(64),
    });
    const executionId = newId("exec");
    await db.insert(workExecutions).values({
      id: executionId,
      taskId: task.id,
      contractId,
      agreementId,
      providerId: provider.id,
      status: "IN_PROGRESS",
      contractVersion: 1,
      contractHash,
      startedAt: new Date(),
    });
    await db.update(tasks).set({ status: "WORK_IN_PROGRESS" }).where(eq(tasks.id, task.id));
    const review = await withTransaction((tx) =>
      openWorkReview(tx, {
        taskId: task.id,
        buyerUserId: buyerUser.id,
        kind: "FINAL",
        title: "Final analysis review",
        openingNote: "Review the analysis and its conclusions against the agreed data constraints.",
        requirementKeys: [],
        responseWindowDays: 5,
        actor: buyer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      addWorkReviewItem(tx, {
        reviewId: review.id,
        actor: professional,
        type: "LINK",
        label: "Analysis workbook",
        url: "https://example.test/analysis",
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToWorkReviewRequest(tx, {
        reviewId: review.id,
        action: "SEND_PACKAGE",
        summary: "The analysis workbook and conclusions are ready for independent review.",
        actor: professional,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      decideWorkReview(tx, {
        reviewId: review.id,
        decision: "REFER_TO_REVIEWER",
        reason: "Use the agreed data-analysis reviewer for an independent assessment.",
        riskAcknowledged: false,
        actor: buyer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      recordWorkReviewAssessment(tx, {
        reviewId: review.id,
        requirementKey: "analysis_correctness",
        status: "MET",
        rationale: "The sampled calculations support the stated conclusions.",
        actor: reviewer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      completePaidWorkReview(tx, {
        reviewId: review.id,
        summary: "The sampled calculations and conclusions are consistent with the supplied data.",
        actor: reviewer,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      decideWorkReview(tx, {
        reviewId: review.id,
        decision: "ACCEPT_FINAL",
        reason: "The agreed reviewer findings support final acceptance of the analysis.",
        riskAcknowledged: false,
        actor: buyer,
        correlationId,
      }),
    );
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
    expect(inbox[0]?.workReviewId).toBe(review.id);

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

    const reviewEvents = await db.select().from(events).where(eq(events.aggregateId, proposal.id));
    const acceptedEvents = reviewEvents.filter(
      (event) => event.type === "INDEPENDENT_REVIEW_PARTY_ACCEPTED",
    );
    expect(acceptedEvents).toHaveLength(1);
    const reviewEventIds = reviewEvents.map((event) => event.id);
    const matchingOutbox = reviewEventIds.length ? await db.select().from(outboxEvents) : [];
    expect(matchingOutbox.filter((event) => reviewEventIds.includes(event.eventId))).toHaveLength(
      reviewEventIds.length,
    );
  });
});
