import { and, eq, notInArray } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { paypalIdentityLinks } from "@workpay/shared/db/schema/paypal";
import { payments } from "@workpay/shared/db/schema/payments";
import { getConfiguredNewPaymentMode, paymentModeEnvironment } from "@workpay/shared/integrations";
import { AppError } from "@workpay/shared/platform";

async function unlink(req: Request) {
  try {
    const { user } = await requireAuthenticatedSession(req);
    if (user.accountClass !== "MEMBER") {
      throw new AppError("POLICY_DENIED", "Evaluator accounts have no linked PayPal account.");
    }
    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    const db = getDb();
    const [activePayment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.buyerUserId, user.id),
          eq(payments.mode, mode),
          notInArray(payments.status, ["CAPTURED", "VOIDED", "REFUNDED", "FAILED"]),
        ),
      )
      .limit(1);
    if (activePayment) {
      throw new AppError(
        "DOMAIN_CONFLICT",
        "Finish or cancel active PayPal payments before unlinking this account.",
      );
    }
    await db.transaction(async (tx) => {
      await tx
        .update(paypalIdentityLinks)
        .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(paypalIdentityLinks.userId, user.id),
            eq(paypalIdentityLinks.environment, environment),
          ),
        );
    });
    return jsonOk({ unlinked: true, environment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  return unlink(req);
}

export async function POST(req: Request) {
  return unlink(req);
}
