import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";
import { getLatestReviewPackage, recordReviewPackageDecision } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const decisionSchema = z
  .object({
    packageId: z.string().min(1).max(64),
    decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED", "EXTERNAL_REVIEW_REQUESTED"]),
    reason: z.string().trim().min(8).max(4_000),
    expectedContractVersion: z.number().int().positive(),
    expectedContractHash: z.string().length(64),
    expectedSubmissionVersion: z.number().int().positive(),
    expectedSubmissionHash: z.string().length(64),
  })
  .strict();

function serializeReviewPackage(
  reviewPackage: NonNullable<Awaited<ReturnType<typeof getLatestReviewPackage>>>,
) {
  return {
    ...reviewPackage,
    createdAt: reviewPackage.createdAt.toISOString(),
    updatedAt: reviewPackage.updatedAt.toISOString(),
    reviewedAt: reviewPackage.reviewedAt?.toISOString() ?? null,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    await requireTaskOwner(req, taskId);
    const reviewPackage = await getLatestReviewPackage(getDb(), taskId);
    return jsonOk(reviewPackage ? serializeReviewPackage(reviewPackage) : null);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required for buyer review.");
    }
    const parsed = decisionSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "The review decision is invalid.", {
        details: { issues: parsed.error.flatten() },
      });
    }
    return withIdempotency(
      `buyer_review:${taskId}:${parsed.data.packageId}`,
      req,
      parsed.data,
      async () => {
        const reviewPackage = await withTransaction((tx) =>
          recordReviewPackageDecision(tx, {
            ...parsed.data,
            buyerUserId: actor.id,
            actor,
            correlationId: getCorrelationId(req),
          }),
        );
        return { status: 201, data: serializeReviewPackage(reviewPackage) };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
