import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import {
  independentReviewEngagements,
  independentReviewReports,
} from "../../db/schema/independent-reviews.js";
import { taskConversations } from "../../db/schema/conversations.js";
import { users } from "../../db/schema/identity.js";
import {
  acceptanceRules,
  contractRequirements,
  scopeItems,
  workContracts,
} from "../../db/schema/contracts.js";
import { submissionArtifacts, workExecutions, workSubmissions } from "../../db/schema/execution.js";
import { providers } from "../../db/schema/providers.js";
import { paypalIdentityLinks, providerPaypalAccounts } from "../../db/schema/paypal.js";
import { reviewFeePayments } from "../../db/schema/review-fees.js";
import { verificationResults, verificationRuns } from "../../db/schema/verification.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { conflict, notFound, validationError } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { transitionTask } from "../tasks/service.js";
import { readStoredReviewService } from "./work-profile.js";
import { normalizeReviewerDomain } from "./recommendation.js";
import {
  getConfiguredNewPaymentMode,
  paymentModeEnvironment,
  type PaymentMode,
} from "../../integrations/payments/config.js";

const proposalSchema = z
  .object({
    reviewerUserId: z.string().min(1).max(64),
    expectedContractVersion: z.number().int().positive(),
    expectedContractHash: z.string().length(64),
    requirementKeys: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
    domains: z.array(z.string().trim().min(2).max(128)).min(1).max(20),
    brief: z.string().trim().min(20).max(4_000),
    feeMinor: z.number().int().safe().nonnegative().nullable(),
    feeCurrency: z.literal("USD").default("USD"),
    feePayer: z.enum(["BUYER", "PROVIDER", "SHARED", "DIRECT"]),
    feeMode: z.enum(["PAYPAL", "DIRECT"]),
  })
  .superRefine((value, context) => {
    if (value.feeMode === "DIRECT" && value.feePayer !== "DIRECT") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feePayer"],
        message: "Direct review fees must be arranged directly.",
      });
    }
    if (
      value.feeMode === "PAYPAL" &&
      (!value.feeMinor || value.feeMinor <= 0 || value.feePayer === "DIRECT")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feeMinor"],
        message: "PayPal review fees need a positive amount and an in-platform payer.",
      });
    }
  });

