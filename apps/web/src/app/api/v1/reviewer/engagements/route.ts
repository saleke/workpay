import { listReviewerEngagements } from "@workpay/shared/domain";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { AppError } from "@workpay/shared/platform";

export async function GET(req: Request) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) {
      throw new AppError("AUTHORIZATION_ERROR", "Sign in with your reviewer profile.");
    }
    return jsonOk(await listReviewerEngagements(getDb(), actor.id));
  } catch (error) {
    return jsonError(error);
  }
}
