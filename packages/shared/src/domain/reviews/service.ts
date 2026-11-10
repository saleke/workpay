import { and, desc, eq, inArray, lt, max } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { caseEvents, caseMessages, cases, resolutions } from "../../db/schema/cases.js";
import { contractRequirements, workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { independentReviewEngagements } from "../../db/schema/independent-reviews.js";
import { providers } from "../../db/schema/providers.js";
import { payments } from "../../db/schema/payments.js";
import { tasks } from "../../db/schema/tasks.js";
import {
  workReviewAssessments,
  workReviewItems,
  workReviews,
} from "../../db/schema/work-reviews.js";
import { appendEvent } from "../../events/outbox.js";
import { authorizationError, conflict, notFound } from "../../platform/errors.js";
import { hashObject } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import type { Actor } from "../identity/authorize.js";
import { systemActor, toEventActor } from "../context.js";
import { transitionTask } from "../tasks/service.js";
import { openCase } from "../cases/service.js";

export type WorkReviewDecision =
  | "ACCEPT_CHECKPOINT"
  | "ACCEPT_FINAL"
  | "REQUEST_CHANGES"
  | "CANCEL_REVIEW"
  | "REFER_TO_REVIEWER"
  | "EXPRESS_DISSATISFACTION";

function actorUserId(actor: Actor): string {
  if (!actor.id || !["USER", "PROVIDER", "REVIEWER"].includes(actor.kind)) {
    throw authorizationError("Sign in to participate in this review.");
  }
  return actor.id;
}

async function loadReviewContext(tx: Database, reviewId: string, lock = false) {
  const reviewQuery = tx.select().from(workReviews).where(eq(workReviews.id, reviewId));
  const [review] = lock ? await reviewQuery.for("update").limit(1) : await reviewQuery.limit(1);
  if (!review) throw notFound("Review");
  const [[task], [execution], [contract], [provider]] = await Promise.all([
    tx.select().from(tasks).where(eq(tasks.id, review.taskId)).limit(1),
    tx.select().from(workExecutions).where(eq(workExecutions.id, review.executionId)).limit(1),
    tx.select().from(workContracts).where(eq(workContracts.id, review.contractId)).limit(1),
    tx
      .select({ userId: providers.userId })
      .from(providers)
      .innerJoin(workExecutions, eq(workExecutions.providerId, providers.id))
      .where(eq(workExecutions.id, review.executionId))
      .limit(1),
  ]);
  if (!task || !execution || !contract || !provider?.userId) {
    throw conflict("The review is missing its current task, contract, or professional.");
  }
  return { review, task, execution, contract, providerUserId: provider.userId };
}

async function resolveReviewAuthority(
  tx: Database,
  context: Awaited<ReturnType<typeof loadReviewContext>>,
  actor: Actor,
): Promise<"CLIENT" | "AGREED_REVIEWER"> {
  const userId = actorUserId(actor);
  if (userId === context.task.userId && context.review.status !== "REFERRED") return "CLIENT";
  const [engagement] = await tx
    .select({ id: independentReviewEngagements.id })
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.taskId, context.task.id),
        eq(independentReviewEngagements.reviewerUserId, userId),
        eq(independentReviewEngagements.workReviewId, context.review.id),
        eq(independentReviewEngagements.contractVersion, context.review.contractVersion),
        eq(independentReviewEngagements.contractHash, context.review.contractHash),
        eq(independentReviewEngagements.status, "ENGAGED"),
      ),
    )
    .limit(1);
  if (!engagement || context.review.status !== "REFERRED") {
    throw authorizationError("Only the client or the agreed paid reviewer may assess this review.");
  }
  return "AGREED_REVIEWER";
}

async function assertCurrentReviewContract(
  context: Awaited<ReturnType<typeof loadReviewContext>>,
): Promise<void> {
  if (
    context.contract.status !== "ACTIVE" ||
    context.contract.version !== context.review.contractVersion ||
    context.contract.contractHash !== context.review.contractHash ||
    context.execution.contractVersion !== context.review.contractVersion ||
    context.execution.contractHash !== context.review.contractHash
  ) {
    throw conflict("The agreement changed after this review opened. Start a new review cycle.");
  }
}

