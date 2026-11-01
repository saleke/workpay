import { z } from "zod";
import { decideContractChangeRequest } from "@workpay/shared/domain";
import { getCorrelationId, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

const decisionSchema = z
  .object({
    decision: z.enum([
      "accept",
      "decline",
      "withdraw",
      "request-cancellation",
      "confirm-cancellation",
    ]),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  try {
    const actor = await resolveConversationActor(req);
    if ((actor.kind !== "USER" && actor.kind !== "PROVIDER") || !actor.id) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "Only conversation participants can decide changes.",
      );
    }
    const { id: conversationId, changeId } = await params;
    const body = decisionSchema.parse(await req.json());
    const result = await withTransaction((tx) =>
      decideContractChangeRequest(tx, {
        conversationId,
        changeRequestId: changeId,
        actor,
        ...body,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
