import type { IntakeVersion } from "./model.js";

export type IntakeReadinessBlocker =
  | "interpretation_missing"
  | "interpretation_not_confirmed"
  | "objective_not_confirmed"
  | "facts_unconfirmed"
  | "scope_assessment_missing"
  | "budget_not_confirmed"
  | "budget_not_provided"
  | "budget_undecided"
  | "budget_ambiguous"
  | "critical_unknowns_unresolved";

export interface IntakeReadiness {
  ready: boolean;
  blockers: IntakeReadinessBlocker[];
}

export function evaluateIntakeReadiness(version: IntakeVersion): IntakeReadiness {
  const confirmedFacts = new Set(version.factConfirmations.map(({ factId }) => factId));
  const blockers: IntakeReadinessBlocker[] = [];

  if (version.interpretation === null) {
    blockers.push("interpretation_missing");
  }
  if (version.interpretationConfirmationSourceId === null) {
    blockers.push("interpretation_not_confirmed");
  }
  if (
    !version.interpretation?.facts.some(
      (fact) => fact.category === "objective" && confirmedFacts.has(fact.id),
    )
  ) {
    blockers.push("objective_not_confirmed");
  }
  if (version.interpretation?.facts.some((fact) => !confirmedFacts.has(fact.id))) {
    blockers.push("facts_unconfirmed");
  }
  if (version.scopeAssessment === null) {
    blockers.push("scope_assessment_missing");
  }
  if (version.budget.confirmationSourceId === null) {
    blockers.push("budget_not_confirmed");
  }
  if (version.budget.meaning.state === "not_provided") {
    blockers.push("budget_not_provided");
  }
  if (version.budget.meaning.state === "undecided") {
    blockers.push("budget_undecided");
  }
  if (version.budget.meaning.state === "ambiguous") {
    blockers.push("budget_ambiguous");
  }
  if (version.unresolvedCriticalUnknownIds.length > 0) {
    blockers.push("critical_unknowns_unresolved");
  }

  return { ready: blockers.length === 0, blockers };
}
