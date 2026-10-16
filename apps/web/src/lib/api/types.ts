import type { Money } from "@workpay/shared";

/**
 * Response DTOs for the WorkPay `/api/v1` contract.
 *
 * These mirror the shared domain row/enum vocabulary (packages/shared). The
 * long-term source of truth is the Zod-to-OpenAPI pipeline (plan section 5.3.5);
 * until that lands, these are the frontend's typed view of the API and must be
 * kept in lockstep with the server serialization. The frontend consumes only
 * `/api/v1` + SSE and never invents authoritative values (invariant F1).
 */

export type TaskStatus =
  | "DRAFT"
  | "CREATED"
  | "PLANNING"
  | "AWAITING_CLARIFICATION"
  | "CONTRACT_REVIEW"
  | "APPROVED"
  | "PROVIDER_SEARCH"
  | "NEGOTIATION"
  | "AGREEMENT_READY"
  | "PAYMENT_AUTHORIZATION"
  | "WORK_IN_PROGRESS"
  | "SUBMITTED"
  | "VERIFYING"
  | "REVISION_REQUIRED"
  | "HUMAN_REVIEW"
  | "PAYMENT_RELEASE"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";

export type ContractStatus =
  "DRAFT" | "AWAITING_APPROVAL" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "DISPUTED";

export type RequirementSource =
  "USER_EXPLICIT" | "USER_CLARIFIED" | "DETERMINISTICALLY_DERIVED" | "AI_PROPOSED";

export type PaymentStatus =
  | "PENDING"
  | "AUTHORIZATION_REQUESTED"
  | "AUTHORIZED"
  | "CAPTURE_REQUESTED"
  | "CAPTURED"
  | "VOIDED"
  | "REFUNDED"
  | "FAILED"
  | "UNKNOWN";

export type PaymentDecisionResult = "ALLOW" | "DENY";
export type PaymentDecisionAction = "AUTHORIZE" | "CAPTURE" | "VOID" | "REFUND";
export type PolicyCheckResult = "PASS" | "FAIL" | "NOT_APPLICABLE";

export type VerificationOutcome = "PASS" | "FAIL" | "UNCERTAIN";
export type VerificationMethodValue = "DETERMINISTIC" | "SEMANTIC" | "HUMAN";

export type ExecutionStatus =
  | "ASSIGNED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REVISION_REQUESTED"
  | "COMPLETED"
  | "CANCELLED";

export type SubmissionStatus =
  "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "REVISION_REQUESTED" | "ACCEPTED" | "REJECTED";

export type CaseStatus = "OPEN" | "AWAITING_RESPONSE" | "UNDER_REVIEW" | "RESOLVED" | "CLOSED";
export type CaseSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AgentActionType =
  | "CREATE_PLAN"
  | "REQUEST_CLARIFICATION"
  | "CREATE_CONTRACT"
  | "SELECT_PROVIDER"
  | "START_NEGOTIATION"
  | "SEND_OFFER"
  | "ACCEPT_OFFER"
  | "AUTHORIZE_PAYMENT"
  | "REQUEST_VERIFICATION"
  | "REQUEST_REVISION"
  | "OPEN_CASE"
  | "WAIT"
  | "COMPLETE_TASK";

