/**
 * Provider selection service (Component 4).
 *
 * Loads candidate providers from the database, runs the deterministic selection
 * algorithm, and records the outcome. The full ranked list is stored, so the
 * choice is auditable and the UI can show why it was made.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  capabilities,
  availability,
  providers,
  reputation,
  providerSelections,
} from "../../db/schema/providers.js";
import { workContracts } from "../../db/schema/contracts.js";
import { appendEvent } from "../../events/outbox.js";
import { newId } from "../../platform/ids.js";
import { notFound } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { selectProvider, type ProviderCandidate, type ScoredCandidate } from "./selection.js";

function numericToNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Run selection for a contract. `requiredTags` come from the plan snapshot; when
 * empty, every active provider is eligible on capability.
 */
export async function runProviderSelection(
  tx: Database,
  options: {
    taskId: string;
    contractId: string;
    requiredTags: string[];
    actor: Actor;
    correlationId: string;
  },
) {
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, options.contractId))
    .limit(1);
  if (!contract) throw notFound("Contract");

  await appendEvent(tx, {
    type: "PROVIDER_SEARCH_STARTED",
    aggregateId: options.contractId,
    taskId: options.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: options.taskId,
      contractId: options.contractId,
      contractVersion: contract.version,
    },
  });

  const providerRows = await tx.select().from(providers).where(eq(providers.status, "ACTIVE"));
  const capabilityRows = await tx.select().from(capabilities);
  const availabilityRows = await tx.select().from(availability);
  const reputationRows = await tx.select().from(reputation);

  // Latest reputation snapshot per provider.
  const latestReputation = new Map<string, (typeof reputationRows)[number]>();
  for (const row of reputationRows) {
    const existing = latestReputation.get(row.providerId);
    if (!existing || row.capturedAt > existing.capturedAt) {
      latestReputation.set(row.providerId, row);
    }
  }

  const candidates: ProviderCandidate[] = providerRows.map((provider) => {
    const avail = availabilityRows.find((a) => a.providerId === provider.id);
    const rep = latestReputation.get(provider.id);
    return {
      providerId: provider.id,
      displayName: provider.displayName,
      status: provider.status,
      capabilities: capabilityRows
        .filter((c) => c.providerId === provider.id)
        .map((c) => ({ tag: c.tag, proficiency: c.proficiency })),
      available: avail?.available ?? false,
      capacity: avail?.capacity ?? 0,
      activeAssignments: avail?.activeAssignments ?? 0,
      hourlyRateMinor: provider.hourlyRateMinor ?? null,
      reputation: {
        completedTasks: rep?.completedTasks ?? 0,
        onTimeRatePct: numericToNumber(rep?.onTimeRatePct ?? null),
        firstPassAcceptancePct: numericToNumber(rep?.firstPassAcceptancePct ?? null),
      },
    };
  });

  const result = selectProvider({
    requiredTags: options.requiredTags,
    budgetMinor: contract.budgetMinor,
    candidates,
  });

  const selectionId = newId("sel");
  const snapshotFor = (scored: ScoredCandidate) => {
    const candidate = candidates.find((c) => c.providerId === scored.providerId);
    return {
      providerId: scored.providerId,
      displayName: scored.displayName,
      firstPassAcceptancePct: candidate?.reputation.firstPassAcceptancePct ?? undefined,
      onTimeRatePct: candidate?.reputation.onTimeRatePct ?? undefined,
      completedTasks: candidate?.reputation.completedTasks,
      priceMinor: candidate?.hourlyRateMinor ?? undefined,
      currency: candidate?.hourlyRateMinor != null ? contract.currency : undefined,
      score: scored.score,
      eligible: scored.eligible,
      reason: scored.reason,
    };
  };

  await tx.insert(providerSelections).values({
    id: selectionId,
    taskId: options.taskId,
    contractId: options.contractId,
    providerId: result.selected?.providerId ?? null,
    status: result.selected ? "SELECTED" : "FAILED",
    candidates: result.ranked.map(snapshotFor),
    reason: result.reason,
  });

  if (result.selected) {
    const selected = snapshotFor(result.selected);
    await appendEvent(tx, {
      type: "PROVIDER_SELECTED",
      aggregateId: selectionId,
      taskId: options.taskId,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: {
        taskId: options.taskId,
        contractId: options.contractId,
        selectionId,
        providerId: result.selected.providerId,
        provider: selected,
        alternatives: result.ranked
          .filter((r) => r.providerId !== result.selected?.providerId)
          .slice(0, 5)
          .map(snapshotFor),
        reason: result.reason,
      },
    });
  } else {
    await appendEvent(tx, {
      type: "PROVIDER_SELECTION_FAILED",
      aggregateId: selectionId,
      taskId: options.taskId,
      actor: toEventActor(options.actor),
      correlationId: options.correlationId,
      payload: { taskId: options.taskId, contractId: options.contractId, reason: result.reason },
    });
  }

  return { selectionId, selection: result };
}
