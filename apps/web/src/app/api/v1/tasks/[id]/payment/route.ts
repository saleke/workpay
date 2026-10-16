import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { getPaymentForTask } from "@workpay/shared/domain";
import { paymentDecisions, paymentPolicyChecks } from "@workpay/shared/db/schema/payments";
import type { PaymentDto, PaymentDecisionDto } from "@/lib/api/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();
    const payment = await getPaymentForTask(db, taskId);

    if (!payment) {
      return jsonOk(null);
    }

    let latestDecisionDto: PaymentDecisionDto | null = null;
    const [decision] = await db
      .select()
      .from(paymentDecisions)
      .where(eq(paymentDecisions.paymentId, payment.id))
      .orderBy(desc(paymentDecisions.createdAt))
      .limit(1);

    if (decision) {
      const checks = await db
        .select()
        .from(paymentPolicyChecks)
        .where(eq(paymentPolicyChecks.decisionId, decision.id));

      const decisionDetail = (decision.detail ?? {}) as Record<string, unknown>;
      const reasonText = typeof decisionDetail.reason === "string" ? decisionDetail.reason : decision.reasonCode;

      latestDecisionDto = {
        id: decision.id,
        action: decision.action,
        result: decision.result,
        reasonCode: decision.reasonCode,
        reason: reasonText,
        policyVersion: decision.policyVersion,
        checks: checks.map((c) => ({
          id: c.id,
          checkKey: c.checkId,
          label: c.checkId.replace(/_/g, " "),
          result: c.result,
          reason: c.message,
        })),
        createdAt: decision.createdAt.toISOString(),
      };
    }

    const data: PaymentDto = {
      id: payment.id,
      taskId: payment.taskId,
      agreementId: payment.agreementId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
      paypalAuthorizationId: payment.providerAuthorizationId,
      paypalCaptureId: payment.providerCaptureId,
      authorizedAt: payment.authorizedAt?.toISOString() ?? null,
      capturedAt: payment.capturedAt?.toISOString() ?? null,
      latestDecision: latestDecisionDto,
    };

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
