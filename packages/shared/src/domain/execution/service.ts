/**
 * Execution and submission service (Component 7).
 *
 * Once an agreement exists and payment is authorized, a provider is assigned.
 * The provider must explicitly accept the assignment (recording the exact
 * contract hash), then can start and submit work. Submissions are versioned and
 * bound to the contract hash they were produced against, so a resubmission after
 * a contract change is detectable.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  providerAcceptances,
  submissionArtifacts,
  workExecutions,
  workSubmissions,
} from "../../db/schema/execution.js";
import { availability } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { hashObject, sha256HexOfBytes } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import { conflict, notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { canTransition } from "../tasks/state.js";
import { transitionTask } from "../tasks/service.js";
import { getEnv } from "../../platform/env.js";
import { buildStorageKey, getObjectStorage } from "../../integrations/storage/index.js";

export async function assignExecution(
  tx: Database,
  options: {
    taskId: string;
    contractId: string;
    contractVersion: number;
    contractHash: string;
    agreementId: string;
    providerId: string;
  },
) {
  const [execution] = await tx
    .insert(workExecutions)
    .values({
      id: newId("exec"),
      taskId: options.taskId,
      contractId: options.contractId,
      agreementId: options.agreementId,
      providerId: options.providerId,
      status: "ASSIGNED",
      contractVersion: options.contractVersion,
      contractHash: options.contractHash,
    })
    .returning();
  if (!execution) throw new Error("Execution insert returned no row");
  return execution;
}

export async function acceptAssignment(
  tx: Database,
  options: { executionId: string; providerId: string; actor: Actor; correlationId: string },
) {
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, options.executionId))
    .limit(1);
  if (!execution) throw notFound("Execution");
  if (execution.providerId !== options.providerId) {
    throw conflict("Only the assigned provider may accept this work");
  }
  if (execution.status !== "ASSIGNED") {
    throw conflict(`Execution cannot be accepted from status ${execution.status}`);
  }

  await tx.insert(providerAcceptances).values({
    id: newId("paccept"),
    executionId: execution.id,
    providerId: options.providerId,
    acceptedContractHash: execution.contractHash,
  });

  const [updated] = await tx
    .update(workExecutions)
    .set({ status: "ACCEPTED" })
    .where(and(eq(workExecutions.id, execution.id), eq(workExecutions.status, "ASSIGNED")))
    .returning();
  if (!updated) throw conflict("Execution was updated concurrently");

  // Track the assignment against provider capacity.
  const [avail] = await tx
    .select()
    .from(availability)
    .where(eq(availability.providerId, options.providerId))
    .limit(1);
  if (avail) {
    await tx
      .update(availability)
      .set({ activeAssignments: avail.activeAssignments + 1, updatedAt: new Date() })
      .where(eq(availability.id, avail.id));
  }

  await appendEvent(tx, {
    type: "PROVIDER_ACCEPTED",
    aggregateId: execution.id,
    taskId: execution.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: execution.taskId,
      executionId: execution.id,
      contractId: execution.contractId,
      contractVersion: execution.contractVersion,
      providerId: options.providerId,
    },
  });

  return updated;
}

export async function startWork(
  tx: Database,
  options: { executionId: string; providerId: string; actor: Actor; correlationId: string },
) {
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, options.executionId))
    .limit(1);
  if (!execution) throw notFound("Execution");
  if (execution.providerId !== options.providerId) {
    throw conflict("Only the assigned provider may start this work");
  }
  if (!["ACCEPTED", "REVISION_REQUESTED"].includes(execution.status)) {
    throw conflict(`Execution cannot be started from status ${execution.status}`);
  }

  const [updated] = await tx
    .update(workExecutions)
    .set({ status: "IN_PROGRESS", startedAt: execution.startedAt ?? new Date() })
    .where(and(eq(workExecutions.id, execution.id), eq(workExecutions.status, execution.status)))
    .returning();
  if (!updated) throw conflict("Execution was updated concurrently");

  // After a revision request the task sits in REVISION_REQUIRED; resuming work
  // returns it to WORK_IN_PROGRESS (Component 11 state machine).
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, execution.taskId)).limit(1);
  if (task && canTransition(task.status, "WORK_IN_PROGRESS")) {
    await transitionTask(tx, {
      taskId: task.id,
      to: "WORK_IN_PROGRESS",
      actor: options.actor,
      correlationId: options.correlationId,
    });
  }

  await appendEvent(tx, {
    type: "WORK_STARTED",
    aggregateId: execution.id,
    taskId: execution.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: { taskId: execution.taskId, executionId: execution.id },
  });

  return updated;
}

export interface SubmissionArtifactInput {
  type: "PRIMARY_DELIVERABLE" | "SUPPORTING_FILE" | "EVIDENCE";
  filename: string;
  contentType?: string;
  /** Raw bytes; stored in object storage, only the hash and metadata in the DB. */
  bytes: Uint8Array;
}

