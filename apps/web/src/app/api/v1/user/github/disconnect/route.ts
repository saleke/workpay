import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, jsonError, resolveActorAsync } from "@/lib/server/api";
import { logger } from "@workpay/shared/platform";
import { users } from "@workpay/shared/db/schema/identity";

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required" }, 401);
    }

    const db = getDb();
    await db
      .update(users)
      .set({
        githubUsername: null,
        githubVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actor.id));

    logger.info({ userId: actor.id }, "unlinked github developer profile");

    return NextResponse.json({ success: true, message: "GitHub profile disconnected" });
  } catch (error) {
    logger.error({ err: String(error) }, "failed to disconnect github profile");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to disconnect GitHub profile" }, 500);
  }
}
