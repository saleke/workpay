import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, jsonError, jsonOk, resolveActorAsync, withTransaction } from "@/lib/server/api";
import {
  acceptanceRules,
  contractRequirements,
  scopeItems,
  workContracts,
} from "@workpay/shared/db/schema/contracts";
import { compileContract, getContractWithDetails, type AcceptanceRuleInput } from "@workpay/shared/domain";
import { newId } from "@workpay/shared/platform";
import { appendEvent } from "@workpay/shared/events";
import { toEventActor } from "@workpay/shared/domain";
import { conflict, notFound } from "@workpay/shared/platform";
import type {
  AcceptancePlanDto,
  ContractDto,
  ContractRequirementDto,
  ScopeItemDto,
} from "@/lib/api/types";

const modifyCriteriaSchema = z.object({
  action: z.enum(["ADD", "EDIT", "DELETE"]),
  statement: z.string().trim().min(2).max(500).optional(),
  key: z.string().trim().min(1).max(128).optional(),
  acceptanceRelevant: z.boolean().default(true),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contractId } = await params;
    const actor = await resolveActorAsync(req, "buyer");
    const body = await req.json();
    const parsed = modifyCriteriaSchema.parse(body);
    const db = getDb();

    const [contract] = await db
      .select()
      .from(workContracts)
      .where(eq(workContracts.id, contractId))
      .limit(1);

    if (!contract) {
      throw notFound("Work Agreement");
    }

    if (contract.status !== "AWAITING_APPROVAL" && contract.status !== "DRAFT") {
      throw conflict(`Cannot modify completion criteria for an agreement with status ${contract.status}`);
    }

    await withTransaction(async (tx) => {
      if (parsed.action === "ADD") {
        if (!parsed.statement) {
          throw conflict("A criterion statement is required when adding a completion criterion.");
        }
        const key = `req_${newId("creq").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
        await tx.insert(contractRequirements).values({
          id: newId("creq"),
          contractId,
          key,
          statement: parsed.statement,
          acceptanceRelevant: parsed.acceptanceRelevant,
        });
      } else if (parsed.action === "EDIT") {
        if (!parsed.key || !parsed.statement) {
          throw conflict("Both key and statement are required when editing a criterion.");
        }
        await tx
          .update(contractRequirements)
          .set({
            statement: parsed.statement,
            acceptanceRelevant: parsed.acceptanceRelevant,
          })
          .where(
            and(
              eq(contractRequirements.contractId, contractId),
              eq(contractRequirements.key, parsed.key),
            ),
          );
      } else if (parsed.action === "DELETE") {
        if (!parsed.key) {
          throw conflict("A criterion key is required to delete.");
        }
        const currentReqs = await tx
          .select({ id: contractRequirements.id })
          .from(contractRequirements)
          .where(eq(contractRequirements.contractId, contractId));

        if (currentReqs.length <= 1) {
          throw conflict("A work agreement must contain at least one completion criterion.");
        }

        await tx
          .delete(contractRequirements)
          .where(
            and(
              eq(contractRequirements.contractId, contractId),
              eq(contractRequirements.key, parsed.key),
            ),
          );

        await tx
          .delete(acceptanceRules)
          .where(
            and(
              eq(acceptanceRules.contractId, contractId),
              eq(acceptanceRules.requirementKey, parsed.key),
            ),
          );
      }

      // Reload updated requirements, scope, and rules to recompile canonical hash
      const updatedReqs = await tx
        .select()
        .from(contractRequirements)
        .where(eq(contractRequirements.contractId, contractId));

      const updatedScopes = await tx
        .select()
        .from(scopeItems)
        .where(eq(scopeItems.contractId, contractId));

      const updatedRules = await tx
        .select()
        .from(acceptanceRules)
        .where(eq(acceptanceRules.contractId, contractId));

      const rulesInput: AcceptanceRuleInput[] = updatedRules
        .filter((r) => updatedReqs.some((reqItem) => reqItem.key === r.requirementKey))
        .map((r) => ({
          requirementKey: r.requirementKey,
          method: r.method as "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW",
          ...(r.params ? { params: r.params as Record<string, unknown> } : {}),
          ...(r.instructions ? { instructions: r.instructions } : {}),
        }));

      const compiled = compileContract({
        taskId: contract.taskId,
        title: contract.title,
        summary: contract.summary,
        requirements: updatedReqs.map((r) => ({
          key: r.key,
          statement: r.statement,
          acceptanceRelevant: r.acceptanceRelevant,
        })),
        scopeIncluded: updatedScopes.filter((s) => s.type === "INCLUDED").map((s) => s.statement),
        scopeExcluded: updatedScopes.filter((s) => s.type === "EXCLUDED").map((s) => s.statement),
        acceptanceRules: rulesInput,
        budgetMinor: contract.budgetMinor,
        currency: contract.currency,
        deadline: contract.deadline ? contract.deadline.toISOString() : null,
      });

      await tx
        .update(workContracts)
        .set({
          contractHash: compiled.contractHash,
          updatedAt: new Date(),
        })
        .where(eq(workContracts.id, contractId));

      await appendEvent(tx, {
        type: "CONTRACT_AMENDED",
        aggregateId: contractId,
        taskId: contract.taskId,
        actor: toEventActor(actor),
        correlationId: newId("task"),
        payload: {
          taskId: contract.taskId,
          contractId,
          fromVersion: contract.version,
          toVersion: contract.version,
          reason: `Definition of Done criteria updated (${parsed.action}): ${updatedReqs.length} criteria`,
        },
      });
    });

    const details = await getContractWithDetails(db, contractId);
    if (!details) {
      throw notFound("Work Agreement");
    }

    const contractDto: ContractDto = {
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

    return jsonOk(contractDto);
  } catch (err) {
    return jsonError(err);
  }
}