export async function openWorkReview(
  tx: Database,
  input: {
    taskId: string;
    buyerUserId: string;
    kind: "CHECKPOINT" | "FINAL";
    title: string;
    openingNote: string;
    requirementKeys: string[];
    responseWindowDays: number;
    actor: Actor;
    correlationId: string;
  },
) {
  const userId = actorUserId(input.actor);
  if (userId !== input.buyerUserId) throw authorizationError("Only the client can open a review.");
  const title = input.title.trim();
  const openingNote = input.openingNote.trim();
  if (title.length < 3 || title.length > 160) {
    throw conflict("Review title must be between 3 and 160 characters.");
  }
  if (openingNote.length < 8 || openingNote.length > 8_000) {
    throw conflict("Describe what you want to review in 8 to 8,000 characters.");
  }
  if (!Number.isInteger(input.responseWindowDays) || input.responseWindowDays < 1 || input.responseWindowDays > 30) {
    throw conflict("Review response window must be between 1 and 30 days.");
  }
  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, input.taskId))
    .for("update")
    .limit(1);
  if (!task || task.userId !== input.buyerUserId) throw notFound("Task");
  if (task.status !== "WORK_IN_PROGRESS") {
    throw conflict("A review can be opened only while work is active or awaiting review.");
  }
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .for("update")
    .limit(1);
  if (!execution || execution.status !== "IN_PROGRESS") {
    throw conflict("The professional must start the work before the client opens a review.");
  }
  const [activeReview] = await tx
    .select({ id: workReviews.id })
    .from(workReviews)
    .where(
      and(
        eq(workReviews.executionId, execution.id),
        inArray(workReviews.status, [
          "REQUESTED",
          "PREPARING",
          "CLARIFICATION_REQUESTED",
          "READY_FOR_REVIEW",
          "REFERRED",
        ]),
      ),
    )
    .limit(1);
  if (activeReview) throw conflict("This work already has an active review cycle.");
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(and(eq(workContracts.id, execution.contractId), eq(workContracts.status, "ACTIVE")))
    .limit(1);
  if (
    !contract ||
    contract.version !== execution.contractVersion ||
    contract.contractHash !== execution.contractHash
  ) {
    throw conflict("The assignment is not bound to the current agreement.");
  }
  const requirementRows = await tx
    .select({
      key: contractRequirements.key,
      acceptanceRelevant: contractRequirements.acceptanceRelevant,
    })
    .from(contractRequirements)
    .where(eq(contractRequirements.contractId, contract.id));
  const validKeys = new Set(requirementRows.map((row) => row.key));
  const acceptanceKeys = requirementRows
    .filter((row) => row.acceptanceRelevant)
    .map((row) => row.key);
  const requestedKeys = [...new Set(input.requirementKeys)];
  if (requestedKeys.some((key) => !validKeys.has(key))) {
    throw conflict("One or more selected review constraints are not in the current agreement.");
  }
  const reviewKeys = input.kind === "FINAL" ? acceptanceKeys : requestedKeys;
  if (reviewKeys.length === 0) {
    throw conflict("Choose at least one agreement constraint for this review.");
  }
  const [sequenceRow] = await tx
    .select({ sequence: max(workReviews.sequence) })
    .from(workReviews)
    .where(eq(workReviews.executionId, execution.id));
  const reviewId = newId("wreview");
  const [review] = await tx
    .insert(workReviews)
    .values({
      id: reviewId,
      taskId: task.id,
      executionId: execution.id,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      sequence: (sequenceRow?.sequence ?? 0) + 1,
      kind: input.kind,
      status: "REQUESTED",
      title,
      openingNote,
      requirementKeys: reviewKeys,
      responseWindowDays: input.responseWindowDays,
      openedByUserId: input.buyerUserId,
    })
    .returning();
  if (!review) throw new Error("Review insert returned no row.");
  await tx
    .update(workExecutions)
    .set({ status: "REVIEW_REQUESTED" })
    .where(and(eq(workExecutions.id, execution.id), eq(workExecutions.status, "IN_PROGRESS")));
  await transitionTask(tx, {
    taskId: task.id,
    to: "REVIEW_REQUESTED",
    actor: input.actor,
    correlationId: input.correlationId,
  });
  const [provider] = await tx
    .select({ userId: providers.userId })
    .from(providers)
    .where(eq(providers.id, execution.providerId))
    .limit(1);
  if (!provider?.userId) throw conflict("The assigned professional has no user account.");
  await appendEvent(tx, {
    type: "WORK_REVIEW_OPENED",
    aggregateId: review.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      executionId: execution.id,
      reviewId: review.id,
      providerUserId: provider.userId,
      kind: review.kind,
      title: review.title,
    },
  });
  return review;
}

