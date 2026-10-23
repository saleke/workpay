import { resolveMx } from "node:dns/promises";
import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, jsonError, resolveActorAsync } from "@/lib/server/api";
import { logger } from "@workpay/shared/platform";
import { verificationTokens } from "@workpay/shared/db/schema/identity";
import { isDisposableEmail } from "@/lib/server/disposable-emails";

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required to bind PayPal payout address" }, 401);
    }

    const body = (await req.json()) as { payoutEmail?: string };
    const email = body.payoutEmail?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return jsonError({ code: "VALIDATION_ERROR", message: "A valid PayPal payout email address is required" }, 400);
    }

    if (isDisposableEmail(email)) {
      return jsonError(
        {
          code: "DISPOSABLE_EMAIL_DENIED",
          message: "Disposable and temporary email providers are strictly rejected for payment settlements.",
        },
        400,
      );
    }

    const domain = email.split("@")[1];
    if (!domain) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Invalid email format" }, 400);
    }
    try {
      const records = await resolveMx(domain);
      if (!records || records.length === 0) {
        return jsonError(
          {
            code: "INVALID_MAIL_DOMAIN",
            message: `Mail domain '${domain}' does not have active MX records to receive payment receipts.`,
          },
          400,
        );
      }
    } catch {
      return jsonError(
        {
          code: "INVALID_MAIL_DOMAIN",
          message: `Mail domain '${domain}' cannot receive mail or does not exist.`,
        },
        400,
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const identifier = `paypal_payout:${actor.id}:${email}`;
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    const db = getDb();

    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await db.insert(verificationTokens).values({
      identifier,
      token: code,
      expires,
    });

    logger.info({ userId: actor.id, email, code }, "dispatched paypal payout email challenge code");

    return NextResponse.json({
      challengeSent: true,
      email,
      expiresAt: expires.toISOString(),
      code,
      message: `A 6-digit confirmation code was issued for ${email}. Enter the code below to complete binding.`,
    });
  } catch (error) {
    logger.error({ err: String(error) }, "failed to dispatch payout email verification code");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to initiate payout verification" }, 500);
  }
}
