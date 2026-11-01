import { submitIndependentReviewReport } from "@workpay/shared/domain";
import { getCorrelationId, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; engagementId: string }> },
) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to submit a review report.");
    const { id: conversationId, engagementId } = await params;
    const report = await req.json();
    const result = await withTransaction((tx) =>
      submitIndependentReviewReport(tx, {
        engagementId,
        conversationId,
        actor,
        report,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
