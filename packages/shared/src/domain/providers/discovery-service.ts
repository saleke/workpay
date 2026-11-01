import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  availability,
  capabilities,
  providers,
  providerSelections,
  reputation,
} from "../../db/schema/providers.js";
import { workContracts } from "../../db/schema/contracts.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { conflict, notFound } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import { toEventActor } from "../context.js";
import type { Actor } from "../identity/authorize.js";
import { transitionTask } from "../tasks/service.js";

function numericToNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function discoverProviders(
  tx: Database,
  input: {
    taskId: string;
    buyerUserId: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task || task.userId !== input.buyerUserId) throw notFound("Task");

  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(eq(workContracts.taskId, task.id))
    .orderBy(desc(workContracts.version))
    .limit(1);
  if (!contract?.approvedAt || contract.status !== "ACTIVE") {
    throw conflict("Approve the task terms before browsing available professionals.");
  }
  if (task.status === "APPROVED") {
    await transitionTask(tx, {
      taskId: task.id,
      to: "PROVIDER_SEARCH",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  } else if (task.status !== "PROVIDER_SEARCH") {
    throw conflict("Professional discovery is not available in the task's current state.");
  }

  await appendEvent(tx, {
    type: "PROVIDER_SEARCH_STARTED",
    aggregateId: contract.id,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: { taskId: task.id, contractId: contract.id, contractVersion: contract.version },
  });

  const [providerRows, capabilityRows, availabilityRows, reputationRows] = await Promise.all([
    tx.select().from(providers).where(eq(providers.status, "ACTIVE")),
    tx.select().from(capabilities),
    tx.select().from(availability),
    tx.select().from(reputation),
  ]);
  const latestReputation = new Map<string, (typeof reputationRows)[number]>();
  for (const row of reputationRows) {
    const current = latestReputation.get(row.providerId);
    if (!current || row.capturedAt > current.capturedAt) latestReputation.set(row.providerId, row);
  }

  const candidateSnapshots = providerRows
    .filter((provider) => provider.userId && provider.userId !== task.userId)
    .flatMap((provider) => {
      const currentAvailability = availabilityRows.find((row) => row.providerId === provider.id);
      if (
        !currentAvailability?.available ||
        currentAvailability.activeAssignments >= currentAvailability.capacity
      ) {
        return [];
      }

      const profileCapabilities = capabilityRows
        .filter((capability) => capability.providerId === provider.id)
        .map(({ tag, proficiency }) => ({ tag, proficiency }));
      const rep = latestReputation.get(provider.id);
      return [
        {
          providerId: provider.id,
          displayName: provider.displayName,
          bio: provider.bio,
          capabilities: profileCapabilities,
          ...(rep?.firstPassAcceptancePct !== null && rep?.firstPassAcceptancePct !== undefined
            ? { firstPassAcceptancePct: numericToNumber(rep.firstPassAcceptancePct) }
            : {}),
          ...(rep?.onTimeRatePct !== null && rep?.onTimeRatePct !== undefined
            ? { onTimeRatePct: numericToNumber(rep.onTimeRatePct) }
            : {}),
          completedTasks: rep?.completedTasks ?? 0,
          ...(provider.hourlyRateMinor !== null
            ? { priceMinor: provider.hourlyRateMinor, currency: provider.currency }
            : {}),
          eligible: true,
          reason:
            "Available to receive a contact request; review the profile and decide whether to reach out.",
        },
      ];
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const selectionId = newId("sel");
  const [selection] = await tx
    .insert(providerSelections)
    .values({
      id: selectionId,
      taskId: task.id,
      contractId: contract.id,
      providerId: null,
      status: candidateSnapshots.length > 0 ? "CANDIDATES_AVAILABLE" : "FAILED",
      candidates: candidateSnapshots,
      reason:
        candidateSnapshots.length > 0
          ? "Available profiles are listed without an automatic selection or ranking."
          : "No professionals are currently available to contact. You can try again later.",
    })
    .returning();
  if (!selection) throw new Error("Candidate discovery did not persist a result");

  if (candidateSnapshots.length > 0) {
    await appendEvent(tx, {
      type: "PROVIDER_CANDIDATES_DISCOVERED",
      aggregateId: selectionId,
      taskId: task.id,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: task.id,
        contractId: contract.id,
        selectionId,
        candidateCount: candidateSnapshots.length,
      },
    });
  } else {
    await appendEvent(tx, {
      type: "PROVIDER_SELECTION_FAILED",
      aggregateId: selectionId,
      taskId: task.id,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: task.id,
        contractId: contract.id,
        reason: selection.reason ?? "No available professionals were found.",
      },
    });
  }

  return selection;
}