/**
 * Create a submission draft with its artifacts. Artifacts are written to object
 * storage; the database keeps only metadata and content hashes.
 */
export async function createSubmission(
  tx: Database,
  options: {
    executionId: string;
    providerId: string;
    actor: Actor;
    correlationId: string;
    notes?: string;
    summary?: Record<string, unknown>;
    artifacts: SubmissionArtifactInput[];
  },
) {
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, options.executionId))
    .limit(1);
  if (!execution) throw notFound("Execution");
  if (execution.providerId !== options.providerId) {
    throw conflict("Only the assigned provider may submit this work");
  }
  if (!["ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(execution.status)) {
    throw conflict(`Execution is not open for submission (status ${execution.status})`);
  }

  const [latest] = await tx
    .select({ version: workSubmissions.version })
    .from(workSubmissions)
    .where(eq(workSubmissions.executionId, execution.id))
    .orderBy(desc(workSubmissions.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  const submissionId = newId("sub");
  const storage = getObjectStorage();

  const artifactRows = [];
  for (const artifact of options.artifacts) {
    const storageKey = buildStorageKey(
      `submissions/${execution.taskId}`,
      submissionId,
      artifact.filename,
    );
    await storage.put({
      key: storageKey,
      body: artifact.bytes,
      contentType: artifact.contentType ?? "application/octet-stream",
    });
    artifactRows.push({
      id: newId("sart"),
      submissionId,
      type: artifact.type,
      filename: artifact.filename,
      storageKey,
      contentType: artifact.contentType ?? "application/octet-stream",
      sizeBytes: artifact.bytes.byteLength,
      sha256: sha256HexOfBytes(artifact.bytes),
    });
  }

  const submissionHash = hashObject(
    artifactRows.map((a) => ({ type: a.type, filename: a.filename, sha256: a.sha256 })),
  );

  const [submission] = await tx
    .insert(workSubmissions)
    .values({
      id: submissionId,
      executionId: execution.id,
      taskId: execution.taskId,
      version,
      status: "DRAFT",
      contractVersion: execution.contractVersion,
      contractHash: execution.contractHash,
      submissionHash,
      notes: options.notes ?? null,
      summary: options.summary ?? null,
    })
    .returning();
  if (!submission) throw new Error("Submission insert returned no row");

  if (artifactRows.length > 0) {
    await tx.insert(submissionArtifacts).values(artifactRows);
  }

  await appendEvent(tx, {
    type: "SUBMISSION_CREATED",
    aggregateId: submission.id,
    taskId: execution.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: execution.taskId,
      executionId: execution.id,
      submissionId: submission.id,
      version,
    },
  });

  return submission;
}

/** Mark a submission as submitted and the execution as submitted. */
export async function submitWork(
  tx: Database,
  options: { submissionId: string; providerId: string; actor: Actor; correlationId: string },
) {
  const [submission] = await tx
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.id, options.submissionId))
    .limit(1);
  if (!submission) throw notFound("Submission");
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, submission.executionId))
    .limit(1);
  if (!execution) throw notFound("Execution");
  if (execution.providerId !== options.providerId) {
    throw conflict("Only the assigned provider may submit this work");
  }
  if (submission.status !== "DRAFT") {
    throw conflict(`Submission is already ${submission.status}`);
  }

  const now = new Date();
  const [updated] = await tx
    .update(workSubmissions)
    .set({ status: "SUBMITTED", submittedAt: now })
    .where(eq(workSubmissions.id, submission.id))
    .returning();
  if (!updated) throw conflict("Submission was updated concurrently");

  await tx
    .update(workExecutions)
    .set({ status: "SUBMITTED", submittedAt: now })
    .where(eq(workExecutions.id, execution.id));

  // A submitted deliverable moves the task to SUBMITTED, the state verification
  // reads. Covers both the first submission and a resubmission after a revision.
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, execution.taskId)).limit(1);
  if (task && canTransition(task.status, "SUBMITTED")) {
    await transitionTask(tx, {
      taskId: task.id,
      to: "SUBMITTED",
      actor: options.actor,
      correlationId: options.correlationId,
    });
  }

  await appendEvent(tx, {
    type: "SUBMISSION_SUBMITTED",
    aggregateId: submission.id,
    taskId: execution.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: execution.taskId,
      executionId: execution.id,
      submissionId: submission.id,
      contractId: execution.contractId,
      contractVersion: execution.contractVersion,
      contractHash: execution.contractHash,
      version: submission.version,
      isResubmission: submission.version > 1,
    },
  });

  return updated;
}

