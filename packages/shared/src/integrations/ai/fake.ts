/**
 * Deterministic fake AI adapter.
 *
 * Used by tests, CI and rehearsals. It performs no network calls and returns
 * the same result for the same input, which makes the whole pipeline
 * reproducible. It is deliberately a little "dumb": it keys off the presence of
 * a few words rather than understanding language, because its job is to stand
 * in for the model without pretending to be one.
 */
import { createHash } from "node:crypto";
import type {
  AIClient,
  AssessRequirementInput,
  DraftOfferInput,
  OfferDraft,
  PlanTaskInput,
  SemanticAssessment,
  WorkPlan,
} from "./types.js";

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function looksLikeDataCleaning(text: string): boolean {
  return /(clean|dedup|duplicate|csv|dataset|spreadsheet|format)/i.test(text);
}

export class FakeAI implements AIClient {
  readonly name = "fake";

  async planTask(input: PlanTaskInput): Promise<WorkPlan> {
    if (looksLikeDataCleaning(`${input.title} ${input.rawRequest}`)) {
      return {
        summary:
          "Clean the provided dataset: remove duplicate records, remove test rows, " +
          "normalize date formats, and ensure required fields are present.",
        requirements: [
          {
            key: "no_duplicate_emails",
            statement: "Every email address in the dataset is unique.",
            requiresClarification: false,
            acceptanceRelevant: true,
          },
          {
            key: "no_null_required_fields",
            statement: "No row has an empty required field (name, email).",
            requiresClarification: false,
            acceptanceRelevant: true,
          },
          {
            key: "dates_iso8601",
            statement: "All date values use the ISO-8601 format (YYYY-MM-DD).",
            requiresClarification: false,
            acceptanceRelevant: true,
          },
          {
            key: "test_rows_removed",
            statement: "Rows that are obviously test data (for example test@example) are removed.",
            requiresClarification: false,
            acceptanceRelevant: true,
          },
        ],
        clarifications: [],
        acceptanceRules: [
          {
            requirementKey: "no_duplicate_emails",
            method: "DETERMINISTIC",
            params: { check: "unique_column", column: "email" },
          },
          {
            requirementKey: "no_null_required_fields",
            method: "DETERMINISTIC",
            params: { check: "non_empty_columns", columns: ["name", "email"] },
          },
          {
            requirementKey: "dates_iso8601",
            method: "DETERMINISTIC",
            params: { check: "iso8601_dates", columns: ["joined_at"] },
          },
          {
            requirementKey: "test_rows_removed",
            method: "SEMANTIC",
            instructions:
              "Confirm that rows which are plainly test data are not present in the deliverable.",
          },
        ],
        scopeIncluded: [
          "Deduplicate records by email.",
          "Remove obvious test rows.",
          "Normalize dates to ISO-8601.",
        ],
        scopeExcluded: ["Adding new columns.", "Correcting values that are merely inconsistent."],
        capabilityTags: ["data_cleaning", "spreadsheet"],
        estimatedBudgetMinor: Math.floor(input.budgetMinor * 0.8),
      };
    }

    // Generic fallback: one requirement plus a verification rule. Deterministic
    // and honest about being a fallback.
    return {
      summary: `Deliver: ${input.title}`.slice(0, 500),
      requirements: [
        {
          key: "deliverable_provided",
          statement: `A complete deliverable for "${input.title}" is provided.`,
          requiresClarification: input.rawRequest.trim().length < 20,
          acceptanceRelevant: true,
        },
      ],
      clarifications:
        input.rawRequest.trim().length < 20
          ? [
              {
                question: "Can you describe the deliverable and how you will judge it?",
                requirementKey: "deliverable_provided",
              },
            ]
          : [],
      acceptanceRules: [
        {
          requirementKey: "deliverable_provided",
          method: "SEMANTIC",
          instructions: "Judge whether the deliverable satisfies the stated request.",
        },
      ],
      scopeIncluded: [input.title],
      scopeExcluded: [],
      capabilityTags: ["general"],
      estimatedBudgetMinor: Math.floor(input.budgetMinor * 0.8),
    };
  }

  async assessRequirement(input: AssessRequirementInput): Promise<SemanticAssessment> {
    const summary = input.deliverableSummary.toLowerCase();
    // Deterministic signal: if the summary explicitly claims the property was
    // handled, pass; if it admits otherwise, fail; otherwise escalate.
    const key = input.requirementKey;
    const positive = new RegExp(`${key.split("_")[0]}|handled|removed|clean`, "i");

    if (/fail|not (removed|handled|clean)|unsure|uncertain/.test(summary)) {
      return {
        requirementKey: key,
        outcome: "FAIL",
        confidence: 0.7,
        rationale: `The deliverable summary indicates the requirement "${key}" may not be satisfied.`,
        evidence: [
          { type: "MODEL_OBSERVATION", description: "Summary contains a negative signal." },
        ],
      };
    }
    if (positive.test(summary)) {
      return {
        requirementKey: key,
        outcome: "PASS",
        confidence: 0.75,
        rationale: `The deliverable summary supports the requirement "${key}".`,
        evidence: [
          { type: "MODEL_OBSERVATION", description: "Summary contains a supporting signal." },
        ],
      };
    }
    return {
      requirementKey: key,
      outcome: "UNCERTAIN",
      confidence: 0.5,
      rationale: `The deliverable summary is inconclusive for requirement "${key}".`,
      evidence: [],
    };
  }

  async draftOffer(input: DraftOfferInput): Promise<OfferDraft> {
    // Strategy: open low, converge upward, but never exceed the buyer ceiling.
    const ceiling = input.budgetMinor;
    const opening = Math.floor(ceiling * 0.7);
    const convergence = Math.floor(ceiling * Math.min(0.7 + 0.1 * input.round, 0.98));
    const asking = input.providerAskingMinor;
    const target =
      asking !== undefined
        ? Math.min(Math.max(asking, opening), Math.floor(ceiling * 0.98))
        : convergence;
    const price = Math.max(0, Math.min(target, ceiling));

    const jitter = parseInt(stableHash(`${input.taskId}:${input.round}`).slice(0, 4), 16) % 500;
    return {
      priceMinor: Math.min(price + jitter, ceiling),
      deliveryDeadline: input.desiredDeadline,
      message: `Proposal for round ${input.round + 1}: ${price} minor units, within the stated budget.`,
    };
  }
}
