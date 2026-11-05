import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import { listMessageInbox } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

export async function GET(req: Request) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id || (actor.kind !== "USER" && actor.kind !== "PROVIDER")) {
      throw new AppError("AUTHORIZATION_ERROR", "Sign in to access your messages.");
    }
    return jsonOk(await listMessageInbox(getDb(), actor.id));
  } catch (error) {
    return jsonError(error);
  }
}
