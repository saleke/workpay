import type {
  CaseStatus,
  ContractStatus,
  ExecutionStatus,
  PaymentStatus,
  TaskStatus,
  VerificationOutcome,
} from "./api/types";

export type Tone = "neutral" | "progress" | "attention" | "success" | "danger";

const TASK_TONES: Record<TaskStatus, Tone> = {
  DRAFT: "neutral",
  CREATED: "progress",
  PLANNING: "progress",
  AWAITING_CLARIFICATION: "attention",
  CONTRACT_REVIEW: "attention",
  APPROVED: "progress",
  PROVIDER_SEARCH: "progress",
  NEGOTIATION: "progress",
  AGREEMENT_READY: "progress",
  PAYMENT_AUTHORIZATION: "progress",
  WORK_IN_PROGRESS: "progress",
  SUBMITTED: "progress",
  VERIFYING: "progress",
  REVISION_REQUIRED: "attention",
  HUMAN_REVIEW: "attention",
  PAYMENT_RELEASE: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  DISPUTED: "danger",
};

/**
 * Human-facing task status text (build_prompt section 46). Internal status stays
 * precise; the label is what a person reads.
 */
const TASK_LABELS: Record<TaskStatus, string> = {
  DRAFT: "Draft",
  CREATED: "Getting started",
  PLANNING: "Understanding your request",
  AWAITING_CLARIFICATION: "Needs your input",
  CONTRACT_REVIEW: "Ready for your review",
  APPROVED: "Approved",
  PROVIDER_SEARCH: "Finding someone",
  NEGOTIATION: "Agreeing on price",
  AGREEMENT_READY: "Agreement reached",
  PAYMENT_AUTHORIZATION: "Authorizing payment",
  WORK_IN_PROGRESS: "Work in progress",
  SUBMITTED: "Work submitted",
  VERIFYING: "Checking the result",
  REVISION_REQUIRED: "Needs your attention",
  HUMAN_REVIEW: "Needs human review",
  PAYMENT_RELEASE: "Releasing payment",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  DISPUTED: "In dispute",
};

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_LABELS[status] ?? status;
}

export function taskStatusTone(status: TaskStatus): Tone {
  return TASK_TONES[status] ?? "neutral";
}

const CONTRACT_LABELS: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting your approval",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  DISPUTED: "In dispute",
};

export function contractStatusLabel(status: ContractStatus): string {
  return CONTRACT_LABELS[status] ?? status;
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Preparing",
  AUTHORIZATION_REQUESTED: "Authorizing",
  AUTHORIZED: "Authorized — not yet released",
  CAPTURE_REQUESTED: "Releasing payment",
  CAPTURED: "Paid",
  VOIDED: "Voided",
  REFUNDED: "Refunded",
  FAILED: "Payment failed",
  UNKNOWN: "Checking with PayPal",
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_LABELS[status] ?? status;
}

export function paymentStatusTone(status: PaymentStatus): Tone {
  switch (status) {
    case "CAPTURED":
      return "success";
    case "AUTHORIZED":
      return "progress";
    case "FAILED":
      return "danger";
    case "UNKNOWN":
    case "CAPTURE_REQUESTED":
      return "attention";
    default:
      return "neutral";
  }
}

const VERIFICATION_LABELS: Record<VerificationOutcome, string> = {
  PASS: "Passed",
  FAIL: "Failed",
  UNCERTAIN: "Needs human review",
};

export function verificationOutcomeLabel(outcome: VerificationOutcome): string {
  return VERIFICATION_LABELS[outcome] ?? outcome;
}

export function verificationOutcomeTone(outcome: VerificationOutcome): Tone {
  switch (outcome) {
    case "PASS":
      return "success";
    case "FAIL":
      return "danger";
    case "UNCERTAIN":
      return "attention";
    default:
      return "neutral";
  }
}

const EXECUTION_LABELS: Record<ExecutionStatus, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Work accepted",
  IN_PROGRESS: "Work in progress",
  SUBMITTED: "Submitted",
  REVISION_REQUESTED: "Revision requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function executionStatusLabel(status: ExecutionStatus): string {
  return EXECUTION_LABELS[status] ?? status;
}

const CASE_LABELS: Record<CaseStatus, string> = {
  OPEN: "Open",
  AWAITING_RESPONSE: "Awaiting response",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function caseStatusLabel(status: CaseStatus): string {
  return CASE_LABELS[status] ?? status;
}

/** Lowercase requirement provenance, rendered as a small tag in the UI. */
export function requirementSourceLabel(source: string): string {
  switch (source) {
    case "USER_EXPLICIT":
      return "from your request";
    case "USER_CLARIFIED":
      return "from your answer";
    case "DETERMINISTICALLY_DERIVED":
      return "derived";
    case "AI_PROPOSED":
      return "AI proposed";
    default:
      return source.toLowerCase();
  }
}
