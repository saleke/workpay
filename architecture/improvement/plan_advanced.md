# WorkPay V2 — Final System Model & Architecture Reconciliation

## 1. Architectural Decision

The existing WorkPay architecture is fundamentally sound.

The improvements identified during the deeper review do **not** require rebuilding the system around dozens of new services.

Instead, WorkPay V2 makes a small number of conceptual changes:

### Promote to first-class domain concepts

- Desired Outcome
- Verification Plan
- Evidence
- Acceptance
- Economic Authority
- Verified Outcome / Completion Package

### Strengthen existing concepts

- Contract
- Provider Selection
- Agent Actions
- Verification
- Payment Decision
- Cases
- Recovery
- Reputation

### Keep as infrastructure boundaries

- Persistence
- API
- Frontend
- Integrations
- Events
- Operations

### Architectural style remains

> **Modular monolith + PostgreSQL + background worker + object storage + PayPal + AI providers.**

There is no reason to introduce microservices for the MVP.

---

# 2. The Final Conceptual Model

The original system was approximately:

```text
Task
 ↓
Work Specification
 ↓
Contract
 ↓
Provider
 ↓
Execution
 ↓
Submission
 ↓
Verification
 ↓
Payment
```

The V2 model becomes:

```text
Intent
 ↓
Task
 ↓
Desired Outcome
 ↓
Work Contract
 ↓
Verification Plan
 ↓
Feasibility
 ↓
Provider Selection
 ↓
Commercial Agreement
 ↓
Economic Commitment
 ↓
Execution
 ↓
Evidence
 ↓
Verification
 ↓
Acceptance
 ↓
Settlement
 ↓
Completion Package
 ↓
Verified Outcome
```

The important addition is that **the system now knows what success means before it spends money**.

---

# 3. Component Reconciliation

## Component 1 — Task Intake

### Decision

**KEEP**

No major architectural change.

Task remains the immutable record of what the user originally requested.

### Responsibility

> Capture user intent without interpreting it.

Stores:

- task ID
- user ID
- original request
- budget
- currency
- deadline
- input references
- status
- timestamps

The original request should remain immutable.

### Important rule

Task ≠ Contract.

The task records what the user said.

The contract records what the system and provider eventually agree to accomplish.

---

# 4. Component 2 — AI Task Planner / Intent Compiler

### Decision

**KEEP + STRENGTHEN**

Its output should no longer be thought of simply as a Work Specification.

It produces:

```text
Work Specification
+
Desired Outcome
+
Clarification Requirements
+
Verification Candidates
```

### New responsibility

The planner should explicitly ask:

> What observable state should exist when this work is complete?

Example:

```text
Task

"Clean my customer database."
```

Planner:

```text
Desired Outcome

5,000 records
IDs preserved
duplicate rate <1%
required fields populated
schema preserved
```

The planner still cannot invent requirements.

Each requirement retains provenance:

```text
USER_EXPLICIT
USER_CLARIFIED
DETERMINISTICALLY_DERIVED
AI_PROPOSED
```

AI-proposed requirements require user confirmation when economically material.

---

# 5. New First-Class Concept — Desired Outcome

This should become a proper domain object.

```text
DesiredOutcome
----------------
id
task_id
version
description
success_conditions
constraints
created_at
created_by
status
hash
```

An outcome represents:

> The observable state that must exist for the task to be considered successful.

This is one of the most important V2 changes.

---

# 6. Component 3 — Contract Compiler

### Decision

**KEEP + STRENGTHEN**

The Contract Compiler now compiles:

```text
Task
+
Work Specification
+
Desired Outcome
+
Verification Plan
+
Authority
+
Payment Terms
```

into:

```text
Work Contract
```

The contract becomes the central economic boundary.

---

# 7. New First-Class Concept — Verification Plan

The system should know how it intends to verify the work **before the provider is committed**.

```text
VerificationPlan
----------------
id
contract_version_id
requirements
verification_methods
required_evidence
escalation_policy
verification_level
version
hash
```

Example:

```text
Requirement:
Duplicate rate <1%

Verification:
Deterministic database analysis

Evidence:
Submitted CSV

Failure:
FAIL

Uncertainty:
Escalate to semantic verification
```

This is critical because it prevents:

> "We'll figure out whether the work is good after it arrives."

Instead:

> **We know how success will be evaluated before execution begins.**

---

# 8. Component 4 — Provider Discovery & Selection

### Decision

**KEEP + MODIFY**

Provider selection should no longer optimize primarily around:

> price + capability.

It should optimize around expected outcome.

Conceptually:

```text
Expected Cost
=
Price
+
Expected Revision Cost
+
Expected Delay Cost
+
Failure Risk
```

