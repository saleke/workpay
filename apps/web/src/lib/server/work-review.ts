import { eq } from "drizzle-orm";
import type { Database } from "@workpay/shared/db";
import { providers } from "@workpay/shared/db/schema/providers";
import { tasks } from "@workpay/shared/db/schema/tasks";
import { commercialAgreements } from "@workpay/shared/db/schema/negotiation";
import { getWorkReviewDetail } from "@workpay/shared/domain";
import type { WorkReviewDto } from "@/lib/api/types";

export async function buildWorkReviewDto(
  db: Database,
  reviewId: string,
  userId: string,
): Promise<WorkReviewDto> {
  const detail = await getWorkReviewDetail(db, { reviewId, userId });
  const [[provider], [task], [agreement]] = await Promise.all([
    db
      .select({ userId: providers.userId })
      .from(providers)
      .where(eq(providers.id, detail.execution.providerId))
      .limit(1),
    db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, detail.task.id)).limit(1),
    db
      .select({ conversationId: commercialAgreements.sourceConversationId })
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, detail.execution.agreementId))
      .limit(1),
  ]);
  const currentUserRole =
    userId === detail.task.userId
      ? "CLIENT"
      : userId === provider?.userId
        ? "PROVIDER"
        : "REVIEWER";
  return {
    id: detail.review.id,
    taskId: detail.review.taskId,
    executionId: detail.review.executionId,
    conversationId: agreement?.conversationId ?? null,
    contractId: detail.review.contractId,
    contractVersion: detail.review.contractVersion,
    contractHash: detail.review.contractHash,
    sequence: detail.review.sequence,
    kind: detail.review.kind,
    status: detail.review.status,
    title: detail.review.title,
    openingNote: detail.review.openingNote,
    requirementKeys: Array.isArray(detail.review.requirementKeys)
      ? detail.review.requirementKeys.filter((key): key is string => typeof key === "string")
      : [],
    responseWindowDays: detail.review.responseWindowDays,
    responseDueAt: detail.review.responseDueAt?.toISOString() ?? null,
    openedByUserId: detail.review.openedByUserId,
    providerResponseSummary: detail.review.providerResponseSummary,
    providerRespondedAt: detail.review.providerRespondedAt?.toISOString() ?? null,
    packageHash: detail.review.packageHash,
    reviewerSummary: detail.review.reviewerSummary,
    reviewerRespondedAt: detail.review.reviewerRespondedAt?.toISOString() ?? null,
    decisionByUserId: detail.review.decisionByUserId,
    decisionRole: detail.review.decisionRole as "CLIENT" | "AGREED_REVIEWER" | null,
    decisionReason: detail.review.decisionReason,
    dissatisfactionRemedy: detail.review.dissatisfactionRemedy as
      | "REVISION"
      | "PAID_REVIEW"
      | "CANCEL"
      | "OTHER"
      | null,
    providerResponse: detail.review.providerResponse as
      | "ACCEPT_REVISION"
      | "DISAGREE"
      | "REQUEST_PAID_REVIEW"
      | null,
    providerResponseNote: detail.review.providerResponseNote,
    providerResponseAt: detail.review.providerResponseAt?.toISOString() ?? null,
    riskAcknowledged: detail.review.riskAcknowledged,
    openedAt: detail.review.openedAt.toISOString(),
    decidedAt: detail.review.decidedAt?.toISOString() ?? null,
    taskTitle: task?.title ?? "Work review",
    providerUserId: provider?.userId ?? "",
    currentUserRole,
    currentUserId: userId,
    items: detail.items.map((item) => ({
      id: item.id,
      type: item.type,
      authorUserId: item.authorUserId,
      label: item.label,
      note: item.note,
      url: item.url,
      filename: item.filename,
      contentType: item.contentType,
      sizeBytes: item.sizeBytes,
      downloadUrl:
        item.type === "FILE"
          ? `/api/v1/reviews/${encodeURIComponent(detail.review.id)}/items/${encodeURIComponent(item.id)}`
          : null,
      createdAt: item.createdAt.toISOString(),
    })),
    assessments: detail.assessments.map((assessment) => ({
      id: assessment.id,
      requirementKey: assessment.requirementKey,
      status: assessment.status,
      rationale: assessment.rationale,
      assessedByUserId: assessment.assessedByUserId,
      updatedAt: assessment.updatedAt.toISOString(),
    })),
    requirements: detail.requirements.map((requirement) => ({
      key: requirement.key,
      statement: requirement.statement,
      acceptanceRelevant: requirement.acceptanceRelevant,
    })),
  };
}
