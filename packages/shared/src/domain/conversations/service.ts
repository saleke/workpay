import { and, asc, count, desc, eq, gt, inArray, lt, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../../db/client.js";
import {
  taskConversationMessages,
  taskConversationParticipants,
  taskConversations,
} from "../../db/schema/conversations.js";
import {
  workContracts,
  contractRequirements,
  scopeItems,
  acceptanceRules,
} from "../../db/schema/contracts.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { workExecutions } from "../../db/schema/execution.js";
import { availability, providers, providerSelections } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import { users } from "../../db/schema/identity.js";
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

export type ConversationWithMessages = typeof taskConversations.$inferSelect & {
  hasWorkExecution: boolean;
  messages: Array<typeof taskConversationMessages.$inferSelect>;
};

function taskProviderKey(taskId: string, providerId: string): string {
  return JSON.stringify([taskId, providerId]);
}

async function hydrateConversationRows<T extends typeof taskConversations.$inferSelect>(
  db: Database,
  conversations: T[],
): Promise<Array<T & { hasWorkExecution: boolean }>> {
  if (conversations.length === 0) return [];
  const taskIds = [...new Set(conversations.map((conversation) => conversation.taskId))];
  const [executions, agreements] = await Promise.all([
    db
      .select({ taskId: workExecutions.taskId, providerId: workExecutions.providerId })
      .from(workExecutions)
      .where(inArray(workExecutions.taskId, taskIds)),
    db
      .select({
        taskId: commercialAgreements.taskId,
        providerId: commercialAgreements.providerId,
      })
      .from(commercialAgreements)
      .where(inArray(commercialAgreements.taskId, taskIds)),
  ]);
  const taskProvidersWithExecutions = new Set(
    executions.map((execution) => taskProviderKey(execution.taskId, execution.providerId)),
  );
  const agreementProviderByTask = new Map(
    agreements.map((agreement) => [agreement.taskId, agreement.providerId]),
  );
  return conversations.map((conversation) => {
    const agreementProviderId = agreementProviderByTask.get(conversation.taskId);
    const hasWorkExecution = taskProvidersWithExecutions.has(
      taskProviderKey(conversation.taskId, conversation.providerId),
    );
    if (agreementProviderId === conversation.providerId) {
      return { ...conversation, hasWorkExecution };
    }
    const contractSnapshot = conversation.contractSnapshot as ConversationContractSnapshot;
    const currentContractSnapshot =
      conversation.currentContractSnapshot as ConversationContractSnapshot;
    return {
      ...conversation,
      contractSnapshot: { ...contractSnapshot, agreedPrice: null },
      currentContractSnapshot: { ...currentContractSnapshot, agreedPrice: null },
      hasWorkExecution,
    };
  });
}

async function loadSelectedContract(
  db: Database,
  taskId: string,
): Promise<{
  task: typeof tasks.$inferSelect;
  contract: typeof workContracts.$inferSelect;
  snapshot: ConversationContractSnapshot;
  agreementProviderId: string | null;
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
    agreementProviderId: agreement[0]?.providerId ?? null,
  };
}

