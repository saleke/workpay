import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, jsonError, resolveActorAsync } from "@/lib/server/api";
import { getEnv, logger } from "@workpay/shared/platform";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required to request verification email" }, 401);
    }

    const db = getDb();
    const actorId = actor.id;

    const [user] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    if (!user) {
      return jsonError({ code: "NOT_FOUND", message: "User not found" }, 404);
    }

    if (user.emailVerified) {
      return NextResponse.json({
        alreadyVerified: true,
        message: "Your email address is already verified.",
      });
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const identifier = user.email.toLowerCase();

    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await db.insert(verificationTokens).values({
      identifier,
      token,
      expires,
    });

    const env = getEnv();
    const appUrl = env.APP_URL.replace(/\/$/, "");
    const verificationUrl = `${appUrl}/api/v1/auth/verify-email?token=${token}`;

    logger.info({ userId: actorId, email: identifier, verificationUrl }, "generated authentic email verification link");

    return NextResponse.json({
      success: true,
      email: identifier,
      verificationUrl,
      expiresAt: expires.toISOString(),
      message: `A verification link has been generated for ${identifier}. Click below or check server logs to verify.`,
    });
  } catch (error) {
    logger.error({ err: String(error) }, "failed to generate email verification link");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to send verification email" }, 500);
  }
}
