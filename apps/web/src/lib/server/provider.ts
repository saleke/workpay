import { desc, eq } from "drizzle-orm";
import type { Database } from "@workpay/shared/db";
import { workExecutions, workSubmissions, submissionArtifacts, providerAcceptances } from "@workpay/shared/db/schema/execution";
import { tasks, taskFiles } from "@workpay/shared/db/schema/tasks";
import { contractRequirements, workContracts } from "@workpay/shared/db/schema/contracts";
import { commercialAgreements } from "@workpay/shared/db/schema/negotiation";
import { notFound } from "@workpay/shared/platform";
import type { ProviderWorkDto, SubmissionDto } from "@/lib/api/types";

export async function buildProviderWorkDto(
  db: Database,
  executionId: string,
): Promise<ProviderWorkDto> {
  const [execution] = await db
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, executionId))
    .limit(1);

  if (!execution) throw notFound("Execution");

  const [task] = await db.select().from(tasks).where(eq(tasks.id, execution.taskId)).limit(1);
  if (!task) throw notFound("Task");

  const [contract] = await db
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, execution.contractId))
    .limit(1);

  const [agreement] = await db
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.id, execution.agreementId))
    .limit(1);

  const reqRows = await db
    .select()
    .from(contractRequirements)
    .where(eq(contractRequirements.contractId, execution.contractId));

  const filesRows = await db
    .select()
    .from(taskFiles)
    .where(eq(taskFiles.taskId, execution.taskId));

  const [acceptance] = await db
    .select()
    .from(providerAcceptances)
    .where(eq(providerAcceptances.executionId, execution.id))
    .limit(1);

  // Latest submission
  let latestSubmissionDto: SubmissionDto | null = null;
  const [submission] = await db
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.executionId, execution.id))
    .orderBy(desc(workSubmissions.version))
    .limit(1);

  if (submission) {
    const artifacts = await db
      .select()
      .from(submissionArtifacts)
      .where(eq(submissionArtifacts.submissionId, submission.id));

    latestSubmissionDto = {
      id: submission.id,
      executionId: submission.executionId,
      version: submission.version,
      status: submission.status,
      note: submission.notes,
      artifacts: artifacts.map((art) => ({
        id: art.id,
        submissionId: art.submissionId,
        type: art.type as "PRIMARY_DELIVERABLE" | "SUPPORTING_FILE" | "EVIDENCE",
        filename: art.filename,
        contentType: art.contentType ?? "application/octet-stream",
        sizeBytes: art.sizeBytes,
        checksum: art.sha256 ?? "",
        createdAt: art.createdAt.toISOString(),
      })),
      createdAt: submission.createdAt.toISOString(),
    };
  }

  const payMinor = agreement ? agreement.agreedPriceMinor : contract?.budgetMinor ?? task.budgetMinor;
  const payCurrency = (agreement ? agreement.currency : contract?.currency ?? task.currency) as "USD";

  return {
    executionId: execution.id,
    taskId: task.id,
    taskTitle: task.title,
    taskRequest: task.rawRequest,
    status: execution.status,
    pay: {
      amountMinor: payMinor,
      currency: payCurrency,
    },
    deadline: contract?.deadline?.toISOString() ?? task.desiredDeadline?.toISOString() ?? null,
    requirements: reqRows.map((r) => ({
      key: r.key,
      statement: r.statement,
      acceptanceRelevant: r.acceptanceRelevant,
    })),
    inputFiles: filesRows.map((f) => ({
      id: f.id,
      filename: f.filename,
      contentType: f.contentType ?? "application/octet-stream",
      sizeBytes: f.sizeBytes,
    })),
    latestSubmission: latestSubmissionDto,
    revisionReason:
      execution.status === "REVISION_REQUESTED"
        ? submission?.notes ?? "Verification identified duplicates exceeding contract tolerance."
        : null,
    acceptedAt: acceptance?.createdAt?.toISOString() ?? null,
    startedAt: execution.startedAt?.toISOString() ?? null,
  };
}
