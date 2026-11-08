import { getCorrelationId, jsonError, withIdempotency } from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";
import { releasePaymentForTask } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required for payment release.");
    }
    return withIdempotency("release_task_payment", req, { taskId }, async () => {
      const data = await releasePaymentForTask({
        taskId,
        actor,
        correlationId: getCorrelationId(req),
      });
      return { status: 200, data };
    });
  } catch (error) {
    return jsonError(error);
  }
}