export async function addWorkReviewItem(
  tx: Database,
  input: {
    reviewId: string;
    actor: Actor;
    type: "NOTE" | "LINK" | "FILE";
    label?: string;
    note?: string;
    url?: string;
    storageKey?: string;
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
    sha256?: string;
    correlationId: string;
  },
) {
  const context = await loadReviewContext(tx, input.reviewId, true);
  const userId = actorUserId(input.actor);
  const [reviewerEngagement] = await tx
    .select({ id: independentReviewEngagements.id })
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.taskId, context.task.id),
        eq(independentReviewEngagements.reviewerUserId, userId),
        eq(independentReviewEngagements.workReviewId, context.review.id),
        eq(independentReviewEngagements.status, "ENGAGED"),
      ),
    )
    .limit(1);
  if (userId !== context.task.userId && userId !== context.providerUserId && !reviewerEngagement) {
    throw authorizationError("Only review participants can add context.");
  }
  if (
    !["REQUESTED", "PREPARING", "CLARIFICATION_REQUESTED", "READY_FOR_REVIEW", "REFERRED"].includes(
      context.review.status,
    )
  ) {
    throw conflict("This review cycle is closed.");
  }
  await assertCurrentReviewContract(context);
  if (
    userId === context.providerUserId &&
    ["READY_FOR_REVIEW", "REFERRED"].includes(context.review.status)
  ) {
    throw conflict("The review package has already been sent.");
  }

  let values: typeof workReviewItems.$inferInsert;
  if (input.type === "NOTE") {
    const note = input.note?.trim() ?? "";
    if (note.length < 1 || note.length > 8_000)
      throw conflict("Review notes are limited to 8,000 characters.");
    values = {
      id: newId("writem"),
      reviewId: context.review.id,
      taskId: context.task.id,
      authorUserId: userId,
      type: "NOTE",
      note,
      label: input.label?.trim().slice(0, 255) || null,
    };
  } else if (input.type === "LINK") {
    const label = input.label?.trim() ?? "";
    if (!label || label.length > 255) throw conflict("A review link needs a short label.");
    let url: URL;
    try {
      url = new URL(input.url ?? "");
    } catch {
      throw conflict("Enter a valid review link.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw conflict("Review links must use HTTP or HTTPS without embedded credentials.");
    }
    values = {
      id: newId("writem"),
      reviewId: context.review.id,
      taskId: context.task.id,
      authorUserId: userId,
      type: "LINK",
      label,
      url: url.toString(),
      note: input.note?.trim().slice(0, 4_000) || null,
    };
  } else {
    if (
      !input.storageKey ||
      !input.filename ||
      !input.sizeBytes ||
      input.sizeBytes < 1 ||
      input.sizeBytes > 25 * 1024 * 1024 ||
      !input.sha256 ||
      !/^[a-f0-9]{64}$/.test(input.sha256)
    ) {
      throw conflict("The review file metadata is invalid.");
    }
    values = {
      id: newId("writem"),
      reviewId: context.review.id,
      taskId: context.task.id,
      authorUserId: userId,
      type: "FILE",
      label: input.label?.trim().slice(0, 255) || input.filename,
      note: input.note?.trim().slice(0, 4_000) || null,
      storageKey: input.storageKey,
      filename: input.filename.slice(0, 255),
      contentType: input.contentType?.slice(0, 255) || "application/octet-stream",
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
    };
  }
  const [item] = await tx.insert(workReviewItems).values(values).returning();
  if (!item) throw new Error("Review item insert returned no row.");
  if (userId === context.providerUserId && context.review.status === "REQUESTED") {
    await tx
      .update(workReviews)
      .set({ status: "PREPARING", updatedAt: new Date() })
      .where(eq(workReviews.id, context.review.id));
  } else if (
    userId === context.task.userId &&
    context.review.status === "CLARIFICATION_REQUESTED"
  ) {
    await tx
      .update(workReviews)
      .set({ status: "REQUESTED", updatedAt: new Date() })
      .where(eq(workReviews.id, context.review.id));
  }
  const recipientUserId =
    userId === context.task.userId ? context.providerUserId : context.task.userId;
  await appendEvent(tx, {
    type: "WORK_REVIEW_CONTEXT_ADDED",
    aggregateId: context.review.id,
    taskId: context.task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: context.task.id,
      reviewId: context.review.id,
      itemId: item.id,
      itemType: item.type,
      recipientUserId,
    },
  });
  return item;
}