The selection engine considers:

- capability match
- verified historical outcomes
- first-pass success
- price
- expected completion time
- availability
- reliability
- category-specific reputation
- risk

The selected provider and the reasons for selection are persisted.

---

# 9. Provider Reputation

### Decision

**ADD AS A DOMAIN CAPABILITY, NOT A NEW COMPONENT**

Reputation should be derived from verified outcomes.

Example:

```text
Provider

Data Cleaning

Contracts completed: 42
First-pass success: 38
Revision rate: 9.5%
On-time: 94%
Verified settlement: $8,420
```

Reputation should be capability-specific.

Avoid:

```text
⭐ 4.8
```

as the primary trust mechanism.

The system has better information than a star rating.

---

# 10. Component 5 — Commercial Negotiation & Commitment

### Decision

**KEEP + STRENGTHEN**

This component remains responsible for:

> Turning an eligible provider into an accepted economic agreement.

But it must operate inside the contract envelope.

The agent cannot silently modify:

- budget
- material scope
- deadline
- acceptance conditions
- payment conditions

Material changes create a new contract version.

---

# 11. Economic Authority Becomes First-Class

Authority should be explicitly represented rather than being scattered across agent configuration.

Conceptually:

```text
EconomicAuthority
-----------------
task_id
max_spend
currency
max_price
negotiation_allowed
max_negotiation_rounds
deadline_extension_limit
scope_change_allowed
approval_threshold
recovery_authority
```

This gives us two different concepts:

```text
Contract Budget
```

and:

```text
Agent Authority
```

The contract might allow $150.

The agent may only be authorized to commit $130 without approval.

That distinction is valuable.

---

# 12. Component 6 — Payment Authorization & PayPal

### Decision

**KEEP**

The payment architecture remains correct.

The key principle stays:

```text
AI
 ↓
Proposal
 ↓
Policy
 ↓
Payment Service
 ↓
PayPal
```

Never:

```text
AI
 ↓
PayPal
```

Payment state remains internally authoritative and reconciled against PayPal.

Money remains:

```text
amount_minor
currency
```

Never floating-point.

---

# 13. Component 7 — Work Execution & Submission

### Decision

**KEEP + MODIFY**

Execution should explicitly reference:

```text
contract version
agreement
provider
outcome
verification plan
```

A submission should be immutable/versioned.

Example:

```text
Submission v1
Submission v2
Submission v3
```

Each submission has its own evidence.

This matters when revisions occur.

---

# 14. Evidence Becomes First-Class

Evidence should not simply be metadata attached to a submission.

It should be an explicit domain concept.

```text
Evidence
--------
id
submission_id
artifact_id
type
source
checksum
generated_at
contract_version
verification_run
provenance
```

Examples:

- output file
- screenshot
- API response
- test result
- database statistics
- execution log
- generated report

Evidence answers:

> What observable information supports the claim that this work was completed?

---

# 15. Component 8 — Verification & Acceptance

### Decision

**KEEP BUT SPLIT CONCEPTUALLY**

This is one of the most important V2 changes.

There are two different questions:

### Verification

> What does the evidence show?

### Acceptance

> Does what the evidence shows satisfy the contract?

Therefore:

```text
Evidence
 ↓
Verification
 ↓
Acceptance
```

not:

```text
Evidence
 ↓
"AI says PASS"
```

---

# 16. Verification Engine

Verification produces facts.

Example:

```text
Requirement:
Duplicate rate <1%

Observed:
0.4%

Method:
Deterministic database analysis

Result:
PASS
```

For semantic requirements:

```text
Requirement:
Product descriptions contain no unsupported claims

Method:
Semantic verifier

Result:
UNCERTAIN
Confidence:
0.71
```

Verification itself does not release money.

---

# 17. Acceptance Engine

Acceptance evaluates all verification results against the contract.

Example:

```text
Requirement 1 → PASS
Requirement 2 → PASS
Requirement 3 → PASS
Requirement 4 → PASS
```

Therefore:

```text
Acceptance = PASS
```

If:

```text
Mandatory requirement → FAIL
```

then:

```text
Acceptance = FAIL
```

If:

```text
Mandatory requirement → UNCERTAIN
```

then:

```text
Acceptance = UNCERTAIN
```

This keeps economic decisions deterministic.

---

# 18. Verification Ladder

The verification engine should support:

```text
Level 1
Deterministic
     ↓
Level 2
Semantic AI
     ↓
Level 3
Independent verifier
     ↓
Level 4
Human review
```

The MVP only needs:

```text
Deterministic
+
Semantic AI
+
Human escalation
```

