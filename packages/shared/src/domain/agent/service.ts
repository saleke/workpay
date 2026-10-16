/**
 * Agent run bookkeeping (Component 11).
 *
 * The agent's value is that its reasoning is inspectable. Every proposed action
 * is written down with its authority decision and outcome, so the decision trail
 * can be reconstructed long after the run.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { agentActions, agentRuns } from "../../db/schema/agent.js";
import { appendEvent } from "../../events/outbox.js";
import { newId } from "../../platform/ids.js";
import { notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { AGENT_AUTHORITY_VERSION, type AgentActionType } from "./authority.js";

/** Start (or fetch) the single agent run for a task. One run per task. */
export async function startAgentRun(
  tx: Database,
  options: { taskId: string; goal: string; actor: Actor; maxSteps?: number },
) {
  const [existing] = await tx
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.taskId, options.taskId))
    .limit(1);
  if (existing) return existing;

  const [run] = await tx
    .insert(agentRuns)
    .values({
      id: newId("arun"),
      taskId: options.taskId,
      status: "RUNNING",
      goal: options.goal,
      phase: "INIT",
      maxSteps: options.maxSteps ?? 40,
      authorityVersion: AGENT_AUTHORITY_VERSION,
    })
    .returning();
  if (!run) throw new Error("Agent run insert returned no row");
  return run;
}

export interface RecordActionResult {
  actionId: string;
  sequence: number;
}

/** Append an action record to a run. */
export async function recordAgentAction(
  tx: Database,
  options: {
    agentRunId: string;
    taskId: string;
    actionType: AgentActionType;
    status: "PROPOSED" | "VALIDATING" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
    proposal?: Record<string, unknown>;
    authorityAllowed?: boolean;
    authorityReason?: string;
    result?: Record<string, unknown>;
    reasonCode?: string;
    actor: Actor;
    correlationId: string;
  },
): Promise<RecordActionResult> {
  const [run] = await tx
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, options.agentRunId))
    .limit(1);
  if (!run) throw notFound("Agent run");

  const [latest] = await tx
    .select({ sequence: agentActions.sequence })
    .from(agentActions)
    .where(eq(agentActions.agentRunId, options.agentRunId))
    .orderBy(desc(agentActions.sequence))
    .limit(1);
  const sequence = (latest?.sequence ?? 0) + 1;

  const actionId = newId("act");
  await tx.insert(agentActions).values({
    id: actionId,
    agentRunId: options.agentRunId,
    taskId: options.taskId,
    sequence,
    actionType: options.actionType,
    status: options.status,
    proposal: options.proposal ?? null,
    authorityAllowed: options.authorityAllowed ?? null,
    authorityReason: options.authorityReason ?? null,
    result: options.result ?? null,
    reasonCode: options.reasonCode ?? null,
    executedAt: options.status === "EXECUTED" ? new Date() : null,
  });

  await tx
    .update(agentRuns)
    .set({ stepCount: run.stepCount + 1, phase: options.actionType })
    .where(eq(agentRuns.id, options.agentRunId));

  if (options.authorityAllowed === false) {
    await appendEvent(tx, {
      type: "AGENT_AUTHORITY_DENIED",
      aggregateId: options.agentRunId,
      taskId: options.taskId,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: options.taskId,
        agentRunId: options.agentRunId,
        actionType: options.actionType,
        reason: options.authorityReason ?? options.reasonCode ?? "denied",
      },
    });
  } else {
    await appendEvent(tx, {
      type: "AGENT_ACTION_RECORDED",
      aggregateId: options.agentRunId,
      taskId: options.taskId,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: options.taskId,
        agentRunId: options.agentRunId,
        actionId,
        actionType: options.actionType,
        status: options.status,
        ...(options.reasonCode ? { reasonCode: options.reasonCode } : {}),
      },
    });
  }

  return { actionId, sequence };
}

export async function setAgentRunStatus(
  tx: Database,
  options: {
    agentRunId: string;
    status: "RUNNING" | "WAITING" | "PAUSED" | "COMPLETED" | "FAILED";
    phase?: string;
    lastError?: string;
  },
) {
  const [updated] = await tx
    .update(agentRuns)
    .set({
      status: options.status,
      ...(options.phase ? { phase: options.phase } : {}),
      ...(options.lastError ? { lastError: options.lastError } : {}),
      ...(options.status === "COMPLETED" || options.status === "FAILED"
        ? { finishedAt: new Date() }
        : {}),
    })
    .where(eq(agentRuns.id, options.agentRunId))
    .returning();
  if (!updated) throw notFound("Agent run");
  return updated;
}

export async function getAgentRunForTask(db: Database, taskId: string) {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.taskId, taskId)).limit(1);
  if (!run) return null;
  const actions = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.agentRunId, run.id))
    .orderBy(agentActions.sequence);
  return { run, actions };
}
