/**
 * Intent-Aware Consultative Extraction & Advisory Engine.
 *
 * Provides:
 * 1. User message intent classification (clarification queries vs answers)
 * 2. Expert product manager recommendations when clients are uncertain
 * 3. Multi-slot semantic extraction in a single turn
 * 4. Feasibility & Scope-Trimming Advisory for budget-to-scope mismatches
 */

import type { DomainDefinition, DomainSlotDefinition } from "./capability-tree.js";
import type { ScopingOption } from "./types.js";

export type UserTurnIntentType =
  | "CLARIFICATION_QUERY"
  | "BUDGET_DECLARATION"
  | "PROVIDE_ANSWER";

export interface UserTurnIntent {
  type: UserTurnIntentType;
  clarificationTopic?: string;
  declaredBudgetMinor?: number;
  extractedSlots: Record<string, string>;
}

export interface ConsultativeAdvisory {
  explanation: string;
  recommendation: string;
  recommendedOptionId?: string;
}

export interface FeasibilityAssessment {
  rating: "healthy" | "tight" | "underfunded";
  benchmarkBaselineMinor: number;
  advisoryMessage?: string;
}

/**
 * Classifies the conversational intent of a user message.
 */
export function classifyUserTurnIntent(
  message: string,
  currentSlot?: DomainSlotDefinition | null,
): UserTurnIntent {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check for clarification questions / requests for advice
  const isQuestion =
    trimmed.endsWith("?") ||
    /\b(what do you recommend|which is better|which one|what should i choose|help me choose|i don't know|not sure|what is the difference|can you explain|why would i choose|which is cheaper)\b/i.test(
      lower,
    );

  if (isQuestion) {
    return {
      type: "CLARIFICATION_QUERY",
      clarificationTopic: currentSlot?.slotKey,
      extractedSlots: {},
    };
  }

  // 2. Check for explicit budget declarations
  const budgetMatches = lower.match(/(?:\$|budget\s*(?:of|is|:)?\s*\$?)(\d[\d,]*(?:\.\d{2})?)/i);
  let declaredBudgetMinor: number | undefined;
  if (budgetMatches && budgetMatches[1]) {
    const rawVal = parseFloat(budgetMatches[1].replace(/,/g, ""));
    if (!isNaN(rawVal) && rawVal > 0) {
      declaredBudgetMinor = Math.round(rawVal * 100);
    }
  }

  return {
    type: "PROVIDE_ANSWER",
    declaredBudgetMinor,
    extractedSlots: {},
  };
}

/**
 * Generates an architectural product manager recommendation when the user asks for guidance.
 */
export function generateConsultativeAdvisory(
  slot: DomainSlotDefinition,
  userQuery: string,
  currentBudgetMinor?: number,
): ConsultativeAdvisory {
  const options = slot.options;
  if (!options || options.length === 0) {
    return {
      explanation: "This decision defines how your technical specialist will build this component.",
      recommendation: "We recommend proceeding with industry standard conventions.",
    };
  }

  const queryLower = userQuery.toLowerCase();
  const isBudgetSensitive =
    (currentBudgetMinor && currentBudgetMinor < 50000) ||
    queryLower.includes("cheap") ||
    queryLower.includes("cost") ||
    queryLower.includes("budget");

  // Pick the optimal option based on context
  let recommendedOption = options[0]!;
  if (isBudgetSensitive && options.length > 1) {
    // Pick the option that minimizes overhead or operational complexity
    const budgetFriendly = options.find(
      (o) =>
        /managed|serverless|fastest|conversion|supabase|sqlite/i.test(o.title) ||
        /low overhead|zero server/i.test(o.tradeOff),
    );
    if (budgetFriendly) recommendedOption = budgetFriendly;
  }

  const explanation = [
    `Regarding ${slot.questionLayman.toLowerCase().replace(/\?$/, "")}:`,
    options
      .map((opt) => `• ${opt.title}: ${opt.bestIf} (${opt.tradeOff})`)
      .join("\n"),
  ].join("\n\n");

  const recommendation = isBudgetSensitive
    ? `For your scope and budget, we recommend: "${recommendedOption.title}". It provides ${recommendedOption.tradeOff.toLowerCase()} with minimal maintenance overhead.`
    : `Based on your requirements, we recommend: "${recommendedOption.title}" (${recommendedOption.bestIf.toLowerCase()}).`;

  return {
    explanation,
    recommendation,
    recommendedOptionId: recommendedOption.id,
  };
}