But the domain model should not prevent later independent verification.

---

# 19. Component 9 — Payment Decision & Settlement Policy

### Decision

**KEEP + STRENGTHEN**

This becomes the final economic gate.

The rule remains:

```text
Authorized
AND
Valid agreement
AND
Matching contract version
AND
Acceptance = PASS
AND
No blocking case
AND
Amount/currency match
AND
Authorization valid
AND
Policy allows capture
```

Then:

```text
CAPTURE
```

Otherwise:

```text
DO NOT CAPTURE
```

The payment decision should store:

- policy version
- contract hash
- agreement hash
- verification run
- acceptance result
- reason code
- decision timestamp

---

# 20. Component 10 — Cases / Human Escalation

### Decision

**KEEP + STRENGTHEN**

Cases should become the formal mechanism for anything the autonomous path cannot safely resolve.

Examples:

```text
VERIFICATION_UNCERTAIN
WORK_DISPUTE
CONTRACT_DISPUTE
SCOPE_CHANGE
DEADLINE_FAILURE
PAYMENT_EXCEPTION
PROVIDER_FAILURE
TECHNICAL_FAILURE
```

Human intervention should not be a magical override.

A human is simply another bounded actor.

Every human resolution produces:

```text
decision
reason
actor
timestamp
evidence
policy
```

---

# 21. Component 11 — Agent Orchestrator

### Decision

**KEEP + STRENGTHEN**

The agent remains the conductor.

The fundamental rule remains:

> **The agent decides what should happen next. Deterministic systems decide whether it is allowed.**

The loop becomes:

```text
Observe
 ↓
Build Context
 ↓
Reason
 ↓
Propose Action
 ↓
Validate Authority
 ↓
Validate Current State
 ↓
Execute
 ↓
Record
 ↓
Observe Again
```

---

# 22. Agent Actions Become Typed

The agent should never have generic:

```text
execute()
```

tools.

Instead:

```text
REQUEST_CLARIFICATION
PROPOSE_OUTCOME
PROPOSE_CONTRACT
SEARCH_PROVIDERS
REQUEST_OFFER
SELECT_PROVIDER
ACCEPT_OFFER
START_EXECUTION
REQUEST_VERIFICATION
REQUEST_REVISION
OPEN_CASE
REQUEST_PAYMENT_AUTHORIZATION
REQUEST_CAPTURE
```

Each action has its own authorization rules.

This significantly reduces agent privilege escalation risk.

---

# 23. Agent Action Provenance

Every meaningful agent action should be reconstructable.

Example:

```text
Agent Action #42

Action:
SELECT_PROVIDER

Proposal:
Provider A

Reason:
Highest expected successful completion value

Authority:
Task authority #17

Budget:
≤ $150

Result:
Provider A selected at $135
```

This is **not chain-of-thought**.

It is structured action provenance.

---

# 24. Agent Context Must Never Become Truth

The agent can remember:

> "I think Provider A already submitted."

But the system checks PostgreSQL.

Authoritative hierarchy:

```text
Domain State
    ↓
Events / Evidence
    ↓
Agent Context
```

Never the reverse.

---

# 25. Add State Freshness Checks

Before economically significant actions:

```text
Agent proposal
 ↓
Refresh authoritative state
 ↓
Check contract version
 ↓
Check agreement
 ↓
Check authority
 ↓
Check policy
 ↓
Execute
```

This prevents stale agent context from causing incorrect actions.

---

# 26. Component 12 — Events

### Decision

**KEEP**

No major redesign.

Transactional outbox remains the correct MVP pattern.

Events communicate facts:

```text
TASK_CREATED
CONTRACT_APPROVED
PROVIDER_SELECTED
AGREEMENT_ACCEPTED
PAYMENT_AUTHORIZED
SUBMISSION_CREATED
VERIFICATION_COMPLETED
ACCEPTANCE_REACHED
PAYMENT_CAPTURED
CASE_OPENED
```

Events are not authority.

---

# 27. Component 13 — Identity & Authority

### Decision

**KEEP**

The authority hierarchy becomes even more important:

```text
User Identity
 ↓
Resource Authorization
 ↓
Task Authority
 ↓
Contract Authority
 ↓
Domain Policy
 ↓
External Action
```

No lower layer can expand the authority granted by a higher layer.

---

# 28. Component 14 — Persistence

### Decision

**KEEP**

The PostgreSQL decision remains correct.

One authoritative transactional database.

The important domain entities now become:

