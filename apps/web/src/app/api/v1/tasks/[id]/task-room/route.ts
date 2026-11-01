import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import {
  getActiveContractForTask,
  getContractWithDetails,
  getExecutionForTask,
  getLatestSubmission,
  getLatestWorkSpecification,
  getTaskById,
} from "@workpay/shared/domain";
import { providerSelections } from "@workpay/shared/db/schema/providers";
import { agentActions, agentRuns } from "@workpay/shared/db/schema/agent";
import { providerAcceptances } from "@workpay/shared/db/schema/execution";
import { cases, caseImpacts } from "@workpay/shared/db/schema/cases";
import type {
  TaskRoomDto,
  TaskDto,
  ContractDto,
  WorkSpecificationDto,
  ProviderSelectionDto,
  ProviderSnapshotDto,
  AgentActionDto,
  ExecutionDto,
  CaseDto,
  ContractRequirementDto,
  ScopeItemDto,
  AcceptancePlanDto,
  AgentActionType,
} from "@/lib/api/types";
import { requireTaskOwner } from "@/lib/server/conversation-auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    await requireTaskOwner(req, taskId);
    const db = getDb();
    const task = await getTaskById(db, taskId);

    if (!task) {
      return jsonError({ code: "NOT_FOUND", message: "Task not found" }, 404);
    }

    // 1. Task DTO
    const taskDto: TaskDto = {
      id: task.id,
      userId: task.userId,
      title: task.title,
      rawRequest: task.rawRequest,
      status: task.status,
      budgetMinor: task.budgetMinor,
      currency: task.currency,
      desiredDeadline: task.desiredDeadline?.toISOString() ?? null,
      plannerSource: task.plannerSource,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
      cancelledAt: task.cancelledAt?.toISOString() ?? null,
    };

    // 2. Active contract DTO
    let activeContractDto: ContractDto | null = null;
    const activeContract = await getActiveContractForTask(db, taskId);
    if (activeContract) {
      const details = await getContractWithDetails(db, activeContract.id);
      if (details) {
        activeContractDto = {
          id: details.contract.id,
          taskId: details.contract.taskId,
          version: details.contract.version,
          status: details.contract.status,
          title: details.contract.title,
          summary: details.contract.summary,
          contractHash: details.contract.contractHash,
          budgetMinor: details.contract.budgetMinor,
          currency: details.contract.currency,
          deadline: details.contract.deadline?.toISOString() ?? null,
          acceptancePlan: (details.contract.acceptancePlan ?? null) as AcceptancePlanDto | null,
          approvedBy: details.contract.approvedBy,
          approvedAt: details.contract.approvedAt?.toISOString() ?? null,
          createdAt: details.contract.createdAt.toISOString(),
          requirements: details.requirements.map((r): ContractRequirementDto => ({
            id: r.id,
            contractId: r.contractId,
            key: r.key,
            statement: r.statement,
            acceptanceRelevant: r.acceptanceRelevant,
          })),
          scope: details.scope.map((s): ScopeItemDto => ({
            id: s.id,
            contractId: s.contractId,
            type: s.type,
            statement: s.statement,
            position: s.position,
          })),
        };
      }
    }

    // 3. Work Specification DTO
    let workSpecificationDto: WorkSpecificationDto | null = null;
    const specDetails = await getLatestWorkSpecification(db, taskId);
    if (specDetails) {
      workSpecificationDto = {
        id: specDetails.specification.id,
        taskId: specDetails.specification.taskId,
        version: specDetails.specification.version,
        planSource: specDetails.specification.planSource as "AI" | "DETERMINISTIC_FALLBACK",
        summary: specDetails.specification.summary,
        createdAt: specDetails.specification.createdAt.toISOString(),
        requirements: specDetails.requirements.map((r, idx) => ({
          id: r.id,
          key: r.key,
          statement: r.statement,
          source: r.source,
          acceptanceRelevant: r.acceptanceRelevant,
          position: idx + 1,
        })),
        clarifications: specDetails.clarifications.map((c) => ({
          id: c.id,
          taskId: c.taskId,
          question: c.question,
          answer: c.answer,
          status: c.status,
        })),
      };
    }

    // 4. Provider Selection DTO
    let providerSelectionDto: ProviderSelectionDto | null = null;
    const [selection] = await db
      .select()
      .from(providerSelections)
      .where(eq(providerSelections.taskId, taskId))
      .orderBy(desc(providerSelections.createdAt))
      .limit(1);

    if (selection) {
      const candidates = (selection.candidates as ProviderSnapshotDto[]) ?? [];
      const topPick = selection.providerId
        ? candidates.find((c) => c.providerId === selection.providerId) ?? null
        : null;
      const alternatives = candidates.filter((c) => c.providerId !== selection.providerId);

      providerSelectionDto = {
        id: selection.id,
        taskId: selection.taskId,
        contractId: selection.contractId,
        status: selection.status as ProviderSelectionDto["status"],
        provider: topPick,
        alternatives,
        reason: selection.reason,
        createdAt: selection.createdAt.toISOString(),
      };
    }

    // 5. Agent run DTO
    let agentRunDto: { id: string; status: string; actions: AgentActionDto[] } | null = null;
    const [agentRun] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.taskId, taskId))
      .limit(1);

    if (agentRun) {
      const actions = await db
        .select()
        .from(agentActions)
        .where(eq(agentActions.agentRunId, agentRun.id))
        .orderBy(desc(agentActions.sequence));

      agentRunDto = {
        id: agentRun.id,
        status: agentRun.status,
        actions: actions.map((a): AgentActionDto => ({
          id: a.id,
          agentRunId: a.agentRunId,
          actionType: a.actionType as AgentActionType,
          status: a.status,
          reasonCode: a.reasonCode ?? a.authorityReason,
          rationale: a.authorityReason,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    }

    // 6. Execution DTO
    let executionDto: ExecutionDto | null = null;
    const execution = await getExecutionForTask(db, taskId);
    if (execution) {
      const submissionInfo = await getLatestSubmission(db, execution.id);
      let latestSubmissionDto = null;

      if (submissionInfo) {
        latestSubmissionDto = {
          id: submissionInfo.submission.id,
          executionId: submissionInfo.submission.executionId,
          version: submissionInfo.submission.version,
          status: submissionInfo.submission.status,
          note: submissionInfo.submission.notes,
          artifacts: submissionInfo.artifacts.map((art) => ({
            id: art.id,
            submissionId: art.submissionId,
            type: art.type as "PRIMARY_DELIVERABLE" | "SUPPORTING_FILE" | "EVIDENCE",
            filename: art.filename,
            contentType: art.contentType ?? "application/octet-stream",
            sizeBytes: art.sizeBytes,
            checksum: art.sha256 ?? "",
            createdAt: art.createdAt.toISOString(),
          })),
          createdAt: submissionInfo.submission.createdAt.toISOString(),
        };
      }

      const [acceptance] = await db
        .select()
        .from(providerAcceptances)
        .where(eq(providerAcceptances.executionId, execution.id))
        .limit(1);

      executionDto = {
        id: execution.id,
        taskId: execution.taskId,
        providerId: execution.providerId,
        contractId: execution.contractId,
        contractVersion: execution.contractVersion,
        status: execution.status,
        acceptedAt: acceptance?.createdAt?.toISOString() ?? null,
        startedAt: execution.startedAt?.toISOString() ?? null,
        latestSubmission: latestSubmissionDto,
      };
    }

    // 7. Cases DTO
    const casesRows = await db
      .select()
      .from(cases)
      .where(eq(cases.taskId, taskId))
      .orderBy(desc(cases.openedAt));
    const impacts = await db.select().from(caseImpacts);

    const casesDto: CaseDto[] = casesRows.map((c): CaseDto => ({
      id: c.id,
      taskId: c.taskId,
      type: c.type,
      category: c.category,
      status: c.status,
      severity: c.severity,
      title: c.title,
      summary: c.description,
      blocksPaymentCapture: c.blocksPaymentCapture,
      impacts: impacts
        .filter((imp) => imp.caseId === c.id)
        .map((imp) => ({
          id: imp.id,
          caseId: imp.caseId,
          kind: imp.impact,
          detail:
            typeof imp.detail === "string"
              ? imp.detail
              : imp.detail
                ? JSON.stringify(imp.detail)
                : null,
        })),
      createdAt: c.openedAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
    }));

    const responseData: TaskRoomDto = {
      task: taskDto,
      activeContract: activeContractDto,
      workSpecification: workSpecificationDto,
      providerSelection: providerSelectionDto,
      agentRun: agentRunDto,
      execution: executionDto,
      cases: casesDto,
    };

    return jsonOk(responseData);
  } catch (err) {
    return jsonError(err);
  }
}
