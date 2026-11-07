import { describe, expect, it } from "vitest";
import { rankCandidatesByScope } from "./relevance.js";

const approvedScope =
  "Design a product logo. Create a distinctive visual identity for a small coffee brand. Supply editable vector artwork.";

const candidates = [
  {
    providerId: "other",
    displayName: "Ari",
    capabilities: [{ tag: "Copywriting", proficiency: 5 }],
  },
  {
    providerId: "strong",
    displayName: "Zoe",
    capabilities: [
      { tag: "Brand design", proficiency: 4 },
      { tag: "Vector illustration", proficiency: 5 },
    ],
  },
  {
    providerId: "partial",
    displayName: "Bea",
    capabilities: [{ tag: "Logo design", proficiency: 3 }],
  },
];

describe("rankCandidatesByScope", () => {
  it("orders profiles by capability overlap with the approved scope and retains unmatched profiles", () => {
    expect(
      rankCandidatesByScope(candidates, approvedScope).map((candidate) => candidate.providerId),
    ).toEqual(["strong", "partial", "other"]);
  });

  it("returns matching self-described capability labels without implying verification", () => {
    const [topCandidate] = rankCandidatesByScope(candidates, approvedScope);
    expect(topCandidate?.matchedCapabilities).toEqual(["Brand design", "Vector illustration"]);
  });

  it("falls back to alphabetical order when the scope has no capability overlap", () => {
    const ranked = rankCandidatesByScope(candidates, null);
    expect(ranked.map((candidate) => candidate.providerId)).toEqual(["other", "partial", "strong"]);
  });

  it("uses stable profile identifiers when names and overlap are equal", () => {
    const tied = [
      {
        providerId: "provider-b",
        displayName: "Sam",
        capabilities: [{ tag: "Logo design", proficiency: 5 }],
      },
      {
        providerId: "provider-a",
        displayName: "Sam",
        capabilities: [{ tag: "Logo design", proficiency: 1 }],
      },
    ];

    expect(
      rankCandidatesByScope(tied, approvedScope).map((candidate) => candidate.providerId),
    ).toEqual(["provider-a", "provider-b"]);
  });
});
