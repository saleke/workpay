import { describe, expect, it } from "vitest";
import {
  intentInterpretationOutputSchema,
  scopeAssessmentOutputSchema,
} from "../../domain/intake/model.js";
import { normalizeCloudflareIntentFamiliarity } from "./intake.js";
import { zodToJsonSchema } from "./openai.js";

describe("intake output JSON schemas", () => {
  it("preserves the intent output object when converting refined Zod schemas", () => {
    expect(zodToJsonSchema(intentInterpretationOutputSchema)).toMatchObject({
      type: "object",
      properties: {
        summary: { type: "string" },
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              category: { type: "string" },
              value: { type: "string" },
              evidence: { type: "array" },
            },
          },
        },
        taskFamiliarity: {
          type: "object",
          properties: {
            level: { type: "string" },
            confidence: { type: "string" },
            evidence: { type: "array" },
          },
        },
      },
    });
  });

  it("preserves the scope output object and its refined nested budget schema", () => {
    expect(zodToJsonSchema(scopeAssessmentOutputSchema)).toMatchObject({
      type: "object",
      properties: {
        budget: {
          type: "object",
          properties: {
            meaning: { anyOf: expect.any(Array) },
            evidence: { type: "array" },
          },
        },
        criticalUnknowns: { type: "array" },
      },
    });
  });

  it("removes familiarity evidence when the model reports an unknown level", () => {
    const result = normalizeCloudflareIntentFamiliarity({
      summary: "Build a website.",
      facts: [],
      taskFamiliarity: {
        level: "unknown",
        confidence: "medium",
        evidence: [{ sourceId: "source_original", quote: "Build a website." }],
      },
    });

    expect(intentInterpretationOutputSchema.parse(result).taskFamiliarity).toEqual({
      level: "unknown",
      confidence: "low",
      evidence: [],
    });
  });

  it("defaults familiarity to unknown when a level has no supporting evidence", () => {
    const result = normalizeCloudflareIntentFamiliarity({
      summary: "Build a website.",
      facts: [],
      taskFamiliarity: {
        level: "experienced",
        confidence: "high",
        evidence: [],
      },
    });

    expect(intentInterpretationOutputSchema.parse(result).taskFamiliarity).toEqual({
      level: "unknown",
      confidence: "low",
      evidence: [],
    });
  });
});
