import { z } from "zod";
import { evaluateIntakeReadiness } from "./readiness.js";

const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use an uppercase ISO 4217 currency code");

export const intakeSourceSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["original_request", "user_message", "user_correction", "attachment"]),
    content: z.string().min(1),
  })
  .strict();

export const provenanceSchema = z
  .object({
    sourceId: z.string().min(1),
    quote: z.string().min(1),
  })
  .strict();

export const intentFactCategorySchema = z.enum([
  "objective",
  "deliverable",
  "constraint",
  "context",
]);

export const unknownImpactSchema = z.enum([
  "objective",
  "deliverable",
  "scale",
  "constraint",
  "access",
  "deadline",
  "price_impact",
]);

export const communicationStyleSchema = z.enum(["plain_language", "balanced", "technical"]);

export const taskFamiliaritySchema = z
  .object({
    level: z.enum(["unknown", "new_to_task", "some_experience", "experienced"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidence: z.array(provenanceSchema),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (assessment.level === "unknown" && assessment.evidence.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unknown task familiarity cannot include evidence for a level",
        path: ["evidence"],
      });
    }
    if (assessment.level !== "unknown" && assessment.evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An inferred familiarity level requires relevant evidence",
        path: ["evidence"],
      });
    }
  });

export const proposedIntentFactSchema = z
  .object({
    id: z.string().min(1),
    category: intentFactCategorySchema,
    value: z.string().min(1),
    evidence: z.array(provenanceSchema).min(1),
  })
  .strict();

export const intentInterpretationOutputSchema = z
  .object({
    summary: z.string().min(1),
    facts: z.array(proposedIntentFactSchema),
    taskFamiliarity: taskFamiliaritySchema,
  })
  .strict();

const budgetAmountSchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: currencySchema,
  })
  .strict();

const budgetMeaningBaseSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_provided") }).strict(),
  z.object({ state: z.literal("undecided") }).strict(),
  z.object({ state: z.literal("ceiling"), amount: budgetAmountSchema }).strict(),
  z.object({ state: z.literal("target"), amount: budgetAmountSchema }).strict(),
  z
    .object({
      state: z.literal("range"),
      minimum: budgetAmountSchema,
      maximum: budgetAmountSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("ambiguous"),
      mentionedAmounts: z.array(budgetAmountSchema),
    })
    .strict(),
]);

export const budgetMeaningSchema = budgetMeaningBaseSchema.superRefine((meaning, context) => {
  if (
    meaning.state === "range" &&
    (meaning.minimum.currency !== meaning.maximum.currency ||
      meaning.minimum.amountMinor > meaning.maximum.amountMinor)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Budget range must use one currency and have minimum <= maximum",
    });
  }
});

const budgetInterpretationFieldsSchema = z
  .object({
    meaning: budgetMeaningSchema,
    evidence: z.array(provenanceSchema),
  })
  .strict()
  .superRefine(({ meaning, evidence }, context) => {
    if (meaning.state === "not_provided" && evidence.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A not-provided budget cannot have budget evidence",
        path: ["evidence"],
      });
    }
    if (meaning.state !== "not_provided" && evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A stated budget meaning requires source evidence",
        path: ["evidence"],
      });
    }
  });

export const budgetInterpretationOutputSchema = budgetInterpretationFieldsSchema;

export const criticalUnknownSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    whyItMatters: z.string().min(1),
    impact: unknownImpactSchema,
  })
  .strict();

export const scopeAssessmentOutputSchema = z
  .object({
    budget: budgetInterpretationOutputSchema,
    criticalUnknowns: z.array(criticalUnknownSchema),
  })
  .strict();

export const intakeBudgetSchema = z
  .object({
    meaning: budgetMeaningSchema,
    evidence: z.array(provenanceSchema),
    confirmationSourceId: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine(({ meaning, evidence }, context) => {
    if (meaning.state === "not_provided" && evidence.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A not-provided budget cannot have budget evidence",
        path: ["evidence"],
      });
    }
    if (meaning.state !== "not_provided" && evidence.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A stated budget meaning requires source evidence",
        path: ["evidence"],
      });
    }
  });