export async function getFirstContactContext(
  db: Database,
  input: {
    taskId: string;
    buyerUserId: string;
    providerId: string;
    expectedContractVersion: number;
    expectedContractHash: string;
  },
) {
  const { task, contract, snapshot, agreementProviderId } = await loadSelectedContract(
    db,
    input.taskId,
  );
  if (task.userId !== input.buyerUserId) throw notFound("Task");
  if (
    contract.version !== input.expectedContractVersion ||
    contract.contractHash !== input.expectedContractHash
  ) {
    throw conflict(
      "The agreement changed since you reviewed it. Review the current version before contacting.",
    );
  }

  const [selection] = await db
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
    ? (selection.candidates as Array<Record<string, unknown>>)
    : [];
  const candidate = candidates.find((item) => item.providerId === input.providerId);
  if (!candidate || candidate.eligible !== true) {
    throw conflict("That professional is not an eligible candidate for this task.");
  }

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, input.providerId))
    .limit(1);
  const [providerAvailability] = await db
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
  const providerUserId = provider.userId;
  const providerContractSnapshot =
    agreementProviderId === provider.id ? snapshot : { ...snapshot, agreedPrice: null };

  const [existing] = await db
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

  const candidateBio = typeof candidate.bio === "string" ? candidate.bio : null;
  const candidateCapabilities = Array.isArray(candidate.capabilities)
    ? candidate.capabilities
        .map((item) =>
          typeof item === "object" && item !== null && "tag" in item && typeof item.tag === "string"
            ? item.tag
            : null,
        )
        .filter((tag): tag is string => tag !== null)
    : [];

  return {
    task,
    contract,
    snapshot: providerContractSnapshot,
    provider,
    providerUserId,
    professional: {
      displayName:
        typeof candidate.displayName === "string" ? candidate.displayName : provider.displayName,
      bio: candidateBio,
      capabilities: candidateCapabilities,
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
  const { task, contract, snapshot, provider, providerUserId } = await getFirstContactContext(
    tx,
    input,
  );

  const conversationId = newId("conv");
  const messageId = newId("msg");
  const now = new Date();
  await tx.insert(taskConversations).values({
    id: conversationId,
    taskId: task.id,
    buyerUserId: task.userId,
    providerId: provider.id,
    providerUserId,
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
    payload: { taskId: task.id, conversationId, providerId: provider.id, providerUserId },
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

  await tx
    .insert(taskConversationParticipants)
    .values({
      conversationId: conversation.id,
      userId: input.providerUserId,
      lastReadSequence: conversation.messageCounter,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [taskConversationParticipants.conversationId, taskConversationParticipants.userId],
      set: {
        lastReadSequence: sql`greatest(${taskConversationParticipants.lastReadSequence}, excluded.last_read_sequence)`,
        updatedAt: now,
      },
    });

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

export async function withdrawTaskConversation(
  tx: Database,
  input: {
    conversationId: string;
    providerUserId: string;
    note?: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const [initialConversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (!initialConversation) throw notFound("Conversation");
  if (initialConversation.providerUserId !== input.providerUserId) throw notFound("Conversation");

  const [task] = await tx
    .select({ id: tasks.id, userId: tasks.userId })
    .from(tasks)
    .where(eq(tasks.id, initialConversation.taskId))
    .for("update")
    .limit(1);
  if (!task) throw notFound("Task");

  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, initialConversation.id))
    .for("update")
    .limit(1);
  if (!conversation || conversation.providerUserId !== input.providerUserId) {
    throw notFound("Conversation");
  }
  if (conversation.status !== "OPEN") {
    throw conflict("Only an open discussion can be withdrawn.");
  }

  const [execution] = await tx
    .select({ id: workExecutions.id })
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .limit(1);
  if (execution) {
    throw conflict(
      "A work assignment already exists. Contact the buyer in the conversation; this discussion cannot be withdrawn as a substitute for handling an assignment.",
    );
  }

  const now = new Date();
  const note = input.note?.trim();
  const body = [
    "I’m no longer available to continue this discussion.",
    note,
    "No work commitment was made through this conversation. Please choose another professional if you still need help.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const [updated] = await tx
    .update(taskConversations)
    .set({
      status: "WITHDRAWN",
      closedAt: now,
      updatedAt: now,
      messageCounter: sql`${taskConversations.messageCounter} + 1`,
    })
    .where(and(eq(taskConversations.id, conversation.id), eq(taskConversations.status, "OPEN")))
    .returning({
      status: taskConversations.status,
      messageCounter: taskConversations.messageCounter,
    });
  if (!updated) throw conflict("This discussion was updated concurrently.");

  await tx.insert(taskConversationMessages).values({
    id: newId("msg"),
    conversationId: conversation.id,
    sequence: updated.messageCounter,
    clientMessageId: newId("cmsg"),
    authorUserId: input.providerUserId,
    body,
    createdAt: now,
  });
  await appendEvent(tx, {
    type: "TASK_CONVERSATION_WITHDRAWN",
    aggregateId: task.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      conversationId: conversation.id,
      buyerUserId: task.userId,
    },
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
    payload: {
      taskId: conversation.taskId,
      conversationId: conversation.id,
      messageId,
      recipientUserId:
        input.authorUserId === conversation.buyerUserId
          ? conversation.providerUserId
          : conversation.buyerUserId,
    },
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
  const conversations = await Promise.all(
    rows.map(async (conversation) => {
      const messageQuery = db
        .select()
        .from(taskConversationMessages)
        .where(
          input.afterSequence === undefined
            ? eq(taskConversationMessages.conversationId, conversation.id)
            : and(
                eq(taskConversationMessages.conversationId, conversation.id),
                gt(taskConversationMessages.sequence, input.afterSequence),
              ),
        );
      const messages =
        input.afterSequence === undefined
          ? await messageQuery
              .orderBy(desc(taskConversationMessages.sequence))
              .limit(100)
              .then((latest) => latest.reverse())
          : await messageQuery.orderBy(asc(taskConversationMessages.sequence)).limit(100);
      return {
        ...conversation,
        contractSnapshot: conversation.contractSnapshot,
        messages,
      };
    }),
  );
  return hydrateConversationRows(db, conversations);
}

export async function listProviderConversations(db: Database, providerUserId: string) {
  const conversations = await db
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.providerUserId, providerUserId))
    .orderBy(desc(taskConversations.updatedAt))
    .limit(50);
  return hydrateConversationRows(db, conversations);
}

export async function listMessageInbox(db: Database, userId: string) {
  const buyerUser = alias(users, "message_buyer");
  const providerUser = alias(users, "message_provider");
  const participantState = alias(taskConversationParticipants, "message_participant_state");
  const rows = await db
    .select({
      id: taskConversations.id,
      taskId: taskConversations.taskId,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      buyerUserId: taskConversations.buyerUserId,
      buyerDisplayName: sql<string>`coalesce(nullif(${buyerUser.displayName}, ''), nullif(${buyerUser.name}, ''), ${buyerUser.username}, 'Client')`,
      buyerImage: buyerUser.image,
      providerId: taskConversations.providerId,
      providerUserId: taskConversations.providerUserId,
      providerDisplayName: providers.displayName,
      providerImage: providerUser.image,
      status: taskConversations.status,
      updatedAt: taskConversations.updatedAt,
    })
    .from(taskConversations)
    .innerJoin(tasks, eq(tasks.id, taskConversations.taskId))
    .innerJoin(buyerUser, eq(buyerUser.id, taskConversations.buyerUserId))
    .innerJoin(providers, eq(providers.id, taskConversations.providerId))
    .innerJoin(providerUser, eq(providerUser.id, taskConversations.providerUserId))
    .where(
      or(eq(taskConversations.buyerUserId, userId), eq(taskConversations.providerUserId, userId)),
    )
    .orderBy(desc(taskConversations.updatedAt));

  if (rows.length === 0) return { currentUserId: userId, conversations: [] };
  const conversationIds = rows.map((row) => row.id);
  const taskIds = [...new Set(rows.map((row) => row.taskId))];
  const latestMessages = db
    .select({
      conversationId: taskConversationMessages.conversationId,
      latestSequence: max(taskConversationMessages.sequence).as("latest_sequence"),
    })
    .from(taskConversationMessages)
    .where(inArray(taskConversationMessages.conversationId, conversationIds))
    .groupBy(taskConversationMessages.conversationId)
    .as("latest_conversation_messages");
  const [messages, unreadRows, executions] = await Promise.all([
    db
      .select({
        conversationId: taskConversationMessages.conversationId,
        body: taskConversationMessages.body,
        authorUserId: taskConversationMessages.authorUserId,
        createdAt: taskConversationMessages.createdAt,
      })
      .from(taskConversationMessages)
      .innerJoin(
        latestMessages,
        and(
          eq(latestMessages.conversationId, taskConversationMessages.conversationId),
          eq(latestMessages.latestSequence, taskConversationMessages.sequence),
        ),
      ),
    db
      .select({
        conversationId: taskConversationMessages.conversationId,
        unreadCount: count(),
      })
      .from(taskConversationMessages)
      .leftJoin(
        participantState,
        and(
          eq(participantState.conversationId, taskConversationMessages.conversationId),
          eq(participantState.userId, userId),
        ),
      )
      .where(
        and(
          inArray(taskConversationMessages.conversationId, conversationIds),
          ne(taskConversationMessages.authorUserId, userId),
          gt(
            taskConversationMessages.sequence,
            sql`coalesce(${participantState.lastReadSequence}, 0)`,
          ),
        ),
      )
      .groupBy(taskConversationMessages.conversationId),
    db
      .select({ taskId: workExecutions.taskId, providerId: workExecutions.providerId })
      .from(workExecutions)
      .where(inArray(workExecutions.taskId, taskIds)),
  ]);
  const latestMessageByConversation = new Map(
    messages.map((message) => [message.conversationId, message]),
  );
  const unreadCountByConversation = new Map(
    unreadRows.map((row) => [row.conversationId, row.unreadCount]),
  );
  const taskProvidersWithExecutions = new Set(
    executions.map((execution) => taskProviderKey(execution.taskId, execution.providerId)),
  );

  return {
    currentUserId: userId,
    conversations: rows.map((row) => {
      const isBuyer = row.buyerUserId === userId;
      const lastMessage = latestMessageByConversation.get(row.id);
      return {
        id: row.id,
        taskId: row.taskId,
        taskTitle: row.taskTitle,
        taskStatus: row.taskStatus,
        status: row.status,
        hasWorkExecution: taskProvidersWithExecutions.has(
          taskProviderKey(row.taskId, row.providerId),
        ),
        updatedAt: row.updatedAt.toISOString(),
        otherParticipant: isBuyer
          ? {
              userId: row.providerUserId,
              displayName: row.providerDisplayName,
              image: row.providerImage,
              role: "professional" as const,
            }
          : {
              userId: row.buyerUserId,
              displayName: row.buyerDisplayName,
              image: row.buyerImage,
              role: "client" as const,
            },
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              authorUserId: lastMessage.authorUserId,
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
        unreadCount: unreadCountByConversation.get(row.id) ?? 0,
      };
    }),
  };
}

export async function markConversationRead(
  tx: Database,
  input: { conversationId: string; userId: string; lastReadSequence: number },
) {
  const [conversation] = await tx
    .select({
      id: taskConversations.id,
      buyerUserId: taskConversations.buyerUserId,
      providerUserId: taskConversations.providerUserId,
      messageCounter: taskConversations.messageCounter,
    })
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (
    !conversation ||
    (conversation.buyerUserId !== input.userId && conversation.providerUserId !== input.userId)
  ) {
    throw notFound("Conversation");
  }
  if (
    !Number.isSafeInteger(input.lastReadSequence) ||
    input.lastReadSequence < 0 ||
    input.lastReadSequence > conversation.messageCounter
  ) {
    throw conflict("The read position is outside this conversation's message history.");
  }

  const now = new Date();
  await tx
    .insert(taskConversationParticipants)
    .values({
      conversationId: conversation.id,
      userId: input.userId,
      lastReadSequence: input.lastReadSequence,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [taskConversationParticipants.conversationId, taskConversationParticipants.userId],
      set: {
        lastReadSequence: sql`greatest(${taskConversationParticipants.lastReadSequence}, excluded.last_read_sequence)`,
        updatedAt: now,
      },
    });

  return { conversationId: conversation.id, lastReadSequence: input.lastReadSequence };
}

export async function getConversationForParticipant(
  db: Database,
  input: {
    conversationId: string;
    userId: string;
    afterSequence?: number;
    beforeSequence?: number;
  },
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
  const page =
    input.afterSequence !== undefined
      ? await db
          .select()
          .from(taskConversationMessages)
          .where(
            and(
              eq(taskConversationMessages.conversationId, conversation.id),
              gt(taskConversationMessages.sequence, input.afterSequence),
            ),
          )
          .orderBy(asc(taskConversationMessages.sequence))
          .limit(101)
      : await db
          .select()
          .from(taskConversationMessages)
          .where(
            input.beforeSequence === undefined
              ? eq(taskConversationMessages.conversationId, conversation.id)
              : and(
                  eq(taskConversationMessages.conversationId, conversation.id),
                  lt(taskConversationMessages.sequence, input.beforeSequence),
                ),
          )
          .orderBy(desc(taskConversationMessages.sequence))
          .limit(101);
  const hasMoreMessages = page.length > 100;
  const messages = page.slice(0, 100);
  if (input.afterSequence === undefined) messages.reverse();
  const [hydratedConversation] = await hydrateConversationRows(db, [conversation]);
  return { ...hydratedConversation, messages, hasMoreMessages };
}