export async function respondToWorkReviewRequest(
  tx: Database,
  input: {
    reviewId: string;
    action: "PREPARE" | "REQUEST_CLARIFICATION" | "SEND_PACKAGE";
    summary?: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const context = await loadReviewContext(tx, input.reviewId, true);
  const userId = actorUserId(input.actor);
  if (userId !== context.providerUserId) {
    throw authorizationError("Only the assigned professional can respond to this review request.");
  }
  await assertCurrentReviewContract(context);
  if (input.action === "PREPARE") {
    if (context.review.status === "PREPARING") return context.review;
    if (context.review.status !== "REQUESTED") {
      throw conflict("This review request is no longer awaiting preparation.");
    }
    const [updated] = await tx
      .update(workReviews)
      .set({ status: "PREPARING", updatedAt: new Date() })
      .where(and(eq(workReviews.id, context.review.id), eq(workReviews.status, "REQUESTED")))
      .returning();
    if (!updated) throw conflict("The review request changed concurrently.");
    return updated;
  }

  const summary = input.summary?.trim() ?? "";
  if (summary.length < 8 || summary.length > 8_000) {
    throw conflict("Add a response summary between 8 and 8,000 characters.");
  }
  if (input.action === "REQUEST_CLARIFICATION") {
    if (!["REQUESTED", "PREPARING"].includes(context.review.status)) {
      throw conflict("Clarification can no longer be requested for this review cycle.");
    }
    const now = new Date();
    const [updated] = await tx
      .update(workReviews)
      .set({
        status: "CLARIFICATION_REQUESTED",
        providerResponseSummary: summary,
        updatedAt: now,
      })
      .where(
        and(
          eq(workReviews.id, context.review.id),
          inArray(workReviews.status, ["REQUESTED", "PREPARING"]),
        ),
      )
      .returning();
    if (!updated) throw conflict("The review request changed concurrently.");
    const [item] = await tx
      .insert(workReviewItems)
      .values({
        id: newId("writem"),
        reviewId: context.review.id,
        taskId: context.task.id,
        authorUserId: userId,
        type: "NOTE",
        label: "Clarification requested",
        note: summary,
      })
      .returning();
    if (item) {
      await appendEvent(tx, {
        type: "WORK_REVIEW_CONTEXT_ADDED",
        aggregateId: context.review.id,
        taskId: context.task.id,
        actor: toEventActor(input.actor),
        correlationId: input.correlationId,
        payload: {
          taskId: context.task.id,
          reviewId: context.review.id,
          itemId: item.id,
          itemType: item.type,
          recipientUserId: context.task.userId,
        },
      });
    }
    return updated;
  }

  if (!["REQUESTED", "PREPARING"].includes(context.review.status)) {
    if (context.review.status === "READY_FOR_REVIEW") return context.review;
    throw conflict("This review request can no longer receive a package.");
  }
  const packageItems = await tx
    .select()
    .from(workReviewItems)
    .where(
      and(
        eq(workReviewItems.reviewId, context.review.id),
        eq(workReviewItems.authorUserId, context.providerUserId),
      ),
    )
    .orderBy(workReviewItems.createdAt);
  const packageHash = hashObject({
    reviewId: context.review.id,
    contractVersion: context.review.contractVersion,
    contractHash: context.review.contractHash,
    summary,
    items: packageItems.map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      note: item.note,
      url: item.url,
      filename: item.filename,
      sha256: item.sha256,
    })),
  });
  const now = new Date();
  const [updated] = await tx
    .update(workReviews)
    .set({
      status: "READY_FOR_REVIEW",
      providerResponseSummary: summary,
      providerRespondedAt: now,
      packageHash,
      responseDueAt: new Date(
        now.getTime() + context.review.responseWindowDays * 24 * 60 * 60 * 1000,
      ),
      updatedAt: now,
    })
    .where(
      and(
        eq(workReviews.id, context.review.id),
        inArray(workReviews.status, ["REQUESTED", "PREPARING"]),
      ),
    )
    .returning();
  if (!updated) throw conflict("The review request changed while the package was sent.");
  await tx
    .update(workExecutions)
    .set({ status: "UNDER_REVIEW" })
    .where(
      and(
        eq(workExecutions.id, context.execution.id),
        eq(workExecutions.status, "REVIEW_REQUESTED"),
      ),
    );
  await transitionTask(tx, {
    taskId: context.task.id,
    to: "AWAITING_CLIENT_REVIEW",
    actor: input.actor,
    correlationId: input.correlationId,
  });
  await appendEvent(tx, {
    type: "WORK_REVIEW_PACKAGE_SENT",
    aggregateId: context.review.id,
    taskId: context.task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: context.task.id,
      executionId: context.execution.id,
      reviewId: context.review.id,
      buyerUserId: context.task.userId,
      packageHash,
      itemCount: packageItems.length,
    },
  });
  return updated;
}

export async function recordWorkReviewAssessment(
  tx: Database,
  input: {
    reviewId: string;
    requirementKey: string;
    status: "MET" | "PARTIAL" | "NOT_MET" | "UNCLEAR" | "NOT_APPLICABLE";
    rationale?: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const context = await loadReviewContext(tx, input.reviewId, true);
  const authority = await resolveReviewAuthority(tx, context, input.actor);
  void authority;
  if (!["READY_FOR_REVIEW", "REFERRED"].includes(context.review.status)) {
    throw conflict("The professional's review package is not ready for assessment.");
  }
  await assertCurrentReviewContract(context);
  const requirementKeys = Array.isArray(context.review.requirementKeys)
    ? context.review.requirementKeys.filter((key): key is string => typeof key === "string")
    : [];
  if (!requirementKeys.includes(input.requirementKey)) {
    throw conflict("That agreement constraint is not part of this review cycle.");
  }
  const rationale = input.rationale?.trim() || null;
  if (input.status !== "MET" && (!rationale || rationale.length < 4)) {
    throw conflict("Explain partial, unmet, unclear, or not-applicable assessments.");
  }
  if (rationale && rationale.length > 4_000)
    throw conflict("Assessment notes are limited to 4,000 characters.");
  const userId = actorUserId(input.actor);
  const [assessment] = await tx
    .insert(workReviewAssessments)
    .values({
      id: newId("wrassess"),
      reviewId: context.review.id,
      requirementKey: input.requirementKey,
      status: input.status,
      rationale,
      assessedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [
        workReviewAssessments.reviewId,
        workReviewAssessments.requirementKey,
        workReviewAssessments.assessedByUserId,
      ],
      set: { status: input.status, rationale, assessedByUserId: userId, updatedAt: new Date() },
    })
    .returning();
  if (!assessment) throw new Error("Review assessment insert returned no row.");
  await appendEvent(tx, {
    type: "WORK_REVIEW_ASSESSMENT_RECORDED",
    aggregateId: context.review.id,
    taskId: context.task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: context.task.id,
      reviewId: context.review.id,
      requirementKey: input.requirementKey,
      status: input.status,
    },
  });
  return assessment;
}

