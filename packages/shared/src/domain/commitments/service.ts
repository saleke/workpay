import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { taskConversationMessages, taskConversations } from "../../db/schema/conversations.js";
import { workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { users } from "../../db/schema/identity.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { availability, providers, providerSelections } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import { workCommitments } from "../../db/schema/work-commitments.js";
import { appendEvent } from "../../events/outbox.js";
import { authorizationError, conflict, notFound } from "../../platform/errors.js";
import { getEnv } from "../../platform/env.js";
import { hashObject } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import type { Actor } from "../identity/authorize.js";
import { canUseProfessionalProfile } from "../identity/account-class.js";
import { toEventActor } from "../context.js";
import { transitionTask } from "../tasks/service.js";
import type { ConversationContractSnapshot } from "../conversations/service.js";

const OPEN_COMMITMENT_STATUSES = ["AWAITING_PROVIDER", "AWAITING_CLIENT"] as const;

function assertUserActor(actor: Actor, userId: string, message: string): void {
  if ((actor.kind !== "USER" && actor.kind !== "PROVIDER") || actor.id !== userId) {
    throw authorizationError(message);
  }
}

function readSnapshot(value: unknown): ConversationContractSnapshot {
  if (!value || typeof value !== "object") throw conflict("The work terms snapshot is invalid.");
  const snapshot = value as ConversationContractSnapshot;
  if (
    !snapshot.id ||
    !Number.isSafeInteger(snapshot.version) ||
    !snapshot.hash ||
    !snapshot.title ||
    !Array.isArray(snapshot.requirements) ||
    !snapshot.budget
  ) {
    throw conflict("The work terms snapshot is incomplete.");
  }
  return snapshot;
}

async function assertCompatibleParticipants(
  tx: Database,
  commitment: typeof workCommitments.$inferSelect,
): Promise<void> {
  const participantRows = await tx
    .select({ id: users.id, accountClass: users.accountClass })
    .from(users)
    .where(inArray(users.id, [commitment.buyerUserId, commitment.providerUserId]));
  const classes = new Map(participantRows.map((user) => [user.id, user.accountClass]));
  if (
    participantRows.length !== 2 ||
    !canUseProfessionalProfile({
      buyerClass: classes.get(commitment.buyerUserId) ?? "UNCLASSIFIED",
      providerClass: classes.get(commitment.providerUserId) ?? "UNCLASSIFIED",
      evaluationMode: getEnv().EVALUATION_MODE,
    })
  ) {
    throw conflict("This professional is no longer eligible for this account environment.");
  }
}

async function appendCommitmentMessage(
  tx: Database,
  input: { conversationId: string; authorUserId: string; body: string },
): Promise<void> {
  const [updated] = await tx
    .update(taskConversations)
    .set({ messageCounter: sql`${taskConversations.messageCounter} + 1`, updatedAt: new Date() })
    .where(
      and(eq(taskConversations.id, input.conversationId), eq(taskConversations.status, "OPEN")),
    )
    .returning({ messageCounter: taskConversations.messageCounter });
  if (!updated) return;
  await tx.insert(taskConversationMessages).values({
    id: newId("msg"),
    conversationId: input.conversationId,
    sequence: updated.messageCounter,
    clientMessageId: newId("cmsg"),
    authorUserId: input.authorUserId,
    body: input.body,
  });
}

async function lockCurrentCommitmentContext(tx: Database, commitmentId: string) {
  const [initial] = await tx
    .select({ taskId: workCommitments.taskId })
    .from(workCommitments)
    .where(eq(workCommitments.id, commitmentId))
    .limit(1);
  if (!initial) throw notFound("Work proposal");
  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, initial.taskId))
    .for("update")
    .limit(1);
  if (!task) throw notFound("Task");
  const [commitment] = await tx
    .select()
    .from(workCommitments)
    .where(eq(workCommitments.id, commitmentId))
    .for("update")
    .limit(1);
  if (!commitment) throw notFound("Work proposal");
  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, commitment.conversationId))
    .for("update")
    .limit(1);
  if (!conversation) throw notFound("Conversation");
  return { task, commitment, conversation };
}

