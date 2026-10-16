/**
 * Plan snapshot: the handoff from the planner to the contract compiler.
 *
 * The planner (Component 2) persists a compact snapshot of its output with each
 * work specification. The contract compiler (Component 3) is the only consumer:
 * it reads the snapshot back to freeze the acceptance rules without re-running
 * the planner (which might not be deterministic).
 *
 * The read contract lives here, beside the compiler, so the compiler never
 * depends on the planner module. The planner only writes JSON; it does not need
 * to import this module.
 */
import type { AcceptanceRuleInput } from "./compiler.js";

/** The slice of the planner output stored alongside the work specification. */
export interface PlanSnapshot {
  scopeIncluded: string[];
  scopeExcluded: string[];
  capabilityTags: string[];
  acceptanceRules: AcceptanceRuleInput[];
  estimatedBudgetMinor?: number;
}

/**
 * Read the plan snapshot persisted with a work specification. Returns safe
 * defaults when the snapshot is missing (for example for a spec created before
 * snapshots existed), so a contract can still be compiled.
 */
export function extractPlanSnapshot(specification: { plannerMetadata: unknown }): PlanSnapshot {
  const metadata = (specification.plannerMetadata ?? {}) as {
    planSnapshot?: Partial<PlanSnapshot>;
  };
  const snapshot = metadata.planSnapshot ?? {};
  return {
    scopeIncluded: snapshot.scopeIncluded ?? [],
    scopeExcluded: snapshot.scopeExcluded ?? [],
    capabilityTags: snapshot.capabilityTags ?? [],
    acceptanceRules: snapshot.acceptanceRules ?? [],
    ...(snapshot.estimatedBudgetMinor !== undefined
      ? { estimatedBudgetMinor: snapshot.estimatedBudgetMinor }
      : {}),
  };
}
