/**
 * AI adapter contracts (Components 2, 5, 11).
 *
 * The AI is a planner and a narrator, never an authority. Every adapter method
 * returns structured data that is validated against a Zod schema before use,
 * and nothing an adapter returns can move money: prices are treated as
 * proposals, and verification outcomes can only escalate, never authorize.
 *
 * Two implementations ship: `FakeAI` (deterministic, offline, the default for
 * tests and CI) and `OpenAIAI` (the real Responses API client).
 */
import { z } from "zod";

/** A requirement the planner proposes. `source` records its provenance. */
export const plannedRequirementSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9_]+$/, "requirement keys are snake_case"),
  statement: z.string().min(1),
  requiresClarification: z.boolean().default(false),
  acceptanceRelevant: z.boolean().default(true),
});
export type PlannedRequirement = z.infer<typeof plannedRequirementSchema>;

export const plannedClarificationSchema = z.object({
  question: z.string().min(1),
  requirementKey: z.string().max(128).optional(),
});
export type PlannedClarification = z.infer<typeof plannedClarificationSchema>;

/** How a requirement will be checked. Deterministic is preferred. */
export const plannedAcceptanceRuleSchema = z.object({
  requirementKey: z.string().min(1).max(128),
  method: z.enum(["DETERMINISTIC", "SEMANTIC", "HUMAN_REVIEW"]),
  /** Parameters for deterministic checks (e.g. column, pattern). */
  params: z.record(z.unknown()).optional(),
  /** Instructions for semantic checks. */
  instructions: z.string().optional(),
});
export type PlannedAcceptanceRule = z.infer<typeof plannedAcceptanceRuleSchema>;

export const workPlanSchema = z.object({
  summary: z.string().min(1),
  requirements: z.array(plannedRequirementSchema).min(1),
  clarifications: z.array(plannedClarificationSchema).default([]),
  acceptanceRules: z.array(plannedAcceptanceRuleSchema).default([]),
  scopeIncluded: z.array(z.string()).default([]),
  scopeExcluded: z.array(z.string()).default([]),
  /** Capability tags used by the provider selector. */
  capabilityTags: z.array(z.string()).default([]),
  /**
   * Advisory estimate only. The planner never sets the budget; the buyer does.
   */
  estimatedBudgetMinor: z.number().int().nonnegative().optional(),
});
export type WorkPlan = z.infer<typeof workPlanSchema>;

export const planTaskInputSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  rawRequest: z.string(),
  budgetMinor: z.number().int().nonnegative(),
  currency: z.string(),
  desiredDeadline: z.string().optional(),
  /** Summaries of attached files, never file contents from untrusted sources. */
  fileSummaries: z.array(z.string()).default([]),
});
export type PlanTaskInput = z.infer<typeof planTaskInputSchema>;

/** Result of a semantic (AI) verification of a single requirement. */
export const semanticAssessmentSchema = z.object({
  requirementKey: z.string(),
  outcome: z.enum(["PASS", "FAIL", "UNCERTAIN"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  /** Excerpts or observations supporting the outcome. */
  evidence: z
    .array(z.object({ type: z.string(), description: z.string(), payload: z.unknown().optional() }))
    .default([]),
});
export type SemanticAssessment = z.infer<typeof semanticAssessmentSchema>;

export const assessRequirementInputSchema = z.object({
  taskId: z.string(),
  requirementKey: z.string(),
  requirementStatement: z.string(),
  instructions: z.string().optional(),
  /** A bounded, provider-supplied summary of the deliverable. */
  deliverableSummary: z.string(),
});
export type AssessRequirementInput = z.infer<typeof assessRequirementInputSchema>;

/** A proposed counteroffer during negotiation. Never the final price. */
export const offerDraftSchema = z.object({
  priceMinor: z.number().int().nonnegative(),
  deliveryDeadline: z.string(),
  message: z.string(),
});
export type OfferDraft = z.infer<typeof offerDraftSchema>;

export const draftOfferInputSchema = z.object({
  taskId: z.string(),
  contractSummary: z.string(),
  budgetMinor: z.number().int().nonnegative(),
  currency: z.string(),
  round: z.number().int().nonnegative(),
  providerAskingMinor: z.number().int().nonnegative().optional(),
  desiredDeadline: z.string(),
});
export type DraftOfferInput = z.infer<typeof draftOfferInputSchema>;

/**
 * The AI adapter. Keep this surface small on purpose: more capability means
 * more ways for a model to influence an economic decision.
 */
export interface AIClient {
  readonly name: string;
  /** Turn a buyer request into a structured work plan. */
  planTask(input: PlanTaskInput): Promise<WorkPlan>;
  /** Assign a semantic verdict to one requirement. Advisory for PASS. */
  assessRequirement(input: AssessRequirementInput): Promise<SemanticAssessment>;
  /** Draft a negotiation offer within the buyer's stated ceiling. */
  draftOffer(input: DraftOfferInput): Promise<OfferDraft>;
}
