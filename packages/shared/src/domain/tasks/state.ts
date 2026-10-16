/**
 * Task status machine (Component 1).
 *
 * Tasks move through a fixed set of states. Allowing arbitrary status updates
 * from anywhere would make the task's state meaningless, so transitions are
 * declared here and every status change goes through `canTransition`.
 *
 * This is a pure function, so it can be reasoned about and tested without a
 * database, and the same machine is used by the services and the UI.
 */

export const TASK_STATUSES = [
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
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Allowed forward transitions. Cancellation and dispute are reachable from the
 * active states and are listed explicitly. Terminal states have no successors.
 */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ["CREATED", "CANCELLED"],
  CREATED: ["PLANNING", "CANCELLED"],
  PLANNING: ["CONTRACT_REVIEW", "AWAITING_CLARIFICATION", "CANCELLED"],
  AWAITING_CLARIFICATION: ["PLANNING", "CONTRACT_REVIEW", "CANCELLED"],
  CONTRACT_REVIEW: ["APPROVED", "PLANNING", "CANCELLED"],
  APPROVED: ["PROVIDER_SEARCH", "CANCELLED"],
  PROVIDER_SEARCH: ["NEGOTIATION", "AGREEMENT_READY", "CONTRACT_REVIEW", "CANCELLED"],
  NEGOTIATION: ["AGREEMENT_READY", "PROVIDER_SEARCH", "CANCELLED"],
  AGREEMENT_READY: ["PAYMENT_AUTHORIZATION", "CANCELLED"],
  PAYMENT_AUTHORIZATION: ["WORK_IN_PROGRESS", "AGREEMENT_READY", "CANCELLED"],
  WORK_IN_PROGRESS: ["SUBMITTED", "CANCELLED", "DISPUTED"],
  SUBMITTED: ["VERIFYING", "DISPUTED"],
  VERIFYING: ["PAYMENT_RELEASE", "REVISION_REQUIRED", "HUMAN_REVIEW", "DISPUTED"],
  REVISION_REQUIRED: ["WORK_IN_PROGRESS", "SUBMITTED", "HUMAN_REVIEW", "CANCELLED", "DISPUTED"],
  HUMAN_REVIEW: ["PAYMENT_RELEASE", "REVISION_REQUIRED", "CANCELLED", "DISPUTED"],
  PAYMENT_RELEASE: ["COMPLETED", "DISPUTED"],
  DISPUTED: ["PAYMENT_RELEASE", "REVISION_REQUIRED", "CANCELLED", "HUMAN_REVIEW"],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throwing guard used by `transitionTask`. */
export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal task transition ${from} -> ${to}`);
  }
}

export function isTerminal(status: TaskStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
