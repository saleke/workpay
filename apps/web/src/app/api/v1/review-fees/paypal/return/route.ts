import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCorrelationId, getDb } from "@/lib/server/api";
import { independentReviewEngagements } from "@workpay/shared/db/schema/independent-reviews";
import { reviewFeePayments } from "@workpay/shared/db/schema/review-fees";
import { completeReviewFeePayPal } from "@workpay/shared/domain";
import { getEnv, logger } from "@workpay/shared/platform";

export async function GET(req: Request) {
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const fallback = (result: string) =>
    NextResponse.redirect(`${appUrl}/messages?reviewFee=${encodeURIComponent(result)}`);
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const token = url.searchParams.get("token");
    if (!state || !token) return fallback("missing_callback_data");
    const [context] = await getDb()
      .select({
        conversationId: independentReviewEngagements.conversationId,
        payerUserId: reviewFeePayments.payerUserId,
      })
      .from(reviewFeePayments)
      .innerJoin(
        independentReviewEngagements,
        eq(independentReviewEngagements.id, reviewFeePayments.engagementId),
      )
      .where(eq(reviewFeePayments.externalOrderId, token))
      .limit(1);
    if (!context) return fallback("invalid_order");
    await completeReviewFeePayPal({
      externalOrderId: token,
      state,
      payerUserId: context.payerUserId,
      actor: { kind: "USER", id: context.payerUserId, role: "buyer" },
      correlationId: getCorrelationId(req),
    });
    return NextResponse.redirect(
      `${appUrl}/messages?conversation=${encodeURIComponent(context.conversationId)}&reviewFee=paid`,
    );
  } catch (error) {
    logger.error({ err: String(error) }, "Review fee PayPal callback failed");
    return fallback("callback_failed");
  }
}
