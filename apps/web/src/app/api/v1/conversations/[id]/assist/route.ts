import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  taskConversationMessages,
  taskConversations,
} from "@workpay/shared/db/schema/conversations";
import { providers } from "@workpay/shared/db/schema/providers";
import { getIntakeAIClient } from "@workpay/shared/integrations/ai";
import { AppError } from "@workpay/shared/platform";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { numericDetailsPreserved } from "@/lib/server/message-assist";

const requestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("REWRITE_DRAFT"),
      draft: z.string().trim().min(1).max(10_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("SIMPLIFY_MESSAGE"),
      messageId: z.string().min(1).max(64),
    })
    .strict(),
]);
const assistWindows = new Map<string, { count: number; resetsAt: number }>();
const ASSIST_WINDOW_MS = 10 * 60 * 1000;
const ASSIST_WINDOW_LIMIT = 20;

function assertAssistRateLimit(userId: string): void {
  const now = Date.now();
  const current = assistWindows.get(userId);
  if (!current || current.resetsAt <= now) {
    assistWindows.set(userId, { count: 1, resetsAt: now + ASSIST_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > ASSIST_WINDOW_LIMIT) {
    throw new AppError(
      "PRECONDITION_FAILED",
      "Message assistance is temporarily limited. Review your current draft and try again shortly.",
    );
  }
}

function assertNumericDetailsPreserved(source: string, output: string): void {
  if (!numericDetailsPreserved(source, output)) {
    throw new AppError(
      "EXTERNAL_FAILURE",
      "The AI response changed numeric details, so the original text was left unchanged.",
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to use message assistance.");
    assertAssistRateLimit(actor.id);
    const { id: conversationId } = await params;
    const input = requestSchema.parse(await req.json());
    const [conversation] = await getDb()
      .select({
        id: taskConversations.id,
        buyerUserId: taskConversations.buyerUserId,
        providerUserId: taskConversations.providerUserId,
        status: taskConversations.status,
        snapshot: taskConversations.currentContractSnapshot,
        providerDisplayName: providers.displayName,
      })
      .from(taskConversations)
      .innerJoin(providers, eq(providers.id, taskConversations.providerId))
      .where(eq(taskConversations.id, conversationId))
      .limit(1);
    if (
      !conversation ||
      ![conversation.buyerUserId, conversation.providerUserId].includes(actor.id)
    ) {
      throw new AppError("NOT_FOUND", "Conversation not found.");
    }
    if (conversation.status !== "OPEN") {
      throw new AppError("DOMAIN_CONFLICT", "Message assistance requires an open conversation.");
    }
    const snapshot = conversation.snapshot as { title?: unknown; summary?: unknown };
    const taskTitle = typeof snapshot.title === "string" ? snapshot.title : "Task";
    const taskSummary = typeof snapshot.summary === "string" ? snapshot.summary : taskTitle;
    const ai = getIntakeAIClient();

    if (input.action === "REWRITE_DRAFT") {
      if (actor.id !== conversation.buyerUserId) {
        throw new AppError(
          "AUTHORIZATION_ERROR",
          "Draft improvement is currently available to the client.",
        );
      }
      const message = await ai.rewriteConversationMessage({
        draft: input.draft,
        taskTitle,
        taskSummary,
        recipientDisplayName: conversation.providerDisplayName,
      });
      assertNumericDetailsPreserved(input.draft, message);
      return jsonOk({ message });
    }

    if (actor.id !== conversation.buyerUserId) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "Plain-language explanations are currently available to the client.",
      );
    }
    const [message] = await getDb()
      .select({ body: taskConversationMessages.body })
      .from(taskConversationMessages)
      .where(
        and(
          eq(taskConversationMessages.id, input.messageId),
          eq(taskConversationMessages.conversationId, conversation.id),
          eq(taskConversationMessages.authorUserId, conversation.providerUserId),
        ),
      )
      .limit(1);
    if (!message) throw new AppError("NOT_FOUND", "Professional message not found.");
    const result = await ai.simplifyConversationMessage({
      message: message.body,
      taskTitle,
      taskSummary,
    });
    assertNumericDetailsPreserved(
      message.body,
      [
        result.summary,
        ...result.terms.flatMap((term) => [term.term, term.meaning]),
        ...result.suggestedQuestions,
      ].join(" "),
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
