import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { taskConversationMessages, taskConversations } from "../../db/schema/conversations.js";
import {
  workContracts,
  contractRequirements,
  scopeItems,
  acceptanceRules,
} from "../../db/schema/contracts.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { availability, providers, providerSelections } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { conflict, notFound } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";

export interface ConversationContractSnapshot {
  id: string;
  version: number;
  hash: string;
  title: string;
  summary: string;
  requirements: Array<{ key: string; statement: string; acceptanceRelevant: boolean }>;
  included: string[];
  excluded: string[];
  acceptanceRules: Array<{
    requirementKey: string;
    method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
    params?: Record<string, unknown>;
    instructions?: string;
  }>;
  budget: { amountMinor: number; currency: string };
  agreedPrice: { amountMinor: number; currency: string } | null;
  deadline: string | null;
}

async function loadSelectedContract(
  db: Database,
  taskId: string,
): Promise<{
  task: typeof tasks.$inferSelect;
  contract: typeof workContracts.$inferSelect;
  snapshot: ConversationContractSnapshot;
}> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw notFound("Task");

  const [contract] = await db
    .select()
    .from(workContracts)
    .where(and(eq(workContracts.taskId, taskId), eq(workContracts.status, "ACTIVE")))
    .orderBy(desc(workContracts.version))
    .limit(1);
  if (!contract || !contract.approvedAt) {
    throw conflict("An approved work agreement is required before contacting a professional.");
  }

  const [requirements, scope, rules, agreement] = await Promise.all([
    db
      .select({
        key: contractRequirements.key,
        statement: contractRequirements.statement,
        acceptanceRelevant: contractRequirements.acceptanceRelevant,
      })
      .from(contractRequirements)
      .where(eq(contractRequirements.contractId, contract.id)),
    db.select().from(scopeItems).where(eq(scopeItems.contractId, contract.id)),
    db.select().from(acceptanceRules).where(eq(acceptanceRules.contractId, contract.id)),
    db.select().from(commercialAgreements).where(eq(commercialAgreements.taskId, taskId)).limit(1),
  ]);
  return {
    task,
    contract,
    snapshot: {
      id: contract.id,
      version: contract.version,
      hash: contract.contractHash,
      title: contract.title,
      summary: contract.summary,
      requirements: requirements.map((item) => ({
        key: item.key,
        statement: item.statement,
        acceptanceRelevant: item.acceptanceRelevant,
      })),
      included: scope.filter((item) => item.type === "INCLUDED").map((item) => item.statement),
      excluded: scope.filter((item) => item.type === "EXCLUDED").map((item) => item.statement),
      acceptanceRules: rules.map((rule) => ({
        requirementKey: rule.requirementKey,
        method: rule.method,
        ...(rule.params && typeof rule.params === "object"
          ? { params: rule.params as Record<string, unknown> }
          : {}),
        ...(rule.instructions ? { instructions: rule.instructions } : {}),
      })),
      budget: { amountMinor: contract.budgetMinor, currency: contract.currency },
      agreedPrice: agreement[0]
        ? { amountMinor: agreement[0].agreedPriceMinor, currency: agreement[0].currency }
        : null,
      deadline: contract.deadline?.toISOString() ?? null,
    },
  };
}