export const intakeVersionSchema = z
  .object({
    version: z.number().int().positive(),
    sources: z.array(intakeSourceSchema).min(1),
    interpretation: intentInterpretationOutputSchema.nullable(),
    scopeAssessment: scopeAssessmentOutputSchema.nullable(),
    factConfirmations: z.array(
      z
        .object({
          factId: z.string().min(1),
          sourceId: z.string().min(1),
        })
        .strict(),
    ),
    interpretationConfirmationSourceId: z.string().min(1).nullable(),
    communicationStylePreference: z
      .object({
        style: communicationStyleSchema,
        sourceId: z.string().min(1),
      })
      .strict()
      .nullable(),
    budget: intakeBudgetSchema,
    unresolvedCriticalUnknownIds: z.array(z.string()),
    approvedAt: z.string().datetime().nullable(),
    approvalSourceId: z.string().min(1).nullable(),
  })
  .strict();

export const createIntakeSessionRequestSchema = z
  .object({
    originalRequest: z
      .string()
      .max(20_000)
      .refine((request) => request.trim().length > 0, "Please describe the work you need done"),
  })
  .strict();

export type IntakeSource = z.infer<typeof intakeSourceSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type ProposedIntentFact = z.infer<typeof proposedIntentFactSchema>;
export type UnknownImpact = z.infer<typeof unknownImpactSchema>;
export type CommunicationStyle = z.infer<typeof communicationStyleSchema>;
export type TaskFamiliarity = z.infer<typeof taskFamiliaritySchema>;
export type IntentInterpretationOutput = z.infer<typeof intentInterpretationOutputSchema>;
export type BudgetMeaning = z.infer<typeof budgetMeaningSchema>;
export type BudgetInterpretationOutput = z.infer<typeof budgetInterpretationOutputSchema>;
export type CriticalUnknown = z.infer<typeof criticalUnknownSchema>;
export type ScopeAssessmentOutput = z.infer<typeof scopeAssessmentOutputSchema>;
export type IntakeVersion = z.infer<typeof intakeVersionSchema>;

export function createInitialIntakeVersion(originalRequest: string): IntakeVersion {
  const source: IntakeSource = {
    id: "source_original",
    kind: "original_request",
    content: originalRequest,
  };
  return validateIntakeVersion({
    version: 1,
    sources: [source],
    interpretation: null,
    scopeAssessment: null,
    factConfirmations: [],
    interpretationConfirmationSourceId: null,
    communicationStylePreference: null,
    budget: {
      meaning: { state: "not_provided" },
      evidence: [],
      confirmationSourceId: null,
    },
    unresolvedCriticalUnknownIds: [],
    approvedAt: null,
    approvalSourceId: null,
  });
}