const reportSchema = z.object({
  submissionId: z.string().min(1).max(64),
  contractVersion: z.number().int().positive(),
  contractHash: z.string().length(64),
  rationale: z.string().trim().min(20).max(8_000),
  findings: z
    .array(
      z.object({
        requirementKey: z.string().trim().min(1).max(128),
        outcome: z.enum(["PASS", "FAIL", "UNCERTAIN"]),
        rationale: z.string().trim().min(5).max(2_000),
        evidence: z
          .array(
            z.object({
              description: z.string().trim().min(5).max(1_000),
              url: z
                .string()
                .url()
                .refine(
                  (value) => new URL(value).protocol === "https:",
                  "Evidence links must use HTTPS",
                )
                .optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(100),
});

async function prepareReviewFeePayments(
  tx: Database,
  engagement: typeof independentReviewEngagements.$inferSelect,
) {
  if (
    engagement.feeMode === "DIRECT" ||
    engagement.feePayer === "DIRECT" ||
    !engagement.feeMinor ||
    engagement.feeMinor <= 0
  ) {
    const [updated] = await tx
      .update(independentReviewEngagements)
      .set({ status: "ENGAGED", feeStatus: "NOT_REQUIRED", updatedAt: new Date() })
      .where(eq(independentReviewEngagements.id, engagement.id))
      .returning();
    if (!updated) throw conflict("The review engagement changed during acceptance.");
    return {
      engagement: updated,
      payerShares: [] as Array<{ userId: string; amountMinor: number }>,
    };
  }
  if (!engagement.reviewerProviderId) {
    throw conflict("The reviewer Work Profile is missing its payment identity.");
  }
  const payerShares =
    engagement.feePayer === "BUYER"
      ? [{ userId: engagement.buyerUserId, amountMinor: engagement.feeMinor }]
      : engagement.feePayer === "PROVIDER"
        ? [{ userId: engagement.providerUserId, amountMinor: engagement.feeMinor }]
        : [
            { userId: engagement.buyerUserId, amountMinor: Math.ceil(engagement.feeMinor / 2) },
            { userId: engagement.providerUserId, amountMinor: Math.floor(engagement.feeMinor / 2) },
          ].filter((share) => share.amountMinor > 0);
  const accountRows = await tx
    .select({ id: users.id, accountClass: users.accountClass })
    .from(users)
    .where(
      inArray(users.id, [...payerShares.map((share) => share.userId), engagement.reviewerUserId]),
    );
  const accountClassById = new Map(accountRows.map((row) => [row.id, row.accountClass]));
  const classes = new Set(accountRows.map((row) => row.accountClass));
  if (
    accountRows.length !==
      new Set([...payerShares.map((share) => share.userId), engagement.reviewerUserId]).size ||
    classes.size !== 1 ||
    classes.has("UNCLASSIFIED")
  ) {
    throw conflict("Review fee participants must use compatible account environments.");
  }
  const accountClass = accountClassById.get(engagement.reviewerUserId);
  const mode: PaymentMode =
    accountClass === "DEMO_FIXTURE" ? "FAKE" : getConfiguredNewPaymentMode();
  let sellerMerchantId: string | null = null;
  const payerIds = new Map<string, string>();
  if (mode !== "FAKE") {
    const environment = paymentModeEnvironment(mode);
    const [seller] = await tx
      .select()
      .from(providerPaypalAccounts)
      .where(
        and(
          eq(providerPaypalAccounts.providerId, engagement.reviewerProviderId),
          eq(providerPaypalAccounts.environment, environment),
          eq(providerPaypalAccounts.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (
      !seller?.merchantId ||
      !seller.paymentsReceivable ||
      !seller.primaryEmailConfirmed ||
      !seller.consentStatus
    ) {
      throw conflict("The reviewer must complete PayPal seller onboarding before accepting.");
    }
    sellerMerchantId = seller.merchantId;
    for (const share of payerShares) {
      const [payer] = await tx
        .select()
        .from(paypalIdentityLinks)
        .where(
          and(
            eq(paypalIdentityLinks.userId, share.userId),
            eq(paypalIdentityLinks.environment, environment),
            eq(paypalIdentityLinks.status, "LINKED"),
          ),
        )
        .limit(1);
      if (!payer?.accountVerified || !payer.emailVerified) {
        throw conflict("Each review-fee payer must link a verified PayPal account.");
      }
      if (payer.payerId === sellerMerchantId) {
        throw conflict("A reviewer cannot fund their own review fee.");
      }
      payerIds.set(share.userId, payer.payerId);
    }
  }
  await tx.insert(reviewFeePayments).values(
    payerShares.map((share) => ({
      id: newId("rfee"),
      engagementId: engagement.id,
      payerUserId: share.userId,
      reviewerProviderId: engagement.reviewerProviderId!,
      mode,
      amountMinor: share.amountMinor,
      currency: engagement.feeCurrency,
      status: "PENDING",
      payerIdSnapshot: payerIds.get(share.userId) ?? null,
      sellerMerchantIdSnapshot: sellerMerchantId,
    })),
  );
  const [updated] = await tx
    .update(independentReviewEngagements)
    .set({
      status: "AWAITING_FEE_AUTHORIZATION",
      feeStatus: "PENDING",
      updatedAt: new Date(),
    })
    .where(eq(independentReviewEngagements.id, engagement.id))
    .returning();
  if (!updated) throw conflict("The review engagement changed during fee setup.");
  return { engagement: updated, payerShares };
}

export async function proposeIndependentReview(
  tx: Database,
  input: {
    conversationId: string;
    actor: Actor;
    proposal: unknown;
    correlationId: string;
  },
) {
  const parsed = proposalSchema.safeParse(input.proposal);
  if (!parsed.success) {
    throw validationError("The independent review proposal is invalid.", parsed.error.flatten());
  }
  const proposal = parsed.data;
  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .for("update")
    .limit(1);
  if (
    !conversation ||
    conversation.status !== "OPEN" ||
    !input.actor.id ||
    ![conversation.buyerUserId, conversation.providerUserId].includes(input.actor.id)
  ) {
    throw notFound("Conversation");
  }
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(
      and(
        eq(workContracts.taskId, conversation.taskId),
        eq(workContracts.status, "ACTIVE"),
        eq(workContracts.version, conversation.currentContractVersion),
        eq(workContracts.contractHash, conversation.currentContractHash),
      ),
    )
    .limit(1);
  if (!contract) throw conflict("The agreed contract changed. Refresh before proposing review.");
  if (
    contract.version !== proposal.expectedContractVersion ||
    contract.contractHash !== proposal.expectedContractHash
  ) {
    throw conflict("The review proposal is not bound to the current contract version.");
  }

  const [task] = await tx.select().from(tasks).where(eq(tasks.id, contract.taskId)).limit(1);
  if (!task || ["COMPLETED", "CANCELLED", "EXPIRED"].includes(task.status)) {
    throw conflict("A review cannot be proposed for a closed task.");
  }
  const proposalKeys = [...new Set(proposal.requirementKeys)];
  const requirements = await tx
    .select({
      key: contractRequirements.key,
      acceptanceRelevant: contractRequirements.acceptanceRelevant,
    })
    .from(contractRequirements)
    .where(eq(contractRequirements.contractId, contract.id));
  const validKeys = new Set(
    requirements
      .filter((requirement) => requirement.acceptanceRelevant)
      .map((requirement) => requirement.key),
  );
  if (proposalKeys.some((key) => !validKeys.has(key))) {
    throw validationError(
      "Review criteria must reference acceptance-relevant contract requirements.",
    );
  }
  const requiredHumanKeys = await tx
    .select({ key: acceptanceRules.requirementKey })
    .from(acceptanceRules)
    .where(
      and(eq(acceptanceRules.contractId, contract.id), eq(acceptanceRules.method, "HUMAN_REVIEW")),
    );
  if (requiredHumanKeys.some(({ key }) => !proposalKeys.includes(key))) {
    throw validationError(
      "The review must include every contract requirement marked for human review.",
    );
  }

  const [reviewerProvider] = await tx
    .select()
    .from(providers)
    .where(eq(providers.userId, proposal.reviewerUserId))
    .limit(1);
  const reviewService = readStoredReviewService(reviewerProvider?.workPreferences);
  const accountRows = await tx
    .select({ id: users.id, accountClass: users.accountClass })
    .from(users)
    .where(
      inArray(users.id, [
        conversation.buyerUserId,
        conversation.providerUserId,
        proposal.reviewerUserId,
      ]),
    );
  const accountClasses = new Set(accountRows.map((row) => row.accountClass));
  if (
    !reviewerProvider ||
    reviewerProvider.status !== "ACTIVE" ||
    !reviewService?.enabled ||
    !reviewService.listed ||
    reviewService.availability !== "AVAILABLE" ||
    !reviewService.conflictDisclosureConfirmed ||
    proposal.feeMode !== reviewService.feeMode ||
    !proposal.domains.every((domain) =>
      reviewService.domains.some(
        (reviewDomain) => reviewDomain.domainTag === normalizeReviewerDomain(domain),
      ),
    ) ||
    accountRows.length !== 3 ||
    accountClasses.size !== 1 ||
    accountClasses.has("UNCLASSIFIED") ||
    proposal.reviewerUserId === conversation.buyerUserId ||
    proposal.reviewerUserId === conversation.providerUserId
  ) {
    throw validationError("Choose a listed, available reviewer who is not a task participant.");
  }
  if (proposal.feeMode === "PAYPAL" && accountRows[0]?.accountClass === "MEMBER") {
    const environment = paymentModeEnvironment(getConfiguredNewPaymentMode());
    const [seller] = await tx
      .select()
      .from(providerPaypalAccounts)
      .where(
        and(
          eq(providerPaypalAccounts.providerId, reviewerProvider.id),
          eq(providerPaypalAccounts.environment, environment),
          eq(providerPaypalAccounts.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (
      !seller?.merchantId ||
      !seller.paymentsReceivable ||
      !seller.primaryEmailConfirmed ||
      !seller.consentStatus
    ) {
      throw validationError("Choose a reviewer whose PayPal review payments are ready.");
    }
    const payerUserIds =
      proposal.feePayer === "BUYER"
        ? [conversation.buyerUserId]
        : proposal.feePayer === "PROVIDER"
          ? [conversation.providerUserId]
          : [conversation.buyerUserId, conversation.providerUserId];
    const payerLinks = await tx
      .select()
      .from(paypalIdentityLinks)
      .where(
        and(
          inArray(paypalIdentityLinks.userId, payerUserIds),
          eq(paypalIdentityLinks.environment, environment),
          eq(paypalIdentityLinks.status, "LINKED"),
        ),
      );
    if (
      payerLinks.length !== new Set(payerUserIds).size ||
      payerLinks.some((link) => !link.accountVerified || !link.emailVerified)
    ) {
      throw validationError("Every review-fee payer must link a verified PayPal account first.");
    }
  }
  if (
    reviewService.conflictUserIds.some((userId) =>
      [conversation.buyerUserId, conversation.providerUserId].includes(userId),
    )
  ) {
    throw validationError(
      "The selected reviewer has disclosed a conflict with a task participant.",
    );
  }
  const [unresolved] = await tx
    .select({ id: independentReviewEngagements.id })
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.taskId, task.id),
        inArray(independentReviewEngagements.status, [
          "PROPOSED",
          "AWAITING_REVIEWER",
          "AWAITING_FEE_AUTHORIZATION",
          "ENGAGED",
        ]),
      ),
    )
    .limit(1);
  if (unresolved) throw conflict("Resolve the current independent review engagement first.");

  const proposerIsBuyer = input.actor.id === conversation.buyerUserId;
  const [engagement] = await tx
    .insert(independentReviewEngagements)
    .values({
      id: newId("irev"),
      taskId: task.id,
      conversationId: conversation.id,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      buyerUserId: conversation.buyerUserId,
      providerUserId: conversation.providerUserId,
      reviewerUserId: proposal.reviewerUserId,
      reviewerProviderId: reviewerProvider.id,
      proposerUserId: input.actor.id,
      requirementKeys: proposalKeys,
      domains: [...new Set(proposal.domains.map((domain) => domain.toLowerCase()))],
      brief: proposal.brief,
      authority: "ADVISORY",
      feeMinor: proposal.feeMinor,
      feeCurrency: proposal.feeCurrency,
      feePayer: proposal.feePayer,
      feeMode: proposal.feeMode,
      feeStatus: proposal.feeMode === "DIRECT" || !proposal.feeMinor ? "NOT_REQUIRED" : "PENDING",
      status: "PROPOSED",
      buyerAcceptedAt: proposerIsBuyer ? new Date() : null,
      providerAcceptedAt: proposerIsBuyer ? null : new Date(),
    })
    .returning();
  if (!engagement) throw new Error("Independent review proposal insert returned no row.");
  await appendEvent(tx, {
    type: "INDEPENDENT_REVIEW_PROPOSED",
    aggregateId: engagement.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      engagementId: engagement.id,
      contractVersion: contract.version,
      reviewerUserId: engagement.reviewerUserId,
      requirementKeys: proposalKeys,
    },
  });
  return engagement;
}

export async function decideIndependentReviewEngagement(
  tx: Database,
  input: {
    engagementId: string;
    conversationId: string;
    actor: Actor;
    decision: "accept" | "decline";
    confirmNoConflict?: boolean;
    correlationId: string;
  },
) {
  const [engagement] = await tx
    .select()
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.id, input.engagementId),
        eq(independentReviewEngagements.conversationId, input.conversationId),
      ),
    )
    .for("update")
    .limit(1);
  if (!engagement || !input.actor.id) throw notFound("Independent review engagement");
  if (engagement.status === "DECLINED" || engagement.status === "CANCELLED") {
    throw conflict("This independent review proposal is no longer active.");
  }
  if (input.decision === "decline") {
    if (
      ![engagement.buyerUserId, engagement.providerUserId, engagement.reviewerUserId].includes(
        input.actor.id,
      )
    ) {
      throw notFound("Independent review engagement");
    }
    if (!["PROPOSED", "AWAITING_REVIEWER"].includes(engagement.status)) {
      throw conflict("An accepted review cannot be withdrawn through the proposal decline action.");
    }
    const [updated] = await tx
      .update(independentReviewEngagements)
      .set({ status: "DECLINED", updatedAt: new Date() })
      .where(eq(independentReviewEngagements.id, engagement.id))
      .returning();
    if (!updated) throw conflict("The review engagement changed concurrently.");
    const role =
      input.actor.id === engagement.reviewerUserId
        ? "REVIEWER"
        : input.actor.id === engagement.buyerUserId
          ? "BUYER"
          : "PROVIDER";
    await appendEvent(tx, {
      type: "INDEPENDENT_REVIEW_DECLINED",
      aggregateId: engagement.id,
      taskId: engagement.taskId,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: engagement.taskId,
        engagementId: engagement.id,
        contractVersion: engagement.contractVersion,
        declinedByUserId: input.actor.id,
        role,
      },
    });
    return updated;
  }

  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, engagement.conversationId))
    .for("update")
    .limit(1);
  if (
    !conversation ||
    conversation.status !== "OPEN" ||
    conversation.currentContractVersion !== engagement.contractVersion ||
    conversation.currentContractHash !== engagement.contractHash
  ) {
    throw conflict("The conversation or contract changed after this review was proposed.");
  }
  const [contract] = await tx
    .select({ id: workContracts.id })
    .from(workContracts)
    .where(
      and(
        eq(workContracts.id, engagement.contractId),
        eq(workContracts.status, "ACTIVE"),
        eq(workContracts.version, engagement.contractVersion),
        eq(workContracts.contractHash, engagement.contractHash),
      ),
    )
    .limit(1);
  if (!contract) throw conflict("The contract bound to this review is no longer active.");
  const now = new Date();
  if (input.actor.id === engagement.reviewerUserId) {
    if (
      !engagement.buyerAcceptedAt ||
      !engagement.providerAcceptedAt ||
      engagement.status !== "AWAITING_REVIEWER"
    ) {
      throw conflict(
        "Both task participants must accept the review terms before reviewer acceptance.",
      );
    }
    if (input.confirmNoConflict !== true) {
      throw validationError("The reviewer must confirm there is no undisclosed conflict.");
    }
    const [reviewerProvider] = await tx
      .select()
      .from(providers)
      .where(eq(providers.userId, engagement.reviewerUserId))
      .limit(1);
    const reviewService = readStoredReviewService(reviewerProvider?.workPreferences);
    if (
      !reviewerProvider ||
      reviewerProvider.status !== "ACTIVE" ||
      !reviewService?.enabled ||
      !reviewService.listed ||
      reviewService.availability !== "AVAILABLE" ||
      !reviewService.conflictDisclosureConfirmed
    ) {
      throw conflict("The reviewer profile is no longer eligible for this engagement.");
    }
    if (
      reviewService.conflictUserIds.some((userId) =>
        [engagement.buyerUserId, engagement.providerUserId].includes(userId),
      )
    ) {
      throw conflict("A disclosed conflict now prevents accepting this review engagement.");
    }
    const [updated] = await tx
      .update(independentReviewEngagements)
      .set({
        reviewerAcceptedAt: now,
        reviewerConflictConfirmed: true,
        updatedAt: now,
      })
      .where(eq(independentReviewEngagements.id, engagement.id))
      .returning();
    if (!updated) throw conflict("The review engagement changed concurrently.");
    const feePreparation = await prepareReviewFeePayments(tx, updated);
    if (feePreparation.engagement.status === "ENGAGED") {
      await appendEvent(tx, {
        type: "INDEPENDENT_REVIEW_ENGAGED",
        aggregateId: updated.id,
        taskId: updated.taskId,
        actor: toEventActor(input.actor),
        correlationId: input.correlationId,
        payload: {
          taskId: updated.taskId,
          engagementId: updated.id,
          contractVersion: updated.contractVersion,
          reviewerUserId: updated.reviewerUserId,
        },
      });
    } else {
      for (const share of feePreparation.payerShares) {
        await appendEvent(tx, {
          type: "REVIEW_FEE_AUTHORIZATION_REQUESTED",
          aggregateId: updated.id,
          taskId: updated.taskId,
          actor: toEventActor(input.actor),
          correlationId: input.correlationId,
          payload: {
            taskId: updated.taskId,
            engagementId: updated.id,
            reviewerUserId: updated.reviewerUserId,
            payerUserId: share.userId,
            amount: { amountMinor: share.amountMinor, currency: updated.feeCurrency },
          },
        });
      }
    }
    return feePreparation.engagement;
  }

  if (![engagement.buyerUserId, engagement.providerUserId].includes(input.actor.id)) {
    throw notFound("Independent review engagement");
  }
  if (!["PROPOSED", "AWAITING_REVIEWER"].includes(engagement.status)) {
    throw conflict("The review proposal is no longer awaiting participant acceptance.");
  }
  const isBuyer = input.actor.id === engagement.buyerUserId;
  const alreadyAccepted = isBuyer
    ? engagement.buyerAcceptedAt !== null
    : engagement.providerAcceptedAt !== null;
  if (alreadyAccepted) return engagement;
  const [updated] = await tx
    .update(independentReviewEngagements)
    .set({
      ...(isBuyer ? { buyerAcceptedAt: engagement.buyerAcceptedAt ?? now } : {}),
      ...(!isBuyer ? { providerAcceptedAt: engagement.providerAcceptedAt ?? now } : {}),
      status:
        (isBuyer || engagement.buyerAcceptedAt) && (!isBuyer || engagement.providerAcceptedAt)
          ? "AWAITING_REVIEWER"
          : "PROPOSED",
      updatedAt: now,
    })
    .where(eq(independentReviewEngagements.id, engagement.id))
    .returning();
  if (!updated) throw conflict("The review engagement changed concurrently.");
  await appendEvent(tx, {
    type: "INDEPENDENT_REVIEW_PARTY_ACCEPTED",
    aggregateId: engagement.id,
    taskId: engagement.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: engagement.taskId,
      engagementId: engagement.id,
      contractVersion: engagement.contractVersion,
      participantUserId: input.actor.id,
      participant: isBuyer ? "BUYER" : "PROVIDER",
    },
  });
  return updated;
}

export async function submitIndependentReviewReport(
  tx: Database,
  input: {
    engagementId: string;
    conversationId: string;
    actor: Actor;
    report: unknown;
    correlationId: string;
  },
) {
  const parsed = reportSchema.safeParse(input.report);
  if (!parsed.success) {
    throw validationError("The independent review report is invalid.", parsed.error.flatten());
  }
  if (!input.actor.id) throw notFound("Independent review engagement");
  const [engagement] = await tx
    .select()
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.id, input.engagementId),
        eq(independentReviewEngagements.conversationId, input.conversationId),
      ),
    )
    .for("update")
    .limit(1);
  if (
    !engagement ||
    engagement.reviewerUserId !== input.actor.id ||
    engagement.status !== "ENGAGED" ||
    !engagement.reviewerAcceptedAt ||
    !engagement.reviewerConflictConfirmed
  ) {
    throw notFound("Independent review engagement");
  }
  const report = parsed.data;
  if (
    report.contractVersion !== engagement.contractVersion ||
    report.contractHash !== engagement.contractHash
  ) {
    throw conflict("The report must reference the exact contract version accepted for review.");
  }
  const [submission] = await tx
    .select()
    .from(workSubmissions)
    .where(
      and(
        eq(workSubmissions.id, report.submissionId),
        eq(workSubmissions.taskId, engagement.taskId),
      ),
    )
    .for("update")
    .limit(1);
  if (
    !submission ||
    submission.contractVersion !== engagement.contractVersion ||
    submission.contractHash !== engagement.contractHash ||
    !["SUBMITTED", "UNDER_REVIEW"].includes(submission.status)
  ) {
    throw conflict("The submitted work is not current or is no longer awaiting review.");
  }
  const findingKeys = report.findings.map((finding) => finding.requirementKey);
  if (
    findingKeys.length !== engagement.requirementKeys.length ||
    new Set(findingKeys).size !== findingKeys.length ||
    engagement.requirementKeys.some((key) => !findingKeys.includes(key))
  ) {
    throw validationError("Submit exactly one finding for every agreed review criterion.");
  }
  const [run] = await tx
    .select()
    .from(verificationRuns)
    .where(
      and(
        eq(verificationRuns.submissionId, submission.id),
        eq(verificationRuns.contractVersion, engagement.contractVersion),
        eq(verificationRuns.contractHash, engagement.contractHash),
        eq(verificationRuns.status, "COMPLETED"),
      ),
    )
    .orderBy(desc(verificationRuns.completedAt))
    .limit(1);
  if (!run) throw conflict("The corresponding machine-evidence run is not complete yet.");

  const [existingReport] = await tx
    .select({ id: independentReviewReports.id })
    .from(independentReviewReports)
    .where(
      and(
        eq(independentReviewReports.engagementId, engagement.id),
        eq(independentReviewReports.submissionId, submission.id),
      ),
    )
    .limit(1);
  if (existingReport) throw conflict("This reviewer has already reported on this submission.");

  const [deterministicFailure] = await tx
    .select({ id: verificationResults.id })
    .from(verificationResults)
    .where(
      and(
        eq(verificationResults.verificationRunId, run.id),
        eq(verificationResults.method, "DETERMINISTIC"),
        eq(verificationResults.outcome, "FAIL"),
      ),
    )
    .limit(1);
  const reportOutcome = report.findings.some((finding) => finding.outcome === "FAIL")
    ? "FAIL"
    : report.findings.some((finding) => finding.outcome === "UNCERTAIN")
      ? "UNCERTAIN"
      : "PASS";
  const outcome = deterministicFailure ? "FAIL" : reportOutcome;
  const [storedReport] = await tx
    .insert(independentReviewReports)
    .values({
      id: newId("irpt"),
      engagementId: engagement.id,
      taskId: engagement.taskId,
      submissionId: submission.id,
      contractVersion: engagement.contractVersion,
      contractHash: engagement.contractHash,
      reviewerUserId: engagement.reviewerUserId,
      outcome: reportOutcome,
      rationale: report.rationale,
      findings: report.findings,
    })
    .returning();
  if (!storedReport) throw new Error("Independent review report insert returned no row.");

  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, engagement.taskId))
    .for("update")
    .limit(1);
  if (!task) throw notFound("Task");
  if (task.status === "AWAITING_EXTERNAL_REVIEW" || task.status === "HUMAN_REVIEW") {
    await transitionTask(tx, {
      taskId: task.id,
      to: "AWAITING_CLIENT_REVIEW",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (task.status !== "AWAITING_CLIENT_REVIEW") {
    throw conflict("The task is not awaiting an independent or buyer review.", {
      taskStatus: task.status,
    });
  }
  const newStatus = outcome === "UNCERTAIN" ? "INCONCLUSIVE" : "CLOSED";
  await tx
    .update(independentReviewEngagements)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(independentReviewEngagements.id, engagement.id));

  await appendEvent(tx, {
    type: "INDEPENDENT_REVIEW_REPORTED",
    aggregateId: storedReport.id,
    taskId: engagement.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: engagement.taskId,
      engagementId: engagement.id,
      reportId: storedReport.id,
      submissionId: submission.id,
      contractVersion: engagement.contractVersion,
      contractHash: engagement.contractHash,
      reviewerUserId: engagement.reviewerUserId,
      outcome,
      advisory: true,
    },
  });
  return { report: storedReport, outcome, advisory: true as const };
}

