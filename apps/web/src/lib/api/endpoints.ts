import { apiFetch, apiUpload, type ApiResponse } from "./client";
import type { ContractChangePatch } from "@workpay/shared/domain";
import type {
  AcceptInvitationInput,
  ActivityEntryDto,
  ApprovalResultDto,
  AuditCheckinDto,
  ContractDto,
  ContractChangeRequestDto,
  IndependentReviewEngagementDto,
  MessageInboxDto,
  NotificationDto,
  PaymentDto,
  PayPalAccountStatusDto,
  ProviderInboxSummaryDto,
  ProviderSelectionDto,
  ProviderWorkDto,
  ReviewPackageDecision,
  ReviewPackageDto,
  TaskReviewerRecommendationsDto,
  SubmissionDto,
  TaskAuditStatusDto,
  TaskDto,
  TaskInvitationDto,
  TaskConversationDto,
  TaskRoomDto,
  WorkCommitmentDto,
  WorkReviewAssessmentStatus,
  WorkReviewDto,
  WorkSpecificationDto,
} from "./types";

const BASE = "/api/v1";

/** A's endpoints (ENGINEERING_PLAN Appendix C). */
export function listTasks(): Promise<ApiResponse<TaskDto[]>> {
  return apiFetch<TaskDto[]>(`${BASE}/tasks`);
}

export interface CreateTaskInput {
  title: string;
  rawRequest: string;
  budgetMinor: number;
  currency: string;
  desiredDeadline?: string | null;
}

