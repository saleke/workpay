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
  bio?: string | null;
  capabilities?: Array<{ tag: string; proficiency: number }>;
  firstPassAcceptancePct?: number;
  onTimeRatePct?: number;
  completedTasks?: number;
  priceMinor?: number;
  currency?: string;
  eligible?: boolean;
  reason?: string;
  score?: number;
}

export interface ProviderSelectionDto {
  id: string;
  taskId: string;
  contractId: string;
  status: "SELECTED" | "CANDIDATES_AVAILABLE" | "FAILED" | "EXPIRED";
  provider: ProviderSnapshotDto | null;
  alternatives: ProviderSnapshotDto[];
  reason: string | null;
  createdAt: string;
}

export interface ReviewerExpertiseDto {
  domainTag: string;
  scope: string;
  selfAssessedLevel: number;
  yearsExperience: number | null;
  methods: string[];
}

export interface ReviewerEvidenceDto {
  kind: "PORTFOLIO" | "CREDENTIAL" | "EXPERIENCE" | "REFERENCE";
  title: string;
  description: string;
  url: string | null;
  issuer: string | null;
  provenance?: "REVIEWER_SUPPLIED";
}

export interface ReviewerProfileDto {
  id: string;
  isListed: boolean;
  available: boolean;
  displayName: string;
  publicContactUrl: string | null;
  summary: string;
  languages: string[];
  feeMinor: number | null;
  currency: string;
  typicalTurnaroundDays: number | null;
  conflictDisclosureConfirmed: boolean;
  expertise: ReviewerExpertiseDto[];
  evidence: ReviewerEvidenceDto[];
  conflicts: Array<{ username: string | null; displayName: string | null }>;
}

export interface ReviewerProfileInputDto {
  isListed: boolean;
  available: boolean;
  displayName: string;
  publicContactUrl: string | null;
  summary: string;
  languages: string[];
  feeMinor: number | null;
  typicalTurnaroundDays: number | null;
  conflictDisclosureConfirmed: boolean;
  conflictUsernames: string[];
  expertise: ReviewerExpertiseDto[];
  evidence: Array<Omit<ReviewerEvidenceDto, "provenance">>;
}

export interface ReviewerRecommendationDto {
  userId: string;
  username: string | null;
  displayName: string;
  publicContactUrl: string | null;
  summary: string;
  feeMinor: number | null;
  currency: string;
  languages: string[];
  typicalTurnaroundDays: number | null;
  matchedDomains: string[];
  matchingExpertise: ReviewerExpertiseDto[];
  evidence: Array<ReviewerEvidenceDto & { id: string }>;
  rationale: string[];
  profileEvidence: "NONE" | "REVIEWER_SUPPLIED";
}

export interface TaskReviewerRecommendationsDto {
  contractVersion: number | null;
  suggestedDomains: string[];
  requiredDomains: string[];
  recommendations: ReviewerRecommendationDto[];
  reason: string;
}

export interface IndependentReviewFindingDto {
  requirementKey: string;
  outcome: VerificationOutcome;
  rationale: string;
  evidence: Array<{ description: string; url?: string }>;
}

export interface IndependentReviewReportDto {
  id: string;
  engagementId: string;
  taskId: string;
  submissionId: string;
  contractVersion: number;
  contractHash: string;
  reviewerUserId: string;
  outcome: VerificationOutcome;
  rationale: string;
  findings: IndependentReviewFindingDto[];
  createdAt: string;
}

