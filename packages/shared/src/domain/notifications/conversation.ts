export interface ConversationNotificationProjection {
  userId: string;
  title: string;
  body: string;
  href: string;
}

function stringValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Project participant-specific conversation events into in-app notifications.
 * The event remains the authority; this output is only a convenience view.
 */
export function projectConversationNotification(input: {
  eventType: string;
  taskId: string;
  taskTitle: string;
  taskOwnerUserId: string;
  payload: Record<string, unknown>;
}): ConversationNotificationProjection | null {
  switch (input.eventType) {
    case "TASK_CONVERSATION_STARTED": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: "New buyer contact request",
        body: `A requester sent an approved agreement and message for “${input.taskTitle}”. Review it in Work Studio and accept or decline.`,
        href: "/provider",
      };
    }
    case "TASK_CONVERSATION_ACCEPTED":
      return {
        userId: input.taskOwnerUserId,
        title: "Professional accepted your request",
        body: `Your contact request for “${input.taskTitle}” was accepted. You can continue the private conversation from the task workspace.`,
        href: `/tasks/${input.taskId}`,
      };
    case "TASK_CONVERSATION_DECLINED":
      return {
        userId: input.taskOwnerUserId,
        title: "Professional declined your request",
        body: `Your contact request for “${input.taskTitle}” was declined. You can review other available professionals from the task workspace.`,
        href: `/tasks/${input.taskId}`,
      };
    case "TASK_MESSAGE_SENT": {
      const recipientUserId = stringValue(input.payload, "recipientUserId");
      if (!recipientUserId) return null;
      return {
        userId: recipientUserId,
        title: "New private task message",
        body: `You received a new message about “${input.taskTitle}”.`,
        href: recipientUserId === input.taskOwnerUserId ? `/tasks/${input.taskId}` : "/provider",
      };
    }
    default:
      return null;
  }
}
