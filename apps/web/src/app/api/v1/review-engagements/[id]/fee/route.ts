import { getCorrelationId, getDb, jsonError, jsonOk, withIdempotency } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { createReviewFeeOrder, getReviewFeeStatus } from "@workpay/shared/domain";
import { AppError, getEnv } from "@workpay/shared/platform";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const { user } = await requireAuthenticatedSession(req);
    const status = await getReviewFeeStatus(getDb(), engagementId, user.id);
    return jsonOk({
      engagement: status.engagement,
      payments: status.payments.map((payment) => ({
        id: payment.id,
        payerUserId: payment.payerUserId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        mode: payment.mode,
        status: payment.status,
        approvalUrl: payment.approvalUrl,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    return await withIdempotency(
      "create_review_fee_order",
      req,
      { engagementId, payerUserId: user.id },
      async () => {
        const data = await createReviewFeeOrder({
          engagementId,
          payerUserId: user.id,
          actor,
          correlationId: getCorrelationId(req),
          appUrl: getEnv().APP_URL,
        });
        return { status: data.paid ? 200 : 201, data };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
