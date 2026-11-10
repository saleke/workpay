import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkReviewDto } from "@/lib/server/work-review";
import { listWorkReviewsForTask, openWorkReview } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const openReviewSchema = z
  .object({
    kind: z.enum(["CHECKPOINT", "FINAL"]),
    title: z.string().trim().min(3).max(160),
    openingNote: z.string().trim().min(8).max(8_000),
    requirementKeys: z.array(z.string().min(1).max(128)).max(200),
    responseWindowDays: z.number().int().min(1).max(30),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { user } = await requireAuthenticatedSession(req);
    const reviews = await listWorkReviewsForTask(getDb(), { taskId, userId: user.id });
    return jsonOk(
      await Promise.all(reviews.map((review) => buildWorkReviewDto(getDb(), review.id, user.id))),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const body = openReviewSchema.parse(await req.json());
    return withIdempotency(
      "open_work_review",
      req,
      { taskId, userId: user.id, ...body },
      async () => {
        const review = await withTransaction((tx) =>
          openWorkReview(tx, {
            taskId,
            buyerUserId: user.id,
            ...body,
            actor,
            correlationId: getCorrelationId(req),
          }),
        );
        return { status: 201, data: await buildWorkReviewDto(getDb(), review.id, user.id) };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