export async function startTaskConversation(
  tx: Database,
  input: {
    taskId: string;
    buyerUserId: string;
    providerId: string;
    expectedContractVersion: number;
    expectedContractHash: string;
    initialMessage: string;
    clientMessageId: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const { task, contract, snapshot } = await loadSelectedContract(tx, input.taskId);
  if (task.userId !== input.buyerUserId) throw notFound("Task");
  if (
    contract.version !== input.expectedContractVersion ||
    contract.contractHash !== input.expectedContractHash
  ) {
    throw conflict(
      "The agreement changed since you reviewed it. Review the current version before contacting.",
    );
  }

  const [selection] = await tx
    .select()
    .from(providerSelections)
    .where(eq(providerSelections.taskId, input.taskId))
    .orderBy(desc(providerSelections.createdAt))
    .limit(1);
  if (
    !selection ||
    (selection.status !== "CANDIDATES_AVAILABLE" && selection.status !== "SELECTED") ||
    selection.contractId !== contract.id
  ) {
    throw conflict("Browse the current professional list before requesting contact.");
  }

  const candidates = Array.isArray(selection.candidates)
    ? (selection.candidates as Array<{ providerId?: unknown; eligible?: unknown }>)
    : [];
  const candidate = candidates.find((item) => item.providerId === input.providerId);
  if (
    !candidate ||
    candidate.eligible !== true ||
    !selection.candidates ||
    typeof selection.candidates !== "object"
  ) {
    throw conflict("That professional is not an eligible candidate for this task.");
  }

  const [provider] = await tx
    .select()
    .from(providers)
    .where(eq(providers.id, input.providerId))
    .limit(1);
  const [providerAvailability] = await tx
    .select()
    .from(availability)
    .where(eq(availability.providerId, input.providerId))
    .limit(1);
  if (
    !provider?.userId ||
    provider.userId === task.userId ||
    provider.status !== "ACTIVE" ||
    !providerAvailability?.available ||
    providerAvailability.activeAssignments >= providerAvailability.capacity
  ) {
    throw conflict("This professional is no longer available to receive contact.");
  }

  const [existing] = await tx
    .select({ id: taskConversations.id })
    .from(taskConversations)
    .where(
      and(
        eq(taskConversations.taskId, task.id),
        eq(taskConversations.providerId, provider.id),
        inArray(taskConversations.status, ["CONTACT_PENDING", "OPEN"]),
      ),
    )
    .limit(1);
  if (existing)
    throw conflict("A contact request or conversation already exists with this professional.");

  const conversationId = newId("conv");
  const messageId = newId("msg");
  const now = new Date();
  await tx.insert(taskConversations).values({
    id: conversationId,
    taskId: task.id,
    buyerUserId: task.userId,
    providerId: provider.id,
    providerUserId: provider.userId,
    status: "CONTACT_PENDING",
    messageCounter: 1,
    initialContactMessageId: messageId,
    contactApprovedAt: now,
    contactApprovedContractVersion: contract.version,
    contactApprovedContractHash: contract.contractHash,
    currentContractVersion: contract.version,
    currentContractHash: contract.contractHash,
    currentContractSnapshot: snapshot,
    contractSnapshot: snapshot,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(taskConversationMessages).values({
    id: messageId,
    conversationId,
    sequence: 1,
    clientMessageId: input.clientMessageId,
    authorUserId: task.userId,
    body: input.initialMessage.trim(),
    createdAt: now,
  });
  await appendEvent(tx, {
    type: "TASK_CONVERSATION_STARTED",
    aggregateId: task.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: { taskId: task.id, conversationId, providerId: provider.id },
  });
  return { conversationId, status: "CONTACT_PENDING" as const, contract: snapshot };
}

export async function respondToTaskConversation(
  tx: Database,
  input: {
    conversationId: string;
    providerUserId: string;
    response: "accept" | "decline";
    actor: Actor;
    correlationId: string;
  },
) {
  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (!conversation) throw notFound("Conversation");
  if (conversation.providerUserId !== input.providerUserId) throw notFound("Conversation");
  if (conversation.status !== "CONTACT_PENDING") {
    throw conflict("This contact request has already been answered.");
  }
  const status = input.response === "accept" ? "OPEN" : "DECLINED";
  const now = new Date();
  const [updated] = await tx
    .update(taskConversations)
    .set({
      status,
      providerRespondedAt: now,
      updatedAt: now,
      closedAt: input.response === "decline" ? now : null,
    })
    .where(
      and(
        eq(taskConversations.id, conversation.id),
        eq(taskConversations.status, "CONTACT_PENDING"),
      ),
    )
    .returning();
  if (!updated) throw conflict("This contact request has already been answered.");

  await appendEvent(tx, {
    type: input.response === "accept" ? "TASK_CONVERSATION_ACCEPTED" : "TASK_CONVERSATION_DECLINED",
    aggregateId: conversation.taskId,
    taskId: conversation.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: { taskId: conversation.taskId, conversationId: conversation.id },
  });
  return updated;
}

export async function sendTaskMessage(
  tx: Database,
  input: {
    conversationId: string;
    authorUserId: string;
    clientMessageId: string;
    body: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (!conversation) throw notFound("Conversation");
  if (
    conversation.buyerUserId !== input.authorUserId &&
    conversation.providerUserId !== input.authorUserId
  ) {
    throw notFound("Conversation");
  }
  if (conversation.status !== "OPEN") {
    throw conflict("Messages are available after the professional accepts the contact request.");
  }

  const body = input.body.trim();
  if (!body || body.length > 10_000) {
    throw conflict("Messages must contain 1 to 10,000 characters.");
  }

  const [existing] = await tx
    .select()
    .from(taskConversationMessages)
    .where(
      and(
        eq(taskConversationMessages.conversationId, conversation.id),
        eq(taskConversationMessages.clientMessageId, input.clientMessageId),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.authorUserId !== input.authorUserId || existing.body !== body) {
      throw conflict("This message identifier was already used for different content.");
    }
    return existing;
  }

  const [updated] = await tx
    .update(taskConversations)
    .set({ messageCounter: sql`${taskConversations.messageCounter} + 1`, updatedAt: new Date() })
    .where(and(eq(taskConversations.id, conversation.id), eq(taskConversations.status, "OPEN")))
    .returning({ messageCounter: taskConversations.messageCounter });
  if (!updated) throw conflict("The conversation is no longer open.");

  const messageId = newId("msg");
  const [message] = await tx
    .insert(taskConversationMessages)
    .values({
      id: messageId,
      conversationId: conversation.id,
      sequence: updated.messageCounter,
      clientMessageId: input.clientMessageId,
      authorUserId: input.authorUserId,
      body,
    })
    .returning();
  if (!message) throw new Error("Conversation message insert returned no row.");

  await appendEvent(tx, {
    type: "TASK_MESSAGE_SENT",
    aggregateId: conversation.taskId,
    taskId: conversation.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: { taskId: conversation.taskId, conversationId: conversation.id, messageId },
  });
  return message;
}

export async function listTaskConversations(
  db: Database,
  input: { taskId: string; userId: string; afterSequence?: number },
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task) throw notFound("Task");
  const rows = await db
    .select()
    .from(taskConversations)
    .where(
      and(eq(taskConversations.taskId, task.id), eq(taskConversations.buyerUserId, input.userId)),
    )
    .orderBy(desc(taskConversations.createdAt));
  return Promise.all(
    rows.map(async (conversation) => {
      const messages = await db
        .select()
        .from(taskConversationMessages)
        .where(
          input.afterSequence === undefined
            ? eq(taskConversationMessages.conversationId, conversation.id)
            : and(
                eq(taskConversationMessages.conversationId, conversation.id),
                gt(taskConversationMessages.sequence, input.afterSequence),
              ),
        )
        .orderBy(asc(taskConversationMessages.sequence))
        .limit(100);
      return { ...conversation, contractSnapshot: conversation.contractSnapshot, messages };
    }),
  );
}

export async function listProviderConversations(db: Database, providerUserId: string) {
  return db
    .select()
    .from(taskConversations)
    .where(
      and(
        eq(taskConversations.providerUserId, providerUserId),
        inArray(taskConversations.status, ["CONTACT_PENDING", "OPEN"]),
      ),
    )
    .orderBy(desc(taskConversations.updatedAt))
    .limit(50);
}

export async function getConversationForParticipant(
  db: Database,
  input: { conversationId: string; userId: string; afterSequence?: number },
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
  const messages = await db
    .select()
    .from(taskConversationMessages)
    .where(
      input.afterSequence === undefined
        ? eq(taskConversationMessages.conversationId, conversation.id)
        : and(
            eq(taskConversationMessages.conversationId, conversation.id),
            gt(taskConversationMessages.sequence, input.afterSequence),
          ),
    )
    .orderBy(asc(taskConversationMessages.sequence))
    .limit(100);
  return { ...conversation, messages };
}
