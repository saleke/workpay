import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { submissionArtifacts, workExecutions, workSubmissions } from "../../db/schema/execution.js";
import { independentReviewEngagements } from "../../db/schema/independent-reviews.js";
import { reviewPackages } from "../../db/schema/review-packages.js";
import { providers } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import {
  acceptanceDecisions,
  verificationResults,
  verificationRuns,
} from "../../db/schema/verification.js";
import { appendEvent } from "../../events/outbox.js";
import { authorizationError, conflict, notFound } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { markSubmissionAccepted, rejectSubmission, requestRevision } from "../execution/service.js";
import { transitionTask } from "../tasks/service.js";

export type ReviewPackageDecision =
  "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "EXTERNAL_REVIEW_REQUESTED";

export async function createReviewPackageForSubmission(
  tx: Database,
  input: {
    taskId: string;
    submissionId: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const [existing] = await tx
    .select()
    .from(reviewPackages)
    .where(eq(reviewPackages.submissionId, input.submissionId))
    .limit(1);
  if (existing) return existing;

  const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task) throw notFound("Task");
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .limit(1);
  if (!execution) throw notFound("Execution");
  const [submission] = await tx
    .select()
    .from(workSubmissions)
    .where(
      and(
        eq(workSubmissions.id, input.submissionId),
        eq(workSubmissions.executionId, execution.id),
      ),
    )
    .limit(1);
  if (!submission || !submission.submissionHash) {
    throw conflict("A finalized submission is required before buyer review.");
  }
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, execution.contractId))
    .limit(1);
  if (
    !contract ||
    contract.version !== submission.contractVersion ||
    contract.contractHash !== submission.contractHash
  ) {
    throw conflict("The submission is not bound to the current work agreement.");
  }
  const [verificationRun] = await tx
    .select()
    .from(verificationRuns)
    .where(
      and(
        eq(verificationRuns.submissionId, submission.id),
        eq(verificationRuns.status, "COMPLETED"),
        eq(verificationRuns.contractHash, contract.contractHash),
      ),
    )
    .orderBy(desc(verificationRuns.completedAt))
    .limit(1);
  if (!verificationRun) throw conflict("Verification evidence is not complete yet.");

  const [artifacts, results] = await Promise.all([
    tx
      .select({
        id: submissionArtifacts.id,
        name: submissionArtifacts.filename,
        kind: submissionArtifacts.type,
        contentType: submissionArtifacts.contentType,
        sizeBytes: submissionArtifacts.sizeBytes,
      })
      .from(submissionArtifacts)
      .where(eq(submissionArtifacts.submissionId, submission.id)),
    tx
      .select({ outcome: verificationResults.outcome, rationale: verificationResults.rationale })
      .from(verificationResults)
      .where(eq(verificationResults.verificationRunId, verificationRun.id)),
  ]);
  const summaryValue = submission.summary as Record<string, unknown> | null;
  const summary =
    (typeof summaryValue?.summary === "string" ? summaryValue.summary.trim() : "") ||
    submission.notes?.trim() ||
    `Submission version ${submission.version} is ready for buyer review.`;
  const [created] = await tx
    .insert(reviewPackages)
    .values({
      id: newId("rpk"),
      taskId: task.id,
      executionId: execution.id,
      submissionId: submission.id,
      submissionVersion: submission.version,
      submissionHash: submission.submissionHash,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      verificationRunId: verificationRun.id,
      buyerUserId: task.userId,
      providerId: execution.providerId,
      status: "READY_FOR_REVIEW",
      summary,
      notes: submission.notes,
      previewLinks: [],
      fileReferences: artifacts,
      knownIssues: results
        .filter((result) => result.outcome !== "PASS")
        .map((result) => result.rationale),
    })
    .returning();
  if (!created) throw new Error("Review package insert returned no row.");
  await tx
    .update(workSubmissions)
    .set({ status: "UNDER_REVIEW" })
    .where(eq(workSubmissions.id, submission.id));
  return created;
}

export async function getLatestReviewPackage(db: Database, taskId: string) {
  const [reviewPackage] = await db
    .select()
    .from(reviewPackages)
    .where(eq(reviewPackages.taskId, taskId))
    .orderBy(desc(reviewPackages.createdAt))
    .limit(1);
  return reviewPackage ?? null;
}