async function requireCurrentTerms(tx: Database, commitment: typeof workCommitments.$inferSelect) {
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(
      and(
        eq(workContracts.id, commitment.contractId),
        eq(workContracts.taskId, commitment.taskId),
        eq(workContracts.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (
    !contract ||
    contract.version !== commitment.contractVersion ||
    contract.contractHash !== commitment.contractHash
  ) {
    throw conflict("The work terms changed. Send a new proposal for the current agreement.");
  }
  return contract;
}

export async function proposeWorkCommitment(
  tx: Database,
  input: {
    conversationId: string;
    buyerUserId: string;
    amountMinor: number;
    currency: "USD";
    deliveryDeadline: Date | null;
    actor: Actor;
    correlationId: string;
  },
) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
    throw conflict("Compensation must be a non-negative amount in whole cents.");
  }
  const [initialConversation] = await tx
    .select({ taskId: taskConversations.taskId })
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (!initialConversation) throw notFound("Conversation");
  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, initialConversation.taskId))
    .for("update")
    .limit(1);
  if (!task || task.userId !== input.buyerUserId) throw notFound("Conversation");
  assertUserActor(input.actor, task.userId, "Only the client can send a work proposal.");
  if (!["PROVIDER_SEARCH", "NEGOTIATION"].includes(task.status)) {
    throw conflict("Work proposals are unavailable in the task's current stage.");
  }
  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .for("update")
    .limit(1);
  if (!conversation || conversation.buyerUserId !== task.userId) throw notFound("Conversation");
  if (conversation.status !== "OPEN") {
    throw conflict("Start a discussion with this professional before proposing work.");
  }
  const [existingAgreement] = await tx
    .select({ id: commercialAgreements.id })
    .from(commercialAgreements)
    .where(eq(commercialAgreements.taskId, task.id))
    .limit(1);
  if (existingAgreement) throw conflict("This task already has a confirmed professional.");
  const [existing] = await tx
    .select()
    .from(workCommitments)
    .where(
      and(
        eq(workCommitments.conversationId, conversation.id),
        inArray(workCommitments.status, ["AWAITING_PROVIDER", "AWAITING_CLIENT", "CONFIRMED"]),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const snapshot = readSnapshot(conversation.currentContractSnapshot);
  const [currentContract] = await tx
    .select()
    .from(workContracts)
    .where(
      and(
        eq(workContracts.id, snapshot.id),
        eq(workContracts.taskId, task.id),
        eq(workContracts.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (
    !currentContract ||
    currentContract.version !== conversation.currentContractVersion ||
    currentContract.contractHash !== conversation.currentContractHash ||
    snapshot.version !== currentContract.version ||
    snapshot.hash !== currentContract.contractHash
  ) {
    throw conflict("Review the current approved terms before proposing work.");
  }
  if (
    input.currency !== currentContract.currency ||
    input.amountMinor > currentContract.budgetMinor
  ) {
    throw conflict("The proposed compensation must stay within the approved client budget.");
  }
  const deadline = input.deliveryDeadline ?? currentContract.deadline;
  if (deadline && deadline <= new Date())
    throw conflict("The proposed deadline must be in the future.");

  const [[provider], [providerUser], [providerAvailability]] = await Promise.all([
    tx.select().from(providers).where(eq(providers.id, conversation.providerId)).limit(1),
    tx.select().from(users).where(eq(users.id, conversation.providerUserId)).limit(1),
    tx
      .select()
      .from(availability)
      .where(eq(availability.providerId, conversation.providerId))
      .limit(1),
  ]);
  const [buyer] = await tx.select().from(users).where(eq(users.id, task.userId)).limit(1);
  if (
    !provider ||
    provider.status !== "ACTIVE" ||
    !providerUser ||
    !buyer ||
    provider.userId !== providerUser.id ||
    !canUseProfessionalProfile({
      buyerClass: buyer.accountClass,
      providerClass: providerUser.accountClass,
      evaluationMode: getEnv().EVALUATION_MODE,
    }) ||
    !providerAvailability?.available ||
    providerAvailability.activeAssignments >= providerAvailability.capacity
  ) {
    throw conflict("This professional is no longer eligible to receive a work proposal.");
  }
  const preferences =
    provider.workPreferences && typeof provider.workPreferences === "object"
      ? (provider.workPreferences as Record<string, unknown>)
      : null;
  const minimum = preferences?.minCompensationMinor;
  if (typeof minimum === "number" && input.amountMinor < minimum) {
    throw conflict("The proposed compensation is below this professional's stated minimum.");
  }

  const termsSnapshot: ConversationContractSnapshot = {
    ...snapshot,
    agreedPrice: { amountMinor: input.amountMinor, currency: input.currency },
    deadline: deadline?.toISOString() ?? null,
  };
  const commitmentId = newId("wcommit");
  const termsHash = hashObject({
    commitmentId,
    taskId: task.id,
    conversationId: conversation.id,
    contractId: currentContract.id,
    contractVersion: currentContract.version,
    contractHash: currentContract.contractHash,
    buyerUserId: task.userId,
    providerId: provider.id,
    providerUserId: providerUser.id,
    amountMinor: input.amountMinor,
    currency: input.currency,
    deliveryDeadline: deadline?.toISOString() ?? null,
    termsSnapshot,
  });
  const [commitment] = await tx
    .insert(workCommitments)
    .values({
      id: commitmentId,
      taskId: task.id,
      conversationId: conversation.id,
      contractId: currentContract.id,
      contractVersion: currentContract.version,
      contractHash: currentContract.contractHash,
      buyerUserId: task.userId,
      providerId: provider.id,
      providerUserId: providerUser.id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      deliveryDeadline: deadline,
      termsSnapshot,
      termsHash,
      status: "AWAITING_PROVIDER",
    })
    .returning();
  if (!commitment) throw new Error("Work proposal insert returned no row.");
  await appendCommitmentMessage(tx, {
    conversationId: conversation.id,
    authorUserId: task.userId,
    body: `Work proposal sent for ${formatMinor(input.amountMinor, input.currency)}. Review the exact scope and deadline in Work context before responding.`,
  });
  await appendEvent(tx, {
    type: "WORK_COMMITMENT_PROPOSED",
    aggregateId: commitment.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      conversationId: conversation.id,
      commitmentId: commitment.id,
      providerUserId: providerUser.id,
      amount: { amountMinor: commitment.amountMinor, currency: commitment.currency },
      contractVersion: commitment.contractVersion,
    },
  });
  return commitment;
}

export async function respondToWorkCommitment(
  tx: Database,
  input: {
    commitmentId: string;
    providerUserId: string;
    response: "ACCEPT" | "DECLINE";
    note?: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const { task, commitment, conversation } = await lockCurrentCommitmentContext(
    tx,
    input.commitmentId,
  );
  if (commitment.providerUserId !== input.providerUserId) throw notFound("Work proposal");
  assertUserActor(input.actor, input.providerUserId, "Only the proposed professional may respond.");
  if (
    (input.response === "ACCEPT" && commitment.status === "AWAITING_CLIENT") ||
    (input.response === "DECLINE" && commitment.status === "PROVIDER_DECLINED")
  ) {
    return commitment;
  }
  const canRespond =
    input.response === "ACCEPT"
      ? commitment.status === "AWAITING_PROVIDER"
      : commitment.status === "AWAITING_PROVIDER" || commitment.status === "AWAITING_CLIENT";
  if (!canRespond || conversation.status !== "OPEN") {
    throw conflict("This work proposal is no longer awaiting your response.");
  }
  await requireCurrentTerms(tx, commitment);
  if (input.response === "ACCEPT") await assertCompatibleParticipants(tx, commitment);
  const [providerAvailability] = await tx
    .select()
    .from(availability)
    .where(eq(availability.providerId, commitment.providerId))
    .for("update")
    .limit(1);
  if (
    input.response === "ACCEPT" &&
    (!providerAvailability?.available ||
      providerAvailability.activeAssignments >= providerAvailability.capacity)
  ) {
    throw conflict("Your current Work Studio capacity is full.");
  }
  const nextStatus = input.response === "ACCEPT" ? "AWAITING_CLIENT" : "PROVIDER_DECLINED";
  const now = new Date();
  const [updated] = await tx
    .update(workCommitments)
    .set({
      status: nextStatus,
      providerResponseNote: input.note?.trim() || null,
      providerRespondedAt: now,
      closedAt: input.response === "DECLINE" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(workCommitments.id, commitment.id),
        input.response === "ACCEPT"
          ? eq(workCommitments.status, "AWAITING_PROVIDER")
          : inArray(workCommitments.status, ["AWAITING_PROVIDER", "AWAITING_CLIENT"]),
      ),
    )
    .returning();
  if (!updated) throw conflict("This work proposal changed while you were responding.");
  await appendCommitmentMessage(tx, {
    conversationId: conversation.id,
    authorUserId: commitment.providerUserId,
    body:
      input.response === "ACCEPT"
        ? "I accept the proposed scope, compensation, and deadline. Client confirmation is still required before this becomes our work commitment."
        : `${
            commitment.status === "AWAITING_CLIENT"
              ? "I am withdrawing my acceptance of this work proposal."
              : "I am declining this work proposal."
          }${input.note?.trim() ? `\n\n${input.note.trim()}` : ""}`,
  });
  await appendEvent(tx, {
    type: "WORK_COMMITMENT_PROVIDER_RESPONDED",
    aggregateId: commitment.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      conversationId: conversation.id,
      commitmentId: commitment.id,
      buyerUserId: commitment.buyerUserId,
      response: input.response === "ACCEPT" ? "ACCEPTED" : "DECLINED",
    },
  });
  return updated;
}

export async function withdrawWorkCommitment(
  tx: Database,
  input: { commitmentId: string; buyerUserId: string; actor: Actor; correlationId: string },
) {
  const { task, commitment, conversation } = await lockCurrentCommitmentContext(
    tx,
    input.commitmentId,
  );
  if (commitment.buyerUserId !== input.buyerUserId) throw notFound("Work proposal");
  assertUserActor(input.actor, input.buyerUserId, "Only the client can withdraw this proposal.");
  if (commitment.status === "BUYER_WITHDRAWN") return commitment;
  if (
    commitment.status !== OPEN_COMMITMENT_STATUSES[0] &&
    commitment.status !== OPEN_COMMITMENT_STATUSES[1]
  ) {
    throw conflict("This work proposal can no longer be withdrawn.");
  }
  const now = new Date();
  const [updated] = await tx
    .update(workCommitments)
    .set({ status: "BUYER_WITHDRAWN", closedAt: now, updatedAt: now })
    .where(
      and(
        eq(workCommitments.id, commitment.id),
        inArray(workCommitments.status, ["AWAITING_PROVIDER", "AWAITING_CLIENT"]),
      ),
    )
    .returning();
  if (!updated) throw conflict("This work proposal changed while it was being withdrawn.");
  await appendCommitmentMessage(tx, {
    conversationId: conversation.id,
    authorUserId: commitment.buyerUserId,
    body: "I withdrew this work proposal. Our conversation remains open, but neither of us is committed to the work.",
  });
  await appendEvent(tx, {
    type: "WORK_COMMITMENT_CLOSED",
    aggregateId: commitment.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      conversationId: conversation.id,
      commitmentId: commitment.id,
      providerUserId: commitment.providerUserId,
      reason: "BUYER_WITHDREW",
    },
  });
  return updated;
}

export async function confirmWorkCommitment(
  tx: Database,
  input: { commitmentId: string; buyerUserId: string; actor: Actor; correlationId: string },
) {
  const { task, commitment, conversation } = await lockCurrentCommitmentContext(
    tx,
    input.commitmentId,
  );
  if (commitment.buyerUserId !== input.buyerUserId || task.userId !== input.buyerUserId) {
    throw notFound("Work proposal");
  }
  assertUserActor(input.actor, input.buyerUserId, "Only the client can confirm the professional.");
  if (commitment.status === "CONFIRMED") {
    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.workCommitmentId, commitment.id))
      .limit(1);
    if (!agreement) throw conflict("The confirmed commitment is missing its agreement.");
    return { commitment, agreement };
  }
  if (commitment.status !== "AWAITING_CLIENT" || conversation.status !== "OPEN") {
    throw conflict("The professional must accept the current proposal before you confirm them.");
  }
  const contract = await requireCurrentTerms(tx, commitment);
  await assertCompatibleParticipants(tx, commitment);
  if (!["PROVIDER_SEARCH", "NEGOTIATION"].includes(task.status)) {
    throw conflict("This task can no longer confirm a professional.");
  }
  const [existingAgreement] = await tx
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.taskId, task.id))
    .limit(1);
  if (existingAgreement) throw conflict("A professional is already confirmed for this task.");
  const [providerAvailability] = await tx
    .select()
    .from(availability)
    .where(eq(availability.providerId, commitment.providerId))
    .for("update")
    .limit(1);
  if (
    !providerAvailability?.available ||
    providerAvailability.activeAssignments >= providerAvailability.capacity
  ) {
    throw conflict(
      "The professional is no longer available. Keep the conversation open and choose another proposal.",
    );
  }

  const now = new Date();
  const [confirmed] = await tx
    .update(workCommitments)
    .set({
      status: "CONFIRMED",
      buyerConfirmedAt: now,
      capacityReservedAt: now,
      closedAt: null,
      updatedAt: now,
    })
    .where(
      and(eq(workCommitments.id, commitment.id), eq(workCommitments.status, "AWAITING_CLIENT")),
    )
    .returning();
  if (!confirmed) throw conflict("This work proposal changed while it was being confirmed.");
  await tx
    .update(availability)
    .set({
      activeAssignments: providerAvailability.activeAssignments + 1,
      updatedAt: now,
    })
    .where(eq(availability.id, providerAvailability.id));

  const agreementId = newId("agreement");
  const agreementHash = hashObject({
    agreementId,
    workCommitmentId: confirmed.id,
    termsHash: confirmed.termsHash,
    taskId: task.id,
    contractId: contract.id,
    contractVersion: contract.version,
    contractHash: contract.contractHash,
    providerId: confirmed.providerId,
    agreedPriceMinor: confirmed.amountMinor,
    currency: confirmed.currency,
    deliveryDeadline: confirmed.deliveryDeadline?.toISOString() ?? null,
    paymentTerms: "FULL_ON_ACCEPTANCE",
  });
  const [agreement] = await tx
    .insert(commercialAgreements)
    .values({
      id: agreementId,
      taskId: task.id,
      contractId: contract.id,
      sourceConversationId: conversation.id,
      workCommitmentId: confirmed.id,
      providerId: confirmed.providerId,
      contractVersion: contract.version,
      status: "PENDING_AUTHORIZATION",
      agreedPriceMinor: confirmed.amountMinor,
      currency: confirmed.currency,
      deliveryDeadline: confirmed.deliveryDeadline,
      paymentTerms: "FULL_ON_ACCEPTANCE",
      agreementHash,
    })
    .returning();
  if (!agreement) throw new Error("Commercial agreement insert returned no row.");

  const competing = await tx
    .select()
    .from(workCommitments)
    .where(
      and(
        eq(workCommitments.taskId, task.id),
        ne(workCommitments.id, confirmed.id),
        inArray(workCommitments.status, ["AWAITING_PROVIDER", "AWAITING_CLIENT"]),
      ),
    )
    .for("update");
  if (competing.length > 0) {
    await tx
      .update(workCommitments)
      .set({ status: "NOT_SELECTED", closedAt: now, updatedAt: now })
      .where(
        inArray(
          workCommitments.id,
          competing.map((item) => item.id),
        ),
      );
  }

  const otherConversations = await tx
    .select()
    .from(taskConversations)
    .where(
      and(
        eq(taskConversations.taskId, task.id),
        ne(taskConversations.id, conversation.id),
        inArray(taskConversations.status, ["CONTACT_PENDING", "OPEN"]),
      ),
    )
    .for("update");
  for (const other of otherConversations) {
    if (other.status === "OPEN") {
      await appendCommitmentMessage(tx, {
        conversationId: other.id,
        authorUserId: task.userId,
        body: "I confirmed another professional for this work. No work commitment was created in this conversation.",
      });
    }
    await tx
      .update(taskConversations)
      .set({ status: "CLOSED", closedAt: now, updatedAt: now })
      .where(eq(taskConversations.id, other.id));
  }

  const snapshot = readSnapshot(conversation.currentContractSnapshot);
  await tx
    .update(taskConversations)
    .set({
      currentContractSnapshot: {
        ...snapshot,
        agreedPrice: { amountMinor: confirmed.amountMinor, currency: confirmed.currency },
        deadline: confirmed.deliveryDeadline?.toISOString() ?? null,
      },
      updatedAt: now,
    })
    .where(eq(taskConversations.id, conversation.id));
  await appendCommitmentMessage(tx, {
    conversationId: conversation.id,
    authorUserId: task.userId,
    body: "I confirm you as the professional for this work. Our exact proposal is now the active work commitment; payment authorization remains a separate next step.",
  });

  const [selection] = await tx
    .select()
    .from(providerSelections)
    .where(eq(providerSelections.taskId, task.id))
    .orderBy(desc(providerSelections.createdAt))
    .limit(1);
  if (selection && selection.contractId === contract.id) {
    await tx
      .update(providerSelections)
      .set({ providerId: confirmed.providerId, status: "SELECTED" })
      .where(eq(providerSelections.id, selection.id));
  }
  await transitionTask(tx, {
    taskId: task.id,
    to: "AGREEMENT_READY",
    actor: input.actor,
    correlationId: input.correlationId,
  });

  await appendEvent(tx, {
    type: "COMMERCIAL_AGREEMENT_CREATED",
    aggregateId: agreement.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      agreementId: agreement.id,
      contractId: contract.id,
      contractVersion: contract.version,
      providerId: confirmed.providerId,
      agreementHash,
      agreedPrice: { amountMinor: confirmed.amountMinor, currency: confirmed.currency },
    },
  });
  await appendEvent(tx, {
    type: "WORK_COMMITMENT_CONFIRMED",
    aggregateId: confirmed.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      conversationId: conversation.id,
      commitmentId: confirmed.id,
      agreementId: agreement.id,
      providerId: confirmed.providerId,
      providerUserId: confirmed.providerUserId,
      amount: { amountMinor: confirmed.amountMinor, currency: confirmed.currency },
    },
  });
  for (const item of competing) {
    await appendEvent(tx, {
      type: "WORK_COMMITMENT_CLOSED",
      aggregateId: item.id,
      taskId: task.id,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: task.id,
        conversationId: item.conversationId,
        commitmentId: item.id,
        providerUserId: item.providerUserId,
        reason: "ANOTHER_PROFESSIONAL_CONFIRMED",
      },
    });
  }
  return { commitment: confirmed, agreement };
}

