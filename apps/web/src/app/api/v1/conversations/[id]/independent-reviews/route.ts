import {
  listIndependentReviewEngagements,
  proposeIndependentReview,
} from "@workpay/shared/domain";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to view review engagements.");
    const { id: conversationId } = await params;
    const engagements = await listIndependentReviewEngagements(getDb(), {
      conversationId,
      userId: actor.id,
    });
    return jsonOk(engagements);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if ((actor.kind !== "USER" && actor.kind !== "PROVIDER") || !actor.id) {
      throw new AppError("AUTHORIZATION_ERROR", "Only task participants can propose a reviewer.");
    }
    const { id: conversationId } = await params;
    const proposal = await req.json();
    const engagement = await withTransaction((tx) =>
      proposeIndependentReview(tx, {
        conversationId,
        actor,
        proposal,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(engagement, 201);
  } catch (error) {
    return jsonError(error);
  }
}
