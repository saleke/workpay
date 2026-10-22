import { apiFetch, apiUpload, type ApiResponse } from "./client";
import type {
  ActivityEntryDto,
  ApprovalResultDto,
  CaseDto,
  ContractDto,
  NotificationDto,
  PaymentDto,
  ProviderSelectionDto,
  ProviderWorkDto,
  SubmissionDto,
  TaskDto,
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

export { apiFetch };
export type { ContractDto };
