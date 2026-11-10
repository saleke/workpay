import { and, eq } from "drizzle-orm";
import type { Database } from "@workpay/shared/db";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { tasks } from "@workpay/shared/db/schema/tasks";
import { workCommitments } from "@workpay/shared/db/schema/work-commitments";
import { notFound } from "@workpay/shared/platform";
import type { ConversationContractSnapshotDto, WorkCommitmentDto } from "@/lib/api/types";

export async function buildWorkCommitmentDto(
  db: Database,
  commitmentId: string,
): Promise<WorkCommitmentDto> {
  const [row] = await db
    .select({
      commitment: workCommitments,
      taskTitle: tasks.title,
      taskRequest: tasks.rawRequest,
      buyerDisplayName: users.displayName,
      buyerName: users.name,
      providerDisplayName: providers.displayName,
      executionId: workExecutions.id,
    })
    .from(workCommitments)
    .innerJoin(tasks, eq(workCommitments.taskId, tasks.id))
    .innerJoin(users, eq(workCommitments.buyerUserId, users.id))
    .innerJoin(providers, eq(workCommitments.providerId, providers.id))
    .leftJoin(
      workExecutions,
      and(
        eq(workExecutions.taskId, workCommitments.taskId),
        eq(workExecutions.providerId, workCommitments.providerId),
      ),
    )
    .where(eq(workCommitments.id, commitmentId))
    .limit(1);
  if (!row) throw notFound("Work proposal");
  const commitment = row.commitment;
  return {
    id: commitment.id,
    taskId: commitment.taskId,
    conversationId: commitment.conversationId,
    contractId: commitment.contractId,
    contractVersion: commitment.contractVersion,
    contractHash: commitment.contractHash,
    buyerUserId: commitment.buyerUserId,
    providerId: commitment.providerId,
    providerUserId: commitment.providerUserId,
    status: commitment.status,
    amount: { amountMinor: commitment.amountMinor, currency: commitment.currency as "USD" },
    deliveryDeadline: commitment.deliveryDeadline?.toISOString() ?? null,
    terms: commitment.termsSnapshot as ConversationContractSnapshotDto,
    termsHash: commitment.termsHash,
    providerResponseNote: commitment.providerResponseNote,
    proposedAt: commitment.proposedAt.toISOString(),
    providerRespondedAt: commitment.providerRespondedAt?.toISOString() ?? null,
    buyerConfirmedAt: commitment.buyerConfirmedAt?.toISOString() ?? null,
    taskTitle: row.taskTitle,
    taskRequest: row.taskRequest,
    buyerDisplayName: row.buyerDisplayName ?? row.buyerName ?? "Client",
    providerDisplayName: row.providerDisplayName,
    executionId: row.executionId,
  };
}