export async function listIndependentReviewEngagements(
  db: Database,
  input: { conversationId: string; userId: string },
) {
  const [conversation] = await db
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (
    !conversation ||
    ![conversation.buyerUserId, conversation.providerUserId].includes(input.userId)
  ) {
    const [reviewer] = await db
      .select({ id: independentReviewEngagements.id })
      .from(independentReviewEngagements)
      .where(
        and(
          eq(independentReviewEngagements.conversationId, input.conversationId),
          eq(independentReviewEngagements.reviewerUserId, input.userId),
        ),
      )
      .limit(1);
    if (!reviewer) throw notFound("Conversation");
  }
  const engagements = await db
    .select()
    .from(independentReviewEngagements)
    .where(eq(independentReviewEngagements.conversationId, input.conversationId))
    .orderBy(desc(independentReviewEngagements.createdAt));
  const reports = engagements.length
    ? await db
        .select()
        .from(independentReviewReports)
        .where(
          inArray(
            independentReviewReports.engagementId,
            engagements.map((engagement) => engagement.id),
          ),
        )
    : [];
  return engagements.map((engagement) => ({
    ...engagement,
    reports: reports.filter((report) => report.engagementId === engagement.id),
  }));
}

export async function listReviewerEngagements(db: Database, userId: string) {
  const engagements = await db
    .select()
    .from(independentReviewEngagements)
    .where(eq(independentReviewEngagements.reviewerUserId, userId))
    .orderBy(desc(independentReviewEngagements.createdAt));
  const contracts = engagements.length
    ? await db
        .select({
          id: workContracts.id,
          title: workContracts.title,
          summary: workContracts.summary,
        })
        .from(workContracts)
        .where(
          inArray(
            workContracts.id,
            engagements.map((engagement) => engagement.contractId),
          ),
        )
    : [];
  const requirements = engagements.length
    ? await db
        .select({
          contractId: contractRequirements.contractId,
          key: contractRequirements.key,
          statement: contractRequirements.statement,
          acceptanceRelevant: contractRequirements.acceptanceRelevant,
        })
        .from(contractRequirements)
        .where(
          inArray(
            contractRequirements.contractId,
            engagements.map((engagement) => engagement.contractId),
          ),
        )
    : [];
  const scope = engagements.length
    ? await db
        .select({
          contractId: scopeItems.contractId,
          type: scopeItems.type,
          statement: scopeItems.statement,
          position: scopeItems.position,
        })
        .from(scopeItems)
        .where(
          inArray(
            scopeItems.contractId,
            engagements.map((engagement) => engagement.contractId),
          ),
        )
        .orderBy(scopeItems.position)
    : [];
  const rules = engagements.length
    ? await db
        .select({
          contractId: acceptanceRules.contractId,
          requirementKey: acceptanceRules.requirementKey,
          method: acceptanceRules.method,
          instructions: acceptanceRules.instructions,
        })
        .from(acceptanceRules)
        .where(
          inArray(
            acceptanceRules.contractId,
            engagements.map((engagement) => engagement.contractId),
          ),
        )
    : [];
  return engagements.map((engagement) => ({
    ...engagement,
    contractContext: (() => {
      const contract = contracts.find((row) => row.id === engagement.contractId);
      if (!contract) throw notFound("Review contract");
      const contractRequirementsForReview = requirements.filter(
        (requirement) =>
          requirement.contractId === engagement.contractId &&
          engagement.requirementKeys.includes(requirement.key),
      );
      return {
        title: contract.title,
        summary: contract.summary,
        requirements: contractRequirementsForReview.map((requirement) => ({
          key: requirement.key,
          statement: requirement.statement,
          acceptanceRelevant: requirement.acceptanceRelevant,
          reviewInstructions: rules
            .filter(
              (rule) =>
                rule.contractId === engagement.contractId &&
                rule.requirementKey === requirement.key,
            )
            .map((rule) => ({
              method: rule.method,
              instructions: rule.instructions,
            })),
        })),
        included: scope
          .filter((item) => item.contractId === engagement.contractId && item.type === "INCLUDED")
          .map((item) => item.statement),
        excluded: scope
          .filter((item) => item.contractId === engagement.contractId && item.type === "EXCLUDED")
          .map((item) => item.statement),
      };
    })(),
  }));
}
