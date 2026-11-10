import { getCorrelationId, jsonError, withIdempotency } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { reconcileReviewFeePayment } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reviewFeePaymentId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    return withIdempotency(
      "reconcile_review_fee",
      req,
      { reviewFeePaymentId, payerUserId: user.id },
      async () => ({
        status: 200,
        data: await reconcileReviewFeePayment({
          reviewFeePaymentId,
          actor,
          correlationId: getCorrelationId(req),
        }),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
