import { z } from "zod";
import { decideIndependentReviewEngagement } from "@workpay/shared/domain";
import { getCorrelationId, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

const decisionSchema = z
  .object({
    decision: z.enum(["accept", "decline"]),
    confirmNoConflict: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; engagementId: string }> },
) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to respond to a review.");
    const { id: conversationId, engagementId } = await params;
    const body = decisionSchema.parse(await req.json());
    const engagement = await withTransaction((tx) =>
      decideIndependentReviewEngagement(tx, {
        engagementId,
        conversationId,
        actor,
        ...body,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(engagement);
  } catch (error) {
    return jsonError(error);
  }
}
