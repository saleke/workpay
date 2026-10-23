import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb, jsonError, resolveActorAsync } from "@/lib/server/api";
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

    // Clear all pending tokens for this email
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));

    logger.info({ email }, "email successfully verified via confirmation link");

    return NextResponse.redirect(`${settingsUrl}&success=email_verified`);
  } catch (error) {
    logger.error({ err: String(error) }, "error verifying email with confirmation token");
    return NextResponse.redirect(`${settingsUrl}&error=verification_failed`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string; code?: string };
    const rawValue = (body.code || body.token)?.trim();

    if (!rawValue) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Verification token or 6-digit code is required" }, 400);
    }

    const db = getDb();
    const now = new Date();
    const actor = await resolveActorAsync(req);

    // If actor is signed in, check if code matches their email; otherwise lookup by token
    let actorEmail: string | null = null;
    if (actor.id) {
      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, actor.id))
        .limit(1);
      if (u) {
        actorEmail = u.email;
      }
    }

    let tokenRecord;
    if (actorEmail) {
      const results = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, rawValue),
            eq(verificationTokens.identifier, actorEmail.toLowerCase()),
            gt(verificationTokens.expires, now),
          ),
        )
        .limit(1);
      tokenRecord = results[0];
    }

    if (!tokenRecord) {
      const results = await db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.token, rawValue), gt(verificationTokens.expires, now)))
        .limit(1);
      tokenRecord = results[0];
    }

    if (!tokenRecord) {
      return jsonError(
        {
          code: "INVALID_CODE",
          message: "The 6-digit code or confirmation link is invalid or has expired. Please request a new code.",
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

    // Delete all tokens for this email
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));

    logger.info({ email, actorId: actor.id }, "email verified successfully via OTP / code verification");

    return NextResponse.json({
      success: true,
      email,
      verified: true,
      message: "Email address verified successfully.",
    });
  } catch (error) {
    logger.error({ err: String(error) }, "error verifying email code");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to verify email code" }, 500);
  }
}
