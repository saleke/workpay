import { z } from "zod";
import { getCorrelationId, jsonError, withIdempotency } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { approvePaymentReleaseForTask, releasePaymentForTask } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const releaseSchema = z
  .object({
    expectedPaymentId: z.string().min(1).max(64),
    expectedAmountMinor: z.number().int().nonnegative(),
    expectedCurrency: z.literal("USD"),
    confirm: z.literal(true),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required for payment release.");
    }
    const body = releaseSchema.parse(await req.json());
    return await withIdempotency(
      "release_task_payment",
      req,
      { taskId, actorId: actor.id, ...body },
      async () => {
        await approvePaymentReleaseForTask({
          taskId,
          expectedPaymentId: body.expectedPaymentId,
          expectedAmountMinor: body.expectedAmountMinor,
          expectedCurrency: body.expectedCurrency,
          actor,
          correlationId: getCorrelationId(req),
        });
        const data = await releasePaymentForTask({
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
