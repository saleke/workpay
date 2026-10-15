# WorkPay — Final System Architecture

## 1. System Definition

WorkPay is a web application in which an AI agent can safely procure work on behalf of a user.

The system transforms a natural-language request into a bounded economic workflow:

```text id="1v9q8c"
Human Intent
     ↓
Work Specification
     ↓
Work Contract
     ↓
Provider Discovery
     ↓
Negotiation
     ↓
Payment Authorization
     ↓
Work Execution
     ↓
Verification
     ↓
Payment Decision
     ↓
PayPal Settlement
```

The defining property is not that AI can make payments.

It is:

> **AI can cause economic activity while remaining bounded by an explicit contract, deterministic policy, and verifiable work.**

The architecture therefore separates three concerns:

```text id="7f4n2b"
AI
→ intelligence and proposals

Policy / Domain
→ authority and decisions

PayPal
→ settlement
```

---

# 2. Architectural Style

The MVP is a **modular monolith**.

There is one primary backend application, one authoritative PostgreSQL database, a background worker, and external integrations.

```text id="3c9x6m"
                    ┌───────────────────┐
                    │    Web Browser    │
                    └─────────┬─────────┘
                              │ HTTPS
                              ▼
                    ┌───────────────────┐
                    │   Web Frontend    │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Application API  │
                    └─────────┬─────────┘
                              │
                 ┌────────────┼────────────┐
                 │            │            │
                 ▼            ▼            ▼
             Domain       Persistence   Integrations
             Modules      PostgreSQL    PayPal / AI /
                                         Storage
                 │
                 ▼
             Job / Agent
               Worker
```

This deliberately avoids:

- microservices
- separate databases per component
- Kafka
- distributed transactions
- unnecessary service meshes
- independently deployed domain modules

The modular boundaries exist **inside the application**.

They can become separate services later only if scale or organizational requirements justify it.

---

# 3. Major Runtime Pieces

The actual MVP consists of five primary runtime boundaries.

### 1. Web Frontend

Responsible for:

- user interaction
- task creation
- contract review
- provider visibility
- payment visibility
- verification visibility
- activity
- provider workflow

### 2. Application Backend

Responsible for:

- authentication integration
- authorization
- domain workflows
- agent orchestration
- business rules
- API
- persistence coordination
- payment policy
- verification
- dispute handling

### 3. Background Worker

Responsible for:

- agent continuation
- long-running workflows
- verification jobs
- external retries
- payment reconciliation
- outbox processing
- notifications

### 4. PostgreSQL

Authoritative state for:

- tasks
- contracts
- providers
- negotiations
- agreements
- payments
- executions
- submissions
- verification
- cases
- agent runs
- events
- jobs
- audit records

### 5. Object Storage

Binary data:

- task files
- provider submissions
- evidence
- generated artifacts

---

# 4. Backend Module Structure

The backend should be organized by domain responsibility.

A practical structure:

```text id="6x2q8j"
backend/
│
├── api/
│   ├── routes/
│   ├── middleware/
│   └── schemas/
│
├── identity/
│
├── tasks/
│
├── planning/
│
├── contracts/
│
├── providers/
│
├── negotiation/
│
├── payments/
│
├── execution/
│
├── verification/
│
├── cases/
│
├── agent/
│
├── events/
│
├── persistence/
│
├── integrations/
│   ├── paypal/
│   ├── ai/
│   ├── storage/
│   └── notifications/
│
└── operations/
```

These are **modules**, not necessarily separate processes.

Each module should expose controlled application/domain interfaces rather than allowing arbitrary cross-module database access.

---

# 5. Core Domain Graph

The central relationship is:

```text id="4w5j1n"
User
 │
 └── Task
      │
      ├── Work Specification
      │
      ├── Work Contract
      │      │
      │      └── Contract Version
      │
      ├── Provider Selection
      │      │
      │      └── Provider
      │
      ├── Negotiation
      │      │
      │      └── Commercial Agreement
      │
      ├── Payment
      │
      ├── Work Execution
      │      │
      │      └── Submission
      │              │
      │              └── Artifacts
      │
      ├── Verification
      │
      ├── Case
      │
      ├── Agent Runs
      │
      └── Events
```

The **Task** is the primary workflow root.

Everything economically relevant should be traceable back to it.

