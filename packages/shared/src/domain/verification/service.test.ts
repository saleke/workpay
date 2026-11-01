import { describe, expect, it } from "vitest";
import { FakeAI } from "../../integrations/ai/fake.js";
import type { SemanticAssessment } from "../../integrations/ai/types.js";
import type { Dataset } from "./checks.js";
import { aggregateVerificationOutcome, evaluateRules } from "./service.js";

class AssessmentAI extends FakeAI {
  constructor(private readonly assessment: SemanticAssessment) {
    super();
  }

  override async assessRequirement(): Promise<SemanticAssessment> {
    return this.assessment;
  }
}

const dataset: Dataset = { columns: [], rows: [] };
const requirement = {
  key: "professional_quality",
  statement: "The deliverable is professionally presented.",
};
const semanticRule = {
  requirementKey: requirement.key,
  method: "SEMANTIC" as const,
  params: null,
  instructions: null,
};

describe("semantic verification authority", () => {
  it.each(["PASS", "FAIL", "UNCERTAIN"] as const)(
    "keeps an AI %s assessment advisory and unresolved",
    async (advisoryOutcome) => {
      const ai = new AssessmentAI({
        requirementKey: requirement.key,
        outcome: advisoryOutcome,
        confidence: 0.99,
        rationale: `AI says ${advisoryOutcome.toLowerCase()}.`,
        evidence: [{ type: "MODEL_OBSERVATION", description: "A model observation." }],
      });

      const results = await evaluateRules([requirement], [semanticRule], dataset, {
        taskId: "task_1",
        deliverableSummary: "Provider-supplied summary.",
        ai,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        method: "SEMANTIC",
        outcome: "UNCERTAIN",
        confidence: 0,
        advisoryOutcome,
        detail: { advisoryOutcome, advisoryConfidence: 0.99 },
      });
      expect(aggregateVerificationOutcome(results)).toBe("UNCERTAIN");
    },
  );

  it("allows deterministic checks to decide only their tested properties", () => {
    expect(
      aggregateVerificationOutcome([
        {
          requirementKey: "unique_emails",
          method: "DETERMINISTIC",
          outcome: "PASS",
          confidence: 1,
          rationale: "All emails are unique.",
        },
      ]),
    ).toBe("PASS");

    expect(
      aggregateVerificationOutcome([
        {
          requirementKey: "unique_emails",
          method: "DETERMINISTIC",
          outcome: "FAIL",
          confidence: 0,
          rationale: "Duplicate emails found.",
        },
      ]),
    ).toBe("FAIL");
  });

  it("does not pass when there are no acceptance results", () => {
    expect(aggregateVerificationOutcome([])).toBe("UNCERTAIN");
  });
});
