import { jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { destroyAllOtherSessionsForUser, getRequestSessionToken } from "@/lib/server/session";

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }

    const keepSessionToken = getRequestSessionToken(req);

    await destroyAllOtherSessionsForUser(actor.id, keepSessionToken);

    return jsonOk({
      data: {
        message: "Signed out all other sessions successfully.",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
