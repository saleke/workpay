export interface ReviewerCandidate {
  userId: string;
  username: string | null;
  displayName: string;
  publicContactUrl: string | null;
  summary: string;
  feeMinor: number | null;
  currency: string;
  languages: string[];
  typicalTurnaroundDays: number | null;
  conflictDisclosureConfirmed: boolean;
  expertise: Array<{
    domainTag: string;
    scope: string;
    selfAssessedLevel: number;
    yearsExperience: number | null;
    methods: string[];
  }>;
  evidence: Array<{
    id: string;
    kind: string;
    title: string;
    description: string;
    url: string | null;
    issuer: string | null;
  }>;
  conflictedUserIds: string[];
}

export interface ReviewerRecommendation {
  userId: string;
  username: string | null;
  displayName: string;
  publicContactUrl: string | null;
  summary: string;
  feeMinor: number | null;
  currency: string;
  languages: string[];
  typicalTurnaroundDays: number | null;
  matchedDomains: string[];
  matchingExpertise: ReviewerCandidate["expertise"];
  evidence: ReviewerCandidate["evidence"];
  rationale: string[];
  profileEvidence: "NONE" | "REVIEWER_SUPPLIED";
  selectionScore: number;
}

export interface RecommendReviewersInput {
  requiredDomains: string[];
  candidates: ReviewerCandidate[];
  excludeUserIds?: string[];
  limit?: number;
}

/**
 * Rank opted-in reviewers by task-domain coverage and evidence availability.
 * The numeric score is only an internal deterministic sort key, not a claim
 * about review quality, reviewer correctness, or probability of success.
 */
export function recommendReviewers(input: RecommendReviewersInput): ReviewerRecommendation[] {
  const requiredDomains = [
    ...new Set(input.requiredDomains.map(normalizeReviewerDomain).filter(Boolean)),
  ];
  if (requiredDomains.length === 0) return [];

  const excluded = new Set(input.excludeUserIds ?? []);
  const ranked: ReviewerRecommendation[] = [];

  for (const candidate of input.candidates) {
    if (
      excluded.has(candidate.userId) ||
      candidate.conflictedUserIds.some((userId) => excluded.has(userId)) ||
      !candidate.conflictDisclosureConfirmed
    ) {
      continue;
    }

    const expertiseByDomain = new Map(
      candidate.expertise.map((item) => [normalizeReviewerDomain(item.domainTag), item]),
    );
    const matchingExpertise = requiredDomains
      .map((domain) => expertiseByDomain.get(domain))
      .filter((item): item is ReviewerCandidate["expertise"][number] => item !== undefined);
    if (matchingExpertise.length === 0) continue;

    const matchedDomains = matchingExpertise.map((item) => item.domainTag);
    const evidenceCount = candidate.evidence.length;
    const rationale = [
      `Matches ${matchedDomains.length} of ${requiredDomains.length} requested review domain${requiredDomains.length === 1 ? "" : "s"}.`,
      evidenceCount > 0
        ? `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"} supplied by the reviewer; WorkPay has not independently verified them.`
        : "No supporting evidence has been supplied on this profile.",
      "Confirm task-specific conflicts and reviewer fit directly before engagement.",
    ];

    ranked.push({
      userId: candidate.userId,
      username: candidate.username,
      displayName: candidate.displayName,
      publicContactUrl: candidate.publicContactUrl,
      summary: candidate.summary,
      feeMinor: candidate.feeMinor,
      currency: candidate.currency,
      languages: candidate.languages,
      typicalTurnaroundDays: candidate.typicalTurnaroundDays,
      matchedDomains,
      matchingExpertise,
      evidence: candidate.evidence,
      rationale,
      profileEvidence: evidenceCount > 0 ? "REVIEWER_SUPPLIED" : "NONE",
      selectionScore: matchedDomains.length * 100 + (evidenceCount > 0 ? 1 : 0),
    });
  }

  return ranked
    .sort((a, b) => {
      if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
      return a.userId.localeCompare(b.userId);
    })
    .slice(0, Math.max(1, input.limit ?? 10));
}

export function normalizeReviewerDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\s+/g, "-");
}