---

# 6. Authoritative Data Model

PostgreSQL is the source of truth.

Broad table groups:

```text id="7m5x0v"
Identity
├── users
├── sessions
└── roles

Tasks
├── tasks
├── task_files
├── work_specifications
├── requirements
└── clarifications

Contracts
├── work_contracts
├── contract_requirements
├── scope_items
├── acceptance_rules
└── approvals

Providers
├── providers
├── capabilities
├── availability
├── reputation
└── provider_selections

Commercial
├── negotiations
├── offers
└── commercial_agreements

Payments
├── payments
├── payment_decisions
├── payment_policy_checks
└── payment_commands

Execution
├── work_executions
├── provider_acceptances
├── work_submissions
└── submission_artifacts

Verification
├── verification_runs
├── verification_results
└── acceptance_decisions

Cases
├── cases
├── case_messages
├── case_evidence
└── resolutions

Agent
├── agent_runs
└── agent_actions

Infrastructure State
├── events
├── outbox_events
├── processed_events
├── jobs
└── audit_records
```

The exact schema can evolve during implementation, but these ownership boundaries should remain stable.

---

# 7. Money Model

All monetary values use:

```text id="2h7m4p"
amount_minor
currency
```

Example:

```text id="9z1k4s"
amount_minor = 13500
currency = USD
```

Never:

```text id="q7p3x9"
amount = 135.00
```

using floating-point database values.

The system must maintain:

```text id="7n4v8w"
amount_minor >= 0
```

and:

```text id="3q8m1x"
agreement.amount <= contract.max_budget
```

Currency must be explicit.

---

# 8. Contract as the Economic Boundary

The Work Contract is the most important object between AI reasoning and economic action.

It defines:

```text id="4b8x0c"
Objective
Scope
Requirements
Constraints
Inputs
Deadline
Budget
Acceptance Criteria
Payment Conditions
Authority
Amendment Rules
Escalation Rules
Version
Hash
```

Once approved, the contract version becomes immutable.

A material change creates:

```text id="3k8n5p"
Contract v1
    ↓
Amendment
    ↓
Contract v2
```

Economic operations always reference the appropriate contract version.

---

# 9. Authority Model

Authority is hierarchical.

```text id="0j4w9s"
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

The agent does not inherit unrestricted user authority.

For example:

```text id="m8q2x6"
User:
Maximum task spend = $150

Agent:
Can negotiate up to $150

Provider:
Offers $165

Agent:
Cannot accept
```

Authority is enforced by backend policy.

The browser cannot increase it.

The agent cannot increase it.

The provider cannot increase it.

---

# 10. Agent Architecture

The agent is a workflow coordinator.

Its loop is:

```text id="6w2x8n"
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
Execute
   ↓
Record Result
   ↓
Observe Again
```

The agent has access to controlled tools.

Examples:

```text id="1r9q5v"
create_work_specification
request_clarification
find_providers
request_offer
negotiate
create_verification_job
request_human_review
```

Payment tools are indirect.

The agent may propose:

```text id="5f8m2k"
CAPTURE payment_123
```

but the payment policy engine determines whether that action is allowed.

---

# 11. Payment Architecture

Payment is split into three layers.

```text id="9k3m7d"
Layer 1
Payment Decision / Policy
        ↓
"May this payment be captured?"

Layer 2
Payment Service
        ↓
"Execute the authorized action."

Layer 3
PayPal Adapter
        ↓
"Translate it into PayPal operations."
```

This prevents:

```text id="3p8x1w"
LLM → PayPal
```

and enforces:

```text id="7z2m4q"
LLM
 ↓
Policy
 ↓
Payment Service
 ↓
PayPal
```

---

# 12. Verification Architecture

Verification follows:

```text id="4v8q2m"
Submission
   ↓
Integrity Check
   ↓
Contract Compatibility
   ↓
Deterministic Checks
   ↓
Semantic AI Checks
   ↓
Acceptance Policy
   ↓
PASS / FAIL / UNCERTAIN
```

The acceptance rule is:

```text id="8k2w5r"
All mandatory requirements PASS
        ↓
PASS

Any mandatory requirement FAIL
        ↓
FAIL

Any mandatory requirement UNCERTAIN
        ↓
