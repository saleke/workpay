import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkReviewDto } from "@/lib/server/work-review";
import { decideWorkReview } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const decisionSchema = z
  .object({
    decision: z.enum([
      "ACCEPT_CHECKPOINT",
      "ACCEPT_FINAL",
      "REQUEST_CHANGES",
      "CANCEL_REVIEW",
      "REFER_TO_REVIEWER",
      "EXPRESS_DISSATISFACTION",
    ]),
    reason: z.string().trim().min(8).max(4_000),
    riskAcknowledged: z.boolean().default(false),
    dissatisfactionRemedy: z.enum(["REVISION", "PAID_REVIEW", "CANCEL", "OTHER"]).optional(),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reviewId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const body = decisionSchema.parse(await req.json());
    return await withIdempotency(
      "decide_work_review",
      req,
      { reviewId, userId: user.id, ...body },
      async () => {
        await withTransaction((tx) =>
          decideWorkReview(tx, {
            reviewId,
            ...body,
            actor,
            correlationId: getCorrelationId(req),
          }),
        );
        return { status: 200, data: await buildWorkReviewDto(getDb(), reviewId, user.id) };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
