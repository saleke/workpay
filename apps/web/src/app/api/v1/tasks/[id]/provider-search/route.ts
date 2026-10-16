import { desc, eq } from "drizzle-orm";
import { getCorrelationId, getDb, jsonError, jsonOk, resolveActor, withTransaction } from "@/lib/server/api";
import {
  agentAcceptOffer,
  agentAuthorizeAndAssign,
  agentSelectProviderAndNegotiate,
  agentSendOffer,
  ensureAgent,
  getTaskById,
  getActiveContractForTask,
} from "@workpay/shared/domain";
import { providerSelections } from "@workpay/shared/db/schema/providers";
import { submitProviderOffer } from "@workpay/shared/domain";
import type { ProviderSelectionDto, ProviderSnapshotDto } from "@/lib/api/types";

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

    const contract = await getActiveContractForTask(db, taskId);
    if (!contract) {
      return jsonError({ code: "CONFLICT", message: "No active contract for task" }, 409);
    }

    // 1. Ensure the agent run exists for this task
    const { actor: agentActor } = await ensureAgent({
      taskId,
      userId: task.userId,
    });

    // 2. Select provider and start negotiation
    const selectRes = await agentSelectProviderAndNegotiate({
      taskId,
      actor: agentActor,
      correlationId,
    });

    if (!selectRes.ok) {
      return jsonError({ code: "SELECTION_FAILED", message: selectRes.reasonCode }, 400);
    }

    // 3. Agent sends offer
    const offerRes = await agentSendOffer({
      taskId,
      negotiationId: selectRes.negotiationId,
      actor: agentActor,
      correlationId,
    });

    // 4. Provider accepts or counters within budget
    if (offerRes.ok) {
      const providerActorObj = { kind: "PROVIDER" as const, id: selectRes.providerId };
      const counter = await withTransaction((tx) =>
        submitProviderOffer(tx, {
          negotiationId: selectRes.negotiationId,
          priceMinor: offerRes.offer.priceMinor,
          deliveryDeadline: contract.deadline ?? new Date(Date.now() + 3 * 86400000),
          actor: providerActorObj,
          correlationId,
          message: "Agreed to scope and terms.",
        }),
      );

      // Buyer agent accepts the provider's offer
      const acceptRes = await agentAcceptOffer({
        taskId,
        offerId: counter.offerId,
        actor: agentActor,
        correlationId,
      });

      // Authorize payment through gateway and assign execution to provider
      if (acceptRes.ok && acceptRes.agreement) {
        await agentAuthorizeAndAssign({
          taskId,
          agreementId: acceptRes.agreement.agreementId,
          contractId: contract.id,
          providerId: selectRes.providerId,
          actor: agentActor,
          correlationId,
        });
      }
    }

    // Return the latest provider selection snapshot
    const [selection] = await db
      .select()
      .from(providerSelections)
      .where(eq(providerSelections.taskId, taskId))
      .orderBy(desc(providerSelections.createdAt))
      .limit(1);

    if (!selection) {
      return jsonError({ code: "NOT_FOUND", message: "Provider selection not recorded" }, 500);
    }

    const candidates = (selection.candidates as ProviderSnapshotDto[]) ?? [];
    const topPick = candidates.find((c) => c.providerId === selection.providerId) ?? candidates[0] ?? null;
    const alternatives = candidates.filter((c) => c.providerId !== selection.providerId);

    const data: ProviderSelectionDto = {
      id: selection.id,
      taskId: selection.taskId,
      contractId: selection.contractId,
      status: selection.status as "SELECTED" | "FAILED" | "EXPIRED",
      provider: topPick,
      alternatives,
      reason: selection.reason,
      createdAt: selection.createdAt.toISOString(),
    };

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
