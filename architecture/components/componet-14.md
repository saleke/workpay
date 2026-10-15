
# Component 14 — Data Persistence, Consistency & Transaction Architecture

## 1. Responsibility

The Data Persistence layer is responsible for making WorkPay's authoritative state **durable, consistent, recoverable, and historically traceable**.

Its responsibility is:

> **Ensure that important business state survives crashes, concurrent execution, AI failures, worker failures, browser disconnects, and external API uncertainty without corrupting the economic state of the system.**

This component owns:

- persistent domain state
- database transactions
- state transition persistence
- concurrency control
- idempotency
- repositories/data access
- database constraints
- historical/versioned records
- durable jobs
- transactional outbox
- persistence required for recovery
- database migrations and backups

It does **not** own business decisions.

For example:

```text
Payment Policy Engine
    → decides whether capture is allowed

Payment Service
    → executes the allowed operation

Persistence Layer
    → makes the resulting state durable
```

That separation is fundamental.

---

# 2. Core Principle

WorkPay must have one authoritative representation of its own domain state.

The following are **not** authoritative:

```text
LLM memory
Browser state
Agent context
Worker memory
Cached API response
Frontend state
Event delivery
```

The database is authoritative for WorkPay's domain.

Conceptually:

```text
                  ┌───────────────┐
                  │   Web App     │
                  └───────┬───────┘
                          │
                  ┌───────▼───────┐
                  │ Application   │
                  │   Services    │
                  └───────┬───────┘
                          │
                  ┌───────▼───────┐
                  │    Domain     │
                  │    Logic      │
                  └───────┬───────┘
                          │
                  ┌───────▼───────┐
                  │ Persistence   │
                  │    Layer      │
                  └───────┬───────┘
                          │
                  ┌───────▼───────┐
                  │  PostgreSQL   │
                  └───────────────┘
```

The agent can disappear and restart.

A worker can crash.

A browser can close.

The system must still know what happened.

---

# 3. Database Choice

For the MVP:

> **PostgreSQL is the primary authoritative database.**

There is no need for multiple databases per domain.

The system is a modular monolith:

```text
                    PostgreSQL
                         │
        ┌────────────────┼────────────────┐
        │                │                │
      Tasks           Contracts        Payments
        │                │                │
   Negotiation       Verification       Cases
        │                │                │
     Execution         Agent           Events
```

This gives us:

- ACID transactions
- foreign keys
- unique constraints
- row locking
- strong consistency
- JSON support where useful
- mature indexing
- reliable backup/recovery

Introducing multiple databases would add operational complexity without providing meaningful value for the hackathon MVP.

---

# 4. Domain State vs Infrastructure State

The database contains two broad categories of information.

### Domain state

This represents what actually happened in the WorkPay workflow:

```text
tasks
work_specifications
contracts
providers
negotiations
offers
commercial_agreements
payments
executions
submissions
verification_runs
acceptance_decisions
cases
```

### Infrastructure state

This supports reliable execution:

```text
jobs
outbox_events
processed_events
idempotency_records
```

The distinction matters.

For example:

```text
payment.status = AUTHORIZED
```

is business state.

Whereas:

```text
job.status = RUNNING
```

is execution infrastructure state.

Infrastructure must support the domain rather than become the domain.

---

# 5. Domain Ownership

The database model should preserve the relationship between objects.

The fundamental workflow is:

```text
User
  ↓
Task
  ↓
Work Specification
  ↓
Contract
  ↓
Provider Selection
  ↓
Negotiation
  ↓
Commercial Agreement
  ↓
Payment
  ↓
Execution
  ↓
Submission
  ↓
Verification
  ↓
Payment Decision
```

Every important object should have a persistent identifier and explicit relationships to the objects that produced it.

This allows WorkPay to answer:

> Why did this payment happen?

and trace the answer all the way back to the user's original task and approved contract.

---

# 6. Task as Workflow Root

