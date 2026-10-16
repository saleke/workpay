import { getCorrelationId, getDb, jsonError, jsonOk, resolveActor } from "@/lib/server/api";
import {
  agentPlanAndDraftContract,
  ensureAgent,
  getLatestWorkSpecification,
  getTaskById,
} from "@workpay/shared/domain";
import type { WorkSpecificationDto } from "@/lib/api/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const actor = resolveActor(req, "buyer");
    const correlationId = getCorrelationId(req);
    const db = getDb();

    const task = await getTaskById(db, taskId);
    if (!task) {
      return jsonError({ code: "NOT_FOUND", message: "Task not found" }, 404);
    }

    // 1. Ensure the agent run exists for this task
    const { actor: agentActor } = await ensureAgent({
      taskId,
      userId: task.userId,
    });

    // 2. Run planning and contract drafting through agent authority
    const planRes = await agentPlanAndDraftContract({
      taskId,
      actor: agentActor,
      correlationId,
    });

    if (!planRes.ok) {
      return jsonError({ code: "PLANNING_FAILED", message: planRes.reasonCode }, 400);
    }

    const specDetails = await getLatestWorkSpecification(db, taskId);

    if (!specDetails) {
      return jsonError({ code: "NOT_FOUND", message: "Plan not generated" }, 500);
    }

    const data: WorkSpecificationDto = {
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

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
