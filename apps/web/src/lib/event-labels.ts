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
    title: "Professional selected",
    description: "A professional was selected for this task.",
  },
  PROVIDER_CANDIDATES_DISCOVERED: {
    title: "Available professionals found",
    description: "Review available profiles and choose whether to contact someone.",
  },
  COMMERCIAL_AGREEMENT_CREATED: {
    title: "Agreement reached",
    description: "Terms agreed between Task Owner and Specialist.",
  },
  PAYMENT_AUTHORIZED: {
    title: "Simulated authorization recorded",
    description: "The payment-policy simulation recorded an authorization. No funds were held.",
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
    description: "Deliverables did not pass all checks; the simulated capture remains blocked.",
  },
  VERIFICATION_PASSED: {
    title: "Verification passed",
    description: "All required acceptance criteria confirmed.",
  },
  VERIFICATION_UNCERTAIN: {
    title: "Independent review needed",
    description: "Verification could not determine whether an acceptance criterion was met.",
  },
  INDEPENDENT_REVIEW_PROPOSED: {
    title: "Independent review proposed",
    description: "A participant proposed an external reviewer and a contract-bound review plan.",
  },
  INDEPENDENT_REVIEW_PARTY_ACCEPTED: {
    title: "Review terms accepted",
    description: "A task participant accepted the independent review terms.",
  },
  INDEPENDENT_REVIEW_ENGAGED: {
    title: "Reviewer accepted",
    description: "Both task participants and the independent reviewer accepted the review.",
  },
  INDEPENDENT_REVIEW_DECLINED: {
    title: "Review proposal declined",
    description: "A participant declined the proposed independent review before it began.",
  },
  INDEPENDENT_REVIEW_REPORTED: {
    title: "Independent review report submitted",
    description: "The reviewer submitted an attributable report against the agreed criteria.",
  },
  PAYMENT_CAPTURED: {
    title: "Simulated capture recorded",
    description: "Payment policy reached its simulated capture state. No funds were moved.",
  },
  CASE_OPENED: {
    title: "Platform case opened",
    description: "A platform or payment exception case was opened.",
  },
  CASE_RESOLVED: {
    title: "Platform case updated",
    description: "A platform or payment exception case was updated.",
  },
};

export function getEventLabel(type: string) {
  return EVENT_LABELS[type] ?? { title: type, description: "" };
}