export async function recordReviewPackageDecision(
  tx: Database,
  input: {
    packageId: string;
    buyerUserId: string;
    decision: ReviewPackageDecision;
    reason: string;
    expectedContractVersion: number;
    expectedContractHash: string;
    expectedSubmissionVersion: number;
    expectedSubmissionHash: string;
    actor: Actor;
    correlationId: string;
  },
) {
  if (input.actor.kind !== "USER" || input.actor.id !== input.buyerUserId) {
    throw authorizationError("Only the task owner can record the buyer review decision.");
  }
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 4_000) {
    throw conflict("A review decision requires a reason between 8 and 4,000 characters.");
  }
  const [reviewPackage] = await tx
    .select()
    .from(reviewPackages)
    .where(eq(reviewPackages.id, input.packageId))
    .for("update")
    .limit(1);
  if (!reviewPackage) throw notFound("Review package");
  if (reviewPackage.buyerUserId !== input.buyerUserId) throw authorizationError();
  if (reviewPackage.reviewerDecision) {
    if (
      reviewPackage.reviewerDecision === input.decision &&
      reviewPackage.decisionReason === reason &&
      reviewPackage.reviewedBy === input.buyerUserId
    ) {
      return reviewPackage;
    }
    throw conflict("A final buyer decision is already recorded for this review package.");
  }
  if (!["READY_FOR_REVIEW", "EXTERNAL_REVIEW_REQUESTED"].includes(reviewPackage.status)) {
    throw conflict("This review package is not awaiting a buyer decision.");
  }
  if (
    reviewPackage.contractVersion !== input.expectedContractVersion ||
    reviewPackage.contractHash !== input.expectedContractHash ||
    reviewPackage.submissionVersion !== input.expectedSubmissionVersion ||
    reviewPackage.submissionHash !== input.expectedSubmissionHash
  ) {
    throw conflict(
      "The work or agreement changed since this review was opened. Refresh and review again.",
    );
  }

  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, reviewPackage.taskId))
    .for("update")
    .limit(1);
  if (!task || task.userId !== input.buyerUserId) throw authorizationError();
  if (task.status !== "AWAITING_CLIENT_REVIEW") {
    throw conflict("The task is not awaiting a buyer review.", { taskStatus: task.status });
  }
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(and(eq(workContracts.id, reviewPackage.contractId), eq(workContracts.status, "ACTIVE")))
    .limit(1);
  if (
    !contract ||
    contract.version !== reviewPackage.contractVersion ||
    contract.contractHash !== reviewPackage.contractHash
  ) {
    throw conflict("The review package refers to a stale agreement.");
  }
  const [submission] = await tx
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.id, reviewPackage.submissionId))
    .limit(1);
  if (
    !submission ||
    submission.version !== reviewPackage.submissionVersion ||
    submission.submissionHash !== reviewPackage.submissionHash ||
    !["SUBMITTED", "UNDER_REVIEW"].includes(submission.status)
  ) {
    throw conflict("The review package does not refer to the current submitted work.");
  }
  const [newerSubmission] = await tx
    .select({ id: workSubmissions.id })
    .from(workSubmissions)
    .where(
      and(
        eq(workSubmissions.executionId, reviewPackage.executionId),
        eq(workSubmissions.version, reviewPackage.submissionVersion + 1),
      ),
    )
    .limit(1);
  if (newerSubmission) throw conflict("A newer submission must be reviewed instead.");

  const [deterministicFailure] = await tx
    .select({ id: verificationResults.id })
    .from(verificationResults)
    .where(
      and(
        eq(verificationResults.verificationRunId, reviewPackage.verificationRunId),
        eq(verificationResults.method, "DETERMINISTIC"),
        eq(verificationResults.outcome, "FAIL"),
      ),
    )
    .limit(1);
  const nextStatus =
    input.decision === "APPROVED"
      ? "APPROVED"
      : input.decision === "CHANGES_REQUESTED"
        ? "CHANGES_REQUESTED"
        : input.decision === "REJECTED"
          ? "REJECTED"
          : "EXTERNAL_REVIEW_REQUESTED";

  if (input.decision === "APPROVED") {
    if (deterministicFailure) {
      throw conflict("A deterministic contract check failed and cannot be overridden by approval.");
    }
    await tx.insert(acceptanceDecisions).values({
      id: newId("adec"),
      taskId: task.id,
      submissionId: submission.id,
      submissionVersion: submission.version,
      submissionHash: submission.submissionHash,
      reviewPackageId: reviewPackage.id,
      verificationRunId: reviewPackage.verificationRunId,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      outcome: "PASS",
      hasDeterministicFailure: false,
      explanation: reason,
      reviewedBy: input.buyerUserId,
    });
    await markSubmissionAccepted(tx, {
      executionId: reviewPackage.executionId,
      submissionId: submission.id,
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "REVIEW_ACCEPTED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (input.decision === "CHANGES_REQUESTED") {
    await requestRevision(tx, {
      executionId: reviewPackage.executionId,
      submissionId: submission.id,
      actor: input.actor,
      correlationId: input.correlationId,
      reason,
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "REVISION_REQUIRED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (input.decision === "REJECTED") {
    await rejectSubmission(tx, {
      executionId: reviewPackage.executionId,
      submissionId: submission.id,
      reason,
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "REVISION_REQUIRED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else {
    const [engagement] = await tx
      .select({ id: independentReviewEngagements.id })
      .from(independentReviewEngagements)
      .where(
        and(
          eq(independentReviewEngagements.taskId, task.id),
          eq(independentReviewEngagements.contractVersion, contract.version),
          eq(independentReviewEngagements.contractHash, contract.contractHash),
          eq(independentReviewEngagements.status, "ENGAGED"),
        ),
      )
      .limit(1);
    if (!engagement) {
      throw conflict("Agree an independent review engagement before escalating this delivery.");
    }
    await transitionTask(tx, {
      taskId: task.id,
      to: "AWAITING_EXTERNAL_REVIEW",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }

  const reviewedAt = new Date();
  const [updated] = await tx
    .update(reviewPackages)
    .set({
      status: nextStatus,
      reviewerDecision: input.decision === "EXTERNAL_REVIEW_REQUESTED" ? null : input.decision,
      decisionReason: reason,
      reviewedBy: input.buyerUserId,
      reviewedAt,
      updatedAt: reviewedAt,
    })
    .where(eq(reviewPackages.id, reviewPackage.id))
    .returning();
  if (!updated) throw new Error("Review package update returned no row.");
  const [provider] = await tx
    .select({ userId: providers.userId })
    .from(providers)
    .where(eq(providers.id, reviewPackage.providerId))
    .limit(1);
  await appendEvent(tx, {
    type: "BUYER_REVIEW_DECISION_RECORDED",
    aggregateId: reviewPackage.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      reviewPackageId: reviewPackage.id,
      submissionId: submission.id,
      submissionVersion: submission.version,
      submissionHash: submission.submissionHash!,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      buyerUserId: input.buyerUserId,
      providerUserId: provider?.userId ?? null,
      decision: input.decision,
      reason,
    },
  });
  return updated;
}
