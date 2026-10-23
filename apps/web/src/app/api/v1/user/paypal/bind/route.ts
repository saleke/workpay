import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { validateEmailForRegistration } from "@/lib/server/disposable-emails";

const bindPaypalSchema = z.object({
  paypalEmail: z.string().trim().toLowerCase().email("Please enter a valid PayPal account email address"),
  payerId: z.string().trim().optional(),
  autoHoldEnabled: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const body = await req.json();
    const parsed = bindPaypalSchema.parse(body);
    const db = getDb();

    // Verify email is not a disposable address
    const emailValidation = validateEmailForRegistration(parsed.paypalEmail);
    if (!emailValidation.ok) {
      return jsonError({ code: "VALIDATION_ERROR", message: emailValidation.message }, 400);
    }

    // Generate simulated PayPal Payer ID if not provided by PayPal OAuth callback
    const payerId =
      parsed.payerId ||
      `PAYER-${Math.random().toString(36).substring(2, 8).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const linkedAt = new Date();

    // Update users table with bound PayPal credentials
    await db
      .update(users)
      .set({
        paypalPayoutEmail: parsed.paypalEmail,
        paypalPayerId: payerId,
        paypalLinkedAt: linkedAt,
        paypalVerified: true,
        paypalAutoHoldEnabled: parsed.autoHoldEnabled,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    // Also update providers payoutEmail so specialist disbursements target the bound PayPal account
    await db
      .update(providers)
      .set({
        payoutEmail: parsed.paypalEmail,
        updatedAt: new Date(),
      })
      .where(eq(providers.userId, actorId));

    return jsonOk({
      success: true,
      paypalPayoutEmail: parsed.paypalEmail,
      paypalPayerId: payerId,
      paypalLinkedAt: linkedAt.toISOString(),
      paypalVerified: true,
      paypalAutoHoldEnabled: parsed.autoHoldEnabled,
      message: "PayPal account successfully bound for authorization holds and payout disbursements.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