export function validateIntakeVersion(value: unknown): IntakeVersion {
  const version = intakeVersionSchema.parse(value);
  const facts = new Map((version.interpretation?.facts ?? []).map((fact) => [fact.id, fact]));
  const unknownIds = new Set(
    (version.scopeAssessment?.criticalUnknowns ?? []).map((unknown) => unknown.id),
  );

  if (facts.size !== (version.interpretation?.facts.length ?? 0)) {
    throw new Error("Fact IDs must be unique within an intake version");
  }
  if (unknownIds.size !== (version.scopeAssessment?.criticalUnknowns.length ?? 0)) {
    throw new Error("Critical unknown IDs must be unique within an intake version");
  }
  if (new Set(version.sources.map((source) => source.id)).size !== version.sources.length) {
    throw new Error("Source IDs must be unique within an intake version");
  }
  if (version.sources.filter((source) => source.kind === "original_request").length !== 1) {
    throw new Error("An intake version must preserve exactly one original request");
  }
  if (
    new Set(version.factConfirmations.map(({ factId }) => factId)).size !==
    version.factConfirmations.length
  ) {
    throw new Error("Each proposed fact may be confirmed only once per intake version");
  }
  if (
    new Set(version.unresolvedCriticalUnknownIds).size !==
    version.unresolvedCriticalUnknownIds.length
  ) {
    throw new Error("Unresolved critical unknown IDs must be unique within an intake version");
  }

  for (const fact of version.interpretation?.facts ?? []) {
    for (const evidence of fact.evidence) {
      const source = version.sources.find((item) => item.id === evidence.sourceId);
      if (!source || !source.content.includes(evidence.quote)) {
        throw new Error(`Fact "${fact.id}" has evidence that does not match a source`);
      }
    }
  }

  for (const evidence of version.interpretation?.taskFamiliarity.evidence ?? []) {
    const source = version.sources.find((item) => item.id === evidence.sourceId);
    if (!source || !["original_request", "user_message", "user_correction"].includes(source.kind)) {
      throw new Error("Task familiarity must be grounded in user-authored evidence");
    }
    if (!source.content.includes(evidence.quote)) {
      throw new Error("Task familiarity evidence does not match a source");
    }
  }

  for (const evidence of version.budget.evidence) {
    const source = version.sources.find((item) => item.id === evidence.sourceId);
    if (!source || !source.content.includes(evidence.quote)) {
      throw new Error("Budget evidence does not match a source");
    }
    for (const evidence of version.scopeAssessment?.budget.evidence ?? []) {
      const source = version.sources.find((item) => item.id === evidence.sourceId);
      if (!source || !source.content.includes(evidence.quote)) {
        throw new Error("Scope assessment budget evidence does not match a source");
      }
    }
  }

  for (const confirmation of version.factConfirmations) {
    if (!facts.has(confirmation.factId)) {
      throw new Error(`Confirmed fact "${confirmation.factId}" does not exist in this version`);
    }
    const source = version.sources.find((item) => item.id === confirmation.sourceId);
    if (!source || !["user_message", "user_correction"].includes(source.kind)) {
      throw new Error("Fact confirmation must reference an explicit user decision source");
    }
  }
  if (version.unresolvedCriticalUnknownIds.some((id) => !unknownIds.has(id))) {
    throw new Error("Unresolved critical unknown IDs must refer to this version's interpretation");
  }
  if (
    version.interpretationConfirmationSourceId !== null &&
    !version.sources.some(
      (source) =>
        source.id === version.interpretationConfirmationSourceId &&
        ["user_message", "user_correction"].includes(source.kind),
    )
  ) {
    throw new Error("Interpretation confirmation must reference an explicit user decision source");
  }
  if (
    version.communicationStylePreference !== null &&
    !version.sources.some(
      (source) =>
        source.id === version.communicationStylePreference?.sourceId &&
        ["user_message", "user_correction"].includes(source.kind),
    )
  ) {
    throw new Error("Communication preference must reference an explicit user decision source");
  }
  if (
    version.budget.confirmationSourceId !== null &&
    !version.sources.some(
      (source) =>
        source.id === version.budget.confirmationSourceId &&
        ["user_message", "user_correction"].includes(source.kind),
    )
  ) {
    throw new Error("Budget confirmation must reference an explicit user decision source");
  }
  if ((version.approvedAt === null) !== (version.approvalSourceId === null)) {
    throw new Error("Brief approval timestamp and user decision source must be recorded together");
  }
  if (
    version.approvalSourceId !== null &&
    !version.sources.some(
      (source) =>
        source.id === version.approvalSourceId &&
        ["user_message", "user_correction"].includes(source.kind),
    )
  ) {
    throw new Error("Brief approval must reference an explicit user decision source");
  }
  if (version.approvedAt !== null && !evaluateIntakeReadiness(version).ready) {
    throw new Error("A brief cannot be approved while intake readiness blockers remain");
  }

  return version;
}
