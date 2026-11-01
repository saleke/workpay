import {
  getCorrelationId,
  jsonError,
  withIdempotency,
} from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";
import { simulateAuthorizationAndAssign } from "@workpay/shared/domain";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    return withIdempotency(
      "simulate_payment_authorization",
      req,
      { taskId },
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
