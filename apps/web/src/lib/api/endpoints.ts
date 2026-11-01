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
  IndependentReviewReportDto,
  NotificationDto,
  PaymentDto,
  ProviderSelectionDto,
  ProviderWorkDto,
  ReviewerProfileDto,
  ReviewerProfileInputDto,
  TaskReviewerRecommendationsDto,
  SubmissionDto,
  TaskAuditStatusDto,
  TaskDto,
  TaskInvitationDto,
  TaskConversationDto,
  TaskRoomDto,
  VerificationDto,
  VerificationOutcome,
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
): Promise<
  ApiResponse<{ paymentId: string; executionId: string; alreadyPrepared: boolean }>
> {
  return apiFetch(`${BASE}/tasks/${taskId}/payment/simulate-authorization`, {
    method: "POST",
    idempotencyKey,
  });
}

/** B's endpoints (ENGINEERING_PLAN Appendix C). */
export function getTaskRoom(taskId: string): Promise<ApiResponse<TaskRoomDto>> {
  return apiFetch<TaskRoomDto>(`${BASE}/tasks/${taskId}/task-room`);
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

export function listProviderConversations(): Promise<ApiResponse<TaskConversationDto[]>> {
  return apiFetch<TaskConversationDto[]>(`${BASE}/provider/conversations`);
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

export function sendTaskConversationMessage(
  conversationId: string,
  input: { clientMessageId: string; body: string },
): Promise<ApiResponse<TaskConversationDto["messages"][number]>> {
  return apiFetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    body: input,
  });
}

export function getTaskConversationMessages(
  conversationId: string,
  afterSequence?: number,
): Promise<ApiResponse<TaskConversationDto>> {
  const search = afterSequence === undefined ? "" : `?after=${afterSequence}`;
  return apiFetch<TaskConversationDto>(`${BASE}/conversations/${conversationId}/messages${search}`);
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

export function getReviewerProfile(): Promise<ApiResponse<{ profile: ReviewerProfileDto | null }>> {
  return apiFetch(`${BASE}/provider/reviewer-profile`);
}

export function saveReviewerProfile(input: ReviewerProfileInputDto) {
  return apiFetch<{ profile: ReviewerProfileDto }>(`${BASE}/provider/reviewer-profile`, {
    method: "PUT",
    body: input,
  });
}

export function getTaskReviewerRecommendations(
  taskId: string,
  additionalDomains: string[],
): Promise<ApiResponse<TaskReviewerRecommendationsDto>> {
  const query = additionalDomains.length > 0
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
    feeMinor: number | null;
    feeCurrency: "USD";
    feePayer: "BUYER" | "PROVIDER" | "SHARED" | "DIRECT";
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

export function submitIndependentReviewReport(
  conversationId: string,
  engagementId: string,
  report: {
    submissionId: string;
    contractVersion: number;
    contractHash: string;
    rationale: string;
    findings: IndependentReviewReportDto["findings"];
  },
): Promise<ApiResponse<{ report: IndependentReviewReportDto; outcome: VerificationOutcome }>> {
  return apiFetch(
    `${BASE}/conversations/${conversationId}/independent-reviews/${engagementId}/reports`,
    { method: "POST", body: report },
  );
}

export function listReviewerEngagements(): Promise<ApiResponse<IndependentReviewEngagementDto[]>> {
  return apiFetch(`${BASE}/reviewer/engagements`);
}

export function getSubmissionVerification(
  submissionId: string,
): Promise<ApiResponse<VerificationDto>> {
  return apiFetch<VerificationDto>(`${BASE}/submissions/${submissionId}/verification`);
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
    body: JSON.stringify(body),
  });
}

/** Provider portal (B). */
export function listProviderWork(): Promise<ApiResponse<ProviderWorkDto[]>> {
  return apiFetch<ProviderWorkDto[]>(`${BASE}/provider/work`);
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

export function submitDeliverable(
  executionId: string,
  file: File,
  note: string,
  idempotencyKey: string,
): Promise<ApiResponse<SubmissionDto>> {
  const form = new FormData();
  form.set("executionId", executionId);
  form.set("note", note);
  form.set("file", file);
  return apiUpload<SubmissionDto>(`${BASE}/submissions`, form, idempotencyKey);
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
}

export function getProviderProfile(): Promise<ApiResponse<ProviderProfileResponse>> {
  return apiFetch<ProviderProfileResponse>(`${BASE}/provider/profile`);
}

export function updateProviderProfile(body: {
  displayName: string;
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
