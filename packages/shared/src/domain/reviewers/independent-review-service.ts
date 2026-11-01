import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import {
  independentReviewEngagements,
  independentReviewReports,
} from "../../db/schema/independent-reviews.js";
import { reviewerConflicts, reviewerProfiles } from "../../db/schema/reviewers.js";
import { taskConversations } from "../../db/schema/conversations.js";
import {
  acceptanceRules,
  contractRequirements,
  scopeItems,
  workContracts,
} from "../../db/schema/contracts.js";
import {
  submissionArtifacts,
  workExecutions,
  workSubmissions,
} from "../../db/schema/execution.js";
import { verificationResults, verificationRuns, acceptanceDecisions } from "../../db/schema/verification.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { conflict, notFound, validationError } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { markSubmissionAccepted, requestRevision } from "../execution/service.js";
import { transitionTask } from "../tasks/service.js";

const proposalSchema = z.object({
  reviewerUserId: z.string().min(1).max(64),
  expectedContractVersion: z.number().int().positive(),
  expectedContractHash: z.string().length(64),
  requirementKeys: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
  domains: z.array(z.string().trim().min(2).max(128)).min(1).max(20),
  feeMinor: z.number().int().safe().nonnegative().nullable(),
  feeCurrency: z.literal("USD").default("USD"),
  feePayer: z.enum(["BUYER", "PROVIDER", "SHARED", "DIRECT"]),
});

