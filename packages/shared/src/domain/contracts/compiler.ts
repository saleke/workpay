/**
 * Contract compiler (Component 3).
 *
 * A contract is the frozen answer to "what will be done, and how will we know
 * it was done". The compiler turns a work specification plus the buyer's
 * budget into the exact frozen contents, and hashes them.
 *
 * The hash is the anchor for everything economic that follows: payment binds to
 * it, verification binds to it, and the provider accepts it. If any field that
 * participates in the hash changes, the version and hash change, and every
 * downstream object that referenced the old hash becomes visibly stale.
 *
 * This module is pure. It performs no database access and reads no clock, so a
 * contract can be recompiled and compared byte for byte.
 */
import { hashObject } from "../../platform/hashing.js";
import { money, type Money } from "../../platform/money.js";

export type VerificationMethod = "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";

export interface ContractRequirementInput {
  key: string;
  statement: string;
  acceptanceRelevant: boolean;
}

export interface AcceptanceRuleInput {
  requirementKey: string;
  method: VerificationMethod;
  params?: Record<string, unknown>;
  instructions?: string;
}

export interface CompileContractInput {
  taskId: string;
  title: string;
  summary: string;
  requirements: ContractRequirementInput[];
  scopeIncluded: string[];
  scopeExcluded: string[];
  acceptanceRules: AcceptanceRuleInput[];
  budgetMinor: number;
  currency: string;
  /** ISO-8601 deadline, or null when none was agreed. */
  deadline: string | null;
}

export interface FrozenContract {
  title: string;
  summary: string;
  requirements: ContractRequirementInput[];
  scopeIncluded: string[];
  scopeExcluded: string[];
  acceptanceRules: AcceptanceRuleInput[];
  budget: Money;
  deadline: string | null;
}

export interface CompiledContract {
  contractHash: string;
  frozen: FrozenContract;
  budget: Money;
}

/**
 * Validate and freeze contracts. Throws on malformed input so a bad contract is
 * never persisted.
 */
export function compileContract(input: CompileContractInput): CompiledContract {
  if (input.requirements.length === 0) {
    throw new Error("A contract must have at least one requirement");
  }
  const seen = new Set<string>();
  for (const requirement of input.requirements) {
    if (seen.has(requirement.key)) {
      throw new Error(`Duplicate requirement key: ${requirement.key}`);
    }
    seen.add(requirement.key);
  }

  // Every acceptance rule must point at a real requirement. A rule for an
  // unknown requirement would silently pass verification.
  const requirementKeys = new Set(input.requirements.map((r) => r.key));
  for (const rule of input.acceptanceRules) {
    if (!requirementKeys.has(rule.requirementKey)) {
      throw new Error(`Acceptance rule references unknown requirement: ${rule.requirementKey}`);
    }
  }

  const budget = money(input.budgetMinor, input.currency as Money["currency"]);

  // Sort deterministically so the hash does not depend on input ordering.
  const requirements = [...input.requirements].sort((a, b) => a.key.localeCompare(b.key));
  const acceptanceRules = [...input.acceptanceRules].sort((a, b) =>
    a.requirementKey.localeCompare(b.requirementKey),
  );

  const frozen: FrozenContract = {
    title: input.title,
    summary: input.summary,
    requirements,
    scopeIncluded: [...input.scopeIncluded],
    scopeExcluded: [...input.scopeExcluded],
    acceptanceRules,
    budget,
    deadline: input.deadline,
  };

  const contractHash = hashObject({
    taskId: input.taskId,
    ...frozen,
  });

  return { contractHash, frozen, budget };
}

/**
 * The acceptance plan is the compiled, machine-readable summary of how each
 * requirement will be checked. It is stored on the contract for fast access and
 * is itself part of the frozen contents through the acceptance rules.
 */
export interface AcceptancePlanEntry {
  requirementKey: string;
  method: VerificationMethod;
  params?: Record<string, unknown>;
  instructions?: string;
}

export function buildAcceptancePlan(rules: AcceptanceRuleInput[]): AcceptancePlanEntry[] {
  return [...rules]
    .sort((a, b) => a.requirementKey.localeCompare(b.requirementKey))
    .map((rule) => ({
      requirementKey: rule.requirementKey,
      method: rule.method,
      ...(rule.params ? { params: rule.params } : {}),
      ...(rule.instructions ? { instructions: rule.instructions } : {}),
    }));
}
