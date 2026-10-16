/**
 * Postgres enum types. These mirror the exact string vocabularies in the
 * architecture docs; the database enforces them so an application bug cannot
 * write an unknown state.
 */
import { pgEnum } from "drizzle-orm/pg-core";

// Identity
export const userRoleEnum = pgEnum("user_role", ["buyer", "provider", "admin_reviewer"]);

// Tasks
export const taskStatusEnum = pgEnum("task_status", [
  "DRAFT",
  "CREATED",
  "PLANNING",
  "AWAITING_CLARIFICATION",
  "CONTRACT_REVIEW",
  "APPROVED",
  "PROVIDER_SEARCH",
  "NEGOTIATION",
  "AGREEMENT_READY",
  "PAYMENT_AUTHORIZATION",
  "WORK_IN_PROGRESS",
  "SUBMITTED",
  "VERIFYING",
  "REVISION_REQUIRED",
  "HUMAN_REVIEW",
  "PAYMENT_RELEASE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
]);

// Planning
export const requirementSourceEnum = pgEnum("requirement_source", [
  "USER_EXPLICIT",
  "USER_CLARIFIED",
  "DETERMINISTICALLY_DERIVED",
  "AI_PROPOSED",
]);

export const clarificationStatusEnum = pgEnum("clarification_status", [
  "PENDING",
  "ANSWERED",
  "CANCELLED",
]);

// Contracts
export const contractStatusEnum = pgEnum("contract_status", [
  "DRAFT",
  "AWAITING_APPROVAL",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
]);

export const scopeItemTypeEnum = pgEnum("scope_item_type", ["INCLUDED", "EXCLUDED"]);

export const verificationMethodTypeEnum = pgEnum("verification_method_type", [
  "DETERMINISTIC",
  "SEMANTIC",
  "HUMAN_REVIEW",
]);

// Providers
export const providerTypeEnum = pgEnum("provider_type", ["HUMAN", "AGENT", "SERVICE"]);
export const providerStatusEnum = pgEnum("provider_status", ["ACTIVE", "SUSPENDED", "INACTIVE"]);
export const providerSelectionStatusEnum = pgEnum("provider_selection_status", [
  "SELECTED",
  "FAILED",
  "EXPIRED",
]);

// Negotiation and agreement
export const negotiationStatusEnum = pgEnum("negotiation_status", [
  "INITIATED",
  "OFFER_SENT",
  "COUNTEROFFER_RECEIVED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);

export const offerStatusEnum = pgEnum("offer_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "SUPERSEDED",
]);

export const offerPartyEnum = pgEnum("offer_party", ["BUYER_AGENT", "PROVIDER"]);

export const paymentTermsTypeEnum = pgEnum("payment_terms_type", [
  "FULL_ON_ACCEPTANCE",
  "FULL_ON_VERIFICATION",
  "MILESTONE_BASED",
  "PARTIAL_UPFRONT",
]);

export const agreementStatusEnum = pgEnum("agreement_status", [
  "PENDING_AUTHORIZATION",
  "AUTHORIZED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

// Payments
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "AUTHORIZATION_REQUESTED",
  "AUTHORIZED",
  "CAPTURE_REQUESTED",
  "CAPTURED",
  "VOIDED",
  "REFUNDED",
  "FAILED",
  "UNKNOWN",
]);

export const paymentOperationActionEnum = pgEnum("payment_operation_action", [
  "AUTHORIZE",
  "CAPTURE",
  "VOID",
  "REFUND",
]);

export const paymentOperationStatusEnum = pgEnum("payment_operation_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "UNKNOWN",
]);

export const paymentDecisionActionEnum = pgEnum("payment_decision_action", [
  "AUTHORIZE",
  "CAPTURE",
  "VOID",
  "REFUND",
]);

export const paymentDecisionResultEnum = pgEnum("payment_decision_result", ["ALLOW", "DENY"]);

export const policyCheckResultEnum = pgEnum("policy_check_result", [
  "PASS",
  "FAIL",
  "NOT_APPLICABLE",
]);

// Execution and submission
export const executionStatusEnum = pgEnum("execution_status", [
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVISION_REQUESTED",
  "COMPLETED",
  "CANCELLED",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "REVISION_REQUESTED",
  "ACCEPTED",
  "REJECTED",
]);

