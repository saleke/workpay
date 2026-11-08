# Reviewer Model, Work Profile, and Review Flow Design

## 1. Purpose

This document defines the reviewer model for WorkPay.

The design is intentionally conservative:

- review is optional,
- review is a bounded engagement,
- reviewer claims are self-declared and attributable,
- the platform does not certify expertise,
- the buyer remains the final authority on whether to approve the work,
- payment does not release without explicit client approval.

This design follows the platform rule that evidence, human acceptance, and payment are separate concerns.

---

## 2. Core design decision

### 2.1 A work profile is enough

We should not create a separate, artificial "reviewer profile" that is a different class of identity from a normal professional profile.

Instead, every user has a single professional profile with a capability model:

- work offerings
- review abilities
- review availability
- domains of expertise
- conflict disclosures
- fee and turnaround expectations

The user may declare any combination of:

- I offer work in UX design
- I review work in UX design
- I am available for review-only work
- I am not available for review in this domain
- I review only with a specific fee arrangement

This matches the real world much better than a separate reviewer persona, because many people do both work and review. Some people are review-only. Some review occasionally. Some are subject-matter specialists without offering execution services.

### 2.2 Review is not a default status

A user does not become a reviewer merely by having a profile. A review only exists when:

- a buyer requests a review,
- a reviewer is selected,
- the task scope and criteria are agreed,
- the reviewer accepts the engagement,
- the review is bound to a contract version.

This keeps review explicit and bounded.

---

## 3. Design principles

### 3.1 Explicit human authority

The buyer's approval is the final acceptance decision for the work, unless the agreed contract explicitly says otherwise.

A reviewer opinion is evidence. It is not final approval.

### 3.2 Reviewer claims are self-supplied

Profile information is user-provided, not platform-certified. The platform may help surface it, but it does not guarantee expertise.

### 3.3 Review is scoped to exact criteria

A review must be tied to:

- task id
- contract version
- contract hash
- specific requirement keys
- exact evidence bundle
- review deadline
- buyer/provider/reviewer agreement

The review cannot be generic or vague.

### 3.4 No payment without explicit approval

A reviewer report does not trigger payment.
A buyer refusal to approve does not waive payment logic.
A platform summary does not accept work.

---

## 4. Recommended profile model

### 4.1 Single user profile

The user profile contains the following sections:

#### Identity
- display name
- public summary
- avatar
- location / timezone
- languages
- public links

#### Professional capabilities
- work categories
- review categories
- domains
- specialties
- tools / stack / methods

#### Availability
- available for work
- available for review
- available for review-only work
- turnaround time
- typical project size
- preferred task types

#### Fee model
- review fee model: hourly / fixed / direct-only / negotiated
- standard review rate
- fee currency
- minimum review amount
- preferred fee payer

#### Conflict and disclaimers
- disallowed review domains
- conflicts (former clients / competitors / collaborators)
- review restrictions
- statement that expertise is self-declared and not platform-verified

#### Evidence and portfolio
- examples of previous work
- sample review notes
- case studies
- public artifacts or references

### 4.2 Capability flags

A user may have these flags:

- `offers_work: boolean`
- `offers_review: boolean`
- `accepts_review_only: boolean`
- `is_available_for_review: boolean`
- `profile_self_disclosure_confirmed: boolean`
- `conflict_disclosure_confirmed: boolean`

These are not mutually exclusive. A person can be both a worker and a reviewer.

---

## 5. Reviewer domains and review types

A profile should support multiple review domains instead of one generic tag.

### Example domains
- UX review
- accessibility review
- conversion flow review
- frontend implementation review
- quality assurance
- legal/compliance review
- brand review
- content review
- product workflow review

### Review type options
- `WORK_REVIEW`
- `QUALITY_REVIEW`
- `VALIDATION_REVIEW`
- `UX_REVIEW`
- `COMPLIANCE_REVIEW`
- `SCOPE_MATCH_REVIEW`

A task can request one or more of these.

---

## 6. Review engagement model

Review should be represented as a separate engagement record, not just a profile capability.

### 6.1 Fields

Each review engagement stores:

- reviewEngagementId
- taskId
- buyerUserId
- providerUserId
- reviewerUserId
- contractVersion
- contractHash
- requirementKeys[]
- domains[]
- reviewType
- feeMinor
- feeCurrency
- feePayer
- status
- proposalCreatedAt
- buyerAcceptedAt
- providerAcceptedAt
- reviewerAcceptedAt
- startedAt
- deadlineAt
- reportId
- finalVerdict
- finalRationale
- conflictFlags

### 6.2 Statuses

Recommended statuses:

- `PROPOSED`
- `NEGOTIATING`
- `AGREED`
- `IN_REVIEW`
- `REPORT_SUBMITTED`
- `DECLINED`
- `CLOSED`

This keeps engagement-specific lifecycle separate from task state.

---

## 7. Review lifecycle

### 7.1 Buyer requests a review

The buyer opens the review flow from the task room.

The request includes:

- task summary
- required criteria
- contract version
- evidence links or bundle
- review domains
- review deadline
- fee and payer preferences

### 7.2 Reviewer discovery

The system suggests profiles using:

- domains
- relevant requirement keys
- availability
- turnaround
- rates
- conflict rules
- prior review history

The search should exclude:

- buyer
- provider
- direct conflict situations
- expired or ineligible profiles

### 7.3 Review terms are agreed

Before the reviewer begins, the task parties agree on:

- exact review scope
- requirement keys to judge
- fee arrangement
- payment responsibility
- review deadline
- what evidence is in scope

This is a real agreement, not a casual chat.

### 7.4 Reviewer accepts or declines

The reviewer must explicitly accept the engagement or decline.

A reviewer cannot silently be assigned.

### 7.5 Reviewer submits report