export interface TaskDto {
  id: string;
  userId: string;
  title: string;
  rawRequest: string;
  status: TaskStatus;
  budgetMinor: number;
  currency: string;
  desiredDeadline: string | null;
  plannerSource: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface RequirementDto {
  id: string;
  key: string;
  statement: string;
  source: RequirementSource;
  acceptanceRelevant: boolean;
  position: number;
}

export interface WorkSpecificationDto {
  id: string;
  taskId: string;
  version: number;
  summary: string;
  planSource: "AI" | "DETERMINISTIC_FALLBACK";
  requirements: RequirementDto[];
  clarifications?: ClarificationDto[];
  createdAt: string;
}

export interface ClarificationDto {
  id: string;
  taskId: string;
  question: string;
  answer: string | null;
  status: "PENDING" | "ANSWERED" | "CANCELLED";
}

export interface ContractRequirementDto {
  id: string;
  contractId: string;
  key: string;
  statement: string;
  acceptanceRelevant: boolean;
}

export interface ScopeItemDto {
  id: string;
  contractId: string;
  type: "INCLUDED" | "EXCLUDED";
  statement: string;
  position: number;
}

export interface AcceptancePlanRuleDto {
  requirementKey: string;
  method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
  params?: Record<string, unknown>;
  instructions?: string;
}

export interface AcceptancePlanDto {
  version: number;
  rules: AcceptancePlanRuleDto[];
  policy: Record<string, unknown>;
}

export interface ContractDto {
  id: string;
  taskId: string;
  version: number;
  status: ContractStatus;
  title: string;
  summary: string;
  contractHash: string;
  budgetMinor: number;
  currency: string;
  deadline: string | null;
  acceptancePlan: AcceptancePlanDto | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  requirements: ContractRequirementDto[];
  scope: ScopeItemDto[];
}

export interface AgentActionDto {
  id: string;
  agentRunId: string;
  actionType: AgentActionType;
  status: string;
  reasonCode: string | null;
  rationale: string | null;
  createdAt: string;
}

export interface ProviderSnapshotDto {
  providerId: string;
  displayName: string;
  firstPassAcceptancePct?: number;
  onTimeRatePct?: number;
  completedTasks?: number;
  priceMinor?: number;
  currency?: string;
}

export interface ProviderSelectionDto {
  id: string;
  taskId: string;
  contractId: string;
  status: "SELECTED" | "FAILED" | "EXPIRED";
  provider: ProviderSnapshotDto | null;
  alternatives: ProviderSnapshotDto[];
  reason: string | null;
  createdAt: string;
}

export interface OfferDto {
  id: string;
  negotiationId: string;
  version: number;
  submittedBy: "BUYER_AGENT" | "PROVIDER";
  status: string;
  price: Money;
  deliveryDeadline: string;
  createdAt: string;
}

export interface NegotiationDto {
  id: string;
  taskId: string;
  contractId: string;
  providerId: string;
  status: string;
  round: number;
  offers: OfferDto[];
}

export interface PaymentPolicyCheckDto {
  id: string;
  checkKey: string;
  label: string;
  result: PolicyCheckResult;
  reason: string | null;
}

export interface PaymentDecisionDto {
  id: string;
  action: PaymentDecisionAction;
  result: PaymentDecisionResult;
  reasonCode: string;
  reason: string;
  policyVersion: string;
  checks: PaymentPolicyCheckDto[];
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  taskId: string;
  agreementId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  authorizedAt: string | null;
  capturedAt: string | null;
  latestDecision: PaymentDecisionDto | null;
}

export interface SubmissionArtifactDto {
  id: string;
  submissionId: string;
  type: "PRIMARY_DELIVERABLE" | "SUPPORTING_FILE" | "EVIDENCE";
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
}

export interface SubmissionDto {
  id: string;
  executionId: string;
  version: number;
  status: SubmissionStatus;
  note: string | null;
  artifacts: SubmissionArtifactDto[];
  createdAt: string;
}

export interface ExecutionDto {
  id: string;
  taskId: string;
  providerId: string;
  contractId: string;
  contractVersion: number;
  status: ExecutionStatus;
  acceptedAt: string | null;
  startedAt: string | null;
  latestSubmission: SubmissionDto | null;
}

export interface VerificationEvidenceDto {
  id: string;
  requirementKey: string;
  type: string;
  label: string;
  value: string | null;
  detail: string | null;
}

export interface VerificationResultDto {
  id: string;
  verificationRunId: string;
  requirementKey: string;
  statement: string;
  method: VerificationMethodValue;
  outcome: VerificationOutcome;
  expected: string | null;
  actual: string | null;
  explanation: string;
  evidence: VerificationEvidenceDto[];
}

export interface VerificationDto {
  id: string;
  taskId: string;
  submissionId: string;
  contractId: string;
  contractVersion: number;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  outcome: VerificationOutcome | null;
  passedRequirements: number;
  failedRequirements: number;
  results: VerificationResultDto[];
  createdAt: string;
}

export interface CaseImpactDto {
  id: string;
  caseId: string;
  kind: string;
  detail: string | null;
}

export interface CaseDto {
  id: string;
  taskId: string;
  type: "EXCEPTION" | "DISPUTE" | "HUMAN_REVIEW";
  category: string;
  status: CaseStatus;
  severity: CaseSeverity;
  title: string;
  summary: string;
  blocksPaymentCapture: boolean;
  impacts: CaseImpactDto[];
  createdAt: string;
  resolvedAt: string | null;
}

export interface ActivityEntryDto {
  id: string;
  type: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  title: string;
  description: string;
  visibility: string;
}

export interface NotificationDto {
  id: string;
  taskId: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface TaskRoomDto {
  task: TaskDto;
  activeContract: ContractDto | null;
  workSpecification: WorkSpecificationDto | null;
  providerSelection: ProviderSelectionDto | null;
  agentRun: { id: string; status: string; actions: AgentActionDto[] } | null;
  execution: ExecutionDto | null;
  cases: CaseDto[];
}

export interface ApprovalResultDto {
  contractId: string;
  status: ContractStatus;
  contractHash: string;
}