const reportSchema = z.object({
  submissionId: z.string().min(1).max(64),
  contractVersion: z.number().int().positive(),
  contractHash: z.string().length(64),
  rationale: z.string().trim().min(20).max(8_000),
  findings: z.array(
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
              .refine((value) => new URL(value).protocol === "https:", "Evidence links must use HTTPS")
              .optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
  ).min(1).max(100),
});

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
  const [execution] = await tx
    .select({ startedAt: workExecutions.startedAt })
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .limit(1);
  if (execution?.startedAt) {
    throw conflict("Independent review terms must be agreed before work starts.");
  }
  const proposalKeys = [...new Set(proposal.requirementKeys)];
  const requirements = await tx
    .select({ key: contractRequirements.key, acceptanceRelevant: contractRequirements.acceptanceRelevant })
    .from(contractRequirements)
    .where(eq(contractRequirements.contractId, contract.id));
  const validKeys = new Set(
    requirements.filter((requirement) => requirement.acceptanceRelevant).map((requirement) => requirement.key),
  );
  if (proposalKeys.some((key) => !validKeys.has(key))) {
    throw validationError("Review criteria must reference acceptance-relevant contract requirements.");
  }
  const requiredHumanKeys = await tx
    .select({ key: acceptanceRules.requirementKey })
    .from(acceptanceRules)
    .where(
      and(
        eq(acceptanceRules.contractId, contract.id),
        eq(acceptanceRules.method, "HUMAN_REVIEW"),
      ),
    );
  if (requiredHumanKeys.some(({ key }) => !proposalKeys.includes(key))) {
    throw validationError("The review must include every contract requirement marked for human review.");
  }

  const [profile] = await tx
    .select()
    .from(reviewerProfiles)
    .where(eq(reviewerProfiles.userId, proposal.reviewerUserId))
    .limit(1);
  if (
    !profile ||
    !profile.isListed ||
    !profile.available ||
    !profile.conflictDisclosureConfirmed ||
    proposal.reviewerUserId === conversation.buyerUserId ||
    proposal.reviewerUserId === conversation.providerUserId
  ) {
    throw validationError("Choose a listed, available reviewer who is not a task participant.");
  }
  const conflicts = await tx
    .select({ conflictedUserId: reviewerConflicts.conflictedUserId })
    .from(reviewerConflicts)
    .where(
      and(
        eq(reviewerConflicts.profileId, profile.id),
        inArray(reviewerConflicts.conflictedUserId, [
          conversation.buyerUserId,
          conversation.providerUserId,
        ]),
      ),
    );
  if (conflicts.length > 0) {
    throw validationError("The selected reviewer has disclosed a conflict with a task participant.");
  }
  const [unresolved] = await tx
    .select({ id: independentReviewEngagements.id })
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.taskId, task.id),
        inArray(independentReviewEngagements.status, ["PROPOSED", "AWAITING_REVIEWER", "ENGAGED"]),
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
      proposerUserId: input.actor.id,
      requirementKeys: proposalKeys,
      domains: [...new Set(proposal.domains.map((domain) => domain.toLowerCase()))],
      authority: "CONTRACTUAL_ACCEPTANCE",
      feeMinor: proposal.feeMinor,
      feeCurrency: proposal.feeCurrency,
      feePayer: proposal.feePayer,
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
      throw conflict(
        "An accepted review cannot be withdrawn through the proposal decline action.",
      );
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
  const [execution] = await tx
    .select({ startedAt: workExecutions.startedAt })
    .from(workExecutions)
    .where(eq(workExecutions.taskId, engagement.taskId))
    .limit(1);
  if (execution?.startedAt) {
    throw conflict("All review terms and reviewer acceptance must be complete before work starts.");
  }

  const now = new Date();
  if (input.actor.id === engagement.reviewerUserId) {
    if (
      !engagement.buyerAcceptedAt ||
      !engagement.providerAcceptedAt ||
      engagement.status !== "AWAITING_REVIEWER"
    ) {
      throw conflict("Both task participants must accept the review terms before reviewer acceptance.");
    }
    if (input.confirmNoConflict !== true) {
      throw validationError("The reviewer must confirm there is no undisclosed conflict.");
    }
    const [profile] = await tx
      .select()
      .from(reviewerProfiles)
      .where(eq(reviewerProfiles.userId, engagement.reviewerUserId))
      .limit(1);
    if (!profile || !profile.isListed || !profile.available || !profile.conflictDisclosureConfirmed) {
      throw conflict("The reviewer profile is no longer eligible for this engagement.");
    }
    const conflicts = await tx
      .select({ conflictedUserId: reviewerConflicts.conflictedUserId })
      .from(reviewerConflicts)
      .where(
        and(
          eq(reviewerConflicts.profileId, profile.id),
          inArray(reviewerConflicts.conflictedUserId, [
            engagement.buyerUserId,
            engagement.providerUserId,
          ]),
        ),
      );
    if (conflicts.length > 0) {
      throw conflict("A disclosed conflict now prevents accepting this review engagement.");
    }
    const [updated] = await tx
      .update(independentReviewEngagements)
      .set({
        status: "ENGAGED",
        reviewerAcceptedAt: now,
        reviewerConflictConfirmed: true,
        updatedAt: now,
      })
      .where(eq(independentReviewEngagements.id, engagement.id))
      .returning();
    if (!updated) throw conflict("The review engagement changed concurrently.");
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
    return updated;
  }

  if (![engagement.buyerUserId, engagement.providerUserId].includes(input.actor.id)) {
    throw notFound("Independent review engagement");
  }
  if (!["PROPOSED", "AWAITING_REVIEWER"].includes(engagement.status)) {
    throw conflict("The task participants can only accept a proposed review before work begins.");
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
        (isBuyer || engagement.buyerAcceptedAt) &&
        (!isBuyer || engagement.providerAcceptedAt)
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
    .where(and(eq(workSubmissions.id, report.submissionId), eq(workSubmissions.taskId, engagement.taskId)))
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

  if (outcome !== "UNCERTAIN") {
    await tx.insert(acceptanceDecisions).values({
      id: newId("adec"),
      taskId: engagement.taskId,
      submissionId: submission.id,
      verificationRunId: run.id,
      contractId: engagement.contractId,
      contractVersion: engagement.contractVersion,
      contractHash: engagement.contractHash,
      outcome,
      hasDeterministicFailure: Boolean(deterministicFailure),
      explanation: deterministicFailure
        ? "A deterministic contract check failed; the independent reviewer cannot override that objective failure."
        : `The contractually agreed independent reviewer reported ${outcome.toLowerCase()}.`,
      reviewedBy: engagement.reviewerUserId,
    });
  }

  const [task] = await tx.select().from(tasks).where(eq(tasks.id, engagement.taskId)).for("update").limit(1);
  if (!task) throw notFound("Task");
  if (outcome === "PASS") {
    const [execution] = await tx
      .select({ id: workExecutions.id })
      .from(workExecutions)
      .where(eq(workExecutions.taskId, task.id))
      .limit(1);
    if (!execution) throw conflict("No execution is associated with this review.");
    await markSubmissionAccepted(tx, { executionId: execution.id, submissionId: submission.id });
    await transitionTask(tx, {
      taskId: task.id,
      to: "PAYMENT_RELEASE",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (outcome === "FAIL") {
    const [execution] = await tx
      .select({ id: workExecutions.id })
      .from(workExecutions)
      .where(eq(workExecutions.taskId, task.id))
      .limit(1);
    if (!execution) throw conflict("No execution is associated with this review.");
    await requestRevision(tx, {
      executionId: execution.id,
      submissionId: submission.id,
      actor: input.actor,
      correlationId: input.correlationId,
      reason: deterministicFailure
        ? "A deterministic contract check failed; the reviewer cannot override it."
        : "The independent reviewer found that one or more agreed criteria were not met.",
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "REVISION_REQUIRED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }
  const newStatus = outcome === "PASS" ? "CLOSED" : outcome === "UNCERTAIN" ? "INCONCLUSIVE" : "ENGAGED";
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
      outcome,
    },
  });
  return { report: storedReport, outcome };
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
  const submissions = engagements.length
    ? await db
        .select({
          id: workSubmissions.id,
          taskId: workSubmissions.taskId,
          contractVersion: workSubmissions.contractVersion,
          contractHash: workSubmissions.contractHash,
          status: workSubmissions.status,
          submittedAt: workSubmissions.submittedAt,
          notes: workSubmissions.notes,
          submissionHash: workSubmissions.submissionHash,
        })
        .from(workSubmissions)
        .where(
          and(
            inArray(
              workSubmissions.taskId,
              engagements.map((engagement) => engagement.taskId),
            ),
            inArray(workSubmissions.status, ["SUBMITTED", "UNDER_REVIEW"]),
          ),
        )
        .orderBy(desc(workSubmissions.submittedAt))
    : [];
  const matchingSubmissions = engagements.flatMap((engagement) => {
    const submission = submissions.find(
      (candidate) =>
        candidate.taskId === engagement.taskId &&
        candidate.contractVersion === engagement.contractVersion &&
        candidate.contractHash === engagement.contractHash,
    );
    return submission ? [submission] : [];
  });
  const artifacts = matchingSubmissions.length
    ? await db
        .select({
          id: submissionArtifacts.id,
          submissionId: submissionArtifacts.submissionId,
          type: submissionArtifacts.type,
          filename: submissionArtifacts.filename,
          contentType: submissionArtifacts.contentType,
          sizeBytes: submissionArtifacts.sizeBytes,
        })
        .from(submissionArtifacts)
        .where(
          inArray(
            submissionArtifacts.submissionId,
            matchingSubmissions.map((submission) => submission.id),
          ),
        )
    : [];
  return engagements.map((engagement) => ({
    ...engagement,
    reports: reports.filter((report) => report.engagementId === engagement.id),
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
          .filter(
            (item) => item.contractId === engagement.contractId && item.type === "INCLUDED",
          )
          .map((item) => item.statement),
        excluded: scope
          .filter(
            (item) => item.contractId === engagement.contractId && item.type === "EXCLUDED",
          )
          .map((item) => item.statement),
      };
    })(),
    latestSubmission: (() => {
      const submission = submissions.find(
        (candidate) =>
          candidate.taskId === engagement.taskId &&
          candidate.contractVersion === engagement.contractVersion &&
          candidate.contractHash === engagement.contractHash,
      );
      if (!submission) return null;
      return {
        ...submission,
        artifacts: artifacts.filter((artifact) => artifact.submissionId === submission.id),
      };
    })(),
  }));
}
