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

function conversationHref(conversationId: unknown): string {
  if (typeof conversationId !== "string" || !conversationId) return "/messages";
  return `/messages?conversation=${encodeURIComponent(conversationId)}`;
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
        body: `A requester sent an approved agreement and message for “${input.taskTitle}”. Review it in Messages and choose whether to start a discussion.`,
        href: conversationHref(input.payload.conversationId),
      };
    }
    case "TASK_CONVERSATION_ACCEPTED":
      return {
        userId: input.taskOwnerUserId,
        title: "Professional accepted your request",
        body: `Your contact request for “${input.taskTitle}” was accepted. You can continue the private conversation in Messages.`,
        href: conversationHref(input.payload.conversationId),
      };
    case "TASK_CONVERSATION_DECLINED":
      return {
        userId: input.taskOwnerUserId,
        title: "Professional declined your request",
        body: `Your contact request for “${input.taskTitle}” was declined. You can review other available professionals from the task workspace.`,
        href: conversationHref(input.payload.conversationId),
      };
    case "TASK_CONVERSATION_WITHDRAWN":
      return {
        userId: stringValue(input.payload, "buyerUserId") ?? input.taskOwnerUserId,
        title: "Professional withdrew from the discussion",
        body: `The professional is no longer available for “${input.taskTitle}”. No work commitment was made; you can review other available professionals.`,
        href: conversationHref(input.payload.conversationId),
      };
    case "TASK_MESSAGE_SENT": {
      const recipientUserId = stringValue(input.payload, "recipientUserId");
      if (!recipientUserId) return null;
      return {
        userId: recipientUserId,
        title: "New private task message",
        body: `You received a new message about “${input.taskTitle}”.`,
        href: conversationHref(input.payload.conversationId),
      };
    }
    case "WORK_COMMITMENT_PROPOSED": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: "New work proposal",
        body: `A client sent exact work terms for “${input.taskTitle}”. Review the scope, compensation, and deadline before responding.`,
        href: conversationHref(input.payload.conversationId),
      };
    }
    case "WORK_COMMITMENT_PROVIDER_RESPONDED":
      return {
        userId: stringValue(input.payload, "buyerUserId") ?? input.taskOwnerUserId,
        title:
          input.payload.response === "ACCEPTED"
            ? "Professional accepted your work proposal"
            : "Professional declined your work proposal",
        body:
          input.payload.response === "ACCEPTED"
            ? `The professional is ready for “${input.taskTitle}”. Review and confirm them before payment authorization.`
            : `The professional declined the proposed work for “${input.taskTitle}”. Your other conversations remain available.`,
        href: conversationHref(input.payload.conversationId),
      };
    case "WORK_COMMITMENT_CONFIRMED": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: "Work commitment confirmed",
        body: `The client confirmed you for “${input.taskTitle}”. Payment authorization is the next step; do not start until Work Studio marks the work ready.`,
        href: conversationHref(input.payload.conversationId),
      };
    }
    case "WORK_COMMITMENT_CLOSED": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: "Work proposal closed",
        body:
          input.payload.reason === "ANOTHER_PROFESSIONAL_CONFIRMED"
            ? `The client selected another professional for “${input.taskTitle}”. No commitment was created with you.`
            : `The work proposal for “${input.taskTitle}” is no longer active.`,
        href: conversationHref(input.payload.conversationId),
      };
    }
    case "WORK_REVIEW_OPENED": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: input.payload.kind === "FINAL" ? "Final review requested" : "Checkpoint requested",
        body: `The client requested a review package for “${input.taskTitle}”.`,
        href: `/provider`,
      };
    }
    case "WORK_REVIEW_PACKAGE_SENT":
      return {
        userId: stringValue(input.payload, "buyerUserId") ?? input.taskOwnerUserId,
        title: "Review package ready",
        body: `The professional sent review context for “${input.taskTitle}”.`,
        href: `/tasks/${input.taskId}?section=review`,
      };
    case "WORK_REVIEW_REVIEWER_COMPLETED":
      return {
        userId: stringValue(input.payload, "buyerUserId") ?? input.taskOwnerUserId,
        title: "Paid review ready",
        body: `The agreed reviewer returned notes for “${input.taskTitle}”.`,
        href: `/tasks/${input.taskId}?section=review`,
      };
    case "WORK_REVIEW_REFERRED": {
      const reviewerUserId = stringValue(input.payload, "reviewerUserId");
      if (!reviewerUserId) return null;
      return {
        userId: reviewerUserId,
        title: "Review package assigned",
        body: `A review package for “${input.taskTitle}” is ready in your reviewer workspace.`,
        href: "/reviewer/engagements",
      };
    }
    case "REVIEW_FEE_AUTHORIZATION_REQUESTED": {
      const payerUserId = stringValue(input.payload, "payerUserId");
      if (!payerUserId) return null;
      return {
        userId: payerUserId,
        title: "Review fee approval needed",
        body: `Approve the agreed review fee for “${input.taskTitle}” to activate the reviewer engagement.`,
        href: "/messages",
      };
    }
    case "REVIEW_FEE_PAID": {
      const reviewerUserId = stringValue(input.payload, "reviewerUserId");
      if (!reviewerUserId) return null;
      return {
        userId: reviewerUserId,
        title: "Review fee paid",
        body: `A fee payment for “${input.taskTitle}” is complete.`,
        href: "/reviewer/engagements",
      };
    }
    case "WORK_REVIEW_PROVIDER_RESPONDED":
      return {
        userId: stringValue(input.payload, "buyerUserId") ?? input.taskOwnerUserId,
        title: "Professional responded to the review",
        body: `The professional responded to the completion decision for “${input.taskTitle}”.`,
        href: `/tasks/${input.taskId}?section=review`,
      };
    case "WORK_REVIEW_CLIENT_OVERDUE": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: "Client review response overdue",
        body: `The response window for “${input.taskTitle}” has passed.`,
        href: "/provider",
      };
    }
    case "WORK_REVIEW_CONTEXT_ADDED": {
      const recipientUserId = stringValue(input.payload, "recipientUserId");
      if (!recipientUserId) return null;
      return {
        userId: recipientUserId,
        title: "Review context added",
        body: `New ${String(input.payload.itemType ?? "context").toLowerCase()} was added to the review for “${input.taskTitle}”.`,
        href: `/tasks/${input.taskId}?section=review`,
      };
    }
    case "WORK_REVIEW_DECIDED": {
      const providerUserId = stringValue(input.payload, "providerUserId");
      if (!providerUserId) return null;
      return {
        userId: providerUserId,
        title: "Client review updated",
        body: `The client recorded ${String(input.payload.decision ?? "a decision")
          .replaceAll("_", " ")
          .toLowerCase()} for “${input.taskTitle}”.`,
        href: "/provider",
      };
    }
    default:
      return null;
  }
}
