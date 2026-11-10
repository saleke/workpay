import { z } from "zod";
import { normalizeReviewerDomain } from "./recommendation.js";

export const reviewDomainInputSchema = z.object({
  domainTag: z
    .string()
    .trim()
    .min(2)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _./-]*$/),
  scope: z.string().trim().min(10).max(500),
  selfAssessedLevel: z.number().int().min(1).max(5),
  yearsExperience: z.number().int().min(0).max(80).nullable(),
  methods: z.array(z.string().trim().min(2).max(100)).max(10),
});

export const reviewEvidenceInputSchema = z.object({
  kind: z.enum(["PORTFOLIO", "CREDENTIAL", "EXPERIENCE", "REFERENCE"]),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(5).max(500),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Evidence links must use HTTPS")
    .nullable(),
  issuer: z.string().trim().max(160).nullable(),
});

const reviewServiceBaseSchema = z.object({
  enabled: z.boolean().default(false),
  listed: z.boolean().default(false),
  availability: z.enum(["AVAILABLE", "BUSY", "OFFLINE"]).default("AVAILABLE"),
  notice: z.string().trim().max(1_000).nullable().optional(),
  summary: z.string().trim().max(1_200).default(""),
  publicContactUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Contact links must use HTTPS")
    .nullable(),
  feeMinor: z.number().int().nonnegative().safe().nullable(),
  typicalTurnaroundDays: z.number().int().min(1).max(365).nullable(),
  conflictDisclosureConfirmed: z.boolean().default(false),
  conflictNotes: z.string().trim().max(4_000).nullable().optional(),
  conflictUsernames: z.array(z.string().trim().min(1).max(32)).max(50).default([]),
  domains: z.array(reviewDomainInputSchema).max(20).default([]),
  evidence: z.array(reviewEvidenceInputSchema).max(20).default([]),
  feeMode: z.enum(["PAYPAL", "DIRECT"]).default("PAYPAL"),
});

export const reviewServiceInputSchema = reviewServiceBaseSchema.superRefine((value, context) => {
  const domains = value.domains.map((item) => normalizeReviewerDomain(item.domainTag));
  if (new Set(domains).size !== domains.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["domains"],
      message: "Each review domain must appear only once.",
    });
  }
  if (value.enabled && value.summary.length < 20) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["summary"],
      message: "Describe your review service in at least 20 characters.",
    });
  }
  if (value.enabled && value.domains.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["domains"],
      message: "Add at least one domain you can review.",
    });
  }
  if (value.listed && !value.enabled) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["listed"],
      message: "Enable paid reviews before listing the service.",
    });
  }
  if (value.listed && !value.conflictDisclosureConfirmed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conflictDisclosureConfirmed"],
      message: "Confirm the conflict-disclosure commitment before listing.",
    });
  }
});

export type ReviewServiceInput = z.infer<typeof reviewServiceInputSchema>;

export interface StoredReviewService extends Omit<
  ReviewServiceInput,
  "conflictUsernames" | "domains"
> {
  conflictUserIds: string[];
  domains: Array<z.infer<typeof reviewDomainInputSchema>>;
}

const storedReviewServiceSchema = reviewServiceBaseSchema.omit({ conflictUsernames: true }).extend({
  conflictUserIds: z.array(z.string().min(1).max(64)).max(50).default([]),
  domains: z.array(reviewDomainInputSchema).max(20).default([]),
});

export function readStoredReviewService(workPreferences: unknown): StoredReviewService | null {
  if (!workPreferences || typeof workPreferences !== "object") return null;
  const reviewService = (workPreferences as Record<string, unknown>).reviewService;
  const parsed = storedReviewServiceSchema.safeParse(reviewService);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    domains: parsed.data.domains.map((domain) => ({
      ...domain,
      domainTag: normalizeReviewerDomain(domain.domainTag),
      methods: [...new Set(domain.methods)],
    })),
    conflictUserIds: [...new Set(parsed.data.conflictUserIds)],
  };
}

export function storeReviewService(
  input: ReviewServiceInput,
  conflictUserIds: string[],
): StoredReviewService {
  return {
    ...input,
    notice: input.notice?.trim() || null,
    domains: input.domains.map((domain) => ({
      ...domain,
      domainTag: normalizeReviewerDomain(domain.domainTag),
      methods: [...new Set(domain.methods)],
    })),
    evidence: input.evidence.map((item) => ({ ...item })),
    conflictUserIds: [...new Set(conflictUserIds)],
  };
}
