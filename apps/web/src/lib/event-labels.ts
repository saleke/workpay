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
  WORK_COMMITMENT_PROPOSED: {
    title: "Work proposed",
    description: "The client sent exact scope, compensation, and delivery terms.",
  },
  WORK_COMMITMENT_PROVIDER_RESPONDED: {
    title: "Professional responded",
    description: "The professional recorded a decision on the exact work proposal.",
  },
  WORK_COMMITMENT_CONFIRMED: {
    title: "Mutual commitment confirmed",
    description: "The client confirmed the professional after both sides accepted the same terms.",
  },
  WORK_COMMITMENT_CLOSED: {
    title: "Work proposal closed",
    description: "The proposal closed without creating a mutual work commitment.",
  },
  WORK_REVIEW_OPENED: {
    title: "Review requested",
    description: "The client requested a review package for a checkpoint or final review.",
  },
  WORK_REVIEW_PACKAGE_SENT: {
    title: "Review package ready",
    description: "The professional sent review notes and supporting context.",
  },
  WORK_REVIEW_REFERRED: {
    title: "Sent to paid reviewer",
    description: "The review package was assigned to the agreed reviewer.",
  },
  WORK_REVIEW_REVIEWER_COMPLETED: {
    title: "Paid review returned",
    description: "The agreed reviewer returned assessments and notes to the client.",
  },
  WORK_REVIEW_DECIDED: {
    title: "Review decision recorded",
    description: "A checkpoint, revision, or final review decision was recorded.",
  },
  REVIEW_FEE_AUTHORIZATION_REQUESTED: {
    title: "Review fee approval requested",
    description: "An agreed payer must approve the review fee before the engagement begins.",
  },
  REVIEW_FEE_PAID: {
    title: "Review fee paid",
    description: "A review fee obligation was paid to the reviewer.",
  },
  COMMERCIAL_AGREEMENT_CREATED: {
    title: "Agreement reached",
    description: "Terms agreed between Task Owner and Specialist.",
  },
  PAYMENT_AUTHORIZED: {
    title: "Payment authorization recorded",
    description: "The buyer authorization state was recorded for this task.",
  },
  SUBMISSION_SUBMITTED: {
    title: "Deliverables submitted",
    description: "The specialist submitted deliverables for verification.",
  },
  REVISION_REQUESTED: {
    title: "Revision requested",
    description: "Revisions requested on submitted deliverables.",
  },
  BUYER_REVIEW_DECISION_RECORDED: {
    title: "Buyer review recorded",
    description: "The buyer recorded an explicit decision against the current submitted work.",
  },
  VERIFICATION_STARTED: {
    title: "Verifying deliverables",
    description: "Automated verification running against Definition of Done.",
  },
  VERIFICATION_FAILED: {
    title: "Verification failed",
    description:
      "Deliverables did not pass all checks; capture remains blocked by the approval gate.",
  },
  VERIFICATION_PASSED: {
    title: "Automated checks passed",
    description: "Automated evidence checks passed; buyer review remains required.",
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
    title: "Payment capture recorded",
    description: "Capture completed after explicit buyer approval and policy checks.",
  },
  PAYMENT_RELEASE_APPROVED: {
    title: "Payment release approved",
    description: "The client explicitly approved release of the accepted work payment.",
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