export function createTask(
  input: CreateTaskInput,
  idempotencyKey: string,
): Promise<ApiResponse<TaskDto>> {
  return apiFetch<TaskDto>(`${BASE}/tasks`, {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function createTaskFromApprovedIntake(
  intakeSessionId: string,
): Promise<ApiResponse<{ taskId: string; contractId: string | null; created: boolean }>> {
  return apiFetch(`${BASE}/intake/sessions/${intakeSessionId}/task`, {
    method: "POST",
  });
}

export function approveContract(
  contractId: string,
  expectedHash: string,
  idempotencyKey: string,
): Promise<ApiResponse<ApprovalResultDto>> {
  return apiFetch<ApprovalResultDto>(`${BASE}/contracts/${contractId}/approve`, {
    method: "POST",
    body: { expectedHash },
    idempotencyKey,
  });
}

export interface ModifyCriteriaInput {
  action: "ADD" | "EDIT" | "DELETE";
  statement?: string;
  key?: string;
  acceptanceRelevant?: boolean;
}

export function modifyContractCriteria(
  contractId: string,
  input: ModifyCriteriaInput,
): Promise<ApiResponse<ContractDto>> {
  return apiFetch<ContractDto>(`${BASE}/contracts/${contractId}/criteria`, {
    method: "POST",
    body: input,
  });
}

export function listPayments(): Promise<ApiResponse<PaymentDto[]>> {
  return apiFetch<PaymentDto[]>(`${BASE}/payments`);
}

export function listActivity(): Promise<ApiResponse<ActivityEntryDto[]>> {
  return apiFetch<ActivityEntryDto[]>(`${BASE}/activity`);
}

export function getTaskActivity(taskId: string): Promise<ApiResponse<ActivityEntryDto[]>> {
  return apiFetch<ActivityEntryDto[]>(`${BASE}/tasks/${taskId}/activity`);
}

export function getTaskPayment(taskId: string): Promise<ApiResponse<PaymentDto | null>> {
  return apiFetch<PaymentDto | null>(`${BASE}/tasks/${taskId}/payment`);
}

export function simulatePaymentAuthorization(
  taskId: string,
  idempotencyKey: string,
): Promise<ApiResponse<{ paymentId: string; executionId: string; alreadyPrepared: boolean }>> {
  return apiFetch(`${BASE}/tasks/${taskId}/payment/simulate-authorization`, {
    method: "POST",
    idempotencyKey,
  });
}

export function releaseTaskPayment(
  taskId: string,
  approval: {
    expectedPaymentId: string;
    expectedAmountMinor: number;
    expectedCurrency: "USD";
    confirm: true;
  },
  idempotencyKey: string,
): Promise<ApiResponse<{ paymentId: string; status: string; captured: boolean }>> {
  return apiFetch(`${BASE}/tasks/${taskId}/payment/release`, {
    method: "POST",
    body: approval,
    idempotencyKey,
  });
}

export function getPayPalAccountStatus(): Promise<ApiResponse<PayPalAccountStatusDto>> {
  return apiFetch(`${BASE}/user/paypal/status`);
}

export function startPayPalSellerOnboarding(): Promise<
  ApiResponse<{ status: string; actionUrl?: string }>
> {
  return apiFetch(`${BASE}/provider/paypal/onboarding`, { method: "POST" });
}

export function refreshPayPalSellerStatus(): Promise<ApiResponse<unknown>> {
  return apiFetch(`${BASE}/provider/paypal/status`, { method: "POST" });
}

export function createPayPalPaymentOrder(
  taskId: string,
  idempotencyKey: string,
): Promise<
  ApiResponse<{
    paymentId: string;
    orderId: string | null;
    approvalUrl: string;
    mode: "PAYPAL_SANDBOX" | "PAYPAL_LIVE";
    reused: boolean;
  }>
> {
  return apiFetch(`${BASE}/tasks/${taskId}/payment/order`, {
    method: "POST",
    idempotencyKey,
  });
}

export function reconcilePayment(
  paymentId: string,
  idempotencyKey: string,
): Promise<ApiResponse<{ status: string }>> {
  return apiFetch(`${BASE}/payments/${paymentId}/reconcile`, {
    method: "POST",
    idempotencyKey,
  });
}

/** B's endpoints (ENGINEERING_PLAN Appendix C). */
export function getTaskRoom(taskId: string): Promise<ApiResponse<TaskRoomDto>> {
  return apiFetch<TaskRoomDto>(`${BASE}/tasks/${taskId}/task-room`);
}

export function listWorkReviews(taskId: string): Promise<ApiResponse<WorkReviewDto[]>> {
  return apiFetch(`${BASE}/tasks/${taskId}/reviews`);
}

export function openWorkReview(
  taskId: string,
  input: {
    kind: "CHECKPOINT" | "FINAL";
    title: string;
    openingNote: string;
    requirementKeys: string[];
    responseWindowDays: number;
  },
  idempotencyKey: string,
): Promise<ApiResponse<WorkReviewDto>> {
  return apiFetch(`${BASE}/tasks/${taskId}/reviews`, {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function getWorkReview(reviewId: string): Promise<ApiResponse<WorkReviewDto>> {
  return apiFetch(`${BASE}/reviews/${reviewId}`);
}

export function addWorkReviewContext(
  reviewId: string,
  input:
    | { type: "NOTE"; note: string; label?: string }
    | { type: "LINK"; label: string; url: string; note?: string }
    | { type: "FILE"; file: File; label?: string; note?: string },
): Promise<ApiResponse<WorkReviewDto>> {
  const form = new FormData();
  form.set("type", input.type);
  if ("label" in input && input.label) form.set("label", input.label);
  if ("note" in input && input.note) form.set("note", input.note);
  if (input.type === "LINK") form.set("url", input.url);
  if (input.type === "FILE") form.set("file", input.file);
  return apiUpload(`${BASE}/reviews/${reviewId}/items`, form, crypto.randomUUID());
}

export function assessWorkReviewRequirement(
  reviewId: string,
  requirementKey: string,
  input: { status: WorkReviewAssessmentStatus; rationale?: string },
): Promise<ApiResponse<WorkReviewDto>> {
  return apiFetch(`${BASE}/reviews/${reviewId}/assessments/${encodeURIComponent(requirementKey)}`, {
    method: "PUT",
    body: input,
  });
}

export function decideWorkReview(
  reviewId: string,
  input: {
    decision:
      | "ACCEPT_CHECKPOINT"
      | "ACCEPT_FINAL"
      | "REQUEST_CHANGES"
      | "CANCEL_REVIEW"
      | "REFER_TO_REVIEWER"
      | "EXPRESS_DISSATISFACTION";
    reason: string;
    riskAcknowledged: boolean;
    dissatisfactionRemedy?: "REVISION" | "PAID_REVIEW" | "CANCEL" | "OTHER";
  },
  idempotencyKey: string,
): Promise<ApiResponse<WorkReviewDto>> {
  return apiFetch(`${BASE}/reviews/${reviewId}/decision`, {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function respondToReviewResolution(
  reviewId: string,
  input: {
    response: "ACCEPT_REVISION" | "DISAGREE" | "REQUEST_PAID_REVIEW";
    note: string;
  },
  idempotencyKey: string,
): Promise<ApiResponse<WorkReviewDto>> {
  return apiFetch(`${BASE}/reviews/${reviewId}/provider-response`, {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function respondToWorkReviewRequest(
  reviewId: string,
  input: {
    action: "PREPARE" | "REQUEST_CLARIFICATION" | "SEND_PACKAGE";
    summary?: string;
  },
  idempotencyKey: string,
): Promise<ApiResponse<WorkReviewDto>> {
  return apiFetch(`${BASE}/reviews/${reviewId}/response`, {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function completePaidWorkReview(
  reviewId: string,
  summary: string,
  idempotencyKey: string,
): Promise<ApiResponse<{ reviewId: string; completed: boolean }>> {
  return apiFetch(`${BASE}/reviews/${reviewId}/reviewer-complete`, {
    method: "POST",
    body: { summary },
    idempotencyKey,
  });
}

export function getTaskConversations(taskId: string): Promise<ApiResponse<TaskConversationDto[]>> {
  return apiFetch<TaskConversationDto[]>(`${BASE}/tasks/${taskId}/conversations`);
}

export function startTaskConversation(
  taskId: string,
  input: {
    providerId: string;
    expectedContractVersion: number;
    expectedContractHash: string;
    initialMessage: string;
    clientMessageId: string;
  },
): Promise<ApiResponse<{ conversationId: string; status: "CONTACT_PENDING" }>> {
  return apiFetch(`${BASE}/tasks/${taskId}/conversations`, { method: "POST", body: input });
}

export type FirstContactTone = "warm" | "direct" | "professional";

export function draftFirstContactMessage(
  taskId: string,
  input: {
    providerId: string;
    expectedContractVersion: number;
    expectedContractHash: string;
    tone: FirstContactTone;
    buyerNote: string;
    existingDraft: string;
  },
): Promise<ApiResponse<{ message: string }>> {
  return apiFetch(`${BASE}/tasks/${taskId}/conversations/draft`, {
    method: "POST",
    body: input,
  });
}

export function listProviderConversations(): Promise<ApiResponse<TaskConversationDto[]>> {
  return apiFetch<TaskConversationDto[]>(`${BASE}/provider/conversations`);
}

export function getMessageInbox(): Promise<ApiResponse<MessageInboxDto>> {
  return apiFetch<MessageInboxDto>(`${BASE}/messages/inbox`);
}

export function markTaskConversationRead(
  conversationId: string,
  lastReadSequence: number,
): Promise<ApiResponse<{ conversationId: string; lastReadSequence: number }>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/read`, {
    method: "POST",
    body: { lastReadSequence },
  });
}

export function getProviderInboxSummary(): Promise<ApiResponse<ProviderInboxSummaryDto>> {
  return apiFetch<ProviderInboxSummaryDto>(`${BASE}/provider/inbox-summary`);
}

export function respondToTaskConversation(
  conversationId: string,
  response: "accept" | "decline",
): Promise<ApiResponse<{ id: string; status: TaskConversationDto["status"] }>> {
  return apiFetch(`${BASE}/provider/conversations/${conversationId}/respond`, {
    method: "POST",
    body: { response },
  });
}

export function withdrawTaskConversation(
  conversationId: string,
  note?: string,
): Promise<ApiResponse<{ id: string; status: "WITHDRAWN" }>> {
  return apiFetch(`${BASE}/provider/conversations/${conversationId}/withdraw`, {
    method: "POST",
    body: note ? { note } : {},
  });
}

export function sendTaskConversationMessage(
  conversationId: string,
  input: { clientMessageId: string; body: string; attachments?: File[] },
): Promise<ApiResponse<TaskConversationDto["messages"][number]>> {
  if (input.attachments?.length) {
    const formData = new FormData();
    formData.set("clientMessageId", input.clientMessageId);
    formData.set("body", input.body);
    for (const attachment of input.attachments) {
      formData.append("attachments", attachment, attachment.name);
    }
    return apiUpload<TaskConversationDto["messages"][number]>(
      `${BASE}/conversations/${conversationId}/messages`,
      formData,
      input.clientMessageId,
    );
  }
  return apiFetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { clientMessageId: input.clientMessageId, body: input.body },
  });
}

export function getTaskConversationMessages(
  conversationId: string,
  afterSequence?: number,
  beforeSequence?: number,
): Promise<ApiResponse<TaskConversationDto>> {
  const searchParams = new URLSearchParams();
  if (afterSequence !== undefined) searchParams.set("after", String(afterSequence));
  if (beforeSequence !== undefined) searchParams.set("before", String(beforeSequence));
  const query = searchParams.toString();
  const search = query ? `?${query}` : "";
  return apiFetch<TaskConversationDto>(`${BASE}/conversations/${conversationId}/messages${search}`);
}

export function getWorkCommitment(
  conversationId: string,
): Promise<ApiResponse<WorkCommitmentDto | null>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/work-commitment`);
}

export function proposeWorkCommitment(
  conversationId: string,
  input: { amountMinor: number; currency: "USD"; deliveryDeadline: string | null },
  idempotencyKey: string,
): Promise<ApiResponse<WorkCommitmentDto>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/work-commitment`, {
    method: "POST",
    body: input,
    idempotencyKey,
  });
}

export function decideWorkCommitment(
  conversationId: string,
  commitmentId: string,
  action: "PROVIDER_ACCEPT" | "PROVIDER_DECLINE" | "BUYER_CONFIRM" | "BUYER_WITHDRAW",
  idempotencyKey: string,
  note?: string,
): Promise<ApiResponse<WorkCommitmentDto>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/work-commitment/${commitmentId}`, {
    method: "PATCH",
    body: { action, ...(note?.trim() ? { note: note.trim() } : {}) },
    idempotencyKey,
  });
}

export function listContractChangeRequests(
  conversationId: string,
): Promise<ApiResponse<ContractChangeRequestDto[]>> {
  return apiFetch<ContractChangeRequestDto[]>(`${BASE}/conversations/${conversationId}/changes`);
}

export function proposeContractChange(
  conversationId: string,
  input: {
    expectedContractVersion: number;
    expectedContractHash: string;
    reason: string;
    patch: ContractChangePatch;
  },
): Promise<ApiResponse<ContractChangeRequestDto>> {
  return apiFetch<ContractChangeRequestDto>(`${BASE}/conversations/${conversationId}/changes`, {
    method: "POST",
    body: input,
  });
}

export function decideContractChange(
  conversationId: string,
  changeRequestId: string,
  decision: "accept" | "decline" | "withdraw" | "request-cancellation" | "confirm-cancellation",
  note?: string,
): Promise<ApiResponse<ContractChangeRequestDto>> {
  return apiFetch<ContractChangeRequestDto>(
    `${BASE}/conversations/${conversationId}/changes/${changeRequestId}/decision`,
    {
      method: "PATCH",
      body: { decision, ...(note ? { note } : {}) },
    },
  );
}

export function activateContractChange(
  conversationId: string,
  changeRequestId: string,
): Promise<
  ApiResponse<{
    changeRequest: ContractChangeRequestDto;
    contractId: string;
    contractVersion: number;
    contractHash: string;
    paymentAdjustment: ContractChangeRequestDto["paymentAdjustmentPlan"];
    status: "ACTIVATED";
  }>
> {
  return apiFetch(`${BASE}/conversations/${conversationId}/changes/${changeRequestId}/activate`, {
    method: "POST",
    body: {},
  });
}

export function requestPlanning(taskId: string): Promise<ApiResponse<WorkSpecificationDto>> {
  return apiFetch<WorkSpecificationDto>(`${BASE}/tasks/${taskId}/plan`, { method: "POST" });
}

export function getProviderSelection(
  taskId: string,
): Promise<ApiResponse<ProviderSelectionDto | null>> {
  return apiFetch<ProviderSelectionDto | null>(`${BASE}/tasks/${taskId}/provider-selection`);
}

export function startProviderSearch(taskId: string): Promise<ApiResponse<ProviderSelectionDto>> {
  return apiFetch<ProviderSelectionDto>(`${BASE}/tasks/${taskId}/provider-search`, {
    method: "POST",
  });
}

export function getTaskReviewerRecommendations(
  taskId: string,
  additionalDomains: string[],
): Promise<ApiResponse<TaskReviewerRecommendationsDto>> {
  const query =
    additionalDomains.length > 0
      ? `?domains=${encodeURIComponent(additionalDomains.join(","))}`
      : "";
  return apiFetch(`${BASE}/tasks/${taskId}/reviewers${query}`);
}

export function listIndependentReviewEngagements(
  conversationId: string,
): Promise<ApiResponse<IndependentReviewEngagementDto[]>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/independent-reviews`);
}

export function proposeIndependentReview(
  conversationId: string,
  proposal: {
    reviewerUserId: string;
    expectedContractVersion: number;
    expectedContractHash: string;
    requirementKeys: string[];
    domains: string[];
    brief: string;
    feeMinor: number | null;
    feeCurrency: "USD";
    feePayer: "BUYER" | "PROVIDER" | "SHARED" | "DIRECT";
    feeMode: "PAYPAL" | "DIRECT";
  },
): Promise<ApiResponse<IndependentReviewEngagementDto>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/independent-reviews`, {
    method: "POST",
    body: proposal,
  });
}

export function decideIndependentReview(
  conversationId: string,
  engagementId: string,
  body: { decision: "accept" | "decline"; confirmNoConflict?: boolean },
): Promise<ApiResponse<IndependentReviewEngagementDto>> {
  return apiFetch(
    `${BASE}/conversations/${conversationId}/independent-reviews/${engagementId}/decision`,
    { method: "PATCH", body },
  );
}

export function getReviewFeeStatus(engagementId: string) {
  return apiFetch<{
    engagement: IndependentReviewEngagementDto;
    payments: Array<{
      id: string;
      payerUserId: string;
      amountMinor: number;
      currency: string;
      mode: "FAKE" | "PAYPAL_SANDBOX" | "PAYPAL_LIVE";
      status: string;
      approvalUrl: string | null;
    }>;
  }>(`${BASE}/review-engagements/${engagementId}/fee`);
}

export function createReviewFeeOrder(engagementId: string, idempotencyKey: string) {
  return apiFetch<{ paid: boolean; approvalUrl: string | null; simulated: boolean }>(
    `${BASE}/review-engagements/${engagementId}/fee`,
    { method: "POST", idempotencyKey },
  );
}

export function reconcileReviewFee(paymentId: string, idempotencyKey: string) {
  return apiFetch<{ paid: boolean }>(`${BASE}/review-fees/${paymentId}/reconcile`, {
    method: "POST",
    idempotencyKey,
  });
}

export function listReviewerEngagements(): Promise<ApiResponse<IndependentReviewEngagementDto[]>> {
  return apiFetch(`${BASE}/reviewer/engagements`);
}

export function listNotifications(): Promise<ApiResponse<NotificationDto[]>> {
  return apiFetch<NotificationDto[]>(`${BASE}/notifications`);
}

export function markNotificationRead(body: {
  id?: string;
  markAllRead?: boolean;
}): Promise<ApiResponse<{ ok: boolean }>> {
  return apiFetch<{ ok: boolean }>(`${BASE}/notifications`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

/** Provider portal (B). */
export function listProviderWork(): Promise<ApiResponse<ProviderWorkDto[]>> {
  return apiFetch<ProviderWorkDto[]>(`${BASE}/provider/work`);
}

export function listProviderWorkProposals(): Promise<ApiResponse<WorkCommitmentDto[]>> {
  return apiFetch<WorkCommitmentDto[]>(`${BASE}/provider/work-proposals`);
}

export function getProviderWork(executionId: string): Promise<ApiResponse<ProviderWorkDto>> {
  return apiFetch<ProviderWorkDto>(`${BASE}/provider/work/${executionId}`);
}

export function acceptProviderWork(
  executionId: string,
  idempotencyKey: string,
): Promise<ApiResponse<ProviderWorkDto>> {
  return apiFetch<ProviderWorkDto>(`${BASE}/provider/work/${executionId}/accept`, {
    method: "POST",
    idempotencyKey,
  });
}

export function startProviderWork(
  executionId: string,
  idempotencyKey: string,
): Promise<ApiResponse<ProviderWorkDto>> {
  return apiFetch<ProviderWorkDto>(`${BASE}/provider/work/${executionId}/start`, {
    method: "POST",
    idempotencyKey,
  });
}

export interface WorkPreferencesDto {
  workAcceptanceStatus: "ACCEPTING" | "LIMITED" | "UNAVAILABLE";
  timezone: string;
  availabilitySchedule?: string | null;
  minNoticeHours?: number;
  plannedUnavailability?: string | null;
  pricingModel: "FIXED" | "HOURLY" | "BOTH";
  targetRateMinor?: number | null;
  minCompensationMinor?: number | null;
  minAssignmentSizeMinor?: number | null;
  willingToNegotiate: boolean;
  acceptedCategories: string[];
  declinedCategories: string[];
  requireExplicitApproval: boolean;
  aiRecommendationAllowed: boolean;
  communicationPreference: "ASYNC" | "REALTIME" | "DIRECT";
  deliveryFormat?: string | null;
  updateFrequency: "CHECKPOINTS_ONLY" | "DAILY" | "ON_MILESTONES";
  notifyOnVerificationFail: boolean;
  notifyOnRevisionRequest: boolean;
  reviewSpecBeforeAccept: boolean;
  toolsAndTechnologies: string[];
  languages: string[];
  reviewService?: {
    enabled: boolean;
    listed: boolean;
    availability: "AVAILABLE" | "BUSY" | "OFFLINE";
    notice?: string | null;
    summary: string;
    publicContactUrl: string | null;
    feeMinor: number | null;
    typicalTurnaroundDays: number | null;
    conflictDisclosureConfirmed: boolean;
    conflictNotes?: string | null;
    conflictUsernames: string[];
    domains: Array<{
      domainTag: string;
      scope: string;
      selfAssessedLevel: number;
      yearsExperience: number | null;
      methods: string[];
    }>;
    evidence: Array<{
      kind: "PORTFOLIO" | "CREDENTIAL" | "EXPERIENCE" | "REFERENCE";
      title: string;
      description: string;
      url: string | null;
      issuer: string | null;
    }>;
    feeMode: "PAYPAL" | "DIRECT";
  };
}

export interface ProviderAvailabilityDto {
  available: boolean;
  capacity: number;
  activeAssignments: number;
}

export interface ProviderProfileDto {
  id: string;
  userId: string | null;
  displayName: string;
  image: string | null;
  bio: string | null;
  hourlyRateMinor: number | null;
  currency: string;
  payoutEmail: string | null;
  status: "ACTIVE" | "INACTIVE";
  capabilities: Array<{ tag: string; proficiency: number }>;
  availability?: ProviderAvailabilityDto;
  workPreferences?: WorkPreferencesDto;
}

export interface ProviderProfileResponse {
  isListed: boolean;
  provider: ProviderProfileDto | null;
  profile?: { displayName: string; image: string | null };
}

export function getProviderProfile(): Promise<ApiResponse<ProviderProfileResponse>> {
  return apiFetch<ProviderProfileResponse>(`${BASE}/provider/profile`);
}

export function updateProviderProfile(body: {
  displayName: string;
  image?: string | null;
  bio?: string | null;
  hourlyRateMinor?: number | null;
  currency?: string;
  payoutEmail?: string | null;
  status: "ACTIVE" | "INACTIVE";
  capabilities: Array<{ tag: string; proficiency: number }>;
  availability?: { available: boolean; capacity: number };
  workPreferences?: Partial<WorkPreferencesDto>;
}): Promise<ApiResponse<ProviderProfileResponse>> {
  return apiFetch<ProviderProfileResponse>(`${BASE}/provider/profile`, {
    method: "PUT",
    body,
  });
}

export function listProviders(): Promise<ApiResponse<ProviderProfileDto[]>> {
  return apiFetch<ProviderProfileDto[]>(`${BASE}/providers`);
}

export function getTaskInvitation(taskId: string): Promise<ApiResponse<TaskInvitationDto>> {
  return apiFetch<TaskInvitationDto>(`${BASE}/tasks/${taskId}/invite`);
}

export function acceptTaskInvitation(
  taskId: string,
  input: AcceptInvitationInput,
): Promise<ApiResponse<{ executionId: string; redirectUrl: string }>> {
  return apiFetch<{ executionId: string; redirectUrl: string }>(`${BASE}/tasks/${taskId}/invite`, {
    method: "POST",
    body: input,
  });
}

export function getTaskAuditStatus(taskId: string): Promise<ApiResponse<TaskAuditStatusDto>> {
  return apiFetch<TaskAuditStatusDto>(`${BASE}/tasks/${taskId}/audit-checkin`);
}

export function submitAuditCheckin(
  taskId: string,
  input: {
    status: "ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED";
    notes?: string;
    percentComplete?: number;
  },
): Promise<ApiResponse<AuditCheckinDto>> {
  return apiFetch<AuditCheckinDto>(`${BASE}/tasks/${taskId}/audit-checkin`, {
    method: "POST",
    body: input,
  });
}

export { apiFetch };
export type { ContractDto };