export async function completePaidWorkReview(
  tx: Database,
  input: { reviewId: string; summary: string; actor: Actor; correlationId: string },
) {
  const context = await loadReviewContext(tx, input.reviewId, true);
  const reviewerUserId = actorUserId(input.actor);
  const [engagement] = await tx
    .select()
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.taskId, context.task.id),
        eq(independentReviewEngagements.reviewerUserId, reviewerUserId),
        eq(independentReviewEngagements.workReviewId, context.review.id),
        eq(independentReviewEngagements.status, "ENGAGED"),
      ),
    )
    .for("update")
    .limit(1);
  if (!engagement || context.review.status !== "REFERRED") {
    throw authorizationError("This review is not assigned to the current reviewer.");
  }
  const summary = input.summary.trim();
  if (summary.length < 20 || summary.length > 8_000) {
    throw conflict("Reviewer summary must be between 20 and 8,000 characters.");
  }
  const requirementKeys = Array.isArray(context.review.requirementKeys)
    ? context.review.requirementKeys.filter((key): key is string => typeof key === "string")
    : [];
  const assessments = await tx
    .select({ requirementKey: workReviewAssessments.requirementKey })
    .from(workReviewAssessments)
    .where(
      and(
        eq(workReviewAssessments.reviewId, context.review.id),
        eq(workReviewAssessments.assessedByUserId, reviewerUserId),
      ),
    );
  const assessedKeys = new Set(assessments.map((assessment) => assessment.requirementKey));
  const missing = requirementKeys.filter((key) => !assessedKeys.has(key));
  if (missing.length > 0) {
    throw conflict("Assess every agreed review constraint before returning the review.", {
      missingRequirementKeys: missing,
    });
  }
  const now = new Date();
  const [updated] = await tx
    .update(workReviews)
    .set({
      status: "READY_FOR_REVIEW",
      reviewerSummary: summary,
      reviewerRespondedAt: now,
      updatedAt: now,
    })
    .where(and(eq(workReviews.id, context.review.id), eq(workReviews.status, "REFERRED")))
    .returning();
  if (!updated) throw conflict("The review changed while the reviewer response was saved.");
  await tx
    .update(independentReviewEngagements)
    .set({ status: "CLOSED", updatedAt: now })
    .where(eq(independentReviewEngagements.id, engagement.id));
  await transitionTask(tx, {
    taskId: context.task.id,
    to: "AWAITING_CLIENT_REVIEW",
    actor: input.actor,
    correlationId: input.correlationId,
  });
  await appendEvent(tx, {
    type: "WORK_REVIEW_REVIEWER_COMPLETED",
    aggregateId: context.review.id,
    taskId: context.task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: context.task.id,
      executionId: context.execution.id,
      reviewId: context.review.id,
      buyerUserId: context.task.userId,
      reviewerUserId,
    },
  });
  return updated;
}

async function resolveBlockingReviewCases(
  tx: Database,
  reviewId: string,
  actor: Actor,
  correlationId: string,
  rationale: string,
) {
  const openCases = await tx
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.subjectType, "WORK_REVIEW"),
        eq(cases.subjectId, reviewId),
        inArray(cases.status, ["OPEN", "AWAITING_RESPONSE", "UNDER_REVIEW"]),
      ),
    );
  for (const currentCase of openCases) {
    await tx
      .update(cases)
      .set({
        status: "RESOLVED",
        blocksPaymentCapture: false,
        resolvedAt: new Date(),
        closedAt: new Date(),
      })
      .where(eq(cases.id, currentCase.id));
    await tx
      .insert(resolutions)
      .values({
        id: newId("resol"),
        caseId: currentCase.id,
        outcome: "NO_ACTION",
        rationale,
        resolvedBy: actor.id,
        requiresReverification: false,
        detail: { resolutionSource: "PARTY_REVIEW_DECISION" },
      })
      .onConflictDoNothing();
    await tx.insert(caseEvents).values({
      id: newId("cev"),
      caseId: currentCase.id,
      type: "RESOLVED_BY_PARTY_DECISION",
      actorType: actor.kind,
      actorId: actor.id,
      detail: { rationale },
    });
    await appendEvent(tx, {
      type: "CASE_RESOLVED",
      aggregateId: currentCase.id,
      taskId: currentCase.taskId,
      actor: toEventActor(actor),
      correlationId,
      payload: { taskId: currentCase.taskId, caseId: currentCase.id, outcome: "NO_ACTION" },
    });
  }
}