```text
users
tasks
work_specifications
desired_outcomes
verification_plans

contracts
contract_versions
contract_requirements
acceptance_rules
authority_policies

providers
provider_capabilities
provider_reputation
provider_selections

negotiations
offers
commercial_agreements

payments
payment_decisions

executions
submissions
artifacts
evidence

verification_runs
verification_results
acceptance_decisions

cases
case_evidence
case_resolutions

agent_runs
agent_actions

events
outbox_events
processed_events
approvals
authorization_audits
```

---

# 29. Component 15 — API

### Decision

**KEEP**

The API remains a product boundary rather than a database mirror.

Core resource groups become:

```text
/tasks
/outcomes
/contracts
/providers
/agreements
/payments
/executions
/submissions
/evidence
/verifications
/cases
/agent-runs
```

Not every database table needs to become a public API resource.

The API exposes product concepts.

---

# 30. Component 16 — Frontend

### Decision

**KEEP + SIMPLIFY**

The frontend should hide almost all architectural complexity.

The core user experience remains:

```text
What do you need done?
        ↓
Here's what I understood.
        ↓
Here's what success means.
        ↓
Here's what I'm allowed to spend.
        ↓
Here's who can do it.
        ↓
Work is happening.
        ↓
Here's the proof.
        ↓
Payment released.
```

The user should never need to understand:

- event buses,
- agent runs,
- database transactions,
- verification pipelines,
- PayPal adapters,
- reconciliation workers.

---

# 31. The Task Room Becomes the Primary UX

Rather than making the product feel like a marketplace dashboard, the central object is the **Task Room**.

It contains:

```text
Objective
Outcome
Contract
Provider
Money
Execution
Evidence
Verification
Activity
```

At every moment the user should be able to answer:

### What is happening?

### What happens next?

### What happens to my money?

That should remain the UX test.

---

# 32. Component 17 — Integrations

### Decision

**KEEP**

External systems remain adapters.

Core integrations:

```text
PayPal
AI Provider
Object Storage
Authentication
Notifications
```

Each has:

- timeout
- retry policy
- idempotency
- reconciliation
- external operation state
- error handling

No external service becomes authoritative over WorkPay's domain model.

---

# 33. Component 18 — Operations

### Decision

**KEEP**

No major conceptual change.

Operations must protect:

- availability,
- data,
- secrets,
- financial actions,
- agent execution,
- recovery.

The most important operational principle remains:

> **Preserve state first. Recover second.**

---

# 34. New Concept — Feasibility Gate

This does not need to become Component 19.

It belongs inside planning/provider selection.

Before economic commitment:

```text
Outcome
 ↓
Verification Plan
 ↓
Feasibility
```

Checks:

- Can the outcome be verified?
- Is the budget plausible?
- Is the deadline plausible?
- Are suitable providers available?
- Are required inputs valid?
- Does the agent have sufficient authority?

If not:

```text
NO SAFE EXECUTION PATH
```

The agent should ask the user to change something rather than forcing execution.

---

# 35. New Concept — Recovery

Recovery should also **not** become another architecture component.

It is a capability of:

```text
Agent
+
Cases
+
Provider Selection
+
Contract
+
Payment
```

Example:

```text
Provider fails
 ↓
Agent detects failure
 ↓
Check contract
 ↓
Check remaining authority
 ↓
Find replacement
 ↓
Continue existing contract
```

If replacement requires more money or a material deadline change:

```text
Contract Amendment
```

not silent agent improvisation.

---

# 36. New Concept — Completion Package

This is a first-class product artifact rather than a new architectural service.

```text
Completion Package
------------------

Contract
Agreement
Provider
Deliverable
Evidence
Verification
Acceptance
Settlement
```

It should be reconstructable from the underlying domain records.

This could eventually become one of WorkPay's signature product artifacts.

---

# 37. Final Domain Relationship

The most important relationship graph is now:

```text
USER
 │
 ▼
TASK
 │
 ├──────────────► DESIRED OUTCOME
 │                       │
 │                       ▼
 │                 VERIFICATION PLAN
 │                       │
 └───────────────────────┘
                         │
                         ▼
                  WORK CONTRACT
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        AUTHORITY POLICY       ACCEPTANCE RULES
              │                     │
              └──────────┬──────────┘
                         ▼
                PROVIDER SELECTION
                         │
                         ▼
              COMMERCIAL AGREEMENT
                         │
                         ▼
                    PAYMENT
                         │
                         ▼
                   EXECUTION
                         │
                         ▼
                   SUBMISSION
                         │
                         ▼
                    EVIDENCE
                         │
                         ▼
                  VERIFICATION
                         │
                         ▼
                   ACCEPTANCE
                         │
                         ▼
               PAYMENT DECISION
                         │
                         ▼
                      PAYPAL
                         │
                         ▼
               COMPLETION PACKAGE
```

