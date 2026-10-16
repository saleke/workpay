import { getCorrelationId, getDb, jsonError, jsonOk, resolveActor, withTransaction } from "@/lib/server/api";
import { planTask, draftContract, getLatestWorkSpecification } from "@workpay/shared/domain";
import type { WorkSpecificationDto } from "@/lib/api/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const actor = resolveActor(req, "buyer");
    const correlationId = getCorrelationId(req);

    await withTransaction(async (tx) => {
      // 1. Generate plan with provenance-tagged requirements
      await planTask(tx, { taskId, actor, correlationId });

      // 2. Draft the contract from the specification so buyer can review & approve it
      await draftContract(tx, { taskId, actor, correlationId });
    });

    const db = getDb();
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
