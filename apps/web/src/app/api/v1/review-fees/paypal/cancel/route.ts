import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { independentReviewEngagements } from "@workpay/shared/db/schema/independent-reviews";
import { reviewFeePayments } from "@workpay/shared/db/schema/review-fees";
import { cancelReviewFeeOrder } from "@workpay/shared/domain";
import { getEnv } from "@workpay/shared/platform";

export async function GET(req: Request) {
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const token = url.searchParams.get("token");
    if (!state || !token) throw new Error("Missing cancellation data");
    const { actor } = await requireAuthenticatedSession(req);
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
    if (!context) throw new Error("Review fee order was not found.");
    await cancelReviewFeeOrder({
      state,
      externalOrderId: token,
      payerUserId: context.payerUserId,
      actor,
    });
    return NextResponse.redirect(
      `${appUrl}/messages?conversation=${encodeURIComponent(context.conversationId)}&reviewFee=cancelled`,
    );
  } catch {
    return NextResponse.redirect(`${appUrl}/messages?reviewFee=cancel_failed`);
  }
}
