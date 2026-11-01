import { describe, expect, it } from "vitest";
import {
  normalizeReviewerDomain,
  recommendReviewers,
  type ReviewerCandidate,
} from "./recommendation.js";

function reviewer(overrides: Partial<ReviewerCandidate> = {}): ReviewerCandidate {
  return {
    userId: "reviewer-1",
    username: "reviewer",
    displayName: "Independent reviewer",
    publicContactUrl: "https://example.com/contact",
    summary: "Reviews analytics and data deliverables.",
    feeMinor: 12000,
    currency: "USD",
    languages: ["English"],
    typicalTurnaroundDays: 3,
    conflictDisclosureConfirmed: true,
    expertise: [
      {
        domainTag: "data-analysis",
        scope: "Statistical analysis and reporting",
        selfAssessedLevel: 4,
        yearsExperience: 5,
        methods: ["reproducibility"],
      },
    ],
    evidence: [],
    conflictedUserIds: [],
    ...overrides,
  };
}

describe("recommendReviewers", () => {
  it("normalizes domain tags consistently across case and whitespace", () => {
    expect(normalizeReviewerDomain("  Data Analysis  ")).toBe("data-analysis");
  });

  it("ranks domain coverage first and explains the limits of profile evidence", () => {
    const result = recommendReviewers({
      requiredDomains: ["DATA-ANALYSIS", "report-writing"],
      candidates: [
        reviewer({
          userId: "partial",
          evidence: [
            {
              id: "ev1",
              kind: "PORTFOLIO",
              title: "Work",
              description: "Example",
              url: null,
              issuer: null,
            },
          ],
        }),
        reviewer({
          userId: "complete",
          expertise: [
            ...reviewer().expertise,
            {
              domainTag: "report-writing",
              scope: "Technical reports",
              selfAssessedLevel: 3,
              yearsExperience: 2,
              methods: [],
            },
          ],
        }),
      ],
    });

    expect(result.map((item) => item.userId)).toEqual(["complete", "partial"]);
    expect(result[0]?.rationale[0]).toContain("2 of 2");
    expect(result[1]?.rationale[1]).toContain("not independently verified");
  });

  it("excludes task participants and declared conflicts", () => {
    const result = recommendReviewers({
      requiredDomains: ["data-analysis"],
      excludeUserIds: ["buyer", "professional"],
      candidates: [
        reviewer({ userId: "buyer" }),
        reviewer({ userId: "professional" }),
        reviewer({ userId: "conflicted", conflictedUserIds: ["buyer"] }),
        reviewer({ userId: "undeclared", conflictDisclosureConfirmed: false }),
      ],
    });

    expect(result).toEqual([]);
  });

  it("does not produce recommendations without a domain signal", () => {
    expect(recommendReviewers({ requiredDomains: [], candidates: [reviewer()] })).toEqual([]);
  });

  it("does not recommend reviewers without a matching specialty", () => {
    expect(
      recommendReviewers({ requiredDomains: ["legal-review"], candidates: [reviewer()] }),
    ).toEqual([]);
  });

  it("requires an exact normalized domain match", () => {
    expect(
      recommendReviewers({
        requiredDomains: ["data"],
        candidates: [reviewer()],
      }),
    ).toEqual([]);
  });
});
