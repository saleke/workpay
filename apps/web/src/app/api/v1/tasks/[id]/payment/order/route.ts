import { getCorrelationId, jsonError, withIdempotency } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { createPayPalOrderForTask } from "@workpay/shared/domain";
import { AppError, getEnv } from "@workpay/shared/platform";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const { id: taskId } = await params;
    const { actor } = await requireAuthenticatedSession(req);
    return await withIdempotency(
      "create_paypal_order",
      req,
      { taskId, actorId: actor.id },
      async () => {
        const data = await createPayPalOrderForTask({
          taskId,
          actor,
          correlationId: getCorrelationId(req),
          appUrl: getEnv().APP_URL,
        });
        return { status: data.reused ? 200 : 201, data };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
