import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const db = getDb();

    await db
      .update(users)
      .set({
        paypalPayoutEmail: null,
        paypalPayerId: null,
        paypalLinkedAt: null,
        paypalVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    return jsonOk({
      success: true,
      message: "PayPal account unlinked successfully.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
