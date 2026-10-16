import { apiFetch, type ApiResponse } from "./client";
import type {
  ActivityEntryDto,
  ApprovalResultDto,
  CaseDto,
  ContractDto,
  NotificationDto,
  PaymentDto,
  ProviderSelectionDto,
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

export { apiFetch };
export type { ContractDto };
