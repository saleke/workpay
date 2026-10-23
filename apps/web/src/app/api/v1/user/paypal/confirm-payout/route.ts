import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb, jsonError, resolveActorAsync } from "@/lib/server/api";
import { logger } from "@workpay/shared/platform";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required to confirm PayPal payout address" }, 401);
    }

    const body = (await req.json()) as { payoutEmail?: string; code?: string };
    const email = body.payoutEmail?.trim().toLowerCase();
    const code = body.code?.trim();

    if (!email || !code) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Email and confirmation code are required" }, 400);
    }

    const identifier = `paypal_payout:${actor.id}:${email}`;
    const db = getDb();
    const now = new Date();

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.token, code),
          gt(verificationTokens.expires, now),
        ),
      )
      .limit(1);

    if (!tokenRecord) {
      return jsonError(
        {
          code: "INVALID_CONFIRMATION_CODE",
          message: "The confirmation code is invalid or has expired. Please request a new code.",
        },
        400,
      );
    }

    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));

    const actorId = actor.id;
    await db
      .update(users)
      .set({
        paypalPayoutEmail: email,
        paypalVerified: true,
        paypalLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    await db
      .update(providers)
      .set({
        payoutEmail: email,
        updatedAt: new Date(),
      })
      .where(eq(providers.userId, actorId));

    logger.info({ userId: actorId, email }, "confirmed and bound paypal payout email");

    return NextResponse.json({
      success: true,
      email,
      verified: true,
      message: "PayPal payout destination confirmed and bound successfully.",
    });
  } catch (error) {
    logger.error({ err: String(error) }, "failed to confirm payout email challenge");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to confirm payout verification" }, 500);
  }
}
