import { eq } from "drizzle-orm";
import { getCorrelationId, getDb, jsonError, withIdempotency } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { payments } from "@workpay/shared/db/schema/payments";
import { reconcilePayPalPayment } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: paymentId } = await params;
    const { user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const [payment] = await getDb()
      .select({ buyerUserId: payments.buyerUserId })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!payment || payment.buyerUserId !== user.id) {
      throw new AppError("NOT_FOUND", "Payment not found.");
    }
    return withIdempotency("reconcile_paypal_payment", req, { paymentId, userId: user.id }, async () => {
      const data = await reconcilePayPalPayment({
        paymentId,
        correlationId: getCorrelationId(req),
      });
      return { status: 200, data };
    });
  } catch (error) {
    return jsonError(error);
  }
}
