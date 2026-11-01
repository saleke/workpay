import { and, eq } from "drizzle-orm";
import { createTask, draftContract, toEventActor, transitionTask } from "@workpay/shared/domain";
import { workContracts } from "@workpay/shared/db/schema/contracts";
import { intakeSessions } from "@workpay/shared/db/schema/intake";
import { requirements, tasks, workSpecifications } from "@workpay/shared/db/schema/tasks";
import { conflict, money, newId } from "@workpay/shared/platform";
import { appendEvent } from "@workpay/shared/events";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";
import { BETA_CONTRACT_CURRENCY, getIntakeSession } from "@workpay/shared/domain/intake";

function approvedBudgetAmount(version: Awaited<ReturnType<typeof getIntakeSession>>["version"]) {
  const meaning = version.budget.meaning;
  if (meaning.state === "ceiling" || meaning.state === "target") return meaning.amount;
  if (meaning.state === "range") return meaning.maximum;
  throw conflict("A clear, confirmed budget is required before creating a task.");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireIntakeBuyer(req);
    const { id: sessionId } = await params;
    const current = await getIntakeSession(getDb(), { sessionId, userId: actor.id });
    if (current.session.status !== "APPROVED" || !current.version.approvedAt) {
      throw conflict("Approve the professional-facing brief before continuing to task setup.");
    }

    const budget = approvedBudgetAmount(current.version);
    if (budget.currency !== BETA_CONTRACT_CURRENCY) {
      throw conflict(
        "This beta creates contracts in USD only. Reopen the budget step and explicitly confirm a USD amount before continuing.",
      );
    }
    const brief = current.version.professionalBrief;
    if (!brief) throw conflict("The approved intake is missing its professional-facing brief.");

    const correlationId = getCorrelationId(req);
    const result = await withTransaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(intakeSessions)
        .where(and(eq(intakeSessions.id, sessionId), eq(intakeSessions.userId, actor.id)))
        .for("update")
        .limit(1);
      if (!session || session.status !== "APPROVED") {
        throw conflict("The intake must be approved before task creation.");
      }

      const [existingTask] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.sourceIntakeSessionId, sessionId))
        .limit(1);
      if (existingTask) {
        const [existingContract] = await tx
          .select({ id: workContracts.id })
          .from(workContracts)
          .where(eq(workContracts.taskId, existingTask.id))
          .limit(1);
        return {
          taskId: existingTask.id,
          contractId: existingContract?.id ?? null,
          created: false,
        };
      }

      const { task } = await createTask(tx, {
        actor,
        title: brief.title.text,
        rawRequest: session.originalRequest,
        budget: money(budget.amountMinor, BETA_CONTRACT_CURRENCY),
        correlationId,
      });
      await tx
        .update(tasks)
        .set({ sourceIntakeSessionId: sessionId, plannerSource: "USER_APPROVED_INTAKE" })
        .where(eq(tasks.id, task.id));

      await transitionTask(tx, {
        taskId: task.id,
        to: "PLANNING",
        actor,
        correlationId,
      });

      const deliverables = brief.deliverables.map((item) => item.text);
      const requirementStatements = [
        ...deliverables,
        ...brief.requirements.map((item) => item.text),
      ].filter(
        (statement, index, all) =>
          all.findIndex(
            (other) => other.trim().toLowerCase() === statement.trim().toLowerCase(),
          ) === index,
      );
      if (requirementStatements.length === 0) {
        throw conflict("The approved brief must include at least one deliverable or requirement.");
      }

      const specificationId = newId("wspec");
      const summary = [
        brief.goalAndContext.text,
        `Deliverables:\n${deliverables.map((item) => `- ${item}`).join("\n")}`,
        ...(brief.requirements.length > 0
          ? [`Requirements:\n${brief.requirements.map((item) => `- ${item.text}`).join("\n")}`]
          : []),
        ...(brief.boundaries.length > 0
          ? [`Boundaries:\n${brief.boundaries.map((item) => `- ${item.text}`).join("\n")}`]
          : []),
        ...(brief.inputsAndDependencies.length > 0
          ? [
              `Inputs and dependencies:\n${brief.inputsAndDependencies.map((item) => `- ${item.text}`).join("\n")}`,
            ]
          : []),
        ...(brief.timing ? [`Timing:\n${brief.timing.text}`] : []),
        `Budget intent: ${current.version.budget.meaning.state}. This is the buyer's stated budget context, not a provider-accepted price.`,
      ].join("\n\n");

      await tx.insert(workSpecifications).values({
        id: specificationId,
        taskId: task.id,
        version: 1,
        summary,
        planSource: "DETERMINISTIC_FALLBACK",
        plannerMetadata: {
          source: "approved_intake",
          intakeSessionId: sessionId,
          intakeVersion: current.version.version,
          planSnapshot: {
            scopeIncluded: deliverables,
            scopeExcluded: [],
            capabilityTags: [],
            acceptanceRules: [],
          },
        },
      });
      await tx.insert(requirements).values(
        requirementStatements.map((statement, index) => ({
          id: newId("req"),
          workSpecificationId: specificationId,
          taskId: task.id,
          key: `intake_requirement_${index + 1}`,
          statement,
          source: "USER_EXPLICIT" as const,
          requiresClarification: false,
          acceptanceRelevant: true,
        })),
      );
      await appendEvent(tx, {
        type: "WORK_SPEC_CREATED",
        aggregateId: specificationId,
        taskId: task.id,
        actor: toEventActor(actor),
        correlationId,
        payload: {
          taskId: task.id,
          workSpecificationId: specificationId,
          version: 1,
          requirementCount: requirementStatements.length,
          proposedRequirementCount: 0,
          planSource: "DETERMINISTIC_FALLBACK",
        },
      });

      const contract = await draftContract(tx, {
        taskId: task.id,
        workSpecificationId: specificationId,
        actor,
        correlationId,
      });
      await transitionTask(tx, {
        taskId: task.id,
        to: "CONTRACT_REVIEW",
        actor,
        correlationId,
      });
      return { taskId: task.id, contractId: contract.id, created: true };
    });

    return jsonOk(result, result.created ? 201 : 200);
  } catch (error) {
    return jsonError(error);
  }
}
