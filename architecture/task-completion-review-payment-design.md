# Task Progress, Review Packages, and Payment

## Product Decision

Tenfo does not verify professional work or issue quality verdicts. It preserves the agreement,
coordinates review, records attributable decisions, and enforces the payment gate selected by the
parties.

The active lifecycle is:

1. work is in progress,
2. the client requests a checkpoint or final review,
3. the professional prepares a review package,
4. the client reviews the package or refers it to an agreed paid reviewer,
5. the client records the checkpoint or final decision,
6. final acceptance enables the separate payment-release policy.

## Review Request

The client chooses when review is useful. A request freezes:

- the task and execution,
- the current contract version and hash,
- checkpoint or final-review intent,
- the agreement constraints in scope,
- a title and focused request for the professional.

A checkpoint covers selected constraints. A final review includes every acceptance-relevant
constraint. Opening a request moves the work to `REVIEW_REQUESTED`; it does not imply completion.

## Provider Review Package

The professional responds from Work Studio. A package contains:

- a required response summary,
- zero or more live links,
- zero or more notes,
- zero or more files.

No resource type is mandatory. A website may be represented by a staging URL and access guidance;
a consultation by notes and meeting records; a physical task by observations and photos; a data
task by files and query links.

Provider-authored package resources are hashed when the package is sent. The package is then frozen
for that review cycle. If work changes, the parties open another cycle rather than silently altering
what was reviewed.

## Review Decisions

Each selected agreement constraint can be recorded as:

- `MET`,
- `PARTIAL`,
- `NOT_MET`,
- `UNCLEAR`,
- `NOT_APPLICABLE`.

These are attributable reviewer assessments, not system results. Partial, unmet, unclear, and waived
constraints require rationale. A client may still accept with ambiguity, but must explicitly
acknowledge it and explain the decision.

Checkpoint acceptance records a completed milestone and returns the task to work in progress. Final
acceptance moves the task to `REVIEW_ACCEPTED`. A change request moves the execution to
`REVISION_REQUESTED` and preserves the review package that motivated it.

## Paid Reviewer

A paid reviewer is optional. The client and professional first agree:

- reviewer identity,
- review focus,
- contract version,
- fee and payer,
- conflict disclosure.

The client can then refer a ready review package to that engagement. The reviewer receives the same
package, can add notes, links, or files, and records assessments against the agreed constraints. The
reviewer returns findings to the client; the client records the task acceptance decision.

## Progress and Milestones

Milestones are accepted checkpoint review cycles, not inferred percentages or provider claims.
Progress updates and deadline calculations are informational. They do not mark milestones complete.

This permits real-world work to remain flexible:

- checkpoints may be added when useful,
- each checkpoint names its focus,
- different checkpoints may cover different agreement constraints,
- final review remains distinct from intermediate progress,
- ambiguity remains visible rather than converted into a false pass/fail result.

## Payment Gate

Capture requires all of the following:

- an authorized payment bound to the selected professional,
- a current agreement and contract hash,
- a final accepted review cycle,
- a final decision recorded by the task owner,
- assessments for every final-review constraint,
- no blocking case, dispute, pending contract change, or payment pause,
- no previous successful capture.

Files, provider claims, AI output, and automated observations cannot satisfy this gate.

## Retired Model

New work does not use mandatory submissions, automated verification runs, or submission-bound review
packages. Their database structures remain only while old implementation code and migrations are
removed safely; no active route, worker, or workspace invokes them.

## Unified Reviewer Service

One Work Profile independently controls project-work and paid-review availability. A professional may
offer either service or both. Review setup includes listing state, availability, domains and scope,
methods, turnaround, fee mode and amount, supporting profile evidence, known conflicts, and a
task-specific conflict confirmation.

Reviewer discovery excludes the client and performing professional, then filters by account class,
domain coverage, availability, conflicts, and PayPal seller readiness when required. Buyer,
professional, and reviewer each accept the engagement terms.

Direct review fees remain outside Tenfo. PayPal review fees are payer-approved and captured to the
reviewer's onboarded merchant before the engagement starts. Buyer, professional, and shared-payer
arrangements use explicit obligations; unknown captures are reconciled rather than retried blindly.

The reviewer receives only the referred package and can add notes, links, files, and per-constraint
assessments. Reviewer findings return to the client, who records checkpoint or final task acceptance.
Paying a reviewer does not accept the task work, and a favorable finding is not required for the
reviewer to earn the agreed fee.