export const artifactTypeEnum = pgEnum("artifact_type", [
  "PRIMARY_DELIVERABLE",
  "SUPPORTING_FILE",
  "EVIDENCE",
]);

// Verification
export const verificationOutcomeEnum = pgEnum("verification_outcome", [
  "PASS",
  "FAIL",
  "UNCERTAIN",
]);

export const verificationRunStatusEnum = pgEnum("verification_run_status", [
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export const verificationMethodValueEnum = pgEnum("verification_method_value", [
  "DETERMINISTIC",
  "SEMANTIC",
  "HUMAN",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "FILE",
  "ROW_RANGE",
  "FIELD",
  "TEXT_EXCERPT",
  "METRIC",
  "MODEL_OBSERVATION",
  "HUMAN_NOTE",
]);

// Cases
export const caseTypeEnum = pgEnum("case_type", ["EXCEPTION", "DISPUTE", "HUMAN_REVIEW"]);

export const caseCategoryEnum = pgEnum("case_category", [
  "VERIFICATION_UNCERTAIN",
  "WORK_DISPUTE",
  "CONTRACT_DISPUTE",
  "SCOPE_CHANGE",
  "DEADLINE_DISPUTE",
  "PAYMENT_EXCEPTION",
  "PAYMENT_DISPUTE",
  "PROVIDER_CLAIM",
  "BUYER_COMPLAINT",
  "TECHNICAL_FAILURE",
  "FRAUD_SUSPECTED",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "OPEN",
  "AWAITING_RESPONSE",
  "UNDER_REVIEW",
  "RESOLVED",
  "CLOSED",
]);

export const caseSeverityEnum = pgEnum("case_severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const caseOpenerEnum = pgEnum("case_opener", [
  "BUYER",
  "PROVIDER",
  "SYSTEM",
  "VERIFICATION",
  "PAYMENT",
]);

export const caseAuthorEnum = pgEnum("case_author", [
  "BUYER",
  "PROVIDER",
  "SYSTEM",
  "AI_ASSISTANT",
  "REVIEWER",
]);

export const resolutionOutcomeEnum = pgEnum("resolution_outcome", [
  "UPHOLD_SYSTEM_DECISION",
  "OVERRIDE_VERIFICATION",
  "REQUIRE_REVISION",
  "REQUIRE_NEW_EVIDENCE",
  "AMEND_CONTRACT",
  "CANCEL_TASK",
  "RELEASE_PAYMENT",
  "REFUND_PAYMENT",
  "VOID_PAYMENT",
  "NO_ACTION",
]);

// Agent
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "RUNNING",
  "WAITING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
]);

export const agentActionTypeEnum = pgEnum("agent_action_type", [
  "CREATE_PLAN",
  "REQUEST_CLARIFICATION",
  "CREATE_CONTRACT",
  "SELECT_PROVIDER",
  "START_NEGOTIATION",
  "SEND_OFFER",
  "ACCEPT_OFFER",
  "AUTHORIZE_PAYMENT",
  "REQUEST_VERIFICATION",
  "REQUEST_REVISION",
  "OPEN_CASE",
  "WAIT",
  "COMPLETE_TASK",
]);

export const agentActionStatusEnum = pgEnum("agent_action_status", [
  "PROPOSED",
  "VALIDATING",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "FAILED",
]);

// Infrastructure
export const aggregateTypeEnum = pgEnum("aggregate_type", [
  "TASK",
  "WORK_SPEC",
  "CONTRACT",
  "PROVIDER_SELECTION",
  "NEGOTIATION",
  "AGREEMENT",
  "PAYMENT",
  "EXECUTION",
  "SUBMISSION",
  "VERIFICATION",
  "CASE",
  "AGENT",
  "SYSTEM",
]);

export const actorTypeEnum = pgEnum("actor_type", [
  "USER",
  "AGENT",
  "PROVIDER",
  "SYSTEM",
  "PAYPAL",
  "REVIEWER",
]);

export const eventVisibilityEnum = pgEnum("event_visibility", [
  "USER",
  "PROVIDER",
  "ADMIN",
  "INTERNAL",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "DEAD_LETTER",
]);
