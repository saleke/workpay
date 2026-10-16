/**
 * The WorkPay event catalog. This is the frozen shared contract between
 * producers and consumers (ENGINEERING_PLAN Appendix A). Each entry declares
 * the aggregate it belongs to, its activity visibility, and a Zod schema for
 * the payload.
 *
 * Producers own their payloads. Consumers listed in the plan are the only ones
 * that must react. Every event committed here is validated before it reaches
 * the outbox (Component 12).
 */
import { z } from "zod";
import type { EventDefinition } from "./envelope.js";

const money = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().min(1),
});

const providerSnapshot = z.object({
  providerId: z.string(),
  displayName: z.string(),
  firstPassAcceptancePct: z.number().optional(),
  onTimeRatePct: z.number().optional(),
  completedTasks: z.number().int().optional(),
  priceMinor: z.number().int().optional(),
  currency: z.string().optional(),
});

export const eventCatalog = {
  // ── Tasks ──────────────────────────────────────────────────────────────────
  TASK_CREATED: {
    type: "TASK_CREATED",
    version: 1,
    aggregateType: "TASK",
    visibility: "USER",
    description: "Task created",
    payload: z.object({ taskId: z.string(), userId: z.string(), source: z.string() }),
  },
  TASK_STATUS_CHANGED: {
    type: "TASK_STATUS_CHANGED",
    version: 1,
    aggregateType: "TASK",
    visibility: "USER",
    description: "Task status changed",
    payload: z.object({ taskId: z.string(), from: z.string(), to: z.string() }),
  },
  TASK_COMPLETED: {
    type: "TASK_COMPLETED",
    version: 1,
    aggregateType: "TASK",
    visibility: "USER",
    description: "Task completed",
    payload: z.object({ taskId: z.string() }),
  },
  TASK_CANCELLED: {
    type: "TASK_CANCELLED",
    version: 1,
    aggregateType: "TASK",
    visibility: "USER",
    description: "Task cancelled",
    payload: z.object({ taskId: z.string(), reason: z.string().optional() }),
  },

  // ── Planning ───────────────────────────────────────────────────────────────
  WORK_SPEC_CREATED: {
    type: "WORK_SPEC_CREATED",
    version: 1,
    aggregateType: "WORK_SPEC",
    visibility: "USER",
    description: "Work specification created",
    payload: z.object({
      taskId: z.string(),
      workSpecificationId: z.string(),
      version: z.number().int(),
      requirementCount: z.number().int(),
      proposedRequirementCount: z.number().int(),
      planSource: z.enum(["AI", "DETERMINISTIC_FALLBACK"]),
    }),
  },
  CLARIFICATION_REQUESTED: {
    type: "CLARIFICATION_REQUESTED",
    version: 1,
    aggregateType: "WORK_SPEC",
    visibility: "USER",
    description: "Clarification requested",
    payload: z.object({
      taskId: z.string(),
      clarificationIds: z.array(z.string()),
      questions: z.array(z.string()),
    }),
  },
  CLARIFICATION_ANSWERED: {
    type: "CLARIFICATION_ANSWERED",
    version: 1,
    aggregateType: "WORK_SPEC",
    visibility: "USER",
    description: "Clarification answered",
    payload: z.object({ taskId: z.string(), clarificationId: z.string() }),
  },

  // ── Contracts ──────────────────────────────────────────────────────────────
  CONTRACT_CREATED: {
    type: "CONTRACT_CREATED",
    version: 1,
    aggregateType: "CONTRACT",
    visibility: "USER",
    description: "Contract drafted",
    payload: z.object({
      taskId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      contractHash: z.string(),
      budgetMinor: z.number().int(),
      currency: z.string(),
    }),
  },
  CONTRACT_APPROVED: {
    type: "CONTRACT_APPROVED",
    version: 1,
    aggregateType: "CONTRACT",
    visibility: "USER",
    description: "Contract approved",
    payload: z.object({
      taskId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      contractHash: z.string(),
      approvedBy: z.string(),
    }),
  },
  CONTRACT_AMENDED: {
    type: "CONTRACT_AMENDED",
    version: 1,
    aggregateType: "CONTRACT",
    visibility: "USER",
    description: "Contract amended",
    payload: z.object({
      taskId: z.string(),
      contractId: z.string(),
      fromVersion: z.number().int(),
      toVersion: z.number().int(),
      reason: z.string(),
    }),
  },

  // ── Provider selection ─────────────────────────────────────────────────────
  PROVIDER_SEARCH_STARTED: {
    type: "PROVIDER_SEARCH_STARTED",
    version: 1,
    aggregateType: "PROVIDER_SELECTION",
    visibility: "USER",
    description: "Finding someone for this work",
    payload: z.object({
      taskId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
    }),
  },
  PROVIDER_SELECTED: {
    type: "PROVIDER_SELECTED",
    version: 1,
    aggregateType: "PROVIDER_SELECTION",
    visibility: "USER",
    description: "Provider selected",
    payload: z.object({
      taskId: z.string(),
      contractId: z.string(),
      selectionId: z.string(),
      providerId: z.string(),
      provider: providerSnapshot,
      alternatives: z.array(providerSnapshot),
      reason: z.string(),
    }),
  },
  PROVIDER_SELECTION_FAILED: {
    type: "PROVIDER_SELECTION_FAILED",
    version: 1,
    aggregateType: "PROVIDER_SELECTION",
    visibility: "USER",
    description: "No eligible provider",
    payload: z.object({ taskId: z.string(), contractId: z.string(), reason: z.string() }),
  },

  // ── Negotiation and agreement ──────────────────────────────────────────────
  NEGOTIATION_STARTED: {
    type: "NEGOTIATION_STARTED",
    version: 1,
    aggregateType: "NEGOTIATION",
    visibility: "USER",
    description: "Negotiation started",
    payload: z.object({
      taskId: z.string(),
      negotiationId: z.string(),
      contractId: z.string(),
      providerId: z.string(),
    }),
  },
  OFFER_CREATED: {
    type: "OFFER_CREATED",
    version: 1,
    aggregateType: "NEGOTIATION",
    visibility: "USER",
    description: "Offer created",
    payload: z.object({
      taskId: z.string(),
      negotiationId: z.string(),
      offerId: z.string(),
      version: z.number().int(),
      submittedBy: z.enum(["BUYER_AGENT", "PROVIDER"]),
      price: money,
      deliveryDeadline: z.string(),
    }),
  },
  COUNTEROFFER_RECEIVED: {
    type: "COUNTEROFFER_RECEIVED",
    version: 1,
    aggregateType: "NEGOTIATION",
    visibility: "USER",
    description: "Counteroffer received",
    payload: z.object({
      taskId: z.string(),
      negotiationId: z.string(),
      offerId: z.string(),
      price: money,
    }),
  },
  OFFER_ACCEPTED: {
    type: "OFFER_ACCEPTED",
    version: 1,
    aggregateType: "NEGOTIATION",
    visibility: "USER",
    description: "Offer accepted",
    payload: z.object({
      taskId: z.string(),
      negotiationId: z.string(),
      offerId: z.string(),
      acceptedBy: z.enum(["BUYER_AGENT", "PROVIDER"]),
    }),
  },
  SCOPE_CHANGE_REQUESTED: {
    type: "SCOPE_CHANGE_REQUESTED",
    version: 1,
    aggregateType: "NEGOTIATION",
    visibility: "USER",
    description: "Scope change requested",
    payload: z.object({ taskId: z.string(), negotiationId: z.string(), description: z.string() }),
  },
  COMMERCIAL_AGREEMENT_CREATED: {
    type: "COMMERCIAL_AGREEMENT_CREATED",
    version: 1,
    aggregateType: "AGREEMENT",
    visibility: "USER",
    description: "Commercial agreement created",
    payload: z.object({
      taskId: z.string(),
      agreementId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      providerId: z.string(),
      agreementHash: z.string(),
      agreedPrice: money,
    }),
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  PAYMENT_AUTHORIZATION_REQUESTED: {
    type: "PAYMENT_AUTHORIZATION_REQUESTED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "USER",
    description: "Requesting payment authorization",
    payload: z.object({ taskId: z.string(), paymentId: z.string(), amount: money }),
  },
  PAYMENT_AUTHORIZED: {
    type: "PAYMENT_AUTHORIZED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "USER",
    description: "Payment authorized through PayPal",
    payload: z.object({
      taskId: z.string(),
      paymentId: z.string(),
      amount: money,
      paypalAuthorizationId: z.string().nullable(),
    }),
  },
  PAYMENT_AUTHORIZATION_FAILED: {
    type: "PAYMENT_AUTHORIZATION_FAILED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "USER",
    description: "Payment authorization failed",
    payload: z.object({ taskId: z.string(), paymentId: z.string(), reason: z.string() }),
  },
  PAYMENT_POLICY_EVALUATED: {
    type: "PAYMENT_POLICY_EVALUATED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "ADMIN",
    description: "Payment policy evaluated",
    payload: z.object({
      taskId: z.string(),
      paymentId: z.string(),
      decisionId: z.string(),
      action: z.enum(["AUTHORIZE", "CAPTURE", "VOID", "REFUND"]),
      result: z.enum(["ALLOW", "DENY"]),
      reasonCode: z.string(),
      policyVersion: z.string(),
    }),
  },
  CAPTURE_COMMAND_CREATED: {
    type: "CAPTURE_COMMAND_CREATED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "ADMIN",
    description: "Capture command created",
    payload: z.object({
      taskId: z.string(),
      paymentId: z.string(),
      captureCommandId: z.string(),
      amount: money,
    }),
  },
  PAYMENT_CAPTURED: {
    type: "PAYMENT_CAPTURED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "USER",
    description: "Payment released",
    payload: z.object({
      taskId: z.string(),
      paymentId: z.string(),
      amount: money,
      paypalCaptureId: z.string().nullable(),
    }),
  },
  PAYMENT_CAPTURE_FAILED: {
    type: "PAYMENT_CAPTURE_FAILED",
    version: 1,
    aggregateType: "PAYMENT",
    visibility: "USER",
    description: "Payment capture failed",
    payload: z.object({ taskId: z.string(), paymentId: z.string(), reason: z.string() }),
  },

  // ── Execution and submission ───────────────────────────────────────────────
  PROVIDER_ACCEPTED: {
    type: "PROVIDER_ACCEPTED",
    version: 1,
    aggregateType: "EXECUTION",
    visibility: "USER",
    description: "Work accepted by provider",
    payload: z.object({
      taskId: z.string(),
      executionId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      providerId: z.string(),
    }),
  },
  WORK_STARTED: {
    type: "WORK_STARTED",
    version: 1,
    aggregateType: "EXECUTION",
    visibility: "USER",
    description: "Work in progress",
    payload: z.object({ taskId: z.string(), executionId: z.string() }),
  },
  SUBMISSION_CREATED: {
    type: "SUBMISSION_CREATED",
    version: 1,
    aggregateType: "SUBMISSION",
    visibility: "PROVIDER",
    description: "Submission created",
    payload: z.object({
      taskId: z.string(),
      executionId: z.string(),
      submissionId: z.string(),
      version: z.number().int(),
    }),
  },
  SUBMISSION_SUBMITTED: {
    type: "SUBMISSION_SUBMITTED",
    version: 1,
    aggregateType: "SUBMISSION",
    visibility: "USER",
    description: "Submission received",
    payload: z.object({
      taskId: z.string(),
      executionId: z.string(),
      submissionId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      contractHash: z.string(),
      version: z.number().int(),
      isResubmission: z.boolean(),
    }),
  },
  REVISION_REQUESTED: {
    type: "REVISION_REQUESTED",
    version: 1,
    aggregateType: "SUBMISSION",
    visibility: "USER",
    description: "Revision requested",
    payload: z.object({
      taskId: z.string(),
      executionId: z.string(),
      submissionId: z.string(),
      reason: z.string(),
    }),
  },

  // ── Verification ───────────────────────────────────────────────────────────
  VERIFICATION_STARTED: {
    type: "VERIFICATION_STARTED",
    version: 1,
    aggregateType: "VERIFICATION",
    visibility: "USER",
    description: "Checking the result",
    payload: z.object({
      taskId: z.string(),
      verificationRunId: z.string(),
      submissionId: z.string(),
      contractVersion: z.number().int(),
    }),
  },
  VERIFICATION_PASSED: {
    type: "VERIFICATION_PASSED",
    version: 1,
    aggregateType: "VERIFICATION",
    visibility: "USER",
    description: "Verification passed",
    payload: z.object({
      taskId: z.string(),
      verificationRunId: z.string(),
      acceptanceDecisionId: z.string(),
      submissionId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      contractHash: z.string(),
      passedRequirements: z.number().int(),
      failedRequirements: z.number().int(),
    }),
  },
  VERIFICATION_FAILED: {
    type: "VERIFICATION_FAILED",
    version: 1,
    aggregateType: "VERIFICATION",
    visibility: "USER",
    description: "Verification failed",
    payload: z.object({
      taskId: z.string(),
      verificationRunId: z.string(),
      acceptanceDecisionId: z.string(),
      submissionId: z.string(),
      contractId: z.string(),
      contractVersion: z.number().int(),
      failedRequirements: z.array(z.string()),
    }),
  },
  VERIFICATION_UNCERTAIN: {
    type: "VERIFICATION_UNCERTAIN",
    version: 1,
    aggregateType: "VERIFICATION",
    visibility: "USER",
    description: "Verification needs human review",
    payload: z.object({
      taskId: z.string(),
      verificationRunId: z.string(),
      acceptanceDecisionId: z.string(),
      submissionId: z.string(),
      uncertainRequirements: z.array(z.string()),
    }),
  },

  // ── Cases ──────────────────────────────────────────────────────────────────
  CASE_OPENED: {
    type: "CASE_OPENED",
    version: 1,
    aggregateType: "CASE",
    visibility: "ADMIN",
    description: "A case was opened",
    payload: z.object({
      taskId: z.string(),
      caseId: z.string(),
      category: z.string(),
      severity: z.string(),
      blocksPaymentCapture: z.boolean(),
    }),
  },
  CASE_RESOLVED: {
    type: "CASE_RESOLVED",
    version: 1,
    aggregateType: "CASE",
    visibility: "ADMIN",
    description: "A case was resolved",
    payload: z.object({
      taskId: z.string(),
      caseId: z.string(),
      outcome: z.string(),
    }),
  },

  // ── Agent ──────────────────────────────────────────────────────────────────
  AGENT_ACTION_RECORDED: {
    type: "AGENT_ACTION_RECORDED",
    version: 1,
    aggregateType: "AGENT",
    visibility: "ADMIN",
    description: "Agent action recorded",
    payload: z.object({
      taskId: z.string(),
      agentRunId: z.string(),
      actionId: z.string(),
      actionType: z.string(),
      status: z.string(),
      reasonCode: z.string().optional(),
    }),
  },
  AGENT_AUTHORITY_DENIED: {
    type: "AGENT_AUTHORITY_DENIED",
    version: 1,
    aggregateType: "AGENT",
    visibility: "ADMIN",
    description: "Agent action denied by authority policy",
    payload: z.object({
      taskId: z.string(),
      agentRunId: z.string(),
      actionType: z.string(),
      reason: z.string(),
    }),
  },
} as const satisfies Record<string, EventDefinition>;

export type EventType = keyof typeof eventCatalog;
export const EVENT_TYPES = Object.keys(eventCatalog) as EventType[];

export type EventPayloadOf<T extends EventType> = z.infer<(typeof eventCatalog)[T]["payload"]>;

export function isEventType(value: string): value is EventType {
  return Object.prototype.hasOwnProperty.call(eventCatalog, value);
}

export function getEventDefinition(type: string): EventDefinition {
  if (!isEventType(type)) {
    throw new Error(`Unknown event type: ${type}`);
  }
  return eventCatalog[type] as EventDefinition;
}
