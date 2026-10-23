import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb, jsonError } from "@/lib/server/api";
import { getEnv, logger } from "@workpay/shared/platform";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";

export async function GET(req: NextRequest) {
  const env = getEnv();
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const settingsUrl = `${appUrl}/settings?tab=account`;

  try {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.redirect(`${settingsUrl}&error=missing_token`);
    }

    const db = getDb();
    const now = new Date();

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(and(eq(verificationTokens.token, token), gt(verificationTokens.expires, now)))
      .limit(1);

    if (!tokenRecord) {
      return NextResponse.redirect(`${settingsUrl}&error=invalid_or_expired_token`);
    }

    const email = tokenRecord.identifier;
    await db
      .update(users)
      .set({
        emailVerified: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.email, email));

    await db.delete(verificationTokens).where(eq(verificationTokens.token, token));

    logger.info({ email }, "email successfully verified via token link");

    return NextResponse.redirect(`${settingsUrl}&success=email_verified`);
  } catch (error) {
    logger.error({ err: String(error) }, "error verifying email with token");
    return NextResponse.redirect(`${settingsUrl}&error=verification_failed`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Verification token is required" }, 400);
    }

    const db = getDb();
    const now = new Date();

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(and(eq(verificationTokens.token, token), gt(verificationTokens.expires, now)))
      .limit(1);

    if (!tokenRecord) {
      return jsonError(
        {
          code: "INVALID_TOKEN",
          message: "The verification link is invalid or has expired. Please request a new verification email.",
        },
        400,
      );
    }

    const email = tokenRecord.identifier;
    await db
      .update(users)
      .set({
        emailVerified: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.email, email));

    await db.delete(verificationTokens).where(eq(verificationTokens.token, token));

    return NextResponse.json({
      success: true,
      email,
      verified: true,
      message: "Email address verified successfully.",
    });
  } catch (error) {
    logger.error({ err: String(error) }, "error in programmatic email verification");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to verify email" }, 500);
  }
}
