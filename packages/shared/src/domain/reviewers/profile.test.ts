import { describe, expect, it } from "vitest";
import {
  readStoredReviewService,
  reviewServiceInputSchema,
  storeReviewService,
} from "./work-profile.js";

const validService = {
  enabled: true,
  listed: true,
  availability: "AVAILABLE" as const,
  notice: null,
  summary: "I review analytical work for accuracy and reproducibility.",
  publicContactUrl: "https://example.com/reviews",
  feeMinor: 12_000,
  typicalTurnaroundDays: 3,
  conflictDisclosureConfirmed: true,
  conflictUsernames: [],
  domains: [
    {
      domainTag: "data-analysis",
      scope: "Statistical analysis and reporting",
      selfAssessedLevel: 4,
      yearsExperience: 5,
      methods: ["reproducibility"],
    },
  ],
  evidence: [],
  feeMode: "PAYPAL" as const,
};

describe("reviewServiceInputSchema", () => {
  it("accepts review-only service settings", () => {
    expect(reviewServiceInputSchema.safeParse(validService).success).toBe(true);
  });

  it("requires conflicts disclosure before marketplace listing", () => {
    expect(
      reviewServiceInputSchema.safeParse({
        ...validService,
        conflictDisclosureConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate normalized review domains", () => {
    expect(
      reviewServiceInputSchema.safeParse({
        ...validService,
        domains: [
          ...validService.domains,
          { ...validService.domains[0]!, domainTag: "Data Analysis" },
        ],
      }).success,
    ).toBe(false);
  });

  it("stores conflict ids without duplicating a second public profile", () => {
    const parsed = reviewServiceInputSchema.parse(validService);
    const stored = storeReviewService(parsed, ["user-conflict", "user-conflict"]);
    expect(readStoredReviewService({ reviewService: stored })).toMatchObject({
      enabled: true,
      listed: true,
      conflictUserIds: ["user-conflict"],
    });
  });
});
