# Task Completion, Review, and Payment Design

## 1. Purpose

This document records the correct operating model for the WorkPay task lifecycle.

The platform is not a final reviewer, adjudicator, or authority on work quality. Its role is to preserve intent, collect evidence, guide review, and enforce payment policy. It must not silently convert provider submissions into accepted work or payment approval.

---

## 2. Core operating principles

### 2.1 Human decisions remain the authority

A task is accepted only when an explicit human decision is recorded.

That decision may come from:

- the client/buyer, or
- a reviewer the buyer and provider explicitly agreed to involve.

AI output, system summaries, uploaded files, or provider claims do not count as acceptance.

### 2.2 Evidence is separate from acceptance

Evidence is the proof package that supports a claim. Acceptance is the human decision based on that evidence. Payment is a separate policy gate.

This distinction is mandatory in the real world because the same submission can be:

- insufficient,
- acceptable,
- disputed,
- partially complete,
- or rejected for a scope mismatch.

### 2.3 Payment is a final policy gate

Payment is not the reward for submission. It is the last enforced step after a valid contract, valid evidence, valid human decision, and policy pass.

If any of these are missing, payment does not release.

### 2.4 Real-world ambiguity is explicit, not hidden

Tasks are not always objectively reviewable. Some require buyer judgment, some require an independent reviewer, and some require revision or dispute handling.

The system must support that ambiguity without pretending the platform has authority it does not have.

---

## 3. System boundaries

### The platform is responsible for

- preserving the original task intent and approved contract,
- storing the exact contract version and hash,
- collecting evidence and provenance,
- recording client or reviewer decisions,
- guiding the review workflow,
- blocking payment when policy or a dispute requires it,
- keeping an immutable audit trail.

### The platform is not responsible for

- declaring final work quality,
- approving a task without a human decision,
- converting AI output into acceptance,
- adjudicating disputes as a final authority,
- forcing payment after a buyer refusal or unresolved dispute.

---

## 4. Definition of evidence

Evidence means the exact proof that a deliverable or milestone satisfies the approved requirement.

Evidence must be:

- tied to a specific requirement and milestone,
- linked to the exact contract version,
- attributable to a source and timestamp,
- human-reviewable,
- immutable once recorded,
- designed to answer a specific acceptance question.

Examples:

- uploaded files,
- screenshots,
- code diffs,
- API responses,
- logs,
- test results,
- documents,
- reviewer notes tied to a requirement.

Not evidence by itself:

- a provider saying “done,”
- a generic chat message,
- an AI summary with no requirement link,
- a task status change alone,
- an unlinked screenshot,
- a vague claim with no proof package.

---

## 5. Required review flow

The review flow is intentionally separated from payment.

### 5.1 Client review

The buyer checks the work against the exact approved brief and the acceptance criteria.

The buyer can choose:

- accept,
- reject,
- request revision,
- escalate to external review,
- open a dispute.

This must be a recorded decision with reason and timestamp.

### 5.2 External review

External review is optional and must be agreed by both parties.

The platform can coordinate reviewer selection and scope, but it does not become the reviewer. The reviewer reports evidence and opinion, not final payment authority.

---

## 6. Payment gate design

Payment release only happens after all of the following are true:

- the contract version matches the active approved version,
- the work has an accepted review decision, or the agreed alternative path allows it,
- no blocking case or dispute applies,
- evidence is present and valid,
- payment policy passes,
- idempotency is preserved,
- no global pause or failure condition exists.

If any one of these fails, payment remains blocked.

This is a fail-closed design.

---

## 7. Milestone semantics

A milestone should not be shown as complete merely because a provider uploaded files or claimed it was done.

Milestone phases should be explicit:

- submitted,
- awaiting review,
- revision requested,
- accepted,
- rejected,
- disputed,
- payment held,
- payment released,
- completed.

The system should never collapse these stages into one vague “done” flag.

---

## 8. Task state model

The canonical task states are:

- DRAFT
- CREATED
- PLANNING
- AWAITING_CLARIFICATION
- CONTRACT_REVIEW
- APPROVED
- PROVIDER_SEARCH
- NEGOTIATION
- AGREEMENT_READY
- PAYMENT_AUTHORIZATION
- WORK_IN_PROGRESS
- SUBMITTED
- VERIFYING
- AWAITING_CLIENT_REVIEW
- AWAITING_EXTERNAL_REVIEW
- REVIEW_ACCEPTED
- REJECTED
- REVISION_REQUIRED
- HUMAN_REVIEW
- PAYMENT_RELEASE
- COMPLETED
- CANCELLED
- EXPIRED
- DISPUTED

The key rule is that the human review states are the gateway before payment release. The platform is allowed to support operational verification but not to claim final acceptance.

---

## 9. Edge cases the system must handle

### Buyer refuses to authorize payment after delivery

- payment is placed on hold,
- buyer rationale is recorded,
- the dispute or review path is opened,
- auto-release is forbidden.

### Provider submits work that does not match the brief

- evidence is mapped to requirements,
- the review rejects it,
- revision is requested,
- payment remains blocked.

### Partial completion

- payment must be tied to clear milestone rules,
- partial release is only valid if the contract defines it,
- otherwise the system holds funds.

### Scope change

- scope changes create a new versioned contract state,
- prior evidence remains attached to the prior contract version,
- payment binds to the active contract version.

### Review disagreement

- client and reviewer can disagree,
- both decisions are recorded,
- no silent override occurs,
- payment stays blocked until the process resolves it.

### Deadline breach

- the task uses a distinct deadline or delay state,
- review and payment remain gated by the contract.

---

## 10. Final design summary

The correct flow is:

1. define task intent,
2. agree the contract,
3. submit evidence,
4. await human review,
5. accept or reject,
6. apply payment policy,
7. release funds only after the gate passes.

This is the real-world-safe model because it separates evidence, acceptance, and payment. It does not pretend that a provider claim, AI suggestion, or system summary equals commercial completion.
