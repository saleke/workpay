import { z } from "zod";
import { getCorrelationId, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { withdrawTaskConversation } from "@workpay/shared/domain";
import { requireProviderActor } from "@/lib/server/conversation-auth";

const withdrawalSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireProviderActor(req);
    const { id: conversationId } = await params;
    const body = withdrawalSchema.parse(await req.json());
    const data = await withTransaction((tx) =>
      withdrawTaskConversation(tx, {
        conversationId,
        providerUserId: actor.id,
        ...body,
        actor,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk({ id: conversationId, status: data.status });
  } catch (error) {
    return jsonError(error);
  }
}
