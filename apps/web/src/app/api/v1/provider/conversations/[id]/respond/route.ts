import { z } from "zod";
import { getCorrelationId, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { respondToTaskConversation } from "@workpay/shared/domain";
import { requireProviderActor } from "@/lib/server/conversation-auth";

const responseSchema = z.object({ response: z.enum(["accept", "decline"]) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireProviderActor(req);
    const { id: conversationId } = await params;
    const body = responseSchema.parse(await req.json());
    const data = await withTransaction((tx) =>
      respondToTaskConversation(tx, {
        conversationId,
        providerUserId: actor.id,
        response: body.response,
        actor,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk({ id: data.id, status: data.status });
  } catch (error) {
    return jsonError(error);
  }
}
