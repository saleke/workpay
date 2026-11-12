import { z } from "zod";
import { getCorrelationId, jsonError, withIdempotency, withTransaction } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { completePaidWorkReview } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const completeSchema = z.object({ summary: z.string().trim().min(20).max(8_000) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reviewId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const body = completeSchema.parse(await req.json());
    return await withIdempotency(
      "complete_paid_review",
      req,
      { reviewId, reviewerUserId: user.id, ...body },
      async () => {
        const review = await withTransaction((tx) =>
          completePaidWorkReview(tx, {
            reviewId,
            summary: body.summary,
            actor,
            correlationId: getCorrelationId(req),
          }),
        );
        return { status: 200, data: { reviewId: review.id, completed: true } };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
