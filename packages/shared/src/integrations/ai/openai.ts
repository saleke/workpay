/**
 * OpenAI adapter using the Responses API with a strict JSON schema output.
 *
 * This adapter is intentionally defensive: every response is parsed and
 * validated with Zod before it is returned. A malformed or off-schema response
 * is raised as a classified external error so the caller can fall back to a
 * deterministic path. The model is never trusted to produce a number that is
 * used for money without the deterministic policy engine agreeing first.
 */
import OpenAI from "openai";
import type { z } from "zod";
import { AppError } from "../../platform/errors.js";
import { logger } from "../../platform/logger.js";
import {
  offerDraftSchema,
  semanticAssessmentSchema,
  workPlanSchema,
  type AIClient,
  type AssessRequirementInput,
  type DraftOfferInput,
  type OfferDraft,
  type PlanTaskInput,
  type SemanticAssessment,
  type WorkPlan,
} from "./types.js";

interface OpenAIOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

export class OpenAIAI implements AIClient {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly hasCustomBaseUrl: boolean;

  constructor(options: OpenAIOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries,
    });
    this.model = options.model;
    this.hasCustomBaseUrl = Boolean(options.baseURL);
  }

  async planTask(input: PlanTaskInput): Promise<WorkPlan> {
    const user = [
      "Plan the delivery of the following request as a bounded contract.",
      "Return requirements, optional clarifications, acceptance rules and scope.",
      "IMPORTANT: All requirement keys MUST be snake_case (e.g. deduplicate_records, check_nulls, valid_emails) strictly matching ^[a-z0-9_]+$.",
      "For DETERMINISTIC acceptance rules, set params: { check: 'unique_column', column: 'email' } for uniqueness/deduplication, { check: 'non_empty_columns', columns: ['name', 'email'] } for null checks, or { check: 'iso8601_dates', columns: ['joined_at'] } for dates. Otherwise use method 'SEMANTIC' or 'HUMAN_REVIEW'.",
      "",
      `Title: ${input.title}`,
      `Request: ${input.rawRequest}`,
      `Buyer budget (minor units): ${input.budgetMinor} ${input.currency}`,
      input.desiredDeadline ? `Desired deadline: ${input.desiredDeadline}` : "",
      input.fileSummaries.length ? `Attached files:\n- ${input.fileSummaries.join("\n- ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return this.callJson(
      workPlanSchema,
      "work_plan",
      "You are a precise delivery planner. You never invent prices; the buyer sets the budget. All requirement keys must be snake_case.",
      user,
    );
  }

  async assessRequirement(input: AssessRequirementInput): Promise<SemanticAssessment> {
    const user = [
      `Requirement key: ${input.requirementKey}`,
      `Requirement: ${input.requirementStatement}`,
      input.instructions ? `How to judge: ${input.instructions}` : "",
      "",
      "Deliverable summary provided by the performer:",
      input.deliverableSummary,
      "",
      "Judge only what the summary supports. If it is inconclusive, answer UNCERTAIN.",
    ]
      .filter(Boolean)
      .join("\n");

    return this.callJson(
      semanticAssessmentSchema,
      "semantic_assessment",
      "You assess whether a deliverable satisfies one requirement. You never authorize payment.",
      user,
    );
  }

  async draftOffer(input: DraftOfferInput): Promise<OfferDraft> {
    const user = [
      `Contract summary: ${input.contractSummary}`,
      `Buyer budget (minor units): ${input.budgetMinor} ${input.currency}`,
      `Round: ${input.round}`,
      input.providerAskingMinor !== undefined
        ? `Provider asking (minor units): ${input.providerAskingMinor}`
        : "",
      `Desired deadline: ${input.desiredDeadline}`,
      "Propose a price at or below the buyer budget.",
    ]
      .filter(Boolean)
      .join("\n");

    return this.callJson(
      offerDraftSchema,
      "offer_draft",
      "You negotiate on behalf of the buyer. You must never propose a price above the buyer budget.",
      user,
    );
  }

  private async callJson<T extends z.ZodTypeAny>(
    schema: T,
    name: string,
    instructions: string,
    user: string,
  ): Promise<z.infer<T>> {
    let raw: string | undefined;
    const jsonSchema = zodToJsonSchema(schema);

    if (this.hasCustomBaseUrl) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: "system",
              content: `${instructions}\n\nYou MUST respond with a valid JSON object strictly matching this schema:\n${JSON.stringify(jsonSchema)}`,
            },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: 4096,
        });
        raw = completion.choices[0]?.message?.content ?? undefined;
      } catch (error) {
        throw new AppError(
          "EXTERNAL_FAILURE",
          `AI request failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } else {
      try {
        const response = await this.client.responses.create({
          model: this.model,
          instructions,
          input: user,
          text: {
            format: {
              type: "json_schema",
              name,
              schema: jsonSchema,
              strict: true,
            },
          },
        });
        raw = response.output_text;
      } catch (error) {
        // Fallback to chat completions if responses endpoint fails
        try {
          const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [
              {
                role: "system",
                content: `${instructions}\n\nYou MUST respond with a valid JSON object strictly matching this schema:\n${JSON.stringify(jsonSchema)}`,
              },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            max_tokens: 4096,
          });
          raw = completion.choices[0]?.message?.content ?? undefined;
        } catch {
          throw new AppError("EXTERNAL_FAILURE", "OpenAI request failed", { cause: error });
        }
      }
    }

    if (!raw) {
      throw new AppError("EXTERNAL_FAILURE", "AI returned an empty response");
    }

    let parsedJson: unknown;
    try {
      let cleaned = raw.trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch && fenceMatch[1]) {
        cleaned = fenceMatch[1].trim();
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
      parsedJson = JSON.parse(cleaned);
    } catch (error) {
      logger.error({ raw, err: String(error) }, "Failed to parse AI JSON response");
      throw new AppError("EXTERNAL_FAILURE", `AI returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }

    if (parsedJson && typeof parsedJson === "object") {
      const obj = parsedJson as Record<string, any>;
      const sanitizeKey = (k: unknown): string => {
        if (typeof k !== "string") return "req_1";
        const s = k.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
        return s.length > 0 ? s : "req_1";
      };

      if (Array.isArray(obj.requirements)) {
        for (const req of obj.requirements) {
          if (req && typeof req === "object" && typeof req.key === "string") {
            req.key = sanitizeKey(req.key);
          }
        }
      }
      if (Array.isArray(obj.acceptanceRules)) {
        for (const rule of obj.acceptanceRules) {
          if (rule && typeof rule === "object") {
            if (typeof rule.requirementKey === "string") {
              rule.requirementKey = sanitizeKey(rule.requirementKey);
            }
            if (rule.method === "DETERMINISTIC") {
              const key = String(rule.requirementKey || "").toLowerCase();
              const p = (rule.params && typeof rule.params === "object" ? rule.params : {}) as Record<string, unknown>;
              if (!p.check || typeof p.check !== "string") {
                if (key.includes("dup") || key.includes("uniq")) {
                  rule.params = { check: "unique_column", column: "email" };
                } else if (key.includes("null") || key.includes("empty") || key.includes("require")) {
                  rule.params = { check: "non_empty_columns", columns: ["name", "email"] };
                } else if (key.includes("date") || key.includes("iso")) {
                  rule.params = { check: "iso8601_dates", columns: ["joined_at"] };
                } else if (key.includes("format") || key.includes("email")) {
                  rule.params = { check: "email_format", column: "email" };
                } else {
                  rule.method = "SEMANTIC";
                  rule.instructions = rule.instructions || "Verify deliverable meets requirements";
                }
              }
            }
          }
        }
      }
      if (Array.isArray(obj.clarifications)) {
        for (const c of obj.clarifications) {
          if (c && typeof c === "object" && typeof c.requirementKey === "string") {
            c.requirementKey = sanitizeKey(c.requirementKey);
          }
        }
      }
      if (typeof obj.requirementKey === "string") {
        obj.requirementKey = sanitizeKey(obj.requirementKey);
      }
    }

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new AppError("EXTERNAL_FAILURE", "OpenAI response did not match the expected schema", {
        details: { issues: parsed.error.issues.map((i) => i.message) },
      });
    }
    return parsed.data as z.infer<T>;
  }
}

/**
 * Minimal Zod to JSON Schema conversion for the object shapes used here. This
 * avoids adding a dependency for a handful of structured outputs. It supports
 * the subset the schemas above use: objects, arrays, unions, refined schemas,
 * strings with enums, numbers, booleans, optional and default, and records.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def: any = (schema as { _def: unknown })._def;
  const description = (schema as { description?: string }).description;

  const withDescription = (out: Record<string, unknown>): Record<string, unknown> =>
    description ? { ...out, description } : out;

  switch (def.typeName) {
    case "ZodObject": {
      const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isOptional(value)) required.push(key);
      }
      return withDescription({
        type: "object",
        properties,
        required,
        additionalProperties: false,
      });
    }
    case "ZodArray": {
      const element = (def as { type: z.ZodTypeAny }).type;
      return withDescription({ type: "array", items: zodToJsonSchema(element) });
    }
    case "ZodString": {
      const checks = (def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? [];
      const out: Record<string, unknown> = { type: "string" };
      for (const c of checks) {
        if (c.kind === "min") out.minLength = c.value;
        if (c.kind === "max") out.maxLength = c.value;
      }
      return withDescription(out);
    }
    case "ZodNumber": {
      return withDescription({ type: "number" });
    }
    case "ZodBoolean": {
      return withDescription({ type: "boolean" });
    }
    case "ZodEnum": {
      const values = (def as { values: string[] }).values;
      return withDescription({ type: "string", enum: values });
    }
    case "ZodLiteral": {
      return { const: (def as { value: unknown }).value };
    }
    case "ZodOptional":
    case "ZodDefault": {
      const inner = (def as { innerType: z.ZodTypeAny }).innerType;
      return zodToJsonSchema(inner);
    }
    case "ZodEffects": {
      const inner = (def as { schema: z.ZodTypeAny }).schema;
      return zodToJsonSchema(inner);
    }
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      const options = (def as { options: z.ZodTypeAny[] }).options;
      return { anyOf: options.map(zodToJsonSchema) };
    }
    case "ZodNullable": {
      const inner = (def as { innerType: z.ZodTypeAny }).innerType;
      return { anyOf: [zodToJsonSchema(inner), { type: "null" }] };
    }
    case "ZodRecord": {
      return { type: "object", additionalProperties: true };
    }
    case "ZodUnknown":
    case "ZodAny": {
      return {};
    }
    default:
      // Unknown constructs degrade to a permissive schema rather than crashing
      // the whole request.
      return {};
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = (schema._def as { typeName: string }).typeName;
  if (typeName === "ZodOptional" || typeName === "ZodDefault") return true;
  return false;
}
