/**
 * Human-facing labels for events (per build_prompt §46). Internal enum/state
 * remain precise; UI labels are human.
 */
export const EVENT_LABELS: Record<string, { title: string; description: string }> = {
  TASK_CREATED: {
    title: "Task created",
    description: "Task Owner submitted a new task.",
  },
  TASK_STATUS_CHANGED: {
    title: "Status updated",
    description: "The task status progressed.",
  },
  PROVIDER_SELECTED: {
    title: "Specialist matched",
    description: "WorkPay matched an eligible specialist for this task.",
  },
  COMMERCIAL_AGREEMENT_CREATED: {
    title: "Agreement reached",
    description: "Terms agreed between Task Owner and Specialist.",
  },
  PAYMENT_AUTHORIZED: {
    title: "Payment hold secured",
    description: "Payment authorization hold secured on PayPal (held until proof verified).",
  },
  SUBMISSION_SUBMITTED: {
    title: "Deliverables submitted",
    description: "The specialist submitted deliverables for verification.",
  },
  REVISION_REQUESTED: {
    title: "Revision requested",
    description: "Revisions requested on submitted deliverables.",
  },
  VERIFICATION_STARTED: {
    title: "Verifying deliverables",
    description: "Automated verification running against Definition of Done.",
  },
  VERIFICATION_FAILED: {
    title: "Verification failed",
    description: "Deliverables did not pass all checks; payment hold remains secured.",
  },
  VERIFICATION_PASSED: {
    title: "Verification passed",
    description: "All required acceptance criteria confirmed.",
  },
  VERIFICATION_UNCERTAIN: {
    title: "Human review required",
    description: "Verification flagged an ambiguity; routed to arbitration.",
  },
  PAYMENT_CAPTURED: {
    title: "Payment released",
    description: "Funds captured from PayPal authorization hold and disbursed to specialist.",
  },
  CASE_OPENED: {
    title: "Arbitration opened",
    description: "An arbitration case was opened for review.",
  },
  CASE_RESOLVED: {
    title: "Arbitration ruling issued",
    description: "The arbitration case was resolved by an arbitrator.",
  },
};

export function getEventLabel(type: string) {
  return EVENT_LABELS[type] ?? { title: type, description: "" };
}
