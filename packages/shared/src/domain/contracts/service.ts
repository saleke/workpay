/**
 * Contract service (Component 3).
 *
 * Drafts a contract from the latest work specification and, once the buyer
 * approves, freezes it as ACTIVE. The approval records the exact hash the buyer
 * saw, so a contract cannot be silently changed after approval.
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  acceptanceRules,
  approvals,
  contractRequirements,
  scopeItems,
  workContracts,
} from "../../db/schema/contracts.js";
import { requirements, tasks, workSpecifications } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { newId } from "../../platform/ids.js";
import { notFound, conflict } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { buildAcceptancePlan, compileContract, type AcceptanceRuleInput } from "./compiler.js";
import { extractPlanSnapshot } from "./plan-snapshot.js";
import { canTransition } from "../tasks/state.js";
import { transitionTask } from "../tasks/service.js";

export interface DraftContractOptions {
  taskId: string;
  actor: Actor;
  correlationId: string;
  /** Explicit work specification; defaults to the latest. */
  workSpecificationId?: string;
  deadline?: Date | null;
}

export async function draftContract(tx: Database, options: DraftContractOptions) {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, options.taskId)).limit(1);
  if (!task) throw notFound("Task");

  const spec = options.workSpecificationId
    ? (
        await tx
          .select()
          .from(workSpecifications)
          .where(eq(workSpecifications.id, options.workSpecificationId))
          .limit(1)
      )[0]
    : (
        await tx
          .select()
          .from(workSpecifications)
          .where(eq(workSpecifications.taskId, task.id))
          .orderBy(desc(workSpecifications.version))
          .limit(1)
      )[0];
  if (!spec) throw conflict("Cannot draft a contract before the task has been planned");

  const specRequirements = await tx
    .select()
    .from(requirements)
    .where(eq(requirements.workSpecificationId, spec.id));
  if (specRequirements.length === 0) {
    throw conflict("The work specification has no requirements");
  }

  const snapshot = extractPlanSnapshot(spec);
  const acceptanceRulesInput: AcceptanceRuleInput[] = snapshot.acceptanceRules.map((rule) => ({
    requirementKey: rule.requirementKey,
    method: rule.method,
    ...(rule.params ? { params: rule.params } : {}),
    ...(rule.instructions ? { instructions: rule.instructions } : {}),
  }));

  const compiled = compileContract({
    taskId: task.id,
    title: task.title,
    summary: spec.summary,
    requirements: specRequirements.map((r) => ({
      key: r.key,
      statement: r.statement,
      acceptanceRelevant: r.acceptanceRelevant,
    })),
    scopeIncluded: snapshot.scopeIncluded,
    scopeExcluded: snapshot.scopeExcluded,
    acceptanceRules: acceptanceRulesInput,
    budgetMinor: task.budgetMinor,
    currency: task.currency,
    deadline: options.deadline ? options.deadline.toISOString() : null,
  });

  const [latest] = await tx
    .select({ version: workContracts.version })
    .from(workContracts)
    .where(eq(workContracts.taskId, task.id))
    .orderBy(desc(workContracts.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const contractId = newId("contract");
  const [contract] = await tx
    .insert(workContracts)
    .values({
      id: contractId,
      taskId: task.id,
      version,
      status: "AWAITING_APPROVAL",
      title: compiled.frozen.title,
      summary: compiled.frozen.summary,
      contractHash: compiled.contractHash,
      budgetMinor: compiled.budget.amountMinor,
      currency: compiled.budget.currency,
      deadline: options.deadline ?? null,
      acceptancePlan: buildAcceptancePlan(acceptanceRulesInput),
    })
    .returning();
  if (!contract) throw new Error("Contract insert returned no row");

  await tx.insert(contractRequirements).values(
    compiled.frozen.requirements.map((r) => ({
      id: newId("creq"),
      contractId,
      key: r.key,
      statement: r.statement,
      acceptanceRelevant: r.acceptanceRelevant,
    })),
  );

  const scopeRows = [
    ...compiled.frozen.scopeIncluded.map((statement, i) => ({
      id: newId("scope"),
      contractId,
      type: "INCLUDED" as const,
      statement,
      position: i,
    })),
    ...compiled.frozen.scopeExcluded.map((statement, i) => ({
      id: newId("scope"),
      contractId,
      type: "EXCLUDED" as const,
      statement,
      position: i,
    })),
  ];
  if (scopeRows.length > 0) {
    await tx.insert(scopeItems).values(scopeRows);
  }

  if (compiled.frozen.acceptanceRules.length > 0) {
    await tx.insert(acceptanceRules).values(
      compiled.frozen.acceptanceRules.map((rule, i) => ({
        id: newId("accrule"),
        contractId,
        requirementKey: rule.requirementKey,
        method: rule.method,
        params: rule.params ?? null,
        instructions: rule.instructions ?? null,
        position: i,
      })),
    );
  }

  await appendEvent(tx, {
    type: "CONTRACT_CREATED",
    aggregateId: contractId,
    taskId: task.id,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: task.id,
      contractId,
      contractVersion: version,
      contractHash: compiled.contractHash,
      budgetMinor: compiled.budget.amountMinor,
      currency: compiled.budget.currency,
    },
  });

  return contract;
}

