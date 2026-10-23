import { randomBytes, randomInt } from "node:crypto";
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

    const identifier = user.email.toLowerCase();
    const linkToken = randomBytes(32).toString("hex");
    const otpCode = randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Clean up previous tokens for this email
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));

    // Insert both the 1-click URL link token and the 6-digit OTP code
    await db.insert(verificationTokens).values([
      {
        identifier,
        token: linkToken,
        expires,
      },
      {
        identifier,
        token: otpCode,
        expires,
      },
    ]);

    const env = getEnv();
    const appUrl = env.APP_URL.replace(/\/$/, "");
    const verificationUrl = `${appUrl}/api/v1/auth/verify-email?token=${linkToken}`;

    logger.info(
      { userId: actorId, email: identifier, otpCode, verificationUrl },
      "generated hybrid email verification link and 6-digit otp code",
    );

    return NextResponse.json({
      success: true,
      email: identifier,
      otpCode,
      verificationUrl,
      expiresAt: expires.toISOString(),
      message: `A verification link and 6-digit code have been dispatched for ${identifier}.`,
    });
  } catch (error) {
    logger.error({ err: String(error) }, "failed to generate email verification link and code");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to dispatch verification email" }, 500);
  }
}
