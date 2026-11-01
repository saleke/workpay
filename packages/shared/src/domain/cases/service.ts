/**
 * Case service (Component 10).
 *
 * Cases record platform/payment exceptions and unresolved party issues. WorkPay
 * does not adjudicate deliverable quality or party disputes; those require the
 * parties' agreed independent-review or other external process.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  cases,
  caseEvents,
  caseMessages,
  caseImpacts,
  resolutions,
} from "../../db/schema/cases.js";
import { appendEvent } from "../../events/outbox.js";
import { newId } from "../../platform/ids.js";
import { authorizationError, conflict, notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { caseOpenerFor, caseAuthorFor } from "./mapping.js";

export interface OpenCaseInput {
  taskId: string;
  type: "EXCEPTION" | "DISPUTE" | "HUMAN_REVIEW";
  category:
    | "VERIFICATION_UNCERTAIN"
    | "WORK_DISPUTE"
    | "CONTRACT_DISPUTE"
    | "SCOPE_CHANGE"
    | "DEADLINE_DISPUTE"
    | "PAYMENT_EXCEPTION"
    | "PAYMENT_DISPUTE"
    | "PROVIDER_CLAIM"
    | "BUYER_COMPLAINT"
    | "TECHNICAL_FAILURE"
    | "FRAUD_SUSPECTED";
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  blocksPaymentCapture?: boolean;
  paymentId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  actor: Actor;
  correlationId: string;
}

export async function openCase(tx: Database, input: OpenCaseInput) {
  const caseId = newId("case");
  const [opened] = await tx
    .insert(cases)
    .values({
      id: caseId,
      taskId: input.taskId,
      type: input.type,
      category: input.category,
      severity: input.severity ?? "MEDIUM",
      openedBy: caseOpenerFor(input.actor),
      title: input.title,
      description: input.description,
      blocksPaymentCapture: input.blocksPaymentCapture ?? false,
      paymentId: input.paymentId ?? null,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
    })
    .returning();
  if (!opened) throw new Error("Case insert returned no row");

  await tx.insert(caseEvents).values({
    id: newId("cev"),
    caseId,
    type: "OPENED",
    actorType: input.actor.kind,
    actorId: input.actor.id,
    detail: { category: input.category, severity: opened.severity },
  });

  await appendEvent(tx, {
    type: "CASE_OPENED",
    aggregateId: caseId,
    taskId: input.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: input.taskId,
      caseId,
      category: input.category,
      severity: opened.severity,
      blocksPaymentCapture: opened.blocksPaymentCapture,
    },
  });

  return opened;
}

export async function addCaseMessage(
  tx: Database,
  options: {
    caseId: string;
    body: string;
    actor: Actor;
    evidenceId?: string | null;
    correlationId: string;
  },
) {
  const [existing] = await tx.select().from(cases).where(eq(cases.id, options.caseId)).limit(1);
  if (!existing) throw notFound("Case");

  const [message] = await tx
    .insert(caseMessages)
    .values({
      id: newId("cmsg"),
      caseId: options.caseId,
      author: caseAuthorFor(options.actor),
      authorId: options.actor.id,
      body: options.body,
      evidenceId: options.evidenceId ?? null,
    })
    .returning();

  await tx.insert(caseEvents).values({
    id: newId("cev"),
    caseId: options.caseId,
    type: "MESSAGE_ADDED",
    actorType: options.actor.kind,
    actorId: options.actor.id,
  });

  return message;
}

export interface ResolveCaseInput {
  caseId: string;
  outcome:
    | "UPHOLD_SYSTEM_DECISION"
    | "OVERRIDE_VERIFICATION"
    | "REQUIRE_REVISION"
    | "REQUIRE_NEW_EVIDENCE"
    | "AMEND_CONTRACT"
    | "CANCEL_TASK"
    | "RELEASE_PAYMENT"
    | "REFUND_PAYMENT"
    | "VOID_PAYMENT"
    | "NO_ACTION";
  rationale: string;
  requiresReverification?: boolean;
  actor: Actor;
  correlationId: string;
}

export function assertCaseResolutionAllowed(
  caseType: "EXCEPTION" | "DISPUTE" | "HUMAN_REVIEW",
  category: OpenCaseInput["category"],
  outcome: ResolveCaseInput["outcome"],
  actor: Actor,
) {
  if (actor.kind !== "SYSTEM") {
    throw authorizationError(
      "Platform exceptions can only be closed by an authoritative system reconciliation.",
    );
  }
  if (
    caseType !== "EXCEPTION" ||
    (category !== "PAYMENT_EXCEPTION" &&
      category !== "TECHNICAL_FAILURE" &&
      category !== "FRAUD_SUSPECTED")
  ) {
    throw conflict(
      "WorkPay does not adjudicate deliverable quality or party disputes. Use the independent process agreed by the task participants.",
    );
  }
  if (outcome !== "NO_ACTION") {
    throw conflict(
      "Case resolution records reconciliation; it cannot release, refund, void, or otherwise move money.",
    );
  }
}

/**
 * Resolve a platform exception. Task-quality and party-dispute cases are
 * deliberately excluded: WorkPay does not provide independent review.
 */
export async function resolveCase(tx: Database, input: ResolveCaseInput) {
  const [existing] = await tx.select().from(cases).where(eq(cases.id, input.caseId)).limit(1);
  if (!existing) throw notFound("Case");
  assertCaseResolutionAllowed(existing.type, existing.category, input.outcome, input.actor);

  const [resolution] = await tx
    .insert(resolutions)
    .values({
      id: newId("resol"),
      caseId: input.caseId,
      outcome: input.outcome,
      rationale: input.rationale,
      resolvedBy: input.actor.id,
      requiresReverification: input.requiresReverification ?? false,
    })
    .returning();

  await tx
    .update(cases)
    .set({
      status: "RESOLVED",
      blocksPaymentCapture: false,
      resolvedAt: new Date(),
      closedAt: new Date(),
    })
    .where(eq(cases.id, input.caseId));

  await tx.insert(caseEvents).values({
    id: newId("cev"),
    caseId: input.caseId,
    type: "RESOLVED",
    actorType: input.actor.kind,
    actorId: input.actor.id,
    detail: { outcome: input.outcome },
  });

  if (existing.paymentId) {
    await tx.insert(caseImpacts).values({
      id: newId("cimpact"),
      caseId: input.caseId,
      targetType: "PAYMENT",
      targetId: existing.paymentId,
      impact: "RECONCILED",
      detail: { outcome: input.outcome },
    });
  }

  await appendEvent(tx, {
    type: "CASE_RESOLVED",
    aggregateId: input.caseId,
    taskId: existing.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: { taskId: existing.taskId, caseId: input.caseId, outcome: input.outcome },
  });

  return resolution;
}

export async function getCaseWithTimeline(db: Database, caseId: string) {
  const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!existing) return null;
  const [messages, events, resolutionRows] = await Promise.all([
    db.select().from(caseMessages).where(eq(caseMessages.caseId, caseId)),
    db.select().from(caseEvents).where(eq(caseEvents.caseId, caseId)),
    db.select().from(resolutions).where(eq(resolutions.caseId, caseId)),
  ]);
  return { case: existing, messages, events, resolution: resolutionRows[0] ?? null };
}

export async function listOpenCases(db: Database) {
  return db.select().from(cases).where(eq(cases.status, "OPEN"));
}