/** Approve a contract, freezing it as ACTIVE. */
export async function approveContract(
  tx: Database,
  options: {
    contractId: string;
    actor: Actor;
    correlationId: string;
    /** Optional expected hash; when provided it must match exactly. */
    expectedHash?: string;
  },
) {
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, options.contractId))
    .for("update")
    .limit(1);
  if (!contract) throw notFound("Contract");
  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, contract.taskId))
    .limit(1);
  if (!task || options.actor.kind !== "USER" || options.actor.id !== task.userId) {
    throw notFound("Contract");
  }
  if (contract.status !== "AWAITING_APPROVAL") {
    throw conflict(`Contract cannot be approved from status ${contract.status}`);
  }
  if (options.expectedHash && options.expectedHash !== contract.contractHash) {
    throw conflict("The contract has changed since it was reviewed; re-approval is required", {
      expectedHash: options.expectedHash,
      actualHash: contract.contractHash,
    });
  }

  await tx.insert(approvals).values({
    id: newId("approval"),
    contractId: contract.id,
    approvedBy: options.actor.id as string,
    contractHash: contract.contractHash,
  });

  const [updated] = await tx
    .update(workContracts)
    .set({
      status: "ACTIVE",
      approvedBy: options.actor.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workContracts.id, contract.id))
    .returning();
  if (!updated) throw new Error("Contract update returned no row");

  // Approving the contract is the buyer's decision that unlocks provider search;
  // advance the task so the next agent step has an APPROVED task to act on.
  if (canTransition(task.status, "APPROVED")) {
    await transitionTask(tx, {
      taskId: task.id,
      to: "APPROVED",
      actor: options.actor,
      correlationId: options.correlationId,
    });
  }

  await appendEvent(tx, {
    type: "CONTRACT_APPROVED",
    aggregateId: contract.id,
    taskId: contract.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: contract.taskId,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      approvedBy: options.actor.id as string,
    },
  });

  return updated;
}

export async function getContractWithDetails(db: Database, contractId: string) {
  const [contract] = await db
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, contractId))
    .limit(1);
  if (!contract) return null;
  const [reqs, scope, rules] = await Promise.all([
    db.select().from(contractRequirements).where(eq(contractRequirements.contractId, contractId)),
    db.select().from(scopeItems).where(eq(scopeItems.contractId, contractId)),
    db.select().from(acceptanceRules).where(eq(acceptanceRules.contractId, contractId)),
  ]);
  return { contract, requirements: reqs, scope, acceptanceRules: rules };
}

export async function getActiveContractForTask(db: Database, taskId: string) {
  const [contract] = await db
    .select()
    .from(workContracts)
    .where(eq(workContracts.taskId, taskId))
    .orderBy(desc(workContracts.version))
    .limit(1);
  return contract ?? null;
}
