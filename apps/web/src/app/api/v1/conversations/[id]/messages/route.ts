import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { getConversationForParticipant, sendTaskMessage } from "@workpay/shared/domain";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { taskConversations } from "@workpay/shared/db/schema/conversations";
import { AppError } from "@workpay/shared/platform";

const sendMessageSchema = z
  .object({
    clientMessageId: z.string().min(8).max(64),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to access conversations.");
    const { id: conversationId } = await params;
    const after = new URL(req.url).searchParams.get("after");
    const afterSequence = after === null ? undefined : Number(after);
    if (
      afterSequence !== undefined &&
      (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
    ) {
      throw new AppError("VALIDATION_ERROR", "The message cursor is invalid.");
    }
    return jsonOk(
      await getConversationForParticipant(getDb(), {
        conversationId,
        userId: actor.id,
        afterSequence,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id || (actor.kind !== "USER" && actor.kind !== "PROVIDER")) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "Only conversation participants can send messages.",
      );
    }
    const userId = actor.id;
    const { id: conversationId } = await params;
    const body = sendMessageSchema.parse(await req.json());
    const data = await withTransaction(async (tx) => {
      const [conversation] = await tx
        .select({
          id: taskConversations.id,
          buyerUserId: taskConversations.buyerUserId,
          providerUserId: taskConversations.providerUserId,
        })
        .from(taskConversations)
        .where(eq(taskConversations.id, conversationId))
        .limit(1);
      if (
        !conversation ||
        ![conversation.buyerUserId, conversation.providerUserId].includes(userId)
      ) {
        throw new AppError("NOT_FOUND", "Conversation not found.");
      }
      return sendTaskMessage(tx, {
        conversationId,
        authorUserId: userId,
        ...body,
        actor,
        correlationId: getCorrelationId(req),
      });
    });
    return jsonOk(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}