UNCERTAIN
```

Only `PASS` can make automatic payment capture eligible.

---

# 13. Payment Release Rule

The core economic invariant is:

```text id="5q8v3m"
Capture Allowed IF:

payment is authorized
AND
agreement is valid
AND
contract version matches
AND
verification = PASS
AND
no blocking case exists
AND
amount/currency match
AND
authorization remains valid
AND
policy allows capture
```

Otherwise:

```text id="1w7k3c"
DO NOT CAPTURE
```

This rule is deterministic.

---

# 14. Event Architecture

Domain changes produce events.

Example:

```text id="8p4m6v"
ContractApproved
ProviderSelected
AgreementAccepted
PaymentAuthorized
SubmissionCreated
VerificationFailed
RevisionRequested
VerificationPassed
PaymentCaptured
```

Events are stored using a transactional outbox.

```text id="7f9k3d"
Database Transaction
       │
       ├── Domain State
       │
       └── Outbox Event
```

Both commit atomically.

A worker later publishes/processes the event.

This prevents:

```text id="2x6m8q"
State changed
but
event disappeared
```

---

# 15. API Architecture

The frontend communicates with:

```text id="9m3k5v"
/api/v1/...
```

The API lifecycle is:

```text id="4x7q2n"
Request
 ↓
Request ID
 ↓
Authentication
 ↓
Authorization
 ↓
Schema Validation
 ↓
Application Service
 ↓
Domain Logic
 ↓
Persistence / External Operation
 ↓
Response
```

The API is not a database mirror.

Endpoints represent product operations.

Examples:

```text id="3w8k5q"
POST /api/v1/tasks
GET  /api/v1/tasks/{taskId}

POST /api/v1/contracts/{id}/approve

POST /api/v1/negotiations/{id}/respond

POST /api/v1/submissions

GET  /api/v1/tasks/{id}/activity

GET  /api/v1/tasks/{id}/payment

POST /api/v1/cases/{id}/resolve
```

Exact endpoint naming may change during implementation.

---

# 16. Frontend Architecture

The primary UI is a web application.

Buyer navigation:

```text id="7q3m9x"
New Task
My Tasks
Activity
Payments
Settings
```

Provider navigation:

```text id="2v8k5m"
Available Work
My Work
Payments
Profile
```

The central screen is the Task Workspace.

It shows:

```text id="5m7x2q"
Objective
Contract
Provider
Payment
Verification
Activity
Current State
```

The UI explains system decisions without exposing hidden chain-of-thought.

---

# 17. Realtime Workflow

Long-running workflows use asynchronous processing and realtime updates.

```text id="6x9q4m"
User Action
   ↓
API
   ↓
Database
   ↓
Job / Event
   ↓
Worker
   ↓
External / Domain Operation
   ↓
Event
   ↓
SSE
   ↓
Browser
```

The browser receives:

```text id="1q5m8v"
Provider selected
Payment authorized
Submission received
Verification started
Verification failed
Verification passed
Payment captured
```

The frontend treats realtime messages as updates to synchronize with backend state, not as a new source of truth.

---

# 18. External Integration Architecture

External systems are behind adapters.

```text id="8m4x2q"
Domain
  │
  ├── PaymentGateway
  │       └── PayPalAdapter
  │
  ├── AIProvider
  │       └── AIAdapter
  │
  └── ObjectStorage
          └── StorageAdapter
```

This isolates vendor-specific APIs from the core domain.

External identifiers remain separate from WorkPay identifiers.

---

# 19. PayPal Lifecycle

The complete payment lifecycle is:

```text id="9v2k6m"
Commercial Agreement
       ↓
Payment Created
       ↓
Policy Validation
       ↓
PayPal Authorization
       ↓
AUTHORIZED
       ↓
Provider Works
       ↓
Submission
       ↓
Verification
       ↓
PASS
       ↓
Payment Policy
       ↓
Capture Command
       ↓
PayPal Capture
       ↓
CAPTURED
```

If verification fails:

```text id="5k8x3q"
Submission
   ↓
FAIL
   ↓
No Capture
   ↓
Revision
```

If verification is uncertain:

```text id="4m7q2v"
Submission
   ↓
UNCERTAIN
   ↓
No Capture
   ↓