/**
 * Extracts multiple slot answers from a single comprehensive user message.
 */
export function extractMultiSlotAnswers(
  message: string,
  domain: DomainDefinition,
  alreadyFilled: Record<string, string>,
): Record<string, string> {
  const newlyExtracted: Record<string, string> = {};
  const lower = message.toLowerCase();

  for (const slot of domain.slots) {
    if (alreadyFilled[slot.slotKey]) continue;

    // Check each option for keyword matches in user text
    for (const opt of slot.options) {
      const titleWords = opt.title.toLowerCase().split(/[\s/+,&]+/);
      const significantWords = titleWords.filter((w) => w.length >= 4 && !["with", "from", "that", "this"].includes(w));
      const matchCount = significantWords.filter((w) => lower.includes(w)).length;

      if (matchCount >= 2 || (significantWords.length === 1 && matchCount === 1)) {
        newlyExtracted[slot.slotKey] = opt.value;
        break;
      }
    }

    // Specific domain entity heuristics
    if (!newlyExtracted[slot.slotKey]) {
      if (slot.slotKey.includes("database") || slot.slotKey.includes("state")) {
        if (/postgres|psql|supabase/i.test(lower)) {
          newlyExtracted[slot.slotKey] = "Managed PostgreSQL (Supabase / RDS)";
        } else if (/mongo/i.test(lower)) {
          newlyExtracted[slot.slotKey] = "MongoDB Document Store";
        } else if (/sqlite/i.test(lower)) {
          newlyExtracted[slot.slotKey] = "SQLite Embedded Database";
        }
      } else if (slot.dimension === "validationProof") {
        if (/jest|vitest|unit test|test suite/i.test(lower)) {
          newlyExtracted[slot.slotKey] = "Automated Unit & Integration Test Suite";
        } else if (/playwright|cypress|e2e/i.test(lower)) {
          newlyExtracted[slot.slotKey] = "Automated E2E Playwright Browser Suite";
        }
      }
    }
  }

  return newlyExtracted;
}

/**
 * Evaluates the feasibility of the project based on domain complexity and user budget.
 * Surfaces Scope-Trimming Advisory if the scope exceeds market baseline.
 */
export function evaluateFeasibility(
  domain: DomainDefinition,
  budgetMinor: number,
  timelineDays: number,
): FeasibilityAssessment {
  // Domain market baselines (in USD minor)
  const baselines: Record<string, number> = {
    web_platform: 65000,
    mobile_app: 80000,
    api_integration: 45000,
    cloud_devops: 55000,
    cybersecurity: 70000,
    ecommerce: 50000,
    data_pipeline: 60000,
    automation_scripts: 35000,
    firmware_hardware: 75000,
    custom_software: 60000,
    general_project: 40000,
  };

  const baseline = baselines[domain.domainId] || 40000;

  if (budgetMinor >= baseline * 0.8) {
    return {
      rating: "healthy",
      benchmarkBaselineMinor: baseline,
    };
  }

  if (budgetMinor >= baseline * 0.5) {
    return {
      rating: "tight",
      benchmarkBaselineMinor: baseline,
      advisoryMessage: `Your allocated budget ($${(budgetMinor / 100).toFixed(0)}) is lean for standard ${domain.label} market rates ($${(baseline / 100).toFixed(0)}). We recommend locking in a focused Phase 1 deliverable with automated acceptance criteria.`,
    };
  }

  return {
    rating: "underfunded",
    benchmarkBaselineMinor: baseline,
    advisoryMessage: `Scope-Trimming Advisory: A full-scale ${domain.label} typically requires $${(baseline / 100).toFixed(0)} in engineering effort. For your target budget of $${(budgetMinor / 100).toFixed(0)}, we recommend scoping Phase 1 as a focused MVP with core requirements, deferring secondary integrations to Phase 2.`,
  };
}
