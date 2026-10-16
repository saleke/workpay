/**
 * Provider selection (Component 4).
 *
 * Selection is deterministic and eligibility-first. The algorithm:
 *
 *   1. Filter to providers that are active, available, have spare capacity,
 *      and hold every required capability tag.
 *   2. Score the survivors on capability depth, reputation and price fit.
 *   3. Break ties by provider id, so the same inputs always pick the same
 *      provider.
 *
 * The AI never participates. It may narrate the choice, but it cannot invent a
 * provider or change the ranking. This function is pure and therefore directly
 * testable, and the full ranked list is stored for audit.
 */

export interface ProviderCandidate {
  providerId: string;
  displayName: string;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  capabilities: Array<{ tag: string; proficiency: number }>;
  available: boolean;
  capacity: number;
  activeAssignments: number;
  hourlyRateMinor: number | null;
  reputation: {
    completedTasks: number;
    onTimeRatePct: number | null;
    firstPassAcceptancePct: number | null;
  };
}

export interface SelectProviderInput {
  requiredTags: string[];
  /** Budget helps judge price fit. Optional. */
  budgetMinor: number;
  candidates: ProviderCandidate[];
  /** Optional cap on how many alternatives to return. */
  maxAlternatives?: number;
}

export interface ScoredCandidate {
  providerId: string;
  displayName: string;
  score: number;
  eligible: boolean;
  reason: string;
}

export interface SelectionResult {
  selected: ScoredCandidate | null;
  ranked: ScoredCandidate[];
  reason: string;
}

const WEIGHTS = {
  capability: 100,
  firstPass: 40,
  onTime: 20,
  experience: 10,
  priceFit: 20,
} as const;

function capabilityScore(candidate: ProviderCandidate, requiredTags: string[]): number {
  let total = 0;
  for (const tag of requiredTags) {
    const capability = candidate.capabilities.find((c) => c.tag === tag);
    if (!capability) return 0;
    total += capability.proficiency; // 1..5
  }
  return requiredTags.length === 0 ? 1 : total / requiredTags.length;
}

function priceFitScore(candidate: ProviderCandidate, budgetMinor: number): number {
  if (candidate.hourlyRateMinor === null || budgetMinor <= 0) return 0;
  if (candidate.hourlyRateMinor <= budgetMinor) {
    // Cheaper is better, but with diminishing returns.
    return 1 - candidate.hourlyRateMinor / budgetMinor;
  }
  return 0;
}

export function selectProvider(input: SelectProviderInput): SelectionResult {
  const required = input.requiredTags.map((t) => t.toLowerCase());
  const requiredSet = new Set(required);

  const scored: ScoredCandidate[] = input.candidates.map((candidate) => {
    let eligible = true;
    const reasons: string[] = [];

    if (candidate.status !== "ACTIVE") {
      eligible = false;
      reasons.push(`status ${candidate.status}`);
    }
    if (!candidate.available) {
      eligible = false;
      reasons.push("not available");
    }
    if (candidate.activeAssignments >= candidate.capacity) {
      eligible = false;
      reasons.push("at capacity");
    }
    const missing = [...requiredSet].filter(
      (tag) => !candidate.capabilities.some((c) => c.tag.toLowerCase() === tag),
    );
    if (missing.length > 0) {
      eligible = false;
      reasons.push(`missing capabilities: ${missing.join(", ")}`);
    }

    const cap = capabilityScore(candidate, required);
    const firstPass = (candidate.reputation.firstPassAcceptancePct ?? 0) / 100;
    const onTime = (candidate.reputation.onTimeRatePct ?? 0) / 100;
    const experience = Math.min(candidate.reputation.completedTasks / 20, 1);
    const priceFit = priceFitScore(candidate, input.budgetMinor);

    const score =
      cap * WEIGHTS.capability +
      firstPass * WEIGHTS.firstPass +
      onTime * WEIGHTS.onTime +
      experience * WEIGHTS.experience +
      priceFit * WEIGHTS.priceFit;

    return {
      providerId: candidate.providerId,
      displayName: candidate.displayName,
      score: Math.round(score * 1000) / 1000,
      eligible,
      reason: eligible ? "eligible" : reasons.join("; "),
    };
  });

  const ranked = scored.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.providerId.localeCompare(b.providerId);
  });

  const selected = ranked.find((c) => c.eligible) ?? null;
  return {
    selected,
    ranked,
    reason: selected
      ? `Selected ${selected.displayName} with score ${selected.score}`
      : "No eligible provider matched the required capabilities and availability",
  };
}
