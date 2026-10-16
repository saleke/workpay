/**
 * Deterministic planner fallback (Component 2).
 *
 * When the AI planner is unavailable or returns something that fails validation,
 * the system does not stall and it does not guess wildly. It falls back to a
 * conservative, deterministic plan derived from the buyer's own words: a single
 * requirement that the deliverable answers the request, verified by human
 * review. The plan source is recorded so the UI can be honest about it.
 *
 * This keeps the pipeline moving while making it obvious, in the audit trail,
 * that no model was involved.
 */
import type { PlanTaskInput, WorkPlan } from "../../integrations/ai/types.js";

export function deterministicFallbackPlan(input: PlanTaskInput): WorkPlan {
  const trimmed = input.rawRequest.trim();
  const summary =
    trimmed.length > 0
      ? `Deliver: ${input.title}. ${trimmed}`.slice(0, 600)
      : `Deliver: ${input.title}`.slice(0, 600);

  return {
    summary,
    requirements: [
      {
        key: "deliverable_provided",
        statement: `A deliverable for "${input.title}" is provided and addresses the request.`,
        requiresClarification: false,
        acceptanceRelevant: true,
      },
    ],
    clarifications: [],
    acceptanceRules: [
      {
        requirementKey: "deliverable_provided",
        method: "HUMAN_REVIEW",
        instructions: "A reviewer confirms the deliverable addresses the request.",
      },
    ],
    scopeIncluded: [input.title],
    scopeExcluded: [],
    capabilityTags: ["general"],
    estimatedBudgetMinor: Math.floor(input.budgetMinor * 0.8),
  };
}