This is the final core model.

---

# 38. The Three Independent Truths

WorkPay should explicitly distinguish three kinds of truth.

## Domain Truth

What WorkPay says happened.

Example:

```text
Payment status = AUTHORIZED
```

## External Truth

What an external system says happened.

Example:

```text
PayPal authorization = ACTIVE
```

## Evidence Truth

What submitted evidence demonstrates.

Example:

```text
CSV contains 5,000 records
```

These must not be conflated.

The system reconciles them.

---

# 39. Final Invariants

These become the non-negotiable rules of the system.

### Money

```text
amount_minor >= 0
```

### Authority

```text
agent_authority <= user_authority
```

### Contract

```text
material_change → new contract version
```

### Verification

```text
acceptance != PASS
→ automatic settlement forbidden
```

### Payment

```text
AI proposal != payment authorization
```

### Evidence

```text
artifact + checksum + provenance
```

### State

```text
domain state + outbox event
→ same transaction
```

### External uncertainty

```text
UNKNOWN
→ RECONCILE
```

### Agent context

```text
agent context != authoritative state
```

### Authentication

```text
authenticated != authorized
```

### Human intervention

```text
human decision
→ authenticated + authorized + recorded
```

These invariants matter more than almost any individual feature.

---

# 40. Final MVP Scope

The MVP should intentionally implement only one complete vertical.

## Example

### Task

```text
Clean a customer CSV.
```

### Outcome

```text
5,000 records
IDs preserved
duplicate rate <1%
schema valid
required fields present
```

### Provider

Seeded provider.

### Contract

Fixed budget and deadline.

### Payment

PayPal authorization/capture.

### Execution

Provider submits CSV.

### Verification

Deterministic checks + semantic checks.

### Failure

Intentionally submit an invalid CSV.

### System response

```text
Verification failed.
Payment remains protected.
Provider revision requested.
```

### Second submission

Passes.

### Settlement

Payment captured.

### Completion Package

Generated.

This one vertical demonstrates nearly the entire thesis.

---

# 41. Implementation Order

The implementation order should now change slightly.

## Phase 1 — Core Domain

Build:

```text
Task
DesiredOutcome
WorkSpecification
Contract
ContractVersion
AuthorityPolicy
```

## Phase 2 — Verification Foundation

Build:

```text
VerificationPlan
Evidence
VerificationRun
VerificationResult
AcceptanceDecision
```

This should happen surprisingly early.

Verification is not an afterthought.

It defines what the product is actually buying.

## Phase 3 — Provider Execution

Build:

```text
Provider
Capability
ProviderSelection
Agreement
Execution
Submission
```

## Phase 4 — Payment

Build:

```text
Payment
PaymentDecision
PayPalAdapter
Reconciliation
```

## Phase 5 — Agent

Build:

```text
AgentRun
AgentAction
AgentAuthority
Workflow
```

## Phase 6 — Recovery / Cases

Build:

```text
Case
Resolution
ProviderFailure
Revision
Escalation
```

## Phase 7 — Product UX

Build:

```text
Task Room
Outcome Review
Contract Review
Provider Recommendation
Execution View
Verification View
Completion Package
```

---

# 42. The Final Architecture in One Sentence

> **WorkPay is a modular economic execution system in which an AI agent turns human intent into a measurable work contract, operates within bounded authority to procure execution, collects evidence of the resulting work, verifies that evidence against the contract, and allows PayPal settlement only when the contracted outcome has been accepted.**

---

# 43. The Product Primitive

The fundamental primitive is no longer:

> Task.

It is:

# **Verified Economic Outcome**

Everything else supports it.

```text
Intent
 ↓
Outcome
 ↓
Contract
 ↓
Execution
 ↓
Evidence
 ↓
Verification
 ↓
Settlement
 ↓
Verified Outcome
```

And the fundamental economic loop is:

# **Commit → Execute → Prove → Settle**

That should now be treated as the stable foundation of WorkPay.

---

# 44. What We Should Stop Changing

At this point, the architecture has enough conceptual maturity that we should stop adding major abstractions unless implementation exposes a genuine problem.

We should **not** add:

- another architecture component,
- a microservice architecture,
- a complex marketplace system,
- a generic escrow abstraction,
- elaborate project management,
- complex multi-agent orchestration,
- advanced reputation algorithms,
- dozens of payment states,
- unnecessary event infrastructure.

Those are future extensions.

The MVP should prove one thing exceptionally well:

> **An AI can safely cause real-world work to happen and PayPal money can move because the system has verified that the agreed outcome was actually achieved.**

That is the system worth building.