Human Review
```

---

# 20. Failure Architecture

The system must assume failures happen.

Examples:

```text id="8q3m6v"
LLM timeout
PayPal timeout
Storage failure
Worker crash
Database connection failure
Browser disconnect
Webhook duplication
Duplicate job
Duplicate capture request
Provider failure
Verification failure
Human disagreement
```

The general principle is:

> **Preserve state first; resume or reconcile second.**

Never solve failure by guessing.

---

# 21. External Operation Recovery

For operations with uncertain external outcomes:

```text id="5x9m2q"
REQUESTED
   ↓
UNKNOWN
   ↓
RECONCILING
   ↓
CONFIRMED SUCCESS
```

or:

```text id="7k3v8m"
REQUESTED
   ↓
RECONCILING
   ↓
CONFIRMED FAILURE
```

This is particularly important for payment operations.

A network error is not equivalent to:

> “PayPal definitely did nothing.”

---

# 22. Human Escalation

Human review is part of the normal architecture.

Triggers include:

- verification uncertainty
- contract dispute
- provider dispute
- payment exception
- suspicious behavior
- technical failure
- scope change

A case contains:

```text id="3q7m9x"
Reason
Contract
Agreement
Submission
Verification
Payment
Evidence
Messages
Resolution
```

The reviewer does not bypass the architecture.

They make a domain decision that is subsequently processed through the normal policy and state-transition mechanisms.

---

# 23. Security Model

The security model can be summarized as:

```text id="6m8q2v"
Identity
   ↓
Authorization
   ↓
Authority
   ↓
Policy
   ↓
Action
```

No single layer is sufficient.

The system protects against:

- unauthorized resource access
- agent privilege escalation
- payment abuse
- prompt injection
- provider impersonation
- duplicate payment
- webhook forgery
- malicious files
- external API failures

---

# 24. Persistence Model

PostgreSQL is authoritative.

Rules:

```text id="9x4m7q"
Domain state → PostgreSQL
Binary content → Object Storage
Events → PostgreSQL / Outbox
External state → mapped into internal state
Browser state → non-authoritative
LLM context → non-authoritative
```

Economically significant records are immutable or versioned where appropriate.

Deletion of financial history is prohibited.

---

# 25. Transaction Model

Transactions should be short.

Correct:

```text id="4q8m2x"
BEGIN
  update domain state
  create outbox event
COMMIT

call external API
```

Incorrect:

```text id="7m3v9k"
BEGIN

call LLM
wait
call PayPal
wait
wait for provider
wait for human

COMMIT
```

External operations happen outside long database transactions.

The system represents intermediate states explicitly.

---

# 26. File Model

Files are split between database metadata and object storage.

```text id="8q5m3v"
PostgreSQL
├── artifact ID
├── owner
├── task
├── submission
├── object key
├── checksum
├── MIME type
└── size

Object Storage
└── binary file
```

Signed URLs are used for upload/download.

Artifacts are immutable once attached to an economically significant submission.

---

# 27. Observability

Every significant workflow should be traceable through:

```text id="2x7m4q"
Correlation ID
     ↓
Task
     ↓
Agent Run
     ↓
Contract
     ↓
Agreement
     ↓
Payment
     ↓
Submission
     ↓
Verification
     ↓
Settlement
```

Operational logs explain infrastructure behavior.

Domain events explain business history.

Audit records explain sensitive actions.

These are related but not interchangeable.

---

# 28. Deployment Topology

The production MVP can be deployed as:

```text id="6q8m2x"
                    Internet
                       │
                  CDN / HTTPS
                       │
              ┌────────▼────────┐
              │ Web Application │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     PostgreSQL      Worker    Object Storage
          │
     Outbox / Jobs
          
          │
          ├──────────────→ PayPal
          ├──────────────→ AI Provider
          └──────────────→ Notifications
```

Managed infrastructure is preferred for the MVP.

The team should spend engineering effort on WorkPay's differentiated workflow rather than operating commodity infrastructure.

---

# 29. Complete End-to-End Workflow

The complete successful flow is:

```text id="5m9q2x"
USER
 │
 │ "Clean 5,000 customer records."
 ▼
TASK
 │
 ▼
AI PLANNER
 │
 │ Work Specification
 ▼
CONTRACT COMPILER
 │
 │ Contract v1
 ▼
USER APPROVAL
 │
 ▼
