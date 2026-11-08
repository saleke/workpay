import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { isPersonaIdentityVerified } from "@workpay/shared/domain";
import { users } from "@workpay/shared/db/schema/identity";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }

    const db = getDb();
    const [user] = await db
      .select({
        idVerificationStatus: users.idVerificationStatus,
        idVerificationProvider: users.idVerificationProvider,
        idVerifiedAt: users.idVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);

    if (!user) {
      return jsonError({ code: "NOT_FOUND", message: "User account not found" }, 404);
    }

    const isVerified = isPersonaIdentityVerified(
      user.idVerificationStatus,
      user.idVerificationProvider,
    );

    return jsonOk({
      status: isVerified ? "VERIFIED" : "UNVERIFIED",
      isVerified,
      verifiedAt: isVerified ? (user.idVerifiedAt?.toISOString() ?? null) : null,
      provider: isVerified ? "Persona" : null,
      meaning:
        "An approved Persona inquiry confirms only the outcome reported by Persona. It is not a Tenfo certification of identity attributes, qualifications, or work quality.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
