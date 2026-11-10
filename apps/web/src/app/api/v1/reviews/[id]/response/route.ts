import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { requireProviderPrincipal } from "@/lib/server/conversation-auth";
import { buildWorkReviewDto } from "@/lib/server/work-review";
import { respondToWorkReviewRequest } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const responseSchema = z
  .object({
    action: z.enum(["PREPARE", "REQUEST_CLARIFICATION", "SEND_PACKAGE"]),
    summary: z.string().trim().max(8_000).optional(),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reviewId } = await params;
    const { actor } = await requireProviderPrincipal(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const body = responseSchema.parse(await req.json());
    return withIdempotency(
      "respond_work_review",
      req,
      { reviewId, providerUserId: actor.id, ...body },
      async () => {
        await withTransaction((tx) =>
          respondToWorkReviewRequest(tx, {
            reviewId,
            ...body,
            actor,
            correlationId: getCorrelationId(req),
          }),
        );
        return { status: 200, data: await buildWorkReviewDto(getDb(), reviewId, actor.id) };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
