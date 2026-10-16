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
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

export class OpenAIAI implements AIClient {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries,
    });
    this.model = options.model;
  }

  async planTask(input: PlanTaskInput): Promise<WorkPlan> {
    const user = [
      "Plan the delivery of the following request as a bounded contract.",
      "Return requirements, optional clarifications, acceptance rules and scope.",
      "Prefer DETERMINISTIC acceptance rules wherever a machine can check the property.",
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
      "You are a precise delivery planner. You never invent prices; the buyer sets the budget.",
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
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions,
        input: user,
        text: {
          format: {
            type: "json_schema",
            name,
            schema: zodToJsonSchema(schema),
            strict: true,
          },
        },
      });
      raw = response.output_text;
    } catch (error) {
      throw new AppError("EXTERNAL_FAILURE", "OpenAI request failed", { cause: error });
    }

    if (!raw) {
      throw new AppError("EXTERNAL_FAILURE", "OpenAI returned an empty response");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      throw new AppError("EXTERNAL_FAILURE", "OpenAI returned invalid JSON", { cause: error });
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
 * the subset the schemas above use: objects, arrays, strings with enums,
 * numbers, booleans, optional and default, and passthrough records.
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
