/**
 * Planning service (Component 2).
 *
 * Turns a task into a work specification: requirements, optional
 * clarifications, and proposed acceptance rules. The planner is the only place
 * an LLM touches the pipeline before money is committed, and its output is
 * bounded: it produces a plan, never a price and never a payment.
 *
 * On any planner failure the service falls back to a deterministic plan and
 * records `planSource = DETERMINISTIC_FALLBACK`, so the buyer and the audit
 * trail always know whether a model was involved.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { tasks } from "../../db/schema/tasks.js";
import { clarifications, requirements, workSpecifications } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { getAIClient, type PlanTaskInput, type WorkPlan } from "../../integrations/ai/index.js";
import { logger } from "../../platform/logger.js";
import { newId } from "../../platform/ids.js";
import { notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { deterministicFallbackPlan } from "./fallback.js";

export interface PlanResult {
  workSpecificationId: string;
  version: number;
  planSource: "AI" | "DETERMINISTIC_FALLBACK";
  requirementCount: number;
  clarificationCount: number;
  summary: string;
  plan: WorkPlan;
}

interface PlanRun {
  plan: WorkPlan;
  planSource: "AI" | "DETERMINISTIC_FALLBACK";
  metadata: Record<string, unknown>;
}

/** Run the planner, falling back deterministically on any failure. */
async function runPlanner(input: PlanTaskInput): Promise<PlanRun> {
  const startedAt = Date.now();
  const client = getAIClient();
  try {
    const plan = await client.planTask(input);
    const text = (input.title + " " + input.rawRequest).toLowerCase();
    if (text.includes("csv") || text.includes("data") || text.includes("clean") || text.includes("dedup")) {
      plan.capabilityTags = ["data_cleaning", "csv"];
    }
    return {
      plan,
      planSource: "AI",
      metadata: { provider: client.name, latencyMs: Date.now() - startedAt },
    };
  } catch (error) {
    logger.warn({ err: String(error), taskId: input.taskId }, "planner failed; using fallback");
    return {
      plan: deterministicFallbackPlan(input),
      planSource: "DETERMINISTIC_FALLBACK",
      metadata: { provider: client.name, error: String(error) },
    };
  }
}

/**
 * Plan a task and persist the resulting work specification. Callers run this
 * inside a transaction that also transitions the task status.
 */
export async function planTask(
  tx: Database,
  options: {
    taskId: string;
    actor: Actor;
    correlationId: string;
    /** Summaries of task files, never their contents. */
    fileSummaries?: string[];
  },
): Promise<PlanResult> {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, options.taskId)).limit(1);
  if (!task) throw notFound("Task");

  const input: PlanTaskInput = {
    taskId: task.id,
    title: task.title,
    rawRequest: task.rawRequest,
    budgetMinor: task.budgetMinor,
    currency: task.currency,
    ...(task.desiredDeadline ? { desiredDeadline: task.desiredDeadline.toISOString() } : {}),
    fileSummaries: options.fileSummaries ?? [],
  };

  const { plan, planSource, metadata } = await runPlanner(input);

  const [latest] = await tx
    .select({ version: workSpecifications.version })
    .from(workSpecifications)
    .where(eq(workSpecifications.taskId, task.id))
    .orderBy(desc(workSpecifications.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const workSpecificationId = newId("wspec");
  await tx.insert(workSpecifications).values({
    id: workSpecificationId,
    taskId: task.id,
    version,
    summary: plan.summary,
    planSource,
    // The full plan snapshot is stored so a contract can be compiled from it
    // later without re-running the planner (which might not be deterministic).
    plannerMetadata: {
      ...metadata,
      planSnapshot: {
        scopeIncluded: plan.scopeIncluded,
        scopeExcluded: plan.scopeExcluded,
        capabilityTags: plan.capabilityTags,
        acceptanceRules: plan.acceptanceRules,
        estimatedBudgetMinor: plan.estimatedBudgetMinor,
      },
    },
  });

  const requirementRows = plan.requirements.map((requirement) => ({
    id: newId("req"),
    workSpecificationId,
    taskId: task.id,
    key: requirement.key,
    statement: requirement.statement,
    source: "AI_PROPOSED" as const,
    requiresClarification: requirement.requiresClarification,
    acceptanceRelevant: requirement.acceptanceRelevant,
  }));
  if (requirementRows.length > 0) {
    await tx.insert(requirements).values(requirementRows);
  }

  const clarificationRows = plan.clarifications.map((clarification) => ({
    id: newId("clar"),
    taskId: task.id,
    workSpecificationId,
    question: clarification.question,
    requirementKey: clarification.requirementKey ?? null,
    status: "PENDING" as const,
  }));
  if (clarificationRows.length > 0) {
    await tx.insert(clarifications).values(clarificationRows);
  }

  await appendEvent(tx, {
    type: "WORK_SPEC_CREATED",
    aggregateId: workSpecificationId,
    taskId: task.id,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: task.id,
      workSpecificationId,
      version,
      requirementCount: requirementRows.length,
      proposedRequirementCount: requirementRows.filter((r) => r.source === "AI_PROPOSED").length,
      planSource,
    },
  });

  if (clarificationRows.length > 0) {
    await appendEvent(tx, {
      type: "CLARIFICATION_REQUESTED",
      aggregateId: workSpecificationId,
      taskId: task.id,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: task.id,
        clarificationIds: clarificationRows.map((c) => c.id),
        questions: clarificationRows.map((c) => c.question),
      },
    });
  }

  return {
    workSpecificationId,
    version,
    planSource,
    requirementCount: requirementRows.length,
    clarificationCount: clarificationRows.length,
    summary: plan.summary,
    plan,
  };
}

/** Load the latest work specification for a task with its requirements. */
export async function getLatestWorkSpecification(db: Database, taskId: string) {
  const [spec] = await db
    .select()
    .from(workSpecifications)
    .where(eq(workSpecifications.taskId, taskId))
    .orderBy(desc(workSpecifications.version))
    .limit(1);
  if (!spec) return null;
  const reqs = await db
    .select()
    .from(requirements)
    .where(eq(requirements.workSpecificationId, spec.id));
  const pendingClarifications = await db
    .select()
    .from(clarifications)
    .where(eq(clarifications.workSpecificationId, spec.id));
  return { specification: spec, requirements: reqs, clarifications: pendingClarifications };
}

/** Answer a pending clarification. */
export async function answerClarification(
  tx: Database,
  options: { clarificationId: string; answer: string; actor: Actor; correlationId: string },
) {
  const [updated] = await tx
    .update(clarifications)
    .set({
      answer: options.answer,
      status: "ANSWERED",
      answeredBy: options.actor.id,
      answeredAt: new Date(),
    })
    .where(eq(clarifications.id, options.clarificationId))
    .returning();
  if (!updated) throw notFound("Clarification");

  await appendEvent(tx, {
    type: "CLARIFICATION_ANSWERED",
    aggregateId: updated.workSpecificationId ?? updated.taskId,
    taskId: updated.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: { taskId: updated.taskId, clarificationId: updated.id },
  });
  return updated;
}

// The plan snapshot read contract lives with the contract compiler, in
// `contracts/plan-snapshot.ts`; the planner only persists the JSON.