export async function getConversationWorkCommitment(
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
    (conversation.buyerUserId !== input.userId && conversation.providerUserId !== input.userId)
  ) {
    throw notFound("Conversation");
  }
  const [commitment] = await db
    .select()
    .from(workCommitments)
    .where(eq(workCommitments.conversationId, conversation.id))
    .orderBy(desc(workCommitments.createdAt))
    .limit(1);
  return commitment ?? null;
}

export async function listProviderWorkCommitments(db: Database, providerUserId: string) {
  return db
    .select({
      commitment: workCommitments,
      taskTitle: tasks.title,
      taskRequest: tasks.rawRequest,
      buyerName: users.displayName,
      buyerFallbackName: users.name,
      providerDisplayName: providers.displayName,
      executionId: workExecutions.id,
    })
    .from(workCommitments)
    .innerJoin(tasks, eq(workCommitments.taskId, tasks.id))
    .innerJoin(users, eq(workCommitments.buyerUserId, users.id))
    .innerJoin(providers, eq(workCommitments.providerId, providers.id))
    .leftJoin(
      workExecutions,
      and(
        eq(workExecutions.taskId, workCommitments.taskId),
        eq(workExecutions.providerId, workCommitments.providerId),
      ),
    )
    .where(eq(workCommitments.providerUserId, providerUserId))
    .orderBy(desc(workCommitments.updatedAt))
    .limit(100);
}

function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}
