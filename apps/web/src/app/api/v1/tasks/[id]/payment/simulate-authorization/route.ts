import { getCorrelationId, jsonError, withIdempotency } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { simulateAuthorizationAndAssign } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    return withIdempotency(
      "simulate_payment_authorization",
      req,
      { taskId, actorId: actor.id },
      async () => {
      const data = await simulateAuthorizationAndAssign({
        taskId,
        actor,
        correlationId: getCorrelationId(req),
      });
      return { status: 200, data };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
