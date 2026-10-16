/**
 * Task service (Component 1).
 *
 * The task is the root business entity. This service owns creating tasks,
 * reading them with the data the UI needs, and moving them through the status
 * machine. Every mutation writes its event in the same transaction.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money, type Money } from "../../platform/money.js";
import { notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { assertTransition, type TaskStatus } from "./state.js";

export interface CreateTaskInput {
  actor: Actor;
  title: string;
  rawRequest: string;
  budget: Money;
  desiredDeadline?: Date | null;
  correlationId?: string;
}

export async function createTask(tx: Database, input: CreateTaskInput) {
  const taskId = newId("task");
  const correlationId = input.correlationId ?? newCorrelationId();

  const [task] = await tx
    .insert(tasks)
    .values({
      id: taskId,
      userId: input.actor.id as string,
      title: input.title,
      rawRequest: input.rawRequest,
      status: "CREATED",
      budgetMinor: input.budget.amountMinor,
      currency: input.budget.currency,
      desiredDeadline: input.desiredDeadline ?? null,
    })
    .returning();
  if (!task) throw new Error("Task insert returned no row");

  await appendEvent(tx, {
    type: "TASK_CREATED",
    aggregateId: taskId,
    taskId,
    actor: toEventActor(input.actor),
    correlationId,
    payload: { taskId, userId: input.actor.id as string, source: "BUYER" },
  });

  return { task, correlationId };
}

export async function getTaskById(db: Database, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return task ?? null;
}

export async function listTasksForUser(db: Database, userId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt))
    .limit(100);
}

/** Read the budget as a Money value, validated. */
export function taskBudget(task: { budgetMinor: number; currency: string }): Money {
  return money(task.budgetMinor, task.currency as Money["currency"]);
}

/**
 * Move a task to a new status, enforcing the state machine and emitting an
 * event. Returns the updated task.
 */
export async function transitionTask(
  tx: Database,
  options: {
    taskId: string;
    to: TaskStatus;
    actor: Actor;
    correlationId: string;
    patch?: Partial<{
      completedAt: Date | null;
      cancelledAt: Date | null;
      plannerSource: string | null;
    }>;
  },
) {
  const { taskId, to } = options;
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw notFound("Task");
  assertTransition(task.status, to);

  const [updated] = await tx
    .update(tasks)
    .set({ status: to, updatedAt: new Date(), ...options.patch })
    .where(eq(tasks.id, taskId))
    .returning();
  if (!updated) throw new Error("Task update returned no row");

  await appendEvent(tx, {
    type: "TASK_STATUS_CHANGED",
    aggregateId: taskId,
    taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: { taskId, from: task.status, to },
  });

  return updated;
}
