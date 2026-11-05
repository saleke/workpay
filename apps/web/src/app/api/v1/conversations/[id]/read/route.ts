import { z } from "zod";
import { jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { markConversationRead } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const markReadSchema = z
  .object({
    lastReadSequence: z.number().int().nonnegative(),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id || (actor.kind !== "USER" && actor.kind !== "PROVIDER")) {
      throw new AppError("AUTHORIZATION_ERROR", "Sign in to access your messages.");
    }
    const userId = actor.id;
    const { id: conversationId } = await params;
    const body = markReadSchema.parse(await req.json());
    const result = await withTransaction((tx) =>
      markConversationRead(tx, { conversationId, userId, ...body }),
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
