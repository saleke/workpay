import { type NextRequest } from "next/server";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { finalizeScopeSchema } from "@workpay/shared/domain/scoping";
import { createTask } from "@workpay/shared/domain/tasks/service";
import { draftContract } from "@workpay/shared/domain/contracts/service";
import { requirements, workSpecifications } from "@workpay/shared/db/schema/tasks";
import { money } from "@workpay/shared/platform/money";
import { newCorrelationId, newId } from "@workpay/shared/platform/ids";

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Sign in required to finalize task baseline" }, 401);
    }

    const body = await req.json();
    const parsed = finalizeScopeSchema.parse(body);
    const canvas = parsed.canvas;

    const db = getDb();
    const correlationId = newCorrelationId();

    const result = await db.transaction(async (tx) => {
      // 1. Create the task record
      const desiredDeadline = new Date(Date.now() + canvas.targetTimelineDays * 24 * 60 * 60 * 1000);
      const rawRequest = [
        `[What We Are Building]: ${canvas.whatWeAreBuilding}`,
        `[How It Delivers]: ${canvas.howItDelivers}`,
        `[How Success Is Proven]: ${canvas.howSuccessIsProven}`,
        `[Boundaries & Limits]: ${canvas.boundariesAndLimits}`,
      ].join("\n\n");

      const { task } = await createTask(tx, {
        actor,
        title: canvas.title,
        rawRequest,
        budget: money(canvas.estimatedBudgetMinor, "USD"),
        desiredDeadline,
        correlationId,
      });

      // 2. Persist the frozen intent baseline in workSpecifications
      const specId = newId("wspec");
      const [spec] = await tx
        .insert(workSpecifications)
        .values({
          id: specId,
          taskId: task.id,
          version: 1,
          summary: canvas.whatWeAreBuilding,
          planSource: "COGNITIVE_SCOPE_BASELINE",
          plannerMetadata: {
            baselineVersion: "v1_baseline",
            canvas,
            frozenAt: new Date().toISOString(),
            domain: canvas.domain,
          },
        })
        .returning();

      if (!spec) throw new Error("Failed to persist work specification baseline");

      // 3. Insert formal criteria as requirements
      for (const item of canvas.acceptanceCriteria) {
        await tx.insert(requirements).values({
          id: newId("req"),
          workSpecificationId: specId,
          taskId: task.id,
          key: item.key,
          statement: item.statement,
          source: "USER_EXPLICIT",
          requiresClarification: false,
          acceptanceRelevant: true,
        });
      }

      // 4. Draft the contract binding to this baseline
      const contract = await draftContract(tx, {
        taskId: task.id,
        actor,
        correlationId,
        workSpecificationId: specId,
        deadline: desiredDeadline,
      });

      return { task, spec, contract };
    });

    return jsonOk({
      success: true,
      data: {
        taskId: result.task.id,
        contractId: result.contract.id,
        baselineVersion: "v1_baseline",
        redirectUrl: `/tasks/${result.task.id}`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
