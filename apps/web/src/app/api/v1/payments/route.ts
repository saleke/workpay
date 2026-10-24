import { desc } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { payments, paymentDecisions } from "@workpay/shared/db/schema/payments";
import type { PaymentDto } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req, "buyer");
    const db = getDb();

    const rows = await db
      .select()
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(50);

    const data: PaymentDto[] = rows.map((p) => ({
      id: p.id,
      taskId: p.taskId,
      agreementId: p.agreementId,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      paypalAuthorizationId: p.providerAuthorizationId,
      paypalCaptureId: p.providerCaptureId,
      authorizedAt: p.authorizedAt?.toISOString() ?? null,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      latestDecision: null,
    }));

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