PROVIDER DISCOVERY
 │
 │ Candidate Providers
 ▼
NEGOTIATION
 │
 │ Agreement: $135
 ▼
PAYMENT AUTHORIZATION
 │
 │ PayPal Authorized
 ▼
WORK EXECUTION
 │
 │ Submission v1
 ▼
VERIFICATION
 │
 ├── FAIL ──────→ REVISION
 │                  │
 │                  └────→ VERIFICATION
 │
 └── PASS
       │
       ▼
PAYMENT POLICY
 │
 │ ALLOW CAPTURE
 ▼
PAYPAL
 │
 │ Captured
 ▼
COMPLETED
```

---

# 30. Complete Failure Flow

A representative failure:

```text id="8q4m7x"
USER
 ↓
TASK
 ↓
CONTRACT
 ↓
PROVIDER
 ↓
PAYMENT AUTHORIZED
 ↓
SUBMISSION
 ↓
VERIFICATION
 ↓
FAIL
 ↓
REVISION REQUEST
 ↓
SUBMISSION v2
 ↓
VERIFICATION
 ↓
PASS
 ↓
PAYMENT CAPTURE
```

The important observation is:

> **Failure does not break the workflow. It becomes part of the workflow state.**

---

# 31. Uncertain Verification Flow

```text id="7m3x9q"
SUBMISSION
   ↓
VERIFICATION
   ↓
UNCERTAIN
   ↓
PAYMENT BLOCKED
   ↓
CASE CREATED
   ↓
HUMAN REVIEW
   │
   ├── ACCEPT
   │      ↓
   │   Payment Policy
   │
   └── REVISION
          ↓
       Provider
          ↓
       Submission
```

This allows automation to stop safely without requiring the entire system to become manual.

---

# 32. The Most Important Control Flow

The central security/economic flow is:

```text id="4x8m2q"
                 AI
                  │
                  ▼
             PROPOSAL
                  │
                  ▼
              POLICY
                  │
          ┌───────┴───────┐
          │               │
        DENY             ALLOW
          │               │
          ▼               ▼
        STOP           EXECUTE
                          │
                          ▼
                       PayPal
```

This should remain true regardless of which AI model or payment integration is used.

---

# 33. The Three Critical Truths

WorkPay has three distinct kinds of truth.

### Domain Truth

Stored in PostgreSQL.

> What happened inside WorkPay?

### External Truth

Returned/reconciled from external providers.

> What happened at PayPal?

### Evidence Truth

Represented by submissions, artifacts, verification results, and audit records.

> What evidence supports the decision?

The system combines these without confusing them.

---

# 34. Core Invariants

These are the architectural rules that should survive implementation changes.

### Money

```text id="7q2m8x"
amount_minor >= 0
```

### Authority

```text id="4m9x3q"
agent authority <= user-authorized authority
```

### Payment

```text id="8x5q2m"
verification != PASS
→ automatic capture forbidden
```

### Contract

```text id="3m7q9x"
material scope change
→ new contract version
```

### Identity

```text id="6q4m8v"
authenticated user != automatic resource authorization
```

### Files

```text id="9m2x5q"
database metadata + checksum
→ authoritative artifact identity
```

### External operations

```text id="7x3q8m"
uncertain external result
→ reconcile
```

### AI

```text id="4q9m2x"
AI proposal != authorization
```

### Events

```text id="8m5x7q"
state change + outbox event
→ same transaction
```

---

# 35. What We Are Actually Building

Despite the large architecture, the MVP is intentionally small.

The first implementation can focus on one complete workflow:

> **A buyer asks WorkPay to clean a dataset.**

The system then:

1. creates the task
2. compiles requirements
3. creates the contract
4. shows the contract
5. gets user approval
6. selects a seeded provider
7. negotiates a price
8. authorizes a PayPal payment
9. provider submits a file
10. deterministic verification checks the file
11. first submission fails
12. provider submits a corrected version
13. verification passes
14. payment policy allows capture
15. PayPal captures the payment
16. task becomes completed

Everything else exists to make this loop safe and extensible.

---

# 36. Recommended MVP Scope

The MVP should therefore deliberately exclude or simplify:

- open public marketplace
- complex provider onboarding
- multi-currency settlement
- recurring work
- complex milestone trees
- multiple payment providers
- sophisticated reputation algorithms
- large-scale analytics
- microservices
- distributed event streaming
- autonomous unrestricted spending
- arbitrary task types with no deterministic verification

The demo needs one excellent proof, not twenty unfinished features.

---

# 37. Suggested First Implementation Order

Architecture should now translate into implementation in vertical slices.

### Slice 1 — Core Task

Build:

```text
Task
Work Specification
Contract
Database
API
Frontend
```

Get:

> User → Task → Contract

working end-to-end.

### Slice 2 — Provider

Add:

```text
Provider
Selection
Negotiation
Agreement
Provider UI
```

Get:

> Contract → Provider → Agreement

working.

### Slice 3 — Payment

Add:

```text
Payment
Policy
PayPal Adapter
Authorization
```

Get:

> Agreement → PayPal Authorization

working.

### Slice 4 — Execution

Add:

```text
Execution
Submission
Object Storage
Provider UI
```

Get:

> Authorized Work → Submission

working.

### Slice 5 — Verification

Add:

```text
Verification
Acceptance
Failure
Revision
```

Get:

> Submission → Verification → Revision/Pass

working.

### Slice 6 — Settlement

Add:

```text
Payment Decision
Capture
Reconciliation
```

Get:

> PASS → Policy → PayPal Capture

working.

### Slice 7 — Agent

Finally connect the AI agent across the workflow.

This allows the deterministic system to exist before giving the agent control over orchestration.

---

# 38. Why This Implementation Order Matters

Do not start by building the autonomous agent.

That creates the wrong dependency:

```text id="3q8m5x"
AI first
 ↓
