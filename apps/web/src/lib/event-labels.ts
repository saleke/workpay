/**
 * Human-facing labels for events (per build_prompt §46). Internal enum/state
 * remain precise; UI labels are human.
 */
export const EVENT_LABELS: Record<string, { title: string; description: string }> = {
  TASK_CREATED: {
    title: "Task created",
    description: "The buyer submitted a new task.",
  },
  TASK_STATUS_CHANGED: {
    title: "Status updated",
    description: "The task's status changed.",
  },
  PROVIDER_SELECTED: {
    title: "Provider selected",
    description: "WorkPay selected an eligible provider for this task.",
  },
  COMMERCIAL_AGREEMENT_CREATED: {
    title: "Agreement reached",
    description: "A commercial agreement was created.",
  },
  PAYMENT_AUTHORIZED: {
    title: "Payment authorized",
    description: "Payment has been authorized through PayPal — not yet released.",
  },
  SUBMISSION_SUBMITTED: {
    title: "Submission received",
    description: "The provider submitted deliverables.",
  },
  REVISION_REQUESTED: {
    title: "Revision requested",
    description: "The buyer requested a revision.",
  },
  VERIFICATION_STARTED: {
    title: "Checking the result",
    description: "Verification is running against the contract.",
  },
  VERIFICATION_FAILED: {
    title: "Verification failed",
    description: "Verification found issues — payment remains protected.",
  },
  VERIFICATION_PASSED: {
    title: "Verification passed",
    description: "All required checks passed.",
  },
  VERIFICATION_UNCERTAIN: {
    title: "Needs human review",
    description: "Verification is uncertain and is blocking capture.",
  },
  PAYMENT_CAPTURED: {
    title: "Payment released",
    description: "Funds were captured and released.",
  },
  CASE_OPENED: {
    title: "Case opened",
    description: "A human review case was opened.",
  },
  CASE_RESOLVED: {
    title: "Case resolved",
    description: "The case was resolved by a reviewer.",
  },
};

export function getEventLabel(type: string) {
  return EVENT_LABELS[type] ?? { title: type, description: "" };
}
