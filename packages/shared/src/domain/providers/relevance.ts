export interface CapabilityCandidate {
  providerId: string;
  displayName: string;
  capabilities?: Array<{ tag: string; proficiency: number }>;
}

export type RankedCapabilityCandidate<T extends CapabilityCandidate> = T & {
  matchedCapabilities: string[];
};

const COMMON_SCOPE_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "any",
  "are",
  "before",
  "between",
  "both",
  "build",
  "client",
  "complete",
  "create",
  "deliver",
  "ensure",
  "from",
  "have",
  "into",
  "make",
  "must",
  "need",
  "project",
  "provide",
  "should",
  "that",
  "their",
  "them",
  "there",
  "this",
  "through",
  "with",
  "work",
  "within",
]);

function meaningfulWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !COMMON_SCOPE_WORDS.has(word));
}

function compareText(left: string, right: string): number {
  const normalizedLeft = left.normalize("NFKD").toLowerCase();
  const normalizedRight = right.normalize("NFKD").toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function rankCandidatesByScope<T extends CapabilityCandidate>(
  candidates: T[],
  approvedScope: string | null,
): Array<RankedCapabilityCandidate<T>> {
  const scopeWords = new Set(approvedScope ? meaningfulWords(approvedScope) : []);
  return candidates
    .map((candidate) => {
      const matchedCapabilities = [
        ...new Set(
          (candidate.capabilities ?? [])
            .filter((capability) =>
              meaningfulWords(capability.tag).some((word) => scopeWords.has(word)),
            )
            .map((capability) => capability.tag),
        ),
      ];

      return { ...candidate, matchedCapabilities };
    })
    .sort((left, right) => {
      if (right.matchedCapabilities.length !== left.matchedCapabilities.length) {
        return right.matchedCapabilities.length - left.matchedCapabilities.length;
      }
      return (
        compareText(left.displayName, right.displayName) ||
        compareText(left.providerId, right.providerId)
      );
    });
}