export interface IndependentReviewEngagementDto {
  id: string;
  taskId: string;
  conversationId: string;
  contractId: string;
  contractVersion: number;
  contractHash: string;
  buyerUserId: string;
  providerUserId: string;
  reviewerUserId: string;
  proposerUserId: string;
  requirementKeys: string[];
  domains: string[];
  authority: "CONTRACTUAL_ACCEPTANCE";
  feeMinor: number | null;
  feeCurrency: string;
  feePayer: "BUYER" | "PROVIDER" | "SHARED" | "DIRECT";
  status:
    | "PROPOSED"
    | "AWAITING_REVIEWER"
    | "ENGAGED"
    | "INCONCLUSIVE"
    | "CLOSED"
    | "DECLINED"
    | "CANCELLED";
  buyerAcceptedAt: string | null;
  providerAcceptedAt: string | null;
  reviewerAcceptedAt: string | null;
  reviewerConflictConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  reports: IndependentReviewReportDto[];
  contractContext?: {
    title: string;
    summary: string;
    requirements: Array<{
      key: string;
      statement: string;
      acceptanceRelevant: boolean;
      reviewInstructions: Array<{
        method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
        instructions: string | null;
      }>;
    }>;
    included: string[];
    excluded: string[];
  };
  latestSubmission?: {
    id: string;
    taskId: string;
    contractVersion: number;
    contractHash: string;
    status: "SUBMITTED" | "UNDER_REVIEW";
    submittedAt: string | null;
    notes: string | null;
    submissionHash: string | null;
    artifacts: Array<{
      id: string;
      submissionId: string;
      type: "PRIMARY_DELIVERABLE" | "SUPPORTING_FILE" | "EVIDENCE";
      filename: string;
      contentType: string | null;
      sizeBytes: number;
    }>;
  } | null;
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
  mode: "SIMULATED" | "LIVE";
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  payoutEmail?: string | null;
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
  actorName?: string | null;
  actorRoleTitle?: string | null;
  isSelf?: boolean;
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
  href?: string | null;
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

export interface TaskConversationMessageDto {
  id: string;
  conversationId: string;
  sequence: number;
  clientMessageId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface ConversationContractSnapshotDto {
  id: string;
  version: number;
  hash: string;
  title: string;
  summary: string;
  requirements: Array<{ key: string; statement: string; acceptanceRelevant: boolean }>;
  included: string[];
  excluded: string[];
  acceptanceRules: Array<{
    requirementKey: string;
    method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
    params?: Record<string, unknown>;
    instructions?: string;
  }>;
  budget: Money;
  agreedPrice?: Money | null;
  deadline: string | null;
}

export interface TaskConversationDto {
  id: string;
  taskId: string;
  buyerUserId: string;
  providerId: string;
  providerUserId: string;
  providerDisplayName?: string;
  status: "CONTACT_PENDING" | "OPEN" | "DECLINED" | "CLOSED";
  contactApprovedAt: string;
  contactApprovedContractVersion: number;
  contactApprovedContractHash: string;
  currentContractVersion: number;
  currentContractHash: string;
  currentContractSnapshot: ConversationContractSnapshotDto;
  contractSnapshot: ConversationContractSnapshotDto;
  providerRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TaskConversationMessageDto[];
}

export interface ContractChangeTermsDto {
  title: string;
  summary: string;
  requirements: Array<{ key: string; statement: string; acceptanceRelevant: boolean }>;
  included: string[];
  excluded: string[];
  acceptanceRules: Array<{
    requirementKey: string;
    method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
    params?: Record<string, unknown>;
    instructions?: string;
  }>;
  budget: Money;
  agreedPriceMinor: number | null;
  deadline: string | null;
}

export interface ContractChangeRequestDto {
  id: string;
  taskId: string;
  conversationId: string;
  baseContractId: string;
  baseContractVersion: number;
  baseContractHash: string;
  proposerUserId: string;
  respondentUserId: string;
  reason: string;
  proposedTerms: ContractChangeTermsDto;
  proposedTermsHash: string;
  proposedContractHash: string;
  proposedBudgetMinor: number;
  proposedAgreedPriceMinor: number | null;
  currency: string;
  paymentAdjustmentPlan: {
    action: string;
    targetAmountMinor?: number;
    paymentId?: string;
    deltaAmountMinor?: number;
    refundAmountMinor?: number;
  } | null;
  status:
    | "PROPOSED"
    | "ACCEPTED_PENDING_ACTIVATION"
    | "ACTIVATING"
    | "ACTIVATION_FAILED"
    | "ACTIVATION_RECONCILIATION_REQUIRED"
    | "CANCELLATION_PENDING"
    | "ACTIVATED"
    | "DECLINED"
    | "WITHDRAWN"
    | "CANCELLED";
  responseNote: string | null;
  cancellationRequestedBy: string | null;
  activatedContractId: string | null;
  activatedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalResultDto {
  contractId: string;
  status: ContractStatus;
  contractHash: string;
}

/** A provider's view of an assigned piece of work (B's provider portal). */
export interface ProviderWorkFileDto {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl?: string | null;
}

export interface ProviderWorkRequirementDto {
  key: string;
  statement: string;
  acceptanceRelevant: boolean;
}

export interface ProviderWorkDto {
  executionId: string;
  taskId: string;
  taskTitle: string;
  taskRequest: string;
  status: ExecutionStatus;
  pay: Money;
  deadline: string | null;
  requirements: ProviderWorkRequirementDto[];
  inputFiles: ProviderWorkFileDto[];
  latestSubmission: SubmissionDto | null;
  revisionReason: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
}

export interface TaskInvitationDto {
  taskId: string;
  taskTitle: string;
  taskRequest: string;
  budgetMinor: number;
  currency: string;
  deadline: string | null;
  contractId: string;
  contractVersion: number;
  contractHash: string;
  requirements: Array<{
    id: string;
    key: string;
    statement: string;
    acceptanceRelevant: boolean;
  }>;
  isAssigned: boolean;
  assignedSpecialistName?: string | null;
}

export interface AcceptInvitationInput {
  displayName: string;
  payoutEmail: string;
  bio?: string;
  capabilities?: string[];
}

export interface AuditCheckinDto {
  id: string;
  taskId: string;
  executionId: string;
  status: "ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED";
  notes?: string | null;
  percentComplete?: number | null;
  createdAt: string;
}

export interface TaskAuditStatusDto {
  taskId: string;
  deadline: string | null;
  timeRemainingHours: number | null;
  burnDownPercentage: number;
  phase: "KICKOFF" | "PROGRESS_AUDIT" | "CRITICAL_PATH" | "FINAL_COUNTDOWN";
  riskLevel: "LOW" | "ATTENTION" | "OVERDUE";
  latestCheckin: AuditCheckinDto | null;
  checkins: AuditCheckinDto[];
}
