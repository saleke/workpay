import { describe, expect, it } from "vitest";
import { reviewerProfileInputSchema } from "./service.js";

const validProfile = {
  isListed: true,
  available: true,
  displayName: "Independent reviewer",
  publicContactUrl: "https://example.com/contact",
  summary: "I review analytical work for accuracy and reproducibility.",
  languages: ["English"],
  feeMinor: 12000,
  typicalTurnaroundDays: 3,
  conflictDisclosureConfirmed: true,
  conflictUsernames: [],
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
};

describe("reviewerProfileInputSchema", () => {
  it("accepts a complete profile with conflict disclosure", () => {
    expect(reviewerProfileInputSchema.safeParse(validProfile).success).toBe(true);
  });

  it("requires conflict disclosure before listing", () => {
    expect(
      reviewerProfileInputSchema.safeParse({
        ...validProfile,
        conflictDisclosureConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate domains after normalization", () => {
    expect(
      reviewerProfileInputSchema.safeParse({
        ...validProfile,
        expertise: [
          ...validProfile.expertise,
          { ...validProfile.expertise[0], domainTag: "Data Analysis" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects non-HTTPS contact and evidence URLs", () => {
    expect(
      reviewerProfileInputSchema.safeParse({
        ...validProfile,
        publicContactUrl: "http://example.com/contact",
      }).success,
    ).toBe(false);
    expect(
      reviewerProfileInputSchema.safeParse({
        ...validProfile,
        evidence: [
          {
            kind: "PORTFOLIO",
            title: "Work sample",
            description: "A sample project I completed.",
            url: "http://example.com/work",
            issuer: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects fees that cannot be represented safely in JavaScript", () => {
    expect(
      reviewerProfileInputSchema.safeParse({
        ...validProfile,
        feeMinor: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });
});