A `Task` is the primary workflow identity.

Conceptually:

```typescript
type Task = {
  id: string;
  userId: string;

  description: string;

  status: TaskStatus;

  budget: Money;
  deadline: string | null;

  createdAt: string;
  updatedAt: string;
};
```

Downstream objects reference the task either directly or through their parent aggregate.

For example:

```text
task_123
 ├── contract_123
 ├── negotiation_456
 ├── agreement_789
 ├── execution_321
 ├── submission_654
 ├── payment_987
 └── case_111
```

This makes the entire economic workflow reconstructable.

---

# 7. IDs

Use opaque, globally unique identifiers.

For example:

```text
task_01J...
contract_01J...
payment_01J...
submission_01J...
```

UUIDv7 or an equivalent identifier strategy is appropriate.

IDs should be:

- unique
- difficult to enumerate
- safe to expose through APIs
- preferably sortable by creation time

However:

> Opaque IDs are not an authorization mechanism.

Authorization must still be enforced by Component 13's access-control layer.

---

# 8. Money Representation

Financial values must never use floating-point numbers.

Do not store:

```text
135.50
```

as a floating-point amount.

Use integer minor units:

```typescript
type Money = {
  amountMinor: bigint;
  currency: string;
};
```

For USD:

```text
$135.00 → 13500
$135.50 → 13550
```

The currency determines the minor-unit convention.

This prevents rounding errors from entering financial calculations.

---

# 9. Financial Invariants

The persistence model must support the following invariants:

```text
amount >= 0
currency is explicit
payment amount matches its agreement
payment currency matches its agreement
```

However, persistence does **not** decide whether an amount is economically permitted.

For example:

```text
agreed price <= contract budget
```

is a domain/business rule.

The persistence layer stores the result after that rule has been evaluated.

---

# 10. Immutable Economic State

Once an object becomes economically significant, it should generally not be rewritten.

Examples:

- approved contracts
- accepted offers
- commercial agreements
- payment decisions
- verification results
- submitted deliverables
- approvals

Instead of:

```text
UPDATE contract
SET budget = 200
```

create a new version:

```text
Contract v1
    ↓
Amendment
    ↓
Contract v2
```

The historical version remains available.

This is essential for disputes and auditability.

---

# 11. Contract Versioning

A contract should have:

```text
contract_id
version
status
contract_hash
```

For example:

```text
contract_123 / v1
contract_123 / v2
```

with:

```text
UNIQUE(contract_id, version)
```

The active contract version is the one used by downstream operations.

Verification, payment decisions, and approvals must reference the exact contract version they relied upon.

---

# 12. State Transitions

Business state should never be changed through arbitrary database updates.

Bad:

```text
UPDATE payments
SET status = 'CAPTURED'
```

from arbitrary application code.

Instead:

```text
Payment Service
      ↓
validate transition
      ↓
Persistence
```

For example:

```text
AUTHORIZED
     ↓
CAPTURE_REQUESTED
     ↓
CAPTURED
```

An invalid transition such as:

```text
FAILED
  ↓
CAPTURED
```

must be rejected unless a specifically defined recovery workflow permits it.

The persistence layer stores valid transitions; domain services determine whether transitions are valid.

---

# 13. Optimistic Concurrency

For ordinary mutable state, optimistic concurrency can prevent stale updates.

Example:

```typescript
type VersionedRecord = {
  id: string;
  version: number;
};
```

An update can require:

```sql
UPDATE tasks
SET status = $newStatus,
    version = version + 1
WHERE id = $id
AND version = $expectedVersion;
```

If zero rows are affected:

```text
concurrent modification detected
```

The caller must reload current state rather than blindly overwriting it.

---

# 14. Pessimistic Locking for Critical Financial Operations

Financial state may require stronger serialization.

For example, two workers must not simultaneously capture the same payment.

The payment operation can use:

```sql
BEGIN;

SELECT *
FROM payments
WHERE id = $paymentId
FOR UPDATE;

-- validate current state

-- create capture operation

COMMIT;
```

The lock is held only for the short internal transaction.

It must **not** remain open while waiting for PayPal.

---

# 15. Idempotency

Economically significant operations must be idempotent.

For example:

```text
capture:payment_123
```

may be requested twice because of:

- network retry
- worker retry
- browser retry
- duplicate event
- process crash

The desired behavior is:

```text
First request
    ↓
perform operation

Second request
    ↓
return existing operation/result
```

not:

```text
capture
capture again
```

A unique idempotency key should therefore be persisted for important operations.

---

# 16. Internal Transactions

Use database transactions when multiple internal records must change together.

Example: contract approval.

```text
BEGIN

validate contract
record approval
activate contract
create domain event
create outbox record

COMMIT
```

If any step fails:

```text
ROLLBACK
```

No partially approved contract should remain.

---

# 17. Do Not Hold Transactions Across External Calls

Never do:

```text
BEGIN
   ↓
call LLM
   ↓
wait
   ↓
call PayPal
   ↓
wait
   ↓
COMMIT
```

This creates long-running transactions and locks.

Instead:

```text
BEGIN
persist operation intent
COMMIT

call external system

BEGIN
persist external result
COMMIT
```

This is particularly important for PayPal.

---

# 18. External Operation State

External operations should have intermediate states.

For example:

```text
PENDING
   ↓
AUTHORIZATION_REQUESTED
   ↓
AUTHORIZED
```

and:

```text
AUTHORIZED
   ↓
CAPTURE_REQUESTED
   ↓
CAPTURED
```

`CAPTURE_REQUESTED` means:

> WorkPay requested the operation.

It does **not** mean:

> PayPal successfully completed the operation.

Only confirmed external state can move the record to `CAPTURED`.

---

# 19. Crash Recovery

Suppose WorkPay persists:

```text
payment.status = CAPTURE_REQUESTED
```

and then the worker crashes.

On recovery:

```text
Payment Reconciliation Worker
        ↓
find CAPTURE_REQUESTED
        ↓
query PayPal
```

If PayPal says:

```text
CAPTURED
```

WorkPay records:

```text
payment.status = CAPTURED
```

If PayPal says:

```text
not captured
```

the system follows the defined retry/recovery policy.

If the result is ambiguous:

```text
PAYMENT_RECONCILIATION_REQUIRED
```

and the system fails safely rather than assuming success.

---

# 20. Transactional Outbox

Domain state changes and event-publication intent should be persisted atomically.

Example:

```text
BEGIN

UPDATE verification
SET status = COMPLETED

INSERT acceptance_decision

INSERT outbox_event
    VERIFICATION_COMPLETED

COMMIT
```

Now the system cannot have:

```text
verification completed
```

without also having durable intent to publish the corresponding event.

A worker later publishes the outbox event.

---

# 21. Durable Jobs

Long-running work should not depend on an HTTP request remaining alive.

Examples:

```text
AI planning
verification
PayPal reconciliation
event publishing
agent wake-up
notifications
```

Use a durable job model:

```typescript
type Job = {
  id: string;
  type: string;
  payload: unknown;

  status:
    | "PENDING"
    | "RUNNING"
    | "COMPLETED"
    | "FAILED";

  attempts: number;
  availableAt: string;
  lockedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
};
```

The worker can recover unfinished jobs after a crash.

---

# 22. Job Idempotency

Jobs may execute more than once.

Therefore:

```text
RUN_VERIFICATION(submission_123)
```

must be safe to receive twice.

The service should detect an existing successful verification run or use a deterministic operation key.

The same principle applies to:

- payment reconciliation
- notifications
- webhook processing
- event consumers

---

# 23. Repositories

Application/domain services should not scatter raw SQL throughout the codebase.

Use repositories or domain-specific persistence modules.

Example:

```typescript
interface PaymentRepository {
  getById(id: string): Promise<Payment | null>;

  lockById(id: string): Promise<Payment>;

  create(payment: NewPayment): Promise<Payment>;

  updateStatus(
    id: string,
    expectedStatus: PaymentStatus,
    newStatus: PaymentStatus
  ): Promise<Payment>;
}
```

The repository answers:

> How do we persist and retrieve this object?

It should not answer:

> Should this payment be captured?

That belongs to the payment policy/domain layer.

---

# 24. Database Constraints

Application logic handles business rules.

The database provides a final structural safety layer.

Use:

```text
NOT NULL
FOREIGN KEY
UNIQUE
CHECK
```

where appropriate.

Examples:

```text
UNIQUE(contract_id, version)

UNIQUE(consumer_name, event_id)

UNIQUE(paypal_capture_id)
```

Constraints should prevent corruption even when application code makes a mistake.

---

# 25. Foreign Keys

Important relationships should have database-level foreign keys.

Examples:

```text
contract.task_id
    → tasks.id

agreement.contract_id
    → contracts.id

payment.agreement_id
    → agreements.id

submission.execution_id
    → executions.id

verification.submission_id
    → submissions.id
```

This prevents orphaned business records.

---

# 26. Historical Financial Records

Financial records should not be deleted simply because a workflow changes.

For example:

```text
AUTHORIZED
   ↓
VOIDED
```

or:

```text
CAPTURED
   ↓
REFUNDED
```

The history remains.

The database should represent:

```text
what happened
```

rather than attempting to make the database look as though the earlier event never occurred.

---

# 27. File Boundary

The persistence layer stores **file metadata and relationships**, but not large binary objects.

For example:

```text
task_files
----------------
id
task_id
file_id
purpose
```

and:

```text
file_records
----------------
id
storage_key
filename
mime_type
size_bytes
checksum
created_at
```

The actual bytes live in object storage.

This keeps PostgreSQL focused on structured state.

The detailed file lifecycle can remain part of the application's storage subsystem rather than becoming another giant architecture document.

---

# 28. Provenance

Every important object should be traceable to its origin.

For example:

```text
Submission
   ↓
Execution
   ↓
Commercial Agreement
   ↓
Contract
   ↓
Task
```

A submission should also reference the exact contract version against which it will be evaluated.

Similarly:

```text
Payment Decision
   ↓
Verification
   ↓
Submission
   ↓
Contract Version
```

This makes economic decisions explainable.

---

# 29. Hashes and Snapshots

Where historical integrity matters, store the relevant version/hash.

For example:

```text
verification.contract_version = 1
verification.contract_hash = abc123
```

and:

```text
payment_decision.contract_hash = abc123
payment_decision.agreement_hash = def456
```

If the contract is later amended:

```text
Contract v1 ≠ Contract v2
```

Historical verification still points to v1.

---

# 30. Database Schema

The initial database can contain the following logical groups:

```text
Identity
├── users
├── sessions
└── roles

Workflow
├── tasks
├── work_specifications
├── clarifications
└── contracts

Commerce
├── providers
├── negotiations
├── offers
├── commercial_agreements
└── payments

Execution
├── executions
├── submissions
└── artifacts

Verification
├── verification_runs
├── verification_results
└── acceptance_decisions

Exceptions
├── cases
├── case_messages
└── case_resolutions

Agent
├── agent_runs
├── agent_actions
└── agent_decisions

Infrastructure
├── jobs
├── outbox_events
├── processed_events
└── idempotency_records
```

This is a **logical organization**, not a requirement to create dozens of tables immediately.

The MVP should implement only tables actually required by the workflow.

---

# 31. Read Models

The frontend should not need to understand the entire normalized domain model.

For example:

```text
GET /api/tasks/:id/dashboard
```

can return:

