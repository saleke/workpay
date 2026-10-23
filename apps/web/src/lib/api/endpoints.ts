import { apiFetch, apiUpload, type ApiResponse } from "./client";
import type {
  AcceptInvitationInput,
  ActivityEntryDto,
  ApprovalResultDto,
  AuditCheckinDto,
  CaseDto,
  ContractDto,
  NotificationDto,
  PaymentDto,
  ProviderSelectionDto,
  ProviderWorkDto,
  SubmissionDto,
  TaskAuditStatusDto,
  TaskDto,
  TaskInvitationDto,
  TaskRoomDto,
  VerificationDto,
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

/** B's endpoints (ENGINEERING_PLAN Appendix C). */
export function getTaskRoom(taskId: string): Promise<ApiResponse<TaskRoomDto>> {
  return apiFetch<TaskRoomDto>(`${BASE}/tasks/${taskId}/task-room`);
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

export function getSubmissionVerification(
  submissionId: string,
): Promise<ApiResponse<VerificationDto>> {
  return apiFetch<VerificationDto>(`${BASE}/submissions/${submissionId}/verification`);
}

export function listCases(): Promise<ApiResponse<CaseDto[]>> {
  return apiFetch<CaseDto[]>(`${BASE}/cases`);
}

export function resolveCase(
  caseId: string,
  body: { outcome: string; note?: string },
  idempotencyKey: string,
): Promise<ApiResponse<CaseDto>> {
  return apiFetch<CaseDto>(`${BASE}/cases/${caseId}/resolve`, {
    method: "POST",
    body,
    idempotencyKey,
  });
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

export function updateProviderProfile(
  body: {
    displayName: string;
    bio?: string | null;
    hourlyRateMinor?: number | null;
    currency?: string;
    payoutEmail: string;
    status: "ACTIVE" | "INACTIVE";
    capabilities: Array<{ tag: string; proficiency: number }>;
    availability?: { available: boolean; capacity: number };
    workPreferences?: Partial<WorkPreferencesDto>;
  },
): Promise<ApiResponse<ProviderProfileResponse>> {
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
  input: { status: "ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED"; notes?: string; percentComplete?: number },
): Promise<ApiResponse<AuditCheckinDto>> {
  return apiFetch<AuditCheckinDto>(`${BASE}/tasks/${taskId}/audit-checkin`, {
    method: "POST",
    body: input,
  });
}

export { apiFetch };
export type { ContractDto };

