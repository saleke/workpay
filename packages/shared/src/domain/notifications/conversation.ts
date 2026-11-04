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

function conversationHref(taskId: string, conversationId: unknown): string {
  if (typeof conversationId !== "string" || !conversationId) return `/tasks/${taskId}`;
  const id = encodeURIComponent(conversationId);
  return `/tasks/${taskId}?section=execution&conversation=${id}#conversation-${id}`;
}

function providerConversationHref(conversationId: unknown): string {
  if (typeof conversationId !== "string" || !conversationId) return "/provider";
  const id = encodeURIComponent(conversationId);
  return `/provider?section=conversations&conversation=${id}#conversation-${id}`;
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
        href: providerConversationHref(input.payload.conversationId),
      };
    }
    case "TASK_CONVERSATION_ACCEPTED":
      return {
        userId: input.taskOwnerUserId,
        title: "Professional accepted your request",
        body: `Your contact request for “${input.taskTitle}” was accepted. You can continue the private conversation from the task workspace.`,
        href: conversationHref(input.taskId, input.payload.conversationId),
      };
    case "TASK_CONVERSATION_DECLINED":
      return {
        userId: input.taskOwnerUserId,
        title: "Professional declined your request",
        body: `Your contact request for “${input.taskTitle}” was declined. You can review other available professionals from the task workspace.`,
        href: conversationHref(input.taskId, input.payload.conversationId),
      };
    case "TASK_CONVERSATION_WITHDRAWN":
      return {
        userId: stringValue(input.payload, "buyerUserId") ?? input.taskOwnerUserId,
        title: "Professional withdrew from the discussion",
        body: `The professional is no longer available for “${input.taskTitle}”. No work commitment was made; you can review other available professionals.`,
        href: conversationHref(input.taskId, input.payload.conversationId),
      };
    case "TASK_MESSAGE_SENT": {
      const recipientUserId = stringValue(input.payload, "recipientUserId");
      if (!recipientUserId) return null;
      return {
        userId: recipientUserId,
        title: "New private task message",
        body: `You received a new message about “${input.taskTitle}”.`,
        href:
          recipientUserId === input.taskOwnerUserId
            ? conversationHref(input.taskId, input.payload.conversationId)
            : providerConversationHref(input.payload.conversationId),
      };
    }
    default:
      return null;
  }
}