The reviewer delivers a structured report with:

- overall verdict
- summary
- findings by requirement
- relevant evidence
- comments on missing evidence
- scope limits

The platform stores the report as attributable evidence, not as proof of acceptance.

---

## 8. Review report design

A review report should be structured to avoid vague “looks good” judgments.

### Suggested structure

#### Overall verdict
- `PASS`
- `FAIL`
- `UNCERTAIN`
- `DECLINE`

#### Summary
A short one-paragraph statement of the outcome.

#### Findings by requirement
For each requirement:

- requirement key
- status: pass / fail / uncertain
- rationale
- evidence references
- notes on missing or contradictory evidence

#### Evidence references
Allow:

- preview links
- file attachments
- screenshots
- QA notes
- issue lists
- user flow recordings

#### Scope disclaimer
The reviewer should explicitly state:

- what was reviewed
- what was not reviewed
- whether the review was limited by missing evidence
- that the review does not authorize payment or replace client approval

This keeps the report honest and useful.

---

## 9. Buyer and provider interactions

### 9.1 Buyer side

The buyer needs:

- search and selection tools
- matching by domain and task requirement
- reviewer profile summary
- rate and turnaround info
- conflict disclosure
- direct acceptance or decline of reviewer terms
- review package and evidence bundle checks

### 9.2 Provider side

The provider needs:

- visibility into the review logic
- ability to respond to review requests
- ability to suggest a reviewer or not
- awareness of review criteria and contract version
- ability to challenge the reviewer or scope if there is a conflict

### 9.3 Shared principle

Neither the buyer nor the provider is forced to accept an external reviewer. Review is optional and can be declined.

---

## 10. Review as a job, not a fake authority

This is a real-world-safe model:

- A person may review work professionally even if they do not offer the underlying execution service.
- A person may be a specialist, consultant, or subject-matter reviewer.
- Review can be a job category, not a separate identity category.
- Review is treated as a service contract with explicit terms, not a platform certification.

The system should allow this without pretending the platform guarantees reviewer quality.

---

## 11. Profile setup UX

### 11.1 Setup flow

The user sees a page called “Professional profile & review availability”.

This page contains:

1. Work profile basics
2. Work offers
3. Review availability
4. Expertise domains
5. Review fee settings
6. Conflict disclosures
7. Assurance text

### 11.2 Example toggles

- “I offer work in this domain”
- “I review work in this domain”
- “I accept review-only assignments”
- “I am available for review this week”
- “I usually charge X for review work”
- “I do not review tasks involving current clients or direct competitors”

### 11.3 Good product copy

- “Review availability is optional and separate from project delivery.”
- “Review work is self-declared expertise, not a WorkPay certification.”
- “A review report is evidence, not a final approval.”
- “The client remains the final decision-maker for acceptance.”

This is the exact language the product should use. It avoids creating a fake trust layer.

---

## 12. Contact, acceptance, and payment model

### 12.1 Contact flow

A buyer does not simply "contact a reviewer" free-form. They use a review request flow:

- select reviewer
- propose review scope
- propose fee and fee payer
- bind to contract version
- send proposal
- reviewer accepts or declines

This ensures the review is not arbitrary or informal.

### 12.2 Acceptance flow

The reviewer must accept:

- the task scope
- all selected requirement keys
- the evidence provided
- the fee and payer arrangement
- the review deadline

When accepted, the review engagement becomes active.

### 12.3 Payment flow

The review fee is separate from task payment.

Options:

- buyer pays reviewer directly
- provider pays reviewer directly
- shared split
- direct arrangement outside platform

The platform may record the fee arrangement but it should not collect or guarantee payment unless a separate payment feature is explicitly approved.

### 12.4 Payment gate for task completion

The main task payment remains blocked until the buyer explicitly approves the work.

A reviewer report does not release funds automatically.

The task flow is:

- evidence submitted
- review executed
- buyer approves or rejects
- payment policy runs
- funds release only if approved and otherwise compliant

---

## 13. What happens if the client refuses to approve?

This is a critical operational rule.

If the client does not approve the delivery:

- payment remains blocked,
- the task is not treated as accepted,
- the review may be recorded as evidence,
- revision can be requested,
- an independent reviewer may be engaged if both parties agree,
- a dispute may be opened,
- the buyer's reason is recorded,
- the provider is not silently paid just because work was submitted.

### Required product messaging

Use messaging like:

- “The buyer has not approved this delivery.”
- “Review evidence does not equal acceptance.”
- “Payment remains on hold until explicit approval.”
- “This task is still open for revision or external review.”

This keeps the behavior safe, understandable, and consistent with real-world work.

---

## 14. Product-critical safeguards

The platform must enforce the following:

- no review without the exact contract version
- no fee or reviewer agreement without explicit parties' consent
- no review report treated as final acceptance
- no automatic release of payment after external review
- no task acceptance without a human decision
- no fake “verified reviewer” badge
- no automatic assumption that a user is an expert just because they set a profile flag

---

## 15. Implementation summary

### Data model summary

Core entities:

- `user_profiles`
- `user_profile_capabilities`
- `review_domains`
- `review_engagements`
- `review_reports`
- `reviewer_conflicts`
- `review_requests`

### Key policy rules

- review is optional
- review is version-bound
- review is scope-bound
- reviewer claims are self-reported
- buyer approval is required for task acceptance
- payment is gated by explicit approval

---

## 16. Final recommendation

The best design is:

- one profile per user with work + review capabilities,
- review as a separate agreed engagement,
- structured review reports,
- clear disclosure that review is not platform certification,
- external reviewer optional and separate from payment,
- explicit client approval required before any task payment release.

This model matches real user behavior, supports serious work, and avoids the dangerous mistake of pretending the platform can certify quality or authorize payment on its own.
