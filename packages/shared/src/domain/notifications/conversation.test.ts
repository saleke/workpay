import { describe, expect, it } from "vitest";
import { projectConversationNotification } from "./conversation.js";

const base = {
  taskId: "task_123",
  taskTitle: "Audit an accessible checkout",
  taskOwnerUserId: "usr_buyer",
};

describe("conversation notification projection", () => {
  it("sends a new contact request to the selected professional", () => {
    expect(
      projectConversationNotification({
        ...base,
        eventType: "TASK_CONVERSATION_STARTED",
        payload: { providerUserId: "usr_provider", conversationId: "conv_1" },
      }),
    ).toMatchObject({
      userId: "usr_provider",
      title: "New buyer contact request",
      href: "/messages?conversation=conv_1",
    });
  });

  it("fails closed when a contact event has no professional recipient", () => {
    expect(
      projectConversationNotification({
        ...base,
        eventType: "TASK_CONVERSATION_STARTED",
        payload: {},
      }),
    ).toBeNull();
  });

  it("sends professional decisions back to the requester", () => {
    expect(
      projectConversationNotification({
        ...base,
        eventType: "TASK_CONVERSATION_ACCEPTED",
        payload: { conversationId: "conv_1" },
      }),
    ).toMatchObject({
      userId: "usr_buyer",
      href: "/messages?conversation=conv_1",
    });
  });

  it("routes a private message to its task-scoped thread in Messages", () => {
    expect(
      projectConversationNotification({
        ...base,
        eventType: "TASK_MESSAGE_SENT",
        payload: { recipientUserId: "usr_provider", conversationId: "conv_1" },
      }),
    ).toMatchObject({
      userId: "usr_provider",
      href: "/messages?conversation=conv_1",
    });
  });

  it("notifies the buyer when a discussion is withdrawn and preserves the recovery link", () => {
    expect(
      projectConversationNotification({
        ...base,
        eventType: "TASK_CONVERSATION_WITHDRAWN",
        payload: { conversationId: "conv_1", buyerUserId: "usr_buyer" },
      }),
    ).toMatchObject({
      userId: "usr_buyer",
      title: "Professional withdrew from the discussion",
      href: "/messages?conversation=conv_1",
    });
  });
});
