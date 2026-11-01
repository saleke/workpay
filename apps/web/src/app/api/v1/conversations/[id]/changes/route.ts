import { z } from "zod";
import { createContractChangeRequest, listContractChangeRequests } from "@workpay/shared/domain";
import { contractChangePatchSchema } from "@workpay/shared/domain";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

const createSchema = z
  .object({
    expectedContractVersion: z.number().int().positive(),
    expectedContractHash: z.string().regex(/^[a-f0-9]{64}$/i),
    reason: z.string().trim().min(8).max(2_000),
    patch: contractChangePatchSchema,
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to view change proposals.");
    const { id: conversationId } = await params;
    return jsonOk(await listContractChangeRequests(getDb(), { conversationId, userId: actor.id }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if ((actor.kind !== "USER" && actor.kind !== "PROVIDER") || !actor.id) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "Only conversation participants can propose changes.",
      );
    }
    const { id: conversationId } = await params;
    const body = createSchema.parse(await req.json());
    const result = await withTransaction((tx) =>
      createContractChangeRequest(tx, {
        conversationId,
        actor,
        ...body,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
