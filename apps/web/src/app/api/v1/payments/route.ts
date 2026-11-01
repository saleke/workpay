import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { payments, paymentDecisions } from "@workpay/shared/db/schema/payments";
import { tasks } from "@workpay/shared/db/schema/tasks";
import type { PaymentDto } from "@/lib/api/types";
import { requireBuyerActor } from "@/lib/server/conversation-auth";

export async function GET(req: Request) {
  try {
    const actor = await requireBuyerActor(req);
    const db = getDb();

    const rows = await db
      .select({ payment: payments })
      .from(payments)
      .innerJoin(tasks, eq(payments.taskId, tasks.id))
      .where(eq(tasks.userId, actor.id))
      .orderBy(desc(payments.createdAt))
      .limit(50);

    const data: PaymentDto[] = rows.map(({ payment: p }) => ({
      id: p.id,
      taskId: p.taskId,
      agreementId: p.agreementId,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      mode: "SIMULATED",
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
