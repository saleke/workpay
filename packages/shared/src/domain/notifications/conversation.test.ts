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
        payload: { providerUserId: "usr_provider" },
      }),
    ).toMatchObject({
      userId: "usr_provider",
      title: "New buyer contact request",
      href: "/provider",
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
        payload: {},
      }),
    ).toMatchObject({
      userId: "usr_buyer",
      href: "/tasks/task_123",
    });
  });

  it("routes a private message to the recipient's relevant workspace", () => {
    expect(
      projectConversationNotification({
        ...base,
        eventType: "TASK_MESSAGE_SENT",
        payload: { recipientUserId: "usr_provider" },
      }),
    ).toMatchObject({
      userId: "usr_provider",
      href: "/provider",
    });
  });
});
