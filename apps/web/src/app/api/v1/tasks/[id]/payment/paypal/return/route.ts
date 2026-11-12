import { NextResponse } from "next/server";
import { getCorrelationId } from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";
import { authorizeApprovedPayPalOrder } from "@workpay/shared/domain";
import { getEnv, logger } from "@workpay/shared/platform";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const { id: taskId } = await params;
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("token");
    const state = url.searchParams.get("state");
    if (!orderId || !state) throw new Error("PayPal callback omitted order or state.");
    const { actor } = await requireTaskOwner(req, taskId);
    await authorizeApprovedPayPalOrder({
      taskId,
      externalOrderId: orderId,
      approvalState: state,
      actor,
      correlationId: getCorrelationId(req),
    });
    return NextResponse.redirect(
      `${appUrl}/tasks/${encodeURIComponent(taskId)}?section=execution&paypal=authorized`,
    );
  } catch (error) {
    logger.error({ err: String(error), taskId }, "PayPal order authorization callback failed");
    return NextResponse.redirect(
      `${appUrl}/tasks/${encodeURIComponent(taskId)}?paypal=authorization_failed`,
    );
  }
}
