import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, withTransaction } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { providerSelections, providers } from "../../db/schema/providers.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money } from "../../platform/money.js";
import {
  closeTestDb,
  createProvider,
  createUser,
  hasTestDatabase,
  resetDatabase,
} from "../../testing/index.js";
import type { Actor } from "../identity/authorize.js";
import { createTask } from "../tasks/service.js";
import {
  getConversationForParticipant,
  listMessageInbox,
  respondToTaskConversation,
  sendTaskMessage,
  startTaskConversation,
} from "./service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("message inbox (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("returns the latest contact message and unread count for both participants", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const providerUser = await createUser(db, { role: "provider", name: "Professional" });
    const provider = await createProvider(db, { displayName: "Professional" });
    await db
      .update(providers)
      .set({ userId: providerUser.id })
      .where(eq(providers.id, provider.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );

    const contractId = newId("contract");
    const contractHash = "a".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the agreed report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      acceptancePlan: { version: 1, rules: [], policy: {} },
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    await db.insert(providerSelections).values({
      id: newId("sel"),
      taskId: task.id,
      contractId,
      status: "CANDIDATES_AVAILABLE",
      candidates: [
        {
          providerId: provider.id,
          displayName: provider.displayName,
          eligible: true,
          capabilities: [],
        },
      ],
    });

    const conversation = await withTransaction((tx) =>
      startTaskConversation(tx, {
        taskId: task.id,
        buyerUserId: buyerUser.id,
        providerId: provider.id,
        expectedContractVersion: 1,
        expectedContractHash: contractHash,
        initialMessage: "Could we discuss the report scope?",
        clientMessageId: newId("idem"),
        actor: buyer,
        correlationId,
      }),
    );

    const buyerInbox = await listMessageInbox(db, buyerUser.id);
    const providerInbox = await listMessageInbox(db, providerUser.id);

    expect(buyerInbox.conversations).toHaveLength(1);
    expect(buyerInbox.conversations[0]).toMatchObject({
      status: "CONTACT_PENDING",
      unreadCount: 0,
      lastMessage: {
        body: "Could we discuss the report scope?",
        authorUserId: buyerUser.id,
      },
    });
    expect(providerInbox.conversations).toHaveLength(1);
    expect(providerInbox.conversations[0]).toMatchObject({
      status: "CONTACT_PENDING",
      unreadCount: 1,
      lastMessage: {
        body: "Could we discuss the report scope?",
        authorUserId: buyerUser.id,
      },
    });

    const providerActor: Actor = { kind: "USER", id: providerUser.id, role: "provider" };
    await withTransaction((tx) =>
      respondToTaskConversation(tx, {
        conversationId: conversation.conversationId,
        providerUserId: providerUser.id,
        response: "accept",
        actor: providerActor,
        correlationId,
      }),
    );

    const attachment = {
      id: newId("catt"),
      kind: "AUDIO" as const,
      filename: "voice-note.webm",
      storageKey: `conversation-attachments/${conversation.conversationId}/voice-note.webm`,
      contentType: "audio/webm",
      sizeBytes: 4,
      sha256: "b".repeat(64),
    };
    const clientMessageId = newId("idem");
    const sendMessage = () =>
      withTransaction((tx) =>
        sendTaskMessage(tx, {
          conversationId: conversation.conversationId,
          authorUserId: buyerUser.id,
          clientMessageId,
          body: "Voice note",
          attachments: [attachment],
          actor: buyer,
          correlationId,
        }),
      );
    const [message, retriedMessage] = await Promise.all([sendMessage(), sendMessage()]);
    expect(message.id).toBe(retriedMessage.id);
    expect(message.attachments).toHaveLength(1);
    expect(retriedMessage.attachments).toHaveLength(1);
    expect(message.attachments).toMatchObject([
      {
        id: attachment.id,
        kind: "AUDIO",
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
      },
    ]);
    expect(message.attachments[0]).not.toHaveProperty("storageKey");

    const conflictingRetry = withTransaction((tx) =>
      sendTaskMessage(tx, {
        conversationId: conversation.conversationId,
        authorUserId: buyerUser.id,
        clientMessageId,
        body: "A different message",
        attachments: [attachment],
        actor: buyer,
        correlationId,
      }),
    );
    await expect(conflictingRetry).rejects.toThrow(
      "This message identifier was already used for different content.",
    );

    const loadedConversation = await getConversationForParticipant(db, {
      conversationId: conversation.conversationId,
      userId: providerUser.id,
    });
    expect(loadedConversation.messages.at(-1)?.attachments).toMatchObject([
      { id: attachment.id, kind: "AUDIO", filename: "voice-note.webm" },
    ]);
  });
});