export async function decideWorkReview(
  tx: Database,
  input: {
    reviewId: string;
    decision: WorkReviewDecision;
    reason: string;
    riskAcknowledged: boolean;
    dissatisfactionRemedy?: "REVISION" | "PAID_REVIEW" | "CANCEL" | "OTHER";
    actor: Actor;
    correlationId: string;
  },
) {
  const context = await loadReviewContext(tx, input.reviewId, true);
  const authority = await resolveReviewAuthority(tx, context, input.actor);
  if (authority === "AGREED_REVIEWER") {
    throw authorizationError("Return reviewer findings to the client before a final decision.");
  }
  const isResolutionState = ["DISSATISFIED", "CLIENT_RESPONSE_OVERDUE"].includes(
    context.review.status,
  );
  if (
    !["READY_FOR_REVIEW", "REFERRED"].includes(context.review.status) &&
    !isResolutionState
  ) {
    throw conflict("The professional's review package is not ready for a decision.");
  }
  if (context.review.status === "REFERRED" && input.decision === "REFER_TO_REVIEWER") {
    return context.review;
  }
  await assertCurrentReviewContract(context);
  const reason = input.reason.trim();
  const minimumReasonLength = input.decision === "EXPRESS_DISSATISFACTION" ? 20 : 8;
  if (reason.length < minimumReasonLength || reason.length > 4_000) {
    throw conflict(
      `A review decision requires a reason between ${minimumReasonLength} and 4,000 characters.`,
    );
  }
  let referredReviewerUserId: string | null = null;
  if (input.decision === "REFER_TO_REVIEWER") {
    if (authority !== "CLIENT") throw authorizationError("Only the client can refer a review.");
    const [engagement] = await tx
      .select({
        id: independentReviewEngagements.id,
        workReviewId: independentReviewEngagements.workReviewId,
      })
      .from(independentReviewEngagements)
      .where(
        and(
          eq(independentReviewEngagements.taskId, context.task.id),
          eq(independentReviewEngagements.contractVersion, context.review.contractVersion),
          eq(independentReviewEngagements.contractHash, context.review.contractHash),
          eq(independentReviewEngagements.status, "ENGAGED"),
        ),
      )
      .limit(1);
    if (!engagement)
      throw conflict("Agree and engage a paid reviewer before referring this review.");
    if (engagement.workReviewId && engagement.workReviewId !== context.review.id) {
      throw conflict("The paid reviewer is already attached to another review cycle.");
    }
    await tx
      .update(independentReviewEngagements)
      .set({ workReviewId: context.review.id, updatedAt: new Date() })
      .where(eq(independentReviewEngagements.id, engagement.id));
    const [engagementReviewer] = await tx
      .select({ reviewerUserId: independentReviewEngagements.reviewerUserId })
      .from(independentReviewEngagements)
      .where(eq(independentReviewEngagements.id, engagement.id))
      .limit(1);
    referredReviewerUserId = engagementReviewer?.reviewerUserId ?? null;
  }

  const requirementKeys = Array.isArray(context.review.requirementKeys)
    ? context.review.requirementKeys.filter((key): key is string => typeof key === "string")
    : [];
  const assessments = await tx
    .select()
    .from(workReviewAssessments)
    .where(eq(workReviewAssessments.reviewId, context.review.id));
  const assessedKeys = new Set(assessments.map((assessment) => assessment.requirementKey));
  const isAcceptance = input.decision === "ACCEPT_CHECKPOINT" || input.decision === "ACCEPT_FINAL";
  if (isAcceptance) {
    const missing = requirementKeys.filter((key) => !assessedKeys.has(key));
    if (missing.length > 0) {
      throw conflict("Assess every selected agreement constraint before accepting this review.", {
        missingRequirementKeys: missing,
      });
    }
    const ambiguous = assessments.filter((assessment) => assessment.status !== "MET");
    if (ambiguous.length > 0 && !input.riskAcknowledged) {
      throw conflict(
        "Explicitly acknowledge the partial, unmet, unclear, or waived constraints before accepting.",
      );
    }
  }
  if (input.decision === "EXPRESS_DISSATISFACTION") {
    if (context.review.kind !== "FINAL") {
      throw conflict("Use request changes for a checkpoint review.");
    }
    const missing = requirementKeys.filter((key) => !assessedKeys.has(key));
    if (missing.length > 0) {
      throw conflict("Assess every final-review constraint before recording dissatisfaction.", {
        missingRequirementKeys: missing,
      });
    }
    const affected = assessments.filter((assessment) =>
      ["PARTIAL", "NOT_MET", "UNCLEAR"].includes(assessment.status),
    );
    if (affected.length === 0) {
      throw conflict("Record at least one partial, unmet, or unclear constraint.");
    }
    if (!input.dissatisfactionRemedy) {
      throw conflict("Choose the remedy you want from the professional.");
    }
  }
  if (input.decision === "ACCEPT_CHECKPOINT" && context.review.kind !== "CHECKPOINT") {
    throw conflict("Only a checkpoint review can be marked as a completed checkpoint.");
  }
  if (input.decision === "ACCEPT_FINAL" && context.review.kind !== "FINAL") {
    throw conflict("Only a final review can accept the completed work.");
  }

  const status =
    input.decision === "ACCEPT_CHECKPOINT"
      ? "CHECKPOINT_ACCEPTED"
      : input.decision === "ACCEPT_FINAL"
        ? "FINAL_ACCEPTED"
        : input.decision === "REQUEST_CHANGES"
          ? "CHANGES_REQUESTED"
          : input.decision === "REFER_TO_REVIEWER"
            ? "REFERRED"
            : input.decision === "EXPRESS_DISSATISFACTION"
              ? "DISSATISFIED"
              : "CANCELLED";
  const now = new Date();
  const [updated] = await tx
    .update(workReviews)
    .set({
      status,
      decisionByUserId: actorUserId(input.actor),
      decisionRole: authority,
      decisionReason: reason,
      dissatisfactionRemedy:
        input.decision === "EXPRESS_DISSATISFACTION"
          ? (input.dissatisfactionRemedy ?? null)
          : context.review.dissatisfactionRemedy,
      riskAcknowledged: input.riskAcknowledged,
      decidedAt: input.decision === "REFER_TO_REVIEWER" ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workReviews.id, context.review.id),
        inArray(workReviews.status, [
          "READY_FOR_REVIEW",
          "REFERRED",
          "DISSATISFIED",
          "CLIENT_RESPONSE_OVERDUE",
        ]),
      ),
    )
    .returning();
  if (!updated) throw conflict("This review cycle changed while the decision was recorded.");

  if (status === "CHECKPOINT_ACCEPTED" || status === "CANCELLED") {
    await tx
      .update(workExecutions)
      .set({ status: "IN_PROGRESS", revisionReason: null })
      .where(eq(workExecutions.id, context.execution.id));
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "WORK_IN_PROGRESS",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (status === "FINAL_ACCEPTED") {
    await resolveBlockingReviewCases(
      tx,
      context.review.id,
      input.actor,
      input.correlationId,
      "Client recorded final acceptance.",
    );
    await tx
      .update(workExecutions)
      .set({ status: "COMPLETED", completedAt: now, revisionReason: null })
      .where(eq(workExecutions.id, context.execution.id));
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "REVIEW_ACCEPTED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (status === "CHANGES_REQUESTED") {
    await resolveBlockingReviewCases(
      tx,
      context.review.id,
      input.actor,
      input.correlationId,
      "Parties moved the work into revision.",
    );
    await tx
      .update(workExecutions)
      .set({ status: "REVISION_REQUESTED", revisionReason: reason })
      .where(eq(workExecutions.id, context.execution.id));
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "REVISION_REQUIRED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (status === "DISSATISFIED") {
    const [payment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.taskId, context.task.id))
      .limit(1);
    await openCase(tx, {
      taskId: context.task.id,
      type: "DISPUTE",
      category: "BUYER_COMPLAINT",
      severity: "HIGH",
      title: "Client recorded dissatisfaction with final work",
      description: reason,
      blocksPaymentCapture: true,
      paymentId: payment?.id ?? null,
      subjectType: "WORK_REVIEW",
      subjectId: context.review.id,
      actor: input.actor,
      correlationId: input.correlationId,
    });
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "DISPUTED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else {
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "AWAITING_EXTERNAL_REVIEW",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }
  await appendEvent(tx, {
    type: "WORK_REVIEW_DECIDED",
    aggregateId: context.review.id,
    taskId: context.task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: context.task.id,
      executionId: context.execution.id,
      reviewId: context.review.id,
      providerUserId: context.providerUserId,
      decision: status,
      reason,
    },
  });
  if (status === "REFERRED" && referredReviewerUserId) {
    await appendEvent(tx, {
      type: "WORK_REVIEW_REFERRED",
      aggregateId: context.review.id,
      taskId: context.task.id,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: context.task.id,
        reviewId: context.review.id,
        reviewerUserId: referredReviewerUserId,
      },
    });
  }
  return updated;
}

