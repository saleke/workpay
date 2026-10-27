import { z } from "zod";
import { evaluateIntakeReadiness } from "./readiness.js";

const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use an uppercase ISO 4217 currency code")
  .refine((currency) => {
    try {
      new Intl.NumberFormat("en-US", { style: "currency", currency });
      return true;
    } catch {
      return false;
    }
  }, "Use a currently supported ISO 4217 currency code");

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
    quote: z.string().min(1).max(5_000),
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
    evidence: z.array(provenanceSchema).max(10),
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
    value: z.string().min(1).max(1_000),
    evidence: z.array(provenanceSchema).min(1).max(10),
  })
  .strict();

export const intentInterpretationOutputSchema = z
  .object({
    summary: z.string().min(1).max(2_000),
    facts: z.array(proposedIntentFactSchema).max(50),
    taskFamiliarity: taskFamiliaritySchema,
  })
  .strict()
  .superRefine((interpretation, context) => {
    if (new Set(interpretation.facts.map(({ id }) => id)).size !== interpretation.facts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fact IDs must be unique",
        path: ["facts"],
      });
    }
  });

const budgetAmountSchema = z
  .object({
    amountMinor: z.number().safe().int().nonnegative(),
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
    question: z.string().min(1).max(500),
    whyItMatters: z.string().min(1).max(1_000),
    impact: unknownImpactSchema,
  })
  .strict();

export const clarificationAnswerSchema = z
  .object({
    unknownId: z.string().min(1),
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(5_000),
    sourceId: z.string().min(1),
  })
  .strict();

export const scopeAssessmentOutputSchema = z
  .object({
    budget: budgetInterpretationOutputSchema,
    criticalUnknowns: z.array(criticalUnknownSchema).max(20),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (
      new Set(assessment.criticalUnknowns.map(({ id }) => id)).size !==
      assessment.criticalUnknowns.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Critical unknown IDs must be unique",
        path: ["criticalUnknowns"],
      });
    }
  });

export const intakeAIOperationSchema = z
  .object({
    operation: z.enum(["interpret_intent", "assess_scope"]),
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    recordedAt: z.string().datetime(),
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
    aiOperations: z.array(intakeAIOperationSchema).default([]),
    interpretation: intentInterpretationOutputSchema.nullable(),
    correctionContext: intentInterpretationOutputSchema.nullable().default(null),
    scopeAssessment: scopeAssessmentOutputSchema.nullable(),
    clarificationAnswers: z.array(clarificationAnswerSchema).default([]),
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

const expectedVersionSchema = z.number().int().positive();

export const interpretIntakeRequestSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const interpretationDecisionRequestSchema = z.discriminatedUnion("decision", [
  z
    .object({
      expectedVersion: expectedVersionSchema,
      decision: z.literal("confirm"),
    })
    .strict(),
  z
    .object({
      expectedVersion: expectedVersionSchema,
      decision: z.literal("correct"),
      correction: z
        .string()
        .max(5_000)
        .refine((correction) => correction.trim().length > 0, "Describe what needs to change."),
    })
    .strict(),
]);

export const assessIntakeScopeRequestSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const answerCriticalUnknownRequestSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    answer: z
      .string()
      .max(5_000)
      .refine((answer) => answer.trim().length > 0),
  })
  .strict();

export const intakeBudgetDecisionRequestSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    meaning: budgetMeaningSchema,
  })
  .strict();

export const approveIntakeRequestSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const communicationStyleDecisionRequestSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    style: communicationStyleSchema,
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
export type ClarificationAnswer = z.infer<typeof clarificationAnswerSchema>;
export type ScopeAssessmentOutput = z.infer<typeof scopeAssessmentOutputSchema>;
export type IntakeAIOperation = z.infer<typeof intakeAIOperationSchema>;
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
    aiOperations: [],
    interpretation: null,
    correctionContext: null,
    scopeAssessment: null,
    clarificationAnswers: [],
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
  if (
    new Set(version.clarificationAnswers.map(({ sourceId }) => sourceId)).size !==
    version.clarificationAnswers.length
  ) {
    throw new Error("Each clarification answer must have its own user source");
  }

  for (const interpretation of [version.interpretation, version.correctionContext]) {
    for (const fact of interpretation?.facts ?? []) {
      for (const evidence of fact.evidence) {
        const source = version.sources.find((item) => item.id === evidence.sourceId);
        if (
          !source ||
          !["original_request", "user_message", "user_correction"].includes(source.kind) ||
          !source.content.includes(evidence.quote)
        ) {
          throw new Error(`Fact "${fact.id}" has evidence that does not match a source`);
        }
      }
    }

    for (const evidence of interpretation?.taskFamiliarity.evidence ?? []) {
      const source = version.sources.find((item) => item.id === evidence.sourceId);
      if (
        !source ||
        !["original_request", "user_message", "user_correction"].includes(source.kind)
      ) {
        throw new Error("Task familiarity must be grounded in user-authored evidence");
      }
      if (!source.content.includes(evidence.quote)) {
        throw new Error("Task familiarity evidence does not match a source");
      }
    }
  }

  for (const evidence of [
    ...version.budget.evidence,
    ...(version.scopeAssessment?.budget.evidence ?? []),
  ]) {
    const source = version.sources.find((item) => item.id === evidence.sourceId);
    if (
      !source ||
      !["original_request", "user_message", "user_correction"].includes(source.kind) ||
      !source.content.includes(evidence.quote)
    ) {
      throw new Error("Budget evidence must match user-authored source text");
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
  for (const answer of version.clarificationAnswers) {
    const source = version.sources.find((item) => item.id === answer.sourceId);
    if (
      !source ||
      source.kind !== "user_message" ||
      source.content !== `Answer to "${answer.question}": ${answer.answer}`
    ) {
      throw new Error("Clarification answers must match their explicit user-message source");
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