```typescript
type TaskDashboard = {
  taskId: string;
  status: string;

  objective: string;

  budget: Money;

  provider: {
    name: string;
    price: Money;
  } | null;

  payment: {
    status: string;
    amount: Money;
  } | null;

  verification: {
    status: string;
    passed: number;
    failed: number;
  } | null;

  recentActivity: ActivityEntry[];
};
```

The backend assembles this from the domain tables.

The frontend should not perform its own domain joins.

---

# 32. Indexing

Indexes should follow actual application access patterns.

Important examples:

```text
tasks(user_id, created_at)

contracts(task_id, version)

offers(negotiation_id, version)

payments(task_id)

payments(status)

submissions(execution_id, version)

verification_runs(submission_id)

cases(task_id, status)

events(task_id, occurred_at)

outbox_events(published_at, created_at)
```

Do not create indexes simply because a column exists.

Measure actual query patterns as the system grows.

---

# 33. Pagination

Historical collections should be paginated:

```text
tasks
events
messages
cases
submissions
audit records
```

The frontend should never request an unlimited history.

For event/timeline data, cursor-based pagination is preferable when the volume becomes significant.

---

# 34. Time

Store system timestamps in UTC:

```text
2026-10-13T12:00:00Z
```

The server/database is authoritative for system timestamps.

The browser's clock must not determine:

- contractual deadlines
- payment expiry
- verification timing
- economic events

The UI converts timestamps to the user's local timezone for presentation.

---

# 35. Persistence and Component Boundaries

The persistence layer should sit underneath the rest of the application:

```text
                Web / Worker
                     │
                     ▼
              Application Layer
                     │
                     ▼
               Domain Services
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
     Repositories          Policy Engines
          │
          ▼
      PostgreSQL
          │
          ├── Outbox
          └── Jobs
```

External systems remain outside:

```text
PostgreSQL
    │
    ├── PayPal Adapter
    ├── AI Adapter
    └── Object Storage Adapter
```

The persistence layer does not directly own those integrations.

---

# 36. Recovery Model

If the entire application restarts, WorkPay should be able to reconstruct its operational state from:

```text
PostgreSQL domain state
+
durable jobs
+
outbox events
+
external reconciliation
```

It should not need:

```text
the previous LLM conversation
the previous browser session
the previous worker process
the previous in-memory agent state
```

That is the real purpose of this component.

---

# 37. MVP Implementation

Keep the implementation deliberately small:

```text
PostgreSQL
        │
        ├── Domain tables
        ├── Jobs
        ├── Outbox
        └── Idempotency
```

Application:

```text
Modular monolith
```

Workers:

```text
Same backend codebase
running as worker processes
```

Storage:

```text
S3-compatible object storage
```

Do **not** introduce:

```text
Kafka
Cassandra
MongoDB
distributed transactions
full event sourcing
microservices
```

unless actual requirements later justify them.

---

# 38. What This Component Must Never Do

Persistence must never:

- decide whether work passes
- decide whether payment should be released
- choose a provider
- negotiate
- interpret natural language
- call an LLM directly
- directly authorize PayPal
- bypass authorization
- silently modify historical state
- expose raw database access to the browser

Its job is to make the system's decisions **durable and recoverable**.

---

# 39. Final Guarantee

The persistence architecture guarantees:

> **Every economically meaningful state transition is durable, recoverable, concurrency-safe, and traceable to the state that caused it.**

The fundamental chain is:

```text
Domain Decision
      ↓
Database Transaction
      ↓
Durable State
      ↓
Outbox / Job
      ↓
Async or External Operation
      ↓
Reconciled Result
      ↓
New Durable State
```

The critical principle is:

> **A transient AI response, browser action, worker execution, or external API response is never allowed to become the sole representation of WorkPay's authoritative state.**

**Component 14 boundary:**

> **Component 14 makes WorkPay's domain state durable, consistent, recoverable, and traceable. It does not decide what the system should do; it ensures that whatever the authorized domain services decide is persisted correctly and can survive failure.**