export async function respondToReviewResolution(
  tx: Database,
  input: {
    reviewId: string;
    response: "ACCEPT_REVISION" | "DISAGREE" | "REQUEST_PAID_REVIEW";
    note: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const context = await loadReviewContext(tx, input.reviewId, true);
  const providerUserId = actorUserId(input.actor);
  if (providerUserId !== context.providerUserId) {
    throw authorizationError("Only the assigned professional can respond.");
  }
  if (!['DISSATISFIED', 'CLIENT_RESPONSE_OVERDUE'].includes(context.review.status)) {
    throw conflict("This review is not awaiting a professional response.");
  }
  const note = input.note.trim();
  if (note.length < 20 || note.length > 4_000) {
    throw conflict("Professional response must be between 20 and 4,000 characters.");
  }
  const now = new Date();
  const [updated] = await tx
    .update(workReviews)
    .set({
      ...(input.response === "ACCEPT_REVISION" ? { status: "CHANGES_REQUESTED" as const } : {}),
      providerResponse: input.response,
      providerResponseNote: note,
      providerResponseAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workReviews.id, context.review.id),
        inArray(workReviews.status, ["DISSATISFIED", "CLIENT_RESPONSE_OVERDUE"]),
      ),
    )
    .returning();
  if (!updated) throw conflict("The review changed while the response was recorded.");

  const existingCases = await tx
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.subjectType, "WORK_REVIEW"),
        eq(cases.subjectId, context.review.id),
        inArray(cases.status, ["OPEN", "AWAITING_RESPONSE", "UNDER_REVIEW"]),
      ),
    );
  let currentCases = existingCases;
  if (existingCases.length === 0) {
    const [payment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.taskId, context.task.id))
      .limit(1);
    const opened = await openCase(tx, {
      taskId: context.task.id,
      type: "DISPUTE",
      category: context.review.status === "CLIENT_RESPONSE_OVERDUE" ? "PROVIDER_CLAIM" : "WORK_DISPUTE",
      severity: "HIGH",
      title:
        context.review.status === "CLIENT_RESPONSE_OVERDUE"
          ? "Client review response overdue"
          : "Professional disputes the client review",
      description: note,
      blocksPaymentCapture: true,
      paymentId: payment?.id ?? null,
      subjectType: "WORK_REVIEW",
      subjectId: context.review.id,
      actor: input.actor,
      correlationId: input.correlationId,
    });
    currentCases = [opened];
  }
  for (const currentCase of currentCases) {
    await tx.insert(caseMessages).values({
      id: newId("cmsg"),
      caseId: currentCase.id,
      author: "PROVIDER",
      authorId: providerUserId,
      body: note,
    });
    if (input.response !== "ACCEPT_REVISION") {
      await tx
        .update(cases)
        .set({ status: "UNDER_REVIEW" })
        .where(eq(cases.id, currentCase.id));
    }
  }
  if (input.response === "ACCEPT_REVISION") {
    await resolveBlockingReviewCases(
      tx,
      context.review.id,
      input.actor,
      input.correlationId,
      "Professional accepted the requested revision.",
    );
    await tx
      .update(workExecutions)
      .set({ status: "REVISION_REQUESTED", revisionReason: context.review.decisionReason })
      .where(eq(workExecutions.id, context.execution.id));
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "REVISION_REQUIRED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (context.task.status === "AWAITING_CLIENT_REVIEW") {
    await transitionTask(tx, {
      taskId: context.task.id,
      to: "DISPUTED",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }
  await appendEvent(tx, {
    type: "WORK_REVIEW_PROVIDER_RESPONDED",
    aggregateId: context.review.id,
    taskId: context.task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: context.task.id,
      reviewId: context.review.id,
      buyerUserId: context.task.userId,
      response: input.response,
    },
  });
  return updated;
}