/** Mark a submission accepted and the execution completed after a PASS. */
export async function markSubmissionAccepted(
  tx: Database,
  options: { executionId: string; submissionId: string },
) {
  await tx
    .update(workExecutions)
    .set({ status: "COMPLETED", completedAt: new Date() })
    .where(eq(workExecutions.id, options.executionId));
  await tx
    .update(workSubmissions)
    .set({ status: "ACCEPTED" })
    .where(eq(workSubmissions.id, options.submissionId));
}

export async function requestRevision(
  tx: Database,
  options: {
    executionId: string;
    submissionId: string;
    actor: Actor;
    correlationId: string;
    reason: string;
  },
) {
  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, options.executionId))
    .limit(1);
  if (!execution) throw notFound("Execution");

  await tx
    .update(workExecutions)
    .set({ status: "REVISION_REQUESTED" })
    .where(eq(workExecutions.id, execution.id));
  await tx
    .update(workSubmissions)
    .set({ status: "REVISION_REQUESTED" })
    .where(eq(workSubmissions.id, options.submissionId));

  await appendEvent(tx, {
    type: "REVISION_REQUESTED",
    aggregateId: execution.id,
    taskId: execution.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: execution.taskId,
      executionId: execution.id,
      submissionId: options.submissionId,
      reason: options.reason,
    },
  });

  return execution;
}

export async function getExecutionForTask(db: Database, taskId: string) {
  const [execution] = await db
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.taskId, taskId))
    .limit(1);
  return execution ?? null;
}

export async function getLatestSubmission(db: Database, executionId: string) {
  const [submission] = await db
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.executionId, executionId))
    .orderBy(desc(workSubmissions.version))
    .limit(1);
  if (!submission) return null;
  const artifacts = await db
    .select()
    .from(submissionArtifacts)
    .where(eq(submissionArtifacts.submissionId, submission.id));
  return { submission, artifacts };
}

/** Read an artifact's bytes for verification. */
export async function readArtifactBytes(storageKey: string): Promise<Uint8Array> {
  return getObjectStorage().get(storageKey);
}

/** Expose env for callers that need the storage driver. */
export function storageDriver(): string {
  return getEnv().STORAGE_DRIVER;
}
