import { z } from "zod";
import { activateContractChangeRequest } from "@workpay/shared/domain";
import { getCorrelationId, jsonError, jsonOk } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

const paramsSchema = z.object({
  id: z.string().min(1),
  changeId: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  try {
    const actor = await resolveConversationActor(req);
    if ((actor.kind !== "USER" && actor.kind !== "PROVIDER") || !actor.id) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "Only conversation participants can activate changes.",
      );
    }
    const parsedParams = paramsSchema.parse(await params);
    const result = await activateContractChangeRequest({
      conversationId: parsedParams.id,
      changeRequestId: parsedParams.changeId,
      actor,
      correlationId: getCorrelationId(req),
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