export async function markOverdueWorkReviews(tx: Database, now = new Date()) {
  const overdue = await tx
    .select()
    .from(workReviews)
    .where(
      and(
        eq(workReviews.status, "READY_FOR_REVIEW"),
        lt(workReviews.responseDueAt, now),
      ),
    )
    .for("update", { skipLocked: true })
    .limit(25);
  for (const review of overdue) {
    const [updated] = await tx
      .update(workReviews)
      .set({ status: "CLIENT_RESPONSE_OVERDUE", updatedAt: now })
      .where(
        and(eq(workReviews.id, review.id), eq(workReviews.status, "READY_FOR_REVIEW")),
      )
      .returning();
    if (!updated) continue;
    const [provider] = await tx
      .select({ userId: providers.userId })
      .from(workExecutions)
      .innerJoin(providers, eq(providers.id, workExecutions.providerId))
      .where(eq(workExecutions.id, review.executionId))
      .limit(1);
    if (!provider?.userId || !review.responseDueAt) continue;
    await appendEvent(tx, {
      type: "WORK_REVIEW_CLIENT_OVERDUE",
      aggregateId: review.id,
      taskId: review.taskId,
      actor: toEventActor(systemActor()),
      correlationId: newId("corr"),
      payload: {
        taskId: review.taskId,
        reviewId: review.id,
        providerUserId: provider.userId,
        responseDueAt: review.responseDueAt.toISOString(),
      },
    });
  }
  return overdue.length;
}

export async function getWorkReviewDetail(
  db: Database,
  input: { reviewId: string; userId: string },
) {
  const context = await loadReviewContext(db, input.reviewId);
  const [engagement] = await db
    .select({ id: independentReviewEngagements.id })
    .from(independentReviewEngagements)
    .where(
      and(
        eq(independentReviewEngagements.taskId, context.task.id),
        eq(independentReviewEngagements.reviewerUserId, input.userId),
        eq(independentReviewEngagements.workReviewId, context.review.id),
        eq(independentReviewEngagements.status, "ENGAGED"),
      ),
    )
    .limit(1);
  if (
    input.userId !== context.task.userId &&
    input.userId !== context.providerUserId &&
    !engagement
  ) {
    throw notFound("Review");
  }
  const [items, assessments, requirements] = await Promise.all([
    db
      .select()
      .from(workReviewItems)
      .where(eq(workReviewItems.reviewId, context.review.id))
      .orderBy(workReviewItems.createdAt),
    db
      .select()
      .from(workReviewAssessments)
      .where(eq(workReviewAssessments.reviewId, context.review.id)),
    db
      .select()
      .from(contractRequirements)
      .where(eq(contractRequirements.contractId, context.review.contractId)),
  ]);
  return { ...context, items, assessments, requirements };
}

export async function listWorkReviewsForTask(
  db: Database,
  input: { taskId: string; userId: string },
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task) throw notFound("Task");
  const [execution] = await db
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .limit(1);
  if (!execution) return [];
  const [provider] = await db
    .select({ userId: providers.userId })
    .from(providers)
    .where(eq(providers.id, execution.providerId))
    .limit(1);
  if (input.userId !== task.userId && input.userId !== provider?.userId) throw notFound("Task");
  return db
    .select()
    .from(workReviews)
    .where(eq(workReviews.taskId, task.id))
    .orderBy(desc(workReviews.sequence));
}

export async function getLatestAcceptedFinalReview(db: Database, taskId: string) {
  const [review] = await db
    .select()
    .from(workReviews)
    .where(and(eq(workReviews.taskId, taskId), eq(workReviews.status, "FINAL_ACCEPTED")))
    .orderBy(desc(workReviews.decidedAt))
    .limit(1);
  return review ?? null;
}
