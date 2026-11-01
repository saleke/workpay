import { z } from "zod";
import { getDb, getCorrelationId, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { startTaskConversation, listTaskConversations } from "@workpay/shared/domain";
import { requireTaskOwner } from "@/lib/server/conversation-auth";

const startConversationSchema = z
  .object({
    providerId: z.string().min(1).max(64),
    expectedContractVersion: z.number().int().positive(),
    expectedContractHash: z.string().regex(/^[a-f0-9]{64}$/i),
    initialMessage: z.string().trim().min(1).max(5_000),
    clientMessageId: z.string().min(8).max(64),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    const data = await listTaskConversations(getDb(), { taskId, userId: actor.id });
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    const body = startConversationSchema.parse(await req.json());
    const data = await withTransaction((tx) =>
      startTaskConversation(tx, {
        taskId,
        buyerUserId: actor.id,
        ...body,
        actor,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}
