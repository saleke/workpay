import { z } from "zod";
import { conflict, validationError } from "../../platform/errors.js";
import { compileContract } from "./compiler.js";
import type { payments } from "../../db/schema/payments.js";
import { hashObject } from "../../platform/hashing.js";

const requirementSchema = z
  .object({
    key: z.string().trim().min(1).max(128),
    statement: z.string().trim().min(1).max(4_000),
    acceptanceRelevant: z.boolean(),
  })
  .strict();

const acceptanceRuleSchema = z
  .object({
    requirementKey: z.string().trim().min(1).max(128),
    method: z.enum(["DETERMINISTIC", "SEMANTIC", "HUMAN_REVIEW"]),
    params: z.record(z.unknown()).optional(),
    instructions: z.string().trim().max(4_000).optional(),
  })
  .strict();

export const contractChangePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    summary: z.string().trim().min(1).max(8_000).optional(),
    requirements: z.array(requirementSchema).min(1).max(100).optional(),
    included: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
    excluded: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
    acceptanceRules: z.array(acceptanceRuleSchema).max(100).optional(),
    budgetMinor: z.number().int().safe().nonnegative().optional(),
    agreedPriceMinor: z.number().int().safe().nonnegative().optional(),
    deadline: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "At least one term must be changed.");

export const contractChangeTermsSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    requirements: z.array(requirementSchema),
    included: z.array(z.string()),
    excluded: z.array(z.string()),
    acceptanceRules: z.array(acceptanceRuleSchema),
    budget: z.object({ amountMinor: z.number().int().safe().nonnegative(), currency: z.string() }),
    agreedPriceMinor: z.number().int().safe().nonnegative().nullable(),
    deadline: z.string().nullable(),
  })
  .strict();

export type ContractChangePatch = z.infer<typeof contractChangePatchSchema>;
export type ContractChangeTerms = z.infer<typeof contractChangeTermsSchema>;

export type PaymentAdjustmentPlan =
  | { action: "AUTHORIZE_NEW_TOTAL"; targetAmountMinor: number }
  | { action: "VOID_AND_REAUTHORIZE"; paymentId: string; targetAmountMinor: number }
  | {
      action: "AUTHORIZE_DELTA";
      paymentId: string;
      deltaAmountMinor: number;
      targetAmountMinor: number;
    }
  | {
      action: "REFUND_DELTA_REQUIRES_REVIEW";
      paymentId: string;
      refundAmountMinor: number;
      targetAmountMinor: number;
    }
  | { action: "NO_FINANCIAL_ADJUSTMENT"; paymentId?: string; targetAmountMinor?: number }
  | { action: "RECONCILIATION_REQUIRED"; paymentId: string; targetAmountMinor: number };

type PaymentRecord = Pick<
  typeof payments.$inferSelect,
  "id" | "status" | "amountMinor" | "capturedAmountMinor"
>;

export function planPaymentAdjustment(
  payment: PaymentRecord | null,
  targetAmountMinor: number,
): PaymentAdjustmentPlan {
  if (!payment) return { action: "AUTHORIZE_NEW_TOTAL", targetAmountMinor };
  if (payment.status === "PENDING" || payment.status === "FAILED" || payment.status === "VOIDED") {
    return targetAmountMinor === 0
      ? { action: "NO_FINANCIAL_ADJUSTMENT", paymentId: payment.id, targetAmountMinor }
      : { action: "AUTHORIZE_NEW_TOTAL", targetAmountMinor };
  }
  if (payment.status === "AUTHORIZED") {
    return payment.amountMinor === targetAmountMinor
      ? { action: "NO_FINANCIAL_ADJUSTMENT", paymentId: payment.id, targetAmountMinor }
      : { action: "VOID_AND_REAUTHORIZE", paymentId: payment.id, targetAmountMinor };
  }
  if (payment.status === "CAPTURED") {
    const capturedAmount = payment.capturedAmountMinor ?? payment.amountMinor;
    if (targetAmountMinor === capturedAmount) {
      return { action: "NO_FINANCIAL_ADJUSTMENT", paymentId: payment.id, targetAmountMinor };
    }
    if (targetAmountMinor > capturedAmount) {
      return {
        action: "AUTHORIZE_DELTA",
        paymentId: payment.id,
        deltaAmountMinor: targetAmountMinor - capturedAmount,
        targetAmountMinor,
      };
    }
    return {
      action: "REFUND_DELTA_REQUIRES_REVIEW",
      paymentId: payment.id,
      refundAmountMinor: capturedAmount - targetAmountMinor,
      targetAmountMinor,
    };
  }
  return { action: "RECONCILIATION_REQUIRED", paymentId: payment.id, targetAmountMinor };
}

export function applyContractChange(
  base: ContractChangeTerms,
  patch: ContractChangePatch,
  taskId: string,
): { terms: ContractChangeTerms; hash: string; contractHash: string } {
  const { budgetMinor, agreedPriceMinor, ...termPatch } = patch;
  const terms = contractChangeTermsSchema.parse({
    ...base,
    ...termPatch,
    budget:
      budgetMinor === undefined
        ? base.budget
        : { amountMinor: budgetMinor, currency: base.budget.currency },
    agreedPriceMinor: agreedPriceMinor === undefined ? base.agreedPriceMinor : agreedPriceMinor,
    deadline: patch.deadline === undefined ? base.deadline : patch.deadline,
  });
  let compiled;
  try {
    compiled = compileContract({
      taskId,
      title: terms.title,
      summary: terms.summary,
      requirements: terms.requirements,
      scopeIncluded: terms.included,
      scopeExcluded: terms.excluded,
      acceptanceRules: terms.acceptanceRules,
      budgetMinor: terms.budget.amountMinor,
      currency: terms.budget.currency,
      deadline: terms.deadline,
    });
  } catch (error) {
    throw validationError(
      error instanceof Error
        ? `The proposed terms are invalid: ${error.message}`
        : "The proposed terms are invalid.",
    );
  }
  let baseHash: string;
  try {
    baseHash = compileContract({
      taskId,
      title: base.title,
      summary: base.summary,
      requirements: base.requirements,
      scopeIncluded: base.included,
      scopeExcluded: base.excluded,
      acceptanceRules: base.acceptanceRules,
      budgetMinor: base.budget.amountMinor,
      currency: base.budget.currency,
      deadline: base.deadline,
    }).contractHash;
  } catch (error) {
    throw conflict(
      error instanceof Error
        ? `The existing terms cannot be amended: ${error.message}`
        : "The existing terms cannot be amended.",
    );
  }
  if (terms.agreedPriceMinor !== null && terms.agreedPriceMinor > terms.budget.amountMinor) {
    throw validationError("The agreed price cannot exceed the buyer's budget ceiling.");
  }
  const baseTermsHash = hashObject({
    contractHash: baseHash,
    agreedPriceMinor: base.agreedPriceMinor,
  });
  const termsHash = hashObject({
    contractHash: compiled.contractHash,
    agreedPriceMinor: terms.agreedPriceMinor,
  });
  if (termsHash === baseTermsHash) {
    throw validationError("A contract change must alter at least one agreed term.");
  }
  return { terms, hash: termsHash, contractHash: compiled.contractHash };
}