Everything else becomes tools for the AI
```

Instead:

```text id="7m2x9q"
Domain first
 ↓
Policy
 ↓
External integrations
 ↓
UI
 ↓
Agent
```

Then the agent becomes a coordinator over a system that already has explicit safety boundaries.

That is substantially easier to test and demonstrate.

---

# 39. Final Architecture

The complete architecture can therefore be reduced to:

```text id="8x4q7m"
                         WORKPAY
                            │
              ┌─────────────┴─────────────┐
              │                           │
           FRONTEND                    PROVIDER UI
              │                           │
              └─────────────┬─────────────┘
                            │
                         API
                            │
             ┌──────────────┴──────────────┐
             │                             │
          DOMAIN                         AGENT
             │                             │
   ┌─────────┼──────────┐                  │
   │         │          │                  │
 Tasks    Contracts   Providers      Agent Actions
   │         │          │                  │
   └─────────┼──────────┘                  │
             │                             │
       Negotiation                         │
             │                             │
          Payments ◄──────────── Policy ◄──┘
             │
        Verification
             │
          Execution
             │
           Cases
             │
             ▼
        PostgreSQL
             │
       Transactional
          Outbox
             │
          Worker
             │
       ┌─────┼──────┐
       ▼     ▼      ▼
    PayPal   AI   Storage
```

The architecture has one central idea:

> **The agent proposes and coordinates. The domain enforces. The evidence proves. The policy authorizes. PayPal settles.**

---

# 40. Final System Boundary

WorkPay begins when a user expresses an intention to purchase work.

It ends when:

- the work is accepted,
- payment is settled,

or:

- the workflow is safely stopped, disputed, cancelled, or escalated.

Everything inside that boundary is WorkPay's responsibility.

External systems provide capabilities, but WorkPay retains authority over its own state and decisions.

The final system guarantee is:

> **WorkPay can allow an AI agent to participate in real economic transactions without giving the AI unrestricted control of money. Every meaningful economic action is bounded by an explicit contract, enforced by deterministic policy, backed by evidence, persisted durably, and settled through PayPal only when its conditions are satisfied.**

---

# 41. Architecture Documentation Is Now Complete

The 18 components should now be treated as **supporting architecture documents**, while this document becomes the primary implementation reference.

The next phase should therefore not be more architecture documents.

It should be:

```text id="6m9x2q"
FINAL ARCHITECTURE
       ↓
Database Schema
       ↓
Repository / Project Structure
       ↓
API Contract
       ↓
Core Domain Implementation
       ↓
Vertical MVP
       ↓
PayPal Integration
       ↓
Agent Integration
       ↓
Demo
```

The architectural exploration is complete.

**Now we build the thing.**