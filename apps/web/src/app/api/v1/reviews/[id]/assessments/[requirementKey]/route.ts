import { z } from "zod";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkReviewDto } from "@/lib/server/work-review";
import { recordWorkReviewAssessment } from "@workpay/shared/domain";

const assessmentSchema = z
  .object({
    status: z.enum(["MET", "PARTIAL", "NOT_MET", "UNCLEAR", "NOT_APPLICABLE"]),
    rationale: z.string().trim().max(4_000).optional(),
  })
  .strict();

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; requirementKey: string }> },
) {
  try {
    const { id: reviewId, requirementKey } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    const body = assessmentSchema.parse(await req.json());
    await withTransaction((tx) =>
      recordWorkReviewAssessment(tx, {
        reviewId,
        requirementKey,
        ...body,
        actor,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(await buildWorkReviewDto(getDb(), reviewId, user.id));
  } catch (error) {
    return jsonError(error);
  }
